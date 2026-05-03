import 'server-only';
import { supabaseAdmin } from '../supabase';
import { computeBalance, validatePaymentAmount } from './payment-balance';
import { logAudit, shortRef } from './server-helpers';
import { enqueueNotification, flushPendingForReservation } from './notifications';

// Shared core for recording a payment against a reservation. Used by:
// - recordTripPaymentAction (synchronous owner action via the booking-detail UI)
// - /api/boat-rental/owner/mark-paid-replay (background-sync replay from offline queue)
//
// Caller is responsible for ownership/auth — this helper trusts the caller. It
// handles validation (overpayment guard), insert (per-payment idempotency_key
// optional), auto-flip to paid_to_owner when the price is fully covered, audit
// logging, and the trip_payment_complete notification.

export type RecordPaymentArgs = {
  reservationId: string;
  amountEgp: number;
  method: string;
  paidDate: string; // YYYY-MM-DD
  note: string | null;
  receiptPath?: string | null;
  recordedBy: string;
  recordedByRole: 'owner' | 'broker' | 'admin';
  // Optional client-supplied UUID for offline-replay dedupe. NULL = best-effort.
  idempotencyKey?: string | null;
};

export type RecordPaymentResult =
  | { ok: true; auto_flipped: boolean; deduped?: boolean }
  | { ok: false; error: string; reason?: 'bad_status' | 'overpayment' | 'not_found' };

type LoadedReservation = {
  id: string;
  status: string;
  price_egp_snapshot: string | number;
  booking_date: string;
  broker_id: string | null;
  boat: { name: string; owner_id: string };
  payments: Array<{ amount_egp: string | number }>;
};

export async function recordPaymentCore(args: RecordPaymentArgs): Promise<RecordPaymentResult> {
  if (!Number.isFinite(args.amountEgp) || args.amountEgp <= 0) {
    return { ok: false, error: 'Amount must be greater than zero' };
  }

  const sb = supabaseAdmin();

  // Idempotency short-circuit: if a payment with this key already exists, treat
  // as deduped — the original call already advanced state.
  if (args.idempotencyKey) {
    const { data: dup } = await sb
      .from('boat_rental_payments')
      .select('id')
      .eq('idempotency_key', args.idempotencyKey)
      .maybeSingle();
    if (dup) return { ok: true, auto_flipped: false, deduped: true };
  }

  const { data: rRow } = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, status, price_egp_snapshot, booking_date, broker_id,
      boat:boat_rental_boats ( name, owner_id ),
      payments:boat_rental_payments ( amount_egp )
    `
    )
    .eq('id', args.reservationId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reservation = rRow as any as LoadedReservation | null;
  if (!reservation) return { ok: false, error: 'Reservation not found', reason: 'not_found' };
  if (!['confirmed', 'details_filled'].includes(reservation.status)) {
    return {
      ok: false,
      error: `Reservation not in payable status (currently ${reservation.status})`,
      reason: 'bad_status',
    };
  }

  const existingAmounts = (reservation.payments ?? []).map((p) => p.amount_egp);
  const validation = validatePaymentAmount(reservation.price_egp_snapshot, existingAmounts, args.amountEgp);
  if (!validation.ok) return { ok: false, error: validation.error, reason: 'overpayment' };

  const insertRow: Record<string, unknown> = {
    reservation_id: args.reservationId,
    amount_egp: args.amountEgp,
    receipt_path: args.receiptPath ?? null,
    paid_at: new Date(args.paidDate).toISOString(),
    recorded_by: args.recordedBy,
    recorded_by_role: args.recordedByRole,
    method: args.method,
    note: args.note,
  };
  if (args.idempotencyKey) insertRow.idempotency_key = args.idempotencyKey;

  const { error: insErr } = await sb.from('boat_rental_payments').insert(insertRow);
  if (insErr) {
    // Race on idempotency_key — treat as dedupe.
    if (args.idempotencyKey && (insErr.message || '').toLowerCase().includes('idempotency_key')) {
      return { ok: true, auto_flipped: false, deduped: true };
    }
    throw insErr;
  }

  const balance = computeBalance(reservation.price_egp_snapshot, [...existingAmounts, args.amountEgp]);
  const paymentCount = existingAmounts.length + 1;
  let autoFlipped = false;

  if (balance.is_complete && reservation.status !== 'paid_to_owner') {
    await sb
      .from('boat_rental_reservations')
      .update({ status: 'paid_to_owner', updated_at: new Date().toISOString() })
      .eq('id', args.reservationId);
    autoFlipped = true;

    await logAudit({
      reservationId: args.reservationId,
      actorUserId: args.recordedBy,
      actorRole: args.recordedByRole,
      action: 'auto_paid_to_owner',
      fromStatus: reservation.status,
      toStatus: 'paid_to_owner',
      payload: { total_paid: balance.total_paid, payment_count: paymentCount, method: args.method },
    });

    if (reservation.broker_id) {
      await enqueueNotification({
        reservationId: args.reservationId,
        to: { userId: reservation.broker_id, phone: '', role: 'broker' },
        templateKey: 'trip_payment_complete',
        language: 'en',
        context: {
          boatName: reservation.boat.name,
          bookingDate: reservation.booking_date,
          totalAmount: balance.total_paid,
          paymentCount,
          shortRef: shortRef(args.reservationId),
        },
      });
      await flushPendingForReservation(args.reservationId);
    }
  } else {
    await logAudit({
      reservationId: args.reservationId,
      actorUserId: args.recordedBy,
      actorRole: args.recordedByRole,
      action: 'payment_recorded',
      payload: {
        amount: args.amountEgp,
        method: args.method,
        total_paid: balance.total_paid,
        remaining: balance.remaining,
      },
    });
  }

  return { ok: true, auto_flipped: autoFlipped };
}
