import { describe, it, expect } from 'vitest';
import { computeFrtSummary, type FrtInput } from './frt';

describe('computeFrtSummary', () => {
  function l(deltaMin: number | null): FrtInput {
    if (deltaMin == null) return { created_at: '2026-05-10T00:00:00Z', first_response_at: null };
    return {
      created_at: '2026-05-10T00:00:00Z',
      first_response_at: new Date(Date.parse('2026-05-10T00:00:00Z') + deltaMin * 60_000).toISOString(),
    };
  }

  it('computes median for odd count', () => {
    const out = computeFrtSummary([l(5), l(10), l(15)]);
    expect(out.median_minutes).toBe(10);
  });
  it('computes median for even count (average of middle two)', () => {
    const out = computeFrtSummary([l(5), l(10), l(20), l(40)]);
    expect(out.median_minutes).toBe(15);
  });
  it('computes p95', () => {
    const out = computeFrtSummary(Array.from({ length: 100 }, (_, i) => l(i + 1)));
    // 95th percentile of [1..100] sorted = index floor(100*0.95) = 95 → value 96
    expect(out.p95_minutes).toBe(96);
  });
  it('counts unresponded leads', () => {
    const out = computeFrtSummary([l(5), l(null), l(null), l(15)]);
    expect(out.unresponded_count).toBe(2);
    expect(out.responded_leads).toBe(2);
    expect(out.total_leads).toBe(4);
  });
  it('over_1h_count + over_1h_pct exclude boundary at exactly 60min', () => {
    const out = computeFrtSummary([l(60), l(61), l(120)]);
    expect(out.over_1h_count).toBe(2);  // 61 + 120
    expect(out.over_1h_pct).toBe(66.7);
  });
  it('all-unresponded → null median/p95, 0 over-1h-pct', () => {
    const out = computeFrtSummary([l(null), l(null)]);
    expect(out.median_minutes).toBeNull();
    expect(out.p95_minutes).toBeNull();
    expect(out.over_1h_count).toBe(0);
    expect(out.over_1h_pct).toBe(0);
  });
  it('empty input → zero/null shape', () => {
    const out = computeFrtSummary([]);
    expect(out).toEqual({
      total_leads: 0, responded_leads: 0, unresponded_count: 0,
      median_minutes: null, p95_minutes: null,
      over_1h_count: 0, over_1h_pct: 0,
    });
  });
});
