-- supabase/migrations/0136_bh_marketing_reels_metadata.sql
-- Add cached metadata columns to bh_marketing_reels, populated at
-- insert time from TikTok oEmbed (and later Instagram Graph oEmbed
-- when a Meta token is available). Lets us show a poster thumbnail
-- + author handle BEFORE the heavy embed.js script swaps the
-- blockquote for an iframe, eliminating the "Loading TikTok…" flash.

alter table public.bh_marketing_reels
  add column if not exists thumbnail_url text,
  add column if not exists author_name   text,
  add column if not exists author_url    text;
