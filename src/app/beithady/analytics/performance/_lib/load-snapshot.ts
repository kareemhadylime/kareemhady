import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { cairoYmd } from '@/lib/beithady-daily-report/cairo-dates';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateParam(input: string | undefined): string | null {
  if (!input || !YMD.test(input)) return null;
  const [y, m, d] = input.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return input;
}

export type SnapshotResult =
  | { status: 'found'; date: string; payload: DailyReportPayload; generatedAt: string }
  | { status: 'missing'; date: string };

/**
 * Date math used by the "Compare" rail pill. All inputs are 'YYYY-MM-DD'.
 *  - yesterday: date - 1 day
 *  - last-week: date - 7 days
 *  - last-month: same calendar day, previous month (clamped to month length)
 *  - last-year:  same calendar day, previous year
 *  - none:       null (no compare)
 */
export function computePriorDate(date: string, compare: string | undefined): string | null {
  if (!YMD.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  switch (compare) {
    case 'yesterday': {
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 1);
      return dt.toISOString().slice(0, 10);
    }
    case 'last-week': {
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 7);
      return dt.toISOString().slice(0, 10);
    }
    case 'last-month': {
      // Same day-of-month previous month. JavaScript Date auto-clamps,
      // e.g. 2026-03-31 - 1 month = 2026-03-03 (because Feb has 28 days).
      // Manually clamp instead so 2026-03-31 → 2026-02-28.
      const targetMonth0 = m - 2; // 0-indexed prior month
      const prevYear = targetMonth0 < 0 ? y - 1 : y;
      const prevMonth0 = ((targetMonth0 % 12) + 12) % 12;
      const lastDay = new Date(Date.UTC(prevYear, prevMonth0 + 1, 0)).getUTCDate();
      const targetDay = Math.min(d, lastDay);
      const dt = new Date(Date.UTC(prevYear, prevMonth0, targetDay));
      return dt.toISOString().slice(0, 10);
    }
    case 'last-year': {
      // Feb 29 → Feb 28 fallback for non-leap prior year
      const lastDay = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
      const dt = new Date(Date.UTC(y - 1, m - 1, Math.min(d, lastDay)));
      return dt.toISOString().slice(0, 10);
    }
    default:
      return null;
  }
}

/**
 * Returns the earliest report_date present in `daily_report_snapshots`,
 * or null if the table is empty / errors. Used by the snapshot scrubber.
 */
export async function loadEarliestSnapshotDate(): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('daily_report_snapshots')
      .select('report_date')
      .eq('report_kind', 'beithady_daily')
      .order('report_date', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data.report_date as string;
  } catch (err) {
    console.warn('[load-earliest-snapshot]', err);
    return null;
  }
}

/**
 * Returns the latest report_date present in `daily_report_snapshots`,
 * or null if the table is empty / errors. Used to bound the date stepper.
 */
export async function loadLatestSnapshotDate(): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('daily_report_snapshots')
      .select('report_date')
      .eq('report_kind', 'beithady_daily')
      .order('report_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data.report_date as string;
  } catch (err) {
    console.warn('[load-latest-snapshot-date]', err);
    return null;
  }
}

/**
 * A payload is considered well-formed enough to render the dashboard if it has
 * its `all` bucket. Some cron retries write malformed rows where most top-level
 * fields are null; the dashboard previously crashed on these. We now skip them.
 */
function isPayloadWellFormed(payload: unknown): payload is DailyReportPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Partial<DailyReportPayload>;
  return Boolean(p.all && p.reviews && p.per_building);
}

export async function loadSnapshot(dateParam: string | undefined): Promise<SnapshotResult> {
  // No explicit date → fall back to the latest available well-formed snapshot
  // (cron runs at 09:00 Cairo daily, so visiting the dashboard before 09:00
  // would otherwise hit "No snapshot for <today>"). When a date IS specified
  // we honor it strictly — that's the snapshot scrubber path.
  if (!parseDateParam(dateParam)) {
    return loadLatestSnapshot();
  }
  const date = parseDateParam(dateParam) as string;

  try {
    // Fetch up to 5 most-recent snapshots for this date. The cron occasionally
    // writes malformed retry rows seconds after a good build; we pick the most
    // recent WELL-FORMED one rather than blindly the most recent.
    const { data, error } = await supabaseAdmin()
      .from('daily_report_snapshots')
      .select('payload, generated_at')
      .eq('report_kind', 'beithady_daily')
      .eq('report_date', date)
      .order('generated_at', { ascending: false })
      .limit(5);

    if (error) {
      console.warn('[load-snapshot] supabase error', error.message);
      return { status: 'missing', date };
    }
    if (!data || data.length === 0) return { status: 'missing', date };

    for (const row of data) {
      if (isPayloadWellFormed(row.payload)) {
        return {
          status: 'found',
          date,
          payload: row.payload,
          generatedAt: row.generated_at as string,
        };
      }
    }
    // All recent rows were malformed — surface as missing so EmptySnapshot renders
    return { status: 'missing', date };
  } catch (err) {
    console.warn('[load-snapshot] exception', err);
    return { status: 'missing', date };
  }
}

/**
 * Adds N days to a YYYY-MM-DD string in UTC. Returns the result as YMD.
 */
