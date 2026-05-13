// POST /api/personal/stocks/overrides — admin-only: upsert a position override
// for (account_id, instrument_id). qty_held = 0 means "fully exited, hide from
// positions view". Used to bridge off-invoice events (silent inter-account
// stock transfers, IPO subscription allocations) that don't appear in any
// AOLB statement export.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

const Body = z.object({
  accountId: z.number().int().positive(),
  instrumentId: z.number().int().positive(),
  qtyHeld: z.number().nonnegative(),
  avgCost: z.number().nonnegative(),
  note: z.string().nullable().optional(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
  const d = parsed.data;
  const client = supabaseAdmin();
  const { data, error } = await client
    .from('personal_stock_position_overrides')
    .upsert(
      {
        account_id: d.accountId,
        instrument_id: d.instrumentId,
        qty_held: d.qtyHeld,
        avg_cost: d.avgCost,
        note: d.note ?? null,
        as_of_date: d.asOfDate,
        entered_by: user.username,
        entered_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,instrument_id' },
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ override: data });
}
