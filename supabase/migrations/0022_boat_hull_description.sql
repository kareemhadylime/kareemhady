-- Phase: Catalogue PDF marketing polish.
--
-- Adds two new boat attributes used by the Boat Catalogue + PDF spec
-- sheet (broker-facing marketing material):
--   hull         — 'wood' | 'fiberglass' (nullable; renders as a badge)
--   description  — free-text marketing tagline shown under the boat
--                  name on the PDF and the catalogue detail page

alter table public.boat_rental_boats
  add column if not exists hull text check (hull in ('wood', 'fiberglass')),
  add column if not exists description text;
