import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { DailyReportPayload, SparklinesSection } from './types';

/**
 * Reads the last 7 snapshots up to and including `today` and extracts each
 * hero KPI into a chronological time series. Used by the Performance
 * Dashboard's Hero KPI sparklines. Returns null on error.
 */
export async function buildSparklines(today: string): Promise<SparklinesSection | null> {
  try {
    const fromDate = new Date(new Date(today + 'T00:00:00Z').getTime() - 6 * 86400_000)
      .toISOString()
      .slice(0, 10);

    const { data, error } = await supabaseAdmin()
      .from('daily_report_snapshots')
      .select('report_date, payload')
      .gte('report_date', fromDate)
      .lte('report_date', today)
      .order('report_date', { ascending: true });

    if (error) {
      console.warn('[build-sparklines]', error.message);
      return null;
    }
    if (!data || data.length === 0) return null;

    const series: SparklinesSection = {
      occupancy: [],
      mtd_occupancy: [],
      month_to_end_occupancy: [],
      month_occupancy: [],
      mtd_revenue: [],
      mtd_revenue_actual: [],
      revpar: [],
      pace: [],
      reviews_avg: [],
      response_time: [],
    };

    for (const row of data as Array<{ report_date: string; payload: unknown }>) {
      const p = row.payload as DailyReportPayload;
      series.occupancy.push(p.all?.occupancy_today_pct ?? 0);
      series.mtd_occupancy.push(p.all?.backward_occupancy_pct ?? 0);
      series.month_to_end_occupancy.push(p.all?.forward_occupancy_pct ?? 0);
      series.month_occupancy.push(p.all?.month_occupancy_pct ?? 0);
      series.mtd_revenue.push(p.all?.revenue_mtd_usd ?? 0);
      series.mtd_revenue_actual.push(p.all?.revenue_mtd_actual_usd ?? 0);
      // revpar is a v4 field — may be absent in older snapshots
      series.revpar.push((p as { revpar?: { all?: number } | null }).revpar?.all ?? 0);
      series.pace.push(p.all?.pickup_vs_prior_month_pct ?? 0);
      series.reviews_avg.push(p.reviews?.avg_rating_mtd ?? 0);
      series.response_time.push(p.conversations?.yesterday?.avg_response_minutes ?? 0);
    }

    return series;
  } catch (err) {
    console.warn('[build-sparklines] exception', err);
    return null;
  }
}
