/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/beithady/ads/insights-device', () => ({
  queryDeviceRollup: vi.fn().mockResolvedValue([
    { device_platform: 'mobile',  publisher_platform: 'facebook', placement: 'feed',    impressions: 1500, clicks: 70, spend_micros: 6_000_000, leads: 4 },
    { device_platform: 'desktop', publisher_platform: 'facebook', placement: 'feed',    impressions: 400,  clicks: 10, spend_micros: 1_500_000, leads: 0 },
    { device_platform: 'mobile',  publisher_platform: 'instagram', placement: 'stories', impressions: 200, clicks: 8, spend_micros: 600_000, leads: 1 },
  ]),
}));

describe('DeviceTab', () => {
  it('renders device summary + placement bar (Meta present) + detail table', async () => {
    const { DeviceTab } = await import('./device-tab');
    const ui = await DeviceTab({ range: { from: '2026-05-01', to: '2026-05-16', preset: '30d', compare: false } });
    render(ui);
    expect(screen.getAllByText(/Mobile/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Desktop/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Placements/i)).toBeTruthy();
    expect(screen.getAllByText(/facebook/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/instagram/i).length).toBeGreaterThanOrEqual(1);
  });
});
