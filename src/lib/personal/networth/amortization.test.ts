import { describe, it, expect } from 'vitest';
import { generateSchedule } from './amortization';

describe('generateSchedule', () => {
  it('produces n rows for n-month term', () => {
    const rows = generateSchedule({
      principal: 12000, aprPct: 12, termMonths: 12, startDate: '2026-01-01',
    });
    expect(rows).toHaveLength(12);
  });

  it('first row has correct interest portion (P × r)', () => {
    const rows = generateSchedule({
      principal: 12000, aprPct: 12, termMonths: 12, startDate: '2026-01-01',
    });
    // r = 0.01 monthly; first interest = 12000 × 0.01 = 120
    expect(rows[0].interestPortion).toBeCloseTo(120, 2);
  });

  it('last row remaining_after is exactly 0 (rounding absorbed)', () => {
    const rows = generateSchedule({
      principal: 10000, aprPct: 18, termMonths: 24, startDate: '2026-01-01',
    });
    expect(rows[rows.length - 1].remainingAfter).toBe(0);
  });

  it('zero APR splits principal evenly with zero interest', () => {
    const rows = generateSchedule({
      principal: 1200, aprPct: 0, termMonths: 12, startDate: '2026-01-01',
    });
    expect(rows[0].principalPortion).toBeCloseTo(100, 2);
    expect(rows[0].interestPortion).toBe(0);
    expect(rows[11].remainingAfter).toBe(0);
  });

  it('term=1 returns single row with full payoff', () => {
    const rows = generateSchedule({
      principal: 1000, aprPct: 12, termMonths: 1, startDate: '2026-01-01',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].remainingAfter).toBe(0);
  });

  it('monthlyOverride is honored over computed payment', () => {
    const rows = generateSchedule({
      principal: 12000, aprPct: 12, termMonths: 12,
      startDate: '2026-01-01', monthlyOverride: 1100,
    });
    // Sum of principal + interest in each row should be ≤ 1100 (last row absorbs)
    expect(rows[0].principalPortion + rows[0].interestPortion).toBeCloseTo(1100, 2);
  });

  it('dueDates advance by one month, day-of-month preserved', () => {
    const rows = generateSchedule({
      principal: 12000, aprPct: 12, termMonths: 3, startDate: '2026-01-15',
    });
    expect(rows.map(r => r.dueDate)).toEqual([
      '2026-02-15', '2026-03-15', '2026-04-15',
    ]);
  });
});
