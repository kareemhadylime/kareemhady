import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { bucketFromGuestyListing, isExcludedFromReport, loadBuildingInventories } from '@/lib/beithady-daily-report/units';
import { BUILDING_CODES, type BuildingCode } from '@/lib/beithady-daily-report/types';

// Slim live query for the dashboard's "today" daily-activity strip.
// The cron-built snapshot describes YESTERDAY's completed period (it runs
// at 09:00 Cairo to recap the day before). For an at-a-glance "what's
// happening on the property right now" view, the dashboard needs LIVE
// numbers from `guesty_reservations` instead of the snapshot.
//
// Returned shape mirrors the relevant subset of `BuildingBucket` so it can
// be merged into the dashboard's existing payload-driven panels with no
// component rewrites — the LandingPulse / DailyActivity panel just sees a
// payload whose `all` and `per_building` daily fields point at right-now
// data while everything else (MTD, reviews, AI insights) keeps coming
// from the snapshot.
//
// Honors the BH-DXB Egypt-only exclusion (per the standing rule from
// 2026-04-30) so the numbers stay consistent with every other Beit Hady
// aggregate. Guesty's UI includes DXB and will read 2-3 units higher;
// flag the gap to users via the eyebrow rather than fudging the totals.

const ACTIVE_STATUSES = new Set(['confirmed', 'checked_in', 'checked_out']);

export type LiveDailyActivityBucket = {
  total_units: number;
  occupied_today: number;
  occupancy_today_pct: number;
  check_ins_today: number;
  check_outs_today: number;
  turnovers_today: number;
};

export type DxbCounts = {
  check_ins_today: number;
  check_outs_today: number;
  turnovers_today: number;
  occupied_today: number;
};

export type LiveDailyActivity = {
  /** YMD the activity is computed for. */
  date: string;
  all: LiveDailyActivityBucket;
  per_building: Record<BuildingCode, LiveDailyActivityBucket>;
  /** UAE/DXB units — tracked separately so callers can display them as a
   *  supplementary figure without polluting the Egypt-only totals. */
  dxb: DxbCounts;
};

function emptyBucket(total_units = 0): LiveDailyActivityBucket {
  return {
    total_units,
    occupied_today: 0,
    occupancy_today_pct: 0,
    check_ins_today: 0,
    check_outs_today: 0,
    turnovers_today: 0,
  };
}

