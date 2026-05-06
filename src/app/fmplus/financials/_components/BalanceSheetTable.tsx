import { Landmark, CheckCircle2, AlertCircle } from 'lucide-react';
import type { BalanceSheetReport, BalanceSheetGroup, Period, PeriodValues } from '@/lib/fmplus/types';
import { ExportButtons, type ExportProps } from './ExportButtons';

const fmt = (n: number | undefined): string => {
  const v = Number(n) || 0;
  return Math.abs(v) < 0.5 ? '0' : Math.round(v).toLocaleString('en-US');
};

export function BalanceSheetTable({ report, exportProps }: { report: BalanceSheetReport; exportProps?: ExportProps }) {
  const periods = report.periods;
  const cur = periods[0];
  const balanced = report.balanced[cur.key];
  const delta = report.delta[cur.key] || 0;
  return (
    <div className="space-y-4">
      <header className="ix-card p-4 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold inline-flex items-center gap-2">
            <Landmark size={18} className="text-amber-600" />
            Balance Sheet — as of {cur.label}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {balanced ? (
              <span className="text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle2 size={12} /> Balanced (delta &lt; 1 EGP)
              </span>
            ) : (
              <span className="text-amber-700 inline-flex items-center gap-1">
                <AlertCircle size={12} /> Unbalanced by {fmt(delta)}
              </span>
            )}
            · all amounts in EGP
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>Assets: <span className="text-slate-900 font-semibold tabular-nums">{fmt(report.assets.totals[cur.key])}</span></p>
          <p>Liab + Equity: <span className="text-slate-900 font-semibold tabular-nums">{fmt(report.liabPlusEquity[cur.key])}</span></p>
        </div>
      </header>

      <section className="ix-card overflow-x-auto">
        {exportProps && (
          <div className="px-4 py-2 flex justify-end border-b border-slate-100">
            <ExportButtons {...exportProps} />
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200">
              <th className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 sticky left-0 bg-slate-50 min-w-[300px]">
                Account
              </th>
              {periods.map(p => (
                <th key={p.key} className="px-3 py-2 text-right text-xs font-semibold text-slate-700 min-w-[120px]">
                  as of {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SectionBand label="ASSETS" totals={report.assets.totals} periods={periods} tone="indigo" />
            {report.assets.groups.map(g => <GroupRows key={g.key} group={g} periods={periods} />)}

            <SectionBand label="LIABILITIES" totals={report.liabilities.totals} periods={periods} tone="rose" />
            {report.liabilities.groups.map(g => <GroupRows key={g.key} group={g} periods={periods} />)}

            <SectionBand label="EQUITY" totals={report.equity.totals} periods={periods} tone="amber" />
            {report.equity.groups.map(g => <GroupRows key={g.key} group={g} periods={periods} />)}

            <tr className="bg-slate-900 text-white font-bold border-t-2 border-slate-700">
              <td className="px-4 py-2 sticky left-0">LIABILITIES + EQUITY</td>
              {periods.map(p => (
                <td key={p.key} className="px-3 py-2 text-right tabular-nums">{fmt(report.liabPlusEquity[p.key])}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

function SectionBand({ label, totals, periods, tone }: {
  label: string;
  totals: PeriodValues;
  periods: Period[];
  tone: 'indigo' | 'rose' | 'amber';
}) {
  const cls =
    tone === 'indigo' ? 'bg-indigo-50 text-indigo-800' :
    tone === 'rose'   ? 'bg-rose-50 text-rose-800'     :
                        'bg-amber-50 text-amber-800';
  return (
    <tr className={`${cls} font-bold border-t-2 border-slate-300`}>
      <td className="px-4 py-2 uppercase text-sm tracking-wide sticky left-0">{label}</td>
      {periods.map(p => (
        <td key={p.key} className="px-3 py-2 text-right tabular-nums">{fmt(totals[p.key])}</td>
      ))}
    </tr>
  );
}

function GroupRows({ group, periods }: { group: BalanceSheetGroup; periods: Period[] }) {
  return (
    <>
      <tr className="bg-slate-50/60 border-t border-slate-100">
        <td className="px-8 py-1.5 font-semibold text-slate-800 sticky left-0">
          <span className="inline-flex items-center gap-2">
            {group.label}
            {group.synthetic && (
              <span className="text-[9px] px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded uppercase tracking-wide">
                derived
              </span>
            )}
          </span>
        </td>
        {periods.map(p => (
          <td key={p.key} className="px-3 py-1.5 text-right tabular-nums">{fmt(group.totals[p.key])}</td>
        ))}
      </tr>
      {group.accounts.map((a, i) => (
        <tr
          key={`${group.key}-${a.code}-${i}`}
          className="border-t border-slate-50 text-slate-600 text-[12.5px] hover:bg-slate-50/40"
        >
          <td className="px-12 py-1">
            {a.code && <span className="font-mono text-[10px] text-slate-400 mr-2">{a.code}</span>}
            {a.name}
          </td>
          {periods.map(p => (
            <td key={p.key} className="px-3 py-1 text-right tabular-nums">{fmt(a.values[p.key])}</td>
          ))}
        </tr>
      ))}
    </>
  );
}
