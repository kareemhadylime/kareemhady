import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';
import {
  loadTikTokAppCredentials,
  refreshTikTokAccessToken,
  ttOpenPost,
  buildTikTokTitle,
} from './tiktok-client';

// Publish an organic TikTok video via the Content Posting API (PULL_FROM_URL).
// Ports C:\Voltauto-pricing\supabase\functions\ads-tiktok-publish\index.ts.
//
// Two variants:
//   - INBOX (default): /v2/post/publish/inbox/video/init/
//     Terminal status = SEND_TO_USER_INBOX; operator finalizes in TikTok app.
//     Works without app audit.
//   - DIRECT (optional): /v2/post/publish/video/init/
//     Terminal status = PUBLISH_COMPLETE; auto-publishes.
//     Requires app audit + ToS acceptance.
//
// Polling: every 4s, max 45 tries (~3 min).

const POLL_INTERVAL_MS = 4_000;
const POLL_MAX_TRIES = 45;

export type PrivacyLevel =
  | 'PUBLIC_TO_EVERYONE'
  | 'MUTUAL_FOLLOW_FRIENDS'
  | 'SELF_ONLY'
  | 'FOLLOWER_OF_CREATOR';

export type TikTokOrganicInput = {
  accountId: number;
  videoUrl: string;                   // public HTTPS
  caption?: string;
  hashtags?: string[];
  privacyLevel?: PrivacyLevel;
  directPost?: boolean;
  galleryAssetId?: string | null;     // uuid
  buildingCode?: string | null;
  createdBy?: string | null;
};

export type TikTokOrganicResult =
  | { ok: true; post_id: number; status: string; share_url: string | null; note?: string }
  | { ok: false; post_id: number | null; step: string; error: string; status?: string; raw?: unknown };

export async function publishTikTokReel(input: TikTokOrganicInput): Promise<TikTokOrganicResult> {
  const sb = supabaseAdmin();

  // Validate
  if (!input.accountId) return { ok: false, post_id: null, step: 'validate', error: 'account_id required' };
  if (!input.videoUrl || !input.videoUrl.startsWith('https://')) {
    return { ok: false, post_id: null, step: 'validate', error: 'video_url must be public HTTPS' };
  }

  const credsRes = await loadTikTokAppCredentials();
  if (!credsRes.ok) return { ok: false, post_id: null, step: 'env', error: credsRes.error };

  // Load account
  const { data: acc } = await sb
    .from('ads_accounts')
    .select('id, platform, tiktok_refresh_token, tiktok_open_id, tiktok_username, name')
    .eq('id', input.accountId)
    .maybeSingle();
  if (!acc) return { ok: false, post_id: null, step: 'load_account', error: 'account_not_found' };
  const a = acc as { id: number; platform: string; tiktok_refresh_token: string | null; tiktok_open_id: string | null; tiktok_username: string | null };
  if (a.platform !== 'tiktok') return { ok: false, post_id: null, step: 'load_account', error: 'account_not_tiktok' };
  if (!a.tiktok_refresh_token) {
    return { ok: false, post_id: null, step: 'load_account', error: 'tiktok_refresh_token_missing — connect account first' };
  }

  const title = buildTikTokTitle(input.caption, input.hashtags);
  const privacy: PrivacyLevel = input.privacyLevel || 'PUBLIC_TO_EVERYONE';

  // Insert PENDING_CREATE row
  const { data: insRow, error: insErr } = await sb
    .from('ads_tiktok_posts')
    .insert({
      ads_account_id: input.accountId,
      video_url: input.videoUrl,
      caption: title,
      hashtags: input.hashtags || [],
      privacy_level: privacy,
      ads_gallery_item_id: input.galleryAssetId || null,
      building_code: input.buildingCode || null,
      created_by: input.createdBy || null,
      status: 'PENDING_CREATE',
    })
    .select('id')
    .single();
  if (insErr || !insRow) return { ok: false, post_id: null, step: 'db_insert', error: insErr?.message || 'insert_failed' };
  const postId = (insRow as { id: number }).id;

  // Refresh token
  const tok = await refreshTikTokAccessToken(input.accountId, a.tiktok_refresh_token);
  if (!tok.ok) {
    await sb.from('ads_tiktok_posts').update({
      status: 'FAILED',
      status_error: JSON.stringify(tok.raw || tok.error).slice(0, 2000),
    }).eq('id', postId);
    return { ok: false, post_id: postId, step: 'refresh_token', error: tok.error, raw: tok.raw };
  }

  // Init upload
  const initPath = input.directPost ? '/v2/post/publish/video/init/' : '/v2/post/publish/inbox/video/init/';
  const postInfo: Record<string, unknown> = { title, privacy_level: privacy };
  if (input.directPost) {
    postInfo.disable_duet = false;
    postInfo.disable_comment = false;
    postInfo.disable_stitch = false;
    postInfo.video_cover_timestamp_ms = 0;
  }
  const initRes = await ttOpenPost(initPath, {
    source_info: { source: 'PULL_FROM_URL', video_url: input.videoUrl },
    post_info: postInfo,
  }, tok.access_token);

  if (!initRes.ok) {
    await sb.from('ads_tiktok_posts').update({
      status: 'FAILED',
      status_error: JSON.stringify((initRes.body as { error?: unknown }).error || initRes.body).slice(0, 2000),
    }).eq('id', postId);
    return { ok: false, post_id: postId, step: 'init_upload', error: 'init_failed', raw: initRes.body };
  }

  const publishId = String(((initRes.body as { data?: { publish_id?: string } }).data?.publish_id) || '');
  if (!publishId) {
    await sb.from('ads_tiktok_posts').update({ status: 'FAILED', status_error: 'no publish_id' }).eq('id', postId);
    return { ok: false, post_id: postId, step: 'init_upload', error: 'no_publish_id', raw: initRes.body };
  }
  await sb.from('ads_tiktok_posts').update({ publish_id: publishId, status: 'PROCESSING_UPLOAD' }).eq('id', postId);

  // Poll until terminal
  for (let i = 0; i < POLL_MAX_TRIES; i++) {
    const r = await ttOpenPost('/v2/post/publish/status/fetch/', { publish_id: publishId }, tok.access_token);
    if (!r.ok) {
      await new Promise(res => setTimeout(res, POLL_INTERVAL_MS));
      continue;
    }
    const data = (r.body as { data?: Record<string, unknown> }).data || {};
    const status = String(data.status || 'PROCESSING_UPLOAD');

    if (status === 'PROCESSING_UPLOAD' || status === 'PROCESSING_DOWNLOAD') {
      await sb.from('ads_tiktok_posts').update({ status }).eq('id', postId);
    }
    if (status === 'FAILED' || status === 'EXPIRED') {
      await sb.from('ads_tiktok_posts').update({
        status,
        status_error: JSON.stringify(data).slice(0, 2000),
      }).eq('id', postId);
      return { ok: false, post_id: postId, step: 'publish_failed', error: status, status, raw: data };
    }
    if (status === 'SEND_TO_USER_INBOX') {
      await sb.from('ads_tiktok_posts').update({
        status,
        published_at: new Date().toISOString(),
      }).eq('id', postId);
      await recordAudit({
        module: 'ads',
        action: 'tiktok_reel_published',
        target_type: 'tiktok_post',
        target_id: String(postId),
        metadata: { status: 'inbox', building_code: input.buildingCode || null },
      });
      return { ok: true, post_id: postId, status, share_url: null, note: 'Open TikTok app → Inbox → Drafts to finish posting' };
    }
    if (status === 'PUBLISH_COMPLETE') {
      const publiclyId = (data.publicaly_available_post_id || data.publicly_available_post_id) as string | undefined;
      const update: Record<string, unknown> = { status, published_at: new Date().toISOString() };
      if (publiclyId) {
        update.publicly_available_post_id = String(publiclyId);
        if (a.tiktok_username) update.share_url = `https://www.tiktok.com/@${a.tiktok_username}/video/${publiclyId}`;
      }
      await sb.from('ads_tiktok_posts').update(update).eq('id', postId);
      await recordAudit({
        module: 'ads',
        action: 'tiktok_reel_published',
        target_type: 'tiktok_post',
        target_id: String(postId),
        metadata: { status: 'direct', share_url: update.share_url, building_code: input.buildingCode || null },
      });
      return { ok: true, post_id: postId, status, share_url: (update.share_url as string) || null };
    }

    await new Promise(res => setTimeout(res, POLL_INTERVAL_MS));
  }

  return { ok: false, post_id: postId, step: 'poll_timeout', error: 'timeout', status: 'PROCESSING_UPLOAD' };
}

