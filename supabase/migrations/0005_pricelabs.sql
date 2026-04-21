-- Phase 8.1: PriceLabs revenue-intelligence ingestion for the Beithady
-- Pricing dashboard. PriceLabs returns per-listing ADR + STLY + occupancy-
-- vs-market metrics via GET /listings/{id}. We snapshot daily so we can
-- chart trends over time.
--
-- PriceLabs `id` matches Guesty `listing._id` (same MongoDB ObjectId),
-- so the text id column here is directly joinable to Guesty tables if we
-- sync those in a future phase.

create table if not exists public.pricelabs_listings (
  id text primary key,
  name text,
  pms text,
  bedrooms int,
  push_enabled boolean,
  is_hidden boolean,
  group_name text,
  subgroup text,
  tags text,
  building_code text,
  city_name text,
  country text,
  latitude numeric,
  longitude numeric,
  cleaning_fees numeric,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_pricelabs_listings_building on public.pricelabs_listings (building_code);
create index if not exists idx_pricelabs_listings_push on public.pricelabs_listings (push_enabled);

create table if not exists public.pricelabs_listing_snapshots (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null references public.pricelabs_listings(id) on delete cascade,
  snapshot_date date not null,
  base numeric,
  min_price numeric,
  max_price numeric,
  adr_past_30 numeric,
  stly_adr_past_30 numeric,
  revenue_past_30 numeric,
  stly_revenue_past_30 numeric,
  booking_pickup_past_30 numeric,
  occupancy_next_7 numeric,
  market_occupancy_next_7 numeric,
  occupancy_next_30 numeric,
  market_occupancy_next_30 numeric,
  occupancy_next_60 numeric,
  market_occupancy_next_60 numeric,
  recommended_base_price numeric,
  rec_base_unavailable boolean not null default false,
  last_date_pushed timestamptz,
  last_refreshed_at timestamptz,
  raw jsonb,
  synced_at timestamptz not null default now(),
  unique (listing_id, snapshot_date)
);
create index if not exists idx_pricelabs_snap_date on public.pricelabs_listing_snapshots (snapshot_date desc);
create index if not exists idx_pricelabs_snap_listing on public.pricelabs_listing_snapshots (listing_id, snapshot_date desc);

create table if not exists public.pricelabs_channels (
  listing_id text not null references public.pricelabs_listings(id) on delete cascade,
  channel_name text not null,
  channel_listing_id text not null,
  last_synced_at timestamptz,
  primary key (listing_id, channel_name)
);

create table if not exists public.pricelabs_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null default 'manual',
  status text not null default 'running',
  listings_synced int not null default 0,
  snapshots_written int not null default 0,
  channels_synced int not null default 0,
  error text
);
create index if not exists idx_pricelabs_runs_started on public.pricelabs_sync_runs (started_at desc);
