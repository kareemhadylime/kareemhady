// Renders TikTok's official blockquote embed markup. The actual iframe
// is hydrated client-side by tiktok.com/embed.js, which the page loads
// once via next/script. This component is server-renderable — no client
// directive needed.

export function TikTokEmbed({
  url,
  videoId,
  caption,
}: {
  url: string;
  videoId: string;
  caption?: string | null;
}) {
  return (
    <blockquote
      className="tiktok-embed"
      cite={url}
      data-video-id={videoId}
      style={{ maxWidth: 605, minWidth: 325, margin: 0 }}
    >
      <section>
        <a target="_blank" rel="noreferrer" href={url}>
          {caption || 'Open on TikTok'}
        </a>
      </section>
    </blockquote>
  );
}
