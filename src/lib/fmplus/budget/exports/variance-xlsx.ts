import ExcelJS from 'exceljs';
import type { BudgetVarianceReportV2 } from '../variance';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Generate an XLSX export of a variance report. Returns a Buffer ready to be
 * sent as a download. The workbook has one sheet per service segment + a
 * Summary sheet at the front.
 */
export async function exportVarianceXlsx(report: BudgetVarianceReportV2): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FM+ Budget v2';
  wb.created = new Date();

  // Summary sheet
  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Field', key: 'field', width: 28 },
    { header: 'Value', key: 'value', width: 40 },
  ];
  summary.addRows([
    ['Contract', report.contract_name],
    ['Year', `Y${report.year_index}${report.fiscal_year ? ` (FY ${report.fiscal_year})` : ''}`],
    ['Scenario', report.scenario],
    ['Status', report.status],
    ['Total Budget', report.total_budget],
    ['Total Actual', report.total_actual],
    ['Total Variance %', report.total_variance_pct != null ? `${(report.total_variance_pct * 100).toFixed(2)}%` : '—'],
    ['Unmapped Actuals', report.unmapped_actuals],
    ['Generated', report.generated_at],
  ].map(([field, value]) => ({ field, value })));
  summary.getRow(1).font = { bold: true };

  // Per-segment sheets
  for (const seg of report.segments) {
    const sheet = wb.addWorksheet(seg.service_line.toUpperCase().slice(0, 31));
    sheet.columns = [
      { header: 'Category', key: 'category', width: 28 },
      ...MONTHS.map((m, i) => ({ header: m, key: `m${i+1}`, width: 12 })),
      { header: 'YTD Budget', key: 'ytd_budget', width: 14 },
      { header: 'YTD Actual', key: 'ytd_actual', width: 14 },
      { header: 'Variance', key: 'variance', width: 14 },
      { header: 'Variance %', key: 'variance_pct', width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

    for (const cat of seg.categories) {
      const row: Record<string, unknown> = {
        category: cat.label_en,
        ytd_budget: cat.ytd_budget,
        ytd_actual: cat.ytd_actual,
        variance: cat.ytd_variance,
        variance_pct: cat.ytd_variance_pct != null ? cat.ytd_variance_pct : null,
      };
      for (const cell of cat.cells) {
        row[`m${cell.month}`] = cell.actual;
      }
      const added = sheet.addRow(row);
      // Color the variance % cell
      const pctCell = added.getCell('variance_pct');
      if (pctCell.value != null) pctCell.numFmt = '0.0%';
      const colorMap: Record<string, string> = { green: 'C8E6C9', amber: 'FFE0B2', red: 'FFCDD2' };
      const fillColor = colorMap[cat.ytd_color];
      if (fillColor) {
        pctCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF' + fillColor },
        };
      }
    }
    // Segment subtotal row
    const subtotal = sheet.addRow({
      category: `${seg.service_line.toUpperCase()} TOTAL`,
      ytd_budget: seg.segment_budget,
      ytd_actual: seg.segment_actual,
      variance: seg.segment_actual - seg.segment_budget,
      variance_pct: seg.segment_variance_pct,
    });
    subtotal.font = { bold: true };
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
