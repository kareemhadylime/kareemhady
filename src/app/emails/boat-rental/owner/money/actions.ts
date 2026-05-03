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

export async function createExpenseAction(formData: FormData): Promise<void> {
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

  if (!boatId || !category || !expenseDate) throw new Error('invalid_input');
  if (!VALID_CATEGORIES.includes(category)) throw new Error('invalid_category');
  if (!Number.isFinite(amount) || amount < 0) throw new Error('invalid_amount');

  // Per-category required-field validation.
  if (category === 'fuel' && (fuelLiters === null || fuelPrice === null)) {
    throw new Error('fuel_requires_liters_and_price');
  }
  if (category === 'repair' && !description) {
    throw new Error('repair_requires_description');
  }
  if (category === 'part_time_skipper' && !skipperId) {
    throw new Error('part_time_skipper_requires_skipper');
  }
  if ((category === 'amenities' || category === 'part_time_skipper') && !reservationId) {
    throw new Error(`${category}_requires_reservation`);
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

export async function cancelExpenseAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('owner');
  const id = s(formData.get('id'));
  const reason = sOrNull(formData.get('reason'));
  if (!id) throw new Error('invalid_input');

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('boat_rental_expenses')
    .select('boat_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!row) throw new Error('not_found');
  const exp = row as { boat_id: string; status: string };
  if (exp.status === 'cancelled') return;
  await assertOwnerOwnsBoat(exp.boat_id, me);

  await sb
    .from('boat_rental_expenses')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id);

  await logAudit({
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'expense_cancel',
    payload: { expense_id: id, reason },
  });

  revalidatePath('/emails/boat-rental/owner/money');
  revalidatePath('/emails/boat-rental/owner/money/expenses');
  revalidatePath(`/emails/boat-rental/owner/money/expenses/${id}`);
  revalidatePath('/emails/boat-rental/owner/money/bills');
}
