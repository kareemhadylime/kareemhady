// src/lib/fmplus/performance/derive-overtime.test.ts
import { describe, expect, test } from 'vitest';
import { computeOvertimeBlock } from './derive-overtime';

describe('computeOvertimeBlock', () => {
  test('actual OT 80K of 600K manning = 13.3%, budgeted 5%, over → bad', () => {
    const r = computeOvertimeBlock({
      ot_actual: 80_000, manning_actual: 600_000,
      ot_budget: 30_000, manning_budget: 600_000,
      spark: [],
      drill_url: '/x',
      amber_pct: 0.05,
    });
    expect(r!.ot_pct_actual).toBeCloseTo(0.1333, 3);
    expect(r!.ot_pct_budget).toBeCloseTo(0.05, 2);
    expect(r!.status).toBe('bad');
  });

  test('zero manning → null block (cannot compute %)', () => {
    expect(computeOvertimeBlock({
      ot_actual: 0, manning_actual: 0, ot_budget: 0, manning_budget: 0,
      spark: [], drill_url: '/x', amber_pct: 0.05,
    })).toBeNull();
  });

  test('within tolerance → good', () => {
    const r = computeOvertimeBlock({
      ot_actual: 30_000, manning_actual: 600_000,
      ot_budget: 30_000, manning_budget: 600_000,
      spark: [], drill_url: '/x', amber_pct: 0.05,
    });
    expect(r!.status).toBe('good');
  });
});
