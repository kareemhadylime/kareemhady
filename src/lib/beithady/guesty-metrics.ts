// CANONICAL Guesty metrics module — single source of truth for ALL reports.
//
// Why this exists:
//   Three reports were producing different "currently staying" numbers for the
//   same date because each had its own inline filter set (gr-brief used 3
//   statuses, finance-brief used 1, build-buildings used a 4th set, etc).
//   This file standardizes the calculation; every brief / dashboard / report
//   now imports from here.
//
// Locked-in semantics (ratified 2026-04-30):
//   * Status     : ('confirmed','checked_in','checked_out')
//   * Stay window: check_in_date <= dateIso AND check_out_date > dateIso
//                  (calendar-overlap = "rooms occupied tonight")
//   * Owner stays + manual blocks: EXCLUDED from main totals, surfaced
//                  separately as "Manual Block Unpaid" line for transparency.
//   * Building bucketing: BH-26 / BH-73 / BH-435 / BH-OK / BH-DXB / OTHER
//                         NULL building_code → OTHER (never silently dropped).
//   * Cairo TZ for "today": all callers pass YYYY-MM-DD already in Cairo wall
//                  time (use cairoYmd() from cairo-dates.ts).

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export const CANONICAL_BOOKED_STATUSES = [
  'confirmed',
  'checked_in',
  'checked_out',
] as const;

export type CanonicalStatus = (typeof CANONICAL_BOOKED_STATUSES)[number];

export type BuildingBucket =
  | 'BH-26'
  | 'BH-73'
  | 'BH-435'
  | 'BH-OK'
  | 'BH-DXB'
  | 'OTHER';

export const CANONICAL_BUILDINGS: readonly BuildingBucket[] = [
  'BH-26',
  'BH-73',
  'BH-435',
  'BH-OK',
  'BH-DXB',
  'OTHER',
];

export type ChannelBucket = 'airbnb' | 'booking_com' | 'other_ota' | 'manual';

export type ResRow = {
  reservation_id: string;
  listing_id: string | null;
  listing_nickname: string | null;
  building: BuildingBucket;
  status: string;
  source: string | null;
  guest_name: string | null;
  guests: number | null;
  nights: number | null;
  check_in_date: string;
  check_out_date: string;
  host_payout: number | null;
  currency: string | null;
  is_owner_stay: boolean;
  is_manual_block: boolean;
};

export type MetricResult = {
  total: number;
  reservations: ResRow[];
  by_building: Record<BuildingBucket, number>;
  by_channel: Record<ChannelBucket, number>;
  manual_block_unpaid: ResRow[];   // owner stays + manual blocks (Q2 ratification)
};

export type RevenueResult = {
  total_usd: number;
  total_native: Record<string, number>;        // by currency code
  by_building: Record<BuildingBucket, number>; // USD
  by_channel: Record<ChannelBucket, number>;   // USD
  reservations: ResRow[];
  manual_block_unpaid_usd: number;
};

export type ScopeOpts = {
  /** Restrict to specific buildings */
  buildings?: BuildingBucket[];
  /** Override status filter (default = canonical 3 statuses) */
  statuses?: readonly string[];
  /** Restrict to a specific listing set */
  listingIds?: string[];
};

// ---------------------------------------------------------------------------
// Building bucketing — single canonical mapper. NULL → OTHER.
// ---------------------------------------------------------------------------
export function bucketBuilding(code: string | null | undefined): BuildingBucket {
  if (!code) return 'OTHER';
  if (code === 'BH-26' || code === 'BH-73' || code === 'BH-435' || code === 'BH-OK' || code === 'BH-DXB') {
    return code as BuildingBucket;
  }
  return 'OTHER';
}

// ---------------------------------------------------------------------------
// Channel bucketing — used by all metrics.
// ---------------------------------------------------------------------------
export function bucketChannelCanonical(source: string | null | undefined): ChannelBucket {
  const s = (source || '').toLowerCase().trim();
  if (!s) return 'manual';
  if (s.includes('airbnb')) return 'airbnb';
  if (s.includes('booking')) return 'booking_com';
  if (
    /(vrbo|expedia|agoda|trip\.com|hotelbeds|hostelworld|hotels\.com|google|despegar|kayak|priceline|rentalsunited)/i.test(
      s
    )
  ) {
    return 'other_ota';
  }
  return 'manual';
}

// ---------------------------------------------------------------------------
// Owner-stay / manual-block detector. Used to split out the "Manual Block
// Unpaid" line. Per Q2 ratification: these reservations are EXCLUDED from
// main totals but listed separately so the team has full visibility.
// ---------------------------------------------------------------------------
function isOwnerOrManualBlock(source: string | null, isManualBlock: boolean): boolean {
  const s = (source || '').toLowerCase();
  return s === 'owner' || isManualBlock === true;
}

function emptyByBuilding(): Record<BuildingBucket, number> {
  return CANONICAL_BUILDINGS.reduce(
    (acc, b) => ({ ...acc, [b]: 0 }),
    {} as Record<BuildingBucket, number>
  );
}

