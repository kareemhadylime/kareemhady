import { describe, expect, test } from 'vitest';
import { weightedAvgCtc, impliedHeadcount } from './derive-implied-hc';

describe('weightedAvgCtc', () => {
  test('simple roster — 10 cleaners @ 5K + 1 mgr @ 20K', () => {
    const rows = [
      { qty: 10, unit_cost: 5000 },
      { qty: 1,  unit_cost: 20000 },
    ];
    const avg = weightedAvgCtc(rows);
    expect(avg).toBeCloseTo((10 * 5000 + 1 * 20000) / 11, 2);
  });

  test('empty roster → null', () => {
    expect(weightedAvgCtc([])).toBeNull();
  });

  test('zero-qty rows excluded', () => {
    const avg = weightedAvgCtc([{ qty: 0, unit_cost: 5000 }, { qty: 4, unit_cost: 6000 }]);
    expect(avg).toBe(6000);
  });
});

describe('impliedHeadcount', () => {
  test('actual 80K ÷ avg 6.36K → ~12.6', () => {
    const hc = impliedHeadcount(80000, 6363.63);
    expect(hc).toBeCloseTo(12.57, 1);
  });

  test('zero actual → 0', () => {
    expect(impliedHeadcount(0, 5000)).toBe(0);
  });

  test('null avg ctc → null', () => {
    expect(impliedHeadcount(80000, null)).toBeNull();
  });
});
