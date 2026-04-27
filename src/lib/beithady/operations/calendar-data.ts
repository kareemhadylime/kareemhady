import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchMtlParentIds, isBookableAtom } from '@/lib/beithady/mtl';
import { channelMeta } from './channel-meta';
import type {
  CalendarRow,
  CalendarReservation,
  AnomalySnapshot,
  CalendarFilters,
  CalendarGridData,
} from './types';

// ISO date helpers (local-time naive — calendar windows always span
// whole days, so we use plain YYYY-MM-DD strings throughout).
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() + n);
  return r;
}

// Compute the row's status flag from its *next* reservation arriving
// within 14 days. Mirrors the polarity in the workflow plan §5.
function statusDotFor(
  rowReservations: CalendarReservation[],
  nowIso: string,
): CalendarRow['status_dot'] {
  const upcoming = rowReservations
    .filter(r => r.check_in_date >= nowIso && r.status !== 'canceled')
    .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date))[0];
  if (!upcoming) return 'gray';
  const days = Math.round(
    (new Date(upcoming.check_in_date).getTime() - new Date(nowIso).getTime())
      / 86400000
  );
  if (days > 14) return 'gray';
  if (upcoming.is_vip || ['platinum', 'gold', 'vip'].includes((upcoming.loyalty_tier || '').toLowerCase())) {
    return 'purple';
  }
  if (upcoming.flagged_unpaid && days <= 7) return 'red';
  if (upcoming.flagged_prearrival_missing && days <= 2) return 'yellow';
  return 'green';
}

