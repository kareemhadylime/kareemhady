'use server';

import ExcelJS from 'exceljs';
import { buildFmplusPnl, buildFmplusBalanceSheet } from '@/lib/fmplus/financials';
import { resolvePeriodSeries } from '@/lib/fmplus/period-series';
import { discoverFmplusCompanyId } from '@/lib/fmplus/discover-company';
import { listFmplusPlansWithActivity } from '@/lib/fmplus/analytic-picker';
import type { Granularity, ScopeMode, Scope, PeriodValues, Period } from '@/lib/fmplus/types';

type ExportResult =
  | { ok: true; base64: string; filename: string }
  | { ok: false; error: string };

// Build a Scope that matches what `src/app/fmplus/financials/page.tsx` does:
// plan/account filters apply regardless of `mode` (the page passes mode='trend'
// by default but still expects the picker selections to scope the report).
async function readExportArgs(formData: FormData) {
  const granularity = String(formData.get('granularity') || 'monthly') as Granularity;
  const periods = Number(formData.get('periods') || 3);
  const asof = String(formData.get('asof') || '');
  const mode = String(formData.get('mode') || 'trend') as ScopeMode;
  const withDep = String(formData.get('with_dep') || '1') === '1';
  const includeDrafts = String(formData.get('include_drafts') || '1') === '1';

  // Plan: page sends a slug ('mix', 'hk', …). Resolve to numeric id by looking
  // it up in odoo_analytic_plans (FMPLUS-scoped). Legacy 'plans' (plural CSV
  // of ids) still supported for back-compat.
  const planSlug = (formData.get('plan') as string | null) || null;
  const planIdsCsv = (formData.get('plans') as string | null) || null;
  const planIds = planIdsCsv
    ? planIdsCsv.split(',').map(Number).filter(Number.isFinite)
    : undefined;

  // Project ids: 'account' (singular id, single-select) or 'accounts' (CSV, multi).
  const accountSingular = (formData.get('account') as string | null) || null;
  const accountsCsv = (formData.get('accounts') as string | null) || null;
  const accountIds = accountsCsv
    ? accountsCsv.split(',').map(Number).filter(Number.isFinite)
    : (accountSingular ? [Number(accountSingular)].filter(Number.isFinite) : undefined);

  const fmplusId = await discoverFmplusCompanyId();
  const periodSeries = resolvePeriodSeries(granularity, periods, asof);

  // Resolve plan slug → id when needed (only if no project-level filter — plan
  // is redundant once a specific project is picked).
  let resolvedPlanId: number | undefined;
  if (planSlug && (!accountIds || accountIds.length === 0)) {
    const earliest = periodSeries[periodSeries.length - 1].fromDate;
    const latest = periodSeries[0].toDate;
    const plans = await listFmplusPlansWithActivity({
      companyId: fmplusId,
      fromDate: earliest,
      toDate: latest,
    });
    resolvedPlanId = plans.find(p => p.slug === planSlug)?.id;
  }

  const scope: Scope = {
    mode,
    companyIds: [fmplusId],
    // Apply filters regardless of mode (matching page.tsx behavior — the page
    // doesn't gate plan/account filters on mode and the export must agree).
    planId: resolvedPlanId,
    accountIds: accountIds && accountIds.length > 0 ? accountIds : undefined,
    planIds: planIds && planIds.length > 0 ? planIds : undefined,
    includeDrafts,
    withDep,
  };
  return { periodSeries, scope };
}

// ---------------------------------------------------------------------------
// Formatting helpers (Excel)
// ---------------------------------------------------------------------------

const NUM_FMT = '#,##0;[Red]-#,##0;0';
const PCT_FMT = '0.0%;[Red]-0.0%;"—"';

const HEADER_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF1F5F9' }, // slate-100
};
const SECTION_REVENUE_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD1FAE5' }, // emerald-100
};
const SECTION_EXPENSE_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE5E7EB' }, // slate-200
};
const SUBTOTAL_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFCBD5E1' }, // slate-300
};
const HERO_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF0F172A' }, // slate-900
};
const SVC_LINE_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF8FAFC' }, // slate-50
};

