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
import { recordPaymentCore } from '@/lib/boat-rental/record-payment';

const VALID_BLOCK_REASONS = ['personal_use', 'maintenance', 'owner_trip', 'repair', 'other'] as const;

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
  await sb.from('boat_rental_payments').insert({
    reservation_id: id,
    amount_egp: amount,
    receipt_path: null,
    paid_at: new Date().toISOString(),
    recorded_by: me.id,
    recorded_by_role: 'owner',
    method: method || 'manual_override',
    note,
  });
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

// Owner-side force cancel — works inside the 72h window AND on manual reservations
// that have already flipped to `paid_to_owner`. Unlike the regular cancel, this is
// a fait accompli — broker is notified but cannot veto. Used for emergencies (boat
// damage, weather, owner conflict, client no-show) that the regular flow can't handle.
//
// Refund handling: any status that has confirmed payment exposure
// (confirmed/details_filled/paid_to_owner) sets refund_pending=true so admin can
// settle with the broker manually.
//
// Returns a result object so the calling client form can show a toast and refresh
// the page on success. Use {ok: false, error} instead of throwing for known cases —
// throws only on programmer errors (auth missing, unexpected DB shape).
export async function forceCancelReservationOwnerAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireBoatRoleOrThrow('owner');
  const id = s(formData.get('id'));
  const reason = sOrNull(formData.get('reason'));
  if (!id) return { ok: false, error: 'Missing reservation id' };
  if (!reason || reason.length < 5) {
    return { ok: false, error: 'Reason is required (at least 5 characters)' };
  }

  const r = await assertOwnerCanAct(id, me.id);
  if (!r) return { ok: false, error: 'You don’t own this reservation' };
  if (!['held', 'confirmed', 'details_filled', 'paid_to_owner'].includes(r.status)) {
    return {
      ok: false,
      error: `Reservation is in ${r.status} status — nothing to cancel`,
    };
  }

  const sb = supabaseAdmin();
  const hasPaymentExposure = ['confirmed', 'details_filled', 'paid_to_owner'].includes(r.status);

  await sb
    .from('boat_rental_reservations')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: me.id,
      cancelled_by_role: 'owner',
      cancel_reason: reason,
      refund_pending: hasPaymentExposure,
      held_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  await logAudit({
    reservationId: id,
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'owner_force_cancel',
    fromStatus: r.status,
    toStatus: 'cancelled',
    payload: { reason, refund_pending: hasPaymentExposure },
  });

  // Notify the registered broker (if any). External brokers don't have app
  // accounts so the owner is expected to phone them directly.
  if (r.broker?.id) {
    await enqueueNotification({
      reservationId: id,
      to: { userId: r.broker.id, phone: '', role: 'broker' },
      templateKey: 'cancelled',
      language: 'en',
      context: {
        boatName: r.boat.name,
        bookingDate: r.booking_date,
        shortRef: shortRef(id),
        cancelledByRole: 'owner',
        cancelledByName: me.username,
        cancelReason: reason,
      },
    });
    await flushPendingForReservation(id);
  }

  revalidatePath(`/emails/boat-rental/owner/booking/${id}`);
  revalidatePath('/emails/boat-rental/owner');
  revalidatePath('/emails/boat-rental/owner/calendar');
  revalidatePath('/emails/boat-rental/owner/reservations');
  return { ok: true };
}

// ----- Owner blocks -----
//
// Owner reserves dates on a boat for personal use (or admin reserves for
// emergency maintenance). Reservation conflicts are rejected here — the
// admin emergency override path is the only way to take a date that's
// already confirmed.

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function expandRange(fromStr: string, toStr: string): string[] {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  if (end < start) return [];
  const out: string[] = [];
  for (let t = start; t <= end; t += 86400000) {
    out.push(isoDate(new Date(t)));
  }
  return out;
}

