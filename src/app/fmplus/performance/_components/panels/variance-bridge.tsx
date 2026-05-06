'use client';
import { TrendingDown } from 'lucide-react';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { VarianceBridgeBlock, VarianceBridgeStep } from '@/lib/fmplus/performance/types';

function fmt(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${n >= 0 ? '' : '−'}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${n >= 0 ? '' : '−'}${(abs / 1e3).toFixed(0)}K`;
  return `${n >= 0 ? '' : '−'}${abs.toFixed(0)}`;
}

function stepBgClass(s: VarianceBridgeStep): string {
  if (s.is_terminal) return 'bg-slate-700/40';
  if (s.amount > 0) return 'bg-emerald-500/15';
  if (s.amount < 0) return 'bg-red-500/15';
  return 'bg-slate-700/20';
}

function stepFgClass(s: VarianceBridgeStep): string {
  if (s.is_terminal) return 'text-fmplus-yellow';
  if (s.amount > 0) return 'text-emerald-300';
  if (s.amount < 0) return 'text-red-300';
  return 'text-slate-400';
}

export function VarianceBridgePanel({ block }: { block: VarianceBridgeBlock | null }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('variance_bridge');
  if (!visible || !block || block.steps.length === 0) return null;

  // Magnitude scale for the bar widths
  const max = Math.max(1, ...block.steps.map(s => Math.abs(s.amount)));

  // Compute running total per step (waterfall semantics)
  const runningTotals: number[] = [];
  let running = 0;
  for (const s of block.steps) {
    if (s.is_terminal && s.id === 'budget_gp') {
      running = s.amount;
      runningTotals.push(running);
    } else if (s.is_terminal && s.id === 'actual_gp') {
      runningTotals.push(s.amount);    // terminal value = the actual GP itself
    } else {
      running += s.amount;
      runningTotals.push(running);
    }
  }

  return (
    <section id="perf-variance-bridge" className="ix-card p-6 scroll-mt-20">
      <PanelHeader
        title={<span className="flex items-center gap-2"><TrendingDown size={16} /> Variance Bridge — Budget GP → Actual GP</span>}
        subtitle="Each row is a signed EGP impact on Gross Profit. Green improves GP, red hurts it. Reconciliation row absorbs any double-counting between categories and penalties/VOs."
        collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide}
      />
      {!collapsed && (
        <div className="space-y-1.5 text-sm">
          {block.steps.map((s, i) => {
            const widthPct = (Math.abs(s.amount) / max) * 100;
            return (
              <div key={s.id} className={`flex items-center gap-3 px-3 py-2 rounded ${stepBgClass(s)}`}>
                <span className={`w-40 shrink-0 ${s.is_terminal ? 'font-semibold' : ''} ${s.is_terminal ? 'text-slate-100' : 'text-slate-300'}`}>
                  {s.label}
                </span>
                <div className="flex-1 flex items-center gap-2">
                  {!s.is_terminal && (
                    <div className="flex-1 h-2 bg-slate-800/40 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${s.amount > 0 ? 'bg-emerald-400' : s.amount < 0 ? 'bg-red-400' : 'bg-slate-500'}`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  )}
                  {s.is_terminal && <div className="flex-1" />}
                </div>
                <span className={`w-24 text-right tabular-nums font-semibold ${stepFgClass(s)}`}>
                  {s.amount === 0 ? '—' : fmt(s.amount)}
                </span>
                <span className="w-20 text-right tabular-nums text-slate-500 text-xs">
                  {s.is_terminal ? '' : `running ${fmt(runningTotals[i])}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
