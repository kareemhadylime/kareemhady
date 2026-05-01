-- Phase M.16 — volumetric consumption math.
--
-- The catalog previously assumed every "unit" of an item is a fixed,
-- equivalent thing — "1 bottle" was always "1 bottle" regardless of size.
-- This breaks when the operator buys a 4 kg multi-purpose cleaner (1 unit
-- per pack) under a SKU that was calibrated for a 1 L bottle: the
-- consumption rule "0.10 bottle per check-in" silently means 400g of
-- cleaner per check-in instead of 100ml.
--
-- This migration introduces volumetric metadata so consumption rules can
-- specify base units (ml, g, pcs) and the estimator can convert correctly:
--
--   item.pack_volume_value + pack_volume_uom         → "this pack is 4 kg"
--   rule.consumes_volume_value + consumes_volume_uom → "use 100 ml per check-in"
--   units_per_checkin = consumes / pack (with UoM conversion)
--   cost_per_checkin = units_per_checkin × multiplier × amazon_price
--
-- Backward-compat: when consumes_volume_value is null, the estimator
-- falls back to the legacy `qty × price ÷ pack_size` math. Existing
-- rules continue to work unchanged.
--
-- Q3 from the workflow phase: when an operator changes a SKU's URL to a
-- product with a different pack volume, we don't auto-rewrite the SKU —
-- the items page banner offers "Create new SKU" so historical data
-- (GRNs, issues, transactions) on the old SKU stays intact.
--
-- Q6: GRN lines now capture received_pack_volume_value/uom so the
-- operator can correct the SKU's stored pack volume if the actual
-- delivered packaging differed from what the catalog said.

-- ---------------------------------------------------------------------------
-- 1. Items: pack_volume + Amazon shadow columns
-- ---------------------------------------------------------------------------

ALTER TABLE beithady_inventory_items
  ADD COLUMN IF NOT EXISTS pack_volume_value numeric
    CHECK (pack_volume_value IS NULL OR pack_volume_value > 0),
  ADD COLUMN IF NOT EXISTS pack_volume_uom text
    REFERENCES beithady_inventory_uoms(code) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amazon_eg_pack_volume_value numeric
    CHECK (amazon_eg_pack_volume_value IS NULL OR amazon_eg_pack_volume_value > 0),
  ADD COLUMN IF NOT EXISTS amazon_eg_pack_volume_uom text;

COMMENT ON COLUMN beithady_inventory_items.pack_volume_value IS
  'How much of pack_volume_uom one purchasable unit contains. E.g., 4 for "4 kg" pack, 1 for "1 L" bottle, 30 for "30 ml" amenity bottle. NULL = legacy item, estimator falls back to count-based math.';
COMMENT ON COLUMN beithady_inventory_items.pack_volume_uom IS
  'Base UoM for pack_volume_value. References beithady_inventory_uoms.code (e.g., kg, g, L, ml, pcs).';
COMMENT ON COLUMN beithady_inventory_items.amazon_eg_pack_volume_value IS
  'Pack volume parsed from the Amazon EG product name by the sourcer. Compared to pack_volume_value for mismatch detection.';

-- ---------------------------------------------------------------------------
-- 2. Consumption rules: consumes_volume (base-unit semantics)
-- ---------------------------------------------------------------------------

ALTER TABLE beithady_inventory_consumption_rules
  ADD COLUMN IF NOT EXISTS consumes_volume_value numeric
    CHECK (consumes_volume_value IS NULL OR consumes_volume_value > 0),
  ADD COLUMN IF NOT EXISTS consumes_volume_uom text
    REFERENCES beithady_inventory_uoms(code) ON DELETE SET NULL;

COMMENT ON COLUMN beithady_inventory_consumption_rules.consumes_volume_value IS
  'How much of consumes_volume_uom is consumed per formula trigger (e.g., 100 for "100 ml per bathroom per check-in"). When set AND the item has pack_volume_value, estimator computes units_per_checkin = consumes/pack with UoM conversion. NULL = legacy rule, qty × price ÷ pack_size math applies.';
