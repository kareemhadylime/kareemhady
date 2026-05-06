// @ts-nocheck — v1 orphan; replaced in Tasks 13-39 of fmplus-budget-v2 plan
import { describe, it, expect } from 'vitest';
import { computeBudgetDiff } from './audit';

describe('computeBudgetDiff', () => {
  it('reports added / removed / changed lines', () => {
    const before = [
      { sub_location: 'A', category: 'manning', line_code: 'hk_manager', season: 'high' as const, qty: 1, unit_cost: 1000 },
      { sub_location: 'A', category: 'manning', line_code: 'sup_8h',     season: 'high' as const, qty: 5, unit_cost: 800  },
    ];
    const after = [
      { sub_location: 'A', category: 'manning', line_code: 'hk_manager', season: 'high' as const, qty: 1, unit_cost: 1100 },
      { sub_location: 'A', category: 'manning', line_code: 'admin',       season: 'high' as const, qty: 1, unit_cost: 9500 },
    ];
    const diff = computeBudgetDiff(before, after);
    expect(diff.added.map(l => l.line_code)).toEqual(['admin']);
    expect(diff.removed.map(l => l.line_code)).toEqual(['sup_8h']);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].line_code).toBe('hk_manager');
    expect(diff.changed[0].before.unit_cost).toBe(1000);
    expect(diff.changed[0].after.unit_cost).toBe(1100);
  });
});
