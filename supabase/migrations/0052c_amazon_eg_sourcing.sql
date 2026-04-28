-- =============================================================
-- Phase M.15.1 — Amazon EG sourcing fields + price snapshots
-- =============================================================
-- amazon_eg_url already exists on _items from M.4. ADD IF NOT EXISTS
-- the rest.
-- =============================================================

ALTER TABLE beithady_inventory_items
  ADD COLUMN IF NOT EXISTS amazon_eg_price_egp numeric(10,2),
  ADD COLUMN IF NOT EXISTS amazon_eg_rating numeric(2,1) CHECK (amazon_eg_rating IS NULL OR amazon_eg_rating BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS amazon_eg_review_count integer CHECK (amazon_eg_review_count IS NULL OR amazon_eg_review_count >= 0),
  ADD COLUMN IF NOT EXISTS amazon_eg_is_bulk_pack boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS amazon_eg_pack_size integer CHECK (amazon_eg_pack_size IS NULL OR amazon_eg_pack_size >= 1),
  ADD COLUMN IF NOT EXISTS amazon_eg_image_url text,
  ADD COLUMN IF NOT EXISTS amazon_eg_in_stock boolean,
  ADD COLUMN IF NOT EXISTS amazon_eg_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS amazon_eg_last_status text CHECK (
    amazon_eg_last_status IS NULL OR
    amazon_eg_last_status IN ('ok','oos','404','price_changed','unchecked','rate_limited')
  ),
  ADD COLUMN IF NOT EXISTS amazon_eg_alternatives jsonb;

COMMENT ON COLUMN beithady_inventory_items.amazon_eg_last_status IS
  'Outcome of the last availability check. ok=in stock, oos=out of stock, 404=URL dead, price_changed=>10pct delta vs last snapshot, unchecked=never run, rate_limited=Amazon throttled the probe.';
COMMENT ON COLUMN beithady_inventory_items.amazon_eg_alternatives IS
  'Top-5 candidates the AI considered. Stored so admin can swap to a runner-up without re-running the AI.';

-- Weekly price-snapshot history for trend analysis + price-increase alerts
CREATE TABLE IF NOT EXISTS beithady_inventory_amazon_eg_price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES beithady_inventory_items(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  price_egp numeric(10,2),
  rating numeric(2,1),
  review_count integer,
  in_stock boolean,
  pack_size integer,
  raw_json jsonb,
  fetched_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_amazon_snapshots_item_date
  ON beithady_inventory_amazon_eg_price_snapshots(item_id, snapshot_date DESC);

COMMENT ON TABLE beithady_inventory_amazon_eg_price_snapshots IS
  'One row per item per snapshot week. Used by the Forecast view to spot price drift + by reorder alerts when prices spike >10pct.';
