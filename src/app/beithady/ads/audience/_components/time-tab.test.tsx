/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/hourly', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/beithady/ads/hourly')>();
  return {
    ...actual,
    getLeadDensityHeatmap: vi.fn().mockResolvedValue([
      { day_of_week: 0, hour: 9, lead_count: 5 },
      { day_of_week: 1, hour: 19, lead_count: 8 },
      { day_of_week: 6, hour: 20, lead_count: 12 },
    ]),
    getMetaHourlyHeatmap: vi.fn().mockResolvedValue([]),
  };
});

describe('TimeTab', () => {
  it('renders 7×24 heatmap grid in lead-density mode', async () => {
    const { TimeTab } = await import('./time-tab');
    const ui = await TimeTab({ range: { from: '2026-05-09', to: '2026-05-16', preset: '7d', compare: false } });
    const { container } = render(ui);
    // 7 day labels
    expect(screen.getByText('Mon')).toBeTruthy();
    expect(screen.getByText('Sun')).toBeTruthy();
    // At least one hour label
    expect(screen.getByText('9h')).toBeTruthy();
    // Cell count: 7 rows × 24 cols = 168 td.heatmap-cell elements
    expect(container.querySelectorAll('td.heatmap-cell').length).toBe(168);
  });

  it('shows empty-state hint when Meta mode has no data', async () => {
    const { TimeTab } = await import('./time-tab');
    const ui = await TimeTab({ range: { from: '2026-05-09', to: '2026-05-16', preset: '7d', compare: false }, mode: 'meta' });
    render(ui);
    expect(screen.getByText(/Meta hourly data populating/i)).toBeTruthy();
  });
});
