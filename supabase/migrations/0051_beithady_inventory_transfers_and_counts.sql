-- =====================================================================
-- Phase M.9 + M.10 — Transfers (atomic Out/In) + Count posting
-- =====================================================================
-- Applied via MCP apply_migration in the M.9/M.10 commit; this file is
-- the canonical source so the supabase migrations folder stays complete.

-- ---------------------------------------------------------------------------
-- M.9: Atomic warehouse-to-warehouse transfer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION beithady_inv_post_transfer(
  p_src_warehouse_id uuid,
  p_dst_warehouse_id uuid,
  p_lines jsonb,
  p_actor_user text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_transfer_id uuid := gen_random_uuid();
  v_line jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_batch_specified text;
  v_remaining numeric;
  v_take numeric;
  v_picked_batch text;
  v_picked_cost numeric;
  v_batch_row record;
  v_lock_key bigint;
  v_lines_count int := 0;
  v_total_value numeric := 0;
  v_line_no int := 0;
  v_existing_dst record;
  v_new_dst_qty numeric;
  v_new_dst_avg numeric;
BEGIN
  IF p_src_warehouse_id = p_dst_warehouse_id THEN
    RAISE EXCEPTION 'Source and destination warehouses must differ';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Transfer must have at least one line';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_item_id := (v_line->>'item_id')::uuid;
    v_lock_key := ('x' || substring(md5(v_item_id::text) for 16))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_line_no := v_line_no + 1;
    v_item_id := (v_line->>'item_id')::uuid;
    v_qty := (v_line->>'qty')::numeric;
    v_batch_specified := COALESCE(v_line->>'batch_no_picked', '__bulk__');

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Line %: qty must be > 0', v_line_no;
    END IF;

    v_remaining := v_qty;

    IF v_batch_specified != '__bulk__' THEN
      SELECT batch_no, qty_on_hand, avg_cost_egp, expiry_date
      INTO v_batch_row
      FROM beithady_inventory_stock
      WHERE item_id = v_item_id
        AND warehouse_id = p_src_warehouse_id
        AND batch_no = v_batch_specified;

      IF v_batch_row IS NULL OR v_batch_row.qty_on_hand < v_remaining THEN
        RAISE EXCEPTION 'Insufficient stock at source for item % batch %: need %, have %',
          v_item_id, v_batch_specified, v_remaining, COALESCE(v_batch_row.qty_on_hand, 0);
      END IF;

      v_picked_batch := v_batch_specified;
      v_picked_cost := v_batch_row.avg_cost_egp;
      v_take := v_remaining;

      UPDATE beithady_inventory_stock
        SET qty_on_hand = qty_on_hand - v_take, last_movement_at = now()
        WHERE item_id = v_item_id AND warehouse_id = p_src_warehouse_id AND batch_no = v_picked_batch;

      SELECT qty_on_hand, avg_cost_egp INTO v_existing_dst
      FROM beithady_inventory_stock
      WHERE item_id = v_item_id AND warehouse_id = p_dst_warehouse_id AND batch_no = v_picked_batch;

      v_new_dst_qty := COALESCE(v_existing_dst.qty_on_hand, 0) + v_take;
      IF v_new_dst_qty > 0 THEN
        v_new_dst_avg := ((COALESCE(v_existing_dst.qty_on_hand, 0) * COALESCE(v_existing_dst.avg_cost_egp, 0))
                       + (v_take * v_picked_cost)) / v_new_dst_qty;
      ELSE
        v_new_dst_avg := v_picked_cost;
      END IF;

      INSERT INTO beithady_inventory_stock
        (item_id, warehouse_id, batch_no, qty_on_hand, avg_cost_egp, expiry_date, last_movement_at)
      VALUES
        (v_item_id, p_dst_warehouse_id, v_picked_batch, v_new_dst_qty, v_new_dst_avg, v_batch_row.expiry_date, now())
      ON CONFLICT (item_id, warehouse_id, batch_no) DO UPDATE
        SET qty_on_hand = v_new_dst_qty,
            avg_cost_egp = v_new_dst_avg,
            expiry_date = COALESCE(EXCLUDED.expiry_date, beithady_inventory_stock.expiry_date),
            last_movement_at = now();

      INSERT INTO beithady_inventory_transactions
        (type, item_id, warehouse_id, batch_no, qty_delta, unit_cost_egp,
         doc_type, doc_id, doc_line_no, created_by_user, note)
      VALUES
        ('transfer_out', v_item_id, p_src_warehouse_id, v_picked_batch,
         -v_take, v_picked_cost, 'transfer', v_transfer_id, v_line_no, p_actor_user,
         'Transfer line ' || v_line_no || ' OUT'),
        ('transfer_in', v_item_id, p_dst_warehouse_id, v_picked_batch,
         v_take, v_picked_cost, 'transfer', v_transfer_id, v_line_no, p_actor_user,
         'Transfer line ' || v_line_no || ' IN');

      v_total_value := v_total_value + (v_take * v_picked_cost);
    ELSE
      FOR v_batch_row IN
        SELECT batch_no, qty_on_hand, avg_cost_egp, expiry_date, last_movement_at
        FROM beithady_inventory_stock
        WHERE item_id = v_item_id
          AND warehouse_id = p_src_warehouse_id
          AND qty_on_hand > 0
        ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC NULLS LAST, last_movement_at ASC NULLS FIRST
      LOOP
        EXIT WHEN v_remaining <= 0;
        v_take := LEAST(v_remaining, v_batch_row.qty_on_hand);
        v_picked_batch := v_batch_row.batch_no;
        v_picked_cost := v_batch_row.avg_cost_egp;

        UPDATE beithady_inventory_stock
          SET qty_on_hand = qty_on_hand - v_take, last_movement_at = now()
          WHERE item_id = v_item_id AND warehouse_id = p_src_warehouse_id AND batch_no = v_picked_batch;

        SELECT qty_on_hand, avg_cost_egp INTO v_existing_dst
        FROM beithady_inventory_stock
        WHERE item_id = v_item_id AND warehouse_id = p_dst_warehouse_id AND batch_no = v_picked_batch;

        v_new_dst_qty := COALESCE(v_existing_dst.qty_on_hand, 0) + v_take;
        IF v_new_dst_qty > 0 THEN
          v_new_dst_avg := ((COALESCE(v_existing_dst.qty_on_hand, 0) * COALESCE(v_existing_dst.avg_cost_egp, 0))
                         + (v_take * v_picked_cost)) / v_new_dst_qty;
        ELSE
          v_new_dst_avg := v_picked_cost;
        END IF;

        INSERT INTO beithady_inventory_stock
          (item_id, warehouse_id, batch_no, qty_on_hand, avg_cost_egp, expiry_date, last_movement_at)
        VALUES
          (v_item_id, p_dst_warehouse_id, v_picked_batch, v_new_dst_qty, v_new_dst_avg, v_batch_row.expiry_date, now())
        ON CONFLICT (item_id, warehouse_id, batch_no) DO UPDATE
          SET qty_on_hand = v_new_dst_qty,
              avg_cost_egp = v_new_dst_avg,
              expiry_date = COALESCE(EXCLUDED.expiry_date, beithady_inventory_stock.expiry_date),
              last_movement_at = now();

        INSERT INTO beithady_inventory_transactions
          (type, item_id, warehouse_id, batch_no, qty_delta, unit_cost_egp,
           doc_type, doc_id, doc_line_no, created_by_user, note)
        VALUES
          ('transfer_out', v_item_id, p_src_warehouse_id, v_picked_batch,
           -v_take, v_picked_cost, 'transfer', v_transfer_id, v_line_no, p_actor_user,
           'Transfer line ' || v_line_no || ' OUT (FIFO ' || v_picked_batch || ')'),
          ('transfer_in', v_item_id, p_dst_warehouse_id, v_picked_batch,
           v_take, v_picked_cost, 'transfer', v_transfer_id, v_line_no, p_actor_user,
           'Transfer line ' || v_line_no || ' IN (FIFO ' || v_picked_batch || ')');

        v_total_value := v_total_value + (v_take * v_picked_cost);
        v_remaining := v_remaining - v_take;
      END LOOP;

      IF v_remaining > 0 THEN
        RAISE EXCEPTION 'Insufficient stock at source for item %: short by %', v_item_id, v_remaining;
      END IF;
    END IF;

    PERFORM beithady_inv_recompute_item_avg_cost(v_item_id);
    v_lines_count := v_lines_count + 1;
  END LOOP;

  IF p_notes IS NOT NULL THEN
    UPDATE beithady_inventory_transactions
      SET note = COALESCE(note, '') || ' · ' || p_notes
      WHERE doc_id = v_transfer_id AND doc_type = 'transfer' AND doc_line_no = 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'transfer_id', v_transfer_id,
    'lines_posted', v_lines_count,
    'total_value_egp', v_total_value,
    'src_warehouse_id', p_src_warehouse_id,
    'dst_warehouse_id', p_dst_warehouse_id,
    'posted_at', now()
  );
END $$;

COMMENT ON FUNCTION beithady_inv_post_transfer IS
'Atomic warehouse-to-warehouse transfer. FIFO source picking. Generates one transfer_id (uuid) shared across all transfer_out + transfer_in transactions for the operation. Both legs guaranteed-paired or both rolled back.';

-- ---------------------------------------------------------------------------
-- M.10: Post a count session as adjustment transactions
-- ---------------------------------------------------------------------------
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
  IF v_session.status NOT IN ('approved', 'in_progress') THEN
    RAISE EXCEPTION 'Count session must be approved or in_progress (got %)', v_session.status;
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
'Posts a count session: writes count_adjust transactions for non-zero variances, updates stock balance to counted_qty, recomputes avg_cost. Idempotency: only counts lines where counted_qty IS NOT NULL.';
