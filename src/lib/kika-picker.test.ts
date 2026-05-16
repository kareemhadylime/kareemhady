import { describe, it, expect } from 'vitest';
import { resolveScope, bucketKey, netRemaining } from './kika-picker';

describe('resolveScope', () => {
  const NOW = new Date('2026-05-16T12:00:00Z'); // Saturday

  it('returns all-nulls for "all"', () => {
    expect(resolveScope('all', NOW)).toEqual({
      fromDate: null,
      toDate: null,
      label: 'All open backlog',
    });
  });

  it('returns ISO timestamp 7 days before now for "older_than_7d"', () => {
    expect(resolveScope('older_than_7d', NOW)).toEqual({
      fromDate: null,
      toDate: '2026-05-09T12:00:00.000Z',
      label: 'Older than 7 days',
    });
  });

  it('returns ISO timestamp 14 days before now for "older_than_14d"', () => {
    expect(resolveScope('older_than_14d', NOW)).toEqual({
      fromDate: null,
      toDate: '2026-05-02T12:00:00.000Z',
      label: 'Older than 14 days',
    });
  });

  it('returns Cairo-local Monday 00:00 for "this_week"', () => {
    // 2026-05-16 15:00 Cairo (EEST) is a Saturday → ISO Monday is 2026-05-11.
    // Cairo is in EEST (+03:00) in May.
    const result = resolveScope('this_week', NOW);
    expect(result.fromDate).toBe('2026-05-11T00:00:00+03:00');
    expect(result.toDate).toBeNull();
    expect(result.label).toBe('This week');
  });

  it('handles Monday correctly — fromDate is the same Monday', () => {
    // Pick a Monday at 06:00 UTC = 09:00 Cairo → Monday is the same day.
    const MONDAY_NOW = new Date('2026-05-11T06:00:00Z');
    const result = resolveScope('this_week', MONDAY_NOW);
    expect(result.fromDate).toBe('2026-05-11T00:00:00+03:00');
  });

  it('handles the Cairo-UTC offset: 00:30 Cairo on Monday is this week, not last', () => {
    // 2026-05-11 22:00 UTC = 2026-05-12 01:00 Cairo (Tuesday).
    // Wait — that's Tuesday. The edge case we care about is:
    // 2026-05-11 00:30 Cairo = 2026-05-10 21:30 UTC (still Sunday in UTC).
    // With the old UTC-based logic this would return the PREVIOUS Monday
    // (2026-05-04). With the fixed Cairo-based logic it should return 2026-05-11.
    const EARLY_MONDAY_CAIRO = new Date('2026-05-10T21:30:00Z');
    const result = resolveScope('this_week', EARLY_MONDAY_CAIRO);
    expect(result.fromDate).toBe('2026-05-11T00:00:00+03:00');
  });
});

describe('bucketKey', () => {
  it('maps 1 → 1', () => { expect(bucketKey(1)).toBe(1); });
  it('maps 2 → 2', () => { expect(bucketKey(2)).toBe(2); });
  it('maps 3 → 3', () => { expect(bucketKey(3)).toBe(3); });
  it('clamps 4 → 4', () => { expect(bucketKey(4)).toBe(4); });
  it('clamps 99 → 4', () => { expect(bucketKey(99)).toBe(4); });
  it('clamps 0 → 1 (defensive — should not happen since 0-line orders are dropped)', () => {
    expect(bucketKey(0)).toBe(1);
  });
});

describe('netRemaining', () => {
  it('returns full qty when nothing has been fulfilled', () => {
    expect(netRemaining(3, 0)).toBe(3);
  });
  it('subtracts fulfilled qty', () => {
    expect(netRemaining(3, 1)).toBe(2);
  });
  it('returns 0 when fully fulfilled', () => {
    expect(netRemaining(3, 3)).toBe(0);
  });
  it('clamps to 0 when over-fulfilled (defensive)', () => {
    expect(netRemaining(3, 5)).toBe(0);
  });
});
