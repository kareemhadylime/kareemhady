import { describe, it, expect } from 'vitest';
import { normalizeRangeArg } from './reporting';

describe('normalizeRangeArg', () => {
  it('accepts a number → { from = today-(n-1), to = today }', () => {
    const r = normalizeRangeArg(30, { today: '2026-05-16' });
    expect(r).toEqual({ from: '2026-04-17', to: '2026-05-16' });
  });
  it('accepts an explicit { from, to }', () => {
    const r = normalizeRangeArg({ from: '2026-01-01', to: '2026-01-31' });
    expect(r).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });
});
