/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/lead-quality', () => ({
  getLeadQualityPerCampaign: vi.fn().mockResolvedValue([
    { campaign_id: 1, campaign_name: 'CTWA EG May', platform: 'meta', leads: 18, booked: 5, quality_pct: 27.8 },
    { campaign_id: 2, campaign_name: 'Search SA',  platform: 'google', leads: 4,  booked: 1, quality_pct: 25.0 },
  ]),
}));

vi.mock('@/lib/beithady/ads/frt', () => ({
  getFrtPerCampaign: vi.fn().mockResolvedValue([
    { campaign_id: 1, campaign_name: 'CTWA EG May', total_leads: 18, responded_leads: 17, unresponded_count: 1,
      median_minutes: 14, p95_minutes: 52, over_1h_count: 3, over_1h_pct: 17 },
  ]),
}));

describe('QualityTab', () => {
  it('renders quality % table + response speed table', async () => {
    const { QualityTab } = await import('./quality-tab');
    const ui = await QualityTab({ range: { from: '2026-05-01', to: '2026-05-16', preset: '30d', compare: false } });
    render(ui);
    expect(screen.getAllByText(/CTWA EG May/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/27.8%/)).toBeTruthy();
    expect(screen.getByText(/14m/)).toBeTruthy();
    expect(screen.getByText(/52m/)).toBeTruthy();
    expect(screen.getByText(/17%/)).toBeTruthy();
  });
});
