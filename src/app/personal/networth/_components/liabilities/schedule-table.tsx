'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cairoTodayIso } from '@/lib/fmt-date';

type ScheduleRow = {
  id: string;
  installment_no: number;
  due_date: string; // YYYY-MM-DD
  principal_portion: number | string;
  interest_portion: number | string;
  remaining_after: number | string;
  paid_on: string | null;
};

function fmtAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
}

function statusOf(row: ScheduleRow, today: string): 'paid' | 'overdue' | 'upcoming' {
  if (row.paid_on) return 'paid';
  if (row.due_date < today) return 'overdue';
  return 'upcoming';
}

function StatusBadge({ status }: { status: 'paid' | 'overdue' | 'upcoming' }) {
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
        Paid
      </span>
    );
  }
  if (status === 'overdue') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
        Overdue
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
      Upcoming
    </span>
  );
}

export function ScheduleTable({
  liabilityId,
  rows,
  currency,
}: {
  liabilityId: string;
  rows: ScheduleRow[];
  currency: string;
}) {
  const router = useRouter();
  const today = cairoTodayIso();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function markPaid(row: ScheduleRow) {
    const principal = Number(row.principal_portion);
    const interest = Number(row.interest_portion);
    const total = Math.round((principal + interest) * 100) / 100;
    const ok = window.confirm(
      `Mark installment #${row.installment_no} paid?\nAmount: ${fmtAmount(total, currency)}\nDate: ${today}`,
    );
    if (!ok) return;

    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/personal/networth/liabilities/${liabilityId}/mark-paid`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            scheduleId: row.id,
            occurredOn: today,
            amount: total,
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Failed to record payment.');
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="ix-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Amortization schedule
        </h2>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {rows.length} installments
        </div>
      </div>

      {error && (
        <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded px-2 py-1.5">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Due date</th>
              <th className="px-3 py-2 text-right">Principal</th>
              <th className="px-3 py-2 text-right">Interest</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Remaining after</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const principal = Number(row.principal_portion);
              const interest = Number(row.interest_portion);
              const total = Math.round((principal + interest) * 100) / 100;
              const remaining = Number(row.remaining_after);
              const status = statusOf(row, today);
              const isBusy = busyId === row.id;
              return (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                    {row.installment_no}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300 tabular-nums">
                    {row.due_date}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtAmount(principal, currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {fmtAmount(interest, currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {fmtAmount(total, currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {fmtAmount(remaining, currency)}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {status === 'paid' ? (
                      <span className="text-xs text-slate-400">{row.paid_on}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => markPaid(row)}
                        disabled={isBusy}
                        className="text-xs text-indigo-600 hover:underline disabled:opacity-50 disabled:no-underline"
                      >
                        {isBusy ? 'Saving…' : 'Mark paid'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-sm text-slate-400 italic"
                >
                  No schedule rows yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
