// src/lib/fmplus/period-series.test.ts
import { describe, it, expect } from 'vitest';
import { resolvePeriodSeries } from './period-series';

describe('resolvePeriodSeries', () => {
  it('monthly periods=3 anchored on Feb 2026 → Feb, Jan, Dec', () => {
    const out = resolvePeriodSeries('monthly', 3, '2026-02');
    expect(out.map(p => p.key)).toEqual(['m:2026-02', 'm:2026-01', 'm:2025-12']);
    expect(out[0]).toMatchObject({ label: 'Feb 2026', fromDate: '2026-02-01', toDate: '2026-02-28' });
    expect(out[2]).toMatchObject({ label: 'Dec 2025', fromDate: '2025-12-01', toDate: '2025-12-31' });
  });

  it('monthly periods=12 anchored on Feb 2026 → 12 months', () => {
    const out = resolvePeriodSeries('monthly', 12, '2026-02');
    expect(out).toHaveLength(12);
    expect(out[0].key).toBe('m:2026-02');
    expect(out[11].key).toBe('m:2025-03');
  });

  it('quarterly periods=4 anchored on Q1 2026 → Q1 2026, Q4 2025, Q3 2025, Q2 2025', () => {
    const out = resolvePeriodSeries('quarterly', 4, '2026-Q1');
    expect(out.map(p => p.key)).toEqual(['q:2026-1', 'q:2025-4', 'q:2025-3', 'q:2025-2']);
    expect(out[0]).toMatchObject({ fromDate: '2026-01-01', toDate: '2026-03-31' });
    expect(out[1]).toMatchObject({ fromDate: '2025-10-01', toDate: '2025-12-31' });
  });

  it('yearly periods=3 anchored on 2026 → 2026, 2025, 2024', () => {
    const out = resolvePeriodSeries('yearly', 3, '2026');
    expect(out.map(p => p.key)).toEqual(['y:2026', 'y:2025', 'y:2024']);
    expect(out[0]).toMatchObject({ fromDate: '2026-01-01', toDate: '2026-12-31' });
  });

  it('handles month rollover from January', () => {
    const out = resolvePeriodSeries('monthly', 3, '2026-01');
    expect(out.map(p => p.label)).toEqual(['Jan 2026', 'Dec 2025', 'Nov 2025']);
  });

  it('handles February leap-year (Feb 2024 has 29 days)', () => {
    const out = resolvePeriodSeries('monthly', 1, '2024-02');
    expect(out[0].toDate).toBe('2024-02-29');
  });

  it('falls back to current month when asof is malformed', () => {
    const out = resolvePeriodSeries('monthly', 1, 'gibberish');
    expect(out).toHaveLength(1);
    expect(out[0].key).toMatch(/^m:\d{4}-\d{2}$/);
  });
});
