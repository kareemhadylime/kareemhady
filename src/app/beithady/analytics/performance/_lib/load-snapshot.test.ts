import { describe, it, expect } from 'vitest';
import { computePriorDate, parseDateParam } from './load-snapshot';

describe('parseDateParam', () => {
  it('returns the provided YYYY-MM-DD when valid', () => {
    expect(parseDateParam('2026-05-05')).toBe('2026-05-05');
  });

  it('returns null for invalid format', () => {
    expect(parseDateParam('2026-5-5')).toBeNull();
    expect(parseDateParam('not-a-date')).toBeNull();
    expect(parseDateParam(undefined)).toBeNull();
  });

  it('returns null for impossible dates', () => {
    expect(parseDateParam('2026-13-01')).toBeNull();
    expect(parseDateParam('2026-02-30')).toBeNull();
  });
});

describe('computePriorDate', () => {
  it('returns null for invalid date input', () => {
    expect(computePriorDate('not-a-date', 'yesterday')).toBeNull();
  });

  it('returns null when compare is none/unknown', () => {
    expect(computePriorDate('2026-05-08', 'none')).toBeNull();
    expect(computePriorDate('2026-05-08', undefined)).toBeNull();
    expect(computePriorDate('2026-05-08', 'gibberish')).toBeNull();
  });

  it('subtracts 1 day for yesterday', () => {
    expect(computePriorDate('2026-05-08', 'yesterday')).toBe('2026-05-07');
  });

  it('subtracts 7 days for last-week (crossing month boundary)', () => {
    expect(computePriorDate('2026-05-03', 'last-week')).toBe('2026-04-26');
  });

  it('returns the same calendar day in the previous month', () => {
    expect(computePriorDate('2026-05-08', 'last-month')).toBe('2026-04-08');
  });

  it('clamps to last day when prior month is shorter (Mar 31 → Feb 28 in 2026)', () => {
    expect(computePriorDate('2026-03-31', 'last-month')).toBe('2026-02-28');
  });

  it('handles January correctly (rolls back to December prior year)', () => {
    expect(computePriorDate('2026-01-15', 'last-month')).toBe('2025-12-15');
  });

  it('returns the same date in the previous year', () => {
    expect(computePriorDate('2026-05-08', 'last-year')).toBe('2025-05-08');
  });

  it('handles Feb 29 leap-year fallback', () => {
    expect(computePriorDate('2024-02-29', 'last-year')).toBe('2023-02-28');
  });
});

// loadNearestSnapshot is exercised end-to-end against Supabase, so a
// dedicated unit test would need a heavyweight mock. The pure date math
// is already covered by the computePriorDate suite above (same UTC arith
// path). Tie-break + offset semantics are documented in the function's
// JSDoc and verified via manual smoke-test against production data.
