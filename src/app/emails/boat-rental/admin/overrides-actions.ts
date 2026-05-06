'use server';

// Admin god-mode overrides for money + reservations.
//
// These actions exist because:
// - Owners can't edit price after creation (no re-pricing path).
// - Owners can't delete reservations or payments — only cancel.
// - Owners can't void paid expenses outside the 10-min window.
// - Pricing typos, broker reassignments, refunds, double-charges all
//   need someone to be able to reach in and fix the row directly.
//
// Every action here:
// - Requires `requireBoatRoleOrThrow('admin')`.
// - Records an `admin_override_*` audit log entry with before/after.
// - Returns a result object so client UI can toast cleanly.
// - Is destructive — caller MUST gate it behind a confirm() prompt
//   with explicit consequence text ("clear consent").

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import {
  requireBoatRoleOrThrow,
  s,
  sOrNull,
  logAudit,
} from '@/lib/boat-rental/server-helpers';

const RES_SOURCES = ['registered_broker', 'external_broker', 'client_direct'] as const;
const PAYMENT_METHODS = ['cash', 'bank_transfer', 'instapay', 'card', 'other', 'manual_override'] as const;
const EXPENSE_CATEGORIES = [
  'amenities', 'part_time_skipper', 'marina_docking', 'fuel', 'repair',
  'insurance', 'boat_license', 'full_time_skipper_salary',
  'maintenance_contract', 'other',
] as const;

// ---------- Reservation overrides ----------

export async function adminEditReservationAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireBoatRoleOrThrow('admin');
  const id = s(formData.get('id'));
  if (!id) return { ok: false, error: 'Missing reservation id.' };

  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from('boat_rental_reservations')
    .select('id, price_egp_snapshot, booking_date, source, broker_id, external_broker_id, notes')
    .eq('id', id)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Reservation not found.' };

  const updates: Record<string, unknown> = {};

  const priceRaw = s(formData.get('price_egp'));
  if (priceRaw) {
    const price = Number(priceRaw);
    if (!Number.isFinite(price) || price < 0) {
      return { ok: false, error: 'Price must be a non-negative number.' };
    }
    updates.price_egp_snapshot = price;
  }

  const date = sOrNull(formData.get('booking_date'));
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, error: 'Booking date must be YYYY-MM-DD.' };
    }
    updates.booking_date = date;
  }

  const source = sOrNull(formData.get('source'));
  if (source) {
    if (!(RES_SOURCES as readonly string[]).includes(source)) {
      return { ok: false, error: 'Invalid source.' };
    }
    updates.source = source;
  }

  // broker_id / external_broker_id can be set to a UUID or to "" to clear.
  const brokerRaw = formData.get('broker_id');
  if (brokerRaw !== null) {
    updates.broker_id = sOrNull(brokerRaw);
  }
  const extRaw = formData.get('external_broker_id');
  if (extRaw !== null) {
    updates.external_broker_id = sOrNull(extRaw);
  }

  const notesRaw = formData.get('notes');
  if (notesRaw !== null) {
    updates.notes = sOrNull(notesRaw);
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: 'Nothing to update.' };
  }
  updates.updated_at = new Date().toISOString();

  const { error: updErr } = await sb
    .from('boat_rental_reservations')
    .update(updates)
    .eq('id', id);
  if (updErr) {
    return { ok: false, error: `Update failed: ${updErr.message}` };
  }

  await logAudit({
    reservationId: id,
    actorUserId: me.id,
    actorRole: 'admin',
    action: 'admin_override_reservation_edit',
    payload: { before, updates },
  });

  revalidatePath(`/emails/boat-rental/owner/booking/${id}`);
  revalidatePath('/emails/boat-rental/owner/calendar');
  revalidatePath('/emails/boat-rental/owner/reservations');
  revalidatePath('/emails/boat-rental/admin/bookings');
  return { ok: true };
}

export async function adminDeleteReservationAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireBoatRoleOrThrow('admin');
  const id = s(formData.get('id'));
  const reason = sOrNull(formData.get('reason'));
  if (!id) return { ok: false, error: 'Missing reservation id.' };

  const sb = supabaseAdmin();
  const { data: snapshot } = await sb
    .from('boat_rental_reservations')
    .select('id, status, booking_date, boat_id, price_egp_snapshot, broker_id, external_broker_id')
    .eq('id', id)
    .maybeSingle();
  if (!snapshot) return { ok: false, error: 'Reservation not found.' };

  // Audit BEFORE the delete so the row exists at log time. The audit log has
  // reservation_id as nullable + ON DELETE SET NULL, so the entry survives.
  await logAudit({
    reservationId: id,
    actorUserId: me.id,
    actorRole: 'admin',
    action: 'admin_override_reservation_delete',
    payload: { snapshot, reason },
  });

  // Cascade-clean dependents (no FK cascade is defined for these).
  await sb.from('boat_rental_payments').delete().eq('reservation_id', id);
  await sb.from('boat_rental_bookings').delete().eq('reservation_id', id);
  await sb.from('boat_rental_notifications').delete().eq('reservation_id', id);

  const { error: delErr } = await sb
    .from('boat_rental_reservations')
    .delete()
    .eq('id', id);
  if (delErr) {
    return { ok: false, error: `Delete failed: ${delErr.message}` };
  }

  revalidatePath('/emails/boat-rental/owner/calendar');
  revalidatePath('/emails/boat-rental/owner/reservations');
  revalidatePath('/emails/boat-rental/admin/bookings');
  return { ok: true };
}

