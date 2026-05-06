'use client';
import { ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { Sparkline } from '../charts/sparkline';
import { usePanelState } from '../panel-state';
import { PanelHeader } from '../panel-header';
import type { KpiTile } from '@/lib/fmplus/performance/types';

const STATUS_BG: Record<KpiTile['status'], string> = {
  good: 'bg-emerald-500/20 text-emerald-300',
  warn: 'bg-orange-500/20 text-orange-300',
  bad:  'bg-red-500/20 text-red-300',
};

function fmt(v: number, unit: KpiTile['unit']) {
  if (unit === '%') return `${(v * 100).toFixed(1)}%`;
  if (unit === 'EGP-M') return `${(v / 1e6).toFixed(2)}M`;
  return v.toLocaleString('en-EG');
}

export function KpiStripPanel({ kpis }: { kpis: KpiTile[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('kpi');
  if (!visible) return null;
  return (
    <section id="perf-kpi" className="ix-card p-4 scroll-mt-20">
      <PanelHeader title="KPIs" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {kpis.map(k => (
            <button key={k.id} className="text-left bg-slate-900/60 rounded-lg p-3 hover:bg-slate-900/90 transition relative group">
              <ChevronRight size={14} className="absolute top-2 right-2 text-slate-600 group-hover:text-fmplus-yellow transition" />
              <p className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold">{k.label}</p>
              <p className="text-2xl font-bold tabular-nums mt-1 text-fmplus-yellow font-serif">{fmt(k.value, k.unit)}</p>
              <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold mt-1 ${STATUS_BG[k.status]}`}>
                {k.variance_pct >= 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                {(k.variance_pct * 100).toFixed(1)}%
              </span>
              <div className="mt-2"><Sparkline data={k.spark} /></div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
