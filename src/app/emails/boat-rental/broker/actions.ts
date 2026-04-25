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
import { checkAvailability } from '@/lib/boat-rental/availability';
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
// (EN → broker/owner, AR → skipper). Broker can also flag
// "skipper collects cash on boarding" — when set, no broker transfer is
// expected; the auto-close-skipper-cash cron flips the reservation to
// paid_to_owner the day after the trip.
export async function fillTripDetailsAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('broker');
  const id = s(formData.get('id'));
  const clientName = s(formData.get('client_name'));
  const clientPhone = s(formData.get('client_phone'));
  const guestCount = nOrNull(formData.get('guest_count'));
  const tripReadyTime = s(formData.get('trip_ready_time'));
  const destinationId = s(formData.get('destination_id'));
  const extraNotes = sOrNull(formData.get('extra_notes'));
  const skipperCollectsCash = !!formData.get('skipper_collects_cash');
  const skipperInstructions = sOrNull(formData.get('skipper_instructions'));
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
    skipper_collects_cash: skipperCollectsCash,
    skipper_instructions: skipperInstructions,
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
    payload: { guest_count: guestCount, skipper_collects_cash: skipperCollectsCash },
  });

  // Enqueue WhatsApp notifications.
  const ctx = await getReservationContext(id);
  const { data: destRow } = await sb
    .from('boat_rental_destinations')
    .select('name')
    .eq('id', destinationId)
    .maybeSingle();
  const destinationName = (destRow as { name: string } | null)?.name || '';

  // Look up broker's whatsapp for the broker copy of trip_details.
  const { data: brokerWa } = await sb
    .from('app_users')
    .select('whatsapp')
    .eq('id', me.id)
    .maybeSingle();
  const brokerWhatsapp = (brokerWa as { whatsapp: string | null } | null)?.whatsapp || '';

  if (ctx) {
    const enCtx = {
      boatName: ctx.boat.name,
      bookingDate: ctx.bookingDate,
      amountEgp: ctx.priceEgp,
      clientName,
      clientPhone,
      guestCount,
      tripReadyTime,
      destination: destinationName,
      skipperName: ctx.boat.skipper_name,
      shortRef: shortRef(id),
      notes: ctx.notes, // reservation-level notes from confirm-payment step
      skipperCollectsCash,
      skipperInstructions,
      brokerName: ctx.broker?.username || 'Broker',
    };
    // Owner in EN.
    await enqueueNotification({
      reservationId: id,
      to: { userId: ctx.boat.owner.user_id, phone: ctx.boat.owner.whatsapp, role: 'owner' },
      templateKey: 'trip_details',
      language: 'en',
      context: enCtx,
    });
    // Broker in EN — only if their whatsapp is populated on app_users.
    if (brokerWhatsapp) {
      await enqueueNotification({
        reservationId: id,
        to: { userId: me.id, phone: brokerWhatsapp, role: 'broker' },
        templateKey: 'trip_details',
        language: 'en',
        context: enCtx,
      });
    }
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
  revalidatePath('/emails/boat-rental/broker/payments');
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

// Broker cancels a held reservation OR a >=72h-out confirmed reservation
// outright. Within-72h confirmed cancellations are routed to
// requestCancellationAction so the owner has to approve.
export async function cancelReservationBrokerAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('broker');
  const id = s(formData.get('id'));
  const reason = sOrNull(formData.get('reason'));
  if (!id) return;
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('boat_rental_reservations')
    .select('id, status, broker_id, booking_date')
    .eq('id', id)
    .maybeSingle();
  const r = row as { id: string; status: string; broker_id: string; booking_date: string } | null;
  if (!r || r.broker_id !== me.id) throw new Error('forbidden');
  if (!['held', 'confirmed', 'details_filled'].includes(r.status)) throw new Error('bad_status');

  // Held = always disposable by broker. Confirmed/details_filled outside
  // 72h cancels outright; within 72h goes through the approval workflow.
  const within72 = !isWithinCancellationWindow(r.booking_date);
  if (r.status !== 'held' && within72) {
    throw new Error('within_72h_use_request_endpoint');
  }

  const refundPending = ['confirmed', 'details_filled'].includes(r.status);
  await sb
    .from('boat_rental_reservations')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: me.id,
      cancelled_by_role: 'broker',
      cancel_reason: reason || 'broker_cancelled',
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
    payload: { refund_pending: refundPending, reason },
  });

  // Notify owner (skip for plain held releases — they had no commitment).
  if (r.status !== 'held') {
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
  }

  revalidatePath('/emails/boat-rental/broker');
}

