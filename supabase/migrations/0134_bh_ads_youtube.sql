-- supabase/migrations/0134_bh_ads_youtube.sql
-- YouTube V1.1 (Upload-out): schema for ads_youtube_videos table
-- and YouTube columns on ads_accounts. Seeds the @beithady placeholder row.

-- 1. Extend ads_accounts with YouTube columns
ALTER TABLE ads_accounts
  ADD COLUMN youtube_channel_id text,
  ADD COLUMN youtube_channel_handle text,
  ADD COLUMN youtube_channel_name text,
  ADD COLUMN youtube_refresh_token text,
  ADD COLUMN youtube_access_token text,
  ADD COLUMN youtube_access_token_expires_at timestamptz,
  ADD COLUMN youtube_uploads_playlist_id text;

ALTER TABLE ads_accounts DROP CONSTRAINT IF EXISTS ads_accounts_platform_check;
ALTER TABLE ads_accounts ADD CONSTRAINT ads_accounts_platform_check
  CHECK (platform IN ('meta', 'google', 'tiktok', 'youtube'));

-- 2. New table for uploaded videos
CREATE TABLE ads_youtube_videos (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES beithady_gallery_assets(id) ON DELETE SET NULL,
  building_code text,
  source_url text NOT NULL,
  file_size_bytes bigint NOT NULL,
  duration_seconds int,
  is_shorts boolean NOT NULL DEFAULT false,
  title text NOT NULL,
  description text,
  tags text[],
  category_id int NOT NULL DEFAULT 19,
  privacy_status text NOT NULL DEFAULT 'unlisted'
    CHECK (privacy_status IN ('private', 'unlisted', 'public')),
  language text DEFAULT 'en',
  template_id text,
  ai_generated boolean NOT NULL DEFAULT false,
  ai_cost_usd numeric(10,6),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'uploading', 'processing', 'published', 'error')),
  upload_session_url text,
  chunk_offset bigint NOT NULL DEFAULT 0,
  retry_count int NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  youtube_video_id text,
  watch_url text,
  thumbnail_url text,
  error text,
  view_count bigint DEFAULT 0,
  like_count bigint DEFAULT 0,
  comment_count bigint DEFAULT 0,
  stats_synced_at timestamptz,
  created_by_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

-- 3. Indexes
CREATE INDEX ads_youtube_videos_pending_idx
  ON ads_youtube_videos (next_retry_at NULLS FIRST, id)
  WHERE status IN ('queued', 'uploading');

CREATE INDEX ads_youtube_videos_stats_refresh_idx
  ON ads_youtube_videos (stats_synced_at NULLS FIRST, id)
  WHERE status = 'published';

CREATE INDEX ads_youtube_videos_account_idx
  ON ads_youtube_videos (account_id, created_at DESC);

CREATE INDEX ads_youtube_videos_building_idx
  ON ads_youtube_videos (building_code, created_at DESC)
  WHERE building_code IS NOT NULL;

-- 4. Seed the placeholder @beithady row so Connect link is immediately wired
INSERT INTO ads_accounts (platform, external_id, name, currency, timezone, status)
VALUES ('youtube', '@beithady', 'Beit Hady (YouTube)', 'EGP', 'Africa/Cairo', 'active');
