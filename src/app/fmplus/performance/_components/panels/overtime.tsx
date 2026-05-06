'use client';
import { Sparkline } from '../charts/sparkline';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { OvertimeBlock } from '@/lib/fmplus/performance/types';

const STATUS: Record<OvertimeBlock['status'], string> = { good: 'text-emerald-400', warn: 'text-orange-400', bad: 'text-red-400' };

export function OvertimePanel({ block }: { block: OvertimeBlock | null }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('overtime');
  if (!visible || !block) return null;
  return (
    <section id="perf-overtime" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Overtime — % of Manning" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <p className="text-3xl font-bold tabular-nums text-fmplus-yellow font-serif">{(block.ot_pct_actual * 100).toFixed(1)}%</p>
            <p className={`text-sm mt-1 ${STATUS[block.status]}`}>vs budgeted {(block.ot_pct_budget * 100).toFixed(1)}% (Δ {(block.variance_pct * 100).toFixed(1)}pp)</p>
            <p className="text-xs text-slate-400 mt-1">OT spend: {(block.ot_actual / 1e3).toFixed(0)}K of {(block.manning_actual / 1e3).toFixed(0)}K manning</p>
          </div>
          <Sparkline data={block.spark} height={48} />
        </div>
      )}
    </section>
  );
}
