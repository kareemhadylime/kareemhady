import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRichAucStyleXlsx } from './parsers/rich-auc-style';
import { commitBudget } from './commit';
import { buildBudgetVariance } from './variance';
import { supabaseAdmin } from '@/lib/supabase';

const RUN = !!process.env.FMPLUS_BUDGET_INTEGRATION;

describe.skipIf(!RUN)('FMPLUS budget — AUC end-to-end', () => {
  it('imports AUC sheet → publishes → variance reconciles within 0.5%', async () => {
    const sb = supabaseAdmin();
    const { data: aa } = await sb.from('odoo_analytic_accounts').select('id, name').ilike('name', 'AUC').maybeSingle();
    expect(aa, 'AUC analytic account must exist').toBeTruthy();
    const auc = aa as { id: number; name: string };

    const buf = readFileSync(join(__dirname, '__fixtures__', 'auc-budget.xlsx'));
    const parsed = await parseRichAucStyleXlsx(buf, { project: 'AUC' });
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows.length).toBeGreaterThan(50);

    const result = await commitBudget({
      projectId: auc.id, fiscalYear: 2026, scenario: 'initial',
      startMonth: 1, rows: parsed.rows, publish: true,
    });
    expect(result.budgetId).toBeGreaterThan(0);
    expect(result.status).toBe('published');

    const variance = await buildBudgetVariance({
      projectId: auc.id, fiscalYear: 2026, scenario: 'initial', ytdThrough: 8,
    });
    expect(variance).toBeTruthy();
    expect(variance!.segments).toHaveLength(1);
    expect(variance!.segments[0].service_line).toBe('hk');

    // High-season annual total reconciliation: ~42.6M EGP per the AUC sheet
    const hkSeg = variance!.segments[0];
    const annualBudget = hkSeg.categories.flatMap(c => c.cells).reduce((s, c) => s + c.budget, 0);
    const expectedAnnual = 42_597_923;
    const drift = Math.abs(annualBudget - expectedAnnual) / expectedAnnual;
    expect(drift, `annual budget drift ${(drift * 100).toFixed(2)}%`).toBeLessThan(0.005);
  });
});
