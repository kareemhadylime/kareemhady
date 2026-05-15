// Dispatcher: routes a MarketingReel to the right platform embed.
// Server-renderable; both embeds are hydrated by their respective
// platform scripts loaded once by the page.
import type { MarketingReel } from '@/lib/beithady/marketing-reels';
import { TikTokEmbed } from './tiktok-embed';
import { InstagramEmbed } from './instagram-embed';

export function SocialEmbed({ reel }: { reel: MarketingReel }) {
  if (reel.platform === 'instagram') {
    return <InstagramEmbed url={reel.url} caption={reel.caption} />;
  }
  return (
    <TikTokEmbed
      url={reel.url}
      videoId={reel.external_id}
      caption={reel.caption}
      thumbnailUrl={reel.thumbnail_url}
      authorName={reel.author_name}
    />
  );
}
