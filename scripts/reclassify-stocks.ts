/**
 * One-off cleanup: re-classify personal_stock_raw_rows that were marked
 * "skipped" because the original parser regex didn't tolerate the truncated
 * "/L." suffix variant in AOLB descriptions. Inserts the recovered Buy/Sell
 * rows into personal_stock_trades.
 *
 * Run from repo root:
 *   npx tsx scripts/reclassify-stocks.ts
 *
 * Idempotent: only acts on raw rows that have no existing derived row.
 * Reads instruments / accounts from the live tables so it doesn't depend on
 * the import script's in-memory caches.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadEnvLocal(envPath: string): void {
  let raw: string;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvLocal(path.join(process.cwd(), '.env.production.local'));
loadEnvLocal(path.join(process.cwd(), '.env.local'));

import { supabaseAdmin } from '../src/lib/supabase';
import { classifyRow } from '../src/lib/personal/stocks/classify';
import { slugifyInstrumentName } from '../src/lib/personal/stocks/instruments';
import type { AolbRawRow } from '../src/lib/personal/stocks/parse-aolb';

async function main(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const client = supabaseAdmin();

  // Find raw Buy/Sell rows that don't have a matching trade row.
  // RPC would be simpler but we don't have one — use a left-join via two queries.
  const orphanRes = await client
    .from('personal_stock_raw_rows')
    .select('id, upload_id, row_index, op_type, description, debit, credit, occurred_at, details, balance_after, dc_flag')
    .in('op_type', ['Buy Invoice', 'Sell Invoice']);
  if (orphanRes.error) throw orphanRes.error;
  const rawRows = orphanRes.data ?? [];

  const tradeRes = await client.from('personal_stock_trades').select('raw_row_id');
  if (tradeRes.error) throw tradeRes.error;
  const haveTrade = new Set((tradeRes.data ?? []).map((t: any) => t.raw_row_id));

  const orphans = rawRows.filter((r: any) => !haveTrade.has(r.id));
  console.log(`Found ${orphans.length} unclassified Buy/Sell raw rows.`);
  if (!orphans.length) {
    console.log('Nothing to do.');
    return;
  }

  // Resolve account_id by upload_id (cached).
  const accountIdByUpload = new Map<string, number>();
  async function resolveAccountIdForUpload(uploadId: string): Promise<number> {
    if (accountIdByUpload.has(uploadId)) return accountIdByUpload.get(uploadId)!;
    const r = await client.from('personal_stock_uploads').select('account_id').eq('id', uploadId).single();
    if (r.error) throw r.error;
    accountIdByUpload.set(uploadId, r.data.account_id);
    return r.data.account_id;
  }

  // Resolve / create instrument by name.
  const instrumentIdByTicker = new Map<string, number>();
  async function resolveInstrumentId(kind: 'stock' | 'fund', name: string): Promise<number> {
    const ticker = slugifyInstrumentName(name);
    if (instrumentIdByTicker.has(ticker)) return instrumentIdByTicker.get(ticker)!;
    const exist = await client.from('personal_stock_instruments').select('id').eq('ticker', ticker).maybeSingle();
    if (exist.data) {
      instrumentIdByTicker.set(ticker, exist.data.id);
      return exist.data.id;
    }
    const ins = await client.from('personal_stock_instruments').insert({ kind, ticker, name }).select().single();
    if (ins.error) throw ins.error;
    instrumentIdByTicker.set(ticker, ins.data.id);
    return ins.data.id;
  }

  let fixed = 0;
  let stillSkipped = 0;
  let newInstruments = 0;
  const byUpload = new Map<string, { fixed: number; skipped: number }>();

  const tradeInserts: any[] = [];
  for (const raw of orphans) {
    const r: AolbRawRow = {
      rowIndex: raw.row_index,
      details: raw.details,
      occurredAt: raw.occurred_at,
      opType: raw.op_type,
      description: raw.description,
      debit: Number(raw.debit),
      credit: Number(raw.credit),
      balanceAfter: Number(raw.balance_after),
      dcFlag: raw.dc_flag,
    };
    const c = classifyRow(r);
    const tally = byUpload.get(raw.upload_id) ?? { fixed: 0, skipped: 0 };
    if (c.kind !== 'trade') {
      stillSkipped += 1;
      tally.skipped += 1;
      byUpload.set(raw.upload_id, tally);
      continue;
    }
    const accountId = await resolveAccountIdForUpload(raw.upload_id);
    const sizeBefore = instrumentIdByTicker.size;
    const instrumentId = await resolveInstrumentId(c.data.instrumentKind, c.data.instrumentName);
    if (instrumentIdByTicker.size > sizeBefore) newInstruments += 1;
    tradeInserts.push({
      raw_row_id: raw.id,
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
    fixed += 1;
    tally.fixed += 1;
    byUpload.set(raw.upload_id, tally);
  }

  if (tradeInserts.length) {
    const ins = await client.from('personal_stock_trades').insert(tradeInserts);
    if (ins.error) throw new Error(`Insert into personal_stock_trades failed: ${ins.error.message}`);
  }

  console.log('=== Reclassify summary ===');
  console.log(`fixed=${fixed} stillSkipped=${stillSkipped} newInstruments=${newInstruments}`);
  for (const [uid, t] of byUpload.entries()) {
    console.log(`  upload ${uid}: +${t.fixed} trades, ${t.skipped} still skipped`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
