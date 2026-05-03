'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import {
  requireBoatRoleOrThrow,
  s,
  sOrNull,
  logAudit,
  shortRef,
} from '@/lib/boat-rental/server-helpers';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { resolvePricingTier, cairoTodayStr } from '@/lib/boat-rental/pricing';
import { getDefaultSkipper } from '@/lib/boat-rental/skipper-resolver';
import { enqueueNotification, flushPendingForReservation } from '@/lib/boat-rental/notifications';

const VALID_SOURCES = ['registered_broker', 'external_broker', 'client_direct'] as const;
type ReservationSource = (typeof VALID_SOURCES)[number];

export async function createManualReservationAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('owner');
  const boatId = s(formData.get('boat_id'));
  const date = s(formData.get('booking_date'));
  const priceStr = s(formData.get('trip_price'));
  const source = s(formData.get('source')) as ReservationSource;
  const brokerId = sOrNull(formData.get('broker_id'));
  const externalBrokerId = sOrNull(formData.get('external_broker_id'));
  const skipperId = sOrNull(formData.get('skipper_id'));
  const notes = sOrNull(formData.get('notes'));

  if (!boatId || !date || !priceStr || !source) throw new Error('invalid_input');
  if (!VALID_SOURCES.includes(source)) throw new Error('invalid_source');
  const price = Number(priceStr);
  if (!Number.isFinite(price) || price <= 0) throw new Error('invalid_price');
  if (date < cairoTodayStr()) throw new Error('cannot_book_past_date');

  // Source/broker consistency (also enforced by DB CHECK constraint).
  if (source === 'registered_broker' && !brokerId) throw new Error('broker_id_required');
  if (source === 'external_broker' && !externalBrokerId) throw new Error('external_broker_id_required');
  if (source === 'client_direct' && (brokerId || externalBrokerId)) throw new Error('source_inconsistent');

  // Owner-owns-boat check.
  const ownerIds = await getOwnedOwnerIds(me);
  const sb = supabaseAdmin();
  const { data: boatRow } = await sb
    .from('boat_rental_boats')
    .select('id, name, owner_id')
    .eq('id', boatId)
    .maybeSingle();
  const boat = boatRow as { id: string; name: string; owner_id: string } | null;
  if (!boat || !ownerIds.includes(boat.owner_id)) {
    throw new Error('forbidden');
  }

  // Date conflict check (existing reservation OR owner block).
  const [resvConflict, blockConflict] = await Promise.all([
    sb
      .from('boat_rental_reservations')
      .select('id')
      .eq('boat_id', boatId)
      .eq('booking_date', date)
      .in('status', ['held', 'confirmed', 'details_filled', 'paid_to_owner'])
      .maybeSingle(),
    sb
      .from('boat_rental_owner_blocks')
      .select('id')
      .eq('boat_id', boatId)
      .eq('blocked_date', date)
      .maybeSingle(),
  ]);
  if (resvConflict.data) throw new Error('date_already_booked');
  if (blockConflict.data) throw new Error('date_owner_blocked');

  const tier = await resolvePricingTier(date);

  const { data: row, error } = await sb
    .from('boat_rental_reservations')
    .insert({
      boat_id: boatId,
      booking_date: date,
      broker_id: source === 'registered_broker' ? brokerId : null,
      external_broker_id: source === 'external_broker' ? externalBrokerId : null,
      source,
      created_by_role: 'owner',
      status: 'confirmed',
      held_until: null,
      price_egp_snapshot: price,
      pricing_tier_snapshot: tier,
      notes,
    })
    .select('id')
    .single();
  if (error) throw error;
  const reservationId = (row as { id: string }).id;

  await logAudit({
    reservationId,
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'manual_reservation_create',
    fromStatus: null,
    toStatus: 'confirmed',
    payload: { source, skipper_id: skipperId, price },
  });

  // Notify the assigned skipper (or default for the boat if none picked).
  let notifySkipper: { id: string; name: string; whatsapp: string } | null = null;
  if (skipperId) {
    const { data: sk } = await sb
      .from('boat_rental_skippers')
      .select('id, name, whatsapp')
      .eq('id', skipperId)
      .maybeSingle();
    notifySkipper = sk as { id: string; name: string; whatsapp: string } | null;
  }
  if (!notifySkipper) {
    const def = await getDefaultSkipper(boatId);
    if (def) notifySkipper = { id: def.id, name: def.name, whatsapp: def.whatsapp };
  }
  if (notifySkipper && notifySkipper.whatsapp) {
    const { data: ownerRow } = await sb
      .from('boat_rental_owners')
      .select('name')
      .eq('id', boat.owner_id)
      .maybeSingle();
    const ownerName = (ownerRow as { name: string } | null)?.name ?? 'owner';
    await enqueueNotification({
      reservationId,
      to: { phone: notifySkipper.whatsapp, role: 'skipper' },
      templateKey: 'manual_reservation_created',
      language: 'en',
      context: {
        boatName: boat.name,
        bookingDate: date,
        skipperName: notifySkipper.name,
        ownerName,
        shortRef: shortRef(reservationId),
      },
    });
    await flushPendingForReservation(reservationId);
  }

  revalidatePath('/emails/boat-rental/owner/calendar');
  revalidatePath('/emails/boat-rental/owner/reservations');
  redirect(`/emails/boat-rental/owner/booking/${reservationId}`);
}
