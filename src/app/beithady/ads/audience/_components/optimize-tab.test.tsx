/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/top-ads', () => ({
  getTopAds: vi.fn().mockResolvedValue([
    { ad_id: 1, ad_name: 'BH-26 sunset', campaign_id: 100, campaign_name: 'CTWA EG May', platform: 'meta',
      impressions: 12400, clicks: 620, ctr_pct: 5.0, spend_egp: 1240, leads: 18, cpl_egp: 68 },
  ]),
}));

vi.mock('@/lib/beithady/ads/top-assets', () => ({
  getTopAssets: vi.fn().mockResolvedValue([
    { asset_id: 'a1', building_code: 'BH-26', public_url: 'http://x/sunset.jpg',
      ai_caption: null, category: null, ad_count: 3, impressions: 18200, clicks: 850, spend: 600, leads: 10,
      ctr_pct: 4.7, cpc: 0.7, cpl: 58 },
  ]),
}));

describe('OptimizeTab', () => {
  it('renders top-ads table + top-assets table', async () => {
    const { OptimizeTab } = await import('./optimize-tab');
    const ui = await OptimizeTab({ range: { from: '2026-05-09', to: '2026-05-16', preset: '7d', compare: false } });
    render(ui);
    expect(screen.getByText(/Top performing ads/i)).toBeTruthy();
    expect(screen.getByText(/BH-26 sunset/)).toBeTruthy();
    expect(screen.getByText(/Top creative assets/i)).toBeTruthy();
    // Thumbnail
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('http://x/sunset.jpg');
  });

  it('renders sort tabs (Leads / CTR / CPL)', async () => {
    const { OptimizeTab } = await import('./optimize-tab');
    const ui = await OptimizeTab({ range: { from: '2026-05-09', to: '2026-05-16', preset: '7d', compare: false } });
    render(ui);
    expect(screen.getByText('Leads')).toBeTruthy();
    expect(screen.getByText('CTR')).toBeTruthy();
    expect(screen.getByText('CPL')).toBeTruthy();
  });
});
