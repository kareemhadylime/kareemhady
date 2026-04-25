'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBoatRoleOrThrow, s, logAudit } from '@/lib/boat-rental/server-helpers';
import { checkAvailability } from '@/lib/boat-rental/availability';

// Creates a 2-hour hold on the selected boat/date. The partial unique
// index on boat_rental_reservations enforces single-active-reservation-
// per-slot at the DB level; we use the shared availability checker
// (which also rejects owner-blocked dates) for the friendly error path
// + to capture an inquiry log row.

const HOLD_MINUTES = 120;

function validDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function reserveHoldAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('broker');
  const boatId = s(formData.get('boat_id'));
  const bookingDate = s(formData.get('booking_date'));
  if (!boatId || !validDate(bookingDate)) throw new Error('invalid_input');

  const sb = supabaseAdmin();

  const av = await checkAvailability(boatId, bookingDate);
  if (av.kind !== 'available') {
    if (av.kind === 'blocked') throw new Error('date_blocked_by_owner');
    if (av.kind === 'booked') throw new Error('slot_taken');
    if (av.kind === 'no_price') throw new Error('no_price_for_date');
    throw new Error('unavailable');
  }

  const heldUntil = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
  const { data: created, error } = await sb
    .from('boat_rental_reservations')
    .insert({
      boat_id: boatId,
      booking_date: bookingDate,
      broker_id: me.id,
      status: 'held',
      held_until: heldUntil,
      price_egp_snapshot: av.amountEgp,
      pricing_tier_snapshot: av.tier,
    })
    .select('id')
    .single();
  if (error || !created) throw new Error(error?.message || 'reserve_failed');
  const resId = (created as { id: string }).id;

  await logAudit({
    reservationId: resId,
    actorUserId: me.id,
    actorRole: 'broker',
    action: 'create_hold',
    toStatus: 'held',
    payload: { boat_id: boatId, booking_date: bookingDate, price_egp: av.amountEgp, tier: av.tier },
  });

  await sb.from('boat_rental_inquiries').insert({
    boat_id: boatId,
    booking_date: bookingDate,
    broker_id: me.id,
    outcome: 'held',
    price_egp: av.amountEgp,
    tier: av.tier,
  });

  revalidatePath('/emails/boat-rental/broker');
  revalidatePath('/emails/boat-rental/broker/holds');
  redirect('/emails/boat-rental/broker/holds');
}
