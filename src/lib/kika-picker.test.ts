import { describe, it, expect } from 'vitest';
import { resolveScope, bucketKey, netRemaining } from './kika-picker';

describe('resolveScope', () => {
  const NOW = new Date('2026-05-16T12:00:00Z');

  it('returns null fromDate for "all"', () => {
    expect(resolveScope('all', NOW)).toEqual({ fromDate: null, label: 'All open backlog' });
  });

  it('subtracts 7 days for "older_than_7d" and labels it', () => {
    expect(resolveScope('older_than_7d', NOW)).toEqual({
      fromDate: null,
      toDate: '2026-05-09',
      label: 'Older than 7 days',
    });
  });

  it('subtracts 14 days for "older_than_14d"', () => {
    expect(resolveScope('older_than_14d', NOW)).toEqual({
      fromDate: null,
      toDate: '2026-05-02',
      label: 'Older than 14 days',
    });
  });

  it('returns start-of-ISO-week for "this_week" (Mon = week start)', () => {
    // 2026-05-16 is a Saturday. ISO week starts Monday → 2026-05-11.
    expect(resolveScope('this_week', NOW)).toEqual({
      fromDate: '2026-05-11',
      toDate: null,
      label: 'This week',
    });
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
