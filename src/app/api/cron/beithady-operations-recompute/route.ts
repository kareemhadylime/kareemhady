import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Phase J.5 — every 30 min, recompute payment status + AI risk score
// for active reservations. Calls the SQL RPC `beithady_calendar_recompute_all_active`
// which iterates [today-7, today+90] and writes to
// beithady_reservation_overrides. Safe to call repeatedly.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) {
    console.error('[cron beithady-operations-recompute] CRON_SECRET unset — refusing');
    return false;
  }
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const sb = supabaseAdmin();
  try {
    const t0 = Date.now();
    const { data, error } = await sb.rpc('beithady_calendar_recompute_all_active');
    if (error) throw new Error(error.message);
    return NextResponse.json({
      ok: true,
      reservations_recomputed: data,
      duration_ms: Date.now() - t0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
