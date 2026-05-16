import { describe, it, expect } from 'vitest';
import { computeConversionPcts, type FunnelStageInput } from './funnel';

describe('computeConversionPcts', () => {
  it('produces 5 stages with conversion_pct_from_prev', () => {
    const input: FunnelStageInput[] = [
      { key: 'impressions', label: 'Impressions', count: 10000 },
      { key: 'reach', label: 'Reach', count: 7000 },
      { key: 'clicks', label: 'Clicks', count: 500 },
      { key: 'leads', label: 'Leads', count: 25 },
      { key: 'bookings', label: 'Bookings', count: 5 },
    ];
    const out = computeConversionPcts(input);
    expect(out[0].conversion_pct_from_prev).toBeNull();
    expect(out[1].conversion_pct_from_prev).toBe(70);
    expect(out[2].conversion_pct_from_prev).toBeCloseTo(7.1, 1);
    expect(out[3].conversion_pct_from_prev).toBe(5);
    expect(out[4].conversion_pct_from_prev).toBe(20);
  });
  it('handles all-zero gracefully (null conversion, no NaN)', () => {
    const input: FunnelStageInput[] = [
      { key: 'impressions', label: 'I', count: 0 },
      { key: 'reach', label: 'R', count: 0 },
      { key: 'clicks', label: 'C', count: 0 },
      { key: 'leads', label: 'L', count: 0 },
      { key: 'bookings', label: 'B', count: 0 },
    ];
    const out = computeConversionPcts(input);
    expect(out.every(s => s.count === 0)).toBe(true);
    expect(out[1].conversion_pct_from_prev).toBeNull();
  });
  it('computes conversion_pct_from_top relative to first stage', () => {
    const input: FunnelStageInput[] = [
      { key: 'impressions', label: 'I', count: 1000 },
      { key: 'reach', label: 'R', count: 500 },
      { key: 'clicks', label: 'C', count: 100 },
      { key: 'leads', label: 'L', count: 10 },
      { key: 'bookings', label: 'B', count: 2 },
    ];
    const out = computeConversionPcts(input);
    expect(out[0].conversion_pct_from_top).toBeNull();
    expect(out[4].conversion_pct_from_top).toBe(0.2);
  });
});
