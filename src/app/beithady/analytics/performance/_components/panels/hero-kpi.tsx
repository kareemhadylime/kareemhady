'use client';
import { PanelFrame } from '../panel-frame';
import { STATUS_COLORS } from '@/lib/beithady/theme';

type Delta = { direction: 'up' | 'down' | 'flat'; text: string };
type Accent = 'ink' | 'gold' | 'steel' | 'green' | 'amber' | 'red';

type Props = {
  label: string;
  value: string;
  delta?: Delta;
  /**
   * Persistent month-over-month sub-line, shown below the main delta. Renders
   * a small "▲ +X% vs last month" line with green/red coloring. Independent of
   * the compare-mode selector — this is always visible when supplied.
   */
  mom?: Delta;
  spark?: number[];
  drillTo?: string;
  accent?: Accent;
  onHide?: () => void;
};

const ACCENT_COLOR: Record<Accent, string> = {
  ink: 'var(--bh-ink)',
  gold: 'var(--bh-gold)',
  steel: 'var(--bh-steel)',
  ...STATUS_COLORS,
};

// Long values like "$555.5k" or "$1.2M" overflow at the default text-3xl size.
// Drop a step on tiles whose value string is 7+ chars so the tile keeps a
// consistent footprint across the grid.
function sizeClassFor(value: string): string {
  const len = value.length;
  if (len >= 9) return 'text-base md:text-lg lg:text-xl';
  if (len >= 7) return 'text-lg md:text-xl lg:text-2xl';
  return 'text-xl md:text-2xl lg:text-3xl';
}

export function HeroKpi({ label, value, delta, mom, spark, drillTo, accent = 'ink', onHide }: Props) {
  return (
    <PanelFrame label={label} drillTo={drillTo} onHide={onHide} accent={accent} className="min-w-[160px]">
      <div
        className={`${sizeClassFor(value)} font-bold leading-tight tabular-nums`}
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
            color: delta.direction === 'up' ? STATUS_COLORS.green : delta.direction === 'down' ? STATUS_COLORS.red : 'var(--bh-steel)',
          }}
        >
          {delta.direction === 'up' ? '▲ ' : delta.direction === 'down' ? '▼ ' : ''}
          {delta.text}
        </div>
      )}
      {mom && (
        <div
          className="mt-0.5 text-[11px] font-medium"
          style={{
            color: mom.direction === 'up' ? STATUS_COLORS.green : mom.direction === 'down' ? STATUS_COLORS.red : 'var(--bh-steel)',
          }}
          title="vs same point last month — arrow shows direction relative to that prior value"
        >
          {mom.direction === 'up' ? '▲ ' : mom.direction === 'down' ? '▼ ' : '· '}
          {mom.text}
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
