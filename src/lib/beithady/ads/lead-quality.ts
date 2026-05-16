import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { attributeLeadToBuilding } from './per-building';
import { buildingMapForLeads } from './funnel';

export type FunnelRowForQuality = {
  campaign_id: number | null;
  campaign_name: string | null;
  platform: 'meta' | 'google' | 'tiktok';
  matched_reservation_id: string | null;
};

export type LeadQualityRow = {
  campaign_id: number;
  campaign_name: string;
  platform: 'meta' | 'google' | 'tiktok';
  leads: number;
  booked: number;
  quality_pct: number;          // booked/leads * 100, 1 decimal
};

export function rollupQualityByCampaign(rows: FunnelRowForQuality[]): LeadQualityRow[] {
  const byCampaign = new Map<number, LeadQualityRow>();
  for (const r of rows) {
    if (r.campaign_id == null) continue;
    const cur = byCampaign.get(r.campaign_id) ?? {
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name ?? `Campaign ${r.campaign_id}`,
      platform: r.platform,
      leads: 0, booked: 0, quality_pct: 0,
    };
    cur.leads += 1;
    if (r.matched_reservation_id) cur.booked += 1;
    byCampaign.set(r.campaign_id, cur);
  }
  return Array.from(byCampaign.values())
    .map(r => ({ ...r, quality_pct: r.leads > 0 ? Math.round((r.booked / r.leads) * 1000) / 10 : 0 }))
    .filter(r => r.leads > 0)
    .sort((a, b) => b.leads - a.leads);
}

export async function getLeadQualityPerCampaign(opts: {
  from: string;
  to: string;
  buildingCode?: string;
}): Promise<LeadQualityRow[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('ads_lead_funnel')
    .select('campaign_id, campaign_name, platform, matched_reservation_id, building_interest')
    .gte('created_at', opts.from)
    .lte('created_at', opts.to + 'T23:59:59');
  if (error) { console.error('[lead-quality] funnel query failed:', error); return []; }
  const rows = (data as Array<FunnelRowForQuality & { building_interest: string | null }> | null) ?? [];

  let filtered = rows;
  if (opts.buildingCode) {
    const buildingByReservation = await buildingMapForLeads(sb, rows);
    filtered = rows.filter(r => {
      const bookedBuilding = r.matched_reservation_id ? buildingByReservation.get(r.matched_reservation_id) ?? null : null;
      return attributeLeadToBuilding({ matched_reservation_building: bookedBuilding, building_interest: r.building_interest }) === opts.buildingCode;
    });
  }
  return rollupQualityByCampaign(filtered);
}
