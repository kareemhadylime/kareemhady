import 'server-only';

// Server-side TikTok oEmbed lookup. Public endpoint, no auth, no
// rate-limit headers — but we still wrap in a short timeout so a
// slow/failed call can't stall the add-reel server action.
//
// Reference: https://developers.tiktok.com/doc/embed-videos
// Endpoint: https://www.tiktok.com/oembed?url={canonical_video_url}

export type TikTokOEmbedData = {
  title: string | null;        // the caption
  author_name: string | null;  // creator display name (e.g. "Beit Hady")
  author_url: string | null;   // creator profile URL
  thumbnail_url: string | null;
};

const EMPTY: TikTokOEmbedData = {
  title: null,
  author_name: null,
  author_url: null,
  thumbnail_url: null,
};

export async function fetchTikTokOEmbed(
  canonicalUrl: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<TikTokOEmbedData> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const f = options.fetchImpl ?? fetch;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`;
    const res = await f(endpoint, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Beithady-Dashboard/1.0 (+limeinc.cc)' },
    });
    if (!res.ok) return EMPTY;
    const raw = (await res.json()) as Record<string, unknown>;
    return {
      title: typeof raw.title === 'string' ? raw.title : null,
      author_name: typeof raw.author_name === 'string' ? raw.author_name : null,
      author_url: typeof raw.author_url === 'string' ? raw.author_url : null,
      thumbnail_url: typeof raw.thumbnail_url === 'string' ? raw.thumbnail_url : null,
    };
  } catch {
    return EMPTY;
  } finally {
    clearTimeout(timer);
  }
}