type ColSpec =
  | { kind: 'account' }
  | { kind: 'bal'; periodKey: string }
  | { kind: 'pct'; periodKey: string }
  | { kind: 'delta'; periodKey: string; priorKey: string };

/**
 * Build the per-period column layout: each period gets 2 cols (Bal, %), with
 * an extra Δ column when there's a prior (older) period to compare against.
 *
 * The page mirrors this — see PnlTable.PeriodHead/NumCells:
 *   showDelta = i < periods.length - 1
 *   periods are passed newest-first, prior = periods[i+1]
 */
function buildColumnSpec(periods: Period[]): ColSpec[] {
  const cols: ColSpec[] = [{ kind: 'account' }];
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const prior = i < periods.length - 1 ? periods[i + 1] : null;
    cols.push({ kind: 'bal', periodKey: p.key });
    cols.push({ kind: 'pct', periodKey: p.key });
    if (prior) cols.push({ kind: 'delta', periodKey: p.key, priorKey: prior.key });
  }
  return cols;
}

function deltaFraction(curr: number, prior: number): number | null {
  if (!prior || prior === 0) return null;
  return (curr - prior) / Math.abs(prior);
}

type RowStyle = 'normal' | 'section_revenue' | 'section_expense' | 'service_line' | 'subgroup' | 'subtotal' | 'subtotal_hero';

function applyRowStyle(row: ExcelJS.Row, style: RowStyle, indent: number) {
  const accountCell = row.getCell(1);
  accountCell.alignment = { horizontal: 'left', vertical: 'middle', indent };

  switch (style) {
    case 'section_revenue':
      row.eachCell({ includeEmpty: true }, c => {
        c.fill = SECTION_REVENUE_FILL;
        c.font = { ...(c.font || {}), bold: true, color: { argb: 'FF065F46' } };
      });
      break;
    case 'section_expense':
      row.eachCell({ includeEmpty: true }, c => {
        c.fill = SECTION_EXPENSE_FILL;
        c.font = { ...(c.font || {}), bold: true, color: { argb: 'FF334155' } };
      });
      break;
    case 'service_line':
      row.eachCell({ includeEmpty: true }, c => {
        c.fill = SVC_LINE_FILL;
        c.font = { ...(c.font || {}), bold: true, color: { argb: 'FF1E293B' } };
      });
      break;
    case 'subgroup':
      // No fill — plain row. Number cells already get numFmt below.
      break;
    case 'subtotal':
      row.eachCell({ includeEmpty: true }, c => {
        c.fill = SUBTOTAL_FILL;
        c.font = { ...(c.font || {}), bold: true };
      });
      break;
    case 'subtotal_hero':
      row.eachCell({ includeEmpty: true }, c => {
        c.fill = HERO_FILL;
        c.font = { ...(c.font || {}), bold: true, color: { argb: 'FFFFFFFF' } };
      });
      break;
  }
}

/**
 * Add a P&L / BS data row. `values` is the canonical period→balance map.
 * `rev` (optional) is the period→revenue map used to compute the % column.
 * When the row IS revenue (or revenue subgroups), pass values as both.
 */
function addDataRow(
  sheet: ExcelJS.Worksheet,
  cols: ColSpec[],
  label: string,
  values: PeriodValues,
  rev: PeriodValues | null,
  style: RowStyle,
  indent: number,
) {
  const out: Array<string | number | null> = [];
  for (const col of cols) {
    if (col.kind === 'account') {
      out.push(label);
    } else if (col.kind === 'bal') {
      out.push(Math.round(values[col.periodKey] || 0));
    } else if (col.kind === 'pct') {
      const v = values[col.periodKey] || 0;
      const r = rev ? (rev[col.periodKey] || 0) : 0;
      out.push(r === 0 ? null : v / r);
    } else if (col.kind === 'delta') {
      const curr = values[col.periodKey] || 0;
      const prior = values[col.priorKey] || 0;
      out.push(deltaFraction(curr, prior));
    }
  }
  const row = sheet.addRow(out);
  // Apply number formats
  cols.forEach((col, idx) => {
    const cell = row.getCell(idx + 1);
    if (col.kind === 'bal') {
      cell.numFmt = NUM_FMT;
      cell.alignment = { horizontal: 'right' };
    } else if (col.kind === 'pct' || col.kind === 'delta') {
      cell.numFmt = PCT_FMT;
      cell.alignment = { horizontal: 'right' };
    }
  });
  applyRowStyle(row, style, indent);
  return row;
}

