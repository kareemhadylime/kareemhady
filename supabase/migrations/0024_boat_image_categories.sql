-- Phase: AI photo categorization for the Boat Catalogue.
--
-- Adds a `category` column to boat_rental_boat_images with five
-- predefined codes. Photos are auto-classified via Claude Haiku 4.5
-- vision when uploaded; admins can override the AI choice from the
-- boat detail page; existing photos can be backfilled per-boat with a
-- "Re-classify" button.
--
-- The smart picker (src/lib/boat-rental/photo-picker.ts) uses
-- categories to fill priority slots on the catalogue grid preview,
-- catalogue-detail hero+thumbs, and the A4 PDF spec sheet —
-- guaranteeing a full_boat / seating / interior / bathroom variety
-- instead of just "first by sort_order" or 5 cushion close-ups.

alter table public.boat_rental_boat_images
  add column if not exists category text
  check (category in ('full_boat', 'seating', 'interior', 'bathroom', 'other'));

create index if not exists idx_boat_rental_boat_images_category
  on public.boat_rental_boat_images(boat_id, category);
