-- 2026-05-02 Inventory module audit — C5: enforce currency='EGP' at DB
-- See INVENTORY_AUDIT_2026_05_02.md for full context.
--
-- The items table has historically allowed currency = 'EGP' | 'USD' but
-- no read site (estimator, dashboard reorder, GRN draft, rules cost,
-- items list) actually converted USD → EGP. A USD-flagged value lived
-- in default_cost_egp and was multiplied as if it were EGP, ~50× under-
-- pricing.
--
-- This migration:
--  1. Defensively normalises any non-EGP rows to 'EGP' (live data has 0
--     non-EGP rows so this is a no-op, but the safety net stays).
--  2. Adds a CHECK constraint forcing currency = 'EGP' going forward.
--
-- The default_cost_usd column is left in place (dead schema, no callers
-- reference it after C5). Drop it in a future cleanup migration if you
-- want to reclaim the column.

UPDATE beithady_inventory_items
SET currency = 'EGP'
WHERE currency <> 'EGP';

ALTER TABLE beithady_inventory_items
  DROP CONSTRAINT IF EXISTS beithady_inventory_items_currency_egp_check;

ALTER TABLE beithady_inventory_items
  ADD CONSTRAINT beithady_inventory_items_currency_egp_check
  CHECK (currency = 'EGP');

COMMENT ON COLUMN beithady_inventory_items.currency IS
'Audit fix C5 (0068): pinned to EGP. The item form no longer offers USD; if multi-currency is needed in the future, add an FX layer at every read site BEFORE relaxing this constraint.';
