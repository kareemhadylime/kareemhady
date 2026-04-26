// Cairo-aware date helpers. The report covers a "Cairo wall date", so all
// month/day boundaries must be computed in the Africa/Cairo timezone (DST
// observed since 2023). Storing as YYYY-MM-DD strings keeps SQL date
// comparisons against `check_in_date` (a DATE column) clean.

const CAIRO_TZ = 'Africa/Cairo';

function cairoParts(d: Date): { y: number; m: number; d: number; hour: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map(p => [p.type, p.value])
  ) as Record<string, string>;
  return {
    y: parseInt(parts.year, 10),
    m: parseInt(parts.month, 10),
    d: parseInt(parts.day, 10),
    hour: parseInt(parts.hour, 10),
  };
}

export function cairoYmd(d: Date = new Date()): string {
  const p = cairoParts(d);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

export function cairoHour(d: Date = new Date()): number {
  return cairoParts(d).hour;
}

export function isCairoHourGreaterOrEqual(threshold: number, d: Date = new Date()): boolean {
  return cairoHour(d) >= threshold;
}

/**
 * Add N days to a YYYY-MM-DD string (UTC-safe — no timezone math needed
 * for date-only addition).
 */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Difference in days between two YYYY-MM-DD strings (b - a). */
export function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / 86400_000);
}

/** YYYY-MM-DD of the first day of the Cairo month containing `ymd`. */
export function startOfMonth(ymd: string): string {
  return ymd.slice(0, 7) + '-01';
}

/** YYYY-MM-DD of the LAST day of the Cairo month containing `ymd`. */
export function endOfMonth(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  // Day 0 of next month = last day of this month
  const last = new Date(Date.UTC(y, m, 0));
  return last.toISOString().slice(0, 10);
}

/** Number of days in the Cairo month containing `ymd`. */
export function daysInMonth(ymd: string): number {
  const eom = endOfMonth(ymd);
  return parseInt(eom.split('-')[2], 10);
}

/** Days elapsed in the Cairo month INCLUDING today. (1 on Apr-1, 30 on Apr-30) */
export function daysElapsedInMonth(ymd: string): number {
  return parseInt(ymd.split('-')[2], 10);
}

export type MonthRange = {
  start: string;          // YYYY-MM-DD (inclusive)
  end: string;            // YYYY-MM-DD (inclusive, last day of month)
  days_total: number;
  days_elapsed: number;   // including today
  days_remaining: number; // from today (exclusive) → end of month
  today: string;
};

export function cairoMonthContext(today: string = cairoYmd()): MonthRange {
  const days_total = daysInMonth(today);
  const days_elapsed = daysElapsedInMonth(today);
  return {
    start: startOfMonth(today),
    end: endOfMonth(today),
    days_total,
    days_elapsed,
    days_remaining: days_total - days_elapsed,
    today,
  };
}

/** "April 2026" style label for a YYYY-MM-DD string. */
export function monthLabel(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return dt.toLocaleString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
}

/** "Sun, 26 Apr 2026" style label for a YYYY-MM-DD string. */
export function reportDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
