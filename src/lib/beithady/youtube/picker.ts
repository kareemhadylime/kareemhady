// src/lib/beithady/youtube/picker.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { getYouTubeAccessToken } from './youtube-client';
import { TargetPlatform } from './picker-errors';

export type LocalRow = {
  id: number;                          // ads_youtube_videos.id
  youtube_video_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  is_shorts: boolean;
  privacy_status: 'private' | 'unlisted' | 'public';
  building_code: string | null;
  source_url: string;                  // signed at picker load time
  file_size_bytes: number;
  view_count: number;
  like_count: number;
  comment_count: number;
  stats_synced_at: string | null;
  published_at: string | null;
};

export type YouTubeApiRow = {
  youtube_video_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  privacy_status: 'private' | 'unlisted' | 'public' | 'unknown';
};

export type PickerItem = {
  youtube_video_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  watch_url: string;
  duration_seconds: number | null;
  is_shorts: boolean;
  privacy_status: string;
  building_code: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  stats_synced_at: string | null;
  in_local_db: boolean;
  ads_youtube_video_id: number | null;
  source_url: string | null;
  published_at: string | null;
  actions: Record<TargetPlatform, { available: boolean; reason?: string }>;
  already_cross_posted: Record<TargetPlatform, { count: number; last_posted_at: string | null }>;
};

export type PickerFilters = {
  building_code?: string | null;
  format?: 'shorts' | 'longform' | 'all';
  search?: string;
  sort?: 'recent' | 'views' | 'likes';
};

// Pure: compute is_shorts from duration + dimensions (where known).
// Vertical-or-unknown aspect ratio + duration <=60s = Shorts.
export function computeIsShorts(
  duration_seconds: number | null,
  width: number | null,
  height: number | null,
): boolean {
  if (duration_seconds == null || duration_seconds > 60) return false;
  if (width != null && height != null) {
    return height >= width;     // vertical or square
  }
  return true;                  // unknown aspect, short enough -> assume Shorts
}

// Pure: compute action availability for one merged row.
export function computeActions(
  row: { is_shorts: boolean; in_local_db: boolean }
): PickerItem['actions'] {
  const longformReason = 'Long-form video — IG Reels and organic TikTok require vertical <=60s.';
  const ytOnlyReason = 'YouTube-only video — upload via app first to enable this action.';

  const result: PickerItem['actions'] = {
    instagram_reel: { available: false },
    tiktok_organic: { available: false },
    tiktok_paid: { available: false },
    meta_video_ad: { available: false },
    google_pmax: { available: false },
  };

  // Google PMax always works (uses youtube_video_id reference).
  result.google_pmax = { available: true };

  if (!row.in_local_db) {
    // YT-only: only PMax works.
    for (const p of ['instagram_reel', 'tiktok_organic', 'tiktok_paid', 'meta_video_ad'] as const) {
      result[p] = { available: false, reason: ytOnlyReason };
    }
    return result;
  }

  // Local DB: paid actions don't care about format.
  result.tiktok_paid = { available: true };
  result.meta_video_ad = { available: true };

  // Format-sensitive: IG Reel + TikTok organic require Shorts.
  if (row.is_shorts) {
    result.instagram_reel = { available: true };
    result.tiktok_organic = { available: true };
  } else {
    result.instagram_reel = { available: false, reason: longformReason };
    result.tiktok_organic = { available: false, reason: longformReason };
  }

  return result;
}

