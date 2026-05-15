import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export type MarketingReelPlatform = 'tiktok' | 'instagram';

export type MarketingReel = {
  id: number;
  platform: MarketingReelPlatform;
  url: string;
  external_id: string;
  caption: string | null;
  building_code: string | null;
  sort_order: number;
  is_visible: boolean;
  thumbnail_url: string | null;
  author_name: string | null;
  author_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ListReelsOptions = {
  visibleOnly?: boolean;
  building?: string | null;
  platform?: MarketingReelPlatform;
};

export async function listMarketingReels(opts: ListReelsOptions = {}): Promise<MarketingReel[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('bh_marketing_reels')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (opts.visibleOnly) q = q.eq('is_visible', true);
  if (opts.platform) q = q.eq('platform', opts.platform);
  if (opts.building) q = q.eq('building_code', opts.building);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MarketingReel[];
}