// Re-poll status for an in-flight TikTok publish (for the UI's "refresh" button).
export async function pollTikTokPostStatus(postDbId: number): Promise<{ ok: boolean; status: string; share_url: string | null }> {
  const sb = supabaseAdmin();
  const { data: post } = await sb
    .from('ads_tiktok_posts')
    .select('id, ads_account_id, publish_id, status')
    .eq('id', postDbId)
    .maybeSingle();
  if (!post) return { ok: false, status: 'NOT_FOUND', share_url: null };
  const p = post as { id: number; ads_account_id: number; publish_id: string | null; status: string };
  if (p.status === 'PUBLISH_COMPLETE' || p.status === 'SEND_TO_USER_INBOX') return { ok: true, status: p.status, share_url: null };
  if (!p.publish_id) return { ok: false, status: p.status, share_url: null };

  const { data: acc } = await sb
    .from('ads_accounts')
    .select('tiktok_refresh_token, tiktok_username')
    .eq('id', p.ads_account_id)
    .maybeSingle();
  const a = acc as { tiktok_refresh_token: string | null; tiktok_username: string | null } | null;
  if (!a?.tiktok_refresh_token) return { ok: false, status: 'NO_TOKEN', share_url: null };

  const tok = await refreshTikTokAccessToken(p.ads_account_id, a.tiktok_refresh_token);
  if (!tok.ok) return { ok: false, status: 'REFRESH_FAILED', share_url: null };

  const r = await ttOpenPost('/v2/post/publish/status/fetch/', { publish_id: p.publish_id }, tok.access_token);
  const data = (r.body as { data?: Record<string, unknown> }).data || {};
  const status = String(data.status || p.status);
  const update: Record<string, unknown> = { status };
  if (status === 'FAILED' || status === 'EXPIRED') update.status_error = JSON.stringify(data).slice(0, 2000);
  if (status === 'SEND_TO_USER_INBOX') update.published_at = new Date().toISOString();
  if (status === 'PUBLISH_COMPLETE') {
    update.published_at = new Date().toISOString();
    const publiclyId = (data.publicaly_available_post_id || data.publicly_available_post_id) as string | undefined;
    if (publiclyId) {
      update.publicly_available_post_id = String(publiclyId);
      if (a.tiktok_username) update.share_url = `https://www.tiktok.com/@${a.tiktok_username}/video/${publiclyId}`;
    }
  }
  await sb.from('ads_tiktok_posts').update(update).eq('id', postDbId);
  return { ok: true, status, share_url: (update.share_url as string) || null };
}
