import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Expires stale 2-hour reservation holds. A 'held' row that passes its
// held_until timestamp is flipped to 'expired', freeing the date for
// other brokers. Runs every 15 minutes.
//
// Also writes one audit_log row per expired reservation so the broker
// can see what happened when they come back.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: stale } = await sb
    .from('boat_rental_reservations')
    .select('id, boat_id, booking_date, broker_id')
    .eq('status', 'held')
    .lt('held_until', nowIso)
    .limit(500);

  const rows = (stale as Array<{ id: string; boat_id: string; booking_date: string; broker_id: string }> | null) || [];
  if (!rows.length) return NextResponse.json({ ok: true, expired: 0 });

  const ids = rows.map(r => r.id);

  const { error: upErr } = await sb
    .from('boat_rental_reservations')
    .update({ status: 'expired', updated_at: nowIso })
    .in('id', ids);
  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  // Best-effort audit — don't fail the whole cron if logging chokes.
  await sb.from('boat_rental_audit_log').insert(
    rows.map(r => ({
      reservation_id: r.id,
      actor_user_id: null,
      actor_role: 'system',
      action: 'hold_expired',
      from_status: 'held',
      to_status: 'expired',
      payload: { boat_id: r.boat_id, booking_date: r.booking_date, broker_id: r.broker_id },
    }))
  );

  return NextResponse.json({ ok: true, expired: rows.length });
}
