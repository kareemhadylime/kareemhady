import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { parseEmaarZoneStyle } from './emaar-zone-style';

const FIXTURE = path.join(__dirname, '..', '__fixtures__', 'emaar-uptown-budget.xlsx');

describe('parseEmaarZoneStyle', () => {
  it('extracts manning rows from Manpower CTC sheet', async () => {
    const result = await parseEmaarZoneStyle(FIXTURE);
    expect(result.rows.length).toBeGreaterThanOrEqual(8);
  });

  it('every row is HK manning', async () => {
    const result = await parseEmaarZoneStyle(FIXTURE);
    expect(result.rows.every(r => r.service_line === 'hk')).toBe(true);
    expect(result.rows.every(r => r.category === 'manning')).toBe(true);
  });

  it('CTC components populated for at least some rows', async () => {
    const result = await parseEmaarZoneStyle(FIXTURE);
    const withFullCtc = result.rows.filter(r =>
      r.ctc_net != null && r.ctc_relievers != null && r.ctc_training != null
    );
    expect(withFullCtc.length).toBeGreaterThan(0);
  });

  it('unit_cost = CTC total >= sum of populated components', async () => {
    const result = await parseEmaarZoneStyle(FIXTURE);
    for (const r of result.rows) {
      const sum = (r.ctc_net ?? 0) + (r.ctc_relievers ?? 0) + (r.ctc_ot ?? 0)
        + (r.ctc_training ?? 0) + (r.ctc_insurance ?? 0) + (r.ctc_medical ?? 0);
      // unit_cost (CTC total) should be >= sum of mapped components
      // (the rest goes to accommodation/transport/uniform/IT which aren't mapped)
      expect(r.unit_cost).toBeGreaterThanOrEqual(sum * 0.99); // 1% tolerance for rounding
    }
  });

  it('all line_codes are unique', async () => {
    const result = await parseEmaarZoneStyle(FIXTURE);
    const codes = result.rows.map(r => r.line_code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('detects zones from Per Zone sheet', async () => {
    const result = await parseEmaarZoneStyle(FIXTURE);
    // Even if all values are blank, zone names like "Sierras", "Alto" should be picked up
    expect(result.zones.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => /zone/i.test(w))).toBe(true);
  });

  it('contract_name is "Emaar Uptown"', async () => {
    const result = await parseEmaarZoneStyle(FIXTURE);
    expect(result.contract_name).toBe('Emaar Uptown');
  });

  it('skipped sheets reported', async () => {
    const result = await parseEmaarZoneStyle(FIXTURE);
    expect(result.skippedSheets.length).toBeGreaterThan(0);
  });
});
