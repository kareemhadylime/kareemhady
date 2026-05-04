// @ts-nocheck — v1 orphan; replaced in Tasks 13-39 of fmplus-budget-v2 plan
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRichAucStyleXlsx, isRichAucStyleWorkbook } from './rich-auc-style';

const FIXTURE = join(__dirname, '..', '__fixtures__', 'auc-budget.xlsx');

describe('parseRichAucStyleXlsx', () => {
  it('detects AUC-style workbook by sheet names', async () => {
    const buf = readFileSync(FIXTURE);
    expect(await isRichAucStyleWorkbook(buf)).toBe(true);
  });

  it('extracts manning lines from the Total Manning sheet', async () => {
    const buf = readFileSync(FIXTURE);
    const result = await parseRichAucStyleXlsx(buf, { project: 'AUC' });
    expect(result.errors).toHaveLength(0);
    const manningHigh = result.rows.filter(r =>
      r.category === 'manning' && r.season === 'high',
    );
    expect(manningHigh.length).toBeGreaterThan(0);
    const hkMgr = manningHigh.find(r => r.line_code === 'hk_manager');
    expect(hkMgr).toBeDefined();
  });

  it('totals reconcile with sheet Grand Total within 0.5%', async () => {
    const buf = readFileSync(FIXTURE);
    const result = await parseRichAucStyleXlsx(buf, { project: 'AUC' });

    // The AUC "Budget Items Summary" row "Manpower Costs - Transportation & Insurance Included"
    // sums GrandTotal!G6:G20 (manning) + GrandTotal!G28:G33 (transport) = 2,466,250.
    // We parse these as separate categories; verify the combined total.
    const hiManningSum = result.rows
      .filter(r => r.category === 'manning' && r.season === 'high')
      .reduce((s, r) => s + r.qty * r.unit_cost, 0);

    const hiTransportSum = result.rows
      .filter(r => r.category === 'transport' && r.season === 'high')
      .reduce((s, r) => s + r.qty * r.unit_cost, 0);

    const hiCombined = hiManningSum + hiTransportSum;

    // Ground truth per AUC Budget Items Summary (formula result stored in XLSX)
    const expected = 2_466_250;
    const drift = Math.abs(hiCombined - expected) / expected;
    expect(drift).toBeLessThan(0.005);
  });
});
