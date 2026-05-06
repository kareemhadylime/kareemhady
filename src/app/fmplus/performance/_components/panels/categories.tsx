'use client';
import Link from 'next/link';
import { Donut } from '../charts/donut';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { CategoryRow, UnmappedLine } from '@/lib/fmplus/performance/types';

export function CategoriesPanel({ rows, unmapped }: { rows: CategoryRow[]; unmapped: UnmappedLine[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('categories');
  if (!visible || rows.length === 0) return null;
  const unmappedTotal = unmapped.reduce((a, u) => a + u.amount, 0);
  return (
    <section id="perf-categories" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Expense Category Mix" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Donut
            data={rows.map(r => ({ id: r.category, name: r.category_label, value: r.actual }))}
            onSliceClick={(id) => { window.location.href = rows.find(r => r.category === id)!.drill_url; }}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-fmplus-gold uppercase">
                <tr>
                  <th className="text-left py-1 px-2">Category</th>
                  <th className="text-right px-2">Budget</th>
                  <th className="text-right px-2">Actual</th>
                  <th className="text-right px-2">Prev Mo</th>
                  <th className="text-right px-2">Var %</th>
                  <th className="text-right px-2">Bud %Rev</th>
                  <th className="text-right px-2">Act %Rev</th>
                  <th className="text-right px-2">Δ bps</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.category} className="border-t border-slate-700/50 hover:bg-slate-800/40">
                    <td className="py-2 px-2 text-slate-200">{r.category_label}</td>
                    <td className="text-right px-2 tabular-nums text-slate-400">{(r.budget / 1e3).toFixed(0)}K</td>
                    <td className="text-right px-2 tabular-nums text-fmplus-yellow font-semibold">{(r.actual / 1e3).toFixed(0)}K</td>
                    <td className="text-right px-2 tabular-nums text-slate-400">
                      {r.prior_month_actual === null ? '—' : `${(r.prior_month_actual / 1e3).toFixed(0)}K`}
                    </td>
                    <td className="text-right px-2 tabular-nums text-slate-300">{(r.variance_pct * 100).toFixed(1)}%</td>
                    <td className="text-right px-2 tabular-nums text-slate-300">{(r.pct_of_revenue_budget * 100).toFixed(1)}%</td>
                    <td className="text-right px-2 tabular-nums text-slate-300">{(r.pct_of_revenue_actual * 100).toFixed(1)}%</td>
                    <td className={`text-right px-2 tabular-nums ${r.delta_bps > 100 ? 'text-red-300' : r.delta_bps < -100 ? 'text-emerald-300' : 'text-slate-300'}`}>
                      {r.delta_bps >= 0 ? '+' : ''}{r.delta_bps.toFixed(0)}
                    </td>
                    <td><Link href={r.drill_url} className="text-fmplus-gold hover:text-fmplus-yellow">→</Link></td>
                  </tr>
                ))}
                {unmappedTotal > 0 && (
                  <tr className="border-t border-red-500/40 bg-red-500/5">
                    <td className="py-2 px-2 text-red-300 font-semibold">⚠ Unmapped</td>
                    <td className="text-right px-2 tabular-nums text-slate-500">—</td>
                    <td className="text-right px-2 tabular-nums text-red-300 font-semibold">{(unmappedTotal / 1e3).toFixed(0)}K</td>
                    <td className="text-right px-2 tabular-nums text-slate-500">—</td>
                    <td className="text-right px-2 tabular-nums text-slate-500">—</td>
                    <td className="text-right px-2 tabular-nums text-slate-500">—</td>
                    <td className="text-right px-2 tabular-nums text-slate-500">—</td>
                    <td className="text-right px-2 tabular-nums text-slate-500">—</td>
                    <td><Link href="#perf-unmapped" className="text-red-300 hover:text-red-200">review →</Link></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
