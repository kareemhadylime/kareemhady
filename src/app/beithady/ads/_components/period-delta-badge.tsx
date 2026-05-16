import { computePeriodDelta } from '@/lib/beithady/ads/period-delta';

export function PeriodDeltaBadge({
  current, prior, reverseColor,
}: {
  current: number;
  prior: number;
  reverseColor?: boolean;
}) {
  const d = computePeriodDelta(current, prior, { reverseColor });
  if (!d) return null;
  const tone =
    d.tone === 'positive' ? 'text-emerald-600 dark:text-emerald-400' :
    d.tone === 'negative' ? 'text-rose-600 dark:text-rose-400' :
    'text-slate-500 dark:text-slate-400';
  return (
    <span
      data-testid="period-delta"
      className={`inline-flex items-center gap-0.5 text-[11px] tabular-nums ${tone}`}
      title={d.pctChange == null ? 'No prior period to compare' : `Prior: ${prior.toLocaleString()}`}
    >
      {d.label}
    </span>
  );
}
