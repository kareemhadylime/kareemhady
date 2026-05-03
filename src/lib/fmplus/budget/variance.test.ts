import { describe, it, expect } from 'vitest';
import { aggregateBudgetByMonth, matchAccountToCategory, aggregateActualsByMonth } from './variance';

describe('aggregateBudgetByMonth', () => {
  it('expands season totals into per-month using HK season_months', () => {
    const lines = [
      { segment_id: 1, sub_location: 'NC Inner Campus', category: 'manning',
        line_code: 'hk_manager', season: 'high' as const, monthly_cost: 1000 },
      { segment_id: 1, sub_location: 'NC Inner Campus', category: 'manning',
        line_code: 'hk_manager', season: 'low' as const,  monthly_cost: 800 },
    ];
    const seasonMonths = { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] };
    const out = aggregateBudgetByMonth(lines, seasonMonths, 1);
    const jan = out.find(x => x.segment_id===1 && x.category==='manning' && x.month===1);
    const may = out.find(x => x.segment_id===1 && x.category==='manning' && x.month===5);
    expect(jan!.budget).toBe(1000);
    expect(may!.budget).toBe(800);
  });

  it('zeros out months before start_month', () => {
    const lines = [
      { segment_id: 1, sub_location: null, category: 'overhead',
        line_code: 'mob_overhead', season: 'high' as const, monthly_cost: 5000 },
    ];
    const seasonMonths = { high: [1,2,3,4,5,6,7,8,9,10,11,12], low: [] };
    const out = aggregateBudgetByMonth(lines, seasonMonths, 5);
    const apr = out.find(x => x.month===4)!;
    const may = out.find(x => x.month===5)!;
    expect(apr.budget).toBe(0);
    expect(may.budget).toBe(5000);
  });
});

describe('matchAccountToCategory', () => {
  const map = [
    { category: 'manning',     code_patterns: ['^5000(0[1-9]|1[0-4])$'] },
    { category: 'consumables', code_patterns: ['^5001(0[1-9]|1[0-9])$'] },
  ];
  it('matches manning code', () => {
    expect(matchAccountToCategory('500001', map)).toBe('manning');
    expect(matchAccountToCategory('500014', map)).toBe('manning');
  });
  it('matches consumables code', () => {
    expect(matchAccountToCategory('500101', map)).toBe('consumables');
  });
  it('returns null on no match', () => {
    expect(matchAccountToCategory('900000', map)).toBeNull();
  });
});

describe('aggregateActualsByMonth', () => {
  it('sums move-line balances grouped by (segment, category, month)', () => {
    const moveLines = [
      { date: '2026-01-15', balance: 100, account_code: '500001' },
      { date: '2026-01-25', balance: 50,  account_code: '500001' },
      { date: '2026-02-10', balance: 200, account_code: '500101' },
      { date: '2026-02-20', balance: 30,  account_code: '900000' },
    ];
    const map = [
      { category: 'manning',     code_patterns: ['^500001$'] },
      { category: 'consumables', code_patterns: ['^500101$'] },
    ];
    const { cells, unmappedTotal } = aggregateActualsByMonth(moveLines, map, 7);
    const jan = cells.find(c => c.month===1 && c.category==='manning')!;
    const feb = cells.find(c => c.month===2 && c.category==='consumables')!;
    expect(jan.actual).toBe(150);
    expect(feb.actual).toBe(200);
    expect(unmappedTotal).toBe(30);
  });
});
