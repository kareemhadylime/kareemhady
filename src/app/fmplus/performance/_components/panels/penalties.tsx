'use client';
import { AlertTriangle } from 'lucide-react';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { PenaltiesBlock } from '@/lib/fmplus/performance/types';

function fmtEgp(n: number) {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

export function PenaltiesPanel({ block }: { block: PenaltiesBlock | null }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('penalties');
  if (!visible || !block || block.rows.length === 0) return null;

  // Group rows by service for the summary table
  const byService: Record<string, { service_label: string; shortage: number; kpi: number; other: number; lines: number }> = {};
  for (const r of block.rows) {
    const k = r.service_code;
    if (!byService[k]) byService[k] = { service_label: r.service_label, shortage: 0, kpi: 0, other: 0, lines: 0 };
    if (r.penalty_type === 'shortage') byService[k].shortage += r.amount;
    else if (r.penalty_type === 'kpi') byService[k].kpi += r.amount;
    else byService[k].other += r.amount;
    byService[k].lines += r.lines;
  }
  const services = Object.entries(byService);

  return (
    <section id="perf-penalties" className="ix-card p-6 scroll-mt-20 border border-orange-500/30">
      <PanelHeader
        title={<span className="flex items-center gap-2 text-orange-300"><AlertTriangle size={16} /> Penalties / SLA Deductions</span>}
        subtitle={`${fmtEgp(block.total_amount)} EGP across ${block.total_lines} line${block.total_lines === 1 ? '' : 's'} — Shortage + KPI penalties booked as direct cost`}
        collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide}
      />
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-fmplus-gold uppercase">
              <tr>
                <th className="text-left py-1">Service</th>
                <th className="text-right">Shortage</th>
                <th className="text-right">KPI</th>
                <th className="text-right">Other</th>
                <th className="text-right">Total</th>
                <th className="text-right">Lines</th>
              </tr>
            </thead>
            <tbody>
              {services.map(([code, r]) => {
                const total = r.shortage + r.kpi + r.other;
                return (
                  <tr key={code} className="border-t border-slate-700/50 hover:bg-slate-800/40">
                    <td className="py-2 text-slate-200">{r.service_label}</td>
                    <td className="text-right tabular-nums text-slate-300">{fmtEgp(r.shortage)}</td>
                    <td className="text-right tabular-nums text-slate-300">{fmtEgp(r.kpi)}</td>
                    <td className="text-right tabular-nums text-slate-400">{fmtEgp(r.other)}</td>
                    <td className="text-right tabular-nums text-orange-300 font-semibold">{fmtEgp(total)}</td>
                    <td className="text-right tabular-nums text-slate-400">{r.lines}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
