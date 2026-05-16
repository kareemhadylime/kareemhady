import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { attributeLeadToBuilding } from './per-building';
import { buildingMapForLeads } from './funnel';
import { asInt, asMicros } from './insights-utils';

export type RawLeadForHourly = { created_at: string };

export type HeatmapCell = {
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6;     // 0 = Mon, 6 = Sun (Cairo-local)
  hour: number;                                 // 0..23
  lead_count: number;
};

export type MetaHourlyCell = {
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  hour: number;
  impressions: number;
  clicks: number;
  spend_micros: number;
};

// Convert any timestamp to Cairo-local day-of-week (0=Mon..6=Sun) + hour (0..23).
export function cairoDayHour(iso: string): { day_of_week: 0|1|2|3|4|5|6; hour: number } {
  const d = new Date(iso);
  const weekdayShort = d.toLocaleString('en-US', { timeZone: 'Africa/Cairo', weekday: 'short' });
  const sundayBased = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(weekdayShort);
  // Map Sun=0..Sat=6 → Mon=0..Sun=6
  const day_of_week = ((sundayBased + 6) % 7) as 0|1|2|3|4|5|6;
  const hourStr = d.toLocaleString('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hour12: false });
  const hour = Number(hourStr) % 24;
  return { day_of_week, hour };
}

export function bucketLeadsByHour(leads: RawLeadForHourly[]): HeatmapCell[] {
  const map = new Map<string, HeatmapCell>();
  for (const lead of leads) {
    const { day_of_week, hour } = cairoDayHour(lead.created_at);
    const k = `${day_of_week}|${hour}`;
    const cur = map.get(k) ?? { day_of_week, hour, lead_count: 0 };
    cur.lead_count += 1;
    map.set(k, cur);
  }
  return Array.from(map.values());
}

export type MetaHourlyRawRow = {
  hourly_stats_aggregated_by_advertiser_time_zone?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  date_start?: string;
};

export type MetaHourlyDbRow = {
  account_id: number;
  campaign_id: number;
  platform: 'meta';
  metric_date: string;
  hour: number;
  impressions: number;
  clicks: number;
  spend_micros: number;
};

// Parse Meta's "08:00:00 - 08:59:59" hour bucket string into 0..23.
export function normalizeMetaHourlyRow(
  row: MetaHourlyRawRow,
  ctx: { accountId: number; campaignId: number },
): MetaHourlyDbRow | null {
  const bucketStr = row.hourly_stats_aggregated_by_advertiser_time_zone ?? '';
  const m = bucketStr.match(/^(\d{1,2}):/);
  if (!m) return null;
  const hour = Number(m[1]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  return {
    account_id: ctx.accountId,
    campaign_id: ctx.campaignId,
    platform: 'meta',
    metric_date: String(row.date_start ?? ''),
    hour,
    impressions: asInt(row.impressions),
    clicks: asInt(row.clicks),
    spend_micros: asMicros(row.spend),
  };
}

export async function getLeadDensityHeatmap(opts: {
  from: string;
  to: string;
  campaignId?: number;
  buildingCode?: string;
}): Promise<HeatmapCell[]> {
  const sb = supabaseAdmin();
  let q = sb.from('ads_leads')
    .select('id, created_at, matched_reservation_id, building_interest')
    .gte('created_at', opts.from)
    .lte('created_at', opts.to + 'T23:59:59');
  if (opts.campaignId) q = q.eq('campaign_id', opts.campaignId);
  const { data, error } = await q;
  if (error) { console.error('[hourly-lead-density] query failed:', error); return []; }
  const rows = (data as Array<{ id: number; created_at: string; matched_reservation_id: string | null; building_interest: string | null }> | null) ?? [];

  let filtered = rows;
  if (opts.buildingCode) {
    const buildingByReservation = await buildingMapForLeads(sb, rows);
    filtered = rows.filter(r => {
      const bookedBuilding = r.matched_reservation_id ? buildingByReservation.get(r.matched_reservation_id) ?? null : null;
      return attributeLeadToBuilding({ matched_reservation_building: bookedBuilding, building_interest: r.building_interest }) === opts.buildingCode;
    });
  }

  return bucketLeadsByHour(filtered.map(r => ({ created_at: r.created_at })));
}

export async function getMetaHourlyHeatmap(opts: {
  from: string;
  to: string;
  campaignId?: number;
}): Promise<MetaHourlyCell[]> {
  const sb = supabaseAdmin();
  let q = sb.from('ads_hourly_metrics')
    .select('metric_date, hour, impressions, clicks, spend_micros')
    .gte('metric_date', opts.from)
    .lte('metric_date', opts.to)
    .eq('platform', 'meta');
  if (opts.campaignId) q = q.eq('campaign_id', opts.campaignId);
  const { data, error } = await q;
  if (error) { console.error('[hourly-meta] query failed:', error); return []; }
  const rows = (data as Array<{ metric_date: string; hour: number; impressions: number; clicks: number; spend_micros: number }> | null) ?? [];

  const map = new Map<string, MetaHourlyCell>();
  for (const r of rows) {
    const { day_of_week } = cairoDayHour(r.metric_date + 'T12:00:00+03:00');
    const k = `${day_of_week}|${r.hour}`;
    const cur = map.get(k) ?? { day_of_week, hour: r.hour, impressions: 0, clicks: 0, spend_micros: 0 };
    cur.impressions += asInt(r.impressions);
    cur.clicks += asInt(r.clicks);
    cur.spend_micros += asInt(r.spend_micros);
    map.set(k, cur);
  }
  return Array.from(map.values());
}
