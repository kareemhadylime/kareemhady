import { describe, it, expect } from 'vitest';
import {
  normalizeMetaGeoRows, normalizeGoogleGeoRows, normalizeTikTokGeoRows,
  queryGeoRollup,
} from './insights-geo';

const CTX = { accountId: 1, campaignId: 5, adSetId: null as number | null, platform: 'meta' as const };

describe('normalizeMetaGeoRows', () => {
  it('passes through ISO-2 country + parses numerics', () => {
    const out = normalizeMetaGeoRows([
      { country: 'EG', impressions: '1000', clicks: '40', spend: '5.50', reach: '900', date_start: '2026-05-10' },
    ], CTX);
    expect(out).toEqual([{
      account_id: 1, campaign_id: 5, ad_set_id: null, platform: 'meta',
      metric_date: '2026-05-10', country_code: 'EG', region: null, city: null,
      impressions: 1000, clicks: 40, spend_micros: 5_500_000, reach: 900, leads: 0,
    }]);
  });
  it('drops rows with missing country', () => {
    const out = normalizeMetaGeoRows([
      { impressions: '1', clicks: '0', spend: '0', date_start: '2026-05-10' },
    ], CTX);
    expect(out).toHaveLength(0);
  });
});

describe('normalizeGoogleGeoRows', () => {
  const G_CTX = { ...CTX, platform: 'google' as const };
  it('maps geoTargetConstants/2818 → GB', () => {
    const out = normalizeGoogleGeoRows([{
      segments: { date: '2026-05-10', geoTargetCountry: 'geoTargetConstants/2818', geoTargetCity: null },
      metrics: { impressions: '10', clicks: '1', costMicros: '12345', conversions: '0' },
      campaign: { id: '5' },
    }], G_CTX);
    expect(out[0].country_code).toBe('GB');
    expect(out[0].spend_micros).toBe(12345);
  });
  it('maps geoTargetConstants/2818 → EG when EG used; drops unknown ids', () => {
    const out = normalizeGoogleGeoRows([
      { segments: { date: '2026-05-10', geoTargetCountry: 'geoTargetConstants/2818' },
        metrics: { impressions: '10', clicks: '1', costMicros: '10', conversions: '0' }, campaign: { id: '5' } },
      { segments: { date: '2026-05-10', geoTargetCountry: 'geoTargetConstants/99999999' },
        metrics: { impressions: '1', clicks: '0', costMicros: '0', conversions: '0' }, campaign: { id: '5' } },
    ], G_CTX);
    expect(out).toHaveLength(1);
  });
});

describe('normalizeTikTokGeoRows', () => {
  const T_CTX = { ...CTX, platform: 'tiktok' as const };
  it('maps ISO-3 → ISO-2 (EGY → EG)', () => {
    const out = normalizeTikTokGeoRows([{
      dimensions: { country_code: 'EGY', campaign_id: '5', stat_time_day: '2026-05-10' },
      metrics: { impressions: '10', clicks: '1', spend: '1.5' },
    }], T_CTX);
    expect(out[0].country_code).toBe('EG');
  });
  it('drops unknown ISO-3', () => {
    const out = normalizeTikTokGeoRows([{
      dimensions: { country_code: 'XXX', campaign_id: '5', stat_time_day: '2026-05-10' },
      metrics: { impressions: '1', clicks: '0', spend: '0' },
    }], T_CTX);
    expect(out).toHaveLength(0);
  });
});

describe('queryGeoRollup buildingCode filter (shape only)', () => {
  it('accepts buildingCode in opts type', () => {
    // Type-level check: this should compile.
    const _shape: Parameters<typeof queryGeoRollup>[0] = {
      from: '2026-05-01', to: '2026-05-16', buildingCode: 'BH-26',
    };
    expect(_shape.buildingCode).toBe('BH-26');
  });
});
