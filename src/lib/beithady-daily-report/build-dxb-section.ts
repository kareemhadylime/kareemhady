import type { ReservationRow } from './reservations';
import { normalizeChannel } from './reservations';
import type { DxbInventory } from './units';
import type { DxbSection } from './types';
import { addDays } from './cairo-dates';

/**
 * v3 (2026-05-12): compute the DXB mini-aggregate for a DXB-only reservation
 * slice. The caller is expected to pass `loadReservationCorpusWithDxb().dxb.active`
 * — this function does NOT call `isExcludedFromReport` itself.
 *
 * Renewal-exclusion guard: identical to `buildYesterdaySummary` — only fires
 * when **exactly one** check-in exists on the listing on the target date.
 * Multiple same-day arrivals on the same listing suppress the renewal guard.
 *
 * @param active     DXB-only active reservations (confirmed/checked_in/checked_out)
 * @param inventory  DXB physical inventory (total_units + physical_listing_ids)
 * @param todayYmd   Report generation date (Cairo wall date, YYYY-MM-DD)
 * @param yesterdayYmd  Day the report DESCRIBES (Cairo wall date, YYYY-MM-DD)
 * @param monthStart First day of the report month (YYYY-MM-DD)
 * @param monthEnd   Last day of the report month (YYYY-MM-DD)
 */