export async function getCalendarGridData(opts: {
  startDate: Date;
  daysCount: number;
  filters?: CalendarFilters;
}): Promise<CalendarGridData> {
  const sb = supabaseAdmin();
  const start = isoDate(opts.startDate);
  const end = isoDate(addDays(opts.startDate, opts.daysCount));
  const nowIso = isoDate(new Date());

  // 1. Bookable atoms (children + standalones) — uses Phase J MTL helper.
  // Listings with no building_code (e.g. BH-MG-20-1 Madinaty units) are
  // bucketed into a synthetic 'OTHER' building so they still appear on
  // the calendar, just under the Other group rather than being silently
  // dropped.
  const parentIds = await fetchMtlParentIds();
  const wantedBuildings = opts.filters?.buildings;
  const includeOther = !wantedBuildings || wantedBuildings.length === 0 || wantedBuildings.includes('OTHER');
  const namedBuildings = (wantedBuildings || []).filter(b => b !== 'OTHER');

  let listingsQ = sb
    .from('guesty_listings')
    .select('id, nickname, title, master_listing_id, building_code')
    .eq('active', true);
  if (namedBuildings.length > 0 && !includeOther) {
    listingsQ = listingsQ.in('building_code', namedBuildings);
  } else if (namedBuildings.length > 0 && includeOther) {
    // Want named + OTHER (NULL) → use OR filter
    const inExpr = namedBuildings.map(b => `building_code.eq.${b}`).join(',');
    listingsQ = listingsQ.or(`${inExpr},building_code.is.null`);
  } // else: no filter — fetch everything
  const { data: allListings } = await listingsQ;
  const allListingRows = (allListings as Array<{
    id: string;
    nickname: string | null;
    title: string | null;
    master_listing_id: string | null;
    building_code: string | null;
  }> | null) || [];

  const bookable = allListingRows
    .filter(l => isBookableAtom(l, parentIds))
    .map(l => ({ ...l, building_code: l.building_code || 'OTHER' }))
    .sort((a, b) => (a.nickname || '').localeCompare(b.nickname || ''));

  // 2. Latest pricelabs snapshot per listing for the price column +
  //    occupancy/ADR/revenue for the heatmap overlay (J.9).
  const listingIds = bookable.map(l => l.id);
  const { data: priceRows } = listingIds.length > 0
    ? await sb
        .from('pricelabs_listing_snapshots')
        .select('listing_id, recommended_base_price, base, occupancy_next_30, adr_past_30, revenue_past_30, snapshot_date')
        .in('listing_id', listingIds)
        .order('snapshot_date', { ascending: false })
    : { data: [] };
  const priceByListing = new Map<string, number>();
  const metricsByListing = new Map<string, {
    occupancy_next_30: number | null;
    adr_past_30: number | null;
    revenue_past_30: number | null;
  }>();
  for (const r of (priceRows as Array<{
    listing_id: string;
    recommended_base_price: number | null;
    base: number | null;
    occupancy_next_30: number | null;
    adr_past_30: number | null;
    revenue_past_30: number | null;
  }> | null) || []) {
    if (priceByListing.has(r.listing_id)) continue;
    const v = r.recommended_base_price ?? r.base;
    if (v != null) priceByListing.set(r.listing_id, Number(v));
    metricsByListing.set(r.listing_id, {
      occupancy_next_30: r.occupancy_next_30 != null ? Number(r.occupancy_next_30) : null,
      adr_past_30: r.adr_past_30 != null ? Number(r.adr_past_30) : null,
      revenue_past_30: r.revenue_past_30 != null ? Number(r.revenue_past_30) : null,
    });
  }

  // 2b. Comp-set median per (building_code, bedroom_bucket). Used for
  //     the up/down triangle on price cells (J.9 improvement #3).
  const { data: pricelabsListings } = listingIds.length > 0
    ? await sb
        .from('pricelabs_listings')
        .select('id, bedrooms')
        .in('id', listingIds)
    : { data: [] };
  const bedroomsByListing = new Map<string, number>();
  for (const r of (pricelabsListings as Array<{ id: string; bedrooms: number | null }> | null) || []) {
    if (r.bedrooms != null) bedroomsByListing.set(r.id, r.bedrooms);
  }
  const buildings = Array.from(new Set(bookable.map(l => l.building_code).filter((b): b is string => Boolean(b))));
  const { data: marketRows } = buildings.length > 0
    ? await sb
        .from('pricelabs_market_snapshots')
        .select('building_code, bedroom_bucket, comp_median_usd, snapshot_date')
        .in('building_code', buildings)
        .order('snapshot_date', { ascending: false })
    : { data: [] };
  const compByKey = new Map<string, number>();
  for (const r of (marketRows as Array<{
    building_code: string;
    bedroom_bucket: string;
    comp_median_usd: number | null;
  }> | null) || []) {
    const key = `${r.building_code}|${r.bedroom_bucket}`;
    if (compByKey.has(key)) continue;
    if (r.comp_median_usd != null) compByKey.set(key, Number(r.comp_median_usd));
  }
  const compForListing = (listingId: string, building: string | null): number | null => {
    if (!building) return null;
    const beds = bedroomsByListing.get(listingId);
    if (beds == null) return null;
    const bucket = beds === 0 ? 'studio' : beds === 1 ? '1br' : beds === 2 ? '2br' : beds >= 3 ? '3br+' : null;
    if (!bucket) return null;
    return compByKey.get(`${building}|${bucket}`) ?? null;
  };

  // 3. Cover thumbnails — first photo per listing in the gallery (best-effort).
  const { data: coverRows } = listingIds.length > 0
    ? await sb
        .from('beithady_gallery_assets')
        .select('listing_id, public_url, storage_path, storage_bucket')
        .in('listing_id', listingIds)
        .eq('category', 'photo')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
    : { data: [] };
  const coverByListing = new Map<string, string>();
  for (const r of (coverRows as Array<{
    listing_id: string;
    public_url: string | null;
    storage_path: string;
    storage_bucket: string;
  }> | null) || []) {
    if (coverByListing.has(r.listing_id)) continue;
    if (r.public_url) coverByListing.set(r.listing_id, r.public_url);
  }

  // 4. Reservations for the window from the joined view.
  let resQ = sb
    .from('beithady_reservation_grid_v')
    .select('*')
    .gte('check_out_date', start)
    .lte('check_in_date', end);
  if (listingIds.length > 0) {
    resQ = resQ.in('listing_id', listingIds);
  }
  if (opts.filters?.statusFilter && opts.filters.statusFilter !== 'all') {
    resQ = resQ.eq('status', opts.filters.statusFilter);
  }
  if (opts.filters?.channels && opts.filters.channels.length > 0) {
    resQ = resQ.in('channel', opts.filters.channels);
  }
  if (opts.filters?.riskFilter === 'unpaid') {
    resQ = resQ.eq('flagged_unpaid', true);
  } else if (opts.filters?.riskFilter === 'prearrival_missing') {
    resQ = resQ.eq('flagged_prearrival_missing', true);
  } else if (opts.filters?.riskFilter === 'vip') {
    resQ = resQ.eq('is_vip', true);
  }

  const { data: resRows } = await resQ;
  type DBRes = {
    reservation_id: string;
    confirmation_code: string | null;
    status: string | null;
    channel: string | null;
    source_label: string | null;
    listing_id: string;
    listing_nickname: string | null;
    guest_name: string | null;
    guest_email: string | null;
    guest_phone: string | null;
    check_in_date: string;
    check_out_date: string;
    nights: number | null;
    guest_count: number | null;
    cancelled_at: string | null;
    host_payout: number | string | null;
    fare_accommodation: number | string | null;
    commission: number | string | null;
    cleaning_fee: number | string | null;
    currency: string;
    loyalty_tier: string | null;
    is_vip: boolean | null;
    lifetime_stays: number | null;
    risk_score: number | null;
    payment_status: 'paid' | 'partial' | 'unpaid' | 'n_a' | null;
    payment_balance_cents: number | null;
    payment_currency: string | null;
    flagged_unpaid: boolean | null;
    flagged_prearrival_missing: boolean | null;
    boarding_pass_exists: boolean | null;
    boarding_viewed_at: string | null;
    prearrival_sent_at: string | null;
    is_manual_block: boolean | null;
  };

  const reservations: CalendarReservation[] = ((resRows as DBRes[] | null) || []).map(r => {
    const meta = channelMeta(r.channel);
    return {
      reservation_id: r.reservation_id,
      confirmation_code: r.confirmation_code,
      status: r.status,
      channel: r.channel,
      channel_label: meta.label,
      channel_color: meta.color,
      source_label: r.source_label,
      listing_id: r.listing_id,
      listing_nickname: r.listing_nickname,
      guest_name: r.guest_name,
      guest_email: r.guest_email,
      guest_phone: r.guest_phone,
      check_in_date: r.check_in_date,
      check_out_date: r.check_out_date,
      nights: r.nights,
      guest_count: r.guest_count,
      cancelled_at: r.cancelled_at,
      host_payout: r.host_payout != null ? Number(r.host_payout) : null,
      fare_accommodation: r.fare_accommodation != null ? Number(r.fare_accommodation) : null,
      commission: r.commission != null ? Number(r.commission) : null,
      cleaning_fee: r.cleaning_fee != null ? Number(r.cleaning_fee) : null,
      currency: r.currency || 'USD',
      loyalty_tier: r.loyalty_tier,
      is_vip: r.is_vip,
      lifetime_stays: r.lifetime_stays,
      risk_score: r.risk_score,
      payment_status: r.payment_status,
      payment_balance_cents: r.payment_balance_cents,
      payment_currency: r.payment_currency,
      flagged_unpaid: r.flagged_unpaid,
      flagged_prearrival_missing: r.flagged_prearrival_missing,
      boarding_pass_exists: r.boarding_pass_exists,
      boarding_viewed_at: r.boarding_viewed_at,
      prearrival_sent_at: r.prearrival_sent_at,
      is_manual_block: r.is_manual_block,
    };
  });

  // Optional name search filter (post-fetch — the view doesn't index on it)
  const filtered = opts.filters?.search
    ? reservations.filter(r => {
        const q = (opts.filters!.search || '').toLowerCase();
        return (r.guest_name || '').toLowerCase().includes(q)
          || (r.guest_email || '').toLowerCase().includes(q)
          || (r.listing_nickname || '').toLowerCase().includes(q)
          || (r.confirmation_code || '').toLowerCase().includes(q)
          || (r.reservation_id || '').toLowerCase().includes(q);
      })
    : reservations;

  // 5. Build rows with status dots
  const reservationsByListing = new Map<string, CalendarReservation[]>();
  for (const r of filtered) {
    const arr = reservationsByListing.get(r.listing_id) || [];
    arr.push(r);
    reservationsByListing.set(r.listing_id, arr);
  }
  const rows: CalendarRow[] = bookable.map(l => {
    const metrics = metricsByListing.get(l.id);
    return {
      listing_id: l.id,
      nickname: l.nickname || l.id,
      title: l.title,
      building_code: l.building_code,
      cover_url: coverByListing.get(l.id) || null,
      base_price_usd: priceByListing.get(l.id) ?? null,
      comp_median_usd: compForListing(l.id, l.building_code),
      occupancy_next_30: metrics?.occupancy_next_30 ?? null,
      adr_past_30: metrics?.adr_past_30 ?? null,
      revenue_past_30: metrics?.revenue_past_30 ?? null,
      bedrooms: bedroomsByListing.get(l.id) ?? null,
      status_dot: statusDotFor(reservationsByListing.get(l.id) || [], nowIso),
    };
  });

  // 6. Anomaly snapshot for the banner above the grid
  const { data: anomData } = await sb
    .from('beithady_calendar_anomalies_v')
    .select('*')
    .maybeSingle();
  const anomalies = (anomData as AnomalySnapshot | null) || {
    unpaid_count: 0,
    unpaid_balance_cents: 0,
    prearrival_missing_count: 0,
    cleaning_gap_count: 0,
  };

  return {
    rows,
    reservations: filtered,
    anomalies,
    windowStart: start,
    windowEnd: end,
    daysCount: opts.daysCount,
  };
}
