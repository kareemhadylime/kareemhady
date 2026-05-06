import { TrendingUp, TrendingDown } from 'lucide-react';
import type { PnlReport } from '@/lib/fmplus/types';

// Side-by-side compare view of N P&L reports (one per selected analytic
// account, max 5). Renders the SAME row hierarchy as PnlTable but with
// columns being projects instead of periods. A "Total" column on the right
// sums across all selected projects.
//
// Each report MUST be built with periods=[singlePeriod] (period count
// forced to 1 by page.tsx when multi-select is active). The first
// report's period is used as the column-header label.

export type ComparePnlEntry = {
  account_id: number;
  account_name: string;
  report: PnlReport;
};

const fmt = (n: number | undefined): string => {
  const v = Number(n) || 0;
  return Math.abs(v) < 0.5 ? '0' : Math.round(v).toLocaleString('en-US');
};
const fmtSigned = (n: number | undefined): string => {
  const v = Number(n) || 0;
  if (v === 0) return '0';
  return Math.round(v).toLocaleString('en-US');
};
const pctOf = (num: number, denom: number): string =>
  !denom || denom === 0 ? '—' : `${((num / denom) * 100).toFixed(1)}%`;

// Helpers that pull a single-period value from a report by section/key.
function sectionTotal(r: PnlReport, section: 'revenue' | 'cost_of_revenue' | 'general_expenses' | 'interest_tax_dep'): number {
  const periodKey = r.periods[0]?.key;
  if (!periodKey) return 0;
  return r.sections[section].totals[periodKey] || 0;
}
function subtotalValue(r: PnlReport, key: 'gross_profit' | 'ebitda' | 'net_profit'): number {
  const periodKey = r.periods[0]?.key;
  if (!periodKey) return 0;
  return r.subtotals[key][periodKey] || 0;
}

export function ComparePnlTable({ entries }: { entries: ComparePnlEntry[] }) {
  if (entries.length === 0) {
    return (
      <section className="ix-card p-10 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400 italic">
          Select 2 or more projects in the picker above to compare side-by-side.
        </p>
      </section>
    );
  }
  const periodLabel = entries[0].report.periods[0]?.label ?? '';

  // Compute per-column section totals + a final "Total" column summing all.
  const cols = entries.map(e => ({
    account_id: e.account_id,
    account_name: e.account_name,
    revenue:     sectionTotal(e.report, 'revenue'),
    cogs:        sectionTotal(e.report, 'cost_of_revenue'),
    ge:          sectionTotal(e.report, 'general_expenses'),
    itd:         sectionTotal(e.report, 'interest_tax_dep'),
    grossProfit: subtotalValue(e.report, 'gross_profit'),
    ebitda:      subtotalValue(e.report, 'ebitda'),
    netProfit:   subtotalValue(e.report, 'net_profit'),
  }));
  const sum = (key: keyof typeof cols[number]) =>
    cols.reduce((s, c) => s + (typeof c[key] === 'number' ? (c[key] as number) : 0), 0);
  const total = {
    revenue: sum('revenue'),
    cogs: sum('cogs'),
    ge: sum('ge'),
    itd: sum('itd'),
    grossProfit: sum('grossProfit'),
    ebitda: sum('ebitda'),
    netProfit: sum('netProfit'),
  };

  return (
    <section className="ix-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr className="border-b border-slate-200 dark:border-slate-700">
            <th className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400 sticky left-0 bg-slate-50 dark:bg-slate-800/60 min-w-[180px]">
              <div>Account</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400 font-normal mt-0.5">
                {periodLabel}
              </div>
            </th>
            {cols.map(c => (
              <th
                key={c.account_id}
                className="px-3 py-2.5 text-right font-semibold text-xs text-slate-700 dark:text-slate-200 min-w-[120px] max-w-[160px]"
                title={c.account_name}
              >
                <div className="truncate">{c.account_name}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400 font-normal mt-0.5">Bal · %</div>
              </th>
            ))}
            <th className="px-3 py-2.5 text-right font-semibold text-xs text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-700/50 min-w-[120px] border-l border-slate-200 dark:border-slate-700">
              <div>TOTAL</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-normal mt-0.5">Bal · %</div>
            </th>
          </tr>
        </thead>
        <tbody>
          <SectionBand label="Revenue"          tone="positive" cols={cols} accessor={c => c.revenue}     totalVal={total.revenue} />
          <SectionBand label="Cost of Revenue"  tone="expense"  cols={cols} accessor={c => c.cogs}        totalVal={total.cogs} />
          <SubtotalRow label="Gross Profit"     cols={cols} accessor={c => c.grossProfit} totalVal={total.grossProfit} revenueByCol={cols.map(c => c.revenue)} totalRevenue={total.revenue} tone="strong" />
          <SectionBand label="General Expenses" tone="expense"  cols={cols} accessor={c => c.ge}          totalVal={total.ge} />
          <SubtotalRow label="EBITDA"           cols={cols} accessor={c => c.ebitda}      totalVal={total.ebitda}      revenueByCol={cols.map(c => c.revenue)} totalRevenue={total.revenue} tone="strong" />
          <SectionBand label="INT - TAXES - DEP" tone="expense" cols={cols} accessor={c => c.itd}         totalVal={total.itd} />
          <SubtotalRow label="Net Profit"       cols={cols} accessor={c => c.netProfit}   totalVal={total.netProfit}   revenueByCol={cols.map(c => c.revenue)} totalRevenue={total.revenue} tone="hero" />
        </tbody>
      </table>
    </section>
  );
}

