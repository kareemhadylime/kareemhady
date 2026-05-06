'use client';
import Link from 'next/link';
import { Dumbbell } from '../charts/dumbbell';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { ManningRow } from '@/lib/fmplus/performance/types';

export function ManningPanel({ rows }: { rows: ManningRow[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('manning');
  if (!visible || rows.length === 0) return null;
  // Headcount is a person count — render as whole integers. Rounding happens
  // in the view layer; the upstream `hc_implied` is a fractional person-year.
  const display = rows.map(r => ({
    ...r,
    req: Math.round(r.hc_required),
    bud: Math.round(r.hc_budgeted),
    imp: Math.round(r.hc_implied),
  }));
  const max = Math.max(...display.map(r => Math.max(r.req, r.bud, r.imp)), 1);
  return (
    <section id="perf-manning" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Manning — Headcount & Spend" subtitle="Required (○ grey) / Budgeted (● gold) / Implied actual (● yellow)" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Dumbbell data={display.map(r => ({ name: r.service_label, required: r.req, budgeted: r.bud, implied: r.imp }))} max={max} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-fmplus-gold uppercase">
                <tr>
                  <th className="text-left py-1 px-2">Service</th>
                  <th className="text-right px-2">Req</th>
                  <th className="text-right px-2">Bud</th>
                  <th className="text-right px-2">Imp</th>
                  <th className="text-right px-2">Δ</th>
                  <th className="text-right px-2">Spend Var %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {display.map(r => {
                  const delta = r.imp - r.bud;
                  return (
                    <tr key={r.service_line} className="border-t border-slate-700/50 hover:bg-slate-800/40">
                      <td className="py-2 px-2 text-slate-200">{r.service_label}</td>
                      <td className="text-right px-2 tabular-nums text-slate-400">{r.req}</td>
                      <td className="text-right px-2 tabular-nums text-slate-400">{r.bud}</td>
                      <td className="text-right px-2 tabular-nums text-fmplus-yellow font-semibold">{r.imp}</td>
                      <td className={`text-right px-2 tabular-nums ${delta > 0 ? 'text-orange-300' : delta < 0 ? 'text-emerald-300' : 'text-slate-400'}`}>{delta > 0 ? '+' : ''}{delta}</td>
                      <td className={`text-right px-2 tabular-nums ${Math.abs(r.spend_variance_pct) > 0.15 ? 'text-red-300' : Math.abs(r.spend_variance_pct) > 0.05 ? 'text-orange-300' : 'text-emerald-300'}`}>{(r.spend_variance_pct * 100).toFixed(1)}%</td>
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
