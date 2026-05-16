'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PayCardModal } from '../modals/pay-card-modal';

type Liability = {
  id: string;
  name: string;
  kind: string;
  currency: string;
  current_balance: number | string;
  credit_limit: number | string | null;
  statement_day: number | null;
  due_day: number | null;
  min_payment_pct: number | string | null;
  personal_networth_lenders?: { name?: string } | null;
};

type PaymentRow = {
  id: string;
  occurred_on: string;
  amount: number | string;
  currency: string;
  notes: string | null;
  recurring_template_id: string | null;
  loan_schedule_id: string | null;
};

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function cairoToday(): { iso: string; day: number } {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(
    new Date(),
  );
  return { iso, day: Number(iso.slice(8, 10)) };
}

// Rough "days until due" without dragging in a date library — fine for the
// V1 timeline strip; we use 30 as the cycle approximation.
function daysUntilDueRough(today: number, due: number): number {
  if (due <= 0) return 0;
  return today <= due ? due - today : 30 - today + due;
}

export function RevolvingDetail({
  liability,
  paymentHistory,
}: {
  liability: Liability;
  paymentHistory: PaymentRow[];
}) {
  const router = useRouter();
  const [showPay, setShowPay] = useState(false);

  const balance = Number(liability.current_balance);
  const limit = Number(liability.credit_limit ?? 0);
  const minPct = Number(liability.min_payment_pct ?? 0);
  const utilization = limit > 0 ? Math.round((balance / limit) * 100) : 0;
  const utilColor =
    utilization < 30
      ? 'text-emerald-600 dark:text-emerald-400'
      : utilization < 70
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400';

  const { day: todayDay } = cairoToday();
  const dueDay = liability.due_day ?? 0;
  const daysUntilDue = dueDay > 0 ? daysUntilDueRough(todayDay, dueDay) : null;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Balance"
          value={`${liability.currency} ${fmt(balance)}`}
        />
        <Kpi
          label="Credit limit"
          value={limit > 0 ? `${liability.currency} ${fmt(limit)}` : '—'}
        />
        <Kpi
          label="Utilization"
          value={
            limit > 0 ? (
              <span className={utilColor}>{utilization}%</span>
            ) : (
              '—'
            )
          }
        />
        <Kpi label="Min payment" value={`${minPct}%`} />
      </div>

      <section className="ix-card p-4">
        <div className="text-sm font-semibold mb-2 text-slate-900 dark:text-slate-50">
          Statement timeline
        </div>
        <div className="text-sm text-slate-600 dark:text-slate-300">
          Statement: day {liability.statement_day ?? '—'} · Due: day{' '}
          {dueDay || '—'} · Today (Cairo): day {todayDay}
          {daysUntilDue != null && (
            <>
              {' '}
              ·{' '}
              <strong className="text-slate-900 dark:text-slate-50">
                Due in {daysUntilDue} day{daysUntilDue === 1 ? '' : 's'}
              </strong>
            </>
          )}
        </div>
      </section>

      <div>
        <button
          type="button"
          className="ix-btn-primary"
          onClick={() => setShowPay(true)}
        >
          Pay card
        </button>
      </div>

      <PaymentHistoryTable rows={paymentHistory} />

      {showPay && (
        <PayCardModal
          liability={liability}
          onClose={() => setShowPay(false)}
          onPaid={() => {
            setShowPay(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function Kpi({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
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

function PaymentHistoryTable({ rows }: { rows: PaymentRow[] }) {
  if (rows.length === 0) {
    return (
      <section className="ix-card p-4">
        <div className="text-sm font-semibold mb-2 text-slate-900 dark:text-slate-50">
          Payment history
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No payments yet.
        </p>
      </section>
    );
  }
  return (
    <section className="ix-card p-4">
      <div className="text-sm font-semibold mb-2 text-slate-900 dark:text-slate-50">
        Payment history
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Amount</th>
              <th className="py-2 pr-3">Source</th>
              <th className="py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const source = r.recurring_template_id
                ? 'Recurring'
                : r.loan_schedule_id
                  ? 'Schedule'
                  : 'Manual';
              return (
                <tr
                  key={r.id}
                  className="border-t border-slate-100 dark:border-slate-900"
                >
                  <td className="py-2 pr-3 tabular-nums text-slate-700 dark:text-slate-200">
                    {r.occurred_on}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {r.currency} {Number(r.amount).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">
                    {source}
                  </td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">
                    {r.notes ?? ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
