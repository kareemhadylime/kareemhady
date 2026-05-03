import { describe, it, expect } from 'vitest';
import { aggregateBudgetByMonth } from './variance';

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
