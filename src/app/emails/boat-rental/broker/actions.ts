'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import {
  requireBoatRoleOrThrow,
  s,
  sOrNull,
  nOrNull,
  logAudit,
  shortRef,
} from '@/lib/boat-rental/server-helpers';
import { isWithinCancellationWindow } from '@/lib/boat-rental/pricing';
import { enqueueNotification, flushPendingForReservation } from '@/lib/boat-rental/notifications';

// Shared helper: gather recipients + context for notifications tied to a reservation.
async function getReservationContext(reservationId: string) {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, booking_date, status, price_egp_snapshot, notes, broker_id,
      boat:boat_rental_boats (
        name, skipper_name, skipper_whatsapp, capacity_guests,
        owner:boat_rental_owners ( id, name, whatsapp, user_id )
      )
    `
    )
    .eq('id', reservationId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any;
  if (!r) return null;
  const { data: brokerRow } = await sb
    .from('app_users')
    .select('id, username')
    .eq('id', r.broker_id)
    .maybeSingle();
  return {
    id: r.id as string,
    bookingDate: r.booking_date as string,
    status: r.status as string,
    priceEgp: Number(r.price_egp_snapshot),
    notes: (r.notes as string | null) ?? null,
    boat: r.boat as {
      name: string;
      skipper_name: string;
      skipper_whatsapp: string;
      capacity_guests: number;
      owner: { id: string; name: string; whatsapp: string; user_id: string | null };
    },
    broker: brokerRow as { id: string; username: string } | null,
  };
}

// Broker marks client payment received → reservation goes confirmed, WhatsApp fires.
export async function confirmPaymentAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('broker');
  const id = s(formData.get('id'));
  const notes = sOrNull(formData.get('notes'));
  if (!id) throw new Error('invalid_input');

  const sb = supabaseAdmin();
  // Must still be held (not expired/cancelled) and belong to the broker.
  const { data: row } = await sb
    .from('boat_rental_reservations')
    .select('id, status, broker_id, held_until')
    .eq('id', id)
    .maybeSingle();
  const r = row as { id: string; status: string; broker_id: string; held_until: string | null } | null;
  if (!r) throw new Error('not_found');
  if (r.broker_id !== me.id) throw new Error('forbidden');
  if (r.status !== 'held') throw new Error('bad_status');
  if (r.held_until && new Date(r.held_until).getTime() < Date.now()) throw new Error('hold_expired');

  await sb
    .from('boat_rental_reservations')
    .update({
      status: 'confirmed',
      held_until: null,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  await logAudit({
    reservationId: id,
    actorUserId: me.id,
    actorRole: 'broker',
    action: 'confirm_payment',
    fromStatus: 'held',
    toStatus: 'confirmed',
    payload: { notes_present: !!notes },
  });

  // Enqueue + fire WhatsApp (EN → broker + owner).
  const ctx = await getReservationContext(id);
  if (ctx) {
    const ctxBase = {
      boatName: ctx.boat.name,
      bookingDate: ctx.bookingDate,
      amountEgp: ctx.priceEgp,
      brokerName: ctx.broker?.username || 'Broker',
      shortRef: shortRef(id),
      notes: ctx.notes,
    };
    await enqueueNotification({
      reservationId: id,
      to: { userId: ctx.broker?.id, phone: '', role: 'broker' }, // broker phone omitted — brokers don't need their own msg
      templateKey: 'booking_confirmed',
      language: 'en',
      context: ctxBase,
    });
    // Overwrite broker recipient with owner (simpler: send only to owner for now).
    // Actually we want: broker + owner. Let's enqueue owner too.
    await enqueueNotification({
      reservationId: id,
      to: { userId: ctx.boat.owner.user_id, phone: ctx.boat.owner.whatsapp, role: 'owner' },
      templateKey: 'booking_confirmed',
      language: 'en',
      context: ctxBase,
    });
    await flushPendingForReservation(id);
  }

  revalidatePath('/emails/boat-rental/broker');
  revalidatePath('/emails/boat-rental/broker/holds');
  redirect('/emails/boat-rental/broker');
}

// Broker cancels own hold before confirmation (no 72h check — holds are always disposable).
export async function cancelHoldAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('broker');
  const id = s(formData.get('id'));
  if (!id) return;
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('boat_rental_reservations')
    .select('id, status, broker_id')
    .eq('id', id)
    .maybeSingle();
  const r = row as { id: string; status: string; broker_id: string } | null;
  if (!r || r.broker_id !== me.id || r.status !== 'held') return;
  await sb
    .from('boat_rental_reservations')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: me.id,
      cancelled_by_role: 'broker',
      cancel_reason: 'broker_released_hold',
      held_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  await logAudit({
    reservationId: id,
    actorUserId: me.id,
    actorRole: 'broker',
    action: 'cancel',
    fromStatus: 'held',
    toStatus: 'cancelled',
  });
  revalidatePath('/emails/boat-rental/broker/holds');
}

// Broker fills trip details (day-before). Capacity enforced, WhatsApp fires
// (EN → broker/owner, AR → skipper).
export async function fillTripDetailsAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('broker');
  const id = s(formData.get('id'));
  const clientName = s(formData.get('client_name'));
  const clientPhone = s(formData.get('client_phone'));
  const guestCount = nOrNull(formData.get('guest_count'));
  const tripReadyTime = s(formData.get('trip_ready_time'));
  const destinationId = s(formData.get('destination_id'));
  const extraNotes = sOrNull(formData.get('extra_notes'));
  if (!id || !clientName || !clientPhone || !guestCount || !tripReadyTime || !destinationId) {
    throw new Error('invalid_input');
  }

  const sb = supabaseAdmin();
  const { data: resRow } = await sb
    .from('boat_rental_reservations')
    .select('id, status, broker_id, boat_id')
    .eq('id', id)
    .maybeSingle();
  const r = resRow as { id: string; status: string; broker_id: string; boat_id: string } | null;
  if (!r) throw new Error('not_found');
  if (r.broker_id !== me.id) throw new Error('forbidden');
  if (!['confirmed', 'details_filled'].includes(r.status)) throw new Error('bad_status');

  // Capacity check.
  const { data: boat } = await sb
    .from('boat_rental_boats')
    .select('capacity_guests')
    .eq('id', r.boat_id)
    .maybeSingle();
  const cap = (boat as { capacity_guests: number } | null)?.capacity_guests || 0;
  if (guestCount > cap) throw new Error('over_capacity');

  const payload = {
    reservation_id: id,
    client_name: clientName,
    client_phone: clientPhone,
    guest_count: guestCount,
    trip_ready_time: tripReadyTime,
    destination_id: destinationId,
    extra_notes: extraNotes,
    submitted_at: new Date().toISOString(),
    submitted_by: me.id,
  };
  await sb
    .from('boat_rental_bookings')
    .upsert(payload, { onConflict: 'reservation_id' });

  if (r.status === 'confirmed') {
    await sb
      .from('boat_rental_reservations')
      .update({ status: 'details_filled', updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  await logAudit({
    reservationId: id,
    actorUserId: me.id,
    actorRole: 'broker',
    action: 'fill_details',
    fromStatus: r.status,
    toStatus: 'details_filled',
    payload: { guest_count: guestCount },
  });

  // Enqueue WhatsApp notifications.
  const ctx = await getReservationContext(id);
  const { data: destRow } = await sb
    .from('boat_rental_destinations')
    .select('name')
    .eq('id', destinationId)
    .maybeSingle();
  const destinationName = (destRow as { name: string } | null)?.name || '';

  if (ctx) {
    const enCtx = {
      boatName: ctx.boat.name,
      bookingDate: ctx.bookingDate,
      amountEgp: ctx.priceEgp,
      clientName,
      guestCount,
      tripReadyTime,
      destination: destinationName,
      skipperName: ctx.boat.skipper_name,
      shortRef: shortRef(id),
      notes: ctx.notes, // reservation-level notes from confirm-payment step
    };
    // Owner in EN (broker + owner both need it; broker already sees it in UI).
    await enqueueNotification({
      reservationId: id,
      to: { userId: ctx.boat.owner.user_id, phone: ctx.boat.owner.whatsapp, role: 'owner' },
      templateKey: 'trip_details',
      language: 'en',
      context: enCtx,
    });
    // Skipper in Arabic — notify-only, no login.
    await enqueueNotification({
      reservationId: id,
      to: { phone: ctx.boat.skipper_whatsapp, role: 'skipper' },
      templateKey: 'trip_details',
      language: 'ar',
      context: enCtx,
    });
    await flushPendingForReservation(id);
  }

  revalidatePath('/emails/boat-rental/broker');
}

// Broker uploads transfer receipt → paid_to_owner.
export async function uploadReceiptAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('broker');
  const id = s(formData.get('id'));
  const amount = nOrNull(formData.get('amount_egp'));
  const method = s(formData.get('method'));
  const note = sOrNull(formData.get('note'));
  if (!id || !amount || amount <= 0) throw new Error('invalid_input');

  const file = formData.get('receipt');
  const receiptFile = file instanceof File && file.size > 0 ? file : null;
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  if (!receiptFile || !allowedTypes.has(receiptFile.type) || receiptFile.size > 10 * 1024 * 1024) {
    throw new Error('invalid_receipt');
  }

  const sb = supabaseAdmin();
  const { data: resRow } = await sb
    .from('boat_rental_reservations')
    .select('id, status, broker_id')
    .eq('id', id)
    .maybeSingle();
  const r = resRow as { id: string; status: string; broker_id: string } | null;
  if (!r) throw new Error('not_found');
  if (r.broker_id !== me.id) throw new Error('forbidden');
  if (!['details_filled', 'confirmed'].includes(r.status)) throw new Error('bad_status');

  const ext =
    receiptFile.type === 'application/pdf' ? 'pdf' :
    receiptFile.type === 'image/png' ? 'png' :
    receiptFile.type === 'image/webp' ? 'webp' : 'jpg';
  const key = `receipts/${id}/${crypto.randomUUID()}.${ext}`;
  const buf = Buffer.from(await receiptFile.arrayBuffer());
  const up = await sb.storage.from('boat-rental').upload(key, buf, {
    contentType: receiptFile.type,
    upsert: false,
  });
  if (up.error) throw new Error(up.error.message);

  await sb.from('boat_rental_payments').upsert(
    {
      reservation_id: id,
      amount_egp: amount,
      receipt_path: key,
      paid_at: new Date().toISOString(),
      recorded_by: me.id,
      recorded_by_role: 'broker',
      method: method || null,
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
    actorRole: 'broker',
    action: 'receipt_uploaded',
    fromStatus: r.status,
    toStatus: 'paid_to_owner',
    payload: { amount_egp: amount, method, receipt_path: key },
  });

  // Notify owner.
  const ctx = await getReservationContext(id);
  if (ctx) {
    await enqueueNotification({
      reservationId: id,
      to: { userId: ctx.boat.owner.user_id, phone: ctx.boat.owner.whatsapp, role: 'owner' },
      templateKey: 'payment_received',
      language: 'en',
      context: {
        boatName: ctx.boat.name,
        bookingDate: ctx.bookingDate,
        amountEgp: amount,
        shortRef: shortRef(id),
      },
    });
    await flushPendingForReservation(id);
  }

  revalidatePath('/emails/boat-rental/broker/payments');
  revalidatePath('/emails/boat-rental/broker');
}

// Broker cancels a confirmed (not yet details_filled) reservation — 72h rule applies.
export async function cancelReservationBrokerAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('broker');
  const id = s(formData.get('id'));
  if (!id) return;
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('boat_rental_reservations')
    .select('id, status, broker_id, booking_date')
    .eq('id', id)
    .maybeSingle();
  const r = row as { id: string; status: string; broker_id: string; booking_date: string } | null;
  if (!r || r.broker_id !== me.id) throw new Error('forbidden');
  if (!['held', 'confirmed'].includes(r.status)) throw new Error('bad_status');
  if (r.status === 'confirmed' && !isWithinCancellationWindow(r.booking_date)) {
    throw new Error('cancellation_window_closed');
  }

  const refundPending = r.status === 'confirmed';
  await sb
    .from('boat_rental_reservations')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: me.id,
      cancelled_by_role: 'broker',
      cancel_reason: 'broker_cancelled',
      refund_pending: refundPending,
      held_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  await logAudit({
    reservationId: id,
    actorUserId: me.id,
    actorRole: 'broker',
    action: 'cancel',
    fromStatus: r.status,
    toStatus: 'cancelled',
    payload: { refund_pending: refundPending },
  });

  // Notify owner.
  const ctx = await getReservationContext(id);
  if (ctx) {
    await enqueueNotification({
      reservationId: id,
      to: { userId: ctx.boat.owner.user_id, phone: ctx.boat.owner.whatsapp, role: 'owner' },
      templateKey: 'cancelled',
      language: 'en',
      context: {
        boatName: ctx.boat.name,
        bookingDate: ctx.bookingDate,
        shortRef: shortRef(id),
        cancelledByRole: 'broker',
        cancelledByName: me.username,
      },
    });
    await flushPendingForReservation(id);
  }

  revalidatePath('/emails/boat-rental/broker');
}
