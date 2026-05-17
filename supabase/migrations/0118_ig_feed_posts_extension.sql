-- IG Feed Posts (single image / carousel / feed video) + insights cache.
--
-- Extends ads_instagram_posts originally built for Reels-only. The Reels rows
-- continue to work as-is (post_type defaults to 'reel'), and the new code path
-- writes 'image' / 'carousel' / 'video' with image_url / child_urls / video_url
-- as appropriate.
--
-- Insights columns cache the most recent Graph API response per post so the
-- insights page doesn't re-hit Meta on every render.

alter table public.ads_instagram_posts
  alter column video_url drop not null;

alter table public.ads_instagram_posts
  add column if not exists post_type text not null default 'reel'
    check (post_type in ('reel','image','carousel','video')),
  add column if not exists image_url text,
  add column if not exists child_urls text[],
  add column if not exists ig_insights jsonb,
  add column if not exists ig_insights_fetched_at timestamptz,
  add column if not exists fb_insights jsonb,
  add column if not exists fb_insights_fetched_at timestamptz;

create index if not exists ads_ig_posts_post_type_idx
  on public.ads_instagram_posts(post_type);
