'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import {
  requireBoatRoleOrThrow,
  s,
  sOrNull,
  nOrNull,
  logAudit,
} from '@/lib/boat-rental/server-helpers';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import type { SessionUser } from '@/lib/auth';
import { computeBalance, validatePaymentAmount } from '@/lib/boat-rental/payment-balance';

const VALID_CATEGORIES = [
  'amenities',
  'part_time_skipper',
  'marina_docking',
  'fuel',
  'repair',
  'insurance',
  'boat_license',
  'full_time_skipper_salary',
  'maintenance_contract',
  'other',
] as const;

const VALID_PAYMENT_METHODS = ['cash', 'bank_transfer', 'instapay', 'card', 'other'] as const;

async function assertOwnerOwnsBoat(boatId: string, user: SessionUser): Promise<string> {
  const ownerIds = await getOwnedOwnerIds(user);
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_boats')
    .select('owner_id')
    .eq('id', boatId)
    .maybeSingle();
  const row = data as { owner_id: string } | null;
  if (!row || !ownerIds.includes(row.owner_id)) {
    throw new Error('forbidden');
  }
  return row.owner_id;
}

export async function createExpenseAction(
  formData: FormData
): Promise<{ ok: true; expenseId: string } | { ok: false; error: string }> {
  const me = await requireBoatRoleOrThrow('owner');
  const boatId = s(formData.get('boat_id'));
  const category = s(formData.get('category')) as (typeof VALID_CATEGORIES)[number];
  const expenseDate = s(formData.get('expense_date'));
  const amount = Number(s(formData.get('amount_egp')));
  const description = sOrNull(formData.get('description'));
  const reservationId = sOrNull(formData.get('reservation_id'));
  const skipperId = sOrNull(formData.get('skipper_id'));
  const fuelLiters = nOrNull(formData.get('fuel_liters'));
  const fuelPrice = nOrNull(formData.get('fuel_price_per_liter'));
  const fuelTips = nOrNull(formData.get('fuel_tips_egp'));
  const vendorName = sOrNull(formData.get('vendor_name'));
  const payNow = formData.get('pay_now') === 'on';
  const payNowMethodRaw = s(formData.get('pay_now_method')) || 'cash';

  if (!boatId || !category || !expenseDate) {
    return { ok: false, error: 'Boat, category and date are required.' };
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return { ok: false, error: 'Unknown category.' };
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: 'Amount must be a positive number.' };
  }

  // Per-category required-field validation.
  if (category === 'fuel' && (fuelLiters === null || fuelPrice === null)) {
    return { ok: false, error: 'Fuel needs both liters and price/liter.' };
  }
  if (category === 'repair' && !description) {
    return { ok: false, error: 'Repair entries need a description.' };
  }
  if (category === 'part_time_skipper' && !skipperId) {
    return { ok: false, error: 'Part-time skipper entries need a skipper.' };
  }
  if ((category === 'amenities' || category === 'part_time_skipper') && !reservationId) {
    return { ok: false, error: `${category} entries need a trip.` };
  }

  const ownerId = await assertOwnerOwnsBoat(boatId, me);

  const sb = supabaseAdmin();
  const status = payNow ? 'paid' : 'open';
  const { data: row, error } = await sb
    .from('boat_rental_expenses')
    .insert({
      boat_id: boatId,
      owner_id: ownerId,
      reservation_id: reservationId,
      category,
      expense_date: expenseDate,
      amount_egp: amount,
      description,
      fuel_liters: fuelLiters,
      fuel_price_per_liter: fuelPrice,
      fuel_tips_egp: fuelTips,
      skipper_id: skipperId,
      vendor_name: vendorName,
      status,
      created_by: me.id,
    })
    .select('id')
    .single();
  if (error) throw error;
  const expenseId = (row as { id: string }).id;

  if (payNow) {
    const payNowMethod = (VALID_PAYMENT_METHODS as readonly string[]).includes(payNowMethodRaw)
      ? payNowMethodRaw
      : 'cash';
    if (amount > 0) {
      await sb.from('boat_rental_expense_payments').insert({
        expense_id: expenseId,
        amount_egp: amount,
        paid_date: expenseDate,
        method: payNowMethod,
        recorded_by: me.id,
      });
    }
    await logAudit({
      actorUserId: me.id,
      actorRole: 'owner',
      action: 'expense_payment',
      payload: { expense_id: expenseId, amount, method: payNowMethod, full_settle: true },
    });
  }

  await logAudit({
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'expense_create',
    payload: { expense_id: expenseId, category, amount, status },
  });

  revalidatePath('/emails/boat-rental/owner/money');
  revalidatePath('/emails/boat-rental/owner/money/expenses');
  revalidatePath('/emails/boat-rental/owner/money/bills');
  if (reservationId) revalidatePath(`/emails/boat-rental/owner/booking/${reservationId}`);
  return { ok: true, expenseId };
}

