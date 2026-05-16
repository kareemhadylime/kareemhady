/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/insights-geo', () => ({
  queryGeoRollup: vi.fn().mockResolvedValue([
    { country_code: 'EG', impressions: 1000, clicks: 50, spend_micros: 5_000_000, leads: 3 },
    { country_code: 'AE', impressions: 600, clicks: 20, spend_micros: 1_500_000, leads: 1 },
  ]),
}));

describe('GeoTab', () => {
  it('renders country table with clicks/impressions/spend columns', async () => {
    const { GeoTab } = await import('./geo-tab');
    const ui = await GeoTab({ range: { from: '2026-05-01', to: '2026-05-16', preset: '30d', compare: false } });
    render(ui);
    expect(screen.getByText('EG')).toBeTruthy();
    expect(screen.getByText('AE')).toBeTruthy();
    // formatted numbers
    expect(screen.getByText(/1,000/)).toBeTruthy();
  });

  it('renders empty state when no rows', async () => {
    const mod = await import('@/lib/beithady/ads/insights-geo');
    vi.mocked(mod.queryGeoRollup).mockResolvedValueOnce([]);
    const { GeoTab } = await import('./geo-tab');
    const ui = await GeoTab({ range: { from: '2026-05-01', to: '2026-05-16', preset: '30d', compare: false } });
    render(ui);
    expect(screen.getByText(/No audience data yet/i)).toBeTruthy();
  });
});
