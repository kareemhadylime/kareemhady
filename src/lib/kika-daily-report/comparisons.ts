import type { ComparisonChip, ComparisonSet } from './types';

// Comparison math. Every numeric KPI shows three Δ chips (vs prior day,
// vs prior weekday, vs MTD same-period prior month) plus an optional YoY.
// Sign is bucketed at ±5% — anything inside is "flat" so trivial wiggles
// don't paint the report green/red.
//
// Threshold is configurable here (no UI in v1 per Q7); v2 will let admins
// override per-recipient or per-metric.

export const COMPARISON_FLAT_THRESHOLD_PCT = 5;

/**
 * Build a comparison chip from current and prior values. Returns null if
 * BOTH values are zero (no meaningful comparison). If only `prior` is
 * zero we return a chip with `pct=null` and direction='up' if current>0
 * (signal: net new activity from a zero baseline).
 */
export function compare(current: number, prior: number): ComparisonChip | null {
  if (current === 0 && prior === 0) return null;
  const abs = current - prior;
  if (prior === 0) {
    return {
      abs,
      pct: null,
      direction: current > 0 ? 'up' : current < 0 ? 'down' : 'flat',
    };
  }
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  let direction: 'up' | 'down' | 'flat' = 'flat';
  if (pct >= COMPARISON_FLAT_THRESHOLD_PCT) direction = 'up';
  else if (pct <= -COMPARISON_FLAT_THRESHOLD_PCT) direction = 'down';
  return { abs, pct, direction };
}

/**
 * Build a complete ComparisonSet for a metric given values across the four
 * comparison windows. Pass `priorYear=undefined` when YoY isn't applicable
 * (history too short).
 */
export function buildComparisonSet(values: {
  current: number;
  priorDay: number;
  priorWeekday: number;
  priorMonthMtd: number;
  priorYear?: number;
}): ComparisonSet {
  return {
    vs_prior_day: compare(values.current, values.priorDay),
    vs_prior_weekday: compare(values.current, values.priorWeekday),
    vs_mtd_prior_month: compare(values.current, values.priorMonthMtd),
    vs_prior_year:
      values.priorYear === undefined
        ? null
        : compare(values.current, values.priorYear),
  };
}

/** Pretty arrow + colored % for inline rendering. */
export function chipArrow(c: ComparisonChip | null): string {
  if (!c) return '·';
  if (c.direction === 'up') return '▲';
  if (c.direction === 'down') return '▼';
  return '—';
}

/** Format a chip as "▲ +12.3%" or "▼ -8.0%" or "— flat". */
export function chipLabel(c: ComparisonChip | null): string {
  if (!c) return '—';
  if (c.pct === null) return c.direction === 'up' ? '▲ new' : c.direction === 'down' ? '▼ to 0' : '— flat';
  const sign = c.pct > 0 ? '+' : '';
  const arrow = chipArrow(c);
  return `${arrow} ${sign}${c.pct.toFixed(1)}%`;
}
