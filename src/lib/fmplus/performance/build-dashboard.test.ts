// src/lib/fmplus/performance/build-dashboard.test.ts
import { describe, expect, test, vi } from 'vitest';

// Helper: build a 12-month cells array with the period-month value set; other months 0.
function makeCells(periodMonth: number, periodBudget: number, periodActual: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const isPeriod = m === periodMonth;
    return {
      month: m,
      budget: isPeriod ? periodBudget : 0,
      actual: isPeriod ? periodActual : 0,
      mob_amortized: 0,
      variance: 0,
      variance_pct: null,
      color: 'green' as const,
    };
  });
}

vi.mock('@/lib/fmplus/budget/variance', () => ({
  // Period in test is March (month=3). Manning sliced to Mar = 850K actual / 800K budget.
  // PPE sliced to Mar = 90K actual / 100K budget.
  buildBudgetVarianceV2: vi.fn().mockResolvedValue({
    contract_id: 1,
    contract_name: 'TestContract',
    year_id: 10,
    year_index: 1,
    fiscal_year: 2026,
    scenario: 'initial',
    status: 'draft',
    bilingual: 'en',
    segments: [
      {
        service_line: 'hk',
        segment_budget: 1_200_000,
        segment_actual: 1_100_000,
        segment_variance_pct: -0.083,
        categories: [
          { category: 'manning', label_en: 'Manning', label_ar: null, cells: makeCells(3, 800_000, 850_000), ytd_budget: 800_000, ytd_actual: 850_000, ytd_variance: 50_000, ytd_variance_pct: 0.0625, ytd_color: 'amber' },
          { category: 'ppe', label_en: 'PPE', label_ar: null, cells: makeCells(3, 100_000, 90_000), ytd_budget: 100_000, ytd_actual: 90_000, ytd_variance: -10_000, ytd_variance_pct: -0.1, ytd_color: 'amber' },
        ],
      },
    ],
    total_budget: 1_200_000,
    total_actual: 1_100_000,
    total_variance_pct: -0.083,
    unmapped_actuals: 0,
    generated_at: '2026-04-01T00:00:00Z',
  }),
}));

// Build a chainable supabase mock that resolves to fixtures depending on the table.
function makeSb() {
  const tableState: Record<string, { single?: unknown; many?: unknown[] }> = {
    project_contracts: {
      single: {
        id: 1,
        name: 'TestContract',
        customer: 'TestCustomer',
        project_id: 99,
        contract_value: 14_400_000,
        start_date: '2026-01-01',
        end_date: '2027-01-01',
      },
    },
    project_years: {
      many: [
        { id: 10, year_index: 1, fiscal_year: 2026, scenario: 'initial', status: 'draft', published_at: null },
      ],
    },
    budget_lines: {
      many: [
        { qty: 10, unit_cost: 5000, ctc_ot: 200 },
      ],
    },
    mobilization_lines: {
      many: [],
    },
  };

  function builder(table: string) {
    const promiseShape = (data: unknown) => Promise.resolve({ data, error: null });
    const state = tableState[table] ?? {};
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => promiseShape(state.many ?? []),
      single: () => promiseShape(state.single ?? null),
      then: undefined,
    };
    // Make chain itself thenable for `await sb.from(t).select().eq()` (no .order/.limit/.single).
    return new Proxy(chain, {
      get(target: Record<string, unknown>, prop: string) {
        if (prop === 'then') {
          // `await` on the chain resolves to many[]
          return (resolve: (v: unknown) => void) => resolve({ data: state.many ?? [], error: null });
        }
        return target[prop];
      },
    });
  }

  return {
    from: builder,
    rpc: () => Promise.resolve({ data: [], error: null }),
  };
}

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => makeSb(),
}));

const { buildContractDashboard } = await import('./build-dashboard');

describe('buildContractDashboard', () => {
  test('happy path returns all 13 sections', async () => {
    const r = await buildContractDashboard({
      contract_id: 1,
      period: { chip: 'prev-month', from: '2026-03-01', to: '2026-03-31', label: 'Mar 2026' },
    });
    expect(r.meta.contract_id).toBe(1);
    expect(r.kpis).toHaveLength(5);
    expect(r.service_lines.length).toBeGreaterThan(0);
    expect(Array.isArray(r.unmapped)).toBe(true);
  });

  test('period filter slices actuals to only the selected months', async () => {
    // Period = March only. Mock has manning Mar=850K + ppe Mar=90K → 940K total
    // (NOT the full-year 1.1M total_actual). This proves slicing works.
    const r = await buildContractDashboard({
      contract_id: 1,
      period: { chip: 'prev-month', from: '2026-03-01', to: '2026-03-31', label: 'Mar 2026' },
    });
    const hk = r.service_lines.find(s => s.service_line === 'hk');
    expect(hk).toBeDefined();
    expect(hk!.actual).toBe(940_000); // Mar manning + Mar ppe
    expect(hk!.budget).toBe(900_000); // Mar manning budget + Mar ppe budget
    const expense = r.kpis.find(k => k.id === 'expense');
    expect(expense!.value).toBe(940_000); // NOT 1_100_000 (full year)
  });

  test('compare=true returns prior block', async () => {
    const r = await buildContractDashboard({
      contract_id: 1,
      period: { chip: 'prev-month', from: '2026-03-01', to: '2026-03-31', label: 'Mar 2026' },
      compare: true,
    });
    expect(r.prior).toBeDefined();
    expect(r.prior!.kpis).toHaveLength(5);
  });
});