function addHeaderRows(
  sheet: ExcelJS.Worksheet,
  cols: ColSpec[],
  periods: Period[],
) {
  // Two-row header: top row = period labels merged across (Bal/%/Δ); bottom
  // row = Bal/%/Δ sub-labels. Account column spans both rows.
  const topRow: Array<string | null> = [];
  const subRow: Array<string | null> = [];
  for (const col of cols) {
    if (col.kind === 'account') {
      topRow.push('Account');
      subRow.push('');
    } else if (col.kind === 'bal') {
      const p = periods.find(pp => pp.key === col.periodKey);
      topRow.push(p?.label || col.periodKey);
      subRow.push('Bal');
    } else if (col.kind === 'pct') {
      topRow.push(null);
      subRow.push('%');
    } else if (col.kind === 'delta') {
      topRow.push(null);
      subRow.push('Δ');
    }
  }
  const r1 = sheet.addRow(topRow);
  const r2 = sheet.addRow(subRow);

  // Merge each period's 2 or 3 columns in the top row
  let i = 1;
  for (const col of cols) {
    if (col.kind === 'account') {
      // Merge Account label down across the two header rows
      sheet.mergeCells(r1.number, i, r2.number, i);
      i += 1;
      continue;
    }
    if (col.kind === 'bal') {
      const start = i;
      // Find the run of cols belonging to the same period (bal, pct, [delta])
      let span = 1;
      while (
        cols[start - 1 + span] &&
        (cols[start - 1 + span].kind === 'pct' || cols[start - 1 + span].kind === 'delta') &&
        (cols[start - 1 + span] as { periodKey?: string }).periodKey === col.periodKey
      ) {
        span += 1;
      }
      if (span > 1) sheet.mergeCells(r1.number, start, r1.number, start + span - 1);
      i += 1;
      continue;
    }
    i += 1;
  }

  // Style header
  for (const r of [r1, r2]) {
    r.eachCell({ includeEmpty: true }, (c, colNumber) => {
      c.fill = HEADER_FILL;
      c.font = { ...(c.font || {}), bold: true, color: { argb: 'FF334155' } };
      c.alignment = { ...(c.alignment || {}), horizontal: colNumber === 1 ? 'left' : 'center', vertical: 'middle' };
      c.border = {
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });
  }
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];
}

function setColumnWidths(sheet: ExcelJS.Worksheet, cols: ColSpec[]) {
  cols.forEach((col, idx) => {
    const c = sheet.getColumn(idx + 1);
    if (col.kind === 'account') c.width = 50;
    else if (col.kind === 'bal') c.width = 16;
    else c.width = 9;
  });
}

// ---------------------------------------------------------------------------
// P&L export
// ---------------------------------------------------------------------------

