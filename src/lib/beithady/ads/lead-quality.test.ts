import { describe, it, expect } from 'vitest';
import { rollupQualityByCampaign, type FunnelRowForQuality } from './lead-quality';

describe('rollupQualityByCampaign', () => {
  const rows: FunnelRowForQuality[] = [
    { campaign_id: 1, campaign_name: 'A', platform: 'meta',   matched_reservation_id: 'r1' },
    { campaign_id: 1, campaign_name: 'A', platform: 'meta',   matched_reservation_id: null },
    { campaign_id: 1, campaign_name: 'A', platform: 'meta',   matched_reservation_id: 'r2' },
    { campaign_id: 2, campaign_name: 'B', platform: 'google', matched_reservation_id: null },
    { campaign_id: 2, campaign_name: 'B', platform: 'google', matched_reservation_id: null },
  ];

  it('counts leads + booked per campaign with quality_pct', () => {
    const out = rollupQualityByCampaign(rows);
    const a = out.find(r => r.campaign_id === 1);
    const b = out.find(r => r.campaign_id === 2);
    expect(a).toMatchObject({ leads: 3, booked: 2, quality_pct: 66.7 });
    expect(b).toMatchObject({ leads: 2, booked: 0, quality_pct: 0 });
  });
  it('sorts by leads desc', () => {
    const out = rollupQualityByCampaign(rows);
    expect(out[0].leads).toBeGreaterThanOrEqual(out[1].leads);
  });
  it('returns empty for empty input', () => {
    expect(rollupQualityByCampaign([])).toEqual([]);
  });
});
