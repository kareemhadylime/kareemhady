-- =====================================================================
-- Phase F (F&B v1) — fix tautological index from 0080
-- =====================================================================
-- 0080 created `fnb_items_enabled_idx ON fnb_items(enabled) WHERE
-- deleted_at IS NULL AND enabled = true` — the indexed column has
-- zero selectivity inside the partial. Replace with an index aligned
-- to the actual guest-side read pattern: filter by category, order
-- by sort_order, scoped to enabled non-deleted items.

DROP INDEX IF EXISTS public.fnb_items_enabled_idx;

CREATE INDEX IF NOT EXISTS fnb_items_enabled_idx
  ON public.fnb_items(category_id, sort_order)
  WHERE deleted_at IS NULL AND enabled = true;
