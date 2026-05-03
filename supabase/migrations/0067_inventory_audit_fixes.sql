-- 2026-05-02 Inventory module audit — RPC tightening
-- See INVENTORY_AUDIT_2026_05_02.md for the full bug ledger.
--
-- This migration covers:
--  C1: tighten posting RPCs (GRN, Issue) to accept only 'approved' (was
--      accepting 'submitted'/'draft' which allowed direct double-post via
--      service-role calls or future callers that forgot the TS gate).
--  C2: tighten count posting RPC to accept only 'approved' (was also
--      accepting 'in_progress', which let postCountAction skip
--      approveCountAction entirely and bypass the variance-pct rule).
--
-- Each function is CREATE OR REPLACE'd with a body byte-identical to the
-- original migration except for the status-check IF and its error message.
-- Originals: 0049 (GRN), 0050 (Issue), 0051 (Count).

-- =====================================================================
-- C1: GRN posting — only 'approved' may be posted (was approved/submitted/draft)
-- =====================================================================
CREATE OR REPLACE FUNCTION beithady_inv_post_grn(
  p_grn_id uuid,
  p_actor_user text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_grn record;
  v_line record;
  v_lines_count int := 0;
  v_total_value_egp numeric := 0;
  v_lock_key bigint;
  v_new_qty numeric;
  v_new_avg_cost numeric;
  v_existing_qty numeric;
  v_existing_avg_cost numeric;
BEGIN
  SELECT * INTO v_grn FROM beithady_inventory_grns WHERE id = p_grn_id FOR UPDATE;
  IF v_grn IS NULL THEN
    RAISE EXCEPTION 'GRN not found: %', p_grn_id;
  END IF;
  -- Audit fix C1 (was: NOT IN ('approved','submitted','draft')).
  IF v_grn.status <> 'approved' THEN
    RAISE EXCEPTION 'GRN status must be approved for posting (got %)', v_grn.status;
  END IF;

  -- Acquire advisory locks per distinct item to serialise avg_cost recompute
  FOR v_line IN
    SELECT DISTINCT item_id FROM beithady_inventory_grn_lines WHERE grn_id = p_grn_id
  LOOP
    v_lock_key := ('x' || substring(md5(v_line.item_id::text) for 16))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  FOR v_line IN
    SELECT * FROM beithady_inventory_grn_lines WHERE grn_id = p_grn_id ORDER BY line_no
  LOOP
    SELECT qty_on_hand, avg_cost_egp INTO v_existing_qty, v_existing_avg_cost
    FROM beithady_inventory_stock
    WHERE item_id = v_line.item_id
      AND warehouse_id = v_grn.warehouse_id
      AND batch_no = v_line.batch_no;

    v_existing_qty := COALESCE(v_existing_qty, 0);
    v_existing_avg_cost := COALESCE(v_existing_avg_cost, 0);

    v_new_qty := v_existing_qty + v_line.qty_received;
    IF v_new_qty > 0 THEN
      v_new_avg_cost := ((v_existing_qty * v_existing_avg_cost) + (v_line.qty_received * v_line.unit_cost_egp)) / v_new_qty;
    ELSE
      v_new_avg_cost := v_line.unit_cost_egp;
    END IF;

    INSERT INTO beithady_inventory_stock
      (item_id, warehouse_id, batch_no, qty_on_hand, avg_cost_egp, expiry_date, last_movement_at)
    VALUES
      (v_line.item_id, v_grn.warehouse_id, v_line.batch_no, v_new_qty, v_new_avg_cost, v_line.expiry_date, now())
    ON CONFLICT (item_id, warehouse_id, batch_no) DO UPDATE
      SET qty_on_hand = v_new_qty,
          avg_cost_egp = v_new_avg_cost,
          expiry_date = COALESCE(EXCLUDED.expiry_date, beithady_inventory_stock.expiry_date),
          last_movement_at = now();

    INSERT INTO beithady_inventory_transactions
      (type, item_id, warehouse_id, batch_no, qty_delta, unit_cost_egp,
       doc_type, doc_id, doc_line_no, created_by_user, note)
    VALUES
      ('receipt', v_line.item_id, v_grn.warehouse_id, v_line.batch_no,
       v_line.qty_received, v_line.unit_cost_egp,
       'grn', p_grn_id, v_line.line_no, p_actor_user,
       'GRN ' || v_grn.grn_no || ' line ' || v_line.line_no);

    UPDATE beithady_inventory_items SET last_cost_egp = v_line.unit_cost_egp WHERE id = v_line.item_id;
    PERFORM beithady_inv_recompute_item_avg_cost(v_line.item_id);

    v_lines_count := v_lines_count + 1;
    v_total_value_egp := v_total_value_egp + (v_line.qty_received * v_line.unit_cost_egp);
  END LOOP;

  UPDATE beithady_inventory_grns
    SET status = 'posted',
        posted_at = now(),
        sub_total_egp = v_total_value_egp
    WHERE id = p_grn_id;

  RETURN jsonb_build_object(
    'ok', true,
    'grn_id', p_grn_id,
    'lines_posted', v_lines_count,
    'sub_total_egp', v_total_value_egp,
    'posted_at', now()
  );
END $$;

COMMENT ON FUNCTION beithady_inv_post_grn IS
'Atomic GRN posting: requires status=''approved'' (audit fix 0067, C1). Acquires advisory locks per item, upserts stock balances, writes immutable transactions, recomputes weighted-average costs, marks GRN posted. Caller responsible for audit log and approval gate.';

-- =====================================================================
-- C1: Issue posting — only 'approved' may be posted (was approved/submitted/draft)
-- =====================================================================
CREATE OR REPLACE FUNCTION beithady_inv_post_issue(
  p_issue_id uuid,
  p_actor_user text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_issue record;
  v_line record;
  v_lines_count int := 0;
  v_total_value_egp numeric := 0;
  v_lock_key bigint;
  v_existing_qty numeric;
  v_existing_avg_cost numeric;
  v_picked_batch text;
  v_picked_cost numeric;
  v_remaining numeric;
  v_take numeric;
  v_batch_row record;
BEGIN
  SELECT * INTO v_issue FROM beithady_inventory_issues WHERE id = p_issue_id FOR UPDATE;
  IF v_issue IS NULL THEN
    RAISE EXCEPTION 'Issue not found: %', p_issue_id;
  END IF;
  -- Audit fix C1 (was: NOT IN ('approved','submitted','draft')).
  IF v_issue.status <> 'approved' THEN
    RAISE EXCEPTION 'Issue status must be approved for posting (got %)', v_issue.status;
  END IF;

  FOR v_line IN
    SELECT DISTINCT item_id FROM beithady_inventory_issue_lines WHERE issue_id = p_issue_id
  LOOP
    v_lock_key := ('x' || substring(md5(v_line.item_id::text) for 16))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  FOR v_line IN
    SELECT * FROM beithady_inventory_issue_lines WHERE issue_id = p_issue_id ORDER BY line_no
  LOOP
    v_remaining := v_line.qty;

    IF v_line.batch_no_picked IS NOT NULL AND v_line.batch_no_picked != '__bulk__' THEN
      SELECT qty_on_hand, avg_cost_egp INTO v_existing_qty, v_existing_avg_cost
      FROM beithady_inventory_stock
      WHERE item_id = v_line.item_id
        AND warehouse_id = v_issue.warehouse_id
        AND batch_no = v_line.batch_no_picked;
      IF v_existing_qty IS NULL OR v_existing_qty < v_remaining THEN
        RAISE EXCEPTION 'Insufficient stock for item % batch % in warehouse %: need %, have %',
          v_line.item_id, v_line.batch_no_picked, v_issue.warehouse_id, v_remaining, COALESCE(v_existing_qty, 0);
      END IF;

      UPDATE beithady_inventory_stock
        SET qty_on_hand = qty_on_hand - v_remaining, last_movement_at = now()
        WHERE item_id = v_line.item_id
          AND warehouse_id = v_issue.warehouse_id
          AND batch_no = v_line.batch_no_picked;

      INSERT INTO beithady_inventory_transactions
        (type, item_id, warehouse_id, batch_no, qty_delta, unit_cost_egp,
         doc_type, doc_id, doc_line_no, ref_reservation_id, ref_task_id,
         created_by_user, note)
      VALUES
        (CASE WHEN v_issue.type = 'transfer_out' THEN 'transfer_out'
              WHEN v_issue.type = 'per_reservation' THEN 'reservation_hold'
              ELSE 'issue' END,
         v_line.item_id, v_issue.warehouse_id, v_line.batch_no_picked,
         -v_remaining, v_existing_avg_cost,
         'issue', p_issue_id, v_line.line_no,
         v_issue.ref_reservation_id, v_issue.ref_task_id, p_actor_user,
         'Issue ' || v_issue.issue_no || ' line ' || v_line.line_no);

      v_total_value_egp := v_total_value_egp + (v_remaining * v_existing_avg_cost);
      v_picked_cost := v_existing_avg_cost;
    ELSE
      FOR v_batch_row IN
        SELECT batch_no, qty_on_hand, avg_cost_egp, expiry_date, last_movement_at
        FROM beithady_inventory_stock
        WHERE item_id = v_line.item_id
          AND warehouse_id = v_issue.warehouse_id
          AND qty_on_hand > 0
        ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC NULLS LAST, last_movement_at ASC NULLS FIRST
      LOOP
        EXIT WHEN v_remaining <= 0;
        v_take := LEAST(v_remaining, v_batch_row.qty_on_hand);
        v_picked_batch := v_batch_row.batch_no;
        v_picked_cost := v_batch_row.avg_cost_egp;

        UPDATE beithady_inventory_stock
          SET qty_on_hand = qty_on_hand - v_take, last_movement_at = now()
          WHERE item_id = v_line.item_id
            AND warehouse_id = v_issue.warehouse_id
            AND batch_no = v_picked_batch;

        INSERT INTO beithady_inventory_transactions
          (type, item_id, warehouse_id, batch_no, qty_delta, unit_cost_egp,
           doc_type, doc_id, doc_line_no, ref_reservation_id, ref_task_id,
           created_by_user, note)
        VALUES
          (CASE WHEN v_issue.type = 'transfer_out' THEN 'transfer_out'
                WHEN v_issue.type = 'per_reservation' THEN 'reservation_hold'
                ELSE 'issue' END,
           v_line.item_id, v_issue.warehouse_id, v_picked_batch,
           -v_take, v_picked_cost,
           'issue', p_issue_id, v_line.line_no,
           v_issue.ref_reservation_id, v_issue.ref_task_id, p_actor_user,
           'Issue ' || v_issue.issue_no || ' line ' || v_line.line_no || ' (FIFO ' || v_picked_batch || ')');

        v_total_value_egp := v_total_value_egp + (v_take * v_picked_cost);
        v_remaining := v_remaining - v_take;
      END LOOP;

      IF v_remaining > 0 THEN
        RAISE EXCEPTION 'Insufficient stock for item % in warehouse %: short by %',
          v_line.item_id, v_issue.warehouse_id, v_remaining;
      END IF;
    END IF;

    PERFORM beithady_inv_recompute_item_avg_cost(v_line.item_id);

    UPDATE beithady_inventory_issue_lines
      SET unit_cost_egp = COALESCE(v_picked_cost, 0)
      WHERE id = v_line.id;

    v_lines_count := v_lines_count + 1;
  END LOOP;

  UPDATE beithady_inventory_issues
    SET status = 'posted', posted_at = now(), sub_total_egp = v_total_value_egp
    WHERE id = p_issue_id;

  RETURN jsonb_build_object(
    'ok', true,
    'issue_id', p_issue_id,
    'lines_posted', v_lines_count,
    'sub_total_egp', v_total_value_egp,
    'posted_at', now()
  );
END $$;

COMMENT ON FUNCTION beithady_inv_post_issue IS
'Atomic issue posting: requires status=''approved'' (audit fix 0067, C1). FIFO batch picking (oldest expiry first), advisory locks per item, decrements stock, writes immutable transactions tagged with reservation/task refs, recomputes weighted-avg costs.';

-- =====================================================================
-- C2: Count posting — only 'approved' may be posted (was approved/in_progress)
-- =====================================================================
CREATE OR REPLACE FUNCTION beithady_inv_post_count_session(
  p_session_id uuid,
  p_actor_user text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_session record;
  v_line record;
  v_lock_key bigint;
  v_lines_adjusted int := 0;
  v_total_variance_value numeric := 0;
  v_existing_qty numeric;
  v_existing_avg_cost numeric;
  v_variance numeric;
BEGIN
  SELECT * INTO v_session FROM beithady_inventory_count_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Count session not found: %', p_session_id;
  END IF;
  -- Audit fix C2 (was: NOT IN ('approved','in_progress')). Counts must
  -- pass through submitCountForApprovalAction (which auto-approves when
  -- no warehouse_manager rule fires) before postCountAction is allowed.
  IF v_session.status <> 'approved' THEN
    RAISE EXCEPTION 'Count session must be approved for posting (got %)', v_session.status;
  END IF;

  FOR v_line IN
    SELECT DISTINCT item_id FROM beithady_inventory_count_lines WHERE session_id = p_session_id
  LOOP
    v_lock_key := ('x' || substring(md5(v_line.item_id::text) for 16))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  FOR v_line IN
    SELECT cl.id, cl.item_id, cl.batch_no, cl.expected_qty, cl.counted_qty, cl.variance_qty, cl.note
    FROM beithady_inventory_count_lines cl
    WHERE cl.session_id = p_session_id
      AND cl.counted_qty IS NOT NULL
  LOOP
    v_variance := COALESCE(v_line.variance_qty, 0);
    IF v_variance = 0 THEN
      CONTINUE;
    END IF;

    SELECT qty_on_hand, avg_cost_egp INTO v_existing_qty, v_existing_avg_cost
    FROM beithady_inventory_stock
    WHERE item_id = v_line.item_id
      AND warehouse_id = v_session.warehouse_id
      AND batch_no = v_line.batch_no;
    v_existing_avg_cost := COALESCE(v_existing_avg_cost, 0);

    INSERT INTO beithady_inventory_stock
      (item_id, warehouse_id, batch_no, qty_on_hand, avg_cost_egp, last_movement_at)
    VALUES
      (v_line.item_id, v_session.warehouse_id, v_line.batch_no, v_line.counted_qty, v_existing_avg_cost, now())
    ON CONFLICT (item_id, warehouse_id, batch_no) DO UPDATE
      SET qty_on_hand = v_line.counted_qty, last_movement_at = now();

    INSERT INTO beithady_inventory_transactions
      (type, item_id, warehouse_id, batch_no, qty_delta, unit_cost_egp,
       doc_type, doc_id, doc_line_no, created_by_user, note)
    VALUES
      ('count_adjust', v_line.item_id, v_session.warehouse_id, v_line.batch_no,
       v_variance, v_existing_avg_cost, 'count', p_session_id, NULL, p_actor_user,
       'Count session ' || v_session.session_no
       || ' · expected ' || v_line.expected_qty
       || ' counted ' || v_line.counted_qty
       || COALESCE(' · ' || v_line.note, ''));

    UPDATE beithady_inventory_count_lines
      SET variance_value_egp = v_variance * v_existing_avg_cost
      WHERE id = v_line.id;

    v_total_variance_value := v_total_variance_value + ABS(v_variance * v_existing_avg_cost);
    v_lines_adjusted := v_lines_adjusted + 1;

    PERFORM beithady_inv_recompute_item_avg_cost(v_line.item_id);
  END LOOP;

  UPDATE beithady_inventory_count_sessions
    SET status = 'posted',
        posted_at = now(),
        variance_total_egp = v_total_variance_value
    WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'lines_adjusted', v_lines_adjusted,
    'variance_total_egp', v_total_variance_value,
    'posted_at', now()
  );
END $$;

COMMENT ON FUNCTION beithady_inv_post_count_session IS
'Posts a count session: requires status=''approved'' (audit fix 0067, C2). Writes count_adjust transactions for non-zero variances, updates stock balance to counted_qty, recomputes avg_cost. Idempotency: only counts lines where counted_qty IS NOT NULL.';
