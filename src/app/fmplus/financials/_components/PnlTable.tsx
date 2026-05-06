import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import type { PnlReport, Period, PeriodValues, PnlServiceLineCost } from '@/lib/fmplus/types';
import { ExportButtons, type ExportProps } from './ExportButtons';

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
const deltaPctStr = (curr: number, prior: number): string => {
  if (!prior || prior === 0) return '—';
  return `${(((curr - prior) / Math.abs(prior)) * 100).toFixed(1)}%`;
};

export function PnlTable({ report, exportProps }: { report: PnlReport; exportProps?: ExportProps }) {
  const periods = report.periods;
  const hasMultiplePeriods = periods.length > 1;

  return (
    <div className="space-y-4">
      <NetProfitHero report={report} />
      <section className="ix-card overflow-x-auto">
        {exportProps && (
          <div className="px-4 py-2 flex justify-end border-b border-slate-100">
            <ExportButtons {...exportProps} />
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200">
              <th className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 sticky left-0 bg-slate-50 min-w-[280px]">
                Account
              </th>
              {periods.map((p, i) => (
                <PeriodHead
                  key={p.key}
                  period={p}
                  showDelta={hasMultiplePeriods && i < periods.length - 1}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            <SectionBand label="Revenue" totals={report.sections.revenue.totals} periods={periods} tone="positive" />
            {report.sections.revenue.subgroups.map(sg => (
              <SubgroupRow key={sg.key} label={sg.label} totals={sg.totals} periods={periods} revenue={report.sections.revenue.totals} />
            ))}

            <SectionBand label="Cost of Revenue" totals={report.sections.cost_of_revenue.totals} periods={periods} tone="expense" />
            {(report.sections.cost_of_revenue.serviceLines || []).map(svc => (
              <ServiceLineGroup key={svc.service} svc={svc} periods={periods} revenue={report.sections.revenue.totals} />
            ))}

            <SubtotalRow label="Gross Profit" values={report.subtotals.gross_profit} periods={periods} revenue={report.sections.revenue.totals} tone="strong" />

            <SectionBand label="General Expenses" totals={report.sections.general_expenses.totals} periods={periods} tone="expense" />
            {report.sections.general_expenses.subgroups.map(sg => (
              <SubgroupRow key={sg.key} label={sg.label} totals={sg.totals} periods={periods} revenue={report.sections.revenue.totals} />
            ))}

            <SubtotalRow label="EBITDA" values={report.subtotals.ebitda} periods={periods} revenue={report.sections.revenue.totals} tone="strong" />

            <SectionBand label="INT - TAXES - DEP" totals={report.sections.interest_tax_dep.totals} periods={periods} tone="expense" />
            {report.sections.interest_tax_dep.subgroups.map(sg => (
              <SubgroupRow key={sg.key} label={sg.label} totals={sg.totals} periods={periods} revenue={report.sections.revenue.totals} />
            ))}

            <SubtotalRow label="Net Profit" values={report.subtotals.net_profit} periods={periods} revenue={report.sections.revenue.totals} tone="hero" />
          </tbody>
        </table>
      </section>

      {report.unclassified.length > 0 && <UnclassifiedPanel leaves={report.unclassified} periods={periods} />}
    </div>
  );
}

function NetProfitHero({ report }: { report: PnlReport }) {
  const cur = report.periods[0];
  const np = report.subtotals.net_profit[cur.key] || 0;
  const rev = report.sections.revenue.totals[cur.key] || 0;
  const tone = np >= 0 ? 'text-emerald-700' : 'text-rose-700';
  return (
    <div className="ix-card p-4 flex items-center justify-between flex-wrap gap-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Net Profit · {cur.label}</p>
        <p className={`text-3xl font-bold tabular-nums ${tone}`}>{fmtSigned(np)}</p>
        <p className="text-xs text-slate-500">{pctOf(np, rev)} of revenue</p>
      </div>
      <Sparkline values={report.subtotals.net_profit} periods={report.periods.slice().reverse()} />
    </div>
  );
}

function Sparkline({ values, periods }: { values: PeriodValues; periods: Period[] }) {
  const points = periods.map(p => values[p.key] || 0);
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const W = 120, H = 32;
  const xStep = W / (points.length - 1);
  const path = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * xStep).toFixed(1)},${(H - ((v - min) / range) * H).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={W} height={H} className="text-amber-500">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

function PeriodHead({ period, showDelta }: { period: Period; showDelta: boolean }) {
  return (
    <th
      className="px-2 py-2 text-right text-xs font-semibold text-slate-700 min-w-[100px]"
      colSpan={showDelta ? 3 : 2}
    >
      <div>{period.label}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 font-normal mt-0.5">
        Bal · % {showDelta ? '· Δ' : ''}
      </div>
    </th>
  );
}

function NumCells({ values, periods, revenue }: { values: PeriodValues; periods: Period[]; revenue: PeriodValues }) {
  return (
    <>
      {periods.map((p, i) => {
        const v = values[p.key] || 0;
        const r = revenue[p.key] || 0;
        const prior = i < periods.length - 1 ? (values[periods[i + 1].key] || 0) : null;
        const showDelta = prior !== null;
        return (
          <Wrapper key={p.key}>
            <td className="px-2 py-1.5 text-right tabular-nums">{fmtSigned(v)}</td>
            <td className="px-2 py-1.5 text-right text-[11px] text-slate-500 tabular-nums">{pctOf(v, r)}</td>
            {showDelta && (
              <td className="px-2 py-1.5 text-right text-[11px] tabular-nums">{deltaPctStr(v, prior!)}</td>
            )}
          </Wrapper>
        );
      })}
    </>
  );
}

// Stupid wrapper because React expects array children to have keys; we want
// inline cells. Use a Fragment-with-key via an inline component.
function Wrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function SectionBand({ label, totals, periods, tone }: {
  label: string;
  totals: PeriodValues;
  periods: Period[];
  tone: 'positive' | 'expense';
}) {
  const bg = tone === 'positive' ? 'bg-emerald-50/60 text-emerald-800' : 'bg-slate-100 text-slate-700';
  return (
    <tr className={bg}>
      <td className="px-4 py-2 font-bold text-sm sticky left-0">{label}</td>
      <NumCells values={totals} periods={periods} revenue={totals} />
    </tr>
  );
}

function SubgroupRow({ label, totals, periods, revenue }: {
  label: string;
  totals: PeriodValues;
  periods: Period[];
  revenue: PeriodValues;
}) {
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/40">
      <td className="px-8 py-1.5 text-slate-700">{label}</td>
      <NumCells values={totals} periods={periods} revenue={revenue} />
    </tr>
  );
}

function SubtotalRow({ label, values, periods, revenue, tone }: {
  label: string;
  values: PeriodValues;
  periods: Period[];
  revenue: PeriodValues;
  tone: 'strong' | 'hero';
}) {
  const cls = tone === 'hero'
    ? 'bg-slate-900 text-white font-bold'
    : 'bg-slate-200 text-slate-900 font-bold';
  const Icon = tone === 'hero' ? null : ((values[periods[0].key] || 0) >= 0 ? TrendingUp : TrendingDown);
  return (
    <tr className={`${cls} border-t-2 border-slate-300`}>
      <td className="px-4 py-2 sticky left-0 inline-flex items-center gap-1.5">
        {Icon && <Icon size={14} />}
        {label}
      </td>
      <NumCells values={values} periods={periods} revenue={revenue} />
    </tr>
  );
}

function ServiceLineGroup({ svc, periods, revenue }: {
  svc: PnlServiceLineCost;
  periods: Period[];
  revenue: PeriodValues;
}) {
  const margin = svc.grossMarginPct[periods[0].key] || 0;
  const pillTone =
    margin >= 20 ? 'bg-emerald-100 text-emerald-700' :
    margin >=  5 ? 'bg-amber-100 text-amber-700' :
                   'bg-rose-100 text-rose-700';
  return (
    <>
      <tr className="bg-slate-50/80 border-t border-slate-200">
        <td className="px-6 py-1.5 font-semibold text-slate-800 sticky left-0">
          <span className="inline-flex items-center gap-2">
            {svc.label}
            <span className={`px-1.5 py-0.5 rounded text-[10px] tabular-nums ${pillTone}`}>{margin.toFixed(1)}% margin</span>
          </span>
        </td>
        <NumCells values={svc.totals} periods={periods} revenue={revenue} />
      </tr>
      {svc.subgroups.map(sg => (
        <tr key={sg.key} className="border-t border-slate-100 hover:bg-slate-50/40">
          <td className="px-12 py-1.5 text-slate-600 text-[12.5px]">{sg.label}</td>
          <NumCells values={sg.totals} periods={periods} revenue={revenue} />
        </tr>
      ))}
    </>
  );
}

function UnclassifiedPanel({ leaves, periods }: { leaves: PnlReport['unclassified']; periods: Period[] }) {
  const totalCurrent = leaves.reduce((s, l) => s + (l.values[periods[0].key] || 0), 0);
  return (
    <section className="ix-card p-4 bg-amber-50/30 border-amber-200 space-y-2">
      <p className="text-sm font-semibold text-amber-800 inline-flex items-center gap-1.5">
        <AlertTriangle size={14} />
        Unclassified accounts ({leaves.length}) · {fmt(totalCurrent)}
      </p>
      <div className="max-h-48 overflow-y-auto">
        <table className="w-full text-xs">
          <tbody>
            {leaves.map((l, i) => (
              <tr key={`${l.code}-${i}`} className="border-t border-amber-100">
                <td className="px-2 py-1 font-mono text-amber-800">{l.code || '—'}</td>
                <td className="px-2 py-1">{l.name}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtSigned(l.values[periods[0].key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
