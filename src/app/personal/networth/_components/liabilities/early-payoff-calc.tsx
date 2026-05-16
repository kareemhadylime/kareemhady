'use client';

import { useMemo, useState } from 'react';
import { earlyPayoffProjection } from '@/lib/personal/networth/amortization';
import type { ScheduleRow as LibScheduleRow } from '@/lib/personal/networth/types';

// DB rows use snake_case + numeric strings; the lib expects camelCase numbers.
type DbScheduleRow = {
  installment_no: number;
  due_date: string;
  principal_portion: number | string;
  interest_portion: number | string;
  remaining_after: number | string;
};

function toLibRows(rows: DbScheduleRow[]): LibScheduleRow[] {
  return rows.map(r => ({
    installmentNo: r.installment_no,
    dueDate: r.due_date,
    principalPortion: Number(r.principal_portion),
    interestPortion: Number(r.interest_portion),
    remainingAfter: Number(r.remaining_after),
  }));
}

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

export function EarlyPayoffCalc({
  schedule,
  paidCount,
  aprPct,
  currency,
}: {
  schedule: DbScheduleRow[];
  paidCount: number;
  aprPct: number;
  currency: string;
}) {
  const [extraInput, setExtraInput] = useState('');

  const libRows = useMemo(() => toLibRows(schedule), [schedule]);

  const projection = useMemo(() => {
    const extra = parseFloat(extraInput);
    if (!Number.isFinite(extra) || extra <= 0) return null;
    try {
      return {
        ok: true as const,
        result: earlyPayoffProjection(libRows, paidCount, extra, aprPct),
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [extraInput, libRows, paidCount, aprPct]);

  return (
    <section className="ix-card p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Early payoff calculator
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          See what an extra monthly payment shaves off your loan.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[220px] flex flex-col text-xs">
          <span className="mb-1 text-slate-600 dark:text-slate-300">
            Extra monthly amount ({currency})
          </span>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            className="ix-input text-right"
            value={extraInput}
            onChange={e => setExtraInput(e.target.value)}
            placeholder="0.00"
            aria-label={`Extra monthly amount in ${currency}`}
          />
        </label>
      </div>

      {projection === null && (
        <div className="text-xs text-slate-500 dark:text-slate-400 italic">
          Enter an extra amount to see projection.
        </div>
      )}

      {projection && !projection.ok && (
        <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded px-2 py-1.5">
          {projection.error}
        </div>
      )}

      {projection && projection.ok && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ResultKpi
            label="New payoff date"
            value={projection.result.newPayoffDate}
          />
          <ResultKpi
            label="Total interest saved"
            value={fmtAmount(projection.result.totalInterestSaved, currency)}
            accent={projection.result.totalInterestSaved > 0 ? 'positive' : undefined}
          />
          <ResultKpi
            label="Months saved"
            value={String(projection.result.monthsSaved)}
            accent={projection.result.monthsSaved > 0 ? 'positive' : undefined}
          />
        </div>
      )}
    </section>
  );
}

function ResultKpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'positive';
}) {
  const accentClass =
    accent === 'positive'
      ? 'text-emerald-700 dark:text-emerald-300'
      : 'text-slate-900 dark:text-slate-50';
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className={`text-lg font-bold mt-1 tabular-nums ${accentClass}`}>{value}</div>
    </div>
  );
}