export async function loadDailyActivityLive(date: string): Promise<LiveDailyActivity> {
  const sb = supabaseAdmin();

  // Pull active inventory + reservations whose stay touches `date`.
  // The reservation predicate `check_in_date <= date AND check_out_date >= date`
  // catches everyone who's checking in today, checking out today, or
  // mid-stay across today.
  const [inventories, { data: reservations }] = await Promise.all([
    loadBuildingInventories(),
    sb
      .from('guesty_reservations')
      .select(
        'id, listing_id, guest_name, check_in_date, check_out_date, status, listing:guesty_listings!left(building_code)',
      )
      .lte('check_in_date', date)
      .gte('check_out_date', date)
      .in('status', Array.from(ACTIVE_STATUSES)),
  ]);

  // Initialize per-building buckets from inventory (gives us total_units).
  const perBuilding: Record<BuildingCode, LiveDailyActivityBucket> = {
    'BH-26': emptyBucket(inventories['BH-26']?.total_units ?? 0),
    'BH-73': emptyBucket(inventories['BH-73']?.total_units ?? 0),
    'BH-435': emptyBucket(inventories['BH-435']?.total_units ?? 0),
    'BH-OK': emptyBucket(inventories['BH-OK']?.total_units ?? 0),
    OTHER: emptyBucket(inventories.OTHER?.total_units ?? 0),
  };

  // UAE/DXB accumulator (excluded from Egypt totals, surfaced as a sidebar count).
  const dxb: DxbCounts = { check_ins_today: 0, check_outs_today: 0, turnovers_today: 0, occupied_today: 0 };
  const dxbCheckinsByListing  = new Set<string>();
  const dxbCheckoutsByListing = new Set<string>();

  // Per-listing turnover detection: the same listing has BOTH a checkin
  // and a checkout today.
  const checkoutsByListing = new Set<string>();
  const checkinsByListing  = new Set<string>();

  // Pre-compute same-guest renewals: same listing has checkout AND checkin today with identical guest name.
  // These are booking extensions — not real turnovers and Guesty hides them from daily check-in counts.
  const _checkoutGuests = new Map<string, string | null>();
  const renewedListings = new Set<string>();
  for (const raw of (reservations as Array<Record<string, unknown>> | null) || []) {
    const rr = raw as { listing_id?: string | null; guest_name?: string | null; check_out_date?: string | null };
    if (rr.check_out_date === date && rr.listing_id) _checkoutGuests.set(rr.listing_id, rr.guest_name ?? null);
  }
  for (const raw of (reservations as Array<Record<string, unknown>> | null) || []) {
    const rr = raw as { listing_id?: string | null; guest_name?: string | null; check_in_date?: string | null };
    if (rr.check_in_date === date && rr.listing_id) {
      const outGuest = _checkoutGuests.get(rr.listing_id);
      if (outGuest != null && outGuest === (rr.guest_name ?? null)) renewedListings.add(rr.listing_id);
    }
  }

  type ResRow = {
    id: string;
    listing_id: string | null;
    guest_name: string | null;
    check_in_date: string | null;
    check_out_date: string | null;
    status: string | null;
    listing: { building_code: string | null } | null;
  };
  for (const raw of (reservations as Array<Record<string, unknown>> | null) || []) {
    const r = raw as unknown as ResRow;
    const listingBuilding = r.listing?.building_code ?? null;
    // UAE/DXB — accumulate separately, then skip Egypt buckets.
    if (isExcludedFromReport(listingBuilding)) {
      const ci = r.check_in_date  === date;
      const co = r.check_out_date === date;
      const oc = r.check_in_date != null && r.check_out_date != null &&
        r.check_in_date <= date && (r.check_out_date > date || (ci && co));
      if (ci) dxb.check_ins_today  += 1;
      if (co) dxb.check_outs_today += 1;
      if (oc) dxb.occupied_today   += 1;
      if (r.listing_id && ci) dxbCheckinsByListing.add(r.listing_id);
      if (r.listing_id && co) dxbCheckoutsByListing.add(r.listing_id);
      continue;
    }
    const bucket = bucketFromGuestyListing({
      building_code: listingBuilding,
      id: r.listing_id ?? undefined,
    });
    const tile = perBuilding[bucket];
    if (!tile) continue;

    const checksInToday = r.check_in_date === date && !(r.listing_id && renewedListings.has(r.listing_id));
    const checksOutToday = r.check_out_date === date && !(r.listing_id && renewedListings.has(r.listing_id));
    // Occupancy: present at any point during today =
    // check_in_date <= date AND check_out_date > date. Same-day flips
    // (check_in_date === date AND check_out_date === date) count as
    // occupied for the day in standard hospitality math.
    const occupiedToday =
      r.check_in_date != null &&
      r.check_out_date != null &&
      r.check_in_date <= date &&
      (r.check_out_date > date || (checksInToday && checksOutToday));

    if (checksInToday) tile.check_ins_today += 1;
    if (checksOutToday) tile.check_outs_today += 1;
    if (occupiedToday) tile.occupied_today += 1;

    if (r.listing_id && checksInToday) checkinsByListing.add(`${bucket}::${r.listing_id}`);
    if (r.listing_id && checksOutToday) checkoutsByListing.add(`${bucket}::${r.listing_id}`);
  }

  // Turnovers = listings with both a checkin AND a checkout today.
  for (const key of checkinsByListing) {
    if (checkoutsByListing.has(key)) {
      const [bucket] = key.split('::') as [BuildingCode];
      perBuilding[bucket].turnovers_today += 1;
    }
  }
  // DXB turnovers (same-unit same-day flip within UAE portfolio).
  for (const id of dxbCheckinsByListing) {
    if (dxbCheckoutsByListing.has(id)) dxb.turnovers_today += 1;
  }

  // Compute occupancy %
  for (const code of BUILDING_CODES) {
    const t = perBuilding[code];
    t.occupancy_today_pct = t.total_units > 0 ? (t.occupied_today / t.total_units) * 100 : 0;
  }

  // Aggregate "all" bucket as the sum across buildings (excludes DXB by
  // construction since DXB reservations were already filtered out).
  const all: LiveDailyActivityBucket = emptyBucket(inventories.total_all ?? 0);
  for (const code of BUILDING_CODES) {
    const t = perBuilding[code];
    all.check_ins_today += t.check_ins_today;
    all.check_outs_today += t.check_outs_today;
    all.turnovers_today += t.turnovers_today;
    all.occupied_today += t.occupied_today;
  }
  all.occupancy_today_pct = all.total_units > 0 ? (all.occupied_today / all.total_units) * 100 : 0;

  return { date, all, per_building: perBuilding, dxb };
}
