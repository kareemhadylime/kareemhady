'use server';

import ExcelJS from 'exceljs';
import { buildFmplusPnl, buildFmplusBalanceSheet } from '@/lib/fmplus/financials';
import { resolvePeriodSeries } from '@/lib/fmplus/period-series';
import { discoverFmplusCompanyId } from '@/lib/fmplus/discover-company';
import type { Granularity, ScopeMode, Scope } from '@/lib/fmplus/types';

type ExportResult =
  | { ok: true; base64: string; filename: string }
  | { ok: false; error: string };

async function readExportArgs(formData: FormData) {
  const granularity = String(formData.get('granularity') || 'monthly') as Granularity;
  const periods = Number(formData.get('periods') || 3);
  const asof = String(formData.get('asof') || '');
  const mode = String(formData.get('mode') || 'trend') as ScopeMode;
  const withDep = String(formData.get('with_dep') || '1') === '1';
  const includeDrafts = String(formData.get('include_drafts') || '1') === '1';
  const planIds = (formData.get('plans') as string | null)?.split(',').map(Number).filter(Number.isFinite);
  const planId = formData.get('plan') ? Number(formData.get('plan')) : undefined;
  const accountIds = (formData.get('accounts') as string | null)?.split(',').map(Number).filter(Number.isFinite);

  const fmplusId = await discoverFmplusCompanyId();
  const periodSeries = resolvePeriodSeries(granularity, periods, asof);
  const scope: Scope = {
    mode,
    companyIds: [fmplusId],
    planIds: mode === 'plans' ? planIds : undefined,
    planId: mode === 'accounts' ? planId : undefined,
    accountIds: mode === 'accounts' ? accountIds : undefined,
    includeDrafts,
    withDep,
  };
  return { periodSeries, scope };
}

export async function exportPnlToExcel(formData: FormData): Promise<ExportResult> {
  try {
    const { periodSeries, scope } = await readExportArgs(formData);
    const report = await buildFmplusPnl({ periods: periodSeries, scope });

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('P&L');
    sheet.columns = [
      { header: 'Account', key: 'account', width: 50 },
      ...periodSeries.map(p => ({ header: p.label, key: p.key, width: 14 })),
    ];

    const addRow = (label: string, vals: Record<string, number | undefined>, indent = 0, bold = false) => {
      const row: Record<string, string | number> = { account: '  '.repeat(indent) + label };
      for (const p of periodSeries) row[p.key] = Math.round(vals[p.key] || 0);
      const r = sheet.addRow(row);
      if (bold) r.font = { bold: true };
    };

    addRow('REVENUE', report.sections.revenue.totals, 0, true);
    for (const sg of report.sections.revenue.subgroups) addRow(sg.label, sg.totals, 1);

    addRow('COST OF REVENUE', report.sections.cost_of_revenue.totals, 0, true);
    for (const svc of report.sections.cost_of_revenue.serviceLines || []) {
      addRow(svc.label, svc.totals, 1, true);
      for (const sg of svc.subgroups) addRow(sg.label, sg.totals, 2);
    }

    addRow('GROSS PROFIT', report.subtotals.gross_profit, 0, true);

    addRow('GENERAL EXPENSES', report.sections.general_expenses.totals, 0, true);
    for (const sg of report.sections.general_expenses.subgroups) addRow(sg.label, sg.totals, 1);

    addRow('EBITDA', report.subtotals.ebitda, 0, true);

    addRow('INT - TAXES - DEP', report.sections.interest_tax_dep.totals, 0, true);
    for (const sg of report.sections.interest_tax_dep.subgroups) addRow(sg.label, sg.totals, 1);

    addRow('NET PROFIT', report.subtotals.net_profit, 0, true);

    const buf = await wb.xlsx.writeBuffer();
    const base64 = Buffer.from(buf as ArrayBuffer).toString('base64');
    const startKey = periodSeries[0].key.replace(':', '_');
    const endKey = periodSeries[periodSeries.length - 1].key.replace(':', '_');
    const filename = `FMPLUS_PnL_${startKey}_to_${endKey}.xlsx`;
    return { ok: true, base64, filename };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function exportBsToExcel(formData: FormData): Promise<ExportResult> {
  try {
    const { periodSeries, scope } = await readExportArgs(formData);
    const report = await buildFmplusBalanceSheet({ periods: periodSeries, scope });

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Balance Sheet');
    sheet.columns = [
      { header: 'Account', key: 'account', width: 50 },
      ...periodSeries.map(p => ({ header: p.label, key: p.key, width: 14 })),
    ];

    const addRow = (label: string, vals: Record<string, number | undefined>, indent = 0, bold = false) => {
      const row: Record<string, string | number> = { account: '  '.repeat(indent) + label };
      for (const p of periodSeries) row[p.key] = Math.round(vals[p.key] || 0);
      const r = sheet.addRow(row);
      if (bold) r.font = { bold: true };
    };

    for (const sec of [report.assets, report.liabilities, report.equity]) {
      addRow(sec.label, sec.totals, 0, true);
      for (const g of sec.groups) {
        addRow(g.label, g.totals, 1);
        for (const a of g.accounts) {
          addRow(`${a.code} ${a.name}`.trim(), a.values, 2);
        }
      }
    }
    addRow('LIABILITIES + EQUITY', report.liabPlusEquity, 0, true);

    const buf = await wb.xlsx.writeBuffer();
    const base64 = Buffer.from(buf as ArrayBuffer).toString('base64');
    const startKey = periodSeries[0].key.replace(':', '_');
    const filename = `FMPLUS_BS_${startKey}.xlsx`;
    return { ok: true, base64, filename };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
