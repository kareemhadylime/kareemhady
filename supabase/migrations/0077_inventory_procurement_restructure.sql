-- Phase M.17 — Procurement-first inventory restructure
-- Adds two columns:
-- 1. issue_lines.consumed_qty + consumed_uom (Q5C hybrid grain — audit-grain
--    consumption alongside the pack-grain qty already deducted from stock)
-- 2. unit_configurations.est_monthly_bookings (manual override for the
--    Procurement Need calc in the Housekeeping Matrix)
-- No backfill, no drops, no renames. Both columns nullable.

ALTER TABLE beithady_inventory_issue_lines
  ADD COLUMN IF NOT EXISTS consumed_qty numeric NULL
    CHECK (consumed_qty IS NULL OR consumed_qty >= 0),
  ADD COLUMN IF NOT EXISTS consumed_uom text NULL
    REFERENCES beithady_inventory_uoms(code) ON DELETE SET NULL;

COMMENT ON COLUMN beithady_inventory_issue_lines.consumed_qty IS
  'Q5C hybrid grain — consumption-grain qty (e.g., 100 for "100 mL"). NULL for manual issues without a rule trail. Auto-issues from rules always set this.';
COMMENT ON COLUMN beithady_inventory_issue_lines.consumed_uom IS
  'UoM of consumed_qty (mL, g, pcs, etc.). NULL if consumed_qty is NULL.';

ALTER TABLE beithady_inventory_unit_configurations
  ADD COLUMN IF NOT EXISTS est_monthly_bookings numeric NULL
    CHECK (est_monthly_bookings IS NULL OR est_monthly_bookings >= 0);

COMMENT ON COLUMN beithady_inventory_unit_configurations.est_monthly_bookings IS
  'Manual override for the Procurement Need calc in the Housekeeping Matrix. NULL falls back to "90-day Guesty avg / 3" then constant 4.';