export async function exportPnlToExcel(formData: FormData): Promise<ExportResult> {
  try {
    const { periodSeries, scope } = await readExportArgs(formData);
    const report = await buildFmplusPnl({ periods: periodSeries, scope });
    const cols = buildColumnSpec(periodSeries);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('P&L');

    addHeaderRows(sheet, cols, periodSeries);
    setColumnWidths(sheet, cols);

    const rev = report.sections.revenue.totals;

    // Revenue
    addDataRow(sheet, cols, 'Revenue', report.sections.revenue.totals, rev, 'section_revenue', 0);
    for (const sg of report.sections.revenue.subgroups) {
      addDataRow(sheet, cols, sg.label, sg.totals, rev, 'subgroup', 1);
    }

    // Cost of Revenue (with service lines)
    addDataRow(sheet, cols, 'Cost of Revenue', report.sections.cost_of_revenue.totals, rev, 'section_expense', 0);
    for (const svc of report.sections.cost_of_revenue.serviceLines || []) {
      const marginNote = ` — ${(svc.grossMarginPct[periodSeries[0].key] || 0).toFixed(1)}% margin`;
      addDataRow(sheet, cols, svc.label + marginNote, svc.totals, rev, 'service_line', 1);
      for (const sg of svc.subgroups) {
        addDataRow(sheet, cols, sg.label, sg.totals, rev, 'subgroup', 2);
      }
    }

    // Gross Profit
    addDataRow(sheet, cols, 'Gross Profit', report.subtotals.gross_profit, rev, 'subtotal', 0);

    // General Expenses
    addDataRow(sheet, cols, 'General Expenses', report.sections.general_expenses.totals, rev, 'section_expense', 0);
    for (const sg of report.sections.general_expenses.subgroups) {
      addDataRow(sheet, cols, sg.label, sg.totals, rev, 'subgroup', 1);
    }

    // EBITDA
    addDataRow(sheet, cols, 'EBITDA', report.subtotals.ebitda, rev, 'subtotal', 0);

    // INT - TAXES - DEP
    addDataRow(sheet, cols, 'INT - TAXES - DEP', report.sections.interest_tax_dep.totals, rev, 'section_expense', 0);
    for (const sg of report.sections.interest_tax_dep.subgroups) {
      addDataRow(sheet, cols, sg.label, sg.totals, rev, 'subgroup', 1);
    }

    // Net Profit (hero row)
    addDataRow(sheet, cols, 'Net Profit', report.subtotals.net_profit, rev, 'subtotal_hero', 0);

    const buf = await wb.xlsx.writeBuffer();
    const base64 = Buffer.from(buf as ArrayBuffer).toString('base64');
    const startKey = periodSeries[periodSeries.length - 1].key.replace(/[:|]/g, '_');
    const endKey = periodSeries[0].key.replace(/[:|]/g, '_');
    const filename = `FMPLUS_PnL_${startKey}_to_${endKey}.xlsx`;
    return { ok: true, base64, filename };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Balance Sheet export
// ---------------------------------------------------------------------------

export async function exportBsToExcel(formData: FormData): Promise<ExportResult> {
  try {
    const { periodSeries, scope } = await readExportArgs(formData);
    const report = await buildFmplusBalanceSheet({ periods: periodSeries, scope });
    const cols = buildColumnSpec(periodSeries);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Balance Sheet');

    addHeaderRows(sheet, cols, periodSeries);
    setColumnWidths(sheet, cols);

    // For BS, the % column reads as % of section total. Compute on-the-fly:
    // pass section.totals as the "rev" denominator so each line shows its
    // share of its parent section.
    for (const sec of [report.assets, report.liabilities, report.equity]) {
      addDataRow(sheet, cols, sec.label, sec.totals, sec.totals, 'section_expense', 0);
      for (const g of sec.groups) {
        addDataRow(sheet, cols, g.label, g.totals, sec.totals, 'subgroup', 1);
        for (const a of g.accounts) {
          const lbl = `${a.code ? a.code + ' ' : ''}${a.name}`.trim();
          addDataRow(sheet, cols, lbl, a.values, sec.totals, 'subgroup', 2);
        }
      }
    }
    addDataRow(sheet, cols, 'LIABILITIES + EQUITY', report.liabPlusEquity, report.assets.totals, 'subtotal', 0);

    const buf = await wb.xlsx.writeBuffer();
    const base64 = Buffer.from(buf as ArrayBuffer).toString('base64');
    const startKey = periodSeries[0].key.replace(/[:|]/g, '_');
    const filename = `FMPLUS_BS_${startKey}.xlsx`;
    return { ok: true, base64, filename };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
