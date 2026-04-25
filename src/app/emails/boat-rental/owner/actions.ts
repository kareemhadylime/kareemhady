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
