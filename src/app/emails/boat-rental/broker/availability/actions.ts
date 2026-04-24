'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBoatRoleOrThrow, s, logAudit } from '@/lib/boat-rental/server-helpers';
import { priceForBoatOnDate } from '@/lib/boat-rental/pricing';

// Creates a 2-hour hold on the selected boat/date. The partial unique
// index on boat_rental_reservations (boat_id, booking_date) WHERE
// status in (...) enforces single-active-reservation-per-slot at the
// DB level — we still race-check first for a nicer error message.

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

  // Must exist + active.
  const { data: boatRow } = await sb
    .from('boat_rental_boats')
    .select('id, status')
    .eq('id', boatId)
    .maybeSingle();
  const boat = boatRow as { id: string; status: string } | null;
  if (!boat || boat.status !== 'active') throw new Error('boat_unavailable');

  // Not already held/booked on that date.
  const { data: existing } = await sb
    .from('boat_rental_reservations')
    .select('id, status')
    .eq('boat_id', boatId)
    .eq('booking_date', bookingDate)
    .in('status', ['held', 'confirmed', 'details_filled', 'paid_to_owner'])
    .maybeSingle();
  if (existing) throw new Error('slot_taken');

  // Snapshot price.
  const price = await priceForBoatOnDate(boatId, bookingDate);
  if (!price) throw new Error('no_price_for_date');

  const heldUntil = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
  const { data: created, error } = await sb
    .from('boat_rental_reservations')
    .insert({
      boat_id: boatId,
      booking_date: bookingDate,
      broker_id: me.id,
      status: 'held',
      held_until: heldUntil,
      price_egp_snapshot: price.amountEgp,
      pricing_tier_snapshot: price.tier,
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
    payload: { boat_id: boatId, booking_date: bookingDate, price_egp: price.amountEgp, tier: price.tier },
  });

  revalidatePath('/emails/boat-rental/broker');
  revalidatePath('/emails/boat-rental/broker/holds');
  redirect('/emails/boat-rental/broker/holds');
}
