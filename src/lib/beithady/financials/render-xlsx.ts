// Beithady · Financials · Formatted XLSX exports.
//
// Two renderers:
//   renderSnapshotXlsx(snap, accounts, partners)
//     -> 2 sheets: "Accounts" + "Partners"
//   renderReconciliationXlsx(snap, report)
//     -> 1 sheet: "Reconciliation" with summary band on top
//
// Branding: Lime green header band, bold metadata block, bold frozen
// header row with autofilter, right-aligned EGP-formatted numbers,
// red font on non-zero variance, light-red fill on synthetic partner
// rows, bold totals row at the bottom.

import 'server-only';
import ExcelJS from 'exceljs';
import type {
  BhBalanceSnapshot,
  BhSnapshotAccount,
  BhSnapshotPartner,
} from './types';
import type { ReconciliationReport } from './reconciliation';

const LIME = 'FF65A30D';
const LIME_BG = 'FFF7FEE7';
const HEADER_TEXT = 'FFFFFFFF';
const TOTAL_BG = 'FFF0E9D9';
const SYNTH_BG = 'FFFEE2E2';
const RED_TEXT = 'FFB91C1C';
const NUM_FMT = '#,##0.00;[Red]-#,##0.00';
const INT_FMT = '#,##0;[Red]-#,##0';

type AccountRow = Pick<
  BhSnapshotAccount,
  'account_code' | 'account_name' | 'opening_raw' | 'partner_total' | 'variance'
>;

type PartnerRow = Pick<
  BhSnapshotPartner,
  'account_code' | 'partner_kind' | 'partner_name_raw' | 'opening_balance' | 'is_synthetic'
>;

function applyBrandHeader(
  ws: ExcelJS.Worksheet,
  title: string,
  metadata: Array<[string, string]>,
  totalColumns: number,
): number {
  // Row 1: Lime title band, merged across all columns.
  const titleRow = ws.addRow([title]);
  ws.mergeCells(1, 1, 1, totalColumns);
  titleRow.font = { name: 'Calibri', size: 16, bold: true, color: { argb: HEADER_TEXT } };
  titleRow.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  titleRow.height = 28;
  titleRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: LIME },
  };

  // Rows 2..N: metadata key/value pairs (key bold, value normal).
  for (const [k, v] of metadata) {
    const r = ws.addRow([`${k}:`, v]);
    r.getCell(1).font = { bold: true, color: { argb: LIME } };
    r.getCell(2).font = { color: { argb: 'FF374151' } };
    r.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: LIME_BG },
    };
  }

  // Blank spacer row.
  ws.addRow([]);
  return ws.rowCount;
}

function styleTableHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: HEADER_TEXT } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F2937' },
  };
  row.alignment = { vertical: 'middle' };
  row.height = 20;
  row.eachCell((c) => {
    c.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
  });
}

