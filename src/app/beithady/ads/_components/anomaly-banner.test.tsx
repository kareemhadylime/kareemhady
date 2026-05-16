/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/anomalies', () => ({
  detectAnomalies: vi.fn().mockResolvedValue([
    { type: 'spend_spike', severity: 'warning', platform: 'meta',
      message: 'meta spend $100 today is 4.0× yesterday ($25)',
      metric: { today: 100, baseline: 25, ratio: 4 } },
    { type: 'low_roas', severity: 'critical', platform: 'google',
      message: 'google 7d ROAS 0.40× on $200 spend',
      metric: { today: 0.4, baseline: 1, ratio: 0.4 } },
  ]),
}));

describe('AnomalyBanner', () => {
  it('renders one row per anomaly with severity tint', async () => {
    const { AnomalyBanner } = await import('./anomaly-banner');
    const ui = await AnomalyBanner();
    const { container } = render(ui);
    expect(screen.getByText(/4.0×/)).toBeTruthy();
    expect(screen.getByText(/ROAS 0.40×/)).toBeTruthy();
    // Critical row should have rose tint, warning row should have amber tint
    const html = container.innerHTML;
    expect(html).toContain('rose');
    expect(html).toContain('amber');
  });

  it('returns null when no anomalies', async () => {
    const mod = await import('@/lib/beithady/ads/anomalies');
    vi.mocked(mod.detectAnomalies).mockResolvedValueOnce([]);
    const { AnomalyBanner } = await import('./anomaly-banner');
    const ui = await AnomalyBanner();
    const { container } = render(ui);
    expect(container.firstChild).toBeNull();
  });
});
