import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { parseAucStyle } from './rich-auc-style';

const FIXTURE = path.join(__dirname, '..', '__fixtures__', 'auc-budget.xlsx');

describe('parseAucStyle', () => {
  it('extracts >= 30 budget lines from the AUC fixture', async () => {
    const result = await parseAucStyle(FIXTURE);
    expect(result.rows.length).toBeGreaterThanOrEqual(30);
  });

  it('only HK service line', async () => {
    const result = await parseAucStyle(FIXTURE);
    expect(result.rows.every(r => r.service_line === 'hk')).toBe(true);
  });

  it('produces all 5 categories (manning, tools, consumables, transport, it)', async () => {
    const result = await parseAucStyle(FIXTURE);
    const cats = new Set(result.rows.map(r => r.category));
    expect(cats.has('manning')).toBe(true);
    expect(cats.has('tools')).toBe(true);
    expect(cats.has('consumables')).toBe(true);
    expect(cats.has('transport')).toBe(true);
    expect(cats.has('it')).toBe(true);
  });

  it('manning rows have qty>0 but unit_cost=0 (CTC pending in Editor)', async () => {
    const result = await parseAucStyle(FIXTURE);
    const manning = result.rows.filter(r => r.category === 'manning');
    expect(manning.length).toBeGreaterThan(0);
    expect(manning.every(r => r.qty > 0)).toBe(true);
    expect(manning.every(r => r.unit_cost === 0)).toBe(true);
  });

  it('tools, consumables, transport rows have unit_cost > 0 and qty > 0', async () => {
    // Note: IT rows may have unit_cost=0 when the fixture omits price (blank in source)
    const result = await parseAucStyle(FIXTURE);
    const pricedCategories = result.rows.filter(
      r => r.category === 'tools' || r.category === 'consumables' || r.category === 'transport',
    );
    expect(pricedCategories.length).toBeGreaterThan(0);
    expect(pricedCategories.every(r => r.qty > 0 && r.unit_cost > 0)).toBe(true);
  });

  it('all line_codes are unique', async () => {
    const result = await parseAucStyle(FIXTURE);
    const codes = result.rows.map(r => r.line_code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('validation summary populated', async () => {
    const result = await parseAucStyle(FIXTURE);
    expect(Object.keys(result.validation.summary).length).toBeGreaterThan(0);
  });
});
