import ExcelJS from 'exceljs';
import { FLAT_HEADERS, type FlatRow } from './flat-template';

export async function writeFlatBudgetXlsx(rows: FlatRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('budget');
  ws.addRow(FLAT_HEADERS as unknown as string[]);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow([
      r.project, r.service_line, r.sub_location ?? '',
      r.category, r.line_code, r.season,
      r.qty, r.unit_cost, r.notes ?? '',
    ]);
  }
  ws.columns.forEach(col => { col.width = 18; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
