-- 0066: Multi-skipper roster per boat.
-- Replaces single skipper_name/whatsapp columns on boat_rental_boats with
-- a 1-to-many roster table. The legacy columns are NOT dropped here —
-- migration 0072 drops them after all UI readers have been refactored.
--
-- Backfill: existing boats' skipper_name/whatsapp become the boat's default
-- skipper (is_default=true, active=true).
--
-- DOWN:
--   drop table public.boat_rental_skippers;

create table if not exists public.boat_rental_skippers (
  id          uuid primary key default gen_random_uuid(),
  boat_id     uuid not null references public.boat_rental_boats(id) on delete cascade,
  name        text not null,
  whatsapp    text not null,
  is_default  boolean not null default false,
  active      boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists boat_rental_skippers_default_per_boat
  on public.boat_rental_skippers (boat_id) where is_default = true;
create index if not exists idx_boat_rental_skippers_boat
  on public.boat_rental_skippers (boat_id, active);

-- Backfill from existing boats.
insert into public.boat_rental_skippers (boat_id, name, whatsapp, is_default, active, created_at)
select id, skipper_name, skipper_whatsapp, true, true, now()
from public.boat_rental_boats
where skipper_name is not null and skipper_whatsapp is not null
on conflict do nothing;
