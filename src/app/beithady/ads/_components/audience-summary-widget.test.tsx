/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/insights-geo', () => ({
  queryGeoRollup: vi.fn().mockResolvedValue([
    { country_code: 'EG', impressions: 1000, clicks: 50, spend_micros: 5_000_000, leads: 3 },
    { country_code: 'AE', impressions: 600, clicks: 20, spend_micros: 1_500_000, leads: 1 },
    { country_code: 'SA', impressions: 400, clicks: 10, spend_micros: 1_200_000, leads: 0 },
    { country_code: 'KW', impressions: 200, clicks: 5,  spend_micros: 500_000, leads: 0 },
  ]),
}));
vi.mock('@/lib/beithady/ads/insights-demo', () => ({
  queryDemoRollup: vi.fn().mockResolvedValue([
    { age_range: '25-34', gender: 'female', impressions: 500, clicks: 30, spend_micros: 2_000_000, leads: 2 },
    { age_range: '25-34', gender: 'male',   impressions: 400, clicks: 20, spend_micros: 1_500_000, leads: 1 },
    { age_range: '35-44', gender: 'female', impressions: 300, clicks: 15, spend_micros: 1_000_000, leads: 0 },
  ]),
}));
vi.mock('@/lib/beithady/ads/insights-device', () => ({
  queryDeviceRollup: vi.fn().mockResolvedValue([
    { device_platform: 'mobile',  publisher_platform: null, placement: null, impressions: 1500, clicks: 70, spend_micros: 6_000_000, leads: 4 },
    { device_platform: 'desktop', publisher_platform: null, placement: null, impressions: 400, clicks: 10, spend_micros: 1_500_000, leads: 0 },
  ]),
}));

describe('AudienceSummaryWidget', () => {
  it('renders three sections with top-3 rows + Open full report link', async () => {
    const { AudienceSummaryWidget } = await import('./audience-summary-widget');
    const ui = await AudienceSummaryWidget({ range: { from: '2026-05-01', to: '2026-05-16' } });
    render(ui);
    expect(screen.getByText(/Top countries/i)).toBeTruthy();
    expect(screen.getByText('EG')).toBeTruthy();
    expect(screen.getByText('AE')).toBeTruthy();
    expect(screen.getByText('SA')).toBeTruthy();
    expect(screen.queryByText('KW')).toBeNull();           // 4th — excluded
    expect(screen.getByText(/25-34 · female/)).toBeTruthy();
    expect(screen.getByText(/Mobile/i)).toBeTruthy();
    const link = screen.getByRole('link', { name: /Open full report/i });
    expect(link.getAttribute('href')).toContain('/beithady/ads/audience');
    expect(link.getAttribute('href')).toContain('from=2026-05-01');
  });

  it('passes campaignId through to rollup queries when provided', async () => {
    const geoMod = await import('@/lib/beithady/ads/insights-geo');
    const spy = vi.mocked(geoMod.queryGeoRollup);
    const { AudienceSummaryWidget } = await import('./audience-summary-widget');
    const ui = await AudienceSummaryWidget({
      range: { from: '2026-05-01', to: '2026-05-16' },
      campaignId: 42,
    });
    render(ui);
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ campaignId: 42 }));
  });
});
