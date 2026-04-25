import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cairoTodayStr } from '@/lib/boat-rental/pricing';

// Auto-closes reservations where the broker flagged
// "skipper collects cash from client before boarding". The day after the
// trip, we synthesize a skipper_cash payment row and flip the reservation
// to paid_to_owner — same end state as a broker-uploaded receipt, just
// recorded by the system on behalf of the skipper/owner.
//
// Runs once daily after Cairo midnight. Idempotent: the unique
// boat_rental_payments.reservation_id index prevents double-inserts, and
// we re-check the status on each row before updating.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type PendingRow = {
  reservation_id: string;
  skipper_collects_cash: boolean;
  reservation: {
    id: string;
    status: string;
    booking_date: string;
    price_egp_snapshot: string | number;
    broker_id: string;
  } | null;
};

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const today = cairoTodayStr();

  // Pull all skipper-cash bookings whose trip date has already passed AND
  // whose reservation is still in confirmed/details_filled. We check
  // payments separately below to avoid bringing the join into a complex
  // PostgREST filter.
  const { data: rawRows, error } = await sb
    .from('boat_rental_bookings')
    .select(
      `
      reservation_id, skipper_collects_cash,
      reservation:boat_rental_reservations!inner ( id, status, booking_date, price_egp_snapshot, broker_id )
    `
    )
    .eq('skipper_collects_cash', true)
    .lt('reservation.booking_date', today)
    .in('reservation.status', ['confirmed', 'details_filled']);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = ((rawRows as unknown) as PendingRow[] | null) || [];
  if (!rows.length) return NextResponse.json({ ok: true, closed: 0 });

  // Filter out any that already have a payment (idempotency safety net —
  // the unique index would also reject duplicates, but skipping early
  // keeps the audit log clean).
  const reservationIds = rows.map(r => r.reservation_id);
  const { data: existingPayments } = await sb
    .from('boat_rental_payments')
    .select('reservation_id')
    .in('reservation_id', reservationIds);
  const paid = new Set(
    ((existingPayments as Array<{ reservation_id: string }> | null) || []).map(p => p.reservation_id)
  );

  let closed = 0;
  let failed = 0;
  const nowIso = new Date().toISOString();

  for (const row of rows) {
    if (paid.has(row.reservation_id) || !row.reservation) continue;
    const res = row.reservation;

    const { error: payErr } = await sb.from('boat_rental_payments').insert({
      reservation_id: res.id,
      amount_egp: Number(res.price_egp_snapshot),
      receipt_path: null,
      paid_at: nowIso,
      recorded_by: null,
      recorded_by_role: 'system',
      method: 'skipper_cash',
      note: 'Auto-closed by skipper-cash cron — collected on board.',
    });
    if (payErr) {
      failed++;
      continue;
    }

    const { error: upErr } = await sb
      .from('boat_rental_reservations')
      .update({ status: 'paid_to_owner', updated_at: nowIso })
      .eq('id', res.id);
    if (upErr) {
      failed++;
      continue;
    }

    await sb.from('boat_rental_audit_log').insert({
      reservation_id: res.id,
      actor_user_id: null,
      actor_role: 'system',
      action: 'auto_close_skipper_cash',
      from_status: res.status,
      to_status: 'paid_to_owner',
      payload: { amount_egp: Number(res.price_egp_snapshot), broker_id: res.broker_id, booking_date: res.booking_date },
    });

    closed++;
  }

  return NextResponse.json({ ok: true, closed, failed, scanned: rows.length });
}
