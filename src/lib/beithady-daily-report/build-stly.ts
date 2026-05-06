import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { DailyReportPayload, StlyComparison } from './types';

/**
 * Looks up the snapshot from 365 days before `today`. Returns the YoY
 * comparison shape, or null if no prior snapshot exists. We only consider
 * MTD revenue + MTD occupancy (the headline numbers worth comparing YoY).
 */
export async function buildStly(today: string, currentPayload: DailyReportPayload): Promise<StlyComparison> {
  try {
    const priorDate = new Date(new Date(today + 'T00:00:00Z').getTime() - 365 * 86400_000)
      .toISOString()
      .slice(0, 10);

    const { data, error } = await supabaseAdmin()
      .from('daily_report_snapshots')
      .select('payload')
      .eq('report_date', priorDate)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[build-stly]', error.message);
      return null;
    }
    if (!data) return null;

    const prior = data.payload as DailyReportPayload;

    const cur = currentPayload.all.revenue_mtd_usd;
    const prv = prior.all?.revenue_mtd_usd ?? 0;
    const curOcc = currentPayload.all.backward_occupancy_pct ?? currentPayload.all.occupancy_today_pct;
    const prvOcc = prior.all?.backward_occupancy_pct ?? prior.all?.occupancy_today_pct ?? 0;

    return {
      current_mtd_revenue_usd: cur,
      prior_mtd_revenue_usd: prv,
      delta_pct: prv > 0 ? ((cur - prv) / prv) * 100 : 0,
      current_mtd_occupancy_pct: curOcc,
      prior_mtd_occupancy_pct: prvOcc,
      delta_pp: curOcc - prvOcc,
    };
  } catch (err) {
    console.warn('[build-stly] exception', err);
    return null;
  }
}