// Broker requests a within-72h cancellation. Reservation stays as-is;
// owner must approve before status flips to 'cancelled'. Notifies owner.
export async function requestCancellationAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('broker');
  const id = s(formData.get('id'));
  const reason = s(formData.get('reason'));
  if (!id || !reason) throw new Error('invalid_input');

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('boat_rental_reservations')
    .select('id, status, broker_id, booking_date, cancellation_requested_at')
    .eq('id', id)
    .maybeSingle();
  const r = row as {
    id: string;
    status: string;
    broker_id: string;
    booking_date: string;
    cancellation_requested_at: string | null;
  } | null;
  if (!r || r.broker_id !== me.id) throw new Error('forbidden');
  if (!['confirmed', 'details_filled'].includes(r.status)) throw new Error('bad_status');
  if (r.cancellation_requested_at) throw new Error('already_requested');

  await sb
    .from('boat_rental_reservations')
    .update({
      cancellation_requested_at: new Date().toISOString(),
      cancellation_requested_by: me.id,
      cancellation_request_reason: reason,
      cancellation_request_role: 'broker',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  await logAudit({
    reservationId: id,
    actorUserId: me.id,
    actorRole: 'broker',
    action: 'request_cancellation',
    payload: { reason, within_72h: true },
  });

  const ctx = await getReservationContext(id);
  if (ctx) {
    await enqueueNotification({
      reservationId: id,
      to: { userId: ctx.boat.owner.user_id, phone: ctx.boat.owner.whatsapp, role: 'owner' },
      templateKey: 'cancellation_requested',
      language: 'en',
      context: {
        boatName: ctx.boat.name,
        bookingDate: ctx.bookingDate,
        shortRef: shortRef(id),
        brokerName: me.username,
        cancelReason: reason,
      },
    });
    await flushPendingForReservation(id);
  }

  revalidatePath('/emails/boat-rental/broker');
}

// Inquiry → direct Reserve. Skips 'held'; creates 'confirmed' immediately
// + fires WhatsApp. Optional notes captured here (also editable later on
// trip-details form).
export async function reserveDirectAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('broker');
  const boatId = s(formData.get('boat_id'));
  const bookingDate = s(formData.get('booking_date'));
  const notes = sOrNull(formData.get('notes'));
  if (!boatId || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) throw new Error('invalid_input');

  const sb = supabaseAdmin();
  const av = await checkAvailability(boatId, bookingDate);
  if (av.kind !== 'available') {
    if (av.kind === 'blocked') throw new Error('date_blocked_by_owner');
    if (av.kind === 'booked') throw new Error('slot_taken');
    if (av.kind === 'no_price') throw new Error('no_price_for_date');
    throw new Error('unavailable');
  }

  const { data: created, error } = await sb
    .from('boat_rental_reservations')
    .insert({
      boat_id: boatId,
      booking_date: bookingDate,
      broker_id: me.id,
      status: 'confirmed',
      held_until: null,
      price_egp_snapshot: av.amountEgp,
      pricing_tier_snapshot: av.tier,
      notes,
    })
    .select('id')
    .single();
  if (error || !created) throw new Error(error?.message || 'reserve_failed');
  const resId = (created as { id: string }).id;

  await logAudit({
    reservationId: resId,
    actorUserId: me.id,
    actorRole: 'broker',
    action: 'reserve_direct',
    toStatus: 'confirmed',
    payload: { boat_id: boatId, booking_date: bookingDate, price_egp: av.amountEgp, tier: av.tier },
  });

  await sb.from('boat_rental_inquiries').insert({
    boat_id: boatId,
    booking_date: bookingDate,
    broker_id: me.id,
    outcome: 'reserved',
    price_egp: av.amountEgp,
    tier: av.tier,
  });

  // Notifications (same template as the Mark-Client-Paid path).
  const ctx = await getReservationContext(resId);
  if (ctx) {
    const ctxBase = {
      boatName: ctx.boat.name,
      bookingDate: ctx.bookingDate,
      amountEgp: ctx.priceEgp,
      brokerName: ctx.broker?.username || 'Broker',
      shortRef: shortRef(resId),
      notes: ctx.notes,
    };
    await enqueueNotification({
      reservationId: resId,
      to: { userId: ctx.boat.owner.user_id, phone: ctx.boat.owner.whatsapp, role: 'owner' },
      templateKey: 'booking_confirmed',
      language: 'en',
      context: ctxBase,
    });
    await flushPendingForReservation(resId);
  }

  revalidatePath('/emails/boat-rental/broker');
  redirect('/emails/boat-rental/broker');
}

// Hold → Reserve direct conversion. Same end state as Mark Client Paid
// but exposed on the Holds list as a one-click shortcut for repeat
// clients where the broker has already taken payment.
export async function convertHoldToReserveAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('broker');
  const id = s(formData.get('id'));
  const notes = sOrNull(formData.get('notes'));
  if (!id) throw new Error('invalid_input');

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('boat_rental_reservations')
    .select('id, status, broker_id, held_until, boat_id, booking_date')
    .eq('id', id)
    .maybeSingle();
  const r = row as {
    id: string; status: string; broker_id: string; held_until: string | null;
    boat_id: string; booking_date: string;
  } | null;
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
    action: 'hold_to_reserve',
    fromStatus: 'held',
    toStatus: 'confirmed',
    payload: { notes_present: !!notes },
  });

  // Update inquiry log: the original hold inquiry is now reserved.
  await sb
    .from('boat_rental_inquiries')
    .update({ outcome: 'reserved' })
    .eq('boat_id', r.boat_id)
    .eq('booking_date', r.booking_date)
    .eq('broker_id', me.id)
    .eq('outcome', 'held');

  const ctx = await getReservationContext(id);
  if (ctx) {
    await enqueueNotification({
      reservationId: id,
      to: { userId: ctx.boat.owner.user_id, phone: ctx.boat.owner.whatsapp, role: 'owner' },
      templateKey: 'booking_confirmed',
      language: 'en',
      context: {
        boatName: ctx.boat.name,
        bookingDate: ctx.bookingDate,
        amountEgp: ctx.priceEgp,
        brokerName: ctx.broker?.username || 'Broker',
        shortRef: shortRef(id),
        notes: ctx.notes,
      },
    });
    await flushPendingForReservation(id);
  }

  revalidatePath('/emails/boat-rental/broker');
  redirect('/emails/boat-rental/broker');
}
