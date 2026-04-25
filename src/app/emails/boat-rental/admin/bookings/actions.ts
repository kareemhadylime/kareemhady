'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBoatAdmin, s, sOrNull, logAudit, shortRef } from '@/lib/boat-rental/server-helpers';
import { enqueueNotification, flushPendingForReservation } from '@/lib/boat-rental/notifications';

const VALID_BLOCK_REASONS = ['personal_use', 'maintenance', 'owner_trip', 'repair', 'other'] as const;

// Admin override — cancel any reservation regardless of 72h window.
export async function adminForceCancelAction(formData: FormData): Promise<void> {
  const me = await requireBoatAdmin();
  const id = s(formData.get('id'));
  const reason = sOrNull(formData.get('reason'));
  if (!id) return;
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, status, booking_date, broker_id, price_egp_snapshot,
      boat:boat_rental_boats ( name, owner:boat_rental_owners ( whatsapp, user_id ) )
    `
    )
    .eq('id', id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any;
  if (!r) return;
  if (['cancelled', 'expired', 'paid_to_owner'].includes(r.status)) return;

  const refundPending = r.status !== 'held';
  await sb
    .from('boat_rental_reservations')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: me.id,
      cancelled_by_role: 'admin',
      cancel_reason: reason || 'admin_force_cancel',
      refund_pending: refundPending,
      held_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  await logAudit({
    reservationId: id,
    actorUserId: me.id,
    actorRole: 'admin',
    action: 'force_cancel',
    fromStatus: r.status,
    toStatus: 'cancelled',
    payload: { reason, refund_pending: refundPending },
  });

  // Notify both broker and owner.
  await enqueueNotification({
    reservationId: id,
    to: { userId: r.broker_id, phone: '', role: 'broker' },
    templateKey: 'cancelled',
    language: 'en',
    context: {
      boatName: r.boat.name,
      bookingDate: r.booking_date,
      shortRef: shortRef(id),
      cancelledByRole: 'admin',
      cancelledByName: me.username,
    },
  });
  await enqueueNotification({
    reservationId: id,
    to: { userId: r.boat.owner.user_id, phone: r.boat.owner.whatsapp, role: 'owner' },
    templateKey: 'cancelled',
    language: 'en',
    context: {
      boatName: r.boat.name,
      bookingDate: r.booking_date,
      shortRef: shortRef(id),
      cancelledByRole: 'admin',
      cancelledByName: me.username,
    },
  });
  await flushPendingForReservation(id);

  revalidatePath('/emails/boat-rental/admin/bookings');
}

// Emergency override: admin can force-cancel a reservation AND
// simultaneously add an owner block on the same date in one action.
// Use case: boat broken last-minute, owner can't take the trip, the
// already-confirmed booking has to be killed and the date locked so no
// one else books it during repair.
export async function adminEmergencyBlockAction(formData: FormData): Promise<void> {
  const me = await requireBoatAdmin();
  const id = s(formData.get('id'));
  const reason = s(formData.get('reason'));
  const reasonNote = sOrNull(formData.get('reason_note'));
  if (!id || !reason) throw new Error('invalid_input');
  if (!VALID_BLOCK_REASONS.includes(reason as typeof VALID_BLOCK_REASONS[number])) {
    throw new Error('invalid_reason');
  }

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, status, booking_date, broker_id, boat_id,
      boat:boat_rental_boats ( name, owner_id, owner:boat_rental_owners ( whatsapp, user_id ) )
    `
    )
    .eq('id', id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any;
  if (!r) throw new Error('not_found');
  if (['cancelled', 'expired', 'paid_to_owner'].includes(r.status)) {
    throw new Error('bad_status');
  }

  // 1. Force-cancel the reservation.
  const refundPending = r.status !== 'held';
  await sb
    .from('boat_rental_reservations')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: me.id,
      cancelled_by_role: 'admin',
      cancel_reason: `emergency_${reason}${reasonNote ? `: ${reasonNote}` : ''}`,
      refund_pending: refundPending,
      held_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  // 2. Add an owner block for the same date so no one else books.
  await sb.from('boat_rental_owner_blocks').upsert(
    {
      boat_id: r.boat_id,
      blocked_date: r.booking_date,
      reason,
      reason_note: reasonNote,
      blocked_by: me.id,
      blocked_by_role: 'admin' as const,
    },
    { onConflict: 'boat_id,blocked_date', ignoreDuplicates: true }
  );

  await logAudit({
    reservationId: id,
    actorUserId: me.id,
    actorRole: 'admin',
    action: 'emergency_block',
    fromStatus: r.status,
    toStatus: 'cancelled',
    payload: { reason, reason_note: reasonNote, refund_pending: refundPending, blocked_date: r.booking_date },
  });

  // Notify both broker and owner.
  await enqueueNotification({
    reservationId: id,
    to: { userId: r.broker_id, phone: '', role: 'broker' },
    templateKey: 'cancelled',
    language: 'en',
    context: {
      boatName: r.boat.name,
      bookingDate: r.booking_date,
      shortRef: shortRef(id),
      cancelledByRole: 'admin',
      cancelledByName: me.username,
    },
  });
  await enqueueNotification({
    reservationId: id,
    to: { userId: r.boat.owner.user_id, phone: r.boat.owner.whatsapp, role: 'owner' },
    templateKey: 'cancelled',
    language: 'en',
    context: {
      boatName: r.boat.name,
      bookingDate: r.booking_date,
      shortRef: shortRef(id),
      cancelledByRole: 'admin',
      cancelledByName: me.username,
    },
  });
  await flushPendingForReservation(id);

  revalidatePath('/emails/boat-rental/admin/bookings');
  revalidatePath('/emails/boat-rental/owner/calendar');
}

export async function clearRefundFlagAction(formData: FormData): Promise<void> {
  const me = await requireBoatAdmin();
  const id = s(formData.get('id'));
  if (!id) return;
  const sb = supabaseAdmin();
  await sb
    .from('boat_rental_reservations')
    .update({ refund_pending: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  await logAudit({
    reservationId: id,
    actorUserId: me.id,
    actorRole: 'admin',
    action: 'clear_refund_flag',
  });
  revalidatePath('/emails/boat-rental/admin/bookings');
}
