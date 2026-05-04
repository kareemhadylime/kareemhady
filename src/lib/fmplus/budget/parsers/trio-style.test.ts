import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { parseTrioStyle } from './trio-style';

const FIXTURE = path.join(__dirname, '..', '__fixtures__', 'trio-budget.xlsx');

describe('parseTrioStyle', () => {
  it('extracts manning rows from all 5 service sheets', async () => {
    const result = await parseTrioStyle(FIXTURE);
    expect(result.rows.length).toBeGreaterThan(0);
    const services = new Set(result.rows.map(r => r.service_line));
    // Expect at least HK + MEP (sheets with significant manning)
    expect(services.has('hk')).toBe(true);
    expect(services.has('mep')).toBe(true);
  });

  it('every row is a manning line with positive qty and unit_cost', async () => {
    const result = await parseTrioStyle(FIXTURE);
    expect(result.rows.every(r => r.category === 'manning')).toBe(true);
    expect(result.rows.every(r => r.qty > 0)).toBe(true);
    expect(result.rows.every(r => r.unit_cost > 0)).toBe(true);
  });

  it('CTC net populated where source has Net Rate', async () => {
    const result = await parseTrioStyle(FIXTURE);
    const withNet = result.rows.filter(r => r.ctc_net !== null);
    expect(withNet.length).toBeGreaterThan(0);
    // ctc_net should be <= unit_cost (CTC = net + uplift)
    expect(withNet.every(r => r.ctc_net! <= r.unit_cost)).toBe(true);
  });

  it('all line_codes are unique across sheets', async () => {
    const result = await parseTrioStyle(FIXTURE);
    const codes = result.rows.map(r => r.line_code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('reports skipped BOQ + Light Tools sheets in skippedSheets', async () => {
    const result = await parseTrioStyle(FIXTURE);
    expect(result.skippedSheets.length).toBeGreaterThan(0);
    expect(result.skippedSheets.some(s => /boq/i.test(s))).toBe(true);
  });

  it('emits the v2.1 deferred-features warning', async () => {
    const result = await parseTrioStyle(FIXTURE);
    expect(result.warnings.some(w => /tools|consumables|flat template/i.test(w))).toBe(true);
  });
});
