import { supabaseAdmin } from '@/lib/supabase';
import { generateSchedule } from './amortization';
import type { LiabilityKind } from './types';

type CreateLiabilityInput = {
  appUserId: string;
  name: string;
  kind: LiabilityKind;
  currency: string;
  lenderId?: string | null;
  currentBalance: number;
  // Amortizing
  principal?: number;
  aprPct?: number;
  termMonths?: number;
  startDate?: string;
  monthlyPayment?: number;
  // Revolving
  creditLimit?: number;
  statementDay?: number;
  dueDay?: number;
  minPaymentPct?: number;
  notes?: string;
};

export async function createLiability(input: CreateLiabilityInput): Promise<string> {
  const sb = supabaseAdmin();
  const { data: row, error } = await sb
    .from('personal_networth_liabilities')
    .insert({
      app_user_id: input.appUserId, name: input.name, kind: input.kind,
      currency: input.currency, lender_id: input.lenderId ?? null,
      current_balance: input.currentBalance,
      principal: input.principal ?? null, apr_pct: input.aprPct ?? null,
      term_months: input.termMonths ?? null, start_date: input.startDate ?? null,
      monthly_payment: input.monthlyPayment ?? null,
      credit_limit: input.creditLimit ?? null,
      statement_day: input.statementDay ?? null, due_day: input.dueDay ?? null,
      min_payment_pct: input.minPaymentPct ?? null, notes: input.notes ?? null,
    }).select('id').single();
  if (error || !row) {
    throw new Error(
      `createLiability insert failed: ${error?.message ?? 'no row returned'}`,
    );
  }

  if (input.kind === 'amortizing_loan' || input.kind === 'bnpl') {
    if (
      input.principal == null || input.aprPct == null ||
      input.termMonths == null || input.startDate == null
    ) {
      throw new Error(
        `createLiability: principal, aprPct, termMonths, startDate are required for kind=${input.kind}`,
      );
    }
    // Two-step write: parent inserted first (above), then schedule rows. No SQL
    // transaction (V1 trade-off, same as snapshot.ts). If the schedule insert
    // fails below, the parent row remains as an orphaned amortizing liability
    // with no schedule. Caller must handle the thrown error and surface it.
    const schedule = generateSchedule({
      principal: input.principal, aprPct: input.aprPct,
      termMonths: input.termMonths, startDate: input.startDate,
      monthlyOverride: input.monthlyPayment,
    });
    const rows = schedule.map(s => ({
      liability_id: row.id,
      installment_no: s.installmentNo, due_date: s.dueDate,
      principal_portion: s.principalPortion,
      interest_portion: s.interestPortion,
      remaining_after: s.remainingAfter,
    }));
    const { error: schErr } = await sb
      .from('personal_networth_liability_schedule').insert(rows);
    if (schErr) throw new Error(`createLiability schedule insert failed: ${schErr.message}`);
  }
  return row.id;
}

export async function updateBalance(
  liabilityId: string, newBalance: number,
): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('personal_networth_liabilities')
    .update({ current_balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', liabilityId);
  if (error) throw error;
}

export async function markScheduleRowPaid(
  scheduleId: string, paymentId: string, paidOn: string,
): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('personal_networth_liability_schedule')
    .update({ paid_on: paidOn, payment_id: paymentId })
    .eq('id', scheduleId);
  if (error) throw error;
}
