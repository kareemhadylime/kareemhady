import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { writeFile, unlink } from 'node:fs/promises';
import { parseFlatTemplate, type FlatRow } from './flat-template';
import { exportFlatTemplate, exportEmptyFlatTemplate } from './flat-template-export';

describe('flat-template round-trip', () => {
  it('exports and reparses without loss', async () => {
    const original: FlatRow[] = [
      {
        contract_name: 'AUC',
        customer: 'AUC',
        year_index: 1,
        service_line: 'hk',
        category: 'manning',
        line_code: 'hk_mf_8h',
        label_en: 'HK Male/Female 8H',
        label_ar: 'عامل نظافة',
        season: 'high',
        qty: 120,
        unit_cost: 12840,
        ctc_net: 7500,
        ctc_relievers: 1250,
        ctc_ot: 1800,
        ctc_training: 240,
        ctc_insurance: 1250,
        ctc_medical: 800,
        threshold_green: 3,
        threshold_amber: 10,
        notes: 'EGP minimum-wage clause',
      },
      {
        contract_name: 'AUC',
        customer: 'AUC',
        year_index: 1,
        service_line: 'hk',
        category: 'tools',
        line_code: 'tool_broom_soft',
        label_en: 'Soft Broom',
        label_ar: null,
        season: 'high',
        qty: 24,
        unit_cost: 85,
        ctc_net: null,
        ctc_relievers: null,
        ctc_ot: null,
        ctc_training: null,
        ctc_insurance: null,
        ctc_medical: null,
        threshold_green: null,
        threshold_amber: null,
        notes: null,
      },
    ];

    const buf = await exportFlatTemplate(original);
    const tmp = path.join(os.tmpdir(), `flat-test-${Date.now()}.xlsx`);
    await writeFile(tmp, buf);
    try {
      const result = await parseFlatTemplate(tmp);
      expect(result.errors).toEqual([]);
      expect(result.rows).toHaveLength(original.length);

      for (let i = 0; i < original.length; i++) {
        const r = result.rows[i];
        const o = original[i];
        expect(r.contract_name).toBe(o.contract_name);
        expect(r.year_index).toBe(o.year_index);
        expect(r.service_line).toBe(o.service_line);
        expect(r.category).toBe(o.category);
        expect(r.line_code).toBe(o.line_code);
        expect(r.label_en).toBe(o.label_en);
        expect(r.label_ar).toBe(o.label_ar);
        expect(r.qty).toBe(o.qty);
        expect(r.unit_cost).toBe(o.unit_cost);
        expect(r.ctc_net).toBe(o.ctc_net);
        expect(r.threshold_green).toBe(o.threshold_green);
      }
    } finally {
      await unlink(tmp).catch(() => {});
    }
  });

  it('rejects v1 flat template (missing year_index column)', async () => {
    // Simulate a v1 template (no year_index column)
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Budget');
    sheet.addRow(['contract_name','service_line','category','line_code','label_en','qty','unit_cost']);
    sheet.addRow(['AUC','hk','manning','hk_manager','HK Manager',1,38500]);
    const buf = await wb.xlsx.writeBuffer();
    const tmp = path.join(os.tmpdir(), `v1-test-${Date.now()}.xlsx`);
    await writeFile(tmp, Buffer.from(buf));
    try {
      const result = await parseFlatTemplate(tmp);
      expect(result.rows).toHaveLength(0);
      expect(result.errors.some(e => /year_index/.test(e.message))).toBe(true);
    } finally {
      await unlink(tmp).catch(() => {});
    }
  });

  it('exportEmptyFlatTemplate produces a header-only workbook', async () => {
    const buf = await exportEmptyFlatTemplate();
    const tmp = path.join(os.tmpdir(), `empty-test-${Date.now()}.xlsx`);
    await writeFile(tmp, buf);
    try {
      const result = await parseFlatTemplate(tmp);
      expect(result.errors).toEqual([]);
      expect(result.rows).toHaveLength(0);
    } finally {
      await unlink(tmp).catch(() => {});
    }
  });

  it('reports per-row errors without aborting valid rows', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Budget');
    sheet.addRow(['contract_name','customer','year_index','service_line','category','line_code','label_en','qty','unit_cost']);
    sheet.addRow(['AUC','AUC',1,'hk','manning','hk_manager','HK Manager',1,38500]);   // valid
    sheet.addRow(['AUC','AUC',1,'unknown','manning','x','X',1,1]);                    // bad service_line
    sheet.addRow(['AUC','AUC',1,'hk','manning','','no-code',1,1]);                    // missing line_code
    const buf = await wb.xlsx.writeBuffer();
    const tmp = path.join(os.tmpdir(), `partial-test-${Date.now()}.xlsx`);
    await writeFile(tmp, Buffer.from(buf));
    try {
      const result = await parseFlatTemplate(tmp);
      expect(result.rows).toHaveLength(1); // only the valid row
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    } finally {
      await unlink(tmp).catch(() => {});
    }
  });
});
