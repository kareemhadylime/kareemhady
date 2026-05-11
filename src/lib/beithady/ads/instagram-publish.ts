import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';
import { loadMetaCredentials, metaPost, metaGet } from './meta-client';

// Publish an organic Reel to Instagram, optionally cross-post to Facebook Page.
// Ports C:\Voltauto-pricing\supabase\functions\ads-instagram-publish\index.ts.
//
// IG flow:
//   1. POST /{ig_business_id}/media (media_type=REELS, video_url, caption)
//      → container_id
//   2. GET /{container_id}?fields=status_code → poll until FINISHED
//   3. POST /{ig_business_id}/media_publish (creation_id=container_id)
//      → media_id; then GET /{media_id} for permalink + thumbnail
//
// FB Reels cross-post (3 steps via /video_reels resumable upload):
//   1. start  → video_id + upload_url
//   2. upload via file_url header (Meta pulls mp4)
//   3. finish → publishes

const POLL_INTERVAL_MS = 6_000;
const POLL_MAX_TRIES = 30;

export type IgReelInput = {
  accountId: number;
  videoUrl: string;
  caption?: string;
  hashtags?: string[];
  shareToFeed?: boolean;
  alsoToFacebook?: boolean;
  fbCaption?: string;
  galleryAssetId?: string | null;
  buildingCode?: string | null;
  createdBy?: string | null;
};

export type IgReelResult =
  | {
      ok: true;
      post_id: number;
      media_id: string | null;
      permalink: string | null;
      thumbnail_url: string | null;
      status: string;
      facebook?: { ok: boolean; video_id?: string; permalink?: string; error?: string } | null;
    }
  | { ok: false; post_id: number | null; step: string; error: string; raw?: unknown };

function buildCaption(caption?: string, hashtags?: string[]): string {
  const tags = (hashtags || [])
    .map(t => (t || '').trim())
    .filter(Boolean)
    .map(t => (t.startsWith('#') ? t : `#${t}`));
  const tagBlock = tags.length ? '\n\n' + tags.join(' ') : '';
  return ((caption || '').trim() + tagBlock).slice(0, 2200);
}

