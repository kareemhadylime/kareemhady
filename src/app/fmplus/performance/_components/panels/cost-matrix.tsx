'use client';
import { Grid3X3 } from 'lucide-react';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { CostMatrixBlock } from '@/lib/fmplus/performance/types';

const CATEGORY_LABELS: Record<string, string> = {
  manning: 'Manning',
  consumables: 'Consumables',
  tools: 'Tools',
  ppe: 'PPE',
  transport: 'Transport',
  it: 'IT',
  governmental: 'Governmental',
  other: 'Other',
};

function fmt(n: number) {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

function varClass(pct: number) {
  if (pct > 0.15) return 'text-red-300';
  if (pct > 0.05) return 'text-orange-300';
  return 'text-emerald-300';
}

export function CostMatrixPanel({ block }: { block: CostMatrixBlock | null }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('cost_matrix');
  if (!visible || !block || block.services.length === 0) return null;

  return (
    <section id="perf-cost-matrix" className="ix-card p-6 scroll-mt-20">
      <PanelHeader
        title={<span className="flex items-center gap-2"><Grid3X3 size={16} /> Service x Cost Bucket - Year-to-Date</span>}
        subtitle="Mirrors the Odoo Income Statement 7xN shape for one-to-one reconciliation. Each cell shows Actual / Budget with variance % below."
        collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide}
      />
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] text-fmplus-gold uppercase">
              <tr>
                <th className="text-left py-2 sticky left-0 bg-slate-900 z-10">Service</th>
                {block.categories.map(c => (
                  <th key={c} className="text-right px-2 py-2">{CATEGORY_LABELS[c] ?? c}</th>
                ))}
                <th className="text-right px-2 py-2 border-l border-slate-700">Total</th>
              </tr>
            </thead>
            <tbody>
              {block.services.map(s => (
                <tr key={s.service_line} className="border-t border-slate-700/50 hover:bg-slate-800/40">
                  <td className="py-2 text-slate-200 font-medium sticky left-0 bg-slate-900 z-10">{s.service_label}</td>
                  {block.categories.map(c => {
                    const cell = s.cells[c];
                    if (!cell) return <td key={c} className="text-right tabular-nums text-slate-600 px-2">-</td>;
                    return (
                      <td key={c} className="text-right tabular-nums px-2">
                        <div className="text-fmplus-yellow font-semibold">{fmt(cell.actual)}</div>
                        <div className="text-slate-500 text-[10px]">/ {fmt(cell.budget)}</div>
                        <div className={`text-[10px] ${varClass(cell.variance_pct)}`}>
                          {cell.variance_pct >= 0 ? '+' : ''}{(cell.variance_pct * 100).toFixed(0)}%
                        </div>
                      </td>
                    );
                  })}
                  <td className="text-right tabular-nums px-2 border-l border-slate-700">
                    <div className="text-fmplus-yellow font-semibold">{fmt(s.total_actual)}</div>
                    <div className="text-slate-500 text-[10px]">/ {fmt(s.total_budget)}</div>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-slate-600 bg-slate-800/40 font-semibold">
                <td className="py-2 text-slate-100 sticky left-0 bg-slate-800 z-10">Total</td>
                {block.categories.map(c => {
                  const t = block.total_by_category[c];
                  if (!t) return <td key={c} className="text-right tabular-nums text-slate-600 px-2">-</td>;
                  return (
                    <td key={c} className="text-right tabular-nums px-2">
                      <div className="text-fmplus-yellow">{fmt(t.actual)}</div>
                      <div className="text-slate-500 text-[10px]">/ {fmt(t.budget)}</div>
                    </td>
                  );
                })}
                <td className="text-right tabular-nums px-2 border-l border-slate-700">
                  <div className="text-fmplus-yellow">{fmt(block.grand_total.actual)}</div>
                  <div className="text-slate-500 text-[10px]">/ {fmt(block.grand_total.budget)}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
