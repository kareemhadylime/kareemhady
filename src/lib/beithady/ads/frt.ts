import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { attributeLeadToBuilding } from './per-building';
import { buildingMapForLeads } from './funnel';

export type FrtInput = {
  created_at: string;
  first_response_at: string | null;
};

export type FrtSummary = {
  total_leads: number;
  responded_leads: number;
  unresponded_count: number;
  median_minutes: number | null;
  p95_minutes: number | null;
  over_1h_count: number;
  over_1h_pct: number;
};

export const SLA_MINUTES = 60;

export function computeFrtSummary(leads: FrtInput[]): FrtSummary {
  const total = leads.length;
  const deltas: number[] = [];
  let unresponded = 0;
  for (const l of leads) {
    if (!l.first_response_at) { unresponded += 1; continue; }
    const delta = (Date.parse(l.first_response_at) - Date.parse(l.created_at)) / 60_000;
    if (Number.isFinite(delta) && delta >= 0) deltas.push(delta);
  }
  const responded = deltas.length;
  if (responded === 0) {
    return {
      total_leads: total, responded_leads: 0, unresponded_count: unresponded,
      median_minutes: null, p95_minutes: null, over_1h_count: 0, over_1h_pct: 0,
    };
  }
  const sorted = [...deltas].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? Math.round(((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) * 10) / 10
    : Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10;
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = Math.round(sorted[p95Index] * 10) / 10;
  const over1h = deltas.filter(d => d > SLA_MINUTES).length;
  return {
    total_leads: total,
    responded_leads: responded,
    unresponded_count: unresponded,
    median_minutes: median,
    p95_minutes: p95,
    over_1h_count: over1h,
    over_1h_pct: responded > 0 ? Math.round((over1h / responded) * 1000) / 10 : 0,
  };
}

export async function getFrtSummary(opts: {
  from: string;
  to: string;
  campaignId?: number;
  buildingCode?: string;
}): Promise<FrtSummary> {
  const rows = await loadLeadsForFrt(opts);
  return computeFrtSummary(rows);
}

export async function getFrtPerCampaign(opts: {
  from: string;
  to: string;
  buildingCode?: string;
}): Promise<Array<FrtSummary & { campaign_id: number; campaign_name: string }>> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('ads_leads')
    .select('id, created_at, first_response_at, campaign_id, matched_reservation_id, building_interest, ads_campaigns(name)')
    .gte('created_at', opts.from).lte('created_at', opts.to + 'T23:59:59');
  if (error) { console.error('[frt-per-campaign] query failed:', error); return []; }
  const rows = (data as unknown as Array<{
    id: number;
    created_at: string;
    first_response_at: string | null;
    campaign_id: number | null;
    matched_reservation_id: string | null;
    building_interest: string | null;
    ads_campaigns?: { name: string | null } | null;
  }> | null) ?? [];

  let filtered = rows;
  if (opts.buildingCode) {
    const buildingByReservation = await buildingMapForLeads(sb, rows);
    filtered = rows.filter(r => {
      const bookedBuilding = r.matched_reservation_id ? buildingByReservation.get(r.matched_reservation_id) ?? null : null;
      return attributeLeadToBuilding({ matched_reservation_building: bookedBuilding, building_interest: r.building_interest }) === opts.buildingCode;
    });
  }

  const byCampaign = new Map<number, { name: string; leads: typeof filtered }>();
  for (const r of filtered) {
    if (r.campaign_id == null) continue;
    const cur = byCampaign.get(r.campaign_id) ?? { name: r.ads_campaigns?.name ?? `Campaign ${r.campaign_id}`, leads: [] };
    cur.leads.push(r);
    byCampaign.set(r.campaign_id, cur);
  }
  return Array.from(byCampaign.entries())
    .map(([id, group]) => ({
      campaign_id: id,
      campaign_name: group.name,
      ...computeFrtSummary(group.leads),
    }))
    .sort((a, b) => b.total_leads - a.total_leads);
}

async function loadLeadsForFrt(opts: {
  from: string; to: string;
  campaignId?: number;
  buildingCode?: string;
}): Promise<FrtInput[]> {
  const sb = supabaseAdmin();
  let q = sb.from('ads_leads')
    .select('id, created_at, first_response_at, matched_reservation_id, building_interest')
    .gte('created_at', opts.from).lte('created_at', opts.to + 'T23:59:59');
  if (opts.campaignId) q = q.eq('campaign_id', opts.campaignId);
  const { data, error } = await q;
  if (error) { console.error('[frt] query failed:', error); return []; }
  const rows = (data as Array<{
    id: number;
    created_at: string;
    first_response_at: string | null;
    matched_reservation_id: string | null;
    building_interest: string | null;
  }> | null) ?? [];

  if (!opts.buildingCode) return rows;
  const buildingByReservation = await buildingMapForLeads(sb, rows);
  return rows.filter(r => {
    const bookedBuilding = r.matched_reservation_id ? buildingByReservation.get(r.matched_reservation_id) ?? null : null;
    return attributeLeadToBuilding({ matched_reservation_building: bookedBuilding, building_interest: r.building_interest }) === opts.buildingCode;
  });
}