export async function recordExpensePaymentAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireBoatRoleOrThrow('owner');
  const expenseId = s(formData.get('expense_id'));
  const amount = Number(s(formData.get('amount_egp')));
  const method = s(formData.get('method'));
  const paidDate = s(formData.get('paid_date'));
  const note = sOrNull(formData.get('note'));

  if (!expenseId || !method || !paidDate) throw new Error('invalid_input');
  if (!(VALID_PAYMENT_METHODS as readonly string[]).includes(method)) {
    return { ok: false, error: 'Invalid payment method' };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Amount must be greater than zero' };
  }

  const sb = supabaseAdmin();
  const { data: r } = await sb
    .from('boat_rental_expenses')
    .select(
      `
      id, status, amount_egp, boat_id,
      payments:boat_rental_expense_payments ( amount_egp )
    `
    )
    .eq('id', expenseId)
    .maybeSingle();
  if (!r) throw new Error('not_found');
  const expense = r as {
    id: string;
    status: string;
    amount_egp: string | number;
    boat_id: string;
    payments: Array<{ amount_egp: string | number }>;
  };
  await assertOwnerOwnsBoat(expense.boat_id, me);
  if (expense.status !== 'open') {
    return { ok: false, error: `Expense not open (status: ${expense.status})` };
  }

  const existing = (expense.payments ?? []).map((p) => p.amount_egp);
  const validation = validatePaymentAmount(expense.amount_egp, existing, amount);
  if (!validation.ok) return validation;

  const { error: insErr } = await sb.from('boat_rental_expense_payments').insert({
    expense_id: expenseId,
    amount_egp: amount,
    paid_date: paidDate,
    method,
    note,
    recorded_by: me.id,
  });
  if (insErr) throw insErr;

  const balance = computeBalance(expense.amount_egp, [...existing, amount]);
  if (balance.is_complete) {
    await sb
      .from('boat_rental_expenses')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', expenseId);
  }

  await logAudit({
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'expense_payment',
    payload: {
      expense_id: expenseId,
      amount,
      method,
      total_paid: balance.total_paid,
      settled: balance.is_complete,
    },
  });

  revalidatePath('/emails/boat-rental/owner/money');
  revalidatePath('/emails/boat-rental/owner/money/expenses');
  revalidatePath(`/emails/boat-rental/owner/money/expenses/${expenseId}`);
  revalidatePath('/emails/boat-rental/owner/money/bills');
  return { ok: true };
}

// Window (in minutes) during which a PAID expense can still be voided as a
// fat-finger correction. Outside this window paid expenses are immutable —
// the user has to record a reverse payment / contra-entry instead.
//
// NOTE: cannot be `export const` — files marked `'use server'` may only
// export async functions. Module-private; if external callers need the
// value, expose it via a sibling non-action constants module.
const EXPENSE_VOID_WINDOW_MIN = 10;

/**
 * Cancel/void an expense.
 *
 * - `open` (unpaid) expenses: cancellable any time. Status flips to `cancelled`,
 *   payment rows untouched (there are none).
 * - `paid` expenses: voidable ONLY within EXPENSE_VOID_WINDOW_MIN of `created_at`.
 *   This is for "oops I just typed the wrong number" corrections. When voided,
 *   any associated payment rows are deleted (so reports don't double-count an
 *   entry that's effectively a typo). After the window closes, paid expenses
 *   are locked — the right path is a manual reversing entry through admin.
 * - `cancelled`: idempotent no-op.
 *
 * Returns a result so the calling client form can show toast feedback.
 */
export async function cancelExpenseAction(
  formData: FormData
): Promise<{ ok: true; voided_payment: boolean } | { ok: false; error: string }> {
  const me = await requireBoatRoleOrThrow('owner');
  const id = s(formData.get('id'));
  const reason = sOrNull(formData.get('reason'));
  if (!id) return { ok: false, error: 'Missing expense id.' };

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('boat_rental_expenses')
    .select('boat_id, status, created_at, amount_egp, category')
    .eq('id', id)
    .maybeSingle();
  if (!row) return { ok: false, error: 'Expense not found.' };
  const exp = row as {
    boat_id: string;
    status: string;
    created_at: string;
    amount_egp: string | number;
    category: string;
  };
  if (exp.status === 'cancelled') {
    return { ok: true, voided_payment: false };
  }
  await assertOwnerOwnsBoat(exp.boat_id, me);

  const ageMinutes = (Date.now() - new Date(exp.created_at).getTime()) / 60_000;
  const withinVoidWindow = ageMinutes <= EXPENSE_VOID_WINDOW_MIN;

  if (exp.status === 'paid' && !withinVoidWindow) {
    return {
      ok: false,
      error: `This expense was paid ${Math.round(ageMinutes)} min ago — outside the ${EXPENSE_VOID_WINDOW_MIN}-min undo window. Record a reversing entry instead.`,
    };
  }

  let voidedPayment = false;
  if (exp.status === 'paid' && withinVoidWindow) {
    // Delete the payment rows so reports don't double-count a typo'd entry.
    const { error: delErr } = await sb
      .from('boat_rental_expense_payments')
      .delete()
      .eq('expense_id', id);
    if (delErr) {
      return { ok: false, error: `Couldn’t roll back payments: ${delErr.message}` };
    }
    voidedPayment = true;
  }

  const { error: updErr } = await sb
    .from('boat_rental_expenses')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (updErr) {
    return { ok: false, error: `Couldn’t cancel: ${updErr.message}` };
  }

  await logAudit({
    actorUserId: me.id,
    actorRole: 'owner',
    action: voidedPayment ? 'expense_void_undo' : 'expense_cancel',
    payload: {
      expense_id: id,
      reason,
      prior_status: exp.status,
      age_minutes: Math.round(ageMinutes),
      voided_payment: voidedPayment,
    },
  });

  revalidatePath('/emails/boat-rental/owner/money');
  revalidatePath('/emails/boat-rental/owner/money/expenses');
  revalidatePath(`/emails/boat-rental/owner/money/expenses/${id}`);
  revalidatePath('/emails/boat-rental/owner/money/bills');
  return { ok: true, voided_payment: voidedPayment };
}
