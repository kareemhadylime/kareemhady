'use client';
import { Gauge } from '../charts/gauge';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { ForecastBlock } from '@/lib/fmplus/performance/types';

export function ForecastPanel({ block }: { block: ForecastBlock | null }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('forecast');
  if (!visible || !block) return null;
  return (
    <section id="perf-forecast" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Forecast / Burn Rate" subtitle={block.caveat} collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
          <Gauge pct={block.variance_pct} status={block.status} label={`Year-end vs budget`} />
          <p className="text-base text-slate-200 leading-relaxed">
            At this pace, year-end actual ={' '}
            <span className="text-fmplus-yellow font-bold tabular-nums">{(block.projected_year_actual / 1e6).toFixed(2)}M</span>
            {' '}vs budget{' '}
            <span className="tabular-nums text-slate-400">{(block.budget_year / 1e6).toFixed(2)}M</span>
            {' '}({block.variance_pct >= 0 ? '+' : ''}{(block.variance_pct * 100).toFixed(1)}%).
            <br />
            <span className="text-xs text-slate-500">{block.months_elapsed} of {block.months_total} months elapsed</span>
          </p>
        </div>
      )}
    </section>
  );
}
