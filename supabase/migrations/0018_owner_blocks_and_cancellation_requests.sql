-- Phase 6 — Reservation flow redesign + Owner Block Dates.
--
-- Adds:
--   1. boat_rental_owner_blocks: dates an owner reserves for personal
--      use, maintenance, etc. Availability check joins this table.
--   2. boat_rental_inquiries: every availability check gets logged for
--      funnel analytics (inquiry -> hold -> reserve -> paid).
--   3. Cancellation-request columns on boat_rental_reservations: when a
--      broker tries to cancel within 72h of the booking date the request
--      is held pending owner approval rather than auto-cancelling.
--   4. hold_warning_sent_at: tracks the T-30min hold-expiry WhatsApp
--      push so the cron doesn't re-fire it.
--
-- A separate one-time wipe of all existing reservations / payments /
-- bookings / audit / notifications was run after this migration to
-- start clean (per user request "delete all reservations").

create table if not exists public.boat_rental_owner_blocks (
  id              uuid primary key default gen_random_uuid(),
  boat_id         uuid not null references public.boat_rental_boats(id) on delete cascade,
  blocked_date    date not null,
  reason          text not null check (reason in ('personal_use','maintenance','owner_trip','repair','other')),
  reason_note     text,
  blocked_by      uuid not null references public.app_users(id),
  blocked_by_role text not null check (blocked_by_role in ('owner','admin')),
  created_at      timestamptz not null default now()
);
create unique index if not exists boat_rental_owner_blocks_uk
  on public.boat_rental_owner_blocks (boat_id, blocked_date);
create index if not exists idx_boat_rental_owner_blocks_boat
  on public.boat_rental_owner_blocks (boat_id, blocked_date);

create table if not exists public.boat_rental_inquiries (
  id            uuid primary key default gen_random_uuid(),
  boat_id       uuid not null references public.boat_rental_boats(id),
  booking_date  date not null,
  broker_id     uuid not null references public.app_users(id),
  outcome       text not null check (outcome in ('held','reserved','none','unavailable','blocked')),
  price_egp     numeric(10,2),
  tier          text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_boat_rental_inquiries_boat_date
  on public.boat_rental_inquiries (boat_id, booking_date);
create index if not exists idx_boat_rental_inquiries_broker
  on public.boat_rental_inquiries (broker_id, created_at desc);

alter table public.boat_rental_reservations
  add column if not exists cancellation_requested_at        timestamptz,
  add column if not exists cancellation_requested_by        uuid references public.app_users(id),
  add column if not exists cancellation_request_reason      text,
  add column if not exists cancellation_request_role        text,
  add column if not exists cancellation_request_resolved_at timestamptz,
  add column if not exists cancellation_request_resolved_by uuid references public.app_users(id),
  add column if not exists cancellation_request_resolution  text,
  add column if not exists hold_warning_sent_at             timestamptz;

create index if not exists idx_boat_rental_reservations_pending_cancel
  on public.boat_rental_reservations (boat_id)
  where cancellation_requested_at is not null and cancellation_request_resolved_at is null;