// ---------- Reservation-payment overrides ----------

export async function adminEditPaymentAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireBoatRoleOrThrow('admin');
  const paymentId = s(formData.get('id'));
  if (!paymentId) return { ok: false, error: 'Missing payment id.' };

  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from('boat_rental_payments')
    .select('id, reservation_id, amount_egp, paid_at, method, note')
    .eq('id', paymentId)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Payment not found.' };

  const updates: Record<string, unknown> = {};

  const amountRaw = s(formData.get('amount_egp'));
  if (amountRaw) {
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: 'Amount must be greater than zero.' };
    }
    updates.amount_egp = amount;
  }

  const paidDate = sOrNull(formData.get('paid_date'));
  if (paidDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) {
      return { ok: false, error: 'Date must be YYYY-MM-DD.' };
    }
    updates.paid_at = new Date(paidDate).toISOString();
  }

  const method = sOrNull(formData.get('method'));
  if (method) {
    if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
      return { ok: false, error: 'Invalid payment method.' };
    }
    updates.method = method;
  }

  const noteRaw = formData.get('note');
  if (noteRaw !== null) {
    updates.note = sOrNull(noteRaw);
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: 'Nothing to update.' };
  }

  const { error: updErr } = await sb
    .from('boat_rental_payments')
    .update(updates)
    .eq('id', paymentId);
  if (updErr) {
    return { ok: false, error: `Update failed: ${updErr.message}` };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reservationId = (before as any).reservation_id as string;

  await logAudit({
    reservationId,
    actorUserId: me.id,
    actorRole: 'admin',
    action: 'admin_override_payment_edit',
    payload: { payment_id: paymentId, before, updates },
  });

  revalidatePath(`/emails/boat-rental/owner/booking/${reservationId}`);
  return { ok: true };
}

export async function adminDeletePaymentAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireBoatRoleOrThrow('admin');
  const paymentId = s(formData.get('id'));
  if (!paymentId) return { ok: false, error: 'Missing payment id.' };

  const sb = supabaseAdmin();
  const { data: snapshot } = await sb
    .from('boat_rental_payments')
    .select('id, reservation_id, amount_egp, paid_at, method, recorded_by_role')
    .eq('id', paymentId)
    .maybeSingle();
  if (!snapshot) return { ok: false, error: 'Payment not found.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reservationId = (snapshot as any).reservation_id as string;

  await logAudit({
    reservationId,
    actorUserId: me.id,
    actorRole: 'admin',
    action: 'admin_override_payment_delete',
    payload: { snapshot },
  });

  const { error: delErr } = await sb
    .from('boat_rental_payments')
    .delete()
    .eq('id', paymentId);
  if (delErr) {
    return { ok: false, error: `Delete failed: ${delErr.message}` };
  }

  // If the reservation was paid_to_owner and we just removed the only payment
  // (or otherwise broke the balance), flip it back to confirmed so the
  // owner UI re-opens "Record payment". The owner action's auto-flip will
  // re-flip when payments come back.
  const { data: remaining } = await sb
    .from('boat_rental_payments')
    .select('amount_egp')
    .eq('reservation_id', reservationId);
  const { data: reservation } = await sb
    .from('boat_rental_reservations')
    .select('status, price_egp_snapshot')
    .eq('id', reservationId)
    .maybeSingle();
  if (reservation && (reservation as { status: string }).status === 'paid_to_owner') {
    const total = (remaining as Array<{ amount_egp: string | number }> | null)?.reduce(
      (sum, p) => sum + Number(p.amount_egp),
      0
    ) ?? 0;
    const price = Number((reservation as { price_egp_snapshot: string | number }).price_egp_snapshot);
    if (total < price) {
      await sb
        .from('boat_rental_reservations')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', reservationId);
    }
  }

  revalidatePath(`/emails/boat-rental/owner/booking/${reservationId}`);
  return { ok: true };
}

// ---------- Expense overrides ----------

