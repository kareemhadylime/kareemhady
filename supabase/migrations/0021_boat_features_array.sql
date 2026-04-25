-- Phase: Predefined boat features registry.
--
-- Adds a `features text[]` column on boat_rental_boats holding feature
-- codes (e.g. 'sunbath_front_seat', 'beverages'). Existing
-- `features_md` text column is repurposed as the "Other features /
-- free text" field for anything not in the predefined list — no
-- automatic migration of existing free-text data.
--
-- Predefined feature catalogue lives in code at
-- src/lib/boat-rental/features.ts (so adding/removing a feature is a
-- code change, not a DB migration).

alter table public.boat_rental_boats
  add column if not exists features text[] not null default '{}'::text[];
