import { describe, it, expect } from 'vitest';
import { amortizeMobilization, type MobLineLite } from './mobilization';

describe('amortizeMobilization', () => {
  it('straight-line spreads cost equally over amortization_months', () => {
    const lines: MobLineLite[] = [
      { category: 'capex', total_cost: 240_000, amortization: 'straight_line', amortization_months: 24 },
    ];
    const map = amortizeMobilization(lines, '2026-01-01', '2027-12-31');
    expect(map.size).toBe(24);
    const first = [...map.values()][0];
    expect(first).toBeCloseTo(10_000, 2);
  });

  it('flat puts the entire cost in month 1', () => {
    const lines: MobLineLite[] = [
      { category: 'opex_one_time', total_cost: 50_000, amortization: 'flat', amortization_months: 12 },
    ];
    const map = amortizeMobilization(lines, '2026-01-01', '2026-12-31');
    expect(map.get('2026-01')).toBe(50_000);
    expect(map.get('2026-02') ?? 0).toBe(0);
  });

  it('truncates straight-line at contract end_date', () => {
    const lines: MobLineLite[] = [
      { category: 'capex', total_cost: 240_000, amortization: 'straight_line', amortization_months: 24 },
    ];
    const map = amortizeMobilization(lines, '2026-01-01', '2026-06-30');
    // 6 months of straight-line at 10k each
    expect(map.size).toBe(6);
    const first = [...map.values()][0];
    expect(first).toBeCloseTo(10_000, 2);
  });

  it('sums multiple lines into the same month', () => {
    const lines: MobLineLite[] = [
      { category: 'capex',         total_cost: 24_000, amortization: 'straight_line', amortization_months: 24 },
      { category: 'training',      total_cost: 12_000, amortization: 'straight_line', amortization_months: 12 },
      { category: 'opex_one_time', total_cost: 5_000,  amortization: 'flat',          amortization_months: 12 },
    ];
    const map = amortizeMobilization(lines, '2026-01-01', '2026-12-31');
    // Month 1: 1000 (capex) + 1000 (training) + 5000 (flat) = 7000
    expect(map.get('2026-01')).toBeCloseTo(7_000, 2);
    // Month 2: 1000 + 1000 = 2000
    expect(map.get('2026-02')).toBeCloseTo(2_000, 2);
    // Month 12: 1000 + 1000 = 2000 (training ends month 12)
    expect(map.get('2026-12')).toBeCloseTo(2_000, 2);
  });

  it('returns empty map when no lines', () => {
    const map = amortizeMobilization([], '2026-01-01', '2027-12-31');
    expect(map.size).toBe(0);
  });

  it('handles single-month flat at contract end', () => {
    const lines: MobLineLite[] = [
      { category: 'opex_one_time', total_cost: 1_000, amortization: 'flat', amortization_months: 1 },
    ];
    const map = amortizeMobilization(lines, '2027-12-01', '2027-12-31');
    expect(map.get('2027-12')).toBe(1_000);
  });
});
