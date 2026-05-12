/**
 * One-off seed: bulk-import all 7 AOLB statement files for the Personal Stock
 * Investment module. Calls the production importAolbFile orchestrator with a
 * service-role Supabase client so it bypasses the admin HTTP route entirely.
 *
 * Run from repo root:
 *   npx tsx scripts/seed-stocks.ts
 *
 * Requires .env.local to define:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Idempotent: importAolbFile dedupes by sha256, so re-running just reports
 * duplicates rather than double-inserting.
 */
import { readFileSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import path from 'node:path';

// Minimal .env.local loader — avoids a dotenv dep. Runs before importing
// supabaseAdmin() so its process.env reads see the values.
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
// Production-pulled creds (sb_secret_*) take precedence: legacy service-role
// JWTs in .env.local were disabled 2026-05-03.
loadEnvLocal(path.join(process.cwd(), '.env.production.local'));
loadEnvLocal(path.join(process.cwd(), '.env.local'));

import { supabaseAdmin } from '../src/lib/supabase';
import { importAolbFile } from '../src/lib/personal/stocks/import';
import { parseAolbXml } from '../src/lib/personal/stocks/parse-aolb';

const FILES = [
  'AOLB Account 001 - 2024.xls',
  'AOLB Account 001 - 2025.xls',
  'AOLB Account 001 - 2026.xls',
  'AOLB Account 003 - 2024.xls',
  'AOLB Account 003 - 2025.xls',
  'AOLB Account 003 - 2026.xls',
  'AOLB Account 009 - 2024.xls',
];

const SOURCE_DIR = path.join('C:', 'kareemhady', 'Lime Domains', 'Personal', 'AOLB');
const UPLOADED_BY = 'seed-script';

async function main(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const client = supabaseAdmin();

  console.log('Seeding Personal Stock module from', SOURCE_DIR);
  console.log('Files:', FILES.length);
  console.log('');

  let anyMismatch = false;
  const summary: Array<{
    filename: string;
    status: string;
    rawRows: number;
    trades: number;
    dividends: number;
    cash: number;
    fees: number;
    interest: number;
    corrections: number;
    skipped: number;
    delta: number;
    newInstruments: number;
    warnings: number;
  }> = [];

  for (const filename of FILES) {
    const fullPath = path.join(SOURCE_DIR, filename);
    let xml: string;
    try {
      xml = await readFileAsync(fullPath, 'utf8');
    } catch (err: any) {
      console.error(`[${filename}] read failed: ${err.message}`);
      continue;
    }

    // Pre-parse to surface parseWarnings (importAolbFile doesn't return them).
    let warnings: string[] = [];
    try {
      const parsed = parseAolbXml(xml);
      warnings = parsed.parseWarnings ?? [];
    } catch (err: any) {
      // Will be reported by importAolbFile below.
    }

    let result;
    try {
      result = await importAolbFile({ filename, xml, client, uploadedBy: UPLOADED_BY });
    } catch (err: any) {
      console.error(`[${filename}] import threw: ${err.message}`);
      continue;
    }

    if (warnings.length) {
      console.log(`[${filename}] parseWarnings (${warnings.length}):`);
      for (const w of warnings) console.log('  - ' + w);
    }

    console.log(
      `[${filename}] status=${result.status} rawRows=${result.parsed.rawRows} ` +
        `trades=${result.parsed.trades} divs=${result.parsed.dividends} cash=${result.parsed.cash} ` +
        `fees=${result.parsed.fees} int=${result.parsed.interest} corr=${result.parsed.corrections} ` +
        `skipped=${result.parsed.skipped} delta=${result.reconciliationDelta.toFixed(4)} ` +
        `newInstruments=${result.newInstruments}` +
        (result.message ? ` message=${result.message}` : '')
    );

    summary.push({
      filename,
      status: result.status,
      rawRows: result.parsed.rawRows,
      trades: result.parsed.trades,
      dividends: result.parsed.dividends,
      cash: result.parsed.cash,
      fees: result.parsed.fees,
      interest: result.parsed.interest,
      corrections: result.parsed.corrections,
      skipped: result.parsed.skipped,
      delta: result.reconciliationDelta,
      newInstruments: result.newInstruments,
      warnings: warnings.length,
    });

    if (result.status === 'reconcile_mismatch') anyMismatch = true;
  }

  console.log('');
  console.log('=== Summary ===');
  console.table(summary);

  if (anyMismatch) {
    console.warn('One or more uploads have status=reconcile_mismatch — investigate before proceeding.');
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