export async function addOwnerBlocksAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('owner');
  const boatId = s(formData.get('boat_id'));
  const fromDate = s(formData.get('from_date'));
  const toDate = s(formData.get('to_date')) || fromDate;
  const reason = s(formData.get('reason'));
  const reasonNote = sOrNull(formData.get('reason_note'));
  if (!boatId || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    throw new Error('invalid_input');
  }
  if (!VALID_BLOCK_REASONS.includes(reason as typeof VALID_BLOCK_REASONS[number])) {
    throw new Error('invalid_reason');
  }

  // Ownership guard.
  const ownedOwnerIds = await getOwnedOwnerIds(me);
  const sb = supabaseAdmin();
  const { data: boatRow } = await sb
    .from('boat_rental_boats')
    .select('owner_id, name')
    .eq('id', boatId)
    .maybeSingle();
  const boat = boatRow as { owner_id: string; name: string } | null;
  if (!boat || !ownedOwnerIds.includes(boat.owner_id)) throw new Error('forbidden');

  const dates = expandRange(fromDate, toDate);
  if (!dates.length || dates.length > 366) throw new Error('invalid_range');

  // Reject if ANY date in range collides with a live reservation.
  const { data: conflicts } = await sb
    .from('boat_rental_reservations')
    .select('booking_date, status')
    .eq('boat_id', boatId)
    .in('booking_date', dates)
    .in('status', ['held', 'confirmed', 'details_filled', 'paid_to_owner']);
  const conflictRows = (conflicts as Array<{ booking_date: string; status: string }> | null) || [];
  if (conflictRows.length > 0) {
    const dateList = conflictRows.map(c => c.booking_date).join(', ');
    throw new Error(`reservation_conflict:${dateList}`);
  }

  // Insert all rows; ON CONFLICT do nothing in case of pre-existing block.
  const rows = dates.map(d => ({
    boat_id: boatId,
    blocked_date: d,
    reason,
    reason_note: reasonNote,
    blocked_by: me.id,
    blocked_by_role: 'owner' as const,
  }));
  const { error: insertErr } = await sb
    .from('boat_rental_owner_blocks')
    .upsert(rows, { onConflict: 'boat_id,blocked_date', ignoreDuplicates: true });
  if (insertErr) throw new Error(insertErr.message);

  // Confirmation WhatsApp to the owner (only one notification per block batch).
  const { data: ownerRow } = await sb
    .from('boat_rental_owners')
    .select('id, name, whatsapp, user_id')
    .eq('id', boat.owner_id)
    .maybeSingle();
  const owner = ownerRow as { id: string; name: string; whatsapp: string; user_id: string | null } | null;
  if (owner) {
    await enqueueNotification({
      reservationId: null,
      to: { userId: owner.user_id, phone: owner.whatsapp, role: 'owner' },
      templateKey: 'owner_block_confirmed',
      language: 'en',
      context: {
        boatName: boat.name,
        bookingDate: dates.length === 1 ? dates[0] : `${dates[0]} → ${dates[dates.length - 1]}`,
        shortRef: '',
        cancelReason: reason,
      },
    });
    // Best-effort flush of the just-enqueued owner_block_confirmed row.
    const { data: pendingRow } = await sb
      .from('boat_rental_notifications')
      .select('id, to_phone, rendered_body')
      .eq('to_user_id', owner.user_id)
      .eq('template_key', 'owner_block_confirmed')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pendingRow) {
      const { sendWhatsApp } = await import('@/lib/whatsapp/green-api');
      const r = pendingRow as { id: number; to_phone: string; rendered_body: string };
      const result = await sendWhatsApp({ to: r.to_phone, message: r.rendered_body });
      if (result.ok) {
        await sb
          .from('boat_rental_notifications')
          .update({ status: 'sent', provider_msg_id: result.providerMessageId, sent_at: new Date().toISOString() })
          .eq('id', r.id);
      } else {
        await sb.from('boat_rental_notifications').update({ status: 'failed', error: result.error }).eq('id', r.id);
      }
    }
  }

  await logAudit({
    reservationId: null,
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'add_owner_blocks',
    payload: { boat_id: boatId, dates, reason, reason_note: reasonNote },
  });

  revalidatePath('/emails/boat-rental/owner/calendar');
  revalidatePath('/emails/boat-rental/owner');
}

export async function removeOwnerBlockAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('owner');
  const id = s(formData.get('id'));
  if (!id) return;

  const sb = supabaseAdmin();
  const { data: blockRow } = await sb
    .from('boat_rental_owner_blocks')
    .select('id, boat_id, blocked_date')
    .eq('id', id)
    .maybeSingle();
  const block = blockRow as { id: string; boat_id: string; blocked_date: string } | null;
  if (!block) return;

  // Ownership guard.
  const ownedOwnerIds = await getOwnedOwnerIds(me);
  const { data: boat } = await sb
    .from('boat_rental_boats')
    .select('owner_id')
    .eq('id', block.boat_id)
    .maybeSingle();
  if (!boat || !ownedOwnerIds.includes((boat as { owner_id: string }).owner_id)) {
    throw new Error('forbidden');
  }

  await sb.from('boat_rental_owner_blocks').delete().eq('id', id);

  await logAudit({
    reservationId: null,
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'remove_owner_block',
    payload: { boat_id: block.boat_id, blocked_date: block.blocked_date },
  });

  revalidatePath('/emails/boat-rental/owner/calendar');
  revalidatePath('/emails/boat-rental/owner');
}

// ----- Cancellation approval (within-72h flow) -----

