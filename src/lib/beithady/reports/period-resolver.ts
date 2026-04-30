// Beithady · Generate Report · period helpers.
// Periods are operator-supplied {from, to} ranges. This module computes
// derived ranges for templates (yearly, last-N-days, this-month, etc.) and
// utilities for iso-week / month bucketing used by time-series charts.

import type { PeriodSpec } from './types';

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(
    +fromIso.slice(0, 4),
    +fromIso.slice(5, 7) - 1,
    +fromIso.slice(8, 10)
  );
  const b = Date.UTC(
    +toIso.slice(0, 4),
    +toIso.slice(5, 7) - 1,
    +toIso.slice(8, 10)
  );
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

export function monthsInRange(fromIso: string, toIso: string): number {
  return daysBetween(fromIso, toIso) / 30.4375;
}

export function rollingDays(n: number, ref?: string): PeriodSpec {
  const today = ref || todayIso();
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return {
    id: `last_${n}d`,
    label: `Last ${n} days`,
    from: d.toISOString().slice(0, 10),
    to: today,
  };
}

export function fixedYear(year: number, fromMonth = 1, toMonth = 12): PeriodSpec {
  const from = `${year}-${String(fromMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, toMonth, 0)).getUTCDate();
  const to = `${year}-${String(toMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return {
    id: `y${year}_${fromMonth}_${toMonth}`,
    label: fromMonth === 1 && toMonth === 12 ? `${year}` : `${year} (${fromMonth}-${toMonth})`,
    from,
    to,
  };
}

export function fixedMonth(year: number, month: number): PeriodSpec {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return {
    id: `m${year}_${mm}`,
    label: new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

// Time-series bucket size auto-pick: shortest range that doesn't blow past
// ~30 buckets (roughly the chart pixel-density sweet spot).
export type BucketSize = 'day' | 'week' | 'month';
export function pickBucketSize(fromIso: string, toIso: string): BucketSize {
  const days = daysBetween(fromIso, toIso);
  if (days <= 31) return 'day';
  if (days <= 180) return 'week';
  return 'month';
}

export function bucketKeyOfDate(dateIso: string, size: BucketSize): string {
  if (size === 'day') return dateIso;
  const d = new Date(dateIso + 'T00:00:00Z');
  if (size === 'week') {
    // ISO week start (Monday)
    const dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow);
    return d.toISOString().slice(0, 10);
  }
  // month
  return dateIso.slice(0, 7) + '-01';
}
