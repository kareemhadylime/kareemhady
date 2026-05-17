import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// YouTube video → TikTok publish source.
//
// Surfaces rows from ads_youtube_videos that have a usable source_url. TikTok's
// Content Posting API pulls the video by URL, so we need rows that:
//   - status = 'published' (file was successfully sent to YouTube and is live)
//     OR have a non-null source_url (operator uploaded it but YouTube upload
//     may still be in progress — the source_url is what TikTok needs anyway)
//   - source_url not null and starts with https://
//
// Each item is shaped for the picker UI (thumbnail + title + duration label)
// and the publish form (videoUrl + caption hints).

export type YtPickerItem = {
  id: number;                         // ads_youtube_videos.id (the DB pk)
  youtube_video_id: string | null;    // YT-side id (once published)
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  source_url: string;                 // public HTTPS mp4 URL TikTok will fetch
  duration_seconds: number | null;
  is_shorts: boolean;
  building_code: string | null;
  status: string;
};

export type YtTikTokDefaults = {
  found: boolean;
  videoUrl: string;
  caption: string;
  hashtags: string[];
  thumbnailUrl: string | null;
  title: string;
  notes: string[];
};

const EMPTY: YtTikTokDefaults = {
  found: false,
  videoUrl: '',
  caption: '',
  hashtags: [],
  thumbnailUrl: null,
  title: '',
  notes: [],
};

// Pulls down the most recent N YT videos that have a TikTok-postable source.
// Sorted: published first (proven uploads), then by created_at desc.
export async function listYouTubePickerItems(limit = 30): Promise<YtPickerItem[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('ads_youtube_videos')
    .select('id, youtube_video_id, title, description, thumbnail_url, source_url, duration_seconds, is_shorts, building_code, status')
    .not('source_url', 'is', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  const rows = (data as YtPickerItem[] | null) || [];
  return rows.filter(r => typeof r.source_url === 'string' && r.source_url.startsWith('https://'));
}

// Extract #hashtags out of caption so the form can fill them in the hashtags
// field (TikTok prefers them in dedicated metadata over inline in caption).
function extractHashtags(text: string): { stripped: string; tags: string[] } {
  const tags: string[] = [];
  const stripped = text
    .replace(/#([A-Za-z0-9_]+)/g, (_m, t: string) => {
      tags.push(t);
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { stripped, tags };
}

// Lookup a YouTube video either by ads_youtube_videos.id (preferred, numeric)
// or by youtube_video_id (string, fallback from cross-post picker query).
export async function buildTikTokDefaultsFromYouTube(opts: {
  adsYtVideoId?: number | null;
  youtubeVideoId?: string | null;
}): Promise<YtTikTokDefaults> {
  const sb = supabaseAdmin();
  let row: YtPickerItem | null = null;
  if (opts.adsYtVideoId != null && Number.isFinite(opts.adsYtVideoId)) {
    const { data } = await sb
      .from('ads_youtube_videos')
      .select('id, youtube_video_id, title, description, thumbnail_url, source_url, duration_seconds, is_shorts, building_code, status')
      .eq('id', opts.adsYtVideoId)
      .maybeSingle();
    row = data as YtPickerItem | null;
  }
  if (!row && opts.youtubeVideoId) {
    const { data } = await sb
      .from('ads_youtube_videos')
      .select('id, youtube_video_id, title, description, thumbnail_url, source_url, duration_seconds, is_shorts, building_code, status')
      .eq('youtube_video_id', opts.youtubeVideoId)
      .maybeSingle();
    row = data as YtPickerItem | null;
  }
  if (!row) {
    return { ...EMPTY, found: false, notes: ['YouTube video not found in ads_youtube_videos — was it ever uploaded through the dashboard?'] };
  }
  if (!row.source_url || !row.source_url.startsWith('https://')) {
    return { ...EMPTY, found: true, title: row.title, thumbnailUrl: row.thumbnail_url, notes: [`Source URL missing for "${row.title}" — TikTok needs a public HTTPS mp4 to pull. Re-upload via the YouTube uploader.`] };
  }
  const captionSeed = [row.title, row.description].filter(Boolean).join('\n\n').trim();
  const { stripped, tags } = extractHashtags(captionSeed);
  return {
    found: true,
    videoUrl: row.source_url,
    caption: stripped,
    hashtags: tags,
    thumbnailUrl: row.thumbnail_url,
    title: row.title,
    notes: row.status !== 'published'
      ? [`YouTube status: ${row.status}. Source URL is still usable but YT publish may be in progress.`]
      : [],
  };
}