export async function approveCancellationAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('owner');
  const id = s(formData.get('id'));
  if (!id) return;

  const ownedOwnerIds = await getOwnedOwnerIds(me);
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, status, booking_date, broker_id, cancellation_requested_at, cancellation_request_reason,
      boat:boat_rental_boats ( name, owner_id, owner:boat_rental_owners ( id, name, whatsapp, user_id ) )
    `
    )
    .eq('id', id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any;
  if (!r) throw new Error('not_found');
  if (!ownedOwnerIds.includes(r.boat.owner_id)) throw new Error('forbidden');
  if (!r.cancellation_requested_at) throw new Error('no_pending_request');

  const refundPending = ['confirmed', 'details_filled'].includes(r.status);
  await sb
    .from('boat_rental_reservations')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: me.id,
      cancelled_by_role: 'owner',
      cancel_reason: r.cancellation_request_reason || 'within_72h_owner_approved',
      refund_pending: refundPending,
      held_until: null,
      cancellation_request_resolved_at: new Date().toISOString(),
      cancellation_request_resolved_by: me.id,
      cancellation_request_resolution: 'approved',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  await logAudit({
    reservationId: id,
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'approve_cancellation',
    fromStatus: r.status,
    toStatus: 'cancelled',
    payload: { refund_pending: refundPending },
  });

  // Notify broker (cancellation finalized).
  await enqueueNotification({
    reservationId: id,
    to: { userId: r.broker_id, phone: '', role: 'broker' },
    templateKey: 'cancellation_resolved',
    language: 'en',
    context: {
      boatName: r.boat.name,
      bookingDate: r.booking_date,
      shortRef: shortRef(id),
      cancelReason: 'approved',
    },
  });
  await flushPendingForReservation(id);

  revalidatePath('/emails/boat-rental/owner');
}

export async function rejectCancellationAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('owner');
  const id = s(formData.get('id'));
  const note = sOrNull(formData.get('note'));
  if (!id) return;

  const ownedOwnerIds = await getOwnedOwnerIds(me);
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, status, booking_date, broker_id, cancellation_requested_at,
      boat:boat_rental_boats ( name, owner_id )
    `
    )
    .eq('id', id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any;
  if (!r) throw new Error('not_found');
  if (!ownedOwnerIds.includes(r.boat.owner_id)) throw new Error('forbidden');
  if (!r.cancellation_requested_at) throw new Error('no_pending_request');

  await sb
    .from('boat_rental_reservations')
    .update({
      cancellation_request_resolved_at: new Date().toISOString(),
      cancellation_request_resolved_by: me.id,
      cancellation_request_resolution: note ? `rejected: ${note}` : 'rejected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  await logAudit({
    reservationId: id,
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'reject_cancellation',
    payload: { note },
  });

  await enqueueNotification({
    reservationId: id,
    to: { userId: r.broker_id, phone: '', role: 'broker' },
    templateKey: 'cancellation_resolved',
    language: 'en',
    context: {
      boatName: r.boat.name,
      bookingDate: r.booking_date,
      shortRef: shortRef(id),
      cancelReason: 'rejected',
    },
  });
  await flushPendingForReservation(id);

  revalidatePath('/emails/boat-rental/owner');
}

export async function addExternalBrokerAction(formData: FormData): Promise<{ id: string; name: string }> {
  const me = await requireBoatRoleOrThrow('owner');
  const name = s(formData.get('name')).trim();
  const phone = sOrNull(formData.get('phone'));
  if (!name) throw new Error('invalid_input');

  const ownerIds = await getOwnedOwnerIds(me);
  if (ownerIds.length === 0) throw new Error('no_owner');
  // Use the first owner — the picker is per-boat, and a user typically owns one owner record.
  const ownerId = ownerIds[0];

  const sb = supabaseAdmin();
  // Upsert by name (case-insensitive) within owner.
  const { data: existing } = await sb
    .from('boat_rental_external_brokers')
    .select('id, name')
    .eq('owner_id', ownerId)
    .ilike('name', name)
    .maybeSingle();
  if (existing) return existing as { id: string; name: string };

  const { data, error } = await sb
    .from('boat_rental_external_brokers')
    .insert({ owner_id: ownerId, name, phone })
    .select('id, name')
    .single();
  if (error) throw error;
  return data as { id: string; name: string };
}

