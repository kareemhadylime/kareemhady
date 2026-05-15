-- supabase/migrations/0137_ads_youtube_cross_posts.sql
-- YouTube V1.2 (Picker / cross-post): audit table linking each cross-post
-- back to its YouTube source video and target platform.

CREATE TABLE ads_youtube_cross_posts (
  id bigserial PRIMARY KEY,
  ads_youtube_video_id bigint REFERENCES ads_youtube_videos(id) ON DELETE CASCADE,
  -- nullable: YT-only videos (not in ads_youtube_videos) can still be
  -- cross-posted to Google PMax via the youtube_video_id reference.
  youtube_video_id text NOT NULL,
  target_platform text NOT NULL CHECK (target_platform IN (
    'instagram_reel', 'tiktok_organic', 'tiktok_paid', 'meta_video_ad', 'google_pmax'
  )),
  target_post_id bigint,        -- loose FK to per-platform post tables
  target_campaign_id bigint,    -- loose FK for paid platforms
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'published', 'error')),
  error text,
  created_by_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (youtube_video_id, target_platform, target_post_id)
);

CREATE INDEX ads_youtube_cross_posts_video_idx
  ON ads_youtube_cross_posts (youtube_video_id, target_platform);

CREATE INDEX ads_youtube_cross_posts_ads_yt_video_idx
  ON ads_youtube_cross_posts (ads_youtube_video_id)
  WHERE ads_youtube_video_id IS NOT NULL;