function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

/**
 * Signed day delta between two YMD strings. Positive = a is later than b.
 */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = Date.UTC(ay, (am ?? 1) - 1, ad ?? 1);
  const db = Date.UTC(by, (bm ?? 1) - 1, bd ?? 1);
  return Math.round((da - db) / 86_400_000);
}

export type NearestSnapshotResult =
  | {
      status: 'found';
      /** Actual report_date returned (may differ from the target). */
      date: string;
      payload: DailyReportPayload;
      generatedAt: string;
      /** Target − actual, in days. 0 means exact match. Negative = actual is BEFORE target. */
      offsetDays: number;
      /** The original target date the caller asked for. */
      targetDate: string;
    }
  | { status: 'missing'; targetDate: string; windowDays: number };

/**
 * Find the nearest well-formed snapshot within ±windowDays of the target
 * date. Used by the Compare feature so a target date with a NULL/malformed
 * payload (a known cron-gap pattern) still surfaces a useful comparison
 * anchor — we just shift to the closest valid neighbor and tell the user.
 *
 * Tie-break: prefer EARLIER neighbors over later ones, because the user's
 * intent for "vs last week" is a comparison anchor approximately a week
 * ago — a slightly older fallback is more on-target than a slightly newer
 * one.
 */
export async function loadNearestSnapshot(
  targetDate: string,
  windowDays = 3,
): Promise<NearestSnapshotResult> {
  const target = parseDateParam(targetDate);
  if (!target) return { status: 'missing', targetDate, windowDays };
  const lower = shiftYmd(target, -windowDays);
  const upper = shiftYmd(target, +windowDays);

  try {
    const { data, error } = await supabaseAdmin()
      .from('daily_report_snapshots')
      .select('report_date, payload, generated_at')
      .eq('report_kind', 'beithady_daily')
      .gte('report_date', lower)
      .lte('report_date', upper)
      .order('report_date', { ascending: true })
      .order('generated_at', { ascending: false });

    if (error) {
      console.warn('[load-nearest-snapshot] supabase error', error.message);
      return { status: 'missing', targetDate: target, windowDays };
    }
    if (!data || data.length === 0) {
      return { status: 'missing', targetDate: target, windowDays };
    }

    // Per date, keep only the most recently-generated WELL-FORMED row.
    const byDate = new Map<string, { payload: DailyReportPayload; generatedAt: string }>();
    for (const row of data) {
      const date = row.report_date as string;
      if (byDate.has(date)) continue; // already have the most-recent for this date
      if (!isPayloadWellFormed(row.payload)) continue;
      byDate.set(date, {
        payload: row.payload,
        generatedAt: row.generated_at as string,
      });
    }
    if (byDate.size === 0) {
      return { status: 'missing', targetDate: target, windowDays };
    }

    // Pick the nearest by abs day delta. Tie-break: prefer earlier (delta < 0).
    let best:
      | { date: string; offsetDays: number; payload: DailyReportPayload; generatedAt: string }
      | null = null;
    for (const [date, row] of byDate) {
      const offsetDays = daysBetween(target, date); // target − date
      const abs = Math.abs(offsetDays);
      if (
        !best ||
        abs < Math.abs(best.offsetDays) ||
        (abs === Math.abs(best.offsetDays) && offsetDays > best.offsetDays)
        // offsetDays > best.offsetDays means `date` is EARLIER than the
        // current best (target−date is bigger when date is older). Prefer
        // earlier on ties.
      ) {
        best = { date, offsetDays, ...row };
      }
    }
    if (!best) return { status: 'missing', targetDate: target, windowDays };

    return {
      status: 'found',
      date: best.date,
      payload: best.payload,
      generatedAt: best.generatedAt,
      offsetDays: best.offsetDays,
      targetDate: target,
    };
  } catch (err) {
    console.warn('[load-nearest-snapshot] exception', err);
    return { status: 'missing', targetDate: target, windowDays };
  }
}

/**
 * Returns the most recent well-formed snapshot of any date. Used as the
 * default landing experience so the dashboard never hits "No snapshot for
 * <today>" when the daily cron hasn't fired yet.
 */
export async function loadLatestSnapshot(): Promise<SnapshotResult> {
  const fallbackDate = cairoYmd();
  try {
    const { data, error } = await supabaseAdmin()
      .from('daily_report_snapshots')
      .select('report_date, payload, generated_at')
      .eq('report_kind', 'beithady_daily')
      .order('report_date', { ascending: false })
      .order('generated_at', { ascending: false })
      .limit(10);

    if (error) {
      console.warn('[load-latest-snapshot] supabase error', error.message);
      return { status: 'missing', date: fallbackDate };
    }
    if (!data || data.length === 0) return { status: 'missing', date: fallbackDate };

    for (const row of data) {
      if (isPayloadWellFormed(row.payload)) {
        return {
          status: 'found',
          date: row.report_date as string,
          payload: row.payload,
          generatedAt: row.generated_at as string,
        };
      }
    }
    return { status: 'missing', date: fallbackDate };
  } catch (err) {
    console.warn('[load-latest-snapshot] exception', err);
    return { status: 'missing', date: fallbackDate };
  }
}
