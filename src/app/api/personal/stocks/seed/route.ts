// POST /api/personal/stocks/seed — one-shot admin bulk-import of every
// AOLB statement in STOCK_AOLB_SEED_PATH. Idempotent at the file level
// because importAolbFile dedupes on (filename, content hash).

import { NextResponse } from 'next/server';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { supabaseAdmin } from '@/lib/supabase';
import { importAolbFile } from '@/lib/personal/stocks/import';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const seedPath = process.env.STOCK_AOLB_SEED_PATH;
  if (!seedPath) return NextResponse.json({ error: 'STOCK_AOLB_SEED_PATH not set' }, { status: 500 });

  let entries: string[];
  try { entries = await readdir(seedPath); }
  catch (err: any) {
    if (err?.code === 'ENOENT') return NextResponse.json({ error: 'seed path unreadable', path: seedPath }, { status: 503 });
    throw err;
  }
  const xlsFiles = entries.filter((f) => /^AOLB Account \d{3} - \d{4}\.xls$/i.test(f));
  const client = supabaseAdmin();
  const results: Array<Record<string, unknown>> = [];
  for (const f of xlsFiles) {
    const xml = await readFile(path.join(seedPath, f), 'utf8');
    try {
      const r = await importAolbFile({ filename: f, xml, client, uploadedBy: user.username });
      results.push({ filename: f, ...r });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ filename: f, status: 'error', message });
    }
  }
  return NextResponse.json({ results });
}
