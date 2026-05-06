// src/lib/fmplus/performance/build-portfolio.test.ts
import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/fmplus/budget/portfolio', () => ({
  buildPortfolio: vi.fn().mockResolvedValue([
    {
      contract_id: 1,
      project_id: 11,
      project_name: 'Trio',
      customer: 'SODIC',
      year_tracking: 'contract',
      duration_months: 12,
      contract_value: 14_400_000,
      current_year_index: 1,
      total_years: 1,
      current_year_label: 'Y1',
      service_lines: ['hk'],
      has_back_office: false,
      current_year_revenue: 0,
      current_year_status: 'draft',
      yoy_revenue_change: null,
      mob_total: 0,
      mob_roi_pct: null,
      health: 'green',
    },
    {
      contract_id: 2,
      project_id: 22,
      project_name: 'Uptown',
      customer: 'EMAAR',
      year_tracking: 'contract',
      duration_months: 12,
      contract_value: 12_000_000,
      current_year_index: 1,
      total_years: 1,
      current_year_label: 'Y1',
      service_lines: ['hk'],
      has_back_office: false,
      current_year_revenue: 0,
      current_year_status: 'draft',
      yoy_revenue_change: null,
      mob_total: 0,
      mob_roi_pct: null,
      health: 'green',
    },
  ]),
}));

vi.mock('@/lib/fmplus/budget/variance', () => ({
  buildBudgetVarianceV2: vi.fn().mockImplementation((opts: { contractId: number }) =>
    Promise.resolve(
      opts.contractId === 1
        ? { total_budget: 1_000_000, total_actual: 1_500_000, segments: [], unmapped_actuals: 0 }
        : { total_budget: 1_000_000, total_actual:   950_000, segments: [], unmapped_actuals: 0 },
    ),
  ),
}));

const { buildPortfolioPerformance } = await import('./build-portfolio');

describe('buildPortfolioPerformance', () => {
  test('aggregates totals + sorts by |variance_pct| desc', async () => {
    const r = await buildPortfolioPerformance({
      period: { chip: 'prev-month', from: '2026-03-01', to: '2026-03-31', label: 'Mar 2026' },
    });
    expect(r.totals.expense).toBe(2_450_000);
    expect(r.contracts[0].contract_id).toBe(1);          // worst variance first
    expect(r.contracts[0].variance_pct).toBeCloseTo(0.50, 2);
    expect(r.needs_attention).toHaveLength(1);
  });
});
