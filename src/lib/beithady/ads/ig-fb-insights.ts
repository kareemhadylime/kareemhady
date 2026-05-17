import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { loadMetaCredentials, metaGet } from './meta-client';

// Organic insights fetcher for IG + FB posts published from this dashboard.
// Backed by the Meta Graph API "insights" edge. Results are cached on the
// ads_instagram_posts row (ig_insights / fb_insights JSONB) so the insights
// page doesn't re-hit Meta on every render — only when the operator explicitly
// refreshes a row or when the cache is older than CACHE_TTL_MS.
//
// Metric naming note: IG metric names have shifted over the years. The current
// public set used here:
//   - reach, likes, comments, saved, shares — all media types
//   - views — videos/reels only (replaces video_views in v22+)
// Older metric `impressions` is being deprecated and returns "metric_does_not_exist"
// on some media types now, so we deliberately omit it.

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export type PostMetrics = {
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
};

const EMPTY_METRICS: PostMetrics = {
  views: null, reach: null, likes: null, comments: null, saved: null, shares: null,
};

// Parse Meta's insights response shape: { data: [{ name, values: [{ value }] }] }
function flattenInsightsResponse(raw: unknown): PostMetrics {
  const out: PostMetrics = { ...EMPTY_METRICS };
  const data = (raw as { data?: Array<{ name?: string; values?: Array<{ value?: number }> }> } | null)?.data;
  if (!Array.isArray(data)) return out;
  for (const row of data) {
    const name = (row.name || '').toLowerCase();
    const value = row.values?.[0]?.value;
    if (typeof value !== 'number') continue;
    if (name === 'views' || name === 'video_views' || name === 'total_video_views') out.views = value;
    else if (name === 'reach' || name === 'post_impressions_unique') out.reach = value;
    else if (name === 'likes' || name === 'post_reactions_like_total') out.likes = value;
    else if (name === 'comments' || name === 'post_comments') out.comments = value;
    else if (name === 'saved') out.saved = value;
    else if (name === 'shares' || name === 'post_shares') out.shares = value;
  }
  return out;
}

export async function fetchIgPostInsights(
  mediaId: string,
  isVideo: boolean,
): Promise<{ ok: true; metrics: PostMetrics; raw: unknown } | { ok: false; error: string; raw?: unknown }> {
  const credsRes = await loadMetaCredentials();
  if (!credsRes.ok) return { ok: false, error: credsRes.error };
  // Different metric set for VIDEO/REELS vs IMAGE/CAROUSEL
  const metrics = isVideo
    ? 'views,reach,likes,comments,shares,saved'
    : 'reach,likes,comments,shares,saved';
  const r = await metaGet(
    `${mediaId}/insights?metric=${encodeURIComponent(metrics)}`,
    credsRes.creds.token,
  );
  if (!r.ok) return { ok: false, error: r.error, raw: r.raw };
  return { ok: true, metrics: flattenInsightsResponse(r.data), raw: r.data };
}

export async function fetchFbPostInsights(
  fbPostId: string,
  isVideo: boolean,
): Promise<{ ok: true; metrics: PostMetrics; raw: unknown } | { ok: false; error: string; raw?: unknown }> {
  const credsRes = await loadMetaCredentials();
  if (!credsRes.ok) return { ok: false, error: credsRes.error };
  // FB metric names differ from IG
  const baseMetrics = ['post_impressions_unique', 'post_reactions_like_total', 'post_shares'];
  const videoMetrics = isVideo ? ['total_video_views'] : [];
  const metrics = [...baseMetrics, ...videoMetrics].join(',');
  const r = await metaGet(
    `${fbPostId}/insights?metric=${encodeURIComponent(metrics)}`,
    credsRes.creds.token,
  );
  if (!r.ok) return { ok: false, error: r.error, raw: r.raw };
  return { ok: true, metrics: flattenInsightsResponse(r.data), raw: r.data };
}

// Bulk insights refresh — used by the insights page on every load. Iterates
// over PUBLISHED rows, skips those still warm (< CACHE_TTL_MS) unless `force`,
// and persists results back to the DB.
export type PostRow = {
  id: number;
  media_id: string | null;
  post_type: 'reel' | 'image' | 'carousel' | 'video';
  fb_page_post_id: string | null;
  ig_insights: unknown | null;
  ig_insights_fetched_at: string | null;
  fb_insights: unknown | null;
  fb_insights_fetched_at: string | null;
};

export async function refreshInsightsForPosts(
  rows: PostRow[],
  opts: { force?: boolean } = {},
): Promise<Map<number, { ig: PostMetrics; fb: PostMetrics | null }>> {
  const sb = supabaseAdmin();
  const out = new Map<number, { ig: PostMetrics; fb: PostMetrics | null }>();
  const now = Date.now();

  for (const r of rows) {
    let ig = r.ig_insights ? (r.ig_insights as { metrics?: PostMetrics }).metrics : null;
    let fb = r.fb_insights ? (r.fb_insights as { metrics?: PostMetrics }).metrics : null;

    const igStale = !r.ig_insights_fetched_at
      || (now - new Date(r.ig_insights_fetched_at).getTime()) > CACHE_TTL_MS;
    const fbStale = r.fb_page_post_id && (
      !r.fb_insights_fetched_at
      || (now - new Date(r.fb_insights_fetched_at).getTime()) > CACHE_TTL_MS
    );

    if (r.media_id && (opts.force || igStale)) {
      const isVideo = r.post_type === 'video' || r.post_type === 'reel';
      const res = await fetchIgPostInsights(r.media_id, isVideo);
      if (res.ok) {
        ig = res.metrics;
        await sb.from('ads_instagram_posts').update({
          ig_insights: { metrics: res.metrics, raw: res.raw },
          ig_insights_fetched_at: new Date().toISOString(),
        }).eq('id', r.id);
      }
    }
    if (r.fb_page_post_id && (opts.force || fbStale)) {
      const isVideo = r.post_type === 'video' || r.post_type === 'reel';
      const res = await fetchFbPostInsights(r.fb_page_post_id, isVideo);
      if (res.ok) {
        fb = res.metrics;
        await sb.from('ads_instagram_posts').update({
          fb_insights: { metrics: res.metrics, raw: res.raw },
          fb_insights_fetched_at: new Date().toISOString(),
        }).eq('id', r.id);
      }
    }

    out.set(r.id, { ig: ig || EMPTY_METRICS, fb: fb || null });
  }
  return out;
}
