import { describe, it, expect } from 'vitest';
import { sortTopAds, type TopAdRow } from './top-ads';

const ROWS: TopAdRow[] = [
  { ad_id: 1, ad_name: 'A', campaign_id: 100, campaign_name: 'C1', platform: 'meta', impressions: 10000, clicks: 500, ctr_pct: 5, spend_egp: 1000, leads: 20, cpl_egp: 50 },
  { ad_id: 2, ad_name: 'B', campaign_id: 100, campaign_name: 'C1', platform: 'meta', impressions: 8000,  clicks: 240, ctr_pct: 3, spend_egp: 800,  leads: 10, cpl_egp: 80 },
  { ad_id: 3, ad_name: 'C', campaign_id: 200, campaign_name: 'C2', platform: 'google', impressions: 5000, clicks: 250, ctr_pct: 5, spend_egp: 400, leads: 0,  cpl_egp: null },
];

describe('sortTopAds', () => {
  it('sorts by leads desc when sortBy=leads', () => {
    const out = sortTopAds(ROWS, 'leads');
    expect(out.map(r => r.ad_id)).toEqual([1, 2, 3]);
  });
  it('sorts by ctr_pct desc when sortBy=ctr', () => {
    const out = sortTopAds(ROWS, 'ctr');
    // Both ad 1 + ad 3 have ctr=5, ad 2 has ctr=3. Stable sort or any order for ties OK.
    expect(out[2].ad_id).toBe(2);   // ad 2 is last (lowest CTR)
  });
  it('sorts by cpl_egp asc when sortBy=cpl AND drops null-cpl rows', () => {
    const out = sortTopAds(ROWS, 'cpl');
    expect(out.map(r => r.ad_id)).toEqual([1, 2]);   // ad 3 (null CPL) dropped
  });
  it('respects limit', () => {
    expect(sortTopAds(ROWS, 'leads', 2)).toHaveLength(2);
  });
});
