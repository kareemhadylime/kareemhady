-- 2026-05-02 Communication module audit — M-3 + M-9
--
-- M-3: Replace getAssetBuildingsSummary's "load 50k rows + count in
--      JS" pattern with a SQL aggregate function. Picker first-step
--      load goes from O(N) bytes to O(buildings) bytes.
--
-- M-9: Add an index supporting the booking-status-filtered inbox
--      sort (`reservation_id` is the join key into the view).
--      Conversations without reservation_id are 'none' bucket and
--      won't filter through this index. The view itself can't be
--      indexed directly (Postgres doesn't support indexes on views
--      with computed columns), but indexing the join column gives
--      Postgres the data it needs to skip the seq-scan.

-- M-3: aggregate function for the picker's first step.
create or replace function public.beithady_communication_listing_assets_buildings_summary()
returns table(building_code text, listing_count int, asset_count int)
language sql
stable
as $$
  select
    l.building_code,
    count(distinct a.listing_id)::int as listing_count,
    count(*)::int as asset_count
  from public.beithady_listing_assets a
  join public.guesty_listings l on l.id = a.listing_id
  where a.deleted_at is null
    and l.building_code is not null
  group by l.building_code
  order by l.building_code;
$$;

comment on function public.beithady_communication_listing_assets_buildings_summary is
  'Audit fix M-3 (0074). Aggregate per-building counts for the LibraryPicker first step. Replaces the pre-fix "load 50k rows then count in JS" pattern.';

-- M-9: index reservation_id on beithady_conversations. The booking
-- status view joins on this; pre-fix every filtered inbox query
-- triggered a seq-scan over conversations.
create index if not exists idx_bh_conversations_reservation_id
  on public.beithady_conversations(reservation_id)
  where reservation_id is not null;

-- Also index on guesty_reservations.id is already the PK, so the
-- join from view→reservations is already index-backed. The remaining
-- speedup (filtering by booking_status_variant) requires a generated
-- column in beithady_conversations, which is a bigger change tracked
-- in the audit doc.
