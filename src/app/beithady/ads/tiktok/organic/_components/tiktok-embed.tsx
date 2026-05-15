// Renders TikTok's official blockquote embed markup. The actual iframe
// is hydrated client-side by tiktok.com/embed.js, which the page loads
// once via next/script. Server-renderable — no client directive needed.
//
// Thumbnail poster: shown inside the <section> fallback until embed.js
// swaps the blockquote for an iframe. Eliminates the "Loading TikTok…"
// flash on slow networks.

export function TikTokEmbed({
  url,
  videoId,
  caption,
  thumbnailUrl,
  authorName,
}: {
  url: string;
  videoId: string;
  caption?: string | null;
  thumbnailUrl?: string | null;
  authorName?: string | null;
}) {
  return (
    <blockquote
      className="tiktok-embed"
      cite={url}
      data-video-id={videoId}
      style={{ maxWidth: 605, minWidth: 325, margin: 0 }}
    >
      <section style={{ position: 'relative' }}>
        {thumbnailUrl ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'block', position: 'relative', aspectRatio: '9/16', overflow: 'hidden', background: '#000' }}
          >
            <img
              src={thumbnailUrl}
              alt={caption || authorName || 'TikTok reel'}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </a>
        ) : (
          <a target="_blank" rel="noreferrer" href={url}>
            {caption || 'Open on TikTok'}
          </a>
        )}
      </section>
    </blockquote>
  );
}
