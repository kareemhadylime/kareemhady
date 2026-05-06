'use client';
import { ProgressBar } from '../charts/progress-bar';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { MobilizationRow } from '@/lib/fmplus/performance/types';

export function MobilizationPanel({ rows }: { rows: MobilizationRow[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('mobilization');
  if (!visible || rows.length === 0) return null;
  return (
    <section id="perf-mobilization" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Mobilization Amortization" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.mob_line_id} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-200">{r.label}</span>
                <span className="tabular-nums text-slate-400">{r.months_elapsed}/{r.months_total} mo · {(r.amortized / 1e3).toFixed(0)}K of {(r.total_cost / 1e3).toFixed(0)}K</span>
              </div>
              <ProgressBar pct={r.amortized / r.total_cost} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
