'use client';
import { PanelFrame } from '../panel-frame';

type Delta = { direction: 'up' | 'down' | 'flat'; text: string };

type Props = {
  label: string;
  value: string;
  delta?: Delta;
  spark?: number[];
  drillTo?: string;
  /** Highlight as the most-important KPI with a navy left edge. */
  goldEdge?: boolean;
  onHide?: () => void;
};

export function HeroKpi({ label, value, delta, spark, drillTo, goldEdge, onHide }: Props) {
  // `goldEdge` keeps the prop name from the original API but the brand has no gold:
  // it now applies a deep-navy left edge to flag the most important hero KPI.
  return (
    <PanelFrame
      label={label}
      drillTo={drillTo}
      onHide={onHide}
      className={`min-w-[160px] ${goldEdge ? 'border-l-[3px] border-l-[#003462]' : ''}`}
    >
      <div
        className="text-xl md:text-2xl lg:text-3xl font-semibold leading-tight text-[#003462]"
        style={{ fontFamily: 'var(--bh-heading)' }}
      >
        {value}
      </div>
      {delta && (
        <div className={`mt-1 text-[10px] ${delta.direction === 'up' ? 'text-emerald-600' : delta.direction === 'down' ? 'text-red-600' : 'text-[#6077a6]'}`}>
          {delta.direction === 'up' ? '▲ ' : delta.direction === 'down' ? '▼ ' : ''}
          {delta.text}
        </div>
      )}
      {spark && spark.length > 1 && <Sparkline values={spark} />}
    </PanelFrame>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 100;
  const h = 18;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-4 w-full" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="#6077a6" strokeWidth="1.5" />
    </svg>
  );
}