export async function publishInstagramReel(input: IgReelInput): Promise<IgReelResult> {
  const sb = supabaseAdmin();

  // Validate
  if (!input.accountId) return { ok: false, post_id: null, step: 'validate', error: 'account_id required' };
  if (!input.videoUrl?.startsWith('https://')) return { ok: false, post_id: null, step: 'validate', error: 'video_url https required' };

  const credsRes = await loadMetaCredentials();
  if (!credsRes.ok) return { ok: false, post_id: null, step: 'env', error: credsRes.error };

  const { data: acc } = await sb
    .from('ads_accounts')
    .select('id, platform, fb_page_id, ig_business_id, ig_username')
    .eq('id', input.accountId)
    .maybeSingle();
  if (!acc) return { ok: false, post_id: null, step: 'load_account', error: 'account_not_found' };
  const a = acc as { id: number; platform: string; fb_page_id: string | null; ig_business_id: string | null; ig_username: string | null };
  if (a.platform !== 'meta') return { ok: false, post_id: null, step: 'load_account', error: 'account_not_meta' };
  if (!a.ig_business_id) return { ok: false, post_id: null, step: 'load_account', error: 'ig_business_id_missing — run resolve_ig first' };

  const caption = buildCaption(input.caption, input.hashtags);
  const shareToFeed = input.shareToFeed !== false;

  // Insert PENDING_CREATE row
  const { data: insRow, error: insErr } = await sb
    .from('ads_instagram_posts')
    .insert({
      ads_account_id: input.accountId,
      video_url: input.videoUrl,
      caption,
      hashtags: input.hashtags || [],
      share_to_feed: shareToFeed,
      ads_gallery_item_id: input.galleryAssetId || null,
      building_code: input.buildingCode || null,
      created_by: input.createdBy || null,
      status: 'PENDING_CREATE',
    })
    .select('id')
    .single();
  if (insErr || !insRow) return { ok: false, post_id: null, step: 'db_insert', error: insErr?.message || 'insert_failed' };
  const postId = (insRow as { id: number }).id;

  // Step 1: container
  const containerRes = await metaPost<{ id: string }>(`${a.ig_business_id}/media`, {
    media_type: 'REELS',
    video_url: input.videoUrl,
    caption,
    share_to_feed: shareToFeed ? 'true' : 'false',
  }, credsRes.creds.token);
  if (!containerRes.ok) {
    await sb.from('ads_instagram_posts').update({
      status: 'ERROR',
      status_error: JSON.stringify(containerRes.raw || containerRes.error).slice(0, 2000),
    }).eq('id', postId);
    return { ok: false, post_id: postId, step: 'create_container', error: containerRes.error, raw: containerRes.raw };
  }
  const containerId = String((containerRes.data as { id?: string }).id || '');
  if (!containerId) {
    await sb.from('ads_instagram_posts').update({ status: 'ERROR', status_error: 'no_container_id' }).eq('id', postId);
    return { ok: false, post_id: postId, step: 'create_container', error: 'no_container_id' };
  }
  await sb.from('ads_instagram_posts').update({ container_id: containerId, status: 'IN_PROGRESS' }).eq('id', postId);

  // Step 2: poll status_code
  let finished = false;
  for (let i = 0; i < POLL_MAX_TRIES; i++) {
    const s = await metaGet<{ status_code?: string; status?: string }>(
      `${containerId}?fields=status_code,status`,
      credsRes.creds.token
    );
    const code = String((s.ok ? (s.data as { status_code?: string }).status_code : '') || '');
    if (code === 'FINISHED') { finished = true; break; }
    if (code === 'ERROR' || code === 'EXPIRED') {
      await sb.from('ads_instagram_posts').update({
        status: code,
        status_error: JSON.stringify(s.ok ? s.data : s.error).slice(0, 2000),
      }).eq('id', postId);
      return { ok: false, post_id: postId, step: 'poll_status', error: code };
    }
    await new Promise(res => setTimeout(res, POLL_INTERVAL_MS));
  }
  if (!finished) {
    return { ok: false, post_id: postId, step: 'poll_status', error: 'timeout — container still processing; call poll_publish later' };
  }

  // Step 3: publish
  const pubRes = await metaPost<{ id: string }>(
    `${a.ig_business_id}/media_publish`,
    { creation_id: containerId },
    credsRes.creds.token
  );
  if (!pubRes.ok) {
    await sb.from('ads_instagram_posts').update({
      status: 'ERROR',
      status_error: JSON.stringify(pubRes.raw || pubRes.error).slice(0, 2000),
    }).eq('id', postId);
    return { ok: false, post_id: postId, step: 'publish', error: pubRes.error, raw: pubRes.raw };
  }
  const mediaId = String((pubRes.data as { id?: string }).id || '');

  // Fetch permalink + thumbnail
  let permalink: string | null = null;
  let thumbnail: string | null = null;
  if (mediaId) {
    const m = await metaGet<{ permalink?: string; thumbnail_url?: string }>(
      `${mediaId}?fields=permalink,thumbnail_url,media_type,media_product_type`,
      credsRes.creds.token
    );
    if (m.ok) {
      permalink = (m.data as { permalink?: string }).permalink || null;
      thumbnail = (m.data as { thumbnail_url?: string }).thumbnail_url || null;
    }
  }

  await sb.from('ads_instagram_posts').update({
    status: 'PUBLISHED',
    media_id: mediaId,
    permalink,
    thumbnail_url: thumbnail,
    published_at: new Date().toISOString(),
    status_error: null,
  }).eq('id', postId);

  // Optional FB Reels cross-post
  let fbBlock: { ok: boolean; video_id?: string; permalink?: string; error?: string } | null = null;
  if (input.alsoToFacebook && a.fb_page_id) {
    await sb.from('ads_instagram_posts').update({
      fb_status: 'PENDING', fb_status_error: null,
    }).eq('id', postId);
    const fbCaption = (input.fbCaption || caption).slice(0, 2200);
    const fb = await publishFbReel(a.fb_page_id, input.videoUrl, fbCaption, credsRes.creds.token);
    if (fb.ok) {
      await sb.from('ads_instagram_posts').update({
        fb_status: 'PUBLISHED',
        fb_page_post_id: fb.video_id || null,
        fb_permalink: fb.permalink || null,
        fb_published_at: new Date().toISOString(),
      }).eq('id', postId);
      fbBlock = { ok: true, video_id: fb.video_id, permalink: fb.permalink };
    } else {
      await sb.from('ads_instagram_posts').update({
        fb_status: 'ERROR',
        fb_status_error: JSON.stringify(fb.raw || fb.error).slice(0, 2000),
      }).eq('id', postId);
      fbBlock = { ok: false, error: fb.error };
    }
  }

  await recordAudit({
    module: 'ads',
    action: 'ig_reel_published',
    target_type: 'ig_post',
    target_id: String(postId),
    metadata: {
      media_id: mediaId,
      permalink,
      building_code: input.buildingCode || null,
      also_to_facebook: !!input.alsoToFacebook,
      fb_ok: fbBlock?.ok,
    },
  });

  return {
    ok: true,
    post_id: postId,
    media_id: mediaId || null,
    permalink,
    thumbnail_url: thumbnail,
    status: 'PUBLISHED',
    facebook: fbBlock,
  };
}