export async function adminEditExpenseAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireBoatRoleOrThrow('admin');
  const id = s(formData.get('id'));
  if (!id) return { ok: false, error: 'Missing expense id.' };

  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from('boat_rental_expenses')
    .select('id, category, amount_egp, expense_date, description, vendor_name, status')
    .eq('id', id)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Expense not found.' };

  const updates: Record<string, unknown> = {};

  const category = sOrNull(formData.get('category'));
  if (category) {
    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
      return { ok: false, error: 'Invalid expense category.' };
    }
    updates.category = category;
  }

  const amountRaw = s(formData.get('amount_egp'));
  if (amountRaw) {
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, error: 'Amount must be a non-negative number.' };
    }
    updates.amount_egp = amount;
  }

  const expenseDate = sOrNull(formData.get('expense_date'));
  if (expenseDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      return { ok: false, error: 'Date must be YYYY-MM-DD.' };
    }
    updates.expense_date = expenseDate;
  }

  const descRaw = formData.get('description');
  if (descRaw !== null) updates.description = sOrNull(descRaw);
  const vendorRaw = formData.get('vendor_name');
  if (vendorRaw !== null) updates.vendor_name = sOrNull(vendorRaw);

  // Allow admin to flip status manually in case the expense was wrongly cancelled.
  const status = sOrNull(formData.get('status'));
  if (status) {
    if (!['open', 'paid', 'cancelled'].includes(status)) {
      return { ok: false, error: 'Invalid status.' };
    }
    updates.status = status;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: 'Nothing to update.' };
  }
  updates.updated_at = new Date().toISOString();

  const { error: updErr } = await sb
    .from('boat_rental_expenses')
    .update(updates)
    .eq('id', id);
  if (updErr) {
    return { ok: false, error: `Update failed: ${updErr.message}` };
  }

  await logAudit({
    actorUserId: me.id,
    actorRole: 'admin',
    action: 'admin_override_expense_edit',
    payload: { expense_id: id, before, updates },
  });

  revalidatePath('/emails/boat-rental/owner/money');
  revalidatePath('/emails/boat-rental/owner/money/expenses');
  revalidatePath(`/emails/boat-rental/owner/money/expenses/${id}`);
  revalidatePath('/emails/boat-rental/owner/money/bills');
  return { ok: true };
}

export async function adminDeleteExpenseAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireBoatRoleOrThrow('admin');
  const id = s(formData.get('id'));
  const reason = sOrNull(formData.get('reason'));
  if (!id) return { ok: false, error: 'Missing expense id.' };

  const sb = supabaseAdmin();
  const { data: snapshot } = await sb
    .from('boat_rental_expenses')
    .select('id, boat_id, category, amount_egp, expense_date, status, description, vendor_name')
    .eq('id', id)
    .maybeSingle();
  if (!snapshot) return { ok: false, error: 'Expense not found.' };

  await logAudit({
    actorUserId: me.id,
    actorRole: 'admin',
    action: 'admin_override_expense_delete',
    payload: { snapshot, reason },
  });

  // expense_payments has ON DELETE CASCADE so this single delete cleans up.
  const { error: delErr } = await sb
    .from('boat_rental_expenses')
    .delete()
    .eq('id', id);
  if (delErr) {
    return { ok: false, error: `Delete failed: ${delErr.message}` };
  }

  revalidatePath('/emails/boat-rental/owner/money');
  revalidatePath('/emails/boat-rental/owner/money/expenses');
  revalidatePath('/emails/boat-rental/owner/money/bills');
  return { ok: true };
}

export async function adminDeleteExpensePaymentAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireBoatRoleOrThrow('admin');
  const paymentId = s(formData.get('id'));
  if (!paymentId) return { ok: false, error: 'Missing payment id.' };

  const sb = supabaseAdmin();
  const { data: snapshot } = await sb
    .from('boat_rental_expense_payments')
    .select('id, expense_id, amount_egp, paid_date, method')
    .eq('id', paymentId)
    .maybeSingle();
  if (!snapshot) return { ok: false, error: 'Payment not found.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expenseId = (snapshot as any).expense_id as string;

  await logAudit({
    actorUserId: me.id,
    actorRole: 'admin',
    action: 'admin_override_expense_payment_delete',
    payload: { snapshot },
  });

  const { error: delErr } = await sb
    .from('boat_rental_expense_payments')
    .delete()
    .eq('id', paymentId);
  if (delErr) {
    return { ok: false, error: `Delete failed: ${delErr.message}` };
  }

  // If the expense was 'paid' and we just nuked the only payment that
  // covered it, re-open the bill so it shows in Bills.
  const { data: remaining } = await sb
    .from('boat_rental_expense_payments')
    .select('amount_egp')
    .eq('expense_id', expenseId);
  const { data: expense } = await sb
    .from('boat_rental_expenses')
    .select('status, amount_egp')
    .eq('id', expenseId)
    .maybeSingle();
  if (expense && (expense as { status: string }).status === 'paid') {
    const total = (remaining as Array<{ amount_egp: string | number }> | null)?.reduce(
      (sum, p) => sum + Number(p.amount_egp),
      0
    ) ?? 0;
    const amount = Number((expense as { amount_egp: string | number }).amount_egp);
    if (total < amount) {
      await sb
        .from('boat_rental_expenses')
        .update({ status: 'open', updated_at: new Date().toISOString() })
        .eq('id', expenseId);
    }
  }

  revalidatePath('/emails/boat-rental/owner/money');
  revalidatePath('/emails/boat-rental/owner/money/expenses');
  revalidatePath(`/emails/boat-rental/owner/money/expenses/${expenseId}`);
  revalidatePath('/emails/boat-rental/owner/money/bills');
  return { ok: true };
}
