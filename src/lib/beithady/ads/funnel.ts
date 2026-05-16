import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { attributeLeadToBuilding } from './per-building';
import { asInt } from './insights-utils';

export type FunnelStageInput = {
  key: 'impressions' | 'reach' | 'clicks' | 'leads' | 'bookings';
  label: string;
  count: number;
};

export type FunnelStage = FunnelStageInput & {
  conversion_pct_from_prev: number | null;
  conversion_pct_from_top: number | null;
};

export type FunnelStages = { stages: FunnelStage[] };

export function computeConversionPcts(input: FunnelStageInput[]): FunnelStage[] {
  const top = input[0]?.count ?? 0;
  return input.map((stage, i) => {
    if (i === 0) return { ...stage, conversion_pct_from_prev: null, conversion_pct_from_top: null };
    const prev = input[i - 1].count;
    const fromPrev = prev > 0 ? Math.round((stage.count / prev) * 1000) / 10 : null;
    const fromTop = top > 0 ? Math.round((stage.count / top) * 1000) / 10 : null;
    return { ...stage, conversion_pct_from_prev: fromPrev, conversion_pct_from_top: fromTop };
  });
}

export async function getFunnelStages(opts: {
  from: string;
  to: string;
  campaignId?: number;
  buildingCode?: string;
}): Promise<FunnelStages> {
  const sb = supabaseAdmin();

  // Top 3 stages: campaign-level metrics. ad_id IS NULL + ad_set_id IS NULL = campaign rollup.
  let metricsQ = sb.from('ads_daily_metrics')
    .select('impressions, clicks, reach, spend_micros, campaign_id')
    .gte('metric_date', opts.from).lte('metric_date', opts.to)
    .is('ad_id', null).is('ad_set_id', null);
  if (opts.campaignId) metricsQ = metricsQ.eq('campaign_id', opts.campaignId);
  const { data: metricRows, error: metricsErr } = await metricsQ;
  if (metricsErr) console.error('[funnel] metrics query failed:', metricsErr);
  const rows = (metricRows as Array<{ impressions: number; clicks: number; reach: number | null }> | null) ?? [];
  const impressions = rows.reduce((s, r) => s + asInt(r.impressions), 0);
  const reach = rows.reduce((s, r) => s + asInt(r.reach), 0);
  const clicks = rows.reduce((s, r) => s + asInt(r.clicks), 0);

  // Bottom 2 stages: lead-level with optional per-building filter.
  let leadQ = sb.from('ads_leads')
    .select('id, matched_reservation_id, building_interest')
    .gte('created_at', opts.from).lte('created_at', opts.to + 'T23:59:59');
  if (opts.campaignId) leadQ = leadQ.eq('campaign_id', opts.campaignId);
  const { data: leads, error: leadErr } = await leadQ;
  if (leadErr) console.error('[funnel] leads query failed:', leadErr);
  const leadRows = (leads as Array<{ id: number; matched_reservation_id: string | null; building_interest: string | null }> | null) ?? [];

  // If building filter active, do the reservation→listing→building_code join to filter
  const buildingByReservation = await buildingMapForLeads(sb, leadRows);
  const filteredLeads = opts.buildingCode
    ? leadRows.filter(l => {
        const bookedBuilding = l.matched_reservation_id ? buildingByReservation.get(l.matched_reservation_id) ?? null : null;
        return attributeLeadToBuilding({ matched_reservation_building: bookedBuilding, building_interest: l.building_interest }) === opts.buildingCode;
      })
    : leadRows;

  const leadsCount = filteredLeads.length;
  const bookings = filteredLeads.filter(l => l.matched_reservation_id != null).length;

  return {
    stages: computeConversionPcts([
      { key: 'impressions', label: 'Impressions', count: impressions },
      { key: 'reach',       label: 'Reach',       count: reach },
      { key: 'clicks',      label: 'Clicks',      count: clicks },
      { key: 'leads',       label: 'Leads',       count: leadsCount },
      { key: 'bookings',    label: 'Bookings',    count: bookings },
    ]),
  };
}

// Shared helper used by funnel + lead-quality + frt when filtering by building.
export async function buildingMapForLeads(
  sb: ReturnType<typeof supabaseAdmin>,
  leadRows: Array<{ matched_reservation_id: string | null }>,
): Promise<Map<string, string>> {
  const reservationIds = leadRows.map(l => l.matched_reservation_id).filter((x): x is string => !!x);
  if (reservationIds.length === 0) return new Map();
  const { data: resvs } = await sb.from('guesty_reservations')
    .select('id, listing_id').in('id', reservationIds);
  const listingIds = ((resvs as Array<{ id: string; listing_id: string | null }> | null) ?? [])
    .map(r => r.listing_id).filter((x): x is string => !!x);
  if (listingIds.length === 0) return new Map();
  const { data: listings } = await sb.from('guesty_listings')
    .select('id, building_code').in('id', listingIds);
  const buildingByListing = new Map<string, string>();
  for (const l of (listings as Array<{ id: string; building_code: string | null }> | null) ?? []) {
    if (l.building_code) buildingByListing.set(l.id, l.building_code);
  }
  const map = new Map<string, string>();
  for (const r of (resvs as Array<{ id: string; listing_id: string | null }> | null) ?? []) {
    const b = r.listing_id ? buildingByListing.get(r.listing_id) : undefined;
    if (b) map.set(r.id, b);
  }
  return map;
}
