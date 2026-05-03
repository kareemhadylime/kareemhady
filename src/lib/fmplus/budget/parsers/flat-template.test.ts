import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseFlatBudgetXlsx, FLAT_HEADERS } from './flat-template';

async function buildWorkbook(rows: Array<Record<string, string | number>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('budget');
  ws.addRow(FLAT_HEADERS);
  for (const r of rows) {
    ws.addRow(FLAT_HEADERS.map(h => r[h] ?? ''));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('parseFlatBudgetXlsx', () => {
  it('parses one good row', async () => {
    const buf = await buildWorkbook([{
      project: 'AUC', service_line: 'hk',
      sub_location: 'NC Inner Campus', category: 'manning',
      line_code: 'hk_manager', season: 'high',
      qty: 0.75, unit_cost: 32500,
    }]);
    const result = await parseFlatBudgetXlsx(buf);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      project: 'AUC', service_line: 'hk', category: 'manning',
      season: 'high', qty: 0.75, unit_cost: 32500,
    });
  });

  it('reports row-level errors with row numbers', async () => {
    const buf = await buildWorkbook([
      { project: 'AUC', service_line: 'hk', sub_location: '',
        category: 'manning', line_code: 'hk_manager', season: 'spring',
        qty: 1, unit_cost: 1000 },
      { project: '', service_line: 'hk', sub_location: '',
        category: 'manning', line_code: 'hk_manager', season: 'high',
        qty: -5, unit_cost: 1000 },
    ]);
    const result = await parseFlatBudgetXlsx(buf);
    expect(result.errors.length).toBeGreaterThan(0);
    const rowNumbers = result.errors.map(e => e.row);
    expect(rowNumbers).toContain(2);
    expect(rowNumbers).toContain(3);
  });

  it('rejects unknown service_line', async () => {
    const buf = await buildWorkbook([{
      project: 'AUC', service_line: 'finance',
      sub_location: '', category: 'manning',
      line_code: 'hk_manager', season: 'high', qty: 1, unit_cost: 1000,
    }]);
    const result = await parseFlatBudgetXlsx(buf);
    expect(result.errors[0].message).toMatch(/service_line/i);
  });
});