function emptyByChannel(): Record<ChannelBucket, number> {
  return { airbnb: 0, booking_com: 0, other_ota: 0, manual: 0 };
}

// ---------------------------------------------------------------------------
// Core fetcher — pulls reservations matching a date predicate, joins to
// listings + overrides, normalizes to ResRow. Used by all metric funcs.
// ---------------------------------------------------------------------------
type DatePredicate =
  | { kind: 'check_in_eq'; date: string }
  | { kind: 'check_out_eq'; date: string }
  | { kind: 'overlap'; date: string }                  // check_in <= date AND check_out > date
  | { kind: 'created_in'; from: string; to: string }   // created_at_odoo in [from, to)
  | { kind: 'stay_in'; from: string; to: string };     // any stay overlapping [from, to]

async function fetchReservations(
  predicate: DatePredicate,
  opts: ScopeOpts
): Promise<ResRow[]> {
  const sb = supabaseAdmin();
  const statuses = opts.statuses ?? CANONICAL_BOOKED_STATUSES;

  // Base query — uses raw guesty_reservations + LEFT JOIN to listings
  // (and overrides for is_manual_block). We deliberately don't use the
  // beithady_reservation_grid_v view here because the canonical layer
  // owns its own filter logic and shouldn't depend on view internals.
  let q = sb
    .from('guesty_reservations')
    .select(
      `id, listing_id, listing_nickname, status, source, guest_name, guests,
       nights, check_in_date, check_out_date, host_payout, currency,
       created_at_odoo,
       listing:guesty_listings!left(building_code),
       override:beithady_reservation_overrides!reservation_id(is_manual_block)`
    );

  switch (predicate.kind) {
    case 'check_in_eq':
      q = q.eq('check_in_date', predicate.date);
      break;
    case 'check_out_eq':
      q = q.eq('check_out_date', predicate.date);
      break;
    case 'overlap':
      q = q.lte('check_in_date', predicate.date).gt('check_out_date', predicate.date);
      break;
    case 'created_in':
      q = q.gte('created_at_odoo', predicate.from).lt('created_at_odoo', predicate.to);
      break;
    case 'stay_in':
      q = q.lte('check_in_date', predicate.to).gte('check_out_date', predicate.from);
      break;
  }

  if (statuses.length) q = q.in('status', statuses as string[]);
  if (opts.listingIds?.length) q = q.in('listing_id', opts.listingIds);

  const { data, error } = await q;
  if (error) throw new Error(`guesty-metrics fetch failed: ${error.message}`);

  type Raw = {
    id: string;
    listing_id: string | null;
    listing_nickname: string | null;
    status: string;
    source: string | null;
    guest_name: string | null;
    guests: number | null;
    nights: number | null;
    check_in_date: string;
    check_out_date: string;
    host_payout: number | string | null;
    currency: string | null;
    listing: { building_code: string | null } | { building_code: string | null }[] | null;
    override: { is_manual_block: boolean | null } | { is_manual_block: boolean | null }[] | null;
  };

  let rows = (data || []) as Raw[];

  // Building scope filter (post-fetch — Supabase nested filter is unreliable)
  const wantedBuildings = opts.buildings ? new Set(opts.buildings) : null;

  return rows
    .map(r => {
      const lst = Array.isArray(r.listing) ? r.listing[0] : r.listing;
      const ovr = Array.isArray(r.override) ? r.override[0] : r.override;
      const building = bucketBuilding(lst?.building_code ?? null);
      return {
        reservation_id: r.id,
        listing_id: r.listing_id,
        listing_nickname: r.listing_nickname,
        building,
        status: r.status,
        source: r.source,
        guest_name: r.guest_name,
        guests: r.guests,
        nights: r.nights,
        check_in_date: r.check_in_date,
        check_out_date: r.check_out_date,
        host_payout: r.host_payout != null ? Number(r.host_payout) : null,
        currency: r.currency || 'USD',
        is_owner_stay: (r.source || '').toLowerCase() === 'owner',
        is_manual_block: ovr?.is_manual_block === true,
      } as ResRow;
    })
    .filter(r => !wantedBuildings || wantedBuildings.has(r.building));
}

// ---------------------------------------------------------------------------
// Public API — 5 canonical functions
// ---------------------------------------------------------------------------

export async function getCheckIns(
  dateIso: string,
  opts: ScopeOpts = {}
): Promise<MetricResult> {
  const all = await fetchReservations({ kind: 'check_in_eq', date: dateIso }, opts);
  return summarize(all);
}

export async function getCheckOuts(
  dateIso: string,
  opts: ScopeOpts = {}
): Promise<MetricResult> {
  const all = await fetchReservations({ kind: 'check_out_eq', date: dateIso }, opts);
  return summarize(all);
}

export async function getCurrentlyStaying(
  dateIso: string,
  opts: ScopeOpts = {}
): Promise<MetricResult> {
  const all = await fetchReservations({ kind: 'overlap', date: dateIso }, opts);
  return summarize(all);
}

