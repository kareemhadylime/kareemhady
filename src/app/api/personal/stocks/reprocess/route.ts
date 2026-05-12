// POST /api/personal/stocks/reprocess — admin-only: clear derived rows
// for an upload so the classifier can re-run. v1 is cleanup-only; the
// re-classify body is deferred to a future micro-task.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DERIVED_TABLES = [
  'personal_stock_trades',
  'personal_stock_dividends',
  'personal_stock_cash_movements',
  'personal_stock_fees',
  'personal_stock_interest',
  'personal_stock_corrections',
] as const;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let body: { uploadId?: number | string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const { uploadId } = body;
  if (!uploadId) return NextResponse.json({ error: 'uploadId required' }, { status: 400 });

  const client = supabaseAdmin();
  const { data: raws } = await client
    .from('personal_stock_raw_rows')
    .select('id')
    .eq('upload_id', uploadId);
  const rawIds = ((raws ?? []) as Array<{ id: number }>).map((r) => r.id);
  if (rawIds.length === 0) return NextResponse.json({ error: 'no raw rows' }, { status: 404 });

  for (const table of DERIVED_TABLES) {
    const { error } = await client.from(table).delete().in('raw_row_id', rawIds);
    if (error) return NextResponse.json({ error: `failed clearing ${table}: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ status: 'reclassify-pending', cleared: rawIds.length });
}
