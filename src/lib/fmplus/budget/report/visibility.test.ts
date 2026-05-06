import { describe, expect, test } from 'vitest';
import { applyVisibility } from './visibility';
import type { ReportData } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const baseFixture = (): ReportData => ({
  meta: {
    contract: { id: 5 } as any,
    year: { id: 6 } as any,
    mode: 'signoff',
    lang: 'en',
    generated_at: '2026-05-05',
    generated_by: 'test',
  },
  project_details: { customer_contacts: [], zones: [], scope_summary: null, services: ['hk'] },
  service_lines: [
    {
      service_line: 'hk',
      hc_required: 50,
      hc_budgeted: 60,
      monthly_cost: 100000,
      monthly_fee: 120000,
      annual_ex_vat: 1440000,
      annual_incl_vat: 1641600,
      gp_pct: 16.6,
      gp_egp: 240000,
    } as any,
  ],
  manning: {
    rows: [
      {
        service_line: 'hk',
        sub_section: null,
        position_label_en: 'Janitor',
        position_label_ar: null,
        hc_required: 50,
        hc_budgeted: 60,
        ctc_rate: 6200,
        monthly_cost: 372000,
      },
    ],
    totals_by_service: { hk: { hc_required: 50, hc_budgeted: 60 } } as any,
  },
  budget_breakdown: {
    cells: [
      {
        service_line: 'hk',
        category: 'manning',
        monthly: 372000,
        annual: 4464000,
        green_amber_red: null,
      },
    ],
    category_totals: [{ category: 'manning', monthly: 372000 }],
    service_totals: [{ service_line: 'hk', monthly: 100000 }],
  },
  mobilization: {
    detail: [
      {
        category: 'capex',
        label_en: 'X',
        label_ar: null,
        qty: 1,
        unit_cost: 50000,
        total: 50000,
        amortization_months: 24,
      },
    ],
  },
  payment_terms: 'Net 30',
  payment_terms_days: 30,
  change_vs_initial: null,
  variance_snapshot: null,
  contract_rollup: null,
  signoff: { lines: [], history: [] },
});

describe('applyVisibility', () => {
  test('signoff mode: returns data unchanged', () => {
    const data = baseFixture();
    const result = applyVisibility(data, 'signoff');
    expect(result).toBe(data);
  });

  test('customer mode: strips ctc_rate from manning rows', () => {
    const result = applyVisibility(baseFixture(), 'customer');
    expect(result.manning.rows[0].ctc_rate).toBeNull();
  });

  test('customer mode: strips gp_pct + gp_egp from service_lines', () => {
    const result = applyVisibility(baseFixture(), 'customer');
    expect(result.service_lines[0].gp_pct).toBeNull();
    expect(result.service_lines[0].gp_egp).toBeNull();
  });

  test('customer mode: hides budget_breakdown.cells', () => {
    const result = applyVisibility(baseFixture(), 'customer');
    expect(result.budget_breakdown.cells).toBeNull();
    expect(result.budget_breakdown.category_totals).toBeNull();
  });

  test('customer mode: collapses mobilization to summary', () => {
    const result = applyVisibility(baseFixture(), 'customer');
    expect(result.mobilization).not.toHaveProperty('detail');
    expect(result.mobilization).toHaveProperty('summary_text');
    expect(result.mobilization).toHaveProperty('total_egp', 50000);
  });
});
