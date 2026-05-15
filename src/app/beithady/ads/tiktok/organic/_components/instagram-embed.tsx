// Renders Instagram's official blockquote embed markup. Hydrated
// client-side by instagram.com/embed.js (loaded once by the page).
// Server-renderable.
//
// IG requires the `?utm_source=ig_embed&utm_campaign=loading` suffix
// on the permalink for the embed to load — we append it here so the
// canonical URL stored in the DB stays clean.

export function InstagramEmbed({
  url,
  caption,
}: {
  url: string;
  caption?: string | null;
}) {
  const embedUrl = `${url}${url.includes('?') ? '&' : '?'}utm_source=ig_embed&utm_campaign=loading`;
  return (
    <blockquote
      className="instagram-media"
      data-instgrm-captioned
      data-instgrm-permalink={embedUrl}
      data-instgrm-version="14"
      style={{
        background: '#FFF',
        border: 0,
        borderRadius: 3,
        boxShadow:
          '0 0 1px 0 rgba(0,0,0,0.5), 0 1px 10px 0 rgba(0,0,0,0.15)',
        margin: 0,
        maxWidth: 540,
        minWidth: 326,
        padding: 0,
        width: '100%',
      }}
    >
      <div style={{ padding: 16 }}>
        <a target="_blank" rel="noreferrer" href={embedUrl}>
          {caption || 'View on Instagram'}
        </a>
      </div>
    </blockquote>
  );
}
