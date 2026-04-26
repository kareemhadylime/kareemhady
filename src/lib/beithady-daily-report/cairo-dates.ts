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

// v2: report run at 09:00 today should describe yesterday's full day.
// `yesterday()` returns YYYY-MM-DD for `today - 1` (Cairo).
export function yesterday(today: string = cairoYmd()): string {
  return addDays(today, -1);
}

export type ReportPeriodWindow = {
  generated_today: string;            // wall date the report was generated (today, Cairo)
  yesterday: string;                  // wall date the report DESCRIBES
  period_start_iso: string;           // ISO timestamptz, yesterday 00:00 Cairo as UTC
  period_end_iso: string;             // ISO timestamptz, yesterday 23:59:59 Cairo as UTC
  // MTD = start of (yesterday's) month → end of yesterday. Excludes the
  // generation day itself (which is partial). Matches the operational
  // expectation that the report is a snapshot of "completed days".
  mtd_start: string;                  // YYYY-MM-DD, first of yesterday's month
  mtd_end: string;                    // YYYY-MM-DD = yesterday
  mtd_days_elapsed: number;           // days from mtd_start through yesterday
  mtd_days_total: number;             // total days in yesterday's month
  mtd_days_remaining: number;         // days remaining after yesterday in month
  // Same-weekday-last-week, for SP1 vs-last-week deltas.
  prior_week_yesterday: string;       // yesterday - 7
  prior_week_mtd_end: string;         // 7 days ago = same MTD-elapsed point in prior week
  // Weekly digest (S8) — week defined Sunday → Saturday in Cairo.
  week_start: string;                 // most recent Sunday <= yesterday
  week_end: string;                   // following Saturday (or yesterday if mid-week)
  week_days_elapsed: number;          // days from week_start through yesterday
};

function cairoDayOfWeek(ymd: string): number {
  // Sunday=0..Saturday=6 in Cairo. UTC math is fine because dayOfWeek
  // doesn't shift across the timezone boundary for date-only values.
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function reportPeriodWindow(today: string = cairoYmd()): ReportPeriodWindow {
  const y = yesterday(today);
  // Cairo: UTC+2 (winter EET) or UTC+3 (summer EEST). For a "Cairo wall
  // date Y", the 24h period is [Y 00:00 Cairo, Y 23:59:59.999 Cairo).
  // We render as ISO UTC for SQL `gte/lte` comparisons against
  // timestamptz columns. We use a wide envelope (assume +2) for the
  // start, which means we may include a few minutes BEFORE Cairo
  // midnight in winter — acceptable since reservation timestamps are
  // assigned by Guesty and won't fall in that gap meaningfully.
  // For DST-correct boundaries we use `Intl.DateTimeFormat` round-trip:
  const periodStart = cairoWallToUtc(y, '00:00:00');
  const periodEnd = cairoWallToUtc(y, '23:59:59.999');

  const mtd_start = startOfMonth(y);
  const mtd_end = y;
  const mtd_days_elapsed = daysElapsedInMonth(y);
  const mtd_days_total = daysInMonth(y);

  const prior_week_yesterday = addDays(y, -7);
  const prior_week_mtd_end = addDays(y, -7);

  // Week: Sunday (0) → Saturday (6). Find most recent Sunday <= yesterday.
  const dow = cairoDayOfWeek(y); // 0..6
  const week_start = addDays(y, -dow);
  const week_end = addDays(week_start, 6);
  const week_days_elapsed = dow + 1;

  return {
    generated_today: today,
    yesterday: y,
    period_start_iso: periodStart,
    period_end_iso: periodEnd,
    mtd_start,
    mtd_end,
    mtd_days_elapsed,
    mtd_days_total,
    mtd_days_remaining: mtd_days_total - mtd_days_elapsed,
    prior_week_yesterday,
    prior_week_mtd_end,
    week_start,
    week_end,
    week_days_elapsed,
  };
}

// Convert a Cairo wall date+time to a UTC ISO string. We do this by
// constructing a Date treating the wall time as if it were UTC, then
// asking Intl what wall time that maps to in Cairo, and shifting back.
// Effectively gives us DST-correct UTC for any date.
function cairoWallToUtc(ymd: string, hms: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm, ss = '0'] = hms.split(/[:.]/);
  const naiveUtc = Date.UTC(
    y, m - 1, d,
    parseInt(hh, 10),
    parseInt(mm, 10),
    parseInt(ss, 10),
    hms.includes('.') ? parseInt(hms.split('.').pop() || '0', 10) : 0
  );
  // What does Cairo think this UTC moment is, locally?
  const cairoLocal = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(naiveUtc));
  const lookup = Object.fromEntries(cairoLocal.map(p => [p.type, p.value]));
  const cairoMs = Date.UTC(
    parseInt(lookup.year, 10),
    parseInt(lookup.month, 10) - 1,
    parseInt(lookup.day, 10),
    parseInt(lookup.hour === '24' ? '0' : lookup.hour, 10),
    parseInt(lookup.minute, 10),
    parseInt(lookup.second, 10)
  );
  // The offset Cairo applies to UTC at this instant
  const offsetMs = cairoMs - naiveUtc;
  return new Date(naiveUtc - offsetMs).toISOString();
}

/** "Sat, 25 Apr 2026" — for the report header */
export function reportPeriodLabel(yesterdayYmd: string): string {
  return reportDateLabel(yesterdayYmd);
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
