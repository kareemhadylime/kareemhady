-- =====================================================================
-- Phase M.8 — Issue posting RPC + auto-issue scanner
-- =====================================================================
-- Applied via MCP apply_migration in two steps (0050 + 0050a fix for
-- guests_count → guests column name). This file is the canonical source.

-- Atomic issue posting with FIFO batch picking (oldest expiry first,
-- then earliest movement). Advisory locks per item to serialise avg_cost
-- recompute.
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
  IF v_issue.status NOT IN ('approved', 'submitted', 'draft') THEN
    RAISE EXCEPTION 'Issue status must be approved/submitted/draft for posting (got %)', v_issue.status;
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
'Atomic issue posting: FIFO batch picking (oldest expiry first), advisory locks per item, decrements stock, writes immutable transactions tagged with reservation/task refs, recomputes weighted-avg costs.';

-- ---------------------------------------------------------------------------
-- Auto-issue scanner: reservations checking in within window with no
-- reservation_hold transactions yet. Uses guests + nights columns from
-- guesty_reservations (verified via M.0 pre-flight).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION beithady_inv_pending_auto_issues(p_window_days int DEFAULT 0)
RETURNS TABLE (
  reservation_id text,
  building_code text,
  listing_id text,
  guests_count int,
  nights int,
  check_in_date date,
  check_out_date date
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id::text,
    l.building_code,
    r.listing_id::text,
    COALESCE(r.guests, 1)::int,
    COALESCE(r.nights, 1)::int,
    r.check_in_date,
    r.check_out_date
  FROM guesty_reservations r
  JOIN guesty_listings l ON l.id = r.listing_id
  WHERE r.status = 'confirmed'
    AND r.check_in_date >= CURRENT_DATE - INTERVAL '1 day'
    AND r.check_in_date <= CURRENT_DATE + (p_window_days || ' day')::interval
    AND NOT EXISTS (
      SELECT 1 FROM beithady_inventory_transactions t
      WHERE t.ref_reservation_id = r.id AND t.type = 'reservation_hold'
    );
END $$;

COMMENT ON FUNCTION beithady_inv_pending_auto_issues IS
'Returns reservations checking in within the window with no reservation_hold transactions yet. Daily cron at Cairo 14:00 consumes this and posts auto-issues.';
