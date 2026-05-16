import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { InsightsUpsertError } from './insights-errors';
import { asInt, asMicros } from './insights-utils';

export type DemoRow = {
  account_id: number;
  campaign_id: number;
  ad_set_id: number | null;
  platform: 'meta' | 'google' | 'tiktok';
  metric_date: string;
  age_range: '13-17' | '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+' | 'unknown';
  gender: 'male' | 'female' | 'unknown';
  impressions: number;
  clicks: number;
  spend_micros: number;
  reach: number | null;
  leads: number;
};

export type DemoCtx = {
  accountId: number;
  campaignId: number;
  adSetId: number | null;
  platform: 'meta' | 'google' | 'tiktok';
};

const AGE_BUCKETS = new Set(['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+']);


function normGender(g: unknown): 'male' | 'female' | 'unknown' {
  const s = String(g || '').toLowerCase();
  if (s === 'male' || s === 'm' || s === 'gender_male') return 'male';
  if (s === 'female' || s === 'f' || s === 'gender_female') return 'female';
  return 'unknown';
}
function normAge(a: unknown): DemoRow['age_range'] {
  const s = String(a || '');
  if (AGE_BUCKETS.has(s)) return s as DemoRow['age_range'];
  if (s.startsWith('AGE_RANGE_')) {
    const m = s.match(/AGE_RANGE_(\d+)_(\d+)/);
    if (m) {
      const b = `${m[1]}-${m[2]}`;
      if (AGE_BUCKETS.has(b)) return b as DemoRow['age_range'];
    }
    if (s === 'AGE_RANGE_65_UP') return '65+';
  }
  return 'unknown';
}

export function normalizeMetaDemoRows(
  rows: Array<Record<string, unknown>>, ctx: DemoCtx
): DemoRow[] {
  return rows.map(r => ({
    account_id: ctx.accountId,
    campaign_id: ctx.campaignId,
    ad_set_id: ctx.adSetId,
    platform: ctx.platform,
    metric_date: String(r.date_start || ''),
    age_range: normAge(r.age),
    gender: normGender(r.gender),
    impressions: asInt(r.impressions),
    clicks: asInt(r.clicks),
    spend_micros: asMicros(r.spend),
    reach: r.reach != null ? asInt(r.reach) : null,
    leads: 0,
  }));
}

export function normalizeGoogleDemoRows(
  payload: {
    gender: Array<{ segments?: { date?: string; gender?: string };
                    metrics?: { impressions?: string; clicks?: string; costMicros?: string };
                    campaign?: { id?: string } }>;
    ageRange: Array<{ segments?: { date?: string; ageRange?: string };
                      metrics?: { impressions?: string; clicks?: string; costMicros?: string };
                      campaign?: { id?: string } }>;
  },
  ctx: DemoCtx
): DemoRow[] {
  const out: DemoRow[] = [];
  for (const r of payload.gender) {
    out.push({
      account_id: ctx.accountId, campaign_id: ctx.campaignId, ad_set_id: ctx.adSetId,
      platform: ctx.platform, metric_date: String(r.segments?.date || ''),
      age_range: 'unknown', gender: normGender(r.segments?.gender),
      impressions: asInt(r.metrics?.impressions), clicks: asInt(r.metrics?.clicks),
      spend_micros: asInt(r.metrics?.costMicros), reach: null, leads: 0,
    });
  }
  for (const r of payload.ageRange) {
    out.push({
      account_id: ctx.accountId, campaign_id: ctx.campaignId, ad_set_id: ctx.adSetId,
      platform: ctx.platform, metric_date: String(r.segments?.date || ''),
      age_range: normAge(r.segments?.ageRange), gender: 'unknown',
      impressions: asInt(r.metrics?.impressions), clicks: asInt(r.metrics?.clicks),
      spend_micros: asInt(r.metrics?.costMicros), reach: null, leads: 0,
    });
  }
  return out;
}

