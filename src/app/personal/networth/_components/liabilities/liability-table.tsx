'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { LiabilityKind } from '@/lib/personal/networth/types';
import { AddLiabilityModal, type LenderOption } from '../modals/add-liability-modal';

type Liability = {
  id: string;
  name: string;
  kind: LiabilityKind;
  currency: string;
  lender_id: string | null;
  current_balance: number;
  principal: number | null;
  apr_pct: number | null;
  term_months: number | null;
  start_date: string | null;
  monthly_payment: number | null;
  credit_limit: number | null;
  statement_day: number | null;
  due_day: number | null;
  min_payment_pct: number | null;
  notes: string | null;
  personal_networth_lenders: { name: string } | null;
};

type Filter = 'all' | 'loans' | 'credit_card' | 'overdraft';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'loans', label: 'Loans / BNPL' },
  { value: 'credit_card', label: 'Cards' },
  { value: 'overdraft', label: 'Overdraft' },
];

const KIND_LABEL: Record<LiabilityKind, string> = {
  amortizing_loan: 'Loan',
  bnpl: 'BNPL',
  credit_card: 'Card',
  overdraft: 'Overdraft',
  other: 'Other',
};

const AMORTIZING_KINDS: LiabilityKind[] = ['amortizing_loan', 'bnpl'];

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

function fmtEgp(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 2,
  }).format(amount);
}

function matchesFilter(l: Liability, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'loans') return l.kind === 'amortizing_loan' || l.kind === 'bnpl';
  if (f === 'credit_card') return l.kind === 'credit_card';
  if (f === 'overdraft') return l.kind === 'overdraft';
  return true;
}

function monthlyOutflow(l: Liability): number {
  if (AMORTIZING_KINDS.includes(l.kind)) {
    return Number(l.monthly_payment ?? 0);
  }
  if (l.kind === 'credit_card' || l.kind === 'overdraft') {
    const pct = Number(l.min_payment_pct ?? 0);
    const bal = Number(l.current_balance ?? 0);
    return (pct * bal) / 100;
  }
  return 0;
}

export function LiabilityTable({
  liabilities,
  lenders,
}: {
  liabilities: Liability[];
  lenders: LenderOption[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [addOpen, setAddOpen] = useState(false);

  const visible = useMemo(
    () => liabilities.filter(l => matchesFilter(l, filter)),
    [liabilities, filter],
  );

  // KPI strip: same-currency-only EGP totals (Option B — no FX dependency).
  const kpi = useMemo(() => {
    const egp = liabilities.filter(l => l.currency === 'EGP');
    const totalBalanceEgp = egp.reduce(
      (sum, l) => sum + Number(l.current_balance ?? 0),
      0,
    );
    const monthlyEgp = egp.reduce((sum, l) => sum + monthlyOutflow(l), 0);
    const highestApr = liabilities.reduce((max, l) => {
      const a = Number(l.apr_pct ?? 0);
      return a > max ? a : max;
    }, 0);

    const nonEgp: Record<string, number> = {};
    for (const l of liabilities) {
      if (l.currency === 'EGP') continue;
      nonEgp[l.currency] = (nonEgp[l.currency] ?? 0) + Number(l.current_balance ?? 0);
    }

    return {
      totalBalanceEgp,
      monthlyEgp,
      highestApr,
      count: liabilities.length,
      nonEgp,
    };
  }, [liabilities]);

  async function onDelete(id: string, name: string) {
    if (
      !confirm(
        `Remove "${name}"? This soft-deletes the liability (active=false). Schedule and payment history are preserved.`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/personal/networth/liabilities/${id}`, {
      method: 'DELETE',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      alert(`Delete failed: ${json.error ?? 'unknown'}`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total balance (EGP only)" value={fmtEgp(kpi.totalBalanceEgp)} />
        <KpiCard label="Monthly outflow (EGP)" value={fmtEgp(kpi.monthlyEgp)} />
        <KpiCard
          label="Highest APR"
          value={kpi.highestApr > 0 ? `${kpi.highestApr.toFixed(2)}%` : '—'}
        />
        <KpiCard label="# Liabilities" value={String(kpi.count)} />
      </div>

      {/* Non-EGP subtotals (only if any) */}
      {Object.keys(kpi.nonEgp).length > 0 && (
        <div className="ix-card p-3 text-xs text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-4 gap-y-1">
          <span className="font-medium text-slate-500 dark:text-slate-400">
            Non-EGP balances (native):
          </span>
          {Object.entries(kpi.nonEgp).map(([cur, amt]) => (
            <span key={cur}>
              <span className="font-semibold">{cur}</span> {fmtAmount(amt, cur)}
            </span>
          ))}
        </div>
      )}

      {/* Filter chips + Add button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 text-xs rounded-full border transition ${
                filter === f.value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="ix-btn-primary"
        >
          <Plus size={16} />
          Add liability
        </button>
      </div>

      {/* Table */}
      <div className="ix-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Lender</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Currency</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-right">APR</th>
                <th className="px-3 py-2 text-right">Monthly</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(l => {
                const monthly = monthlyOutflow(l);
                return (
                  <tr
                    key={l.id}
                    className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                      <Link
                        href={`/personal/networth/liabilities/${l.id}`}
                        className="ix-link"
                      >
                        {l.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      {l.personal_networth_lenders?.name ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      {KIND_LABEL[l.kind] ?? l.kind}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      {l.currency}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtAmount(Number(l.current_balance ?? 0), l.currency)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300 tabular-nums">
                      {l.apr_pct != null ? `${Number(l.apr_pct).toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {monthly > 0 ? fmtAmount(monthly, l.currency) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Link
                        href={`/personal/networth/liabilities/${l.id}`}
                        className="text-xs text-indigo-600 hover:underline mr-3"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => onDelete(l.id, l.name)}
                        className="text-xs text-rose-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center text-sm text-slate-400 italic"
                  >
                    {liabilities.length === 0
                      ? 'No liabilities yet. Add your first one above.'
                      : 'No liabilities match this filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddLiabilityModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => router.refresh()}
        lenders={lenders}
      />
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="ix-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="text-lg font-bold text-slate-900 dark:text-slate-50 mt-1 tabular-nums">
        {value}
      </div>
    </div>
  );
}
