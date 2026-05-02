-- 0067: Owner address book for non-login brokers + manual-reservation source
-- attribution + 24h pre-trip reminder tracking.
--
-- Reservation source enum: 'registered_broker' (default, broker_id NOT NULL),
-- 'external_broker' (external_broker_id NOT NULL), or 'client_direct' (both null).
-- A CHECK constraint enforces consistency.
--
-- Existing reservations all get source='registered_broker' + created_by_role='broker'.
--
-- reminder_24h_sent_at + partial index supports the new T-24h cron handler.
--
-- DOWN:
--   alter table public.boat_rental_reservations
--     drop constraint reservation_source_consistency,
--     drop column reminder_24h_sent_at,
--     drop column created_by_role,
--     drop column external_broker_id,
--     drop column source,
--     alter column broker_id set not null;
--   drop table public.boat_rental_external_brokers;

create table if not exists public.boat_rental_external_brokers (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.boat_rental_owners(id) on delete cascade,
  name        text not null,
  phone       text,
  created_at  timestamptz not null default now()
);
create unique index if not exists boat_rental_external_brokers_per_owner
  on public.boat_rental_external_brokers (owner_id, lower(trim(name)));

alter table public.boat_rental_reservations
  alter column broker_id drop not null,
  add column if not exists source text not null default 'registered_broker'
    check (source in ('registered_broker','external_broker','client_direct')),
  add column if not exists external_broker_id uuid references public.boat_rental_external_brokers(id),
  add column if not exists created_by_role text check (created_by_role in ('broker','owner','admin')),
  add column if not exists reminder_24h_sent_at timestamptz;

-- Backfill existing rows: they were all broker-created.
update public.boat_rental_reservations
set created_by_role = 'broker'
where created_by_role is null and broker_id is not null;

-- Add the consistency constraint AFTER backfill so we don't violate on existing rows.
alter table public.boat_rental_reservations
  add constraint reservation_source_consistency check (
    (source = 'registered_broker' and broker_id is not null and external_broker_id is null) or
    (source = 'external_broker'   and broker_id is null     and external_broker_id is not null) or
    (source = 'client_direct'     and broker_id is null     and external_broker_id is null)
  );

create index if not exists idx_boat_rental_reservations_reminder_due
  on public.boat_rental_reservations (booking_date)
  where reminder_24h_sent_at is null and status in ('confirmed','details_filled');
