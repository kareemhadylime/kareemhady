import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { hasBoatRole, getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { logAudit, shortRef } from '@/lib/boat-rental/server-helpers';
import { enqueueNotification, flushPendingForReservation } from '@/lib/boat-rental/notifications';

// Background-sync replay endpoint for the offline owner Mark-Paid queue.
//
// Idempotency: the client sends a UUIDv4 'id' as the dedup key. The
// payments table has a partial unique index on idempotency_key (only
// where not null), so a second insert with the same key fails — at
// which point we return 409 to signal "already processed", and the
// queue removes the entry.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Body = {
  id: string;            // UUID idempotency key
  reservationId: string;
  amountEgp: number;
  method: string;
  note: string | null;
};

function uuidShape(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBoatRole(me, 'owner'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body || !uuidShape(body.id) || !body.reservationId || !Number.isFinite(body.amountEgp) || body.amountEgp <= 0) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Idempotency check first — if a payment with this key already exists,
  // return 409 so the client clears its queue without retrying.
  const { data: existing } = await sb
    .from('boat_rental_payments')
    .select('id, reservation_id')
    .eq('idempotency_key', body.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, deduped: true }, { status: 409 });
  }

  // Authorize: owner must control the boat for this reservation.
  const ownerIds = await getOwnedOwnerIds(me);
  if (!ownerIds.length) {
    return NextResponse.json({ error: 'no_owner_records' }, { status: 403 });
  }
  const { data: resvRow } = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, status, broker_id,
      boat:boat_rental_boats ( name, owner_id, owner:boat_rental_owners ( id, name, whatsapp, user_id ) )
    `
    )
    .eq('id', body.reservationId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = resvRow as any;
  if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!ownerIds.includes(r.boat.owner_id)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!['confirmed', 'details_filled'].includes(r.status)) {
    return NextResponse.json({ error: 'bad_status' }, { status: 409 });
  }

  // Insert payment + flip reservation status.
  const { error: insertErr } = await sb.from('boat_rental_payments').insert({
    reservation_id: body.reservationId,
    amount_egp: body.amountEgp,
    receipt_path: null,
    paid_at: new Date().toISOString(),
    recorded_by: me.id,
    recorded_by_role: 'owner',
    method: body.method || 'manual_override',
    note: body.note,
    idempotency_key: body.id,
  });
  if (insertErr) {
    // Race: another replay landed first. Treat as dedupe.
    if ((insertErr.message || '').toLowerCase().includes('idempotency_key')) {
      return NextResponse.json({ ok: true, deduped: true }, { status: 409 });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }
  await sb
    .from('boat_rental_reservations')
    .update({ status: 'paid_to_owner', updated_at: new Date().toISOString() })
    .eq('id', body.reservationId);

  await logAudit({
    reservationId: body.reservationId,
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'owner_mark_paid_replay',
    fromStatus: r.status,
    toStatus: 'paid_to_owner',
    payload: { amount_egp: body.amountEgp, method: body.method, idempotency_key: body.id },
  });

  // Notify owner-side WhatsApp confirming receipt landed.
  await enqueueNotification({
    reservationId: body.reservationId,
    to: { userId: r.boat.owner.user_id, phone: r.boat.owner.whatsapp, role: 'owner' },
    templateKey: 'payment_received',
    language: 'en',
    context: {
      boatName: r.boat.name,
      bookingDate: '',
      amountEgp: body.amountEgp,
      shortRef: shortRef(body.reservationId),
    },
  });
  await flushPendingForReservation(body.reservationId);

  return NextResponse.json({ ok: true });
}
