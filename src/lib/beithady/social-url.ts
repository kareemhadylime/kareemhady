import { parseTikTokUrl, type TikTokUrlParseResult } from './tiktok-url';
import { parseInstagramUrl, type InstagramUrlParseResult } from './instagram-url';

// Normalized dispatcher used by the marketing-reels insert flow.
// Detects platform by hostname and routes to the right parser. The
// success shape is normalized so the caller doesn't need to know
// which platform the URL was for.

export type SocialUrlParseResult =
  | {
      ok: true;
      platform: 'tiktok';
      externalId: string;     // TikTok video_id
      canonicalUrl: string;
      username: string;        // includes leading "@"
    }
  | {
      ok: true;
      platform: 'instagram';
      externalId: string;     // IG shortcode
      canonicalUrl: string;
      mediaKind: 'reel' | 'post' | 'tv';
    }
  | {
      ok: false;
      reason: string;
      message: string;
    };

export function parseSocialUrl(input: string): SocialUrlParseResult {
  const trimmed = (input ?? '').trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty', message: 'Paste a TikTok or Instagram URL.' };
  }

  let host = '';
  try {
    host = new URL(trimmed).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return {
      ok: false,
      reason: 'invalid_url',
      message: 'That doesn’t look like a URL. Make sure it starts with https://',
    };
  }

  if (host.endsWith('tiktok.com')) {
    const r: TikTokUrlParseResult = parseTikTokUrl(trimmed);
    if (!r.ok) return { ok: false, reason: r.reason, message: r.message };
    return {
      ok: true,
      platform: 'tiktok',
      externalId: r.videoId,
      canonicalUrl: r.canonicalUrl,
      username: r.username,
    };
  }

  if (host.endsWith('instagram.com')) {
    const r: InstagramUrlParseResult = parseInstagramUrl(trimmed);
    if (!r.ok) return { ok: false, reason: r.reason, message: r.message };
    return {
      ok: true,
      platform: 'instagram',
      externalId: r.shortcode,
      canonicalUrl: r.canonicalUrl,
      mediaKind: r.mediaKind,
    };
  }

  return {
    ok: false,
    reason: 'unsupported_platform',
    message: 'Only TikTok and Instagram URLs are supported.',
  };
}