export function normalizeTikTokDemoRows(
  rows: Array<{ dimensions?: Record<string, string>; metrics?: Record<string, string> }>,
  ctx: DemoCtx
): DemoRow[] {
  return rows.map(r => ({
    account_id: ctx.accountId, campaign_id: ctx.campaignId, ad_set_id: ctx.adSetId,
    platform: ctx.platform, metric_date: r.dimensions?.stat_time_day || '',
    age_range: normAge(r.dimensions?.age),
    gender: normGender(r.dimensions?.gender),
    impressions: asInt(r.metrics?.impressions), clicks: asInt(r.metrics?.clicks),
    spend_micros: asMicros(r.metrics?.spend),
    reach: r.metrics?.reach != null ? asInt(r.metrics.reach) : null, leads: 0,
  }));
}

export async function upsertDemoRows(rows: DemoRow[]): Promise<void> {
  if (rows.length === 0) return;
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('ads_insights_demo')
    .upsert(rows, { onConflict: 'campaign_id,ad_set_id,metric_date,platform,age_range,gender' });
  if (error) throw new InsightsUpsertError('demo', error.message);
}

export type DemoRollupRow = {
  age_range: DemoRow['age_range'];
  gender: DemoRow['gender'];
  impressions: number;
  clicks: number;
  spend_micros: number;
  leads: number;
};

export async function queryDemoRollup(opts: {
  campaignId?: number; accountId?: number; from: string; to: string;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
  buildingCode?: string;
}): Promise<DemoRollupRow[]> {
  const sb = supabaseAdmin();
  let q = sb.from('ads_insights_demo')
    .select('age_range, gender, impressions, clicks, spend_micros, leads')
    .gte('metric_date', opts.from).lte('metric_date', opts.to);
  if (opts.campaignId) q = q.eq('campaign_id', opts.campaignId);
  if (opts.accountId) q = q.eq('account_id', opts.accountId);
  if (opts.platforms?.length) q = q.in('platform', opts.platforms);
  if (opts.buildingCode) {
    // Find campaigns whose leads attribute to this building within the window.
    const campaignIds = await campaignsAttributableToBuilding({ from: opts.from, to: opts.to, buildingCode: opts.buildingCode });
    if (campaignIds.length === 0) return [];
    q = q.in('campaign_id', campaignIds);
  }
  const { data } = await q;
  const byKey = new Map<string, DemoRollupRow>();
  for (const r of (data as Array<DemoRollupRow & { age_range: string; gender: string }> | null) ?? []) {
    const k = `${r.age_range}|${r.gender}`;
    const cur = byKey.get(k) ?? {
      age_range: r.age_range as DemoRow['age_range'], gender: r.gender as DemoRow['gender'],
      impressions: 0, clicks: 0, spend_micros: 0, leads: 0,
    };
    cur.impressions += Number(r.impressions) || 0;
    cur.clicks += Number(r.clicks) || 0;
    cur.spend_micros += Number(r.spend_micros) || 0;
    cur.leads += Number(r.leads) || 0;
    byKey.set(k, cur);
  }
  return Array.from(byKey.values()).sort((a, b) => b.clicks - a.clicks);
}

async function campaignsAttributableToBuilding(opts: {
  from: string; to: string; buildingCode: string;
}): Promise<number[]> {
  const sb = supabaseAdmin();
  const { attributeLeadToBuilding } = await import('./per-building');
  const { buildingMapForLeads } = await import('./funnel');
  const { data: leads } = await sb.from('ads_leads')
    .select('id, campaign_id, matched_reservation_id, building_interest')
    .gte('created_at', opts.from).lte('created_at', opts.to + 'T23:59:59');
  const leadRows = (leads as Array<{ id: number; campaign_id: number | null; matched_reservation_id: string | null; building_interest: string | null }> | null) ?? [];
  const buildingByReservation = await buildingMapForLeads(sb, leadRows);
  const set = new Set<number>();
  for (const l of leadRows) {
    if (l.campaign_id == null) continue;
    const bookedBuilding = l.matched_reservation_id ? buildingByReservation.get(l.matched_reservation_id) ?? null : null;
    if (attributeLeadToBuilding({ matched_reservation_building: bookedBuilding, building_interest: l.building_interest }) === opts.buildingCode) {
      set.add(l.campaign_id);
    }
  }
  return Array.from(set);
}
