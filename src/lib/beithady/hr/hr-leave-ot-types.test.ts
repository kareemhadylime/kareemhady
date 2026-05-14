import { describe, it, expect } from 'vitest';
import { calcLeaveDays } from './hr-leave-ot-types';

describe('calcLeaveDays', () => {
  it('single day returns 1', () => {
    expect(calcLeaveDays('2026-05-14', '2026-05-14')).toBe(1);
  });
  it('consecutive days are inclusive', () => {
    expect(calcLeaveDays('2026-05-14', '2026-05-15')).toBe(2);
  });
  it('4-day range', () => {
    expect(calcLeaveDays('2026-05-12', '2026-05-15')).toBe(4);
  });
  it('end before start returns 0', () => {
    expect(calcLeaveDays('2026-05-15', '2026-05-14')).toBe(0);
  });
  it('month boundary', () => {
    expect(calcLeaveDays('2026-05-30', '2026-06-01')).toBe(3);
  });
});
