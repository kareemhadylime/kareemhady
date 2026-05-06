import { describe, expect, test } from 'vitest';
import { computeMobAmortization } from './derive-mobilization';

describe('computeMobAmortization', () => {
  test('straight-line, 6 months elapsed of 24', () => {
    const r = computeMobAmortization({
      mob_line_id: 1, label: 'Recruitment', total_cost: 240_000,
      amortization: 'straight_line', amortization_months: 24,
    }, 6);
    expect(r.amortized).toBe(60_000);
    expect(r.remaining).toBe(180_000);
    expect(r.months_elapsed).toBe(6);
    expect(r.months_total).toBe(24);
  });

  test('flat method — fully amortized at month 1', () => {
    const r = computeMobAmortization({
      mob_line_id: 2, label: 'Onboarding kit', total_cost: 50_000,
      amortization: 'flat', amortization_months: 1,
    }, 1);
    expect(r.amortized).toBe(50_000);
    expect(r.remaining).toBe(0);
  });

  test('capped at total — 30 months elapsed of 24', () => {
    const r = computeMobAmortization({
      mob_line_id: 3, label: 'Training', total_cost: 120_000,
      amortization: 'straight_line', amortization_months: 24,
    }, 30);
    expect(r.amortized).toBe(120_000);
    expect(r.remaining).toBe(0);
  });
});
