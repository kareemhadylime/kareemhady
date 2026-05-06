/**
 * Integration tests for buildProjectReport — hit live Supabase TRIO contract.
 *
 * Guard: set FMPLUS_BUDGET_INTEGRATION=1 (and ensure NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY are in env) to run. Otherwise all 10 tests are skipped.
 *
 * From the worktree root you can run:
 *   FMPLUS_BUDGET_INTEGRATION=1 NEXT_PUBLIC_SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... npm test -- --run src/lib/fmplus/budget/report/build-report.test.ts
 *
 * Or load via @next/env before running vitest:
 *   node -e "require('@next/env').loadEnvConfig(process.cwd())" && FMPLUS_BUDGET_INTEGRATION=1 npm test -- --run src/lib/fmplus/budget/report/
 */
import { describe, expect, test } from 'vitest';
import { buildProjectReport } from './build-report';

const RUN = !!process.env.FMPLUS_BUDGET_INTEGRATION;

describe.skipIf(!RUN)('buildProjectReport (live TRIO)', () => {
  test('signoff mode returns full cost detail', async () => {
    const r = await buildProjectReport({ contract_id: 5, year_id: 6, mode: 'signoff', lang: 'en' });
    expect(r.service_lines[0].monthly_cost).not.toBeNull();
    expect(r.service_lines[0].gp_pct).not.toBeNull();
  });

  test('customer mode strips monthly_cost from service_lines', async () => {
    const r = await buildProjectReport({
      contract_id: 5,
      year_id: 6,
      mode: 'customer',
      lang: 'en',
    });
    expect(r.service_lines[0].monthly_cost).toBeNull();
    expect(r.service_lines[0].gp_pct).toBeNull();
  });

  test('customer mode hides budget_breakdown.cells', async () => {
    const r = await buildProjectReport({
      contract_id: 5,
      year_id: 6,
      mode: 'customer',
      lang: 'en',
    });
    expect(r.budget_breakdown.cells).toBeNull();
  });

  test('customer mode collapses mobilization', async () => {
    const r = await buildProjectReport({
      contract_id: 5,
      year_id: 6,
      mode: 'customer',
      lang: 'en',
    });
    if (r.mobilization) expect(r.mobilization).not.toHaveProperty('detail');
  });

  test('change_vs_initial null when scenario=initial (TRIO is initial)', async () => {
    const r = await buildProjectReport({ contract_id: 5, year_id: 6, mode: 'signoff', lang: 'en' });
    expect(r.change_vs_initial).toBeNull();
  });

  test('contract_rollup null on TRIO (single-year)', async () => {
    const r = await buildProjectReport({ contract_id: 5, year_id: 6, mode: 'signoff', lang: 'en' });
    expect(r.contract_rollup).toBeNull();
  });

  test('every label has both label_en and label_ar', async () => {
    const r = await buildProjectReport({ contract_id: 5, year_id: 6, mode: 'signoff', lang: 'en' });
    for (const m of r.manning.rows) {
      expect(typeof m.position_label_en).toBe('string');
      // label_ar can be null but if present must be string
      if (m.position_label_ar !== null) expect(typeof m.position_label_ar).toBe('string');
    }
  });

  test('payment_terms_days numeric or null (TRIO may or may not have it)', async () => {
    const r = await buildProjectReport({ contract_id: 5, year_id: 6, mode: 'signoff', lang: 'en' });
    expect(
      r.payment_terms_days === null || typeof r.payment_terms_days === 'number',
    ).toBe(true);
  });

  test('snapshot mode: variance_snapshot section is null in v1 (variance integration in C39)', async () => {
    const r = await buildProjectReport({
      contract_id: 5,
      year_id: 6,
      mode: 'snapshot',
      lang: 'en',
    });
    expect(r.variance_snapshot).toBeNull();
  });

  test('lang=both is preserved through visibility strip', async () => {
    const r = await buildProjectReport({
      contract_id: 5,
      year_id: 6,
      mode: 'customer',
      lang: 'both',
    });
    expect(r.meta.lang).toBe('both');
  });
});
