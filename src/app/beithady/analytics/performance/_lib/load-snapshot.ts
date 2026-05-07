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
