import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { InsightsUpsertError } from './insights-errors';
import { asInt, asMicros } from './insights-utils';

export type DeviceRow = {
  account_id: number;
  campaign_id: number;
  ad_set_id: number | null;
  platform: 'meta' | 'google' | 'tiktok';
  metric_date: string;
  device_platform: 'mobile' | 'tablet' | 'desktop' | 'tv' | 'connected_tv' | 'unknown';
  publisher_platform: string | null;
  placement: string | null;
  impressions: number;
  clicks: number;
  spend_micros: number;
  reach: number | null;
  leads: number;
};

export type DeviceCtx = {
  accountId: number;
  campaignId: number;
  adSetId: number | null;
  platform: 'meta' | 'google' | 'tiktok';
};


function normMetaDevice(s: unknown): DeviceRow['device_platform'] {
  const v = String(s || '').toLowerCase();
  if (v === 'mobile_app' || v === 'mobile_web' || v === 'mobile') return 'mobile';
  if (v === 'tablet') return 'tablet';
  if (v === 'desktop') return 'desktop';
  if (v === 'connected_tv') return 'connected_tv';
  if (v === 'tv') return 'tv';
  return 'unknown';
}

function normGoogleDevice(s: unknown): DeviceRow['device_platform'] {
  const v = String(s || '').toUpperCase();
  if (v === 'MOBILE') return 'mobile';
  if (v === 'TABLET') return 'tablet';
  if (v === 'DESKTOP') return 'desktop';
  if (v === 'CONNECTED_TV') return 'connected_tv';
  return 'unknown';
}

export function normalizeMetaDeviceRows(
  rows: Array<Record<string, unknown>>, ctx: DeviceCtx
): DeviceRow[] {
  return rows.map(r => ({
    account_id: ctx.accountId, campaign_id: ctx.campaignId, ad_set_id: ctx.adSetId,
    platform: ctx.platform, metric_date: String(r.date_start || ''),
    device_platform: normMetaDevice(r.device_platform),
    publisher_platform: typeof r.publisher_platform === 'string' ? r.publisher_platform : null,
    placement: typeof r.publisher_position === 'string' ? r.publisher_position : null,
    impressions: asInt(r.impressions), clicks: asInt(r.clicks),
    spend_micros: asMicros(r.spend),
    reach: r.reach != null ? asInt(r.reach) : null, leads: 0,
  }));
}

export function normalizeGoogleDeviceRows(
  rows: Array<{ segments?: { date?: string; device?: string };
                metrics?: { impressions?: string; clicks?: string; costMicros?: string };
                campaign?: { id?: string } }>,
  ctx: DeviceCtx
): DeviceRow[] {
  return rows.map(r => ({
    account_id: ctx.accountId, campaign_id: ctx.campaignId, ad_set_id: ctx.adSetId,
    platform: ctx.platform, metric_date: String(r.segments?.date || ''),
    device_platform: normGoogleDevice(r.segments?.device),
    publisher_platform: null, placement: null,
    impressions: asInt(r.metrics?.impressions), clicks: asInt(r.metrics?.clicks),
    spend_micros: asInt(r.metrics?.costMicros), reach: null, leads: 0,
  }));
}

export function normalizeTikTokDeviceRows(
  rows: Array<{ dimensions?: Record<string, string>; metrics?: Record<string, string> }>,
  ctx: DeviceCtx
): DeviceRow[] {
  return rows.map(r => ({
    account_id: ctx.accountId, campaign_id: ctx.campaignId, ad_set_id: ctx.adSetId,
    platform: ctx.platform, metric_date: r.dimensions?.stat_time_day || '',
    device_platform: 'unknown',
    publisher_platform: null,
    placement: r.dimensions?.placement || null,
    impressions: asInt(r.metrics?.impressions), clicks: asInt(r.metrics?.clicks),
    spend_micros: asMicros(r.metrics?.spend),
    reach: r.metrics?.reach != null ? asInt(r.metrics.reach) : null, leads: 0,
  }));
}

export async function upsertDeviceRows(rows: DeviceRow[]): Promise<void> {
  if (rows.length === 0) return;
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('ads_insights_device')
    .upsert(rows, {
      onConflict: 'campaign_id,ad_set_id,metric_date,platform,device_platform,publisher_platform,placement',
    });
  if (error) throw new InsightsUpsertError('device', error.message);
}

export type DeviceRollupRow = {
  device_platform: DeviceRow['device_platform'];
  publisher_platform: string | null;
  placement: string | null;
  impressions: number;
  clicks: number;
  spend_micros: number;
  leads: number;
};

export async function queryDeviceRollup(opts: {
  campaignId?: number; accountId?: number; from: string; to: string;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
  buildingCode?: string;
}): Promise<DeviceRollupRow[]> {
  const sb = supabaseAdmin();
  let q = sb.from('ads_insights_device')
    .select('device_platform, publisher_platform, placement, impressions, clicks, spend_micros, leads')
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
  const { data, error } = await q;
  if (error) console.error(`[insights-rollup] query failed:`, error);
  const byKey = new Map<string, DeviceRollupRow>();
  for (const r of (data as Array<DeviceRollupRow & { device_platform: string }> | null) ?? []) {
    const k = `${r.device_platform}|${r.publisher_platform ?? ''}|${r.placement ?? ''}`;
    const cur = byKey.get(k) ?? {
      device_platform: r.device_platform as DeviceRow['device_platform'],
      publisher_platform: r.publisher_platform, placement: r.placement,
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
