-- =====================================================================
-- Beithady v2 — Phase D: Gallery + Documents
-- =====================================================================
-- Per-building / per-apartment media library with AI auto-labeling.
-- Three storage buckets:
--   beithady-gallery         private, signed URLs for crew browsing
--   beithady-gallery-public  CDN, only for ad_eligible=true assets
--   beithady-documents       private, role-gated (managers + admins)
--
-- AI labeling runs async via /api/cron/beithady-ai-label-queue every
-- 2 min: picks up to 5 queued jobs, calls Claude vision, writes tags +
-- caption + quality score.

-- 1. Storage buckets (idempotent upsert)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('beithady-gallery', 'beithady-gallery', false, 52428800,
   array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
         'video/mp4','video/webm','video/quicktime']),
  ('beithady-gallery-public', 'beithady-gallery-public', true, 52428800,
   array['image/jpeg','image/png','image/webp','image/gif',
         'video/mp4','video/webm']),
  ('beithady-documents', 'beithady-documents', false, 104857600,
   array['application/pdf','application/zip','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public bucket read policy
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='beithady_gallery_public_read') then
    create policy beithady_gallery_public_read on storage.objects
      for select to public
      using (bucket_id = 'beithady-gallery-public');
  end if;
end $$;

-- 2. Assets table
create table if not exists public.beithady_gallery_assets (
  id                uuid primary key default gen_random_uuid(),
  building_code     text,                                   -- BH-26 / BH-73 / BH-435 / BH-OK / BH-34 / null=common+brand+docs
  listing_id        text,                                   -- guesty listing id; null for common/brand/docs
  category          text not null check (category in ('photo','video','document','brand_asset','ad_creative')),
  album_id          uuid,                                   -- soft FK to beithady_gallery_albums
  storage_bucket    text not null default 'beithady-gallery',
  storage_path      text not null,
  public_url        text,                                   -- only set when ad_eligible AND mirrored to public bucket
  file_name         text,
  mime_type         text,
  width             int,
  height            int,
  duration_sec      int,
  size_bytes        bigint,
  ai_tags           text[] default '{}',
  ai_caption        text,
  ai_quality_score  int,                                    -- 0-10 ad-suitability
  ai_processed_at   timestamptz,
  ai_model          text,
  manual_tags       text[] default '{}',
  ad_eligible       boolean default false,
  uploaded_by       uuid references public.app_users(id),
  notes             text,
  used_in           jsonb default '{}'::jsonb,              -- {ads:[campaign_ids], messages:[msg_ids], boarding_pages:[res_ids]}
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index if not exists idx_bh_gallery_building on public.beithady_gallery_assets(building_code) where deleted_at is null;
create index if not exists idx_bh_gallery_listing on public.beithady_gallery_assets(listing_id) where deleted_at is null;
create index if not exists idx_bh_gallery_category on public.beithady_gallery_assets(category) where deleted_at is null;
create index if not exists idx_bh_gallery_ad_eligible on public.beithady_gallery_assets(ad_eligible) where deleted_at is null and ad_eligible=true;
create index if not exists idx_bh_gallery_ai_tags_gin on public.beithady_gallery_assets using gin(ai_tags);
create index if not exists idx_bh_gallery_manual_tags_gin on public.beithady_gallery_assets using gin(manual_tags);
create index if not exists idx_bh_gallery_created on public.beithady_gallery_assets(created_at desc) where deleted_at is null;
create index if not exists idx_bh_gallery_album on public.beithady_gallery_assets(album_id) where deleted_at is null;

-- 3. Albums table
create table if not exists public.beithady_gallery_albums (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  building_code   text,
  description     text,
  cover_asset_id  uuid references public.beithady_gallery_assets(id) on delete set null,
  created_by      uuid references public.app_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_bh_albums_building on public.beithady_gallery_albums(building_code);

-- 4. Label-job queue (async AI labeling)
create table if not exists public.beithady_gallery_label_jobs (
  id            uuid primary key default gen_random_uuid(),
  asset_id      uuid not null references public.beithady_gallery_assets(id) on delete cascade,
  status        text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  attempts      int default 0,
  last_error    text,
  result        jsonb,
  enqueued_at   timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  unique (asset_id)
);
create index if not exists idx_bh_label_jobs_status on public.beithady_gallery_label_jobs(status, enqueued_at) where status in ('queued','running');

-- Touch trigger for assets.updated_at
drop trigger if exists beithady_gallery_assets_touch on public.beithady_gallery_assets;
create trigger beithady_gallery_assets_touch
  before update on public.beithady_gallery_assets
  for each row execute function public.beithady_guests_touch_updated();

drop trigger if exists beithady_gallery_albums_touch on public.beithady_gallery_albums;
create trigger beithady_gallery_albums_touch
  before update on public.beithady_gallery_albums
  for each row execute function public.beithady_guests_touch_updated();

-- 5. Helpers
-- Building counts for the gallery landing page
create or replace view public.beithady_gallery_building_summary as
select
  building_code,
  count(*) filter (where category = 'photo') as photos,
  count(*) filter (where category = 'video') as videos,
  count(*) filter (where category = 'document') as documents,
  count(*) filter (where category = 'brand_asset') as brand_assets,
  count(*) filter (where category = 'ad_creative') as ad_creatives,
  count(*) filter (where ad_eligible = true) as ad_eligible_count,
  sum(size_bytes) as total_bytes,
  max(created_at) as latest_upload_at
from public.beithady_gallery_assets
where deleted_at is null
group by building_code;

-- 6. Promote/demote ad_eligible — copies the file into the public
-- bucket (or deletes from it) so the public_url is mintable. Server
-- actions wrap this with the actual storage copy.
create or replace function public.beithady_gallery_set_ad_eligible(
  p_asset_id uuid,
  p_ad_eligible boolean,
  p_public_url text default null
)
returns void language plpgsql as $$
begin
  update public.beithady_gallery_assets
     set ad_eligible = p_ad_eligible,
         public_url = case when p_ad_eligible then p_public_url else null end
   where id = p_asset_id;
end $$;

insert into public.beithady_audit_log(module, action, metadata) values
  ('gallery', 'phase_d_installed',
   jsonb_build_object('migration', '0037_beithady_gallery', 'phase', 'D'));
