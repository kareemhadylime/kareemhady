import { supabaseAdmin } from '@/lib/supabase';
import { markScheduleRowPaid, updateBalance } from './liability';
import { computeNextRunDate } from '@/lib/recurring';
import type { PaymentCategory } from './types';

type RecordPaymentInput = {
  appUserId: string;
  occurredOn: string;
  amount: number;
  currency: string;
  category: PaymentCategory;
  liabilityId?: string | null;
  loanScheduleId?: string | null;
  recurringTemplateId?: string | null;
  notes?: string;
};

export async function recordPayment(input: RecordPaymentInput): Promise<string> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_networth_payments')
    .insert({
      app_user_id: input.appUserId, occurred_on: input.occurredOn,
      amount: input.amount, currency: input.currency, category: input.category,
      liability_id: input.liabilityId ?? null,
      loan_schedule_id: input.loanScheduleId ?? null,
      recurring_template_id: input.recurringTemplateId ?? null,
      notes: input.notes ?? null,
    }).select('id').single();
  if (error || !data) {
    throw new Error(`recordPayment insert failed: ${error?.message ?? 'no row returned'}`);
  }
  return data.id;
}

type ScheduleWithLiability = {
  id: string;
  liability_id: string;
  principal_portion: number;
  interest_portion: number;
  remaining_after: number;
  personal_networth_liabilities: {
    currency: string;
    kind: string;
    current_balance: number;
  };
};

export async function recordPaymentForSchedule(
  scheduleId: string,
  opts: { appUserId: string; occurredOn?: string; amount?: number },
): Promise<string> {
  const sb = supabaseAdmin();
  const { data: schRaw, error: schErr } = await sb
    .from('personal_networth_liability_schedule')
    .select('id, liability_id, principal_portion, interest_portion, remaining_after, personal_networth_liabilities!inner(currency, kind, current_balance)')
    .eq('id', scheduleId).single();
  if (schErr || !schRaw) {
    throw new Error(`recordPaymentForSchedule: schedule not found: ${schErr?.message ?? scheduleId}`);
  }

  const sch = schRaw as unknown as ScheduleWithLiability;
  const liability = sch.personal_networth_liabilities;
  const occurredOn = opts.occurredOn ?? new Date().toISOString().slice(0, 10);
  const amount = opts.amount ?? (Number(sch.principal_portion) + Number(sch.interest_portion));
  const category: PaymentCategory = liability.kind === 'bnpl' ? 'bnpl_payment' : 'loan_payment';

  const paymentId = await recordPayment({
    appUserId: opts.appUserId, occurredOn, amount,
    currency: liability.currency, category,
    liabilityId: sch.liability_id, loanScheduleId: scheduleId,
  });
  await markScheduleRowPaid(scheduleId, paymentId, occurredOn);
  await updateBalance(sch.liability_id, Number(sch.remaining_after));
  return paymentId;
}

export async function recordPaymentForRecurringTemplate(
  templateId: string, occurredOn: string,
): Promise<string> {
  const sb = supabaseAdmin();
  const { data: tpl, error } = await sb
    .from('personal_networth_recurring_templates')
    .select('*').eq('id', templateId).single();
  if (error || !tpl) {
    throw new Error(`recordPaymentForRecurringTemplate: template not found: ${error?.message ?? templateId}`);
  }

  // Idempotency fast-path: if a payment already exists for this template +
  // occurred_on (e.g., cron and manual run-now firing within seconds), return
  // the existing id and skip the insert + side effects. The partial unique
  // index `idx_uniq_payments_recurring_per_day` (migration 0141) is the
  // safety net for the microsecond-wide race window between SELECT and INSERT.
  const { data: existing, error: existErr } = await sb
    .from('personal_networth_payments')
    .select('id')
    .eq('recurring_template_id', templateId)
    .eq('occurred_on', occurredOn)
    .maybeSingle();
  if (existErr) {
    throw new Error(`recordPaymentForRecurringTemplate: idempotency lookup failed: ${existErr.message}`);
  }
  if (existing) {
    return existing.id;
  }

  let paymentId: string;
  try {
    paymentId = await recordPayment({
      appUserId: tpl.app_user_id, occurredOn,
      amount: Number(tpl.amount), currency: tpl.currency,
      category: tpl.category, liabilityId: tpl.liability_id,
      recurringTemplateId: tpl.id,
    });
  } catch (e) {
    // 23505 from idx_uniq_payments_recurring_per_day means another caller
    // won the insert race. Re-fetch the winning row and return its id.
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('idx_uniq_payments_recurring_per_day') || msg.includes('23505')) {
      const { data: raced } = await sb
        .from('personal_networth_payments')
        .select('id')
        .eq('recurring_template_id', templateId)
        .eq('occurred_on', occurredOn)
        .maybeSingle();
      if (raced) return raced.id;
    }
    throw e;
  }

  // If template links a loan, also mark its next unpaid schedule row paid
  if (tpl.liability_id) {
    const { data: next } = await sb
      .from('personal_networth_liability_schedule')
      .select('id, remaining_after').eq('liability_id', tpl.liability_id)
      .is('paid_on', null).order('due_date').limit(1).maybeSingle();
    if (next) {
      await markScheduleRowPaid(next.id, paymentId, occurredOn);
      await updateBalance(tpl.liability_id, Number(next.remaining_after));
    }
  }

  // Advance the template. This MUST succeed — silent failure here would cause
  // the cron to re-process the same template on its next tick, creating a
  // duplicate payment row.
  const nextRun = computeNextRunDate(
    tpl.frequency, tpl.day_of_period, tpl.month_of_year, occurredOn,
  );
  const { error: tplErr } = await sb
    .from('personal_networth_recurring_templates')
    .update({ next_run_date: nextRun, last_run_date: occurredOn })
    .eq('id', templateId);
  if (tplErr) {
    throw new Error(
      `recordPaymentForRecurringTemplate: failed to advance template ${templateId}: ${tplErr.message}`,
    );
  }
  return paymentId;
}

export async function recordCardPayment(
  liabilityId: string, appUserId: string,
  preset: 'min' | 'statement' | 'full' | 'custom', customAmount?: number,
): Promise<string> {
  const sb = supabaseAdmin();
  const { data: li, error } = await sb
    .from('personal_networth_liabilities')
    .select('current_balance, min_payment_pct, currency, kind')
    .eq('id', liabilityId).single();
  if (error || !li) {
    throw new Error(`recordCardPayment: liability not found: ${error?.message ?? liabilityId}`);
  }

  let amount: number;
  switch (preset) {
    case 'min':
      if (li.min_payment_pct == null) {
        throw new Error(
          `recordCardPayment: min_payment_pct not set for liability ${liabilityId}; cannot compute minimum payment`,
        );
      }
      amount = Math.round((Number(li.current_balance) * Number(li.min_payment_pct) / 100) * 100) / 100;
      break;
    case 'statement':
    case 'full':
      amount = Number(li.current_balance);
      break;
    case 'custom':
      amount = customAmount ?? 0;
      break;
  }
  if (amount <= 0) {
    throw new Error(`recordCardPayment: computed amount <= 0 (preset=${preset}, balance=${li.current_balance})`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const category: PaymentCategory = li.kind === 'overdraft' ? 'overdraft_payment' : 'card_payment';
  const paymentId = await recordPayment({
    appUserId, occurredOn: today, amount,
    currency: li.currency, category, liabilityId,
  });
  await updateBalance(liabilityId, Math.max(0, Number(li.current_balance) - amount));
  return paymentId;
}
