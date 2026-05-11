import type { MetadataRoute } from 'next';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

// Next.js metadata-driven sitemap. Lists every active building landing
// page so Googlebot can discover them. Regenerates hourly via ISR.

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sb = supabaseAdmin();
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.limeinc.cc').replace(/\/$/, '');

  const { data } = await sb
    .from('guesty_listings')
    .select('building_code, last_synced_at')
    .eq('active', true)
    .not('building_code', 'is', null);

  const codes = new Map<string, string>();
  for (const row of (data as Array<{ building_code: string | null; last_synced_at: string | null }> | null) || []) {
    if (!row.building_code) continue;
    const existing = codes.get(row.building_code);
    if (!existing || (row.last_synced_at && row.last_synced_at > existing)) {
      codes.set(row.building_code, row.last_synced_at || new Date().toISOString());
    }
  }

  const SUPPORTED_LANGS = ['en', 'ar', 'de', 'fr', 'ru', 'it', 'es', 'pl', 'cs'] as const;

  return Array.from(codes.entries()).map(([code, lastMod]) => {
    const alternates = {
      languages: Object.fromEntries(SUPPORTED_LANGS.map(l => [l, `${base}/stay/${code}?lang=${l}`])),
    };
    return {
      url: `${base}/stay/${code}`,
      lastModified: new Date(lastMod),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
      alternates,
    };
  });
}
