import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { listIgMedia, type IgMediaItem } from './meta-client';

// IG Reels → TikTok video sourcing.
//
// Why we mirror: IG CDN URLs (scontent-*.cdninstagram.com) are short-lived
// signed URLs that block hotlinking by host. TikTok's Content Posting API
// pulls the video server-side and frequently fails on these URLs. Mirroring
// to the Supabase public bucket gives a stable URL TikTok can fetch.
//
// The mirror is idempotent on the IG media id — re-clicking the same Reel
// does an upsert, not a re-download every time (Supabase storage upsert).

export type IgReelDefaults = {
  found: boolean;
  videoUrl: string;
  caption: string;
  hashtags: string[];
  thumbnailUrl: string | null;
  permalink: string | null;
  notes: string[];
};

const EMPTY: IgReelDefaults = {
  found: false,
  videoUrl: '',
  caption: '',
  hashtags: [],
  thumbnailUrl: null,
  permalink: null,
  notes: [],
};

// Filter to media that TikTok can actually publish (Reels / Videos).
// Photos and carousels get excluded — the picker only surfaces what's postable.
export function isPostableToTikTok(item: IgMediaItem): boolean {
  return item.media_type === 'VIDEO' || item.media_type === 'REELS';
}

// Returns Reels/Videos from the connected IG account (most recent first).
export async function listIgReelsForTikTok(limit = 30): Promise<IgMediaItem[]> {
  const r = await listIgMedia('', limit).catch(() => null);
  if (!r || !r.ok) return [];
  return r.media.filter(isPostableToTikTok);
}

// Extract #hashtags from caption — TikTok prefers them in a separate field
// rather than inline, so we pull them out for the form.
function extractHashtags(caption: string): { stripped: string; tags: string[] } {
  const tags: string[] = [];
  const stripped = caption
    .replace(/#([A-Za-z0-9_]+)/g, (_m, t: string) => {
      tags.push(t);
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { stripped, tags };
}

// Mirror an IG video to Supabase public storage. Returns the public URL.
// Falls back to the original URL on any failure so the form still has something
// to render — TikTok will then fail loudly on publish rather than us silently
// pre-filling an empty field.
async function mirrorIgVideo(url: string, mediaId: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return url;
    const buf = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'video/mp4';
    const ext = contentType.includes('quicktime') ? 'mov' : 'mp4';
    const sb = supabaseAdmin();
    const path = `ig-tiktok/${mediaId}.${ext}`;
    const { error } = await sb.storage
      .from('beithady-gallery-public')
      .upload(path, Buffer.from(buf), { contentType, upsert: true });
    if (error) return url;
    const { data: { publicUrl } } = sb.storage.from('beithady-gallery-public').getPublicUrl(path);
    return publicUrl;
  } catch {
    return url;
  }
}

export async function buildTikTokDefaultsFromIgMediaItem(item: IgMediaItem): Promise<IgReelDefaults> {
  if (!item.media_url) {
    return { ...EMPTY, found: true, caption: item.caption || '', thumbnailUrl: item.thumbnail_url, permalink: item.permalink, notes: ['No video URL on this IG post — pick a different Reel.'] };
  }
  const mirroredUrl = await mirrorIgVideo(item.media_url, item.id);
  const { stripped, tags } = extractHashtags(item.caption || '');
  const notes: string[] = [];
  if (mirroredUrl === item.media_url) {
    notes.push('Could not mirror to Supabase — using raw IG CDN URL; TikTok may fail to fetch it.');
  }
  return {
    found: true,
    videoUrl: mirroredUrl,
    caption: stripped,
    hashtags: tags,
    thumbnailUrl: item.thumbnail_url,
    permalink: item.permalink,
    notes,
  };
}
