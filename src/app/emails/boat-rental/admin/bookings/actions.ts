'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBoatAdmin, s, sOrNull, logAudit, shortRef } from '@/lib/boat-rental/server-helpers';
import { enqueueNotification, flushPendingForReservation } from '@/lib/boat-rental/notifications';

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
