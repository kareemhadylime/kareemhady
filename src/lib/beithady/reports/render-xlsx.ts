// Beithady · Generate Report · XLSX export via exceljs.
// Single sheet: groups × (period × metric) pivot. Header row is two-deep
// (period band on top, metric label below) to match the manual sheet layout.

import 'server-only';
import ExcelJS from 'exceljs';
import type { ReportData } from './types';
import { METRIC_LABEL } from './types';

export async function renderReportXlsx(data: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Beit Hady · Reports';
  wb.created = new Date(data.runAt);

  const ws = wb.addWorksheet('Report', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  });

  const periods = data.config.periods;
  const metrics = data.config.metrics;

  // Header row 1 (period band)
  const row1: (string | null)[] = ['Group'];
  for (const p of periods) {
    for (let i = 0; i < metrics.length; i++) {
      row1.push(i === 0 ? p.label : null);
    }
  }
  ws.addRow(row1);

  // Header row 2 (metric labels)
  const row2: string[] = [''];
  for (const _p of periods) {
    for (const m of metrics) {
      row2.push(METRIC_LABEL[m]);
    }
  }
  ws.addRow(row2);

  // Style header
  ws.getRow(1).font = { bold: true, color: { argb: 'FF1E3A5F' } };
  ws.getRow(2).font = { bold: true };
  ws.getRow(1).alignment = { horizontal: 'center' };

  // Merge period header cells
  let col = 2;
  for (const _p of periods) {
    if (metrics.length > 1) {
      ws.mergeCells(1, col, 1, col + metrics.length - 1);
    }
    col += metrics.length;
  }

  // Body
  for (const r of data.rows) {
    const row: (string | number | null)[] = [
      r.groupLabels.secondary
        ? `${r.groupLabels.primary} · ${r.groupLabels.secondary}`
        : r.groupLabels.primary,
    ];
    for (const p of periods) {
      for (const m of metrics) {
        const c = r.cells[`${p.id}::${m}`];
        row.push(c?.value ?? null);
      }
    }
    ws.addRow(row);
  }

  // Totals
  const totalRow: (string | number | null)[] = ['TOTAL / AVG'];
  for (const p of periods) {
    for (const m of metrics) {
      const c = data.totals[`${p.id}::${m}`];
      totalRow.push(c?.value ?? null);
    }
  }
  const tr = ws.addRow(totalRow);
  tr.font = { bold: true };
  tr.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF0E9D9' },
  };

  // Auto-width columns
  ws.columns.forEach(c => {
    c.width = 16;
  });
  ws.getColumn(1).width = 26;

  // Commentary sheet
  if (data.commentary?.bullets?.length) {
    const ws2 = wb.addWorksheet('Conclusions');
    ws2.addRow(['Bullets']).font = { bold: true };
    for (const b of data.commentary.bullets) ws2.addRow([b]);
    if (data.commentary.action_items?.length) {
      ws2.addRow([]);
      ws2.addRow(['Action items']).font = { bold: true };
      for (const a of data.commentary.action_items) ws2.addRow([a]);
    }
    ws2.getColumn(1).width = 100;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
