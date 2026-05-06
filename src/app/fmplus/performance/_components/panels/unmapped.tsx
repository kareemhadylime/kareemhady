'use client';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { UnmappedLine } from '@/lib/fmplus/performance/types';

export function UnmappedPanel({ lines, periodTotal }: { lines: UnmappedLine[]; periodTotal: number }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('unmapped');
  if (!visible || lines.length === 0) return null;
  const total = lines.reduce((a, u) => a + u.amount, 0);
  const pct = periodTotal > 0 ? (total / periodTotal) * 100 : 0;
  return (
    <section id="perf-unmapped" className="ix-card p-6 scroll-mt-20 border border-red-500/30">
      <PanelHeader
        title={<span className="flex items-center gap-2 text-red-300"><AlertTriangle size={16} /> Unmapped Expenses</span>}
        subtitle={`${(total / 1e3).toFixed(0)}K (${pct.toFixed(1)}% of period spend) · ${lines.length} lines hit the contract analytic but had no budget category`}
        collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide}
      />
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-fmplus-gold uppercase">
              <tr>
                <th className="text-left py-1">Date</th>
                <th className="text-left">Account</th>
                <th className="text-left">Vendor</th>
                <th className="text-left">Ref</th>
                <th className="text-right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.move_line_id} className="border-t border-slate-700/50 hover:bg-slate-800/40">
                  <td className="py-2 text-slate-300 tabular-nums">{l.date}</td>
                  <td className="text-slate-300">{l.account_code} · {l.account_name}</td>
                  <td className="text-slate-300">{l.partner_name ?? '—'}</td>
                  <td className="text-slate-400">{l.ref ?? '—'}</td>
                  <td className="text-right tabular-nums text-fmplus-yellow font-semibold">{(l.amount / 1e3).toFixed(1)}K</td>
                  <td><Link href={l.drill_url} className="text-fmplus-gold hover:text-fmplus-yellow">categorise →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
