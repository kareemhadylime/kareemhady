// xlsx parse + classify + commit pipeline. This file grows through Tasks 9–11.

import 'server-only';
import ExcelJS from 'exceljs';

export type RawLedgerRow = {
  source_row: number;
  partner_name_raw: string;
  balance: number;
};

export type ParseResult = {
  rows: RawLedgerRow[];
  errors: Array<{ row: number; error: string }>;
  total: number;
};

/**
 * Parse a partner-ledger xlsx (Odoo export format).
 * ExcelJS row.values is 1-indexed (v[0] always undefined), and the export
 * uses two columns starting at col B:
 *   v[1] = partner name (string) | date/sub-header text
 *   v[2] = balance (number)      | 'Balance' label (string) on header row
 *
 * Actual sheet layout:
 *   row 1: v[2]='2025'                    ← date header (v[1] undefined)
 *   row 2 (owners only): v[1]='2025', v[2]='2025'  ← sub-header (both strings)
 *   row 2/3: v[2]='Balance'               ← Balance label (string, not number)
 *   row 3/4+: v[1]='003. AMAN P V C', v[2]=-3888  ← data
 *
 * Strategy: accept only rows where v[1] is a string AND v[2] is a number.
 * This naturally skips all header rows without special-casing.
 */
export async function parsePartnerLedgerXlsx(buffer: Buffer | ArrayBuffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS expects Buffer; convert ArrayBuffer if needed.
  const buf: Buffer = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(buffer as ArrayBuffer);
  await wb.xlsx.load(buf);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('parsePartnerLedgerXlsx: no worksheet');

  const rows: RawLedgerRow[] = [];
  const errors: Array<{ row: number; error: string }> = [];
  let total = 0;
  let dataStarted = false;

  sheet.eachRow({ includeEmpty: false }, (row, i) => {
    const v = row.values as Array<unknown>; // 1-indexed; v[0] is undefined
    // Actual Odoo export layout: col B (v[1]) = partner name, col C (v[2]) = balance
    const c1 = v[1];
    const c2 = v[2];
    const isData = typeof c1 === 'string' && typeof c2 === 'number';
    if (!isData) return;

    if (!dataStarted) dataStarted = true;

    const partner = (c1 as string).trim();
    const balance = c2 as number;
    if (!Number.isFinite(balance)) {
      errors.push({ row: i, error: `non-finite balance: ${balance}` });
      return;
    }
    rows.push({ source_row: i, partner_name_raw: partner, balance });
    total += balance;
  });

  if (!dataStarted) errors.push({ row: 0, error: 'no data rows found' });

  // Round total to 2dp to defeat floating-point drift in assertions.
  return { rows, errors, total: Math.round(total * 100) / 100 };
}

import { matchPartners, type MatchResult } from './partner-match';
import type { PartnerKind } from './types';

export type ClassifiedRow = MatchResult & {
  source_row: number;
  account_code: string;
  partner_kind: PartnerKind;
};

export type ClassifyResult = {
  rows: ClassifiedRow[];
  errors: Array<{ row: number; error: string }>;
  ledger_total: number;
  account_total: number | null;
  variance: number | null;
  partner_kind: PartnerKind;
  account_code: string;
};

export function classifyParsedRows(
  parsed: ParseResult,
  ctx: {
    account_code: string;
    partner_kind: PartnerKind;
    odoo_partners: Array<{ id: number; name: string }>;
    account_opening_raw?: number;
  },
): ClassifyResult {
  const matched = matchPartners(
    parsed.rows.map((r) => ({ raw: r.partner_name_raw, balance: r.balance })),
    ctx.odoo_partners,
  );
  const rows: ClassifiedRow[] = parsed.rows.map((r, i) => ({
    ...matched[i],
    source_row: r.source_row,
    account_code: ctx.account_code,
    partner_kind: ctx.partner_kind,
  }));
  const account_total =
    typeof ctx.account_opening_raw === 'number' ? ctx.account_opening_raw : null;
  const variance =
    account_total === null
      ? null
      : Math.round((account_total - parsed.total) * 100) / 100;
  return {
    rows,
    errors: parsed.errors,
    ledger_total: parsed.total,
    account_total,
    variance,
    partner_kind: ctx.partner_kind,
    account_code: ctx.account_code,
  };
}

import { supabaseAdmin } from '@/lib/supabase';

export async function commitClassifiedRows(params: {
  snapshot_id: string;
  classified: ClassifyResult;
}): Promise<void> {
  const sb = supabaseAdmin();
  const partnerRows = params.classified.rows.map((r) => ({
    snapshot_id: params.snapshot_id,
    account_code: r.account_code,
    partner_kind: r.partner_kind,
    partner_id: r.partner_id,
    partner_name_raw: r.raw,
    partner_name_normalized: r.normalized,
    opening_balance: r.balance,
    is_synthetic: false,
    match_confidence: r.confidence,
    match_score: r.score,
    match_warnings: [] as string[],
  }));

  // Insert real partner rows.
  const { error: errPartners } = await sb
    .from('bh_balance_snapshot_partners')
    .insert(partnerRows);
  if (errPartners) throw new Error(`commitClassifiedRows partners: ${errPartners.message}`);

  // Insert synthetic __UNALLOCATED row when variance != 0.
  if (params.classified.variance !== null && params.classified.variance !== 0) {
    const { error: errSynth } = await sb.from('bh_balance_snapshot_partners').insert([
      {
        snapshot_id: params.snapshot_id,
        account_code: params.classified.account_code,
        partner_kind: 'unallocated',
        partner_id: null,
        partner_name_raw: `__UNALLOCATED_${params.classified.account_code}`,
        partner_name_normalized: null,
        opening_balance: params.classified.variance,
        is_synthetic: true,
        match_confidence: 'synthetic',
        match_score: null,
        match_warnings: ['auto-generated to reconcile partner_total vs account_total'],
      },
    ]);
    if (errSynth) throw new Error(`commitClassifiedRows synthetic: ${errSynth.message}`);
  }

  // Update account's cached partner_total to the ledger total (so variance recomputes).
  if (params.classified.account_total !== null) {
    const { error: errAcct } = await sb
      .from('bh_balance_snapshot_accounts')
      .update({ partner_total: params.classified.ledger_total })
      .eq('snapshot_id', params.snapshot_id)
      .eq('account_code', params.classified.account_code);
    if (errAcct) throw new Error(`commitClassifiedRows account: ${errAcct.message}`);
  }
}
