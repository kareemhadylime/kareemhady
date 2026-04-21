-- Phase 9: Full Guesty → Supabase sync. Replaces on-demand API probes with
-- a daily-refreshed local mirror so the email-based rules can enrich their
-- output without hitting Guesty's rate limit.

create table if not exists public.guesty_listings (
  id text primary key,              -- Guesty _id (MongoDB ObjectId)
  account_id text,
  nickname text,
  title text,
  listing_type text,                -- 'SINGLE' | 'MTL' | 'SLT' | null
  master_listing_id text,           -- FK to guesty_listings.id for children
  bedrooms int,
  accommodates int,
  property_type text,
  active boolean,
  tags text[],
  address_full text,
  address_city text,
  address_country text,
  building_code text,               -- derived: BH-26 / BH-73 / BH-435 / BH-OK
  raw jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_guesty_listings_nickname on public.guesty_listings (nickname);
create index if not exists idx_guesty_listings_building on public.guesty_listings (building_code);
create index if not exists idx_guesty_listings_master on public.guesty_listings (master_listing_id) where master_listing_id is not null;
create index if not exists idx_guesty_listings_type on public.guesty_listings (listing_type);

create table if not exists public.guesty_reservations (
  id text primary key,              -- Guesty _id
  confirmation_code text,           -- Guesty's own confirmation code
  platform_confirmation_code text,  -- Airbnb HM-code / Booking ref / etc from integration.confirmationCode
  status text,                      -- inquiry | reserved | confirmed | canceled | ...
  source text,                      -- Airbnb | Booking.com | Direct | Vrbo | ...
  integration_platform text,        -- from integration.platform
  listing_id text references public.guesty_listings(id) on delete set null,
  listing_nickname text,            -- denormalized for easy email-match lookup
  guest_name text,
  guest_email text,
  guest_phone text,
  check_in_date date,               -- checkInDateLocalized (property tz wall date)
  check_out_date date,
  nights int,
  guests int,
  currency text,
  host_payout numeric(14,2),
  guest_paid numeric(14,2),
  fare_accommodation numeric(14,2),
  cleaning_fee numeric(14,2),
  created_at_odoo timestamptz,       -- Guesty createdAt (UTC)
  updated_at_odoo timestamptz,
  raw jsonb,
  synced_at timestamptz not null default now()
);
create index if not exists idx_guesty_res_code on public.guesty_reservations (confirmation_code);
create index if not exists idx_guesty_res_platform_code on public.guesty_reservations (platform_confirmation_code);
create index if not exists idx_guesty_res_listing on public.guesty_reservations (listing_id);
create index if not exists idx_guesty_res_checkin on public.guesty_reservations (check_in_date);
create index if not exists idx_guesty_res_source on public.guesty_reservations (source);
create index if not exists idx_guesty_res_guest_email on public.guesty_reservations (lower(guest_email));

create table if not exists public.guesty_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null default 'manual',
  status text not null default 'running',
  listings_synced int not null default 0,
  reservations_synced int not null default 0,
  error text
);
create index if not exists idx_guesty_runs_started on public.guesty_sync_runs (started_at desc);