export async function recordTripPaymentAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireBoatRoleOrThrow('owner');
  const reservationId = s(formData.get('reservation_id'));
  const amount = Number(s(formData.get('amount_egp')));
  const method = s(formData.get('method'));
  const paidDate = s(formData.get('paid_date'));
  const note = sOrNull(formData.get('note'));

  if (!reservationId || !method || !paidDate) throw new Error('invalid_input');

  // Owner-owns-boat check (the core helper trusts the caller for auth).
  const ownerIds = await getOwnedOwnerIds(me);
  const sb = supabaseAdmin();
  const { data: boatRow } = await sb
    .from('boat_rental_reservations')
    .select('boat:boat_rental_boats ( owner_id )')
    .eq('id', reservationId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boat = (boatRow as any)?.boat as { owner_id: string } | null;
  if (!boat || !ownerIds.includes(boat.owner_id)) throw new Error('forbidden');

  const result = await recordPaymentCore({
    reservationId,
    amountEgp: amount,
    method,
    paidDate,
    note,
    recordedBy: me.id,
    recordedByRole: 'owner',
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/emails/boat-rental/owner/booking/${reservationId}`);
  revalidatePath('/emails/boat-rental/owner');
  return { ok: true };
}

import { getCurrentUser } from '@/lib/auth';

export async function overrideTripPriceAction(
  formData: FormData
): Promise<
  | { ok: true; effective_price: number; was_clamped: boolean; auto_closed: boolean }
  | { ok: false; error: 'reservation_not_found' | 'forbidden' | 'invalid_status' | 'invalid_amount' }
> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: 'forbidden' };

  const reservationId = s(formData.get('reservation_id'));
  const newPriceRaw = nOrNull(formData.get('new_price'));
  const reason = sOrNull(formData.get('reason'));

  if (!reservationId) return { ok: false, error: 'reservation_not_found' };
  if (newPriceRaw === null || !Number.isFinite(newPriceRaw) || newPriceRaw <= 0) {
    return { ok: false, error: 'invalid_amount' };
  }
  const newPrice = Number(newPriceRaw);

  const sb = supabaseAdmin();

  // Fetch reservation + total paid
  const { data: r } = await sb
    .from('boat_rental_reservations')
    .select(`
      id, boat_id, status, price_egp_snapshot, original_price_snapshot,
      boat:boat_rental_boats ( owner_id ),
      payments:boat_rental_payments ( amount_egp )
    `)
    .eq('id', reservationId)
    .maybeSingle();
  if (!r) return { ok: false, error: 'reservation_not_found' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reservation = r as unknown as {
    id: string;
    boat_id: string;
    status: string;
    price_egp_snapshot: string | number;
    original_price_snapshot: string | number | null;
    boat: { owner_id: string };
    payments: Array<{ amount_egp: string | number }>;
  };

  // Authorization: admin OR owner of the boat
  const isAdmin = me.is_admin === true;
  let isOwner = false;
  if (!isAdmin) {
    const ownerIds = await getOwnedOwnerIds(me);
    isOwner = ownerIds.includes(reservation.boat.owner_id);
  }
  if (!isAdmin && !isOwner) return { ok: false, error: 'forbidden' };

  // Status gate
  if (!['confirmed', 'details_filled'].includes(reservation.status)) {
    return { ok: false, error: 'invalid_status' };
  }

  // Compute total paid
  const totalPaid = (reservation.payments ?? []).reduce(
    (sum, p) => sum + Number(p.amount_egp),
    0
  );

  // Clamp logic: never below total_paid
  const wasClamped = newPrice < totalPaid;
  const effectivePrice = wasClamped ? totalPaid : newPrice;

  const oldPrice = Number(reservation.price_egp_snapshot);
  const originalSnapshot =
    reservation.original_price_snapshot !== null
      ? Number(reservation.original_price_snapshot)
      : oldPrice;

  // Build update payload
  const update: Record<string, unknown> = {
    price_egp_snapshot: effectivePrice,
    price_overridden_at: new Date().toISOString(),
    price_overridden_by: me.id,
    updated_at: new Date().toISOString(),
  };
  // Set original_price_snapshot ONLY on first override
  if (reservation.original_price_snapshot === null) {
    update.original_price_snapshot = oldPrice;
  }

  // Auto-close if effective price equals total_paid AND status not already paid_to_owner
  let autoClosed = false;
  if (totalPaid >= effectivePrice && reservation.status !== 'paid_to_owner') {
    update.status = 'paid_to_owner';
    autoClosed = true;
  }

  await sb
    .from('boat_rental_reservations')
    .update(update)
    .eq('id', reservationId);

  await logAudit({
    reservationId,
    actorUserId: me.id,
    actorRole: isAdmin ? 'admin' : 'owner',
    action: 'trip_price_overridden',
    fromStatus: reservation.status,
    toStatus: autoClosed ? 'paid_to_owner' : reservation.status,
    payload: {
      old_price: oldPrice,
      new_price_requested: newPrice,
      effective_price: effectivePrice,
      clamped: wasClamped,
      total_paid: totalPaid,
      reason,
      original_price_snapshot: originalSnapshot,
    },
  });

  revalidatePath(`/emails/boat-rental/owner/booking/${reservationId}`);
  revalidatePath('/emails/boat-rental/owner/calendar');
  revalidatePath('/emails/boat-rental/owner/reservations');
  revalidatePath('/emails/boat-rental/admin/bookings');

  return { ok: true, effective_price: effectivePrice, was_clamped: wasClamped, auto_closed: autoClosed };
}
