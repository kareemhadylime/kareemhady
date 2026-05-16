import { describe, it, expect } from 'vitest';
import {
  normalizeMetaDeviceRows, normalizeGoogleDeviceRows, normalizeTikTokDeviceRows,
} from './insights-device';

const CTX = { accountId: 1, campaignId: 5, adSetId: null as number | null, platform: 'meta' as const };

describe('normalizeMetaDeviceRows', () => {
  it('keeps publisher_platform + placement, normalizes mobile_app→mobile', () => {
    const out = normalizeMetaDeviceRows([{
      device_platform: 'mobile_app', publisher_platform: 'facebook', publisher_position: 'feed',
      impressions: '100', clicks: '5', spend: '0.5', date_start: '2026-05-10',
    }], CTX);
    expect(out[0]).toMatchObject({
      device_platform: 'mobile', publisher_platform: 'facebook', placement: 'feed',
    });
  });
  it('maps mobile_web→mobile', () => {
    const out = normalizeMetaDeviceRows([{
      device_platform: 'mobile_web', publisher_platform: 'instagram', publisher_position: 'stories',
      impressions: '1', clicks: '0', spend: '0', date_start: '2026-05-10',
    }], CTX);
    expect(out[0].device_platform).toBe('mobile');
  });
  it('falls back to "unknown" for missing device_platform', () => {
    const out = normalizeMetaDeviceRows([{
      publisher_platform: 'facebook', publisher_position: 'feed',
      impressions: '1', clicks: '0', spend: '0', date_start: '2026-05-10',
    }], CTX);
    expect(out[0].device_platform).toBe('unknown');
  });
});

describe('normalizeGoogleDeviceRows', () => {
  it('maps MOBILE/TABLET/DESKTOP enums + leaves publisher null', () => {
    const out = normalizeGoogleDeviceRows([
      { segments: { date: '2026-05-10', device: 'MOBILE' },
        metrics: { impressions: '10', clicks: '1', costMicros: '500' }, campaign: { id: '5' } },
      { segments: { date: '2026-05-10', device: 'CONNECTED_TV' },
        metrics: { impressions: '5', clicks: '0', costMicros: '100' }, campaign: { id: '5' } },
    ], { ...CTX, platform: 'google' });
    expect(out[0].device_platform).toBe('mobile');
    expect(out[0].publisher_platform).toBeNull();
    expect(out[1].device_platform).toBe('connected_tv');
  });
});

describe('normalizeTikTokDeviceRows', () => {
  it('keeps unknown device + passes placement', () => {
    const out = normalizeTikTokDeviceRows([{
      dimensions: { placement: 'PLACEMENT_TIKTOK', campaign_id: '5', stat_time_day: '2026-05-10' },
      metrics: { impressions: '10', clicks: '1', spend: '0.5' },
    }], { ...CTX, platform: 'tiktok' });
    expect(out[0].device_platform).toBe('unknown');
    expect(out[0].placement).toBe('PLACEMENT_TIKTOK');
  });
});
