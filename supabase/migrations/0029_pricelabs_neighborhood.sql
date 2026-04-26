-- Phase v3 — Beithady Pricing Intelligence.
--
-- Two tables:
--   1. pricelabs_neighborhood_snapshots — per-listing daily raw comp
--      data from PriceLabs /neighborhood_data?id=...
--   2. pricelabs_market_snapshots — per-(building, bedroom-bucket)
--      pre-aggregated alert-classified rows that the daily report reads
--
-- Per P6=A: if PriceLabs `neighborhood_data` is not on Beithady's tier,
-- the sync detects 404 and skips writes; the daily report renders the
-- section as empty (drops the feature gracefully).

create table if not exists public.pricelabs_neighborhood_snapshots (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null references public.pricelabs_listings(id) on delete cascade,
  snapshot_date date not null,
  bedrooms int,
  comp_set_size int,
  comp_median_price numeric(12,2),
  comp_mean_price numeric(12,2),
  comp_p25_price numeric(12,2),
  comp_p75_price numeric(12,2),
  comp_median_weekday numeric(12,2),
  comp_median_weekend numeric(12,2),
  comp_occupancy_pct numeric(5,2),
  comp_lead_time_days numeric(5,1),
  comp_avg_rating numeric(3,2),
  comp_rating_sample_size int,
  currency text,
  confidence text check (confidence in ('high','medium','low','insufficient')),
  raw jsonb,
  synced_at timestamptz not null default now(),
  unique (listing_id, snapshot_date)
);
create index if not exists idx_plnh_listing_date
  on public.pricelabs_neighborhood_snapshots (listing_id, snapshot_date desc);

-- Per-(building, bedroom-bucket) aggregated, alert-classified rows.
-- Computed at the end of each PriceLabs sync; the daily report reads
-- the most-recent snapshot_date row per (building, bucket).
create table if not exists public.pricelabs_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  building_code text not null,
  bedroom_bucket text not null,
  unit_count int not null,
  our_avg_base_usd numeric(12,2),
  our_avg_adr_past_30_usd numeric(12,2),
  our_avg_review_rating numeric(3,2),
  our_avg_occupancy_pct numeric(5,2),
  comp_median_usd numeric(12,2),
  comp_median_weekday_usd numeric(12,2),
  comp_median_weekend_usd numeric(12,2),
  comp_avg_rating numeric(3,2),
  comp_set_size int,
  comp_occupancy_pct numeric(5,2),
  delta_pct numeric(6,2),
  stly_delta_pct numeric(6,2),
  alert_level text,
  recommended_price_usd numeric(12,2),
  raw jsonb,
  synced_at timestamptz not null default now(),
  unique (snapshot_date, building_code, bedroom_bucket)
);
create index if not exists idx_plms_building_date
  on public.pricelabs_market_snapshots (building_code, snapshot_date desc);

-- Track success of neighborhood pull on each pricelabs sync run for
-- cron observability (does the endpoint exist? are we hitting limits?).
alter table public.pricelabs_sync_runs
  add column if not exists neighborhood_listings_synced int not null default 0,
  add column if not exists neighborhood_endpoint_available boolean,
  add column if not exists market_snapshots_written int not null default 0;
