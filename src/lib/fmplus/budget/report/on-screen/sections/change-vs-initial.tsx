import type { ReportData } from '../../types';
import { AlertTriangle } from 'lucide-react';

function fmtEGP(n: number) {
  return new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(n);
}

const SL_LABELS: Record<string, string> = {
  hk: 'HK', mep: 'MEP', landscape: 'LS', security: 'SEC',
  pest_ctrl: 'PEST', waste_mgmt: 'WASTE', back_office: 'BO',
};

const CAT_LABELS: Record<string, string> = {
  manning: 'Manning', ppe: 'PPE', tools: 'Tools', consumables: 'Consumables',
  transport: 'Transport', it: 'IT', governmental: 'Governmental', other: 'Other',
};

function severityClass(s: 'normal' | 'warn' | 'high') {
  if (s === 'high') return 'text-red-500 font-semibold';
  if (s === 'warn') return 'text-amber-500';
  return 'text-slate-900 dark:text-slate-100';
}

export function ChangeVsInitial({ data }: { data: ReportData }) {
  if (!data.change_vs_initial) return null;

  const { cells, warning } = data.change_vs_initial;

  return (
    <section className="ix-card p-5 space-y-3">
      <h2 className="text-sm font-semibold font-serif text-slate-900 dark:text-slate-100">Change vs Initial</h2>

      {warning && (
        <div className="flex items-start gap-2 p-3 border border-amber-500/30 bg-amber-500/5 rounded-lg">
          <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">{warning}</p>
        </div>
      )}

      {cells.length === 0 && !warning && (
        <p className="text-xs text-slate-400 dark:text-slate-500 italic">No changes from initial scenario.</p>
      )}

      {cells.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wide">
                <th className="pb-2 pr-3">Service</th>
                <th className="pb-2 pr-3">Category</th>
                <th className="pb-2 pr-3 text-right">Initial</th>
                <th className="pb-2 pr-3 text-right">Current</th>
                <th className="pb-2 pr-3 text-right">Delta</th>
                <th className="pb-2 text-right">Δ%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {cells.map((cell, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-3 text-slate-500 dark:text-slate-400">{SL_LABELS[cell.service_line] ?? cell.service_line}</td>
                  <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-300">{CAT_LABELS[cell.category] ?? cell.category}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-900 dark:text-slate-100">{fmtEGP(cell.initial_monthly)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-900 dark:text-slate-100">{fmtEGP(cell.current_monthly)}</td>
                  <td className={`py-1.5 pr-3 text-right tabular-nums ${severityClass(cell.severity)}`}>
                    {cell.delta_monthly >= 0 ? '+' : ''}{fmtEGP(cell.delta_monthly)}
                  </td>
                  <td className={`py-1.5 text-right tabular-nums ${severityClass(cell.severity)}`}>
                    {cell.delta_pct >= 0 ? '+' : ''}{cell.delta_pct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-[10px] text-slate-400 dark:text-slate-500 pt-1">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> &gt;5% warn</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> &gt;15% high</span>
      </div>
    </section>
  );
}
