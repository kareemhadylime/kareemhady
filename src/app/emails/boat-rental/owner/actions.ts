'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import {
  requireBoatRoleOrThrow,
  s,
  sOrNull,
  nOrNull,
  logAudit,
  shortRef,
} from '@/lib/boat-rental/server-helpers';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { isWithinCancellationWindow } from '@/lib/boat-rental/pricing';
import { enqueueNotification, flushPendingForReservation } from '@/lib/boat-rental/notifications';

// Guard: the reservation's boat must belong to an owner record the caller controls.
async function assertOwnerCanAct(reservationId: string, userId: string): Promise<
  | {
      id: string;
      status: string;
      booking_date: string;
      boat_id: string;
      price_egp_snapshot: string | number;
      notes: string | null;
      boat: { name: string; owner: { id: string; name: string; whatsapp: string; user_id: string | null } };
      broker: { id: string; username: string } | null;
    }
  | null
> {
  const ownedOwnerIds = await getOwnedOwnerIds({ id: userId } as never);
  if (!ownedOwnerIds.length) return null;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, status, booking_date, boat_id, price_egp_snapshot, notes, broker_id,
      boat:boat_rental_boats ( name, owner_id, owner:boat_rental_owners ( id, name, whatsapp, user_id ) )
    `
    )
    .eq('id', reservationId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any;
  if (!r) return null;
  if (!ownedOwnerIds.includes(r.boat.owner_id)) return null;
  const { data: brokerRow } = await sb
    .from('app_users')
    .select('id, username')
    .eq('id', r.broker_id)
    .maybeSingle();
  return {
    id: r.id,
    status: r.status,
    booking_date: r.booking_date,
    boat_id: r.boat_id,
    price_egp_snapshot: r.price_egp_snapshot,
    notes: r.notes,
    boat: { name: r.boat.name, owner: r.boat.owner },
    broker: brokerRow as { id: string; username: string } | null,
  };
}

export async function markPaidManuallyAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('owner');
  const id = s(formData.get('id'));
  const amount = nOrNull(formData.get('amount_egp'));
  const method = s(formData.get('method'));
  const note = sOrNull(formData.get('note'));
  if (!id || !amount || amount <= 0) throw new Error('invalid_input');

  const r = await assertOwnerCanAct(id, me.id);
  if (!r) throw new Error('forbidden');
  if (!['confirmed', 'details_filled'].includes(r.status)) throw new Error('bad_status');

  const sb = supabaseAdmin();
  await sb.from('boat_rental_payments').upsert(
    {
      reservation_id: id,
      amount_egp: amount,
      receipt_path: null,
      paid_at: new Date().toISOString(),
      recorded_by: me.id,
      recorded_by_role: 'owner',
      method: method || 'manual_override',
      note,
    },
    { onConflict: 'reservation_id' }
  );
  await sb
    .from('boat_rental_reservations')
    .update({ status: 'paid_to_owner', updated_at: new Date().toISOString() })
    .eq('id', id);

  await logAudit({
    reservationId: id,
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'owner_mark_paid',
    fromStatus: r.status,
    toStatus: 'paid_to_owner',
    payload: { amount_egp: amount, method, note_present: !!note },
  });

  revalidatePath('/emails/boat-rental/owner');
  revalidatePath('/emails/boat-rental/owner/calendar');
}

export async function cancelReservationOwnerAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('owner');
  const id = s(formData.get('id'));
  if (!id) return;
  const r = await assertOwnerCanAct(id, me.id);
  if (!r) throw new Error('forbidden');
  if (!['held', 'confirmed'].includes(r.status)) throw new Error('bad_status');
  if (!isWithinCancellationWindow(r.booking_date)) throw new Error('cancellation_window_closed');

  const sb = supabaseAdmin();
  const refundPending = r.status === 'confirmed';
  await sb
    .from('boat_rental_reservations')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: me.id,
      cancelled_by_role: 'owner',
      cancel_reason: 'owner_cancelled',
      refund_pending: refundPending,
      held_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  await logAudit({
    reservationId: id,
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'cancel',
    fromStatus: r.status,
    toStatus: 'cancelled',
    payload: { refund_pending: refundPending },
  });

  // Notify broker.
  if (r.broker) {
    const { data: brokerDomainRow } = await supabaseAdmin()
      .from('app_users')
      .select('id, username')
      .eq('id', r.broker.id)
      .maybeSingle();
    void brokerDomainRow;
  }
  await enqueueNotification({
    reservationId: id,
    to: { userId: r.broker?.id, phone: '', role: 'broker' },
    templateKey: 'cancelled',
    language: 'en',
    context: {
      boatName: r.boat.name,
      bookingDate: r.booking_date,
      shortRef: shortRef(id),
      cancelledByRole: 'owner',
      cancelledByName: me.username,
    },
  });
  await flushPendingForReservation(id);

  revalidatePath('/emails/boat-rental/owner');
  revalidatePath('/emails/boat-rental/owner/calendar');
}
