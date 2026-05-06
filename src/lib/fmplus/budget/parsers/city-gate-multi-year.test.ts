import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { parseCityGateMultiYear } from './city-gate-multi-year';

const FIXTURE = path.join(__dirname, '..', '__fixtures__', 'city-gate-budget.xlsx');

describe('parseCityGateMultiYear', () => {
  it('extracts manning rows across both years', async () => {
    const result = await parseCityGateMultiYear(FIXTURE);
    expect(result.rows.length).toBeGreaterThan(0);
    const yearsInResult = new Set(result.rows.map(r => r.year_index));
    expect(yearsInResult.has(1)).toBe(true);
    expect(yearsInResult.has(2)).toBe(true);
  });

  it('every row is manning with positive qty and unit_cost', async () => {
    const result = await parseCityGateMultiYear(FIXTURE);
    expect(result.rows.every(r => r.category === 'manning')).toBe(true);
    expect(result.rows.every(r => r.qty > 0)).toBe(true);
    expect(result.rows.every(r => r.unit_cost > 0)).toBe(true);
  });

  it('multiple service lines covered (mep + landscape + security + pest_ctrl)', async () => {
    const result = await parseCityGateMultiYear(FIXTURE);
    const services = new Set(result.rows.map(r => r.service_line));
    // Expect at least 3 of the 4 expected services to have data
    const expected = ['mep', 'landscape', 'security', 'pest_ctrl'];
    const matched = expected.filter(s => services.has(s as 'mep' | 'landscape' | 'security' | 'pest_ctrl'));
    expect(matched.length).toBeGreaterThanOrEqual(3);
  });

  it('all line_codes are unique', async () => {
    const result = await parseCityGateMultiYear(FIXTURE);
    const codes = result.rows.map(r => r.line_code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('reports skipped sheets (HK & Waste / Mobilization / Transportation / FM Fees)', async () => {
    const result = await parseCityGateMultiYear(FIXTURE);
    expect(result.skippedSheets.length).toBeGreaterThan(0);
  });

  it('emits the v2.1 deferred-features warning', async () => {
    const result = await parseCityGateMultiYear(FIXTURE);
    expect(result.warnings.some(w => /HK.*Waste|Mobilization|Transportation/i.test(w))).toBe(true);
  });

  it('contract_name is "City Gate"', async () => {
    const result = await parseCityGateMultiYear(FIXTURE);
    expect(result.contract_name).toBe('City Gate');
  });
});
