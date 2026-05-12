// POST /api/personal/stocks/prices — admin-only: insert one or more
// manual price-check snapshots into personal_stock_current_prices.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

const Body = z.object({
  entries: z.array(z.object({
    instrumentId: z.number(),
    price: z.number().nonnegative(),
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().nullable().optional(),
  })).min(1),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsed.error.issues }, { status: 400 });
  }

  const client = supabaseAdmin();
  const rows = parsed.data.entries.map((e) => ({
    instrument_id: e.instrumentId,
    price: e.price,
    as_of_date: e.asOfDate,
    entered_by: user.username,
    note: e.note ?? null,
  }));
  const r = await client.from('personal_stock_current_prices').insert(rows);
  if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  return NextResponse.json({ inserted: rows.length });
}
