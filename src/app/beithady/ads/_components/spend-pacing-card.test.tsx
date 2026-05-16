/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/pacing', () => ({
  getSpendPacing: vi.fn().mockResolvedValue({
    daily: [
      { date: '2026-05-14', spend_egp: 800 },
      { date: '2026-05-15', spend_egp: 1200 },
      { date: '2026-05-16', spend_egp: 600 },
    ],
    campaigns: [
      { campaign_id: 1, campaign_name: 'CTWA EG May', platform: 'meta',
        monthly_budget_cap_egp: 10000, spend_egp_mtd: 8500, projected_egp_eom: 16000,
        pct_of_cap: 85, auto_paused: false },
      { campaign_id: 2, campaign_name: 'Search SA', platform: 'google',
        monthly_budget_cap_egp: 5000, spend_egp_mtd: 1500, projected_egp_eom: 3000,
        pct_of_cap: 30, auto_paused: false },
    ],
    total_spend_egp: 10000, total_cap_egp: 15000,
  }),
}));

describe('SpendPacingCard', () => {
  it('renders sparkline + campaign rows sorted by pct_of_cap desc', async () => {
    const { SpendPacingCard } = await import('./spend-pacing-card');
    const ui = await SpendPacingCard({ range: { from: '2026-05-14', to: '2026-05-16' } });
    render(ui);
    expect(screen.getByText(/Spend pacing/i)).toBeTruthy();
    // CTWA EG May appears in both the campaign row + the projection warning when pct > 80
    expect(screen.getAllByText(/CTWA EG May/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/85%/)).toBeTruthy();
    expect(screen.getByText(/Search SA/)).toBeTruthy();
  });
  it('shows projection warning for campaigns >80% of cap', async () => {
    const { SpendPacingCard } = await import('./spend-pacing-card');
    const ui = await SpendPacingCard({ range: { from: '2026-05-14', to: '2026-05-16' } });
    render(ui);
    expect(screen.getByText(/projected to hit cap/i)).toBeTruthy();
  });
});
