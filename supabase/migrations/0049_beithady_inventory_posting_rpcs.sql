-- =====================================================================
-- Phase M.7 — Posting engine RPCs
-- =====================================================================
-- Single transactional RPC per posting operation. Each RPC takes an
-- advisory lock per item_id to serialise weighted-average cost recomputes
-- (Risk #2 from the plan). Returns success metadata for the caller to
-- audit.
--
-- Applied via MCP apply_migration in the M.7 commit; this file is the
-- canonical source so the supabase migrations folder stays complete.

-- Helper: weighted average across all stock rows for an item, in EGP.
CREATE OR REPLACE FUNCTION beithady_inv_recompute_item_avg_cost(p_item_id uuid)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_qty numeric;
  v_weighted_sum numeric;
  v_avg numeric;
BEGIN
  SELECT
    COALESCE(SUM(qty_on_hand), 0),
    COALESCE(SUM(qty_on_hand * avg_cost_egp), 0)
  INTO v_total_qty, v_weighted_sum
  FROM beithady_inventory_stock
  WHERE item_id = p_item_id AND qty_on_hand > 0;

  IF v_total_qty <= 0 THEN
    -- Keep last known avg if no positive stock anywhere
    RETURN NULL;
  END IF;

  v_avg := v_weighted_sum / v_total_qty;
  UPDATE beithady_inventory_items
    SET avg_cost_egp = v_avg, updated_at = now()
    WHERE id = p_item_id;
  RETURN v_avg;
END $$;

COMMENT ON FUNCTION beithady_inv_recompute_item_avg_cost IS
'Weighted-average cost recompute across all warehouses for an item. Called from posting RPCs after stock balance changes.';

-- ---------------------------------------------------------------------------
-- Post GRN: applies all lines, writes transactions, updates stock balances
-- ---------------------------------------------------------------------------
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
  IF v_grn.status NOT IN ('approved', 'submitted', 'draft') THEN
    RAISE EXCEPTION 'GRN status must be approved/submitted/draft for posting (got %)', v_grn.status;
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
'Atomic GRN posting: acquires advisory locks per item, upserts stock balances, writes immutable transactions, recomputes weighted-average costs, marks GRN posted. Caller responsible for audit log and approval gate.';

-- ---------------------------------------------------------------------------
-- Helper: compute required approver roles for a doc
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION beithady_inv_required_approvers(
  p_doc_type text,
  p_sub_total_egp numeric DEFAULT 0,
  p_type_value text DEFAULT NULL,
  p_variance_pct numeric DEFAULT 0
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_roles text[];
BEGIN
  SELECT array_agg(DISTINCT approver_role::text)
  INTO v_roles
  FROM beithady_inventory_approval_rules
  WHERE active
    AND doc_type = p_doc_type
    AND (
      (condition_field = 'sub_total_egp' AND
        ((condition_op = '>'  AND p_sub_total_egp >  condition_value::numeric) OR
         (condition_op = '>=' AND p_sub_total_egp >= condition_value::numeric) OR
         (condition_op = '<'  AND p_sub_total_egp <  condition_value::numeric) OR
         (condition_op = '='  AND p_sub_total_egp =  condition_value::numeric))
      ) OR
      (condition_field = 'type' AND condition_op = '=' AND p_type_value = condition_value) OR
      (condition_field = 'variance_pct' AND condition_op = '>' AND p_variance_pct > condition_value::numeric) OR
      (condition_field = 'always')
    );
  RETURN COALESCE(v_roles, ARRAY[]::text[]);
END $$;

COMMENT ON FUNCTION beithady_inv_required_approvers IS
'Reads beithady_inventory_approval_rules and returns the distinct approver roles that must sign off on this doc given its sub_total / type / variance. Empty array means no approval required (auto-approve).';
