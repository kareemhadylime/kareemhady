'use client';
import { PanelFrame } from '@/app/beithady/analytics/performance/_components/panel-frame';
import type { PaceKpi, PaceKpiMetric, PaceDateRange } from '@/lib/pace-report/types';

const METRIC_LABEL: Record<PaceKpiMetric, string> = {
  revenue: 'Revenue',
  booked_days: 'Booked Days',
  occupancy_pct: 'Occupancy',
  anr: 'ANR',
};

function fmtValue(metric: PaceKpiMetric, n: number): string {
  switch (metric) {
    case 'revenue':       return n >= 1000 ? `$${(n / 1000).toFixed(2)}k` : `$${n.toFixed(0)}`;
    case 'booked_days':   return n.toFixed(0);
    case 'occupancy_pct': return `${n.toFixed(0)}%`;
    case 'anr':           return `$${n.toFixed(2)}`;
  }
}

type Props = {
  kpis: PaceKpi[];
  range: PaceDateRange;
  priorRange: PaceDateRange;
};

/** 4 side-by-side bar charts: Last Year (light navy) vs Selected Period (deep navy). */
export function PaceKpiStrip({ kpis, range, priorRange }: Props) {
  return (
    <div className="col-span-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <PanelFrame
          key={kpi.metric}
          label={`${METRIC_LABEL[kpi.metric]} · ${priorRange.label} vs ${range.label}`}
        >
          <KpiBars kpi={kpi} />
        </PanelFrame>
      ))}
    </div>
  );
}

function KpiBars({ kpi }: { kpi: PaceKpi }) {
  const max = Math.max(kpi.current_value, kpi.prior_value, 1);
  const curHeight = (kpi.current_value / max) * 100;
  const priHeight = (kpi.prior_value / max) * 100;
  const deltaIsUp = kpi.delta_pct != null && kpi.delta_pct >= 0;
  return (
    <div>
      <div className="flex items-end justify-center gap-4 h-[120px]">
        <BarColumn label="Prior" heightPct={priHeight} fill="#a8b6d4" value={fmtValue(kpi.metric, kpi.prior_value)} />
        <BarColumn label="Selected" heightPct={curHeight} fill="#003462" value={fmtValue(kpi.metric, kpi.current_value)} />
      </div>
      {kpi.delta_pct != null && (
        <div className={`mt-2 text-center text-[11px] font-semibold ${deltaIsUp ? 'text-emerald-700' : 'text-red-700'}`}>
          {deltaIsUp ? '▲ ' : '▼ '}{Math.abs(kpi.delta_pct).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function BarColumn({ label, heightPct, fill, value }: { label: string; heightPct: number; fill: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-[#003462] font-semibold tabular-nums" style={{ fontFamily: 'var(--bh-heading)' }}>{value}</span>
      <div className="relative w-10 bg-[#003462]/5 rounded-sm" style={{ height: 100 }}>
        <div
          className="absolute bottom-0 left-0 right-0 rounded-sm transition-[height] duration-300 motion-reduce:transition-none"
          style={{ height: `${heightPct}%`, backgroundColor: fill }}
        />
      </div>
      <span className="text-[9px] uppercase tracking-wide text-[#6077a6]">{label}</span>
    </div>
  );
}
