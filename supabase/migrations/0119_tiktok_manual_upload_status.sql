-- TikTok Path 4 — manual upload helper.
--
-- Add two new status values to ads_tiktok_posts.status so the manual-upload
-- workflow can persist its state separately from the API publish flow:
--
--   MANUAL_PREPARED  — operator clicked "Prepare for manual upload": video
--                       was downloaded to their machine, caption copied to
--                       clipboard, TikTok Studio opened in a new tab. Row
--                       exists in DB but the actual post on TikTok hasn't
--                       happened yet (or we don't know about it).
--   MANUAL_UPLOADED  — operator confirmed the post is live on @beithady and
--                       pasted the share_url back into the dashboard.
--
-- Existing API flow values (PENDING_CREATE → PROCESSING_* → PUBLISH_COMPLETE)
-- are untouched and continue to work.

alter table public.ads_tiktok_posts
  drop constraint if exists ads_tiktok_posts_status_check;

alter table public.ads_tiktok_posts
  add constraint ads_tiktok_posts_status_check
  check (status in (
    'PENDING_CREATE',
    'PROCESSING_UPLOAD',
    'PROCESSING_DOWNLOAD',
    'SEND_TO_USER_INBOX',
    'PUBLISH_COMPLETE',
    'FAILED',
    'EXPIRED',
    'MANUAL_PREPARED',
    'MANUAL_UPLOADED'
  ));
