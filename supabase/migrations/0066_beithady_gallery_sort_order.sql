-- =====================================================================
-- Beithady Gallery — Sort order column (Phase: gallery-overhaul)
-- =====================================================================
-- Adds sort_order so users can drag-reorder assets within an album.
-- Album = (building_code, listing_id) tuple, including (BH-XX, NULL)
-- for the General Building Area.
-- Backfill: existing rows get sort_order = -extract(epoch from created_at)
-- so newest = lowest = first, preserving today's "newest first" UX.

alter table public.beithady_gallery_assets
  add column if not exists sort_order int not null default 0;

update public.beithady_gallery_assets
   set sort_order = -extract(epoch from created_at)::int
 where sort_order = 0;

create index if not exists idx_bh_gallery_sort
  on public.beithady_gallery_assets(building_code, listing_id, sort_order)
  where deleted_at is null;

insert into public.beithady_audit_log(module, action, metadata) values
  ('gallery', 'sort_order_added',
   jsonb_build_object('migration', '0066_beithady_gallery_sort_order'));