// Pure: merge local + API rows, dedupe by youtube_video_id (local wins).
export function dedupeByVideoId(local: LocalRow[], api: YouTubeApiRow[]): PickerItem[] {
  const out: PickerItem[] = [];
  const seen = new Set<string>();
  const emptyXposts: PickerItem['already_cross_posted'] = {
    instagram_reel: { count: 0, last_posted_at: null },
    tiktok_organic: { count: 0, last_posted_at: null },
    tiktok_paid: { count: 0, last_posted_at: null },
    meta_video_ad: { count: 0, last_posted_at: null },
    google_pmax: { count: 0, last_posted_at: null },
  };

  for (const l of local) {
    seen.add(l.youtube_video_id);
    const item: PickerItem = {
      youtube_video_id: l.youtube_video_id,
      title: l.title,
      description: l.description,
      thumbnail_url: l.thumbnail_url,
      watch_url: `https://youtu.be/${l.youtube_video_id}`,
      duration_seconds: l.duration_seconds,
      is_shorts: l.is_shorts,
      privacy_status: l.privacy_status,
      building_code: l.building_code,
      view_count: l.view_count,
      like_count: l.like_count,
      comment_count: l.comment_count,
      stats_synced_at: l.stats_synced_at,
      in_local_db: true,
      ads_youtube_video_id: l.id,
      source_url: l.source_url,
      published_at: l.published_at,
      actions: computeActions({ is_shorts: l.is_shorts, in_local_db: true }),
      already_cross_posted: { ...emptyXposts },
    };
    out.push(item);
  }

  for (const a of api) {
    if (seen.has(a.youtube_video_id)) continue;
    const is_shorts = computeIsShorts(a.duration_seconds, null, null);
    out.push({
      youtube_video_id: a.youtube_video_id,
      title: a.title,
      description: a.description,
      thumbnail_url: a.thumbnail_url,
      watch_url: `https://youtu.be/${a.youtube_video_id}`,
      duration_seconds: a.duration_seconds,
      is_shorts,
      privacy_status: a.privacy_status,
      building_code: null,
      view_count: 0,
      like_count: 0,
      comment_count: 0,
      stats_synced_at: null,
      in_local_db: false,
      ads_youtube_video_id: null,
      source_url: null,
      published_at: a.published_at,
      actions: computeActions({ is_shorts, in_local_db: false }),
      already_cross_posted: { ...emptyXposts },
    });
  }

  return out;
}

// In-memory 5min cache keyed by accountId.
type CacheEntry = { fetched_at: number; items: PickerItem[] };
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<number, CacheEntry>();

async function loadLocalRows(accountId: number): Promise<LocalRow[]> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('ads_youtube_videos')
    .select('id, youtube_video_id, title, description, thumbnail_url, duration_seconds, is_shorts, privacy_status, building_code, source_url, file_size_bytes, view_count, like_count, comment_count, stats_synced_at, published_at')
    .eq('account_id', accountId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(500);
  const rows: LocalRow[] = [];
  for (const r of (data as Array<Record<string, unknown>> | null) ?? []) {
    rows.push({
      id: Number(r.id),
      youtube_video_id: String(r.youtube_video_id),
      title: String(r.title),
      description: (r.description as string | null) ?? null,
      thumbnail_url: (r.thumbnail_url as string | null) ?? null,
      duration_seconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
      is_shorts: Boolean(r.is_shorts),
      privacy_status: r.privacy_status as 'private' | 'unlisted' | 'public',
      building_code: (r.building_code as string | null) ?? null,
      source_url: (r.source_url as string | null) ?? '',
      file_size_bytes: Number(r.file_size_bytes),
      view_count: Number(r.view_count ?? 0),
      like_count: Number(r.like_count ?? 0),
      comment_count: Number(r.comment_count ?? 0),
      stats_synced_at: (r.stats_synced_at as string | null) ?? null,
      published_at: (r.published_at as string | null) ?? null,
    });
  }
  return rows;
}