export async function getMtdRevenueByStay(
  dateIso: string,
  opts: ScopeOpts = {}
): Promise<RevenueResult> {
  const monthStart = dateIso.slice(0, 7) + '-01';
  const all = await fetchReservations({ kind: 'stay_in', from: monthStart, to: dateIso }, opts);
  return summarizeRevenue(all, monthStart, dateIso);
}

export async function getMtdRevenueByBooking(
  dateIso: string,
  opts: ScopeOpts = {}
): Promise<RevenueResult> {
  const monthStart = dateIso.slice(0, 7) + '-01';
  // Cairo timezone offset: +2 standard, +3 DST. Use +2 baseline; the date
  // string boundary is approximate but consistent across reports.
  const fromUtc = `${monthStart}T00:00:00+02:00`;
  const toUtc = `${addDay(dateIso)}T00:00:00+02:00`;
  const all = await fetchReservations(
    { kind: 'created_in', from: fromUtc, to: toUtc },
    { ...opts, statuses: opts.statuses ?? CANONICAL_BOOKED_STATUSES }
  );
  return summarizeRevenue(all, monthStart, dateIso);
}

function addDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Summarizers
// ---------------------------------------------------------------------------
function summarize(all: ResRow[]): MetricResult {
  const main: ResRow[] = [];
  const block: ResRow[] = [];
  for (const r of all) {
    if (isOwnerOrManualBlock(r.source, r.is_manual_block)) block.push(r);
    else main.push(r);
  }
  const by_building = emptyByBuilding();
  const by_channel = emptyByChannel();
  const seenListings = new Set<string>();
  for (const r of main) {
    if (r.listing_id && !seenListings.has(r.listing_id)) {
      seenListings.add(r.listing_id);
      by_building[r.building] += 1;
      by_channel[bucketChannelCanonical(r.source)] += 1;
    }
  }
  return {
    total: seenListings.size,
    reservations: main,
    by_building,
    by_channel,
    manual_block_unpaid: block,
  };
}

function summarizeRevenue(
  all: ResRow[],
  monthStart: string,
  dateIso: string
): RevenueResult {
  const main: ResRow[] = [];
  const block: ResRow[] = [];
  for (const r of all) {
    if (isOwnerOrManualBlock(r.source, r.is_manual_block)) block.push(r);
    else main.push(r);
  }

  let totalUsd = 0;
  let blockUsd = 0;
  const byCurrency: Record<string, number> = {};
  const byBuilding = emptyByBuilding();
  const byChannel = emptyByChannel();

  function allocate(r: ResRow): number {
    // Pro-rate by overlap fraction of stay nights in month-to-date window
    if (r.host_payout == null) return 0;
    const totalNights = r.nights || 0;
    if (totalNights <= 0) return Number(r.host_payout);
    const overlap = nightsOverlap(r.check_in_date, r.check_out_date, monthStart, dateIso);
    if (overlap <= 0) return 0;
    return (Number(r.host_payout) * overlap) / totalNights;
  }

  for (const r of main) {
    const amt = allocate(r);
    totalUsd += amt; // currency assumed USD per report convention
    const cur = (r.currency || 'USD').toUpperCase();
    byCurrency[cur] = (byCurrency[cur] || 0) + amt;
    byBuilding[r.building] += amt;
    byChannel[bucketChannelCanonical(r.source)] += amt;
  }

  for (const r of block) {
    blockUsd += allocate(r);
  }

  return {
    total_usd: totalUsd,
    total_native: byCurrency,
    by_building: byBuilding,
    by_channel: byChannel,
    reservations: main,
    manual_block_unpaid_usd: blockUsd,
  };
}

function nightsOverlap(
  inDate: string | null,
  outDate: string | null,
  fromIso: string,
  toIso: string
): number {
  if (!inDate || !outDate) return 0;
  const a = Math.max(Date.parse(inDate + 'T00:00:00Z'), Date.parse(fromIso + 'T00:00:00Z'));
  const tEnd = new Date(Date.parse(toIso + 'T00:00:00Z') + 86400000)
    .toISOString()
    .slice(0, 10);
  const b = Math.min(
    Date.parse(outDate + 'T00:00:00Z'),
    Date.parse(tEnd + 'T00:00:00Z')
  );
  if (b <= a) return 0;
  return Math.round((b - a) / 86400000);
}

// ---------------------------------------------------------------------------
// Transparency footer — every report calls this to render a one-line
// disclosure of filter semantics. So the team can sanity-check at a glance.
// ---------------------------------------------------------------------------
export const CANONICAL_FOOTER_EN =
  '_Source: guesty-metrics · status=confirmed/checked_in/checked_out · stay = check_in≤today<check_out · owner+manual blocks listed separately_';

export const CANONICAL_FOOTER_AR =
  '_المصدر: guesty-metrics · الحالة=مؤكد/تسجيل دخول/تسجيل خروج · الإقامة = دخول≤اليوم<خروج · الحجوزات اليدوية مدرجة منفصلة_';
