import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { InsightsUpsertError } from './insights-errors';
import { asInt, asMicros } from './insights-utils';

export type GeoRow = {
  account_id: number;
  campaign_id: number;
  ad_set_id: number | null;
  platform: 'meta' | 'google' | 'tiktok';
  metric_date: string;
  country_code: string;
  region: string | null;
  city: string | null;
  impressions: number;
  clicks: number;
  spend_micros: number;
  reach: number | null;
  leads: number;
};

export type GeoCtx = {
  accountId: number;
  campaignId: number;
  adSetId: number | null;
  platform: 'meta' | 'google' | 'tiktok';
};

// Google geo_target_constant numeric ids → ISO-2 for countries BH runs ads in.
// Source: https://developers.google.com/google-ads/api/reference/data/geotargets
// Append rows as new BH target markets surface (cron logs will show unmapped ids).
const GOOGLE_GEO_ISO2: Record<string, string> = {
  '2818': 'GB',  // United Kingdom
  '2840': 'US',  // United States
  '2784': 'AE',  // United Arab Emirates
  '2682': 'SA',  // Saudi Arabia
};

const TIKTOK_ISO3_TO_ISO2: Record<string, string> = {
  EGY: 'EG', ARE: 'AE', SAU: 'SA', KWT: 'KW',
  OMN: 'OM', BHR: 'BH', QAT: 'QA', JOR: 'JO',
  USA: 'US', GBR: 'GB',
};


export function normalizeMetaGeoRows(
  rows: Array<Record<string, unknown>>,
  ctx: GeoCtx
): GeoRow[] {
  const out: GeoRow[] = [];
  for (const r of rows) {
    const country = typeof r.country === 'string' ? r.country.toUpperCase() : '';
    if (!country) continue;
    out.push({
      account_id: ctx.accountId,
      campaign_id: ctx.campaignId,
      ad_set_id: ctx.adSetId,
      platform: ctx.platform,
      metric_date: String(r.date_start || ''),
      country_code: country,
      region: typeof r.region === 'string' ? r.region : null,
      city: typeof r.city === 'string' ? r.city : null,
      impressions: asInt(r.impressions),
      clicks: asInt(r.clicks),
      spend_micros: asMicros(r.spend),
      reach: r.reach != null ? asInt(r.reach) : null,
      leads: 0,
    });
  }
  return out;
}

export function normalizeGoogleGeoRows(
  rows: Array<{ segments?: { date?: string; geoTargetCountry?: string | null; geoTargetCity?: string | null };
                metrics?: { impressions?: string; clicks?: string; costMicros?: string; [key: string]: string | undefined };
                campaign?: { id?: string } }>,
  ctx: GeoCtx
): GeoRow[] {
  const out: GeoRow[] = [];
  for (const r of rows) {
    const resourceName = r.segments?.geoTargetCountry || '';
    const idStr = resourceName.split('/').pop() || '';
    const iso2 = GOOGLE_GEO_ISO2[idStr];
    if (!iso2) continue;
    out.push({
      account_id: ctx.accountId,
      campaign_id: ctx.campaignId,
      ad_set_id: ctx.adSetId,
      platform: ctx.platform,
      metric_date: String(r.segments?.date || ''),
      country_code: iso2,
      region: null,
      city: r.segments?.geoTargetCity || null,
      impressions: asInt(r.metrics?.impressions),
      clicks: asInt(r.metrics?.clicks),
      spend_micros: asInt(r.metrics?.costMicros),
      reach: null,
      leads: 0,
    });
  }
  return out;
}

export function normalizeTikTokGeoRows(
  rows: Array<{ dimensions?: Record<string, string>; metrics?: Record<string, string> }>,
  ctx: GeoCtx
): GeoRow[] {
  const out: GeoRow[] = [];
  for (const r of rows) {
    const iso3 = (r.dimensions?.country_code || '').toUpperCase();
    const iso2 = TIKTOK_ISO3_TO_ISO2[iso3];
    if (!iso2) continue;
    out.push({
      account_id: ctx.accountId,
      campaign_id: ctx.campaignId,
      ad_set_id: ctx.adSetId,
      platform: ctx.platform,
      metric_date: r.dimensions?.stat_time_day || '',
      country_code: iso2,
      region: null,
      city: null,
      impressions: asInt(r.metrics?.impressions),
      clicks: asInt(r.metrics?.clicks),
      spend_micros: asMicros(r.metrics?.spend),
      reach: r.metrics?.reach != null ? asInt(r.metrics.reach) : null,
      leads: 0,
    });
  }
  return out;
}

export async function upsertGeoRows(rows: GeoRow[]): Promise<void> {
  if (rows.length === 0) return;
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('ads_insights_geo')
    .upsert(rows, { onConflict: 'campaign_id,ad_set_id,metric_date,platform,country_code,region,city' });
  if (error) throw new InsightsUpsertError('geo', error.message);
}

export type GeoRollupRow = {
  country_code: string;
  impressions: number;
  clicks: number;
  spend_micros: number;
  leads: number;
};

export async function queryGeoRollup(opts: {
  campaignId?: number;
  accountId?: number;
  from: string;
  to: string;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
  buildingCode?: string;
}): Promise<GeoRollupRow[]> {
  const sb = supabaseAdmin();
  let q = sb.from('ads_insights_geo')
    .select('country_code, impressions, clicks, spend_micros, leads')
    .gte('metric_date', opts.from)
    .lte('metric_date', opts.to);
  if (opts.campaignId) q = q.eq('campaign_id', opts.campaignId);
  if (opts.accountId) q = q.eq('account_id', opts.accountId);
  if (opts.platforms && opts.platforms.length) q = q.in('platform', opts.platforms);
  if (opts.buildingCode) {
    // Find campaigns whose leads attribute to this building within the window.
    const campaignIds = await campaignsAttributableToBuilding({ from: opts.from, to: opts.to, buildingCode: opts.buildingCode });
    if (campaignIds.length === 0) return [];
    q = q.in('campaign_id', campaignIds);
  }
  const { data, error } = await q;
  if (error) console.error(`[insights-rollup] query failed:`, error);
  const byCountry = new Map<string, GeoRollupRow>();
  for (const r of (data as Array<{ country_code: string; impressions: number; clicks: number; spend_micros: number; leads: number }> | null) ?? []) {
    const cur = byCountry.get(r.country_code) ?? {
      country_code: r.country_code, impressions: 0, clicks: 0, spend_micros: 0, leads: 0,
    };
    cur.impressions += Number(r.impressions) || 0;
    cur.clicks += Number(r.clicks) || 0;
    cur.spend_micros += Number(r.spend_micros) || 0;
    cur.leads += Number(r.leads) || 0;
    byCountry.set(r.country_code, cur);
  }
  return Array.from(byCountry.values()).sort((a, b) => b.clicks - a.clicks);
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