type Col = {
  account_id: number;
  account_name: string;
  revenue: number;
  cogs: number;
  ge: number;
  itd: number;
  grossProfit: number;
  ebitda: number;
  netProfit: number;
};

function SectionBand({
  label, tone, cols, accessor, totalVal,
}: {
  label: string;
  tone: 'positive' | 'expense';
  cols: Col[];
  accessor: (c: Col) => number;
  totalVal: number;
}) {
  const bg = tone === 'positive'
    ? 'bg-emerald-50/60 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
    : 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200';
  // Section bands divide by themselves for the % column (100% baseline)
  return (
    <tr className={bg}>
      <td className="px-4 py-2 font-bold text-sm sticky left-0">{label}</td>
      {cols.map(c => {
        const v = accessor(c);
        return (
          <td key={c.account_id} className="px-3 py-2 text-right tabular-nums font-medium">
            {fmtSigned(v)}
          </td>
        );
      })}
      <td className="px-3 py-2 text-right tabular-nums font-bold bg-slate-100 dark:bg-slate-700/50 border-l border-slate-200 dark:border-slate-700">
        {fmtSigned(totalVal)}
      </td>
    </tr>
  );
}

function SubtotalRow({
  label, cols, accessor, totalVal, revenueByCol, totalRevenue, tone,
}: {
  label: string;
  cols: Col[];
  accessor: (c: Col) => number;
  totalVal: number;
  revenueByCol: number[];
  totalRevenue: number;
  tone: 'strong' | 'hero';
}) {
  const cls = tone === 'hero'
    ? 'bg-slate-900 text-white font-bold dark:bg-slate-100 dark:text-slate-900'
    : 'bg-slate-200 text-slate-900 font-bold dark:bg-slate-700 dark:text-slate-100';
  const Icon = tone === 'hero' ? null : (totalVal >= 0 ? TrendingUp : TrendingDown);

  return (
    <tr className={`${cls} border-t-2 border-slate-300 dark:border-slate-600`}>
      <td className="px-4 py-2 sticky left-0">
        <span className="inline-flex items-center gap-1.5">
          {Icon && <Icon size={14} />}
          {label}
        </span>
      </td>
      {cols.map((c, i) => {
        const v = accessor(c);
        const rev = revenueByCol[i] || 0;
        return (
          <td key={c.account_id} className="px-3 py-2 text-right tabular-nums">
            {fmt(v)}
            <span className="text-[10px] opacity-70 ml-1.5">{pctOf(v, rev)}</span>
          </td>
        );
      })}
      <td className={`px-3 py-2 text-right tabular-nums font-bold border-l ${
        tone === 'hero' ? 'border-slate-700 dark:border-slate-300' : 'border-slate-300 dark:border-slate-600'
      }`}>
        {fmt(totalVal)}
        <span className="text-[10px] opacity-70 ml-1.5">{pctOf(totalVal, totalRevenue)}</span>
      </td>
    </tr>
  );
}
