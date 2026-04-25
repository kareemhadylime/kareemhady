-- Phase: Manual "main photo" override for the Boat Catalogue.
--
-- Adds is_primary on boat photos so admins can pick which shot becomes
-- the catalogue grid preview, catalogue-detail hero, and PDF hero —
-- bypassing the prior "first by sort_order" rule which often surfaced
-- a poor representative image (close-up of a cushion, etc).
--
-- A partial unique index enforces at most one primary photo per boat.
-- The setPrimaryBoatImageAction server action clears any prior primary
-- on the boat then sets the new one in a 2-stmt transaction.

alter table public.boat_rental_boat_images
  add column if not exists is_primary boolean not null default false;

create unique index if not exists uniq_boat_rental_boat_images_primary
  on public.boat_rental_boat_images(boat_id)
  where is_primary = true;
