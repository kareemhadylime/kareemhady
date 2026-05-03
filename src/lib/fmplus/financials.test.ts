// src/lib/fmplus/financials.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { Period } from './types';

// Fixture rows representing Feb 2026 Excel structure (subset for unit testing).
// Income amounts are credit-normal (negative in raw debit-credit form).
// Expense / direct-cost amounts are debit-normal (positive).
const FIXTURE_ROWS = [
  { period_key: 'm:2026-02', code: '400001', name: 'House Keeping Revenue', account_type: 'income',              sum_balance: -20625702.99, line_count: 50 },
  { period_key: 'm:2026-02', code: '400002', name: 'MEP Revenue',           account_type: 'income',              sum_balance: -11747221.57, line_count: 30 },
  { period_key: 'm:2026-02', code: '400003', name: 'Security Revenue',     account_type: 'income',              sum_balance:  -3128301,    line_count: 10 },
  { period_key: 'm:2026-02', code: '500001', name: 'Basic Salary Hk',       account_type: 'expense_direct_cost', sum_balance:   7265784.56, line_count: 100 },
  { period_key: 'm:2026-02', code: '500201', name: 'Depreciation - Equipment Hk', account_type: 'expense_direct_cost', sum_balance: 373484.82, line_count: 5 },
  { period_key: 'm:2026-02', code: '510001', name: 'Basic Salary MEP',      account_type: 'expense_direct_cost', sum_balance:   4000000,    line_count: 60 },
  { period_key: 'm:2026-02', code: '600001', name: 'Basic Salary BO',       account_type: 'expense',             sum_balance:   3000000,    line_count: 20 },
  { period_key: 'm:2026-02', code: '607001', name: 'Interest',              account_type: 'expense',             sum_balance:   1113260.52, line_count: 8 },
  { period_key: 'm:2026-02', code: '608001', name: 'Depreciation',          account_type: 'expense_depreciation',sum_balance:    410819.7,  line_count: 4 },
];

vi.mock('../supabase', () => ({
  supabaseAdmin: () => {
    // Build a chainable .from(table).select(...).<method chain>.range(...) builder
    // that always resolves to { data: [], error: null }.
    const builder: any = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'then') return undefined; // not a thenable
        if (prop === 'range') return () => Promise.resolve({ data: [], error: null });
        return () => builder;
      },
    });
    return {
      from: () => builder,
      rpc: vi.fn().mockResolvedValue({ data: FIXTURE_ROWS, error: null }),
    };
  },
}));

import { buildFmplusPnl, buildFmplusBalanceSheet } from './financials';

describe('buildFmplusPnl', () => {
  const fmplusCompanyId = 99;
  const period: Period = {
    key: 'm:2026-02', label: 'Feb 2026',
    fromDate: '2026-02-01', toDate: '2026-02-28',
  };

  it('rolls up revenue across HK + MEP + Security rows (flipped to display)', async () => {
    const r = await buildFmplusPnl({
      periods: [period],
      scope: { mode: 'trend', companyIds: [fmplusCompanyId], includeDrafts: true, withDep: true },
    });
    // Income raw is credit-normal negative; classifier flips → display positive.
    // Sum: 20,625,702.99 + 11,747,221.57 + 3,128,301 = 35,501,225.56
    expect(r.sections.revenue.totals['m:2026-02']).toBeCloseTo(35501225.56, 0);
  });

  it('places HK Tools depreciation under cost_of_revenue.hk.tools when withDep=true', async () => {
    const r = await buildFmplusPnl({
      periods: [period],
      scope: { mode: 'trend', companyIds: [fmplusCompanyId], includeDrafts: true, withDep: true },
    });
    const hk = r.sections.cost_of_revenue.serviceLines!.find(s => s.service === 'hk')!;
    const tools = hk.subgroups.find(g => g.key === 'tools')!;
    expect(tools.totals['m:2026-02']).toBeCloseTo(373484.82, 2);
  });

  it('moves HK Tools depreciation OUT of COGS into bottom Depreciation when withDep=false', async () => {
    const r = await buildFmplusPnl({
      periods: [period],
      scope: { mode: 'trend', companyIds: [fmplusCompanyId], includeDrafts: true, withDep: false },
    });
    const hk = r.sections.cost_of_revenue.serviceLines!.find(s => s.service === 'hk')!;
    const tools = hk.subgroups.find(g => g.key === 'tools');
    expect(tools).toBeUndefined();
    const dep = r.sections.interest_tax_dep.subgroups.find(g => g.key === 'depreciation')!;
    // 608001 (410,819.70) + 500201 (373,484.82) = 784,304.52
    expect(dep.totals['m:2026-02']).toBeCloseTo(410819.7 + 373484.82, 2);
  });

  it('Net Profit identical between with-dep and no-dep views (depreciation is reorganized, not added)', async () => {
    const a = await buildFmplusPnl({ periods: [period], scope: { mode: 'trend', companyIds: [fmplusCompanyId], includeDrafts: true, withDep: true } });
    const b = await buildFmplusPnl({ periods: [period], scope: { mode: 'trend', companyIds: [fmplusCompanyId], includeDrafts: true, withDep: false } });
    expect(a.subtotals.net_profit['m:2026-02']).toBeCloseTo(b.subtotals.net_profit['m:2026-02']!, 2);
  });

  it('computes Gross Profit = Revenue - Cost of Revenue', async () => {
    const r = await buildFmplusPnl({
      periods: [period],
      scope: { mode: 'trend', companyIds: [fmplusCompanyId], includeDrafts: true, withDep: true },
    });
    const expected = (r.sections.revenue.totals['m:2026-02'] || 0) - (r.sections.cost_of_revenue.totals['m:2026-02'] || 0);
    expect(r.subtotals.gross_profit['m:2026-02']).toBeCloseTo(expected, 2);
  });
});

describe('buildFmplusBalanceSheet', () => {
  it('returns a balanced empty report when seed is empty and no move lines exist', async () => {
    const r = await buildFmplusBalanceSheet({
      periods: [{ key: 'm:2026-02', label: 'Feb 2026', fromDate: '2026-02-01', toDate: '2026-02-28' }],
      scope: { mode: 'trend', companyIds: [99], includeDrafts: true, withDep: true },
    });
    expect(r.balanced['m:2026-02']).toBe(true);
    expect(Math.abs(r.delta['m:2026-02']!)).toBeLessThan(1);
    expect(r.assets.groups).toEqual([]);
    expect(r.liabilities.groups).toEqual([]);
    expect(r.equity.groups).toEqual([]);
  });
});
