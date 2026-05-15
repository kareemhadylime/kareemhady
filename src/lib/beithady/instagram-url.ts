// Parse a user-pasted Instagram URL into the pieces we need to embed it.
//
// Supports the three current Instagram media kinds: /reel/, /p/, /tv/.
// Short URLs (instagram.com/share/...) and login-required URLs aren't
// supported in v1 — the operator can open the post in a browser and
// paste the canonical permalink.

export type InstagramUrlParseResult =
  | {
      ok: true;
      shortcode: string;
      mediaKind: 'reel' | 'post' | 'tv';
      canonicalUrl: string; // the permalink to embed (no utm_source — added when rendering)
    }
  | {
      ok: false;
      reason: 'empty' | 'invalid_url' | 'not_instagram' | 'unknown_format';
      message: string;
    };

const SHORTCODE_RE = /^[A-Za-z0-9_-]{5,20}$/;

export function parseInstagramUrl(input: string): InstagramUrlParseResult {
  const trimmed = (input ?? '').trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty', message: 'Paste an Instagram URL.' };
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
  if (host !== 'instagram.com' && host !== 'm.instagram.com') {
    return { ok: false, reason: 'not_instagram', message: 'This isn’t an Instagram URL.' };
  }

  // Strip trailing slash, split path segments
  const segments = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);

  // Match patterns:
  //   /reel/{shortcode}
  //   /p/{shortcode}
  //   /tv/{shortcode}
  //   /{username}/reel/{shortcode}   (newer URL form)
  //   /{username}/p/{shortcode}
  let kind: 'reel' | 'post' | 'tv' | null = null;
  let shortcode: string | null = null;

  const kindIdx = segments.findIndex((s) => s === 'reel' || s === 'p' || s === 'tv');
  if (kindIdx >= 0 && segments[kindIdx + 1]) {
    const k = segments[kindIdx];
    kind = k === 'reel' ? 'reel' : k === 'tv' ? 'tv' : 'post';
    shortcode = segments[kindIdx + 1];
  }

  if (!kind || !shortcode || !SHORTCODE_RE.test(shortcode)) {
    return {
      ok: false,
      reason: 'unknown_format',
      message:
        'Couldn’t find an Instagram post shortcode. Expected /reel/{code}, /p/{code}, or /tv/{code}.',
    };
  }

  const kindPath = kind === 'post' ? 'p' : kind;
  return {
    ok: true,
    shortcode,
    mediaKind: kind,
    canonicalUrl: `https://www.instagram.com/${kindPath}/${shortcode}/`,
  };
}