// Re-poll an in-flight IG container (UI "refresh" button).
export async function pollInstagramPostStatus(
  postDbId: number
): Promise<{ ok: boolean; status: string; permalink: string | null }> {
  const sb = supabaseAdmin();
  const { data: post } = await sb
    .from('ads_instagram_posts')
    .select('id, ads_account_id, container_id, status, caption, share_to_feed')
    .eq('id', postDbId)
    .maybeSingle();
  if (!post) return { ok: false, status: 'NOT_FOUND', permalink: null };
  const p = post as { id: number; ads_account_id: number; container_id: string | null; status: string };
  if (p.status === 'PUBLISHED') return { ok: true, status: 'PUBLISHED', permalink: null };
  if (!p.container_id) return { ok: false, status: p.status, permalink: null };

  const { data: acc } = await sb
    .from('ads_accounts')
    .select('ig_business_id')
    .eq('id', p.ads_account_id)
    .maybeSingle();
  const igBusinessId = (acc as { ig_business_id?: string } | null)?.ig_business_id;
  if (!igBusinessId) return { ok: false, status: 'NO_IG', permalink: null };

  const credsRes = await loadMetaCredentials();
  if (!credsRes.ok) return { ok: false, status: 'NO_TOKEN', permalink: null };

  const s = await metaGet<{ status_code?: string }>(
    `${p.container_id}?fields=status_code`,
    credsRes.creds.token
  );
  const code = String((s.ok ? (s.data as { status_code?: string }).status_code : '') || '');
  if (code === 'FINISHED') {
    // Publish now
    const pub = await metaPost<{ id: string }>(
      `${igBusinessId}/media_publish`,
      { creation_id: p.container_id },
      credsRes.creds.token
    );
    if (pub.ok) {
      const mediaId = String((pub.data as { id?: string }).id || '');
      const m = await metaGet<{ permalink?: string; thumbnail_url?: string }>(
        `${mediaId}?fields=permalink,thumbnail_url`,
        credsRes.creds.token
      );
      const permalink = m.ok ? (m.data as { permalink?: string }).permalink || null : null;
      const thumb = m.ok ? (m.data as { thumbnail_url?: string }).thumbnail_url || null : null;
      await sb.from('ads_instagram_posts').update({
        status: 'PUBLISHED',
        media_id: mediaId,
        permalink,
        thumbnail_url: thumb,
        published_at: new Date().toISOString(),
      }).eq('id', postDbId);
      return { ok: true, status: 'PUBLISHED', permalink };
    }
    await sb.from('ads_instagram_posts').update({
      status: 'ERROR', status_error: JSON.stringify(pub.raw || pub.error).slice(0, 2000),
    }).eq('id', postDbId);
    return { ok: false, status: 'ERROR', permalink: null };
  }
  if (code === 'ERROR' || code === 'EXPIRED') {
    await sb.from('ads_instagram_posts').update({
      status: code, status_error: JSON.stringify(s.ok ? s.data : s.error).slice(0, 2000),
    }).eq('id', postDbId);
    return { ok: false, status: code, permalink: null };
  }
  return { ok: true, status: 'IN_PROGRESS', permalink: null };
}

// FB Reels cross-post via resumable upload (3 phases).
async function publishFbReel(
  pageId: string,
  videoUrl: string,
  description: string,
  token: string
): Promise<{ ok: boolean; video_id?: string; permalink?: string; error?: string; raw?: unknown }> {
  // 1. start
  const start = await metaPost<{ video_id?: string; upload_url?: string }>(
    `${pageId}/video_reels`, { upload_phase: 'start' }, token
  );
  if (!start.ok) return { ok: false, error: 'fb_start_failed', raw: start.raw };
  const videoId = String((start.data as { video_id?: string }).video_id || '');
  const uploadUrl = String((start.data as { upload_url?: string }).upload_url || '');
  if (!videoId || !uploadUrl) return { ok: false, error: 'fb_start_no_ids', raw: start.raw };

  // 2. upload by file_url header
  try {
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: `OAuth ${token}`, file_url: videoUrl },
    });
    const uploadJson = (await uploadRes.json().catch(() => ({}))) as { success?: boolean };
    if (!uploadRes.ok || !uploadJson.success) {
      return { ok: false, error: 'fb_upload_failed', raw: uploadJson, video_id: videoId };
    }
  } catch (e) {
    return { ok: false, error: 'fb_upload_threw', raw: String(e), video_id: videoId };
  }

  // 3. finish
  const finish = await metaPost(
    `${pageId}/video_reels`,
    { upload_phase: 'finish', video_id: videoId, video_state: 'PUBLISHED', description },
    token
  );
  if (!finish.ok) return { ok: false, error: 'fb_finish_failed', raw: finish.raw, video_id: videoId };

  // 4. permalink (with light retry)
  let permalink: string | undefined;
  for (let i = 0; i < 5; i++) {
    const p = await metaGet<{ permalink_url?: string }>(
      `${videoId}?fields=permalink_url`, token
    );
    if (p.ok && (p.data as { permalink_url?: string }).permalink_url) {
      const url = String((p.data as { permalink_url?: string }).permalink_url);
      permalink = url.startsWith('http') ? url : `https://www.facebook.com${url}`;
      break;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  return { ok: true, video_id: videoId, permalink };
}
