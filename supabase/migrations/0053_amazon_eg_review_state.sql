-- Phase M.15.4 — operator review state for the canonical Amazon EG product URL.
--
-- The estimator's per-config budget falls out of every item's Amazon EG
-- sourcing (price ÷ pack_size). Operators need an explicit "I checked, this
-- URL is correct" affordance on the items page so a stale URL or a wrong
-- product can be caught before it skews unit-cost rollups.
--
-- Two columns: when (timestamptz) + who (app_users uuid). Both are cleared
-- automatically by the application layer whenever amazon_eg_url changes —
-- a different ASIN means the previous review no longer applies.

ALTER TABLE beithady_inventory_items
  ADD COLUMN IF NOT EXISTS amazon_eg_url_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS amazon_eg_url_reviewed_by uuid REFERENCES app_users(id) ON DELETE SET NULL;

-- Partial index so the "Needs review" filter (amazon_eg_url set, reviewed_at
-- null) doesn't scan the whole items table on large catalogs.
CREATE INDEX IF NOT EXISTS beithady_inventory_items_amazon_eg_needs_review_idx
  ON beithady_inventory_items (amazon_eg_url_reviewed_at)
  WHERE amazon_eg_url IS NOT NULL;

COMMENT ON COLUMN beithady_inventory_items.amazon_eg_url_reviewed_at IS
  'Timestamp when an operator confirmed the canonical Amazon EG URL via Accept on /beithady/inventory/items. Cleared by app code whenever amazon_eg_url changes.';

COMMENT ON COLUMN beithady_inventory_items.amazon_eg_url_reviewed_by IS
  'app_users.id of the operator who confirmed the URL. Cleared by app code whenever amazon_eg_url changes; nulled on user delete.';