COMMENT ON COLUMN beithady_inventory_consumption_rules.consumes_volume_uom IS
  'Base UoM for consumes_volume_value. Should be compatible with item.pack_volume_uom (e.g., both volume measures, both mass, both count).';

-- ---------------------------------------------------------------------------
-- 3. GRN lines: receive_pack_volume override (Q6)
-- ---------------------------------------------------------------------------
-- When a GRN line is posted with a received pack volume that differs from
-- the SKU's stored pack_volume, the operator can either restate the line
-- (treating qty × received_pack_volume as the actual delivered amount) or
-- update the SKU's pack_volume to match the new shipment. Operator-driven.

ALTER TABLE beithady_inventory_grn_lines
  ADD COLUMN IF NOT EXISTS received_pack_volume_value numeric
    CHECK (received_pack_volume_value IS NULL OR received_pack_volume_value > 0),
  ADD COLUMN IF NOT EXISTS received_pack_volume_uom text
    REFERENCES beithady_inventory_uoms(code) ON DELETE SET NULL;

COMMENT ON COLUMN beithady_inventory_grn_lines.received_pack_volume_value IS
  'Actual pack volume of the goods received in this GRN line. Allows correcting the SKU''s stored pack_volume when the delivered packaging differs (e.g., vendor swapped a 1L bottle for a 4kg pack). When set, the receiving workflow prompts the operator to also update the SKU.';

-- ---------------------------------------------------------------------------
-- 4. Backfill: parse pack_volume from existing item names where possible
-- ---------------------------------------------------------------------------
-- Heuristic — match a number followed by a UoM code in the EN name.
-- Idempotent: only fills rows that don't already have pack_volume_value.

DO $$
DECLARE
  r record;
  match_value numeric;
  match_uom text;
  m text[];
BEGIN
  FOR r IN
    SELECT id, name_en, sku, uom
    FROM beithady_inventory_items
    WHERE pack_volume_value IS NULL
  LOOP
    -- Try the EN name first (e.g., "Bleach 1L", "Shampoo bottle 30ml")
    -- regex: number + optional space + ml|l|kg|g (case-insensitive)
    m := regexp_match(
      lower(r.name_en),
      '(\d+(?:\.\d+)?)\s*(ml|kg|g|l)\b'
    );
    IF m IS NOT NULL THEN
      match_value := m[1]::numeric;
      match_uom := m[2];
    ELSE
      -- Fall back to SKU code suffix (e.g., CLN-ANTIFLY-400ML)
      m := regexp_match(lower(r.sku), '(\d+(?:\.\d+)?)\s*(ml|kg|g|l)$');
      IF m IS NOT NULL THEN
        match_value := m[1]::numeric;
        match_uom := m[2];
      ELSE
        CONTINUE;
      END IF;
    END IF;

    -- Normalize: 'l' → 'L', uppercase the rest stays lowercase per uoms catalog
    IF match_uom = 'l' THEN match_uom := 'L'; END IF;

    -- Only set if the UoM code exists in the uoms catalog
    PERFORM 1 FROM beithady_inventory_uoms WHERE code = match_uom;
    IF FOUND THEN
      UPDATE beithady_inventory_items
      SET pack_volume_value = match_value,
          pack_volume_uom = match_uom,
          updated_at = NOW()
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Ensure base UoMs exist (kg, g, L, ml) — they may not all be in the
--    seeded catalog yet.
-- ---------------------------------------------------------------------------

INSERT INTO beithady_inventory_uoms (code, name_en, name_ar, measure_kind)
VALUES
  ('kg', 'Kilogram', 'كيلوجرام', 'mass'),
  ('g',  'Gram',     'جرام',     'mass'),
  ('L',  'Liter',    'لتر',      'volume'),
  ('ml', 'Milliliter','ملليلتر',  'volume')
ON CONFLICT (code) DO NOTHING;
