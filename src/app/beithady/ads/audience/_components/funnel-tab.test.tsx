/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/funnel', () => ({
  getFunnelStages: vi.fn().mockResolvedValue({
    stages: [
      { key: 'impressions', label: 'Impressions', count: 124500, conversion_pct_from_prev: null, conversion_pct_from_top: null },
      { key: 'reach',       label: 'Reach',       count: 89200,  conversion_pct_from_prev: 71.6, conversion_pct_from_top: 71.6 },
      { key: 'clicks',      label: 'Clicks',      count: 7488,   conversion_pct_from_prev: 8.4,  conversion_pct_from_top: 6 },
      { key: 'leads',       label: 'Leads',       count: 45,     conversion_pct_from_prev: 0.6,  conversion_pct_from_top: 0 },
      { key: 'bookings',    label: 'Bookings',    count: 14,     conversion_pct_from_prev: 31.1, conversion_pct_from_top: 0 },
    ],
  }),
}));

describe('FunnelTab', () => {
  it('renders 5 stages with counts + drop-off labels', async () => {
    const { FunnelTab } = await import('./funnel-tab');
    const ui = await FunnelTab({ range: { from: '2026-05-01', to: '2026-05-16', preset: '30d', compare: false } });
    render(ui);
    expect(screen.getAllByText(/Impressions/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/124,500/)).toBeTruthy();
    expect(screen.getByText(/89,200/)).toBeTruthy();
    expect(screen.getByText(/71.6%/)).toBeTruthy();
  });

  it('shows hint when buildingCode is active', async () => {
    const { FunnelTab } = await import('./funnel-tab');
    const ui = await FunnelTab({
      range: { from: '2026-05-01', to: '2026-05-16', preset: '30d', compare: false },
      buildingCode: 'BH-26',
    });
    render(ui);
    expect(screen.getByText(/campaign-aggregate/i)).toBeTruthy();
  });
});
