// Re-export Cairo date helpers from the Beithady module — KIKA uses the
// same Cairo wall-clock semantics for daily report boundaries. Keeping a
// thin re-export instead of importing directly elsewhere lets us swap
// implementations later (e.g., Cairo→GMT for an export market) without
// rewriting every builder.

export {
  cairoYmd,
  cairoHour,
  isCairoHourGreaterOrEqual,
  addDays,
  dayDiff,
  startOfMonth,
  endOfMonth,
  daysInMonth,
  daysElapsedInMonth,
  cairoMonthContext,
  yesterday,
  reportPeriodWindow,
  reportPeriodLabel,
  monthLabel,
  reportDateLabel,
  type MonthRange,
  type ReportPeriodWindow,
} from '../beithady-daily-report/cairo-dates';

import { addDays as _addDays } from '../beithady-daily-report/cairo-dates';

/** "Sunday" / "Monday" — for the Sunday-weekly-digest gate and labels. */
export function weekdayName(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
  });
}

/** Returns true if ymd's weekday is Sunday in Cairo. KIKA's weekly digest
 *  is composed on Sundays since the data window covers Sun→Sat (Egypt's
 *  retail week). */
export function isSunday(ymd: string): boolean {
  return weekdayName(ymd) === 'Sunday';
}

/** YYYY-MM-DD of the day exactly 7 days before `ymd`. */
export function priorWeekday(ymd: string): string {
  return _addDays(ymd, -7);
}

/** YYYY-MM-DD `n` days before. */
export function daysAgo(ymd: string, n: number): string {
  return _addDays(ymd, -n);
}

/**
 * Returns the same calendar window (start..yesterday) shifted one calendar
 * month back. Used for "MTD vs same-period prior month".
 *
 * If yesterday is 26 Apr, returns { from: '2026-03-01', to: '2026-03-26' }.
 * Edge: prior-month MTD-end clamps to the last day of the prior month
 * (e.g. 31 Mar → 28 Feb when called on 31 Mar 2026).
 */
export function priorMonthSameWindow(yesterdayYmd: string): {
  from: string;
  to: string;
} {
  const [y, m, d] = yesterdayYmd.split('-').map(Number);
  const priorMonthYear = m === 1 ? y - 1 : y;
  const priorMonth = m === 1 ? 12 : m - 1;
  const lastDayOfPriorMonth = new Date(Date.UTC(priorMonthYear, priorMonth, 0)).getUTCDate();
  const clampedDay = Math.min(d, lastDayOfPriorMonth);
  const fromMonth = String(priorMonth).padStart(2, '0');
  return {
    from: `${priorMonthYear}-${fromMonth}-01`,
    to: `${priorMonthYear}-${fromMonth}-${String(clampedDay).padStart(2, '0')}`,
  };
}

/** YoY: same `ymd` shifted exactly one year. Returns null if year < 2024
 *  (data history is too short to be meaningful for KIKA's launch year). */
export function priorYearSameDay(ymd: string): string | null {
  const [y, m, d] = ymd.split('-').map(Number);
  const priorYear = y - 1;
  if (priorYear < 2024) return null;
  return `${priorYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
