'use client';
import Link from 'next/link';
import { Dumbbell } from '../charts/dumbbell';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { ManningRow } from '@/lib/fmplus/performance/types';

export function ManningPanel({ rows }: { rows: ManningRow[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('manning');
  if (!visible || rows.length === 0) return null;
  const max = Math.max(...rows.map(r => Math.max(r.hc_required, r.hc_budgeted, r.hc_implied)), 1);
  return (
    <section id="perf-manning" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Manning — Headcount & Spend" subtitle="Required (○ grey) / Budgeted (● gold) / Implied actual (● yellow)" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Dumbbell data={rows.map(r => ({ name: r.service_label, required: r.hc_required, budgeted: r.hc_budgeted, implied: r.hc_implied }))} max={max} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-fmplus-gold uppercase">
                <tr>
                  <th className="text-left py-1">Service</th>
                  <th className="text-right">Req</th>
                  <th className="text-right">Bud</th>
                  <th className="text-right">Imp</th>
                  <th className="text-right">Δ</th>
                  <th className="text-right">Spend Var %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const delta = r.hc_implied - r.hc_budgeted;
                  return (
                    <tr key={r.service_line} className="border-t border-slate-700/50 hover:bg-slate-800/40">
                      <td className="py-2 text-slate-200">{r.service_label}</td>
                      <td className="text-right tabular-nums text-slate-400">{r.hc_required}</td>
                      <td className="text-right tabular-nums text-slate-400">{r.hc_budgeted}</td>
                      <td className="text-right tabular-nums text-fmplus-yellow font-semibold">{r.hc_implied.toFixed(1)}</td>
                      <td className={`text-right tabular-nums ${delta > 0.5 ? 'text-orange-300' : delta < -0.5 ? 'text-emerald-300' : 'text-slate-400'}`}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}</td>
                      <td className={`text-right tabular-nums ${Math.abs(r.spend_variance_pct) > 0.15 ? 'text-red-300' : Math.abs(r.spend_variance_pct) > 0.05 ? 'text-orange-300' : 'text-emerald-300'}`}>{(r.spend_variance_pct * 100).toFixed(1)}%</td>
                      <td><Link href={r.drill_url} className="text-fmplus-gold hover:text-fmplus-yellow">→</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
