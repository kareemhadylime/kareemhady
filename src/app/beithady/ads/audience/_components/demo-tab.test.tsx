/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/insights-demo', () => ({
  queryDemoRollup: vi.fn().mockResolvedValue([
    { age_range: '25-34', gender: 'female', impressions: 500, clicks: 30, spend_micros: 2_000_000, leads: 2 },
    { age_range: '25-34', gender: 'male',   impressions: 400, clicks: 20, spend_micros: 1_500_000, leads: 1 },
    { age_range: '35-44', gender: 'female', impressions: 300, clicks: 15, spend_micros: 1_000_000, leads: 0 },
  ]),
}));

describe('DemoTab', () => {
  it('renders age × gender bars and table', async () => {
    const { DemoTab } = await import('./demo-tab');
    const ui = await DemoTab({ range: { from: '2026-05-01', to: '2026-05-16', preset: '30d', compare: false } });
    render(ui);
    expect(screen.getAllByText(/25-34/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/35-44/).length).toBeGreaterThanOrEqual(1);
    // table cells
    expect(screen.getAllByText(/female/i).length).toBeGreaterThanOrEqual(1);
  });
});
