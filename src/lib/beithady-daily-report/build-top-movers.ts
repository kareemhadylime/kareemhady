import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { DailyReportPayload, TopMover } from './types';
import { BUILDING_CODES } from './types';

const COMPARE_WINDOW_DAYS = 7;
const OCC_PP_THRESHOLD = 5;
const CHANNEL_PP_THRESHOLD = 5;
const PACE_PP_THRESHOLD = 10;
const MAX_MOVERS = 5;

/**
 * Compares current snapshot's headline numbers to the snapshot from
 * COMPARE_WINDOW_DAYS ago (default: 7) and emits up to MAX_MOVERS
 * one-liner anomaly rows sorted by absolute magnitude.
 *
 * Returns [] when no movers cross the threshold (panel renders "all stable").
 * Returns null only on unexpected exception.
 */
export async function buildTopMovers(
  today: string,
  current: DailyReportPayload
): Promise<TopMover[] | null> {
  try {
    const priorDate = new Date(
      new Date(today + 'T00:00:00Z').getTime() - COMPARE_WINDOW_DAYS * 86400_000
    )
      .toISOString()
      .slice(0, 10);

    const { data, error } = await supabaseAdmin()
      .from('daily_report_snapshots')
      .select('payload')
      .eq('report_date', priorDate)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return [];

    const prior = data.payload as DailyReportPayload;
    const movers: TopMover[] = [];

    // ── Overall pace ──────────────────────────────────────────────────────
    const curPace = current.all?.pickup_vs_prior_month_pct ?? 0;
    const prvPace = prior.all?.pickup_vs_prior_month_pct ?? 0;
    const paceDelta = curPace - prvPace;
    if (Math.abs(paceDelta) >= PACE_PP_THRESHOLD) {
      movers.push({
        scope: 'pace',
        key: 'overall',
        metric: 'pickup',
        delta: paceDelta,
        delta_unit: 'pp',
        prior_value: prvPace,
        current_value: curPace,
        one_liner: `Pace ${paceDelta >= 0 ? '+' : ''}${paceDelta.toFixed(1)}pp vs ${COMPARE_WINDOW_DAYS}d ago (${curPace.toFixed(1)}% vs ${prvPace.toFixed(1)}%)`,
      });
    }

    // ── Per-building occupancy ────────────────────────────────────────────
    for (const code of BUILDING_CODES) {
      const cur = current.per_building?.[code]?.occupancy_today_pct ?? 0;
      const prv = prior.per_building?.[code]?.occupancy_today_pct ?? 0;
      const d = cur - prv;
      if (Math.abs(d) >= OCC_PP_THRESHOLD) {
        movers.push({
          scope: 'building',
          key: code,
          metric: 'occupancy_pct',
          delta: d,
          delta_unit: 'pp',
          prior_value: prv,
          current_value: cur,
          one_liner: `${code} occupancy ${d >= 0 ? '+' : ''}${d.toFixed(1)}pp WoW`,
        });
      }
    }

    // ── Channel share (prefer paired_channel_mix MTD, fallback channel_mix) ─
    const curChannels =
      current.paired_channel_mix?.map((c) => ({ channel: c.channel, pct: c.mtd_pct })) ??
      current.channel_mix?.map((c) => ({ channel: c.channel, pct: c.pct })) ??
      [];
    const prvChannels =
      prior.paired_channel_mix?.map((c) => ({ channel: c.channel, pct: c.mtd_pct })) ??
      prior.channel_mix?.map((c) => ({ channel: c.channel, pct: c.pct })) ??
      [];

    for (const c of curChannels) {
      const prv = prvChannels.find((p) => p.channel === c.channel)?.pct ?? 0;
      const d = c.pct - prv;
      if (Math.abs(d) >= CHANNEL_PP_THRESHOLD) {
        movers.push({
          scope: 'channel',
          key: c.channel,
          metric: 'mtd_pct',
          delta: d,
          delta_unit: 'pp',
          prior_value: prv,
          current_value: c.pct,
          one_liner: `${c.channel} share ${d >= 0 ? '+' : ''}${d.toFixed(1)}pp vs LW`,
        });
      }
    }

    // Sort by absolute delta desc, take top N
    return movers
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, MAX_MOVERS);
  } catch (err) {
    console.warn('[build-top-movers] exception', err);
    return null;
  }
}
