/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/frt', () => ({
  getFrtSummary: vi.fn().mockResolvedValue({
    total_leads: 22, responded_leads: 21, unresponded_count: 1,
    median_minutes: 12, p95_minutes: 47,
    over_1h_count: 3, over_1h_pct: 14,
  }),
  getFrtPerCampaign: vi.fn().mockResolvedValue([
    { campaign_id: 42, campaign_name: 'CTWA EG May', total_leads: 18, responded_leads: 17,
      unresponded_count: 1, median_minutes: 14, p95_minutes: 52, over_1h_count: 3, over_1h_pct: 17 },
  ]),
}));

describe('FrtCard', () => {
  it('renders median + p95 + SLA % + worst-campaign link', async () => {
    const { FrtCard } = await import('./frt-card');
    const ui = await FrtCard({ range: { from: '2026-05-09', to: '2026-05-16' } });
    render(ui);
    expect(screen.getByText(/12m/)).toBeTruthy();
    expect(screen.getByText(/47m/)).toBeTruthy();
    expect(screen.getByText(/14%/)).toBeTruthy();
    expect(screen.getByText(/CTWA EG May/)).toBeTruthy();
  });

  it('returns null when total_leads = 0', async () => {
    const frtMod = await import('@/lib/beithady/ads/frt');
    vi.mocked(frtMod.getFrtSummary).mockResolvedValueOnce({
      total_leads: 0, responded_leads: 0, unresponded_count: 0,
      median_minutes: null, p95_minutes: null, over_1h_count: 0, over_1h_pct: 0,
    });
    vi.mocked(frtMod.getFrtPerCampaign).mockResolvedValueOnce([]);
    const { FrtCard } = await import('./frt-card');
    const ui = await FrtCard({ range: { from: '2026-05-09', to: '2026-05-16' } });
    const { container } = render(ui);
    expect(container.firstChild).toBeNull();
  });
});
