'use client';
import Link from 'next/link';
import { DivergingBars } from '../charts/diverging-bars';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { ServiceLineRow } from '@/lib/fmplus/performance/types';

export function VarianceRankingPanel({ rows }: { rows: ServiceLineRow[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('variance');
  if (!visible || rows.length === 0) return null;
  return (
    <section id="perf-variance" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Variance — Biggest Gaps" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DivergingBars
            data={rows.map(r => ({ id: String(r.service_line), name: r.service_label, variance_pct: r.variance_pct, status: r.status }))}
            onRowClick={(id) => { window.location.href = rows.find(r => String(r.service_line) === id)!.drill_url; }}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-fmplus-gold uppercase">
                <tr>
                  <th className="text-left py-1">Rank</th>
                  <th className="text-left">Service</th>
                  <th className="text-right">Variance %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.service_line} className="border-t border-slate-700/50 hover:bg-slate-800/40">
                    <td className="py-2 text-slate-500">{i + 1}</td>
                    <td className="text-slate-200">{r.service_label}</td>
                    <td className={`text-right tabular-nums ${r.status === 'bad' ? 'text-red-400' : r.status === 'warn' ? 'text-orange-400' : 'text-emerald-400'}`}>{(r.variance_pct * 100).toFixed(1)}%</td>
                    <td><Link href={r.drill_url} className="text-fmplus-gold hover:text-fmplus-yellow">→</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
