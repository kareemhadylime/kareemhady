import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { convertManyToEgp } from '@/lib/fx-rates';
import { UNATTRIBUTED } from '@/lib/beithady/buildings';

export type LeadAttributionInput = {
  matched_reservation_building?: string | null;
  building_interest?: string | null;
};

export function attributeLeadToBuilding(lead: LeadAttributionInput): string {
  const booked = lead.matched_reservation_building?.trim();
  if (booked) return booked;
  const interest = lead.building_interest?.trim();
  if (interest) return interest;
  return UNATTRIBUTED;
}

export type BuildingBreakdownRow = {
  building_code: string;
  leads: number;
  booked: number;
  quality_pct: number;
  spend_share_egp: number;
  spend_share_pct: number;
};

/**
 * For each BH building (+ Unattributed), aggregate leads/bookings in the date
 * range and a proportional spend share. Spend is divided equally across each
 * campaign's `building_codes` array.
 */
export async function getBuildingBreakdown(opts: {
  from: string;
  to: string;
  campaignId?: number;
}): Promise<BuildingBreakdownRow[]> {
  const sb = supabaseAdmin();

  // 1. Pull leads in window (plus the building_interest field) from ads_leads.
  let leadQ = sb.from('ads_leads')
    .select('id, matched_reservation_id, building_interest')
    .gte('created_at', opts.from)
    .lte('created_at', opts.to + 'T23:59:59');
  if (opts.campaignId) leadQ = leadQ.eq('campaign_id', opts.campaignId);
  const { data: leads, error: leadErr } = await leadQ;
  if (leadErr) { console.error('[per-building] leads query failed:', leadErr); return []; }
  const leadRows = (leads as Array<{ id: number; matched_reservation_id: string | null; building_interest: string | null }> | null) ?? [];

  // 2. Look up the building_code for any matched reservation (via listing).
  const reservationIds = leadRows.map(l => l.matched_reservation_id).filter((x): x is string => !!x);
  const buildingByReservation = new Map<string, string>();
  if (reservationIds.length) {
    const { data: resvs } = await sb.from('guesty_reservations')
      .select('id, listing_id')
      .in('id', reservationIds);
    const listingIds = ((resvs as Array<{ id: string; listing_id: string | null }> | null) ?? [])
      .map(r => r.listing_id).filter((x): x is string => !!x);
    if (listingIds.length) {
      const { data: listings } = await sb.from('guesty_listings')
        .select('id, building_code')
        .in('id', listingIds);
      const buildingByListing = new Map<string, string>();
      for (const l of (listings as Array<{ id: string; building_code: string | null }> | null) ?? []) {
        if (l.building_code) buildingByListing.set(l.id, l.building_code);
      }
      for (const r of (resvs as Array<{ id: string; listing_id: string | null }> | null) ?? []) {
        const b = r.listing_id ? buildingByListing.get(r.listing_id) : undefined;
        if (b) buildingByReservation.set(r.id, b);
      }
    }
  }

  // 3. Attribute each lead + tally.
  const tally = new Map<string, { leads: number; booked: number }>();
  for (const l of leadRows) {
    const bookedBuilding = l.matched_reservation_id ? buildingByReservation.get(l.matched_reservation_id) ?? null : null;
    const code = attributeLeadToBuilding({
      matched_reservation_building: bookedBuilding,
      building_interest: l.building_interest,
    });
    const t = tally.get(code) ?? { leads: 0, booked: 0 };
    t.leads += 1;
    if (l.matched_reservation_id) t.booked += 1;
    tally.set(code, t);
  }

  // 4. Spend share: proportional split across campaign.building_codes.
  const { data: dailyMetrics } = await sb.from('ads_daily_metrics')
    .select('campaign_id, spend_micros, account_id')
    .gte('metric_date', opts.from).lte('metric_date', opts.to)
    .is('ad_id', null).is('ad_set_id', null);
  const metricRows = (dailyMetrics as Array<{ campaign_id: number; spend_micros: number | string; account_id: number }> | null) ?? [];
  const campaignIds = Array.from(new Set(metricRows.map(m => m.campaign_id)));
  const { data: campaigns } = campaignIds.length
    ? await sb.from('ads_campaigns').select('id, building_codes').in('id', campaignIds)
    : { data: [] };
  const codesByCampaign = new Map<number, string[]>();
  for (const c of (campaigns as Array<{ id: number; building_codes: string[] | null }> | null) ?? []) {
    codesByCampaign.set(c.id, c.building_codes ?? []);
  }
  const { data: accounts } = await sb.from('ads_accounts').select('id, currency');
  const currencyByAccount = new Map<number, string>();
  for (const a of (accounts as Array<{ id: number; currency: string }> | null) ?? []) {
    currencyByAccount.set(a.id, a.currency);
  }

  // Sum spend per-currency per-building (proportional split), then convert to EGP.
  const spendByBuildingByCurrency = new Map<string, Map<string, number>>();
  for (const m of metricRows) {
    const codes = codesByCampaign.get(m.campaign_id) ?? [];
    if (codes.length === 0) continue;
    const splitMicros = Number(m.spend_micros) / codes.length;
    const currency = currencyByAccount.get(m.account_id) ?? 'USD';
    for (const code of codes) {
      const cm = spendByBuildingByCurrency.get(code) ?? new Map<string, number>();
      cm.set(currency, (cm.get(currency) ?? 0) + splitMicros);
      spendByBuildingByCurrency.set(code, cm);
    }
  }
  const spendEgpByBuilding = new Map<string, number>();
  for (const [code, byCurrency] of spendByBuildingByCurrency) {
    const conv = await convertManyToEgp(
      Array.from(byCurrency.entries()).map(([currency, micros]) => ({ amount: micros / 1_000_000, currency }))
    );
    spendEgpByBuilding.set(code, conv.reduce((s, n) => s + n, 0));
  }
  const totalSpendEgp = Array.from(spendEgpByBuilding.values()).reduce((s, n) => s + n, 0) || 1;

  // 5. Build final rows, sort BH-* alphabetically, Unattributed last.
  const codes = new Set<string>([...tally.keys(), ...spendEgpByBuilding.keys()]);
  const rows: BuildingBreakdownRow[] = Array.from(codes).map(code => {
    const t = tally.get(code) ?? { leads: 0, booked: 0 };
    const spend = spendEgpByBuilding.get(code) ?? 0;
    return {
      building_code: code,
      leads: t.leads,
      booked: t.booked,
      quality_pct: t.leads > 0 ? Math.round((t.booked / t.leads) * 1000) / 10 : 0,
      spend_share_egp: Math.round(spend),
      spend_share_pct: Math.round((spend / totalSpendEgp) * 100),
    };
  });
  rows.sort((a, b) => {
    if (a.building_code === UNATTRIBUTED) return 1;
    if (b.building_code === UNATTRIBUTED) return -1;
    return a.building_code.localeCompare(b.building_code);
  });
  return rows;
}
