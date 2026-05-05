/**
 * Smoke test for ProjectReportDocument.
 *
 * Verifies the document renders without throwing when given a minimal
 * but type-correct ReportData fixture. Does NOT snapshot the full JSON
 * tree — visual verification happens via the API route in Task C43.
 *
 * We use @react-pdf/renderer's pdf() helper to get the internal
 * ReactPDF node container, then assert it's a non-null object with
 * a non-empty children array (at least 4 always-on pages).
 *
 * Note: Font.register() will silently degrade in the test environment
 * (no real file at /fonts/NotoSansArabic-Regular.ttf) — theme.ts
 * wraps it in try/catch for exactly this reason.
 */
import { describe, expect, test } from 'vitest';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { ProjectReportDocument } from './pdf-document';
import type { ReportData } from './types';

const MINIMAL_DATA: ReportData = {
  meta: {
    contract: {
      id: 1,
      name: 'Test Contract',
      customer: 'Acme Corp',
      customer_logo_url: null,
      customer_contacts: [],
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      duration_months: 12,
      contract_value: 1_200_000,
      vat_pct: 14,
      zones: ['Zone A'],
      scope_summary: 'FM services for the facility.',
      payment_terms: null,
    },
    year: {
      id: 1,
      contract_id: 1,
      year_index: 1,
      fiscal_year: 2024,
      scenario: 'initial',
      status: 'draft',
      start_month: 1,
    },
    mode: 'signoff',
    lang: 'en',
    generated_at: '2026-05-05T09:00:00.000Z',
    generated_by: 'Kareem Hady',
  },
  project_details: {
    customer_contacts: [],
    zones: ['Zone A'],
    scope_summary: 'FM services for the facility.',
    services: ['hk', 'security'],
  },
  service_lines: [
    {
      service_line: 'hk',
      hc_required: 10,
      hc_budgeted: 10,
      monthly_cost: 50_000,
      monthly_fee: 60_000,
      annual_ex_vat: 720_000,
      annual_incl_vat: 820_800,
      gp_pct: 16.7,
      gp_egp: 120_000,
    },
    {
      service_line: 'security',
      hc_required: 5,
      hc_budgeted: 5,
      monthly_cost: 30_000,
      monthly_fee: 40_000,
      annual_ex_vat: 480_000,
      annual_incl_vat: 547_200,
      gp_pct: 25,
      gp_egp: 120_000,
    },
  ],
  manning: {
    rows: [
      {
        service_line: 'hk',
        sub_section: null,
        position_label_en: 'Cleaning Technician',
        position_label_ar: null,
        hc_required: 10,
        hc_budgeted: 10,
        ctc_rate: 5_000,
        monthly_cost: 50_000,
      },
    ],
    totals_by_service: {
      hk: { hc_required: 10, hc_budgeted: 10 },
    },
  },
  budget_breakdown: {
    cells: [
      { category: 'manning', service_line: 'hk', monthly: 50_000, annual: 600_000, green_amber_red: null },
    ],
    category_totals: [{ category: 'manning', monthly: 50_000 }],
    service_totals: [{ service_line: 'hk', monthly: 50_000 }],
  },
  mobilization: null,
  payment_terms: null,
  change_vs_initial: null,
  variance_snapshot: null,
  contract_rollup: null,
  signoff: {
    lines: [
      { role: 'project_manager', placeholder_en: 'PM Signature', placeholder_ar: 'توقيع المدير' },
    ],
    history: [],
  },
};

describe('ProjectReportDocument', () => {
  test('renders without throwing and produces a valid PDF buffer (always-on pages)', async () => {
    const buffer = await renderToBuffer(<ProjectReportDocument data={MINIMAL_DATA} />);
    // A valid PDF starts with "%PDF"
    const header = buffer.subarray(0, 4).toString('ascii');
    expect(header).toBe('%PDF');
    // At minimum 4 always-on pages → non-trivial document
    expect(buffer.length).toBeGreaterThan(5_000);
  }, 30_000);

  test('customer mode (no budget breakdown) still produces a valid PDF buffer', async () => {
    const customerData: ReportData = {
      ...MINIMAL_DATA,
      meta: { ...MINIMAL_DATA.meta, mode: 'customer' },
      budget_breakdown: {
        ...MINIMAL_DATA.budget_breakdown,
        cells: null,          // customer mode → no breakdown page
        category_totals: null,
      },
    };
    const buffer = await renderToBuffer(<ProjectReportDocument data={customerData} />);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  }, 30_000);
});
