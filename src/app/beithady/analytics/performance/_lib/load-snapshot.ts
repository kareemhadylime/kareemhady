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

export async function loadSnapshot(dateParam: string | undefined): Promise<SnapshotResult> {
  const date = parseDateParam(dateParam) ?? cairoYmd();

  const { data, error } = await supabaseAdmin()
    .from('daily_report_snapshots')
    .select('payload, generated_at')
    .eq('report_date', date)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { status: 'missing', date };
  return {
    status: 'found',
    date,
    payload: data.payload as DailyReportPayload,
    generatedAt: data.generated_at as string,
  };
}
