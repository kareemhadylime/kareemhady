-- Phase 11 — API-based Beithady Reviews. Replaces the email-parsing
-- aggregator with a direct Guesty /v1/reviews mirror. Category ratings
-- and Airbnb tag codes live in jsonb since the schema varies per channel
-- (airbnb2 carries cleanliness/accuracy/checkin/communication/location/value;
-- Booking.com uses a different structure).

create table if not exists public.guesty_reviews (
  id text primary key,                      -- Guesty _id
  account_id text,
  external_review_id text,                  -- Airbnb / Booking.com native review id
  channel_id text,                          -- 'airbnb2' | 'booking' | ...
  external_listing_id text,                 -- Airbnb listing id etc
  external_reservation_id text,             -- Airbnb HM-code / Booking ref
  listing_id text references public.guesty_listings(id) on delete set null,
  reservation_id text references public.guesty_reservations(id) on delete set null,
  guest_id text,
  reviewer_role text,                       -- 'guest' (guest → host) | 'host'
  overall_rating int,                       -- 1-5
  public_review text,                       -- guest-written free text
  category_ratings jsonb,                   -- [{category, rating, review_category_tags[]}]
  review_replies jsonb,                     -- [{text, createdAt, ...}]
  submitted boolean,
  hidden boolean,
  created_at_guesty timestamptz,            -- Guesty's createdAt (UTC)
  created_at_source timestamptz,            -- rawReview.created_at when present
  updated_at_guesty timestamptz,
  raw jsonb,                                -- full Guesty review payload
  synced_at timestamptz not null default now()
);
create index if not exists idx_guesty_reviews_created_guesty on public.guesty_reviews (created_at_guesty desc);
create index if not exists idx_guesty_reviews_listing on public.guesty_reviews (listing_id);
create index if not exists idx_guesty_reviews_reservation on public.guesty_reviews (reservation_id);
create index if not exists idx_guesty_reviews_channel on public.guesty_reviews (channel_id);
create index if not exists idx_guesty_reviews_rating on public.guesty_reviews (overall_rating);
create index if not exists idx_guesty_reviews_role on public.guesty_reviews (reviewer_role);

-- Extend the per-run counter so sync runs report review counts separately
-- from listings/reservations.
alter table public.guesty_sync_runs
  add column if not exists reviews_synced int not null default 0;
