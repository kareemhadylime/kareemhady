import { createHash } from 'node:crypto';
import { parseAolbXml } from './parse-aolb';
import { classifyRow } from './classify';
import { slugifyInstrumentName } from './instruments';
import type { SupabaseClient } from '@supabase/supabase-js';

const FILENAME_RE = /^AOLB Account (\d{3}) - (\d{4})\.xls$/i;

export type ImportInput = {
  filename: string;
  xml: string;
  client: SupabaseClient;
  uploadedBy: string;
};

export type ImportResult = {
  uploadId: string | null;
  status: 'ok' | 'reconcile_mismatch' | 'duplicate' | 'parse_error';
  parsed: {
    trades: number;
    dividends: number;
    cash: number;
    fees: number;
    interest: number;
    corrections: number;
    skipped: number;
    rawRows: number;
  };
  reconciliationDelta: number;
  newInstruments: number;
  message?: string;
};

export async function importAolbFile(input: ImportInput): Promise<ImportResult> {
  const { filename, xml, client, uploadedBy } = input;
  const m = FILENAME_RE.exec(filename);
  if (!m) throw new Error(`Invalid filename (expected "AOLB Account NNN - YYYY.xls"): ${filename}`);
  const code = m[1];
  const year = parseInt(m[2], 10);

  const sha256 = createHash('sha256').update(xml).digest('hex');

  // Dedup
  const existing = await client
    .from('personal_stock_uploads')
    .select('id')
    .eq('sha256', sha256)
    .maybeSingle();
  if (existing.data) {
    return {
      uploadId: existing.data.id,
      status: 'duplicate',
      parsed: { trades: 0, dividends: 0, cash: 0, fees: 0, interest: 0, corrections: 0, skipped: 0, rawRows: 0 },
      reconciliationDelta: 0,
      newInstruments: 0,
    };
  }

  // Resolve account
  const accountRes = await client
    .from('personal_stock_accounts')
    .select('id')
    .eq('code', code)
    .maybeSingle();
  if (!accountRes.data) throw new Error(`Account ${code} not in personal_stock_accounts`);
  const accountId: number = accountRes.data.id;

  // Parse
  let parsed;
  try {
    parsed = parseAolbXml(xml);
  } catch (err: any) {
    return {
      uploadId: null,
      status: 'parse_error',
      parsed: { trades: 0, dividends: 0, cash: 0, fees: 0, interest: 0, corrections: 0, skipped: 0, rawRows: 0 },
      reconciliationDelta: 0,
      newInstruments: 0,
      message: err.message,
    };
  }

  // Insert upload header
  const uploadIns = await client
    .from('personal_stock_uploads')
    .insert({
      filename,
      account_id: accountId,
      year,
      sha256,
      row_count: parsed.rows.length,
      status: 'ok',
      uploaded_by: uploadedBy,
    })
    .select()
    .single();
  const uploadId: string = uploadIns.data.id;

  // Insert raw rows
  const rawRowInserts = parsed.rows.map((r) => ({
    upload_id: uploadId,
    row_index: r.rowIndex,
    details: r.details,
    occurred_at: r.occurredAt,
    op_type: r.opType,
    description: r.description,
    debit: r.debit,
    credit: r.credit,
    balance_after: r.balanceAfter,
    dc_flag: r.dcFlag,
  }));
  const rawRowsRes = await client.from('personal_stock_raw_rows').insert(rawRowInserts).select();
  const rawIdByIndex = new Map<number, string>();
  for (const row of rawRowsRes.data ?? []) rawIdByIndex.set(row.row_index, row.id);

  const counts = {
    trades: 0,
    dividends: 0,
    cash: 0,
    fees: 0,
    interest: 0,
    corrections: 0,
    skipped: 0,
    rawRows: parsed.rows.length,
  };
  let newInstruments = 0;
  const tradeInserts: any[] = [];
  const dividendInserts: any[] = [];
  const cashInserts: any[] = [];
  const feeInserts: any[] = [];
  const interestInserts: any[] = [];
  const correctionInserts: any[] = [];

  // Cache instruments + account code → id during this import
  const instrumentIdByTicker = new Map<string, number>();
  const accountIdByCode = new Map<string, number>([[code, accountId]]);

  async function insertBatch(table: string, rows: any[]): Promise<void> {
    if (!rows.length) return;
    const { error } = await client.from(table).insert(rows);
    if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
  }

  async function resolveAccountId(c: string): Promise<number | null> {
    if (accountIdByCode.has(c)) return accountIdByCode.get(c)!;
    const r = await client.from('personal_stock_accounts').select('id').eq('code', c).maybeSingle();
    if (!r.data) return null;
    accountIdByCode.set(c, r.data.id);
    return r.data.id;
  }

  async function resolveInstrumentId(kind: 'stock' | 'fund', name: string): Promise<number> {
    const ticker = slugifyInstrumentName(name);
    if (instrumentIdByTicker.has(ticker)) return instrumentIdByTicker.get(ticker)!;
    const exist = await client.from('personal_stock_instruments').select('id').eq('ticker', ticker).maybeSingle();
    if (exist.data) {
      instrumentIdByTicker.set(ticker, exist.data.id);
      return exist.data.id;
    }
    const ins = await client.from('personal_stock_instruments').insert({ kind, ticker, name }).select().single();
    instrumentIdByTicker.set(ticker, ins.data.id);
    newInstruments += 1;
    return ins.data.id;
  }

  for (const raw of parsed.rows) {
    const rawId = rawIdByIndex.get(raw.rowIndex) ?? null;
    if (!rawId) continue;
    const c = classifyRow(raw);
    if (c.kind === 'skipped') {
      counts.skipped += 1;
      continue;
    }

    if (c.kind === 'trade') {
      const instrumentId = await resolveInstrumentId(c.data.instrumentKind, c.data.instrumentName);
      tradeInserts.push({
        raw_row_id: rawId,
        account_id: accountId,
        instrument_id: instrumentId,
        side: c.data.side,
        qty: c.data.qty,
        price: c.data.price,
        gross_amount: c.data.grossAmount,
        net_amount: c.data.netAmount,
        fees_amount: c.data.feesAmount,
        invoice_id: c.data.invoiceId,
        trade_date: c.data.tradeDate,
      });
      counts.trades += 1;
    } else if (c.kind === 'dividend') {
      dividendInserts.push({
        raw_row_id: rawId,
        account_id: accountId,
        instrument_id: null,
        amount: c.data.amount,
        pay_date: c.data.payDate,
        note: c.data.note,
      });
      counts.dividends += 1;
    } else if (c.kind === 'cash') {
      const cpId = c.data.counterpartyAccountCode ? await resolveAccountId(c.data.counterpartyAccountCode) : null;
      cashInserts.push({
        raw_row_id: rawId,
        account_id: accountId,
        kind: c.data.kind,
        amount: c.data.amount,
        counterparty_account_id: cpId,
        occurred_at: c.data.occurredAt,
        note: c.data.note,
      });
      counts.cash += 1;
    } else if (c.kind === 'fee') {
      feeInserts.push({
        raw_row_id: rawId,
        account_id: accountId,
        kind: c.data.kind,
        amount: c.data.amount,
        occurred_at: c.data.occurredAt,
        note: c.data.note,
      });
      counts.fees += 1;
    } else if (c.kind === 'interest') {
      interestInserts.push({
        raw_row_id: rawId,
        account_id: accountId,
        direction: c.data.direction,
        amount: c.data.amount,
        period_end_date: c.data.periodEndDate,
        note: c.data.note,
      });
      counts.interest += 1;
    } else if (c.kind === 'correction') {
      correctionInserts.push({
        raw_row_id: rawId,
        account_id: accountId,
        reverses_raw_row_id: null,
        amount_debit: c.data.amountDebit,
        amount_credit: c.data.amountCredit,
        occurred_at: c.data.occurredAt,
        note: c.data.note,
      });
      counts.corrections += 1;
    }
  }

  await insertBatch('personal_stock_trades', tradeInserts);
  await insertBatch('personal_stock_dividends', dividendInserts);
  await insertBatch('personal_stock_cash_movements', cashInserts);
  await insertBatch('personal_stock_fees', feeInserts);
  await insertBatch('personal_stock_interest', interestInserts);
  await insertBatch('personal_stock_corrections', correctionInserts);

  // Reconcile
  const sumDelta = parsed.rows.reduce((acc, r) => acc + r.credit - r.debit, 0);
  const expected = (parsed.closeBalance ?? 0) - (parsed.openBalance ?? 0);
  const delta = Math.abs(sumDelta - expected);
  const status: 'ok' | 'reconcile_mismatch' = delta < 0.05 ? 'ok' : 'reconcile_mismatch';

  if (status !== 'ok') {
    await client
      .from('personal_stock_uploads')
      .update({ status, status_note: `delta=${delta.toFixed(4)}` })
      .eq('id', uploadId);
  }

  return { uploadId, status, parsed: counts, reconciliationDelta: delta, newInstruments };
}