export async function renderSnapshotXlsx(
  snap: BhBalanceSnapshot,
  accounts: AccountRow[],
  partners: PartnerRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Beit Hady · Financials';
  wb.created = new Date();

  const metadata: Array<[string, string]> = [
    ['Period end', snap.period_end],
    ['Scope', snap.company_scope],
    ['Version', `v${snap.version}`],
    ['Status', snap.status],
    ['Frozen at', snap.frozen_at ? snap.frozen_at.slice(0, 10) : '—'],
    ['Generated', new Date().toISOString().slice(0, 19).replace('T', ' ')],
  ];

  // === Sheet 1: Accounts ===
  const ws1 = wb.addWorksheet('Accounts', {
    views: [{ state: 'frozen', ySplit: 0 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  });

  const accountCols = 5;
  const accountTitle = `Snapshot · ${snap.period_end} v${snap.version} · ${snap.company_scope} · Accounts`;
  const headerEnd1 = applyBrandHeader(ws1, accountTitle, metadata, accountCols);

  const acctHeaderRow = ws1.addRow(['Code', 'Name', 'Opening', 'Partner total', 'Variance']);
  styleTableHeader(acctHeaderRow);
  const acctHeaderIdx = acctHeaderRow.number;

  let openingSum = 0;
  let partnerSum = 0;
  let varianceSum = 0;
  for (const a of accounts) {
    const r = ws1.addRow([
      a.account_code,
      a.account_name,
      Number(a.opening_raw),
      a.partner_total == null ? null : Number(a.partner_total),
      Number(a.variance),
    ]);
    r.getCell(3).numFmt = NUM_FMT;
    r.getCell(4).numFmt = NUM_FMT;
    r.getCell(5).numFmt = NUM_FMT;
    if (Number(a.variance) !== 0) {
      r.getCell(5).font = { color: { argb: RED_TEXT }, bold: true };
    }
    openingSum += Number(a.opening_raw) || 0;
    if (a.partner_total != null) partnerSum += Number(a.partner_total);
    varianceSum += Number(a.variance) || 0;
  }

  const acctTotal = ws1.addRow(['', 'TOTAL', openingSum, partnerSum, varianceSum]);
  acctTotal.font = { bold: true };
  acctTotal.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: TOTAL_BG },
  };
  acctTotal.getCell(3).numFmt = NUM_FMT;
  acctTotal.getCell(4).numFmt = NUM_FMT;
  acctTotal.getCell(5).numFmt = NUM_FMT;

  ws1.getColumn(1).width = 12;
  ws1.getColumn(2).width = 48;
  ws1.getColumn(3).width = 18;
  ws1.getColumn(4).width = 18;
  ws1.getColumn(5).width = 16;
  ws1.views = [{ state: 'frozen', ySplit: acctHeaderIdx }];
  ws1.autoFilter = {
    from: { row: acctHeaderIdx, column: 1 },
    to: { row: acctHeaderIdx, column: accountCols },
  };
  void headerEnd1;

  // === Sheet 2: Partners ===
  const ws2 = wb.addWorksheet('Partners', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  });
  const partnerCols = 4;
  const partnerTitle = `Snapshot · ${snap.period_end} v${snap.version} · ${snap.company_scope} · Partner ledgers`;
  applyBrandHeader(ws2, partnerTitle, metadata, partnerCols);

  const partHeaderRow = ws2.addRow(['Account', 'Kind', 'Partner', 'Balance']);
  styleTableHeader(partHeaderRow);
  const partHeaderIdx = partHeaderRow.number;

  if (partners.length === 0) {
    const empty = ws2.addRow(['', '', 'No partner rows — partner-ledger xlsx not yet imported for this snapshot.', '']);
    empty.font = { italic: true, color: { argb: 'FF6B7280' } };
    ws2.mergeCells(empty.number, 1, empty.number, partnerCols);
  } else {
    let partnerBalanceSum = 0;
    for (const p of partners) {
      const r = ws2.addRow([
        p.account_code,
        p.partner_kind,
        `${p.is_synthetic ? '⚠ ' : ''}${p.partner_name_raw}`,
        Number(p.opening_balance),
      ]);
      r.getCell(4).numFmt = NUM_FMT;
      if (p.is_synthetic) {
        r.eachCell((c) => {
          c.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: SYNTH_BG },
          };
        });
      }
      partnerBalanceSum += Number(p.opening_balance) || 0;
    }
    const partTotal = ws2.addRow(['', '', 'TOTAL', partnerBalanceSum]);
    partTotal.font = { bold: true };
    partTotal.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: TOTAL_BG },
    };
    partTotal.getCell(4).numFmt = NUM_FMT;
  }

  ws2.getColumn(1).width = 12;
  ws2.getColumn(2).width = 14;
  ws2.getColumn(3).width = 56;
  ws2.getColumn(4).width = 18;
  ws2.views = [{ state: 'frozen', ySplit: partHeaderIdx }];
  ws2.autoFilter = {
    from: { row: partHeaderIdx, column: 1 },
    to: { row: partHeaderIdx, column: partnerCols },
  };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function renderReconciliationXlsx(
  snap: BhBalanceSnapshot,
  report: ReconciliationReport,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Beit Hady · Financials';
  wb.created = new Date();

  const metadata: Array<[string, string]> = [
    ['Period end', snap.period_end],
    ['Scope', snap.company_scope],
    ['Version', `v${snap.version}`],
    ['Status', snap.status],
    ['Frozen at', snap.frozen_at ? snap.frozen_at.slice(0, 10) : '—'],
    ['Generated', new Date().toISOString().slice(0, 19).replace('T', ' ')],
    ['Accounts with partners', String(report.summary.accounts_with_partners)],
    ['Awaiting ledger', String(report.summary.accounts_awaiting_ledger)],
    ['Open variances', String(report.summary.open_variance_count)],
    ['Total variance', Math.round(report.summary.total_variance).toLocaleString('en-US') + ' EGP'],
  ];

  const ws = wb.addWorksheet('Reconciliation', {
    views: [{ state: 'frozen', ySplit: 0 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  });

  const totalCols = 7;
  const title = `Reconciliation · ${snap.period_end} v${snap.version} · ${snap.company_scope}`;
  applyBrandHeader(ws, title, metadata, totalCols);

  const headerRow = ws.addRow([
    'Code',
    'Account',
    'Account total',
    'Partner total',
    'Variance',
    'Status',
    'Notes',
  ]);
  styleTableHeader(headerRow);
  const headerIdx = headerRow.number;

  let openingSum = 0;
  let partnerSum = 0;
  let varianceSum = 0;
  for (const r of report.rows) {
    const partnerTotal = r.partner_total == null ? null : r.partner_total;
    const statusLabel =
      partnerTotal == null
        ? '⏳ Awaiting'
        : r.variance === 0
          ? '✓ Clean'
          : `🔴 ${r.variance_status}`;
    const row = ws.addRow([
      r.account_code,
      r.account_name,
      Math.round(r.opening_raw),
      partnerTotal == null ? null : Math.round(partnerTotal),
      Math.round(r.variance),
      statusLabel,
      r.variance_notes ?? '',
    ]);
    row.getCell(3).numFmt = INT_FMT;
    row.getCell(4).numFmt = INT_FMT;
    row.getCell(5).numFmt = INT_FMT;
    if (r.variance !== 0 && r.variance_status === 'open') {
      row.getCell(5).font = { color: { argb: RED_TEXT }, bold: true };
      row.eachCell((c) => {
        c.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: SYNTH_BG },
        };
      });
    }
    openingSum += r.opening_raw;
    if (partnerTotal != null) partnerSum += partnerTotal;
    varianceSum += r.variance;
  }

  const totalRow = ws.addRow([
    '',
    'TOTAL',
    Math.round(openingSum),
    Math.round(partnerSum),
    Math.round(varianceSum),
    '',
    '',
  ]);
  totalRow.font = { bold: true };
  totalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: TOTAL_BG },
  };
  totalRow.getCell(3).numFmt = INT_FMT;
  totalRow.getCell(4).numFmt = INT_FMT;
  totalRow.getCell(5).numFmt = INT_FMT;

  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 44;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 16;
  ws.getColumn(7).width = 36;
  ws.views = [{ state: 'frozen', ySplit: headerIdx }];
  ws.autoFilter = {
    from: { row: headerIdx, column: 1 },
    to: { row: headerIdx, column: totalCols },
  };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
