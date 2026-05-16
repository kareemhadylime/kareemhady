import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export const SPEND_SPIKE_MULTIPLIER = 3;
export const SPEND_SPIKE_CRITICAL_MULTIPLIER = 5;
export const ZERO_LEADS_SPEND_FLOOR = 30;     // USD
export const LOW_ROAS_SPEND_FLOOR = 100;      // USD
export const LOW_ROAS_THRESHOLD = 1.0;

export type AnomalyType = 'spend_spike' | 'zero_leads' | 'low_roas';
export type AnomalySeverity = 'warning' | 'critical';

export type AnomalyEvent = {
  type: AnomalyType;
  severity: AnomalySeverity;
  platform: string;
  message: string;
  metric: { today: number; baseline: number; ratio: number };
};

export type PlatformDailyTotals = {
  today_spend: number;
  yesterday_spend: number;
  today_leads: number;
  week_spend: number;
  week_value: number;
};

export function computeAnomalies(perPlatform: Record<string, PlatformDailyTotals>): AnomalyEvent[] {
  const events: AnomalyEvent[] = [];
  for (const [platform, p] of Object.entries(perPlatform)) {
    // 1. Spend spike
    if (p.today_spend > 0 && p.yesterday_spend > 0 && p.today_spend > SPEND_SPIKE_MULTIPLIER * p.yesterday_spend) {
      const ratio = p.today_spend / p.yesterday_spend;
      events.push({
        type: 'spend_spike',
        severity: ratio >= SPEND_SPIKE_CRITICAL_MULTIPLIER ? 'critical' : 'warning',
        platform,
        message: `${platform} spend $${p.today_spend.toFixed(2)} today is ${ratio.toFixed(1)}× yesterday ($${p.yesterday_spend.toFixed(2)})`,
        metric: { today: p.today_spend, baseline: p.yesterday_spend, ratio },
      });
    }
    // 2. Zero leads with material spend
    if (p.today_leads === 0 && p.today_spend >= ZERO_LEADS_SPEND_FLOOR) {
      events.push({
        type: 'zero_leads',
        severity: 'warning',
        platform,
        message: `${platform} spent $${p.today_spend.toFixed(2)} today with 0 leads`,
        metric: { today: p.today_spend, baseline: 0, ratio: Infinity },
      });
    }
    // 3. Low ROAS (7d)
    const roas = p.week_spend > 0 ? p.week_value / p.week_spend : null;
    if (p.week_spend >= LOW_ROAS_SPEND_FLOOR && roas != null && roas < LOW_ROAS_THRESHOLD) {
      events.push({
        type: 'low_roas',
        severity: 'critical',
        platform,
        message: `${platform} 7d ROAS ${roas.toFixed(2)}× on $${p.week_spend.toFixed(2)} spend (< ${LOW_ROAS_THRESHOLD}× threshold)`,
        metric: { today: roas, baseline: LOW_ROAS_THRESHOLD, ratio: roas / LOW_ROAS_THRESHOLD },
      });
    }
  }
  return events;
}

function cairoDateStr(offsetDays = 0): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' });
  const d = new Date(Date.now() - offsetDays * 86_400_000);
  return f.format(d);
}

export async function detectAnomalies(opts: { today?: string; lookbackDays?: number } = {}): Promise<AnomalyEvent[]> {
  const sb = supabaseAdmin();
  const lookbackDays = opts.lookbackDays ?? 7;
  const today = opts.today ?? cairoDateStr(0);
  const yesterday = cairoDateStr(1);
  const lookbackStart = cairoDateStr(lookbackDays);

  const { data, error } = await sb
    .from('ads_daily_metrics')
    .select('platform, metric_date, spend_micros, leads, conversion_value_micros')
    .is('ad_id', null)
    .is('ad_set_id', null)
    .gte('metric_date', lookbackStart);
  if (error) { console.error('[anomalies] query failed:', error); return []; }
  type Row = { platform: string; metric_date: string; spend_micros: number; leads: number; conversion_value_micros: number | null };
  const rows = (data as Row[] | null) ?? [];

  const perPlatform: Record<string, PlatformDailyTotals> = {};
  for (const r of rows) {
    const p = (perPlatform[r.platform] ||= { today_spend: 0, yesterday_spend: 0, today_leads: 0, week_spend: 0, week_value: 0 });
    const spend = Number(r.spend_micros || 0) / 1_000_000;
    const leads = Number(r.leads || 0);
    const value = Number(r.conversion_value_micros || 0) / 1_000_000;
    p.week_spend += spend;
    p.week_value += value;
    if (r.metric_date === today) { p.today_spend += spend; p.today_leads += leads; }
    if (r.metric_date === yesterday) p.yesterday_spend += spend;
  }

  return computeAnomalies(perPlatform);
}
