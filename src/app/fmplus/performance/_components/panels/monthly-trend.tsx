'use client';
import { Calendar } from 'lucide-react';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { MonthlyTrendBlock } from '@/lib/fmplus/performance/types';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmt(n: number) {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

function varClass(pct: number, hasActual: boolean) {
  if (!hasActual) return 'text-slate-600';
  if (pct > 0.15) return 'text-red-300';
  if (pct > 0.05) return 'text-orange-300';
  return 'text-emerald-300';
}

export function MonthlyTrendPanel({ block }: { block: MonthlyTrendBlock | null }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('monthly_trend');
  if (!visible || !block || block.rows.length === 0) return null;

  return (
    <section id="perf-monthly-trend" className="ix-card p-6 scroll-mt-20">
      <PanelHeader
        title={<span className="flex items-center gap-2"><Calendar size={16} /> Monthly Trend - Y{block.year_index}{block.fiscal_year ? ` (FY${block.fiscal_year})` : ''}</span>}
        subtitle="Actual cost per service line per month. Coloured by variance vs uniform monthly budget. Right-most column is YTD."
        collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide}
      />
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] text-fmplus-gold uppercase">
              <tr>
                <th className="text-left py-2 sticky left-0 bg-slate-900 z-10">Service</th>
                <th className="text-right px-2 py-2">Mo Bud</th>
                {MONTH_NAMES.map(m => (
                  <th key={m} className="text-right px-2 py-2">{m}</th>
                ))}
                <th className="text-right px-2 py-2 border-l border-slate-700">YTD Act</th>
                <th className="text-right px-2 py-2">YTD Bud</th>
              </tr>
            </thead>
            <tbody>
              {block.rows.map(r => (
                <tr key={r.service_line} className="border-t border-slate-700/50 hover:bg-slate-800/40">
                  <td className="py-2 text-slate-200 font-medium sticky left-0 bg-slate-900 z-10">{r.service_label}</td>
                  <td className="text-right tabular-nums text-slate-400 px-2">{fmt(r.monthly_budget)}</td>
                  {r.months.map(m => {
                    const hasActual = m.actual !== 0;
                    return (
                      <td key={m.month} className={`text-right tabular-nums px-2 ${varClass(m.variance_pct, hasActual)}`}>
                        {hasActual ? fmt(m.actual) : '-'}
                      </td>
                    );
                  })}
                  <td className="text-right tabular-nums text-fmplus-yellow font-semibold px-2 border-l border-slate-700">{fmt(r.ytd_actual)}</td>
                  <td className="text-right tabular-nums text-slate-400 px-2">{fmt(r.ytd_budget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
