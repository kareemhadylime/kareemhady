/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/cohort', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/beithady/ads/cohort')>();
  return {
    ...actual,
    getCohortMatrix: vi.fn().mockResolvedValue({
      cohorts: [
        { week_label: 'W19 (May 5)', week_start: '2026-05-04', leads: 61,
          bookings_by_lag: [7, 4, 0, 0, 0],
          conversion_pcts_by_lag: [11.5, 6.6, 0, 0, 0] as [number, number, number, number, number] },
        { week_label: 'W18 (Apr 28)', week_start: '2026-04-28', leads: 48,
          bookings_by_lag: [7, 5, 2, 0, 0],
          conversion_pcts_by_lag: [14.6, 10.4, 4.2, 0, 0] as [number, number, number, number, number] },
      ],
    }),
  };
});

describe('CohortTab', () => {
  it('renders matrix with cohort labels + lag headers', async () => {
    const { CohortTab } = await import('./cohort-tab');
    const ui = await CohortTab({ range: { from: '', to: '', preset: '', compare: false } });
    render(ui);
    expect(screen.getByText(/W19/)).toBeTruthy();
    expect(screen.getByText(/W18/)).toBeTruthy();
    expect(screen.getByText(/\+1w/)).toBeTruthy();
    expect(screen.getByText(/\+5w\+/)).toBeTruthy();
  });

  it('shows empty state when no cohorts', async () => {
    const mod = await import('@/lib/beithady/ads/cohort');
    vi.mocked(mod.getCohortMatrix).mockResolvedValueOnce({ cohorts: [] });
    const { CohortTab } = await import('./cohort-tab');
    const ui = await CohortTab({ range: { from: '', to: '', preset: '', compare: false } });
    render(ui);
    expect(screen.getByText(/Not enough lead history/i)).toBeTruthy();
  });
});
