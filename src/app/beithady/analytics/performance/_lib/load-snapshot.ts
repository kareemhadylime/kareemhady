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
  const date = parseDateParam(dateParam) ?? cairoYmd();

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
