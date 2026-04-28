-- =============================================================
-- Phase M.15.1 — Extend consumption_rules + listing_overrides
-- =============================================================

-- Extend the scope enum to include 'unit_config'
ALTER TABLE beithady_inventory_consumption_rules
  DROP CONSTRAINT IF EXISTS beithady_inventory_consumption_rules_scope_check;
ALTER TABLE beithady_inventory_consumption_rules
  ADD CONSTRAINT beithady_inventory_consumption_rules_scope_check
    CHECK (scope IN ('global','building','listing','category','unit_config'));

-- Extend formula_kind to support bedroom/bathroom/guest-per-checkin + fractional
ALTER TABLE beithady_inventory_consumption_rules
  DROP CONSTRAINT IF EXISTS beithady_inventory_consumption_rules_formula_kind_check;
ALTER TABLE beithady_inventory_consumption_rules
  ADD CONSTRAINT beithady_inventory_consumption_rules_formula_kind_check
    CHECK (formula_kind IN (
      'per_guest_per_night','per_night','per_checkin','per_2_guests_per_night',
      'fixed_per_stay','per_bedroom_per_checkin','per_bathroom_per_checkin',
      'per_guest_per_checkin','fractional_per_checkin'
    ));

-- Per-listing qty override layer (Q11). Wins over unit_config defaults.
CREATE TABLE IF NOT EXISTS beithady_inventory_listing_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id text NOT NULL REFERENCES guesty_listings(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES beithady_inventory_items(id) ON DELETE CASCADE,
  qty_override numeric(10,4) NOT NULL CHECK (qty_override >= 0),
  reason text,
  active boolean NOT NULL DEFAULT true,
  created_by_user uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_listing_overrides_listing
  ON beithady_inventory_listing_overrides(listing_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_listing_overrides_item
  ON beithady_inventory_listing_overrides(item_id) WHERE active = true;

COMMENT ON TABLE beithady_inventory_listing_overrides IS
  'Per-Q11 overrides on top of unit_config defaults. Override always wins. Reason field captures owner-driven amenity preferences.';