export function buildDxbSection(
  active: ReservationRow[],
  inventory: DxbInventory,
  todayYmd: string,
  yesterdayYmd: string,
  monthStart: string,
  monthEnd: string,
): DxbSection {
  const totalUnits = inventory.total_units;

  // Short-circuit for empty inventory
  if (totalUnits === 0) {
    return {
      today: { occupied: 0, total_units: 0, check_ins: 0, check_outs: 0, turnovers: 0 },
      yesterday: { occupied: 0, total_units: 0, check_ins: 0, check_outs: 0, revenue_usd: 0 },
      revenue_mtd: { check_in_attribution_usd: 0, booked_attribution_usd: 0 },
      next_3d_total_usd: 0,
    };
  }

  // ── Renewal-exclusion guard (same pattern as buildYesterdaySummary) ──────

  // Build renewal sets for TODAY and YESTERDAY independently.
  function buildRenewedListings(targetYmd: string): Set<string> {
    // Pass 1: collect checkout guests per listing on targetYmd
    const coGuests = new Map<string, string | null>();
    for (const r of active) {
      if (r.check_out_date === targetYmd && r.listing_id) {
        coGuests.set(r.listing_id, r.guest_name ?? null);
      }
    }
    // Pass 2: count checkins per listing on targetYmd + record guest
    const checkinCountByListing = new Map<string, number>();
    const checkinGuests = new Map<string, string | null>();
    for (const r of active) {
      if (r.check_in_date === targetYmd && r.listing_id) {
        checkinCountByListing.set(r.listing_id, (checkinCountByListing.get(r.listing_id) ?? 0) + 1);
        checkinGuests.set(r.listing_id, r.guest_name ?? null);
      }
    }
    // Build renewed set: exactly one checkin AND same guest name as checkout
    const renewed = new Set<string>();
    for (const r of active) {
      if (r.check_in_date === targetYmd && r.listing_id) {
        const outGuest = coGuests.get(r.listing_id);
        const checkinCount = checkinCountByListing.get(r.listing_id) ?? 0;
        if (outGuest != null && outGuest === (r.guest_name ?? null) && checkinCount === 1) {
          renewed.add(r.listing_id);
        }
      }
    }
    return renewed;
  }

  const renewedToday = buildRenewedListings(todayYmd);
  const renewedYesterday = buildRenewedListings(yesterdayYmd);

  // ── TODAY snapshot ────────────────────────────────────────────────────────
  let todayCheckIns = 0;
  let todayCheckOuts = 0;
  const todayOccupied = new Set<string>();

  // Turnover: different-guest checkout+checkin on the same listing today
  const todayCoGuests = new Map<string, string | null>();
  const todayCiGuests = new Map<string, string | null>();

  for (const r of active) {
    // Occupied at today 23:59 = check_in <= today < check_out
    if (
      r.check_in_date &&
      r.check_out_date &&
      r.check_in_date <= todayYmd &&
      r.check_out_date > todayYmd
    ) {
      if (r.listing_id) todayOccupied.add(r.listing_id);
    }
    const isRenewal = Boolean(r.listing_id && renewedToday.has(r.listing_id));
    if (r.check_in_date === todayYmd && !isRenewal) {
      todayCheckIns += 1;
      if (r.listing_id) todayCiGuests.set(r.listing_id, r.guest_name ?? null);
    }
    if (r.check_out_date === todayYmd && !isRenewal) {
      todayCheckOuts += 1;
      if (r.listing_id) todayCoGuests.set(r.listing_id, r.guest_name ?? null);
    }
  }

  // Turnovers today: same listing has a different-guest checkout + checkin
  let todayTurnovers = 0;
  for (const [listingId, outGuest] of todayCoGuests) {
    const inGuest = todayCiGuests.get(listingId);
    if (inGuest != null && inGuest !== outGuest) todayTurnovers += 1;
  }

  // ── YESTERDAY snapshot ────────────────────────────────────────────────────
  let yesterdayCheckIns = 0;
  let yesterdayCheckOuts = 0;
  let yesterdayRevenue = 0;
  const yesterdayOccupied = new Set<string>();

  for (const r of active) {
    // Occupied at yesterday 23:59 = check_in <= yesterday < check_out
    if (
      r.check_in_date &&
      r.check_out_date &&
      r.check_in_date <= yesterdayYmd &&
      r.check_out_date > yesterdayYmd
    ) {
      if (r.listing_id) yesterdayOccupied.add(r.listing_id);
    }
    const isRenewal = Boolean(r.listing_id && renewedYesterday.has(r.listing_id));
    if (r.check_in_date === yesterdayYmd && !isRenewal) {
      yesterdayCheckIns += 1;
      yesterdayRevenue += r.host_payout_usd || 0;
    }
    if (r.check_out_date === yesterdayYmd && !isRenewal) {
      yesterdayCheckOuts += 1;
    }
  }

  // ── Revenue MTD ───────────────────────────────────────────────────────────
  // Check-in attribution: host_payout for stays whose check_in is in
  // [monthStart, monthEnd].
  let checkInAttributionUsd = 0;
  let bookedAttributionUsd = 0;

  for (const r of active) {
    // Check-in attribution: check_in_date in [monthStart, monthEnd].
    if (
      r.check_in_date &&
      r.check_in_date >= monthStart &&
      r.check_in_date <= monthEnd
    ) {
      checkInAttributionUsd += r.host_payout_usd || 0;
    }
    // Booked attribution: created_at_iso date in [monthStart, monthEnd]
    const createdDate = r.created_at_iso?.slice(0, 10) ?? null;
    if (createdDate && createdDate >= monthStart && createdDate <= monthEnd) {
      bookedAttributionUsd += r.host_payout_usd || 0;
    }
  }

  // ── Next 3 days: Airbnb-only, check_in_date ∈ [today, today+2] ───────────
  const next3dEnd = addDays(todayYmd, 2);
  let next3dUsd = 0;

  for (const r of active) {
    if (
      r.check_in_date &&
      r.check_in_date >= todayYmd &&
      r.check_in_date <= next3dEnd &&
      normalizeChannel(r.source) === 'Airbnb'
    ) {
      next3dUsd += r.host_payout_usd || 0;
    }
  }

  return {
    today: {
      occupied: todayOccupied.size,
      total_units: totalUnits,
      check_ins: todayCheckIns,
      check_outs: todayCheckOuts,
      turnovers: todayTurnovers,
    },
    yesterday: {
      occupied: yesterdayOccupied.size,
      total_units: totalUnits,
      check_ins: yesterdayCheckIns,
      check_outs: yesterdayCheckOuts,
      revenue_usd: Math.round(yesterdayRevenue * 100) / 100,
    },
    revenue_mtd: {
      check_in_attribution_usd: Math.round(checkInAttributionUsd * 100) / 100,
      booked_attribution_usd: Math.round(bookedAttributionUsd * 100) / 100,
    },
    next_3d_total_usd: Math.round(next3dUsd * 100) / 100,
  };
}
