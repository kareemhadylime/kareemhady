'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Download, ArrowUp, ArrowDown } from 'lucide-react';
import { CategoryTrendChart } from './category-trend-chart';

// Mirrors the MonthlyReport server type from
// @/lib/personal/networth/queries — duplicated here so this component
// doesn't reach into a server-only import path.
type MonthlyReport = {
  monthLabel: string;
  totalEgp: number;
  prevMonthTotalEgp: number;
  deltaEgp: number;
  deltaPct: number | null;
  byCategory: Array<{
    category: string;
    amountEgp: number;
    count: number;
    deltaVsPrevEgp: number;
  }>;
  paymentCount: number;
};

const CATEGORY_LABEL: Record<string, string> = {
  loan_payment: 'Loan payment',
  card_payment: 'Card payment',
  overdraft_payment: 'Overdraft payment',
  bnpl_payment: 'BNPL payment',
  charity: 'Charity',
  rent: 'Rent',
  utility: 'Utility',
  phone: 'Phone',
  subscription: 'Subscription',
  insurance: 'Insurance',
  school_fee: 'School fee',
  other: 'Other',
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function fmtEgp(n: number): string {
  // Compact `EGP 12,345` rendering — Intl currency would force the
  // "EGP" symbol before the number with a NBSP, which doesn't match the
  // rest of the dashboard.
  return `EGP ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function MonthlyReportClient({
  initialReport,
  initialYear,
  initialMonth,
  cairoYear,
  cairoMonth,
}: {
  initialReport: MonthlyReport;
  initialYear: number;
  initialMonth: number;
  cairoYear: number;
  cairoMonth: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [report, setReport] = useState<MonthlyReport>(initialReport);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Refetch via the JSON API whenever the picker changes. The server page
  // already rendered the initial month, so on first mount we skip the fetch.
  useEffect(() => {
    if (year === initialYear && month === initialMonth) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/personal/networth/reports/monthly?year=${year}&month=${month}`,
          { cache: 'no-store' },
        );
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(json.error ?? 'Failed to load report.');
        } else {
          setReport(json.report);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    // Also push the URL so the picker state survives a reload.
    startTransition(() => {
      router.replace(`/personal/networth/reports?year=${year}&month=${month}`, {
        scroll: false,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [year, month, initialYear, initialMonth, router]);

  // Disable the "next" arrow when we'd jump past Cairo today.
  const atFuture = year > cairoYear || (year === cairoYear && month >= cairoMonth);

  function prev() {
    if (month === 1) {
      setYear(y => y - 1);
      setMonth(12);
    } else {
      setMonth(m => m - 1);
    }
  }

  function next() {
    if (atFuture) return;
    if (month === 12) {
      setYear(y => y + 1);
      setMonth(1);
    } else {
      setMonth(m => m + 1);
    }
  }

  async function exportPdf() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch('/api/personal/networth/reports/export/pdf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ year, month }),
      });
      if (!res.ok) {
        setError('PDF export failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payment-report-${year}-${String(month).padStart(2, '0')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('PDF export failed');
    } finally {
      setExporting(false);
    }
  }

  // Top non-empty category by EGP. Tied months show the first by sort
  // order, which is fine for V1.
  const largestCategory = report.byCategory.length
    ? [...report.byCategory].sort((a, b) => b.amountEgp - a.amountEgp)[0]
    : null;

  const deltaIsUp = report.deltaEgp > 0;
  const deltaIsDown = report.deltaEgp < 0;

  return (
    <div className="space-y-5">
      {/* Month picker */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
          <button
            type="button"
            onClick={prev}
            className="p-2 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="px-3 py-1 text-sm font-medium tabular-nums text-slate-900 dark:text-slate-50 min-w-[8rem] text-center">
            {monthLabel(year, month)}
          </div>
          <button
            type="button"
            onClick={next}
            disabled={atFuture}
            className="p-2 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <button
          type="button"
          onClick={exportPdf}
          disabled={exporting}
          className="ix-btn-secondary disabled:opacity-50"
        >
          <Download size={14} />
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded px-2 py-1.5">
          {error}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Total paid"
          value={fmtEgp(report.totalEgp)}
          sub={`${report.paymentCount} payment${report.paymentCount === 1 ? '' : 's'}`}
          loading={loading}
        />
        <KpiCard
          label="Δ vs prev month"
          value={
            <span
              className={
                deltaIsUp
                  ? 'text-rose-600 dark:text-rose-400'
                  : deltaIsDown
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-900 dark:text-slate-50'
              }
            >
              <span className="inline-flex items-center gap-1">
                {deltaIsUp && <ArrowUp size={14} />}
                {deltaIsDown && <ArrowDown size={14} />}
                {fmtEgp(Math.abs(report.deltaEgp))}
              </span>
            </span>
          }
          sub={
            report.deltaPct !== null
              ? `${report.deltaPct > 0 ? '+' : ''}${report.deltaPct.toFixed(1)}%`
              : 'no prev-month baseline'
          }
          loading={loading}
        />
        <KpiCard
          label="Largest category"
          value={
            largestCategory
              ? (CATEGORY_LABEL[largestCategory.category] ?? largestCategory.category)
              : '—'
          }
          sub={largestCategory ? fmtEgp(largestCategory.amountEgp) : 'no payments'}
          loading={loading}
        />
        <KpiCard
          label="Payment count"
          value={String(report.paymentCount)}
          sub={`prev month: ${fmtEgp(report.prevMonthTotalEgp)}`}
          loading={loading}
        />
      </div>

      {/* Category breakdown table */}
      <section className="ix-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            By category
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40">
              <tr>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">Amount EGP</th>
                <th className="px-3 py-2 text-right"># payments</th>
                <th className="px-3 py-2 text-right">Δ vs prev</th>
              </tr>
            </thead>
            <tbody>
              {report.byCategory
                .slice()
                .sort((a, b) => b.amountEgp - a.amountEgp)
                .map(r => (
                  <tr
                    key={r.category}
                    className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {fmtEgp(r.amountEgp)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {r.count}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        r.deltaVsPrevEgp > 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : r.deltaVsPrevEgp < 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {r.deltaVsPrevEgp > 0 ? '+' : ''}
                      {fmtEgp(r.deltaVsPrevEgp)}
                    </td>
                  </tr>
                ))}
              {report.byCategory.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-sm text-slate-400 italic"
                  >
                    {loading ? 'Loading…' : 'No payments logged this month.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <CategoryTrendChart year={year} month={month} />
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <div className="ix-card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-50 tabular-nums">
        {loading ? <span className="text-slate-300 dark:text-slate-600">…</span> : value}
      </div>
      {sub && (
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</div>
      )}
    </div>
  );
}
