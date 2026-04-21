import { supabaseAdmin } from './supabase';

export type PricingListingRow = {
  id: string;
  name: string;
  building_code: string | null;
  bedrooms: number | null;
  push_enabled: boolean | null;
  base: number | null;
  min_price: number | null;
  max_price: number | null;
  adr_past_30: number | null;
  stly_adr_past_30: number | null;
  adr_yoy_pct: number | null;
  revenue_past_30: number | null;
  stly_revenue_past_30: number | null;
  revenue_yoy_pct: number | null;
  booking_pickup_past_30: number | null;
  occupancy_next_7: number | null;
  market_occupancy_next_7: number | null;
  occupancy_next_30: number | null;
  market_occupancy_next_30: number | null;
  occupancy_next_60: number | null;
  market_occupancy_next_60: number | null;
  occupancy_30_delta: number | null; // own - market (positive = outperforming)
  recommended_base_price: number | null;
  rec_base_unavailable: boolean;
  last_date_pushed: string | null;
  last_refreshed_at: string | null;
  channels: Array<{ name: string; id: string }>;
};

export type PricingBuildingSummary = {
  building_code: string;
  listings: number;
  units_pushing: number;
  avg_base: number | null;
  avg_adr_past_30: number | null;
  total_revenue_past_30: number | null;
  total_stly_revenue_past_30: number | null;
  revenue_yoy_pct: number | null;
  avg_occupancy_next_30: number | null;
  avg_market_occupancy_next_30: number | null;
  occupancy_delta_30: number | null;
  with_recs: number;
};

export type PricingReport = {
  snapshot_date: string;
  total_listings: number;
  total_rev_intel_listings: number; // listings with a snapshot for this date
  total_push_enabled: number;
  totals: {
    avg_adr_past_30: number | null;
    total_revenue_past_30: number | null;
    total_stly_revenue_past_30: number | null;
    revenue_yoy_pct: number | null;
    avg_occupancy_next_30: number | null;
    avg_market_occupancy_next_30: number | null;
  };
  by_building: PricingBuildingSummary[];
  listings: PricingListingRow[];
  latest_sync: {
    finished_at: string | null;
    listings_synced: number;
    snapshots_written: number;
  } | null;
};

function yoyPct(curr: number | null, stly: number | null): number | null {
  if (curr == null || stly == null || !Number.isFinite(stly) || stly === 0) return null;
  return ((curr - stly) / Math.abs(stly)) * 100;
}

