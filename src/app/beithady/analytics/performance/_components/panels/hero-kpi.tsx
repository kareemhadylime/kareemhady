'use client';
import { PanelFrame } from '../panel-frame';

type Delta = { direction: 'up' | 'down' | 'flat'; text: string };
type Accent = 'ink' | 'gold' | 'steel' | 'green' | 'amber' | 'red';

type Props = {
  label: string;
  value: string;
  delta?: Delta;
  spark?: number[];
  drillTo?: string;
  accent?: Accent;
  onHide?: () => void;
};

const ACCENT_COLOR: Record<Accent, string> = {
  ink: 'var(--bh-ink)',
  gold: 'var(--bh-gold)',
  steel: 'var(--bh-steel)',
  green: '#15803d',
  amber: '#b45309',
  red: '#b91c1c',
};

export function HeroKpi({ label, value, delta, spark, drillTo, accent = 'ink', onHide }: Props) {
  return (
    <PanelFrame label={label} drillTo={drillTo} onHide={onHide} accent={accent} className="min-w-[160px]">
      <div
        className="text-xl md:text-2xl lg:text-3xl font-bold leading-tight tabular-nums"
        style={{
          color: ACCENT_COLOR[accent],
          fontFamily: 'Cormorant Garamond, Playfair Display, Georgia, serif',
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </div>
      {delta && (
        <div
          className="mt-1 text-[10px]"
          style={{
            color: delta.direction === 'up' ? '#15803d' : delta.direction === 'down' ? '#b91c1c' : 'var(--bh-steel)',
          }}
        >
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
      <polyline points={points} fill="none" stroke="var(--bh-steel)" strokeWidth="1.5" />
    </svg>
  );
}