async function loadYouTubeApiRows(accountId: number): Promise<YouTubeApiRow[]> {
  const sb = supabaseAdmin();
  const { data: account } = await sb.from('ads_accounts')
    .select('youtube_uploads_playlist_id')
    .eq('id', accountId).single();
  const uploadsPlaylistId = (account as { youtube_uploads_playlist_id?: string } | null)?.youtube_uploads_playlist_id;
  if (!uploadsPlaylistId) return [];

  const accessToken = await getYouTubeAccessToken(accountId);
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(uploadsPlaylistId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return [];
  const json = await res.json() as {
    items?: Array<{
      contentDetails?: { videoId?: string; videoPublishedAt?: string };
      snippet?: { title?: string; description?: string; thumbnails?: { high?: { url?: string } } };
    }>;
  };
  const out: YouTubeApiRow[] = [];
  for (const item of json.items ?? []) {
    const videoId = item.contentDetails?.videoId;
    if (!videoId) continue;
    out.push({
      youtube_video_id: videoId,
      title: item.snippet?.title ?? '(untitled)',
      description: item.snippet?.description ?? null,
      thumbnail_url: item.snippet?.thumbnails?.high?.url ?? null,
      duration_seconds: null,  // playlistItems doesn't give duration; videos.list enrichment deferred to V1.3.
      published_at: item.contentDetails?.videoPublishedAt ?? null,
      privacy_status: 'unknown',
    });
  }
  return out;
}

async function loadAlreadyCrossPosted(youtubeVideoIds: string[]): Promise<Map<string, PickerItem['already_cross_posted']>> {
  if (youtubeVideoIds.length === 0) return new Map();
  const sb = supabaseAdmin();
  const { data } = await sb.from('ads_youtube_cross_posts')
    .select('youtube_video_id, target_platform, created_at')
    .in('youtube_video_id', youtubeVideoIds)
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  const empty: PickerItem['already_cross_posted'] = {
    instagram_reel: { count: 0, last_posted_at: null },
    tiktok_organic: { count: 0, last_posted_at: null },
    tiktok_paid: { count: 0, last_posted_at: null },
    meta_video_ad: { count: 0, last_posted_at: null },
    google_pmax: { count: 0, last_posted_at: null },
  };

  const map = new Map<string, PickerItem['already_cross_posted']>();
  for (const r of (data as Array<{ youtube_video_id: string; target_platform: TargetPlatform; created_at: string }> | null) ?? []) {
    let bucket = map.get(r.youtube_video_id);
    if (!bucket) { bucket = JSON.parse(JSON.stringify(empty)); map.set(r.youtube_video_id, bucket!); }
    const entry = bucket![r.target_platform];
    entry.count += 1;
    if (!entry.last_posted_at) entry.last_posted_at = r.created_at;
  }
  return map;
}

export async function listPickerVideos(
  accountId: number,
  filters?: PickerFilters,
): Promise<PickerItem[]> {
  // 1. Cache hit?
  const cached = cache.get(accountId);
  let items: PickerItem[];
  if (cached && Date.now() - cached.fetched_at < CACHE_TTL_MS) {
    items = cached.items;
  } else {
    const [local, api] = await Promise.all([
      loadLocalRows(accountId),
      loadYouTubeApiRows(accountId).catch(() => []),
    ]);
    items = dedupeByVideoId(local, api);
    const xpostMap = await loadAlreadyCrossPosted(items.map(i => i.youtube_video_id));
    for (const it of items) {
      const xp = xpostMap.get(it.youtube_video_id);
      if (xp) it.already_cross_posted = xp;
    }
    cache.set(accountId, { fetched_at: Date.now(), items });
  }

  // 2. Apply filters
  let result = items;
  if (filters?.building_code) result = result.filter(i => i.building_code === filters.building_code);
  if (filters?.format === 'shorts') result = result.filter(i => i.is_shorts);
  if (filters?.format === 'longform') result = result.filter(i => !i.is_shorts);
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(i => i.title.toLowerCase().includes(q));
  }

  // 3. Sort
  const sort = filters?.sort ?? 'recent';
  if (sort === 'views') result = [...result].sort((a, b) => b.view_count - a.view_count);
  else if (sort === 'likes') result = [...result].sort((a, b) => b.like_count - a.like_count);
  else result = [...result].sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));

  return result;
}
