-- 0072: Drop legacy single-skipper columns from boat_rental_boats. The data
-- has been migrated to boat_rental_skippers (default skipper per boat) in
-- migration 0066, and all UI/server code has been refactored to read from
-- the new table (Task 29 of the boat-owner-features plan).
--
-- Running this BEFORE the application code is deployed will break boat
-- create / update flows. Apply only after the corresponding code lands.
--
-- DOWN:
--   alter table public.boat_rental_boats
--     add column skipper_name text,
--     add column skipper_whatsapp text;
--   -- (data restoration: copy each boat's default+active skipper back)
--   update public.boat_rental_boats b
--   set skipper_name = s.name,
--       skipper_whatsapp = s.whatsapp
--   from public.boat_rental_skippers s
--   where s.boat_id = b.id and s.is_default = true and s.active = true;

alter table public.boat_rental_boats
  drop column if exists skipper_name,
  drop column if exists skipper_whatsapp;
