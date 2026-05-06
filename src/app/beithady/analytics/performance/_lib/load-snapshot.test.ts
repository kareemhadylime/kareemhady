import { describe, it, expect } from 'vitest';
import { parseDateParam } from './load-snapshot';

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
