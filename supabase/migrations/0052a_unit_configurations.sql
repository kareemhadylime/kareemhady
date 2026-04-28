-- =============================================================
-- Phase M.15.1 — Unit Configuration Profiles
-- =============================================================
-- Models the bedroom/bathroom/guest_capacity/tier shape per listing
-- type. Listings are auto-mapped to a config (bedrooms from pricelabs,
-- bathrooms manual since neither pricelabs nor guesty expose them).
-- =============================================================

CREATE TABLE IF NOT EXISTS beithady_inventory_unit_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  bedrooms integer NOT NULL CHECK (bedrooms BETWEEN 0 AND 6),
  bathrooms numeric(3,1) NOT NULL CHECK (bathrooms BETWEEN 0.5 AND 6.0),
  guest_capacity integer NOT NULL CHECK (guest_capacity BETWEEN 1 AND 20),
  tier text NOT NULL CHECK (tier IN ('standard','premium','vip')) DEFAULT 'standard',
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE beithady_inventory_unit_configurations IS
  'Per-Q1/Q2/Q3 the unit-shape matrix that drives the housekeeping estimator.';

-- Listing → unit_config assignment. Auto-populated by daily cron from
-- pricelabs.bedrooms + heuristic bathrooms; admin can override.
CREATE TABLE IF NOT EXISTS beithady_inventory_listing_unit_config (
  listing_id text PRIMARY KEY REFERENCES guesty_listings(id) ON DELETE CASCADE,
  unit_config_id uuid REFERENCES beithady_inventory_unit_configurations(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('auto','manual')) DEFAULT 'auto',
  detected_bedrooms integer,
  detected_bathrooms numeric(3,1),
  needs_review boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_unit_config_needs_review
  ON beithady_inventory_listing_unit_config(needs_review)
  WHERE needs_review = true;

COMMENT ON TABLE beithady_inventory_listing_unit_config IS
  'Auto-mapping from listing to unit_config. needs_review=true until admin verifies bathroom count (which is not in pricelabs/guesty, must be manual).';
