// @ts-nocheck — v1 orphan; replaced in Tasks 13-39 of fmplus-budget-v2 plan
import ExcelJS from 'exceljs';
import type { BudgetVarianceReport } from '../types';

const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

export async function buildVarianceXlsx(report: BudgetVarianceReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lime Investments';
  for (const seg of report.segments) {
    const ws = wb.addWorksheet(seg.service_line.toUpperCase());
    const header = ['Category', ...MONTHS.map(m => new Date(2000, m-1, 1).toLocaleString('en', { month: 'short' })), 'YTD budget', 'YTD actual', 'Variance', 'Variance %'];
    ws.addRow(header).font = { bold: true };
    for (const cat of seg.categories) {
      const monthCells = MONTHS.map(m => {
        const c = cat.cells.find(x => x.month === m);
        if (!c) return '—';
        return `${Math.round(c.budget)} / ${Math.round(c.actual)}`;
      });
      ws.addRow([cat.category, ...monthCells,
        Math.round(cat.ytd.budget), Math.round(cat.ytd.actual),
        Math.round(cat.ytd.variance), cat.ytd.variance_pct == null ? '' : `${cat.ytd.variance_pct.toFixed(1)}%`,
      ]);
    }
    ws.addRow([]);
    ws.addRow([`${seg.service_line.toUpperCase()} total`, ...MONTHS.map(() => ''),
      Math.round(seg.ytd.budget), Math.round(seg.ytd.actual),
      Math.round(seg.ytd.variance), seg.ytd.variance_pct == null ? '' : `${seg.ytd.variance_pct.toFixed(1)}%`,
    ]).font = { bold: true };
    ws.columns.forEach(col => { col.width = 14; });
  }
  const meta = wb.addWorksheet('Meta');
  meta.addRow(['Project', report.project_name]);
  meta.addRow(['Fiscal year', report.fiscal_year]);
  meta.addRow(['Scenario', report.scenario]);
  meta.addRow(['Status', report.status]);
  meta.addRow(['Health score %', report.health_score_pct.toFixed(2)]);
  meta.addRow(['Unmapped actuals', report.unmapped_actuals_total]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
