import { ImageResponse } from 'next/og';
import { supabaseAdmin } from '@/lib/supabase';

// Dynamic OG image for /stay/[code]. Renders a 1200x630 PNG using the
// building's hero photo (if available) with a brand overlay + headline.
// Cached on Vercel's CDN, regenerated per ISR.

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Beit Hady property';

export default async function Image({ params }: { params: { code: string } }) {
  const sb = supabaseAdmin();

  const { data: listing } = await sb
    .from('guesty_listings')
    .select('title, nickname, address_city, bedrooms, accommodates')
    .eq('building_code', params.code)
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  type Listing = { title: string | null; nickname: string | null; address_city: string | null; bedrooms: number | null; accommodates: number | null };
  const l = listing as Listing | null;

  const { data: hero } = await sb
    .from('beithady_gallery_assets')
    .select('public_url')
    .eq('building_code', params.code)
    .eq('ad_eligible', true)
    .not('public_url', 'is', null)
    .limit(1)
    .maybeSingle();
  const heroUrl = (hero as { public_url: string | null } | null)?.public_url || null;

  const displayName = l?.title || l?.nickname || `Beit Hady ${params.code}`;
  const city = l?.address_city || 'Cairo';
  const subtitle = `${l?.bedrooms ? `${l.bedrooms} BR · ` : ''}${l?.accommodates ? `sleeps ${l.accommodates} · ` : ''}${city}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          color: 'white',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
          backgroundColor: '#0f172a',
        }}
      >
        {heroUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroUrl}
            alt=""
            width={1200}
            height={630}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.85) 100%)',
          }}
        />
        <div style={{ position: 'relative', padding: 60, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.4em', opacity: 0.8, marginBottom: 12 }}>
            Beit Hady · {params.code}
          </div>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 1000 }}>
            {displayName}
          </div>
          <div style={{ fontSize: 28, marginTop: 16, opacity: 0.95 }}>
            {subtitle}
          </div>
          <div style={{ fontSize: 24, marginTop: 36, color: '#34d399' }}>
            Direct host · 24/7 concierge · message on WhatsApp →
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
