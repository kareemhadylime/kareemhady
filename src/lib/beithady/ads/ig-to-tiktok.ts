import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { listIgMedia, listIgStories, type IgMediaItem, type IgStoryItem } from './meta-client';

// Unified picker entry — Reels and Stories share the same shape from the form's
// perspective: clickable thumbnail → mirror video → pre-fill caption + URL.
// `kind` lets the UI tag stories visually so the operator knows they're posting
// a 24h-lifecycle creative that already expired on IG.
export type IgPickerItem = {
  id: string;
  kind: 'reel' | 'story';
  media_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  permalink: string | null;
  timestamp: string;
};

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

// Returns currently-live IG Stories (24h window). Only video stories — TikTok
// doesn't accept static images via Content Posting API.
export async function listIgStoriesForTikTok(limit = 30): Promise<IgStoryItem[]> {
  const r = await listIgStories(limit).catch(() => null);
  if (!r || !r.ok) return [];
  return r.stories.filter(s => s.media_type === 'VIDEO');
}

// Combined picker source: Reels first (longer shelf life), then live Stories.
// `kind` is a UI hint so the operator can tell at a glance which is which.
export async function listIgPickerItems(limit = 30): Promise<IgPickerItem[]> {
  const [reels, stories] = await Promise.all([
    listIgReelsForTikTok(limit),
    listIgStoriesForTikTok(limit),
  ]);
  return [
    ...reels.map((r): IgPickerItem => ({
      id: r.id,
      kind: 'reel',
      media_url: r.media_url,
      thumbnail_url: r.thumbnail_url,
      caption: r.caption,
      permalink: r.permalink,
      timestamp: r.timestamp,
    })),
    ...stories.map((s): IgPickerItem => ({
      id: s.id,
      kind: 'story',
      media_url: s.media_url,
      thumbnail_url: s.thumbnail_url,
      caption: null, // Stories rarely carry captions
      permalink: s.permalink,
      timestamp: s.timestamp,
    })),
  ];
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
  return buildTikTokDefaultsFromPickerItem({
    id: item.id,
    kind: 'reel',
    media_url: item.media_url,
    thumbnail_url: item.thumbnail_url,
    caption: item.caption,
    permalink: item.permalink,
    timestamp: item.timestamp,
  });
}

// Generic builder used by both Reel and Story sources. Mirrors the video then
// extracts hashtags from the caption (Reels) — stories typically have none.
export async function buildTikTokDefaultsFromPickerItem(item: IgPickerItem): Promise<IgReelDefaults> {
  if (!item.media_url) {
    return { ...EMPTY, found: true, caption: item.caption || '', thumbnailUrl: item.thumbnail_url, permalink: item.permalink, notes: [`No video URL on this IG ${item.kind} — pick a different one.`] };
  }
  const mirroredUrl = await mirrorIgVideo(item.media_url, item.id);
  const { stripped, tags } = extractHashtags(item.caption || '');
  const notes: string[] = [];
  if (mirroredUrl === item.media_url) {
    notes.push('Could not mirror to Supabase — using raw IG CDN URL; TikTok may fail to fetch it.');
  }
  if (item.kind === 'story') {
    notes.push('Sourced from a live IG Story — mirrored to Supabase so the video survives the 24h IG expiry.');
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