function avg(nums: Array<number | null>): number | null {
  const v = nums.filter((n): n is number => n != null && Number.isFinite(n));
  if (!v.length) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

function sumNonNull(nums: Array<number | null>): number | null {
  const v = nums.filter((n): n is number => n != null && Number.isFinite(n));
  if (!v.length) return null;
  return v.reduce((s, x) => s + x, 0);
}

export async function buildPricingReport(
  opts: { snapshotDate?: string } = {}
): Promise<PricingReport> {
  const sb = supabaseAdmin();

  // Determine snapshot date: most recent snapshot in the DB if not provided.
  let snapshotDate = opts.snapshotDate || null;
  if (!snapshotDate) {
    const { data: latest } = await sb
      .from('pricelabs_listing_snapshots')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    snapshotDate = (latest as { snapshot_date: string } | null)?.snapshot_date || null;
  }

  if (!snapshotDate) {
    return {
      snapshot_date: '',
      total_listings: 0,
      total_rev_intel_listings: 0,
      total_push_enabled: 0,
      totals: {
        avg_adr_past_30: null,
        total_revenue_past_30: null,
        total_stly_revenue_past_30: null,
        revenue_yoy_pct: null,
        avg_occupancy_next_30: null,
        avg_market_occupancy_next_30: null,
      },
      by_building: [],
      listings: [],
      latest_sync: await fetchLatestSync(),
    };
  }

  // Listings (catalog info)
  const { data: listingRows } = await sb
    .from('pricelabs_listings')
    .select(
      'id, name, building_code, bedrooms, push_enabled'
    )
    .order('building_code', { nullsFirst: false })
    .order('name');

  const listings = (listingRows as Array<{
    id: string;
    name: string | null;
    building_code: string | null;
    bedrooms: number | null;
    push_enabled: boolean | null;
  }>) || [];

  // Snapshots for the selected date
  const { data: snapRows } = await sb
    .from('pricelabs_listing_snapshots')
    .select('*')
    .eq('snapshot_date', snapshotDate);
  type SnapRow = { listing_id: string } & Record<string, unknown>;
  const snapsByListing = new Map<string, SnapRow>();
  for (const s of (snapRows as SnapRow[]) || []) {
    snapsByListing.set(s.listing_id, s);
  }

  // Channels
  const { data: channelRows } = await sb
    .from('pricelabs_channels')
    .select('listing_id, channel_name, channel_listing_id');
  const channelsByListing = new Map<
    string,
    Array<{ name: string; id: string }>
  >();
  for (const ch of (channelRows as Array<{
    listing_id: string;
    channel_name: string;
    channel_listing_id: string;
  }>) || []) {
    const arr = channelsByListing.get(ch.listing_id) || [];
    arr.push({ name: ch.channel_name, id: ch.channel_listing_id });
    channelsByListing.set(ch.listing_id, arr);
  }

  const rows: PricingListingRow[] = listings.map(l => {
    const s = (snapsByListing.get(l.id) || {}) as Record<string, unknown>;
    const adr = numberOrNull(s.adr_past_30);
    const stlyAdr = numberOrNull(s.stly_adr_past_30);
    const rev = numberOrNull(s.revenue_past_30);
    const stlyRev = numberOrNull(s.stly_revenue_past_30);
    const occ30 = numberOrNull(s.occupancy_next_30);
    const mktOcc30 = numberOrNull(s.market_occupancy_next_30);
    return {
      id: l.id,
      name: l.name || l.id,
      building_code: l.building_code,
      bedrooms: l.bedrooms,
      push_enabled: l.push_enabled,
      base: numberOrNull(s.base),
      min_price: numberOrNull(s.min_price),
      max_price: numberOrNull(s.max_price),
      adr_past_30: adr,
      stly_adr_past_30: stlyAdr,
      adr_yoy_pct: yoyPct(adr, stlyAdr),
      revenue_past_30: rev,
      stly_revenue_past_30: stlyRev,
      revenue_yoy_pct: yoyPct(rev, stlyRev),
      booking_pickup_past_30: numberOrNull(s.booking_pickup_past_30),
      occupancy_next_7: numberOrNull(s.occupancy_next_7),
      market_occupancy_next_7: numberOrNull(s.market_occupancy_next_7),
      occupancy_next_30: occ30,
      market_occupancy_next_30: mktOcc30,
      occupancy_next_60: numberOrNull(s.occupancy_next_60),
      market_occupancy_next_60: numberOrNull(s.market_occupancy_next_60),
      occupancy_30_delta:
        occ30 != null && mktOcc30 != null ? occ30 - mktOcc30 : null,
      recommended_base_price: numberOrNull(s.recommended_base_price),
      rec_base_unavailable: Boolean(s.rec_base_unavailable),
      last_date_pushed: stringOrNull(s.last_date_pushed),
      last_refreshed_at: stringOrNull(s.last_refreshed_at),
      channels: channelsByListing.get(l.id) || [],
    };
  });

  const totalRevIntel = rows.filter(r => r.adr_past_30 != null).length;
  const totalPush = rows.filter(r => r.push_enabled === true).length;

  // Totals
  const totRev = sumNonNull(rows.map(r => r.revenue_past_30));
  const totStlyRev = sumNonNull(rows.map(r => r.stly_revenue_past_30));
  const totals = {
    avg_adr_past_30: avg(rows.map(r => r.adr_past_30)),
    total_revenue_past_30: totRev,
    total_stly_revenue_past_30: totStlyRev,
    revenue_yoy_pct: yoyPct(totRev, totStlyRev),
    avg_occupancy_next_30: avg(rows.map(r => r.occupancy_next_30)),
    avg_market_occupancy_next_30: avg(rows.map(r => r.market_occupancy_next_30)),
  };

  // Building summaries
  const byBuildingMap = new Map<string, PricingListingRow[]>();
  for (const r of rows) {
    const key = r.building_code || 'untagged';
    const arr = byBuildingMap.get(key) || [];
    arr.push(r);
    byBuildingMap.set(key, arr);
  }
  const by_building: PricingBuildingSummary[] = Array.from(byBuildingMap.entries())
    .map(([building_code, items]) => {
      const bRev = sumNonNull(items.map(i => i.revenue_past_30));
      const bStly = sumNonNull(items.map(i => i.stly_revenue_past_30));
      const occ30 = avg(items.map(i => i.occupancy_next_30));
      const mktOcc30 = avg(items.map(i => i.market_occupancy_next_30));
      return {
        building_code,
        listings: items.length,
        units_pushing: items.filter(i => i.push_enabled === true).length,
        avg_base: avg(items.map(i => i.base)),
        avg_adr_past_30: avg(items.map(i => i.adr_past_30)),
        total_revenue_past_30: bRev,
        total_stly_revenue_past_30: bStly,
        revenue_yoy_pct: yoyPct(bRev, bStly),
        avg_occupancy_next_30: occ30,
        avg_market_occupancy_next_30: mktOcc30,
        occupancy_delta_30:
          occ30 != null && mktOcc30 != null ? occ30 - mktOcc30 : null,
        with_recs: items.filter(
          i => i.recommended_base_price != null && !i.rec_base_unavailable
        ).length,
      };
    })
    .sort((a, b) => {
      // canonical order: BH-26, BH-34, BH-73, BH-435, BH-OK, untagged
      const order = ['BH-26', 'BH-34', 'BH-73', 'BH-435', 'BH-OK'];
      const ai = order.indexOf(a.building_code);
      const bi = order.indexOf(b.building_code);
      return (
        (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) ||
        a.building_code.localeCompare(b.building_code)
      );
    });

  return {
    snapshot_date: snapshotDate,
    total_listings: rows.length,
    total_rev_intel_listings: totalRevIntel,
    total_push_enabled: totalPush,
    totals,
    by_building,
    listings: rows,
    latest_sync: await fetchLatestSync(),
  };
}

async function fetchLatestSync() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('pricelabs_sync_runs')
    .select('finished_at, listings_synced, snapshots_written')
    .eq('status', 'succeeded')
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as {
    finished_at: string | null;
    listings_synced: number;
    snapshots_written: number;
  } | null;
}

function numberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
