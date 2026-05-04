import ExcelJS from 'exceljs';
import type { FlatRow } from './flat-template';

const COLUMNS: Array<keyof FlatRow> = [
  'contract_name', 'customer', 'year_index', 'service_line', 'category',
  'line_code', 'label_en', 'label_ar', 'season', 'qty', 'unit_cost',
  'ctc_net', 'ctc_relievers', 'ctc_ot', 'ctc_training', 'ctc_insurance', 'ctc_medical',
  'threshold_green', 'threshold_amber', 'notes',
];

const HEADER_TITLES: Record<string, string> = {
  contract_name: 'Contract',
  customer: 'Customer',
  year_index: 'Year',
  service_line: 'Service',
  category: 'Category',
  line_code: 'Code',
  label_en: 'Label (EN)',
  label_ar: 'Label (AR)',
  season: 'Season',
  qty: 'Qty / HC',
  unit_cost: 'Unit Cost',
  ctc_net: 'CTC Net',
  ctc_relievers: 'CTC Relievers',
  ctc_ot: 'CTC OT',
  ctc_training: 'CTC Training',
  ctc_insurance: 'CTC Insurance',
  ctc_medical: 'CTC Medical',
  threshold_green: 'Threshold Green %',
  threshold_amber: 'Threshold Amber %',
  notes: 'Notes',
};

/**
 * Write a flat-template XLSX. Header row uses lowercase column keys (matching
 * the parser) but with friendlier titles via cell formatting.
 *
 * Returns a Buffer ready to be sent as a download.
 */
export async function exportFlatTemplate(rows: FlatRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FM+ Budget v2';
  wb.created = new Date();
  const sheet = wb.addWorksheet('Budget Lines');

  sheet.columns = COLUMNS.map(key => ({
    header: key, // parser uses these lowercase header keys
    key: String(key),
    width: Math.max(12, String(HEADER_TITLES[key] ?? key).length + 4),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of rows) {
    sheet.addRow(row as unknown as Record<string, unknown>);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * Generate an empty flat template (header row only) for first-time downloads.
 * This is what the "Download blank template" link in the Import UI returns.
 */
export async function exportEmptyFlatTemplate(): Promise<Buffer> {
  return exportFlatTemplate([]);
}
