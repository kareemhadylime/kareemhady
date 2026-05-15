// Parse a user-pasted TikTok URL into the pieces we need to embed it.
//
// We accept the canonical web URL (tiktok.com/@user/video/{id}) only.
// Short-link variants (vm.tiktok.com/XXX, tiktok.com/t/XXX) require a
// follow-redirect HEAD fetch to resolve and are rejected with a clear
// message — the admin can paste the long URL instead.

export type TikTokUrlParseResult =
  | {
      ok: true;
      videoId: string;
      username: string; // includes leading "@"
      canonicalUrl: string;
    }
  | {
      ok: false;
      reason: 'empty' | 'invalid_url' | 'not_tiktok' | 'short_url' | 'unknown_format';
      message: string;
    };

export function parseTikTokUrl(input: string): TikTokUrlParseResult {
  const trimmed = (input ?? '').trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty', message: 'Paste a TikTok URL.' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: 'invalid_url',
      message: 'That doesn’t look like a URL. Make sure it starts with https://',
    };
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
    return {
      ok: false,
      reason: 'short_url',
      message:
        'TikTok short links (vm.tiktok.com / vt.tiktok.com) aren’t supported. Open the reel in the browser and paste the full URL instead.',
    };
  }

  if (host !== 'tiktok.com' && host !== 'm.tiktok.com') {
    return {
      ok: false,
      reason: 'not_tiktok',
      message: 'This isn’t a TikTok URL.',
    };
  }

  if (url.pathname.startsWith('/t/')) {
    return {
      ok: false,
      reason: 'short_url',
      message:
        'TikTok share links (/t/...) aren’t supported. Open the reel and paste the full /@user/video/... URL instead.',
    };
  }

  const m = url.pathname.match(/^\/(@[^/]+)\/video\/(\d{10,25})\/?$/);
  if (!m) {
    return {
      ok: false,
      reason: 'unknown_format',
      message:
        'Couldn’t find a video id. Expected format: https://www.tiktok.com/@username/video/1234567890123456789',
    };
  }

  const username = m[1];
  const videoId = m[2];
  return {
    ok: true,
    videoId,
    username,
    canonicalUrl: `https://www.tiktok.com/${username}/video/${videoId}`,
  };
}
