import { NetWorthShell, NetWorthHeader } from '../../_components/networth-shell';
import { ScheduleTable } from '../../_components/liabilities/schedule-table';
import { EarlyPayoffCalc } from '../../_components/liabilities/early-payoff-calc';
import { RevolvingDetail } from '../../_components/liabilities/revolving-detail';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

type LiabilityRow = {
  id: string;
  app_user_id: string;
  name: string;
  kind: string;
  currency: string;
  current_balance: number | string;
  apr_pct: number | string | null;
  credit_limit: number | string | null;
  statement_day: number | null;
  due_day: number | null;
  min_payment_pct: number | string | null;
  personal_networth_lenders: { name: string } | null;
};

type PaymentHistoryRow = {
  id: string;
  occurred_on: string;
  amount: number | string;
  currency: string;
  notes: string | null;
  recurring_template_id: string | null;
  loan_schedule_id: string | null;
};

type ScheduleRow = {
  id: string;
  installment_no: number;
  due_date: string;
  principal_portion: number | string;
  interest_portion: number | string;
  remaining_after: number | string;
  paid_on: string | null;
};

type SummaryRow = {
  paid_count: number | null;
  interest_paid_ytd: number | string | null;
  remaining_months: number | null;
  final_due_date: string | null;
};

export default async function LiabilityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.is_admin) notFound();
  const { id } = await params;

  const sb = supabaseAdmin();
  const { data: liabilityRaw, error: liabErr } = await sb
    .from('personal_networth_liabilities')
    .select('*, personal_networth_lenders(name)')
    .eq('id', id)
    .eq('app_user_id', user.id)
    .maybeSingle();
  if (liabErr) throw new Error(`liability fetch failed: ${liabErr.message}`);
  if (!liabilityRaw) notFound();

  const liability = liabilityRaw as unknown as LiabilityRow;
  const lenderName = liability.personal_networth_lenders?.name ?? 'No lender';
  const currentBalance = Number(liability.current_balance);

  // Revolving (credit card / overdraft): utilization, statement timeline,
  // pay-card modal, and payment history.
  if (liability.kind === 'credit_card' || liability.kind === 'overdraft') {
    const { data: history, error: histErr } = await sb
      .from('personal_networth_payments')
      .select(
        'id, occurred_on, amount, currency, notes, recurring_template_id, loan_schedule_id',
      )
      .eq('liability_id', id)
      .order('occurred_on', { ascending: false })
      .limit(50);
    if (histErr) {
      throw new Error(`payment history fetch failed: ${histErr.message}`);
    }
    const paymentHistory = (history ?? []) as PaymentHistoryRow[];
    return (
      <NetWorthShell>
        <NetWorthHeader
          eyebrow="Net Worth · Liability"
          title={liability.name}
          subtitle={`${liability.kind} · ${lenderName}`}
        />
        <RevolvingDetail
          liability={liability}
          paymentHistory={paymentHistory}
        />
      </NetWorthShell>
    );
  }

  // Amortizing path (amortizing_loan, bnpl, other).
  const [scheduleRes, summaryRes] = await Promise.all([
    sb
      .from('personal_networth_liability_schedule')
      .select('*')
      .eq('liability_id', id)
      .order('installment_no'),
    sb
      .from('v_personal_networth_loan_summary')
      .select('*')
      .eq('liability_id', id)
      .maybeSingle(),
  ]);

  const schedule = (scheduleRes.data ?? []) as ScheduleRow[];
  const summary = (summaryRes.data ?? null) as SummaryRow | null;

  const interestYtd = Number(summary?.interest_paid_ytd ?? 0);
  const paidCount = Number(
    summary?.paid_count ?? schedule.filter(r => r.paid_on).length,
  );
  const remainingMonths = Number(
    summary?.remaining_months ?? schedule.filter(r => !r.paid_on).length,
  );
  const totalInterestIfScheduled = schedule.reduce(
    (s, r) => s + Number(r.interest_portion ?? 0),
    0,
  );
  const finalDueDate =
    summary?.final_due_date ?? schedule.at(-1)?.due_date ?? null;
  const aprPct = Number(liability.apr_pct ?? 0);

  return (
    <NetWorthShell>
      <NetWorthHeader
        eyebrow="Net Worth · Liability"
        title={liability.name}
        subtitle={`${liability.kind} · ${lenderName}`}
      />
      <AmortizingKpiStrip
        currency={liability.currency}
        currentBalance={currentBalance}
        interestYtd={interestYtd}
        remainingMonths={remainingMonths}
        totalInterestIfScheduled={totalInterestIfScheduled}
        finalDueDate={finalDueDate}
      />
      <EarlyPayoffCalc
        schedule={schedule}
        paidCount={paidCount}
        aprPct={aprPct}
        currency={liability.currency}
      />
      <ScheduleTable
        liabilityId={id}
        rows={schedule}
        currency={liability.currency}
      />
    </NetWorthShell>
  );
}

function AmortizingKpiStrip({
  currency,
  currentBalance,
  interestYtd,
  remainingMonths,
  totalInterestIfScheduled,
  finalDueDate,
}: {
  currency: string;
  currentBalance: number;
  interestYtd: number;
  remainingMonths: number;
  totalInterestIfScheduled: number;
  finalDueDate: string | null;
}) {
  const fmt = (n: number) =>
    `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Kpi label="Current balance" value={fmt(currentBalance)} />
      <Kpi label="Interest YTD" value={fmt(interestYtd)} />
      <Kpi label="Months remaining" value={String(remainingMonths)} />
      <Kpi label="Total interest if-scheduled" value={fmt(totalInterestIfScheduled)} />
      <Kpi label="Final due" value={finalDueDate ?? '—'} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="ix-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="text-lg font-semibold mt-1 text-slate-900 dark:text-slate-50 tabular-nums">
        {value}
      </div>
    </div>
  );
}
