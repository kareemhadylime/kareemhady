import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/beithady/ads/reporting', () => ({
  listAssetPerformance: vi.fn().mockResolvedValue([
    { asset_id: 'a', building_code: 'BH-26', public_url: 'http://x', ai_caption: null, category: null, ad_count: 3, impressions: 1000, clicks: 50, spend: 100, leads: 5, ctr_pct: 5, cpc: 2, cpl: 20 },
    { asset_id: 'b', building_code: 'BH-73', public_url: 'http://y', ai_caption: null, category: null, ad_count: 2, impressions: 500,  clicks: 20, spend: 60,  leads: 2, ctr_pct: 4, cpc: 3, cpl: 30 },
  ]),
}));

describe('getTopAssets', () => {
  it('passes buildingCode through to listAssetPerformance', async () => {
    const { listAssetPerformance } = await import('@/lib/beithady/ads/reporting');
    const { getTopAssets } = await import('./top-assets');
    await getTopAssets({ buildingCode: 'BH-26', limit: 10 });
    expect(vi.mocked(listAssetPerformance)).toHaveBeenCalledWith({ buildingCode: 'BH-26', limit: 10 });
  });

  it('passes default limit=20 when limit omitted', async () => {
    const { listAssetPerformance } = await import('@/lib/beithady/ads/reporting');
    vi.mocked(listAssetPerformance).mockClear();
    const { getTopAssets } = await import('./top-assets');
    await getTopAssets({});
    expect(vi.mocked(listAssetPerformance)).toHaveBeenCalledWith({ buildingCode: undefined, limit: 20 });
  });
});
