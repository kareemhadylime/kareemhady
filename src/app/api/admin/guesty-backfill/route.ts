import { NextRequest, NextResponse } from 'next/server';
import { runGuestySync } from '@/lib/run-guesty-sync';
import { supabaseAdmin } from '@/lib/supabase';

// Phase O.5 — One-shot backfill to clear any Guesty backlog accumulated
// before webhooks were configured (or while webhooks were down). Same
// runner as the daily cron, just triggered ad-hoc.
//
// Auth: CRON_SECRET via Bearer header or ?secret= query param.
// Use sparingly — runs the full sync (~60s), pulls 365d of reservations.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const result = await runGuestySync('admin_backfill');
  // After Guesty sync, propagate to Beit Hady tables
  try {
    const sb = supabaseAdmin();
    await sb.rpc('beithady_communication_ingest');
    await sb.rpc('beithady_communication_sla_recompute');
  } catch (e) {
    // best-effort propagation
    return NextResponse.json({
      ok: result.ok,
      result,
      propagation_error: e instanceof Error ? e.message : String(e),
    }, { status: 200 });
  }
  return NextResponse.json({ ok: result.ok, result }, { status: result.ok ? 200 : 500 });
}

// GET fallback for browser-triggered backfill (still needs ?secret=)
export async function GET(req: NextRequest) {
  return POST(req);
}
