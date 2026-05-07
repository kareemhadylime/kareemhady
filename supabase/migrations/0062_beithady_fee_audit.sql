-- Beithady · Fee Audit module · forward 7/14/30 day fee transparency report.
-- 4 tables + seed of 6 channel commission constants.

create table if not exists public.beithady_pricelabs_daily_rates (
  listing_id text not null references public.pricelabs_listings(id) on delete cascade,
  date date not null,
  base_price numeric,
  min_price numeric,
  max_price numeric,
  currency text default 'USD',
  is_weekend boolean,
  is_blocked boolean default false,
  weekly_discount_pct numeric,
  monthly_discount_pct numeric,
  last_minute_discount_pct numeric,
  channel_overrides jsonb,
  raw jsonb,
  synced_at timestamptz default now(),
  primary key (listing_id, date)
);
create index if not exists idx_brfa_daily_date on public.beithady_pricelabs_daily_rates(date);

create table if not exists public.beithady_listing_terms (
  listing_id text primary key references public.guesty_listings(id) on delete cascade,
  cleaning_fee numeric,
  cleaning_fee_currency text,
  security_deposit numeric,
  pet_fee numeric,
  extra_guest_fee numeric,
  extra_guest_threshold int,
  taxes jsonb,
  min_nights_default int,
  min_nights_per_channel jsonb,
  max_nights int,
  prep_time_hours int,
  advance_notice_hours int,
  bathrooms numeric,
  raw jsonb,
  synced_at timestamptz default now()
);

create table if not exists public.beithady_channel_fees_config (
  channel text primary key,
  host_commission_pct numeric not null default 0,
  guest_service_pct numeric not null default 0,
  guest_service_min numeric,
  guest_service_max numeric,
  notes text,
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.beithady_listing_fee_history (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null references public.guesty_listings(id) on delete cascade,
  fee_type text not null,
  channel text,
  prev_value numeric,
  new_value numeric,
  prev_meta jsonb,
  new_meta jsonb,
  recorded_at timestamptz default now()
);
create index if not exists idx_brfh_listing on public.beithady_listing_fee_history(listing_id, recorded_at desc);

insert into public.beithady_channel_fees_config (channel, host_commission_pct, guest_service_pct, notes)
values
  ('airbnb', 3, 14.2, 'Standard host fee 3% + guest service ~14.2%. Adjust if on host-only fee plan.'),
  ('booking_com', 17.6, 0, 'Booking.com commission negotiable. Default 17.6%; override per-listing if negotiated.'),
  ('vrbo', 8, 0, 'Vrbo standard 8% commission.'),
  ('expedia', 15, 0, 'Expedia standard 15%.'),
  ('hotels_com', 15, 0, 'Hotels.com part of Expedia group.'),
  ('manual', 0, 0, 'Direct / manual bookings — no channel cut.')
on conflict do nothing;
