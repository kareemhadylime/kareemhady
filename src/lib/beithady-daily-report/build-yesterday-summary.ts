import type { ReservationRow } from './reservations';
import type { AllInventories } from './units';
import type { YesterdaySummary } from './types';

/**
 * v3 (2026-05-12): summarize yesterday's closing snapshot for Egypt.
 * Renewal exclusion mirrors build-buildings.ts:141-187 — a listing with
 * a same-day checkout AND checkin where guest_name matches is treated
 * as a stay extension, not a real transition.
 *
 * `inventories.total_all` is the report's Egypt-only total. We do not
 * filter on inventories.physical_listing_ids_all here — the caller is
 * expected to pass an `active` slice that's already scoped to Egypt
 * (e.g. via loadReservationCorpusWithDxb().egypt.active).
 */
export function buildYesterdaySummary(
  active: ReservationRow[],
  inventories: AllInventories,
  yesterdayYmd: string,
): YesterdaySummary {
  // Pre-compute renewal listings: same listing has both a yesterday
  // checkout and a yesterday checkin for the same guest.
  // A listing is only treated as a renewal when there is exactly one
  // checkin on that listing yesterday (one-to-one continuation).
  // Multiple checkins on the same listing imply a different scenario.
  const yCoGuests = new Map<string, string | null>();
  for (const r of active) {
    if (r.check_out_date === yesterdayYmd && r.listing_id) {
      yCoGuests.set(r.listing_id, r.guest_name ?? null);
    }
  }
  // Count how many distinct checkins land on each listing yesterday.
  const yCheckinCountByListing = new Map<string, number>();
  for (const r of active) {
    if (r.check_in_date === yesterdayYmd && r.listing_id) {
      yCheckinCountByListing.set(r.listing_id, (yCheckinCountByListing.get(r.listing_id) ?? 0) + 1);
    }
  }
  const renewedListings = new Set<string>();
  for (const r of active) {
    if (r.check_in_date === yesterdayYmd && r.listing_id) {
      const outGuest = yCoGuests.get(r.listing_id);
      const checkinCount = yCheckinCountByListing.get(r.listing_id) ?? 0;
      if (outGuest != null && outGuest === (r.guest_name ?? null) && checkinCount === 1) {
        renewedListings.add(r.listing_id);
      }
    }
  }

  let check_ins = 0;
  let check_outs = 0;
  let turnovers = 0;
  let revenue_usd = 0;
  const occupiedListings = new Set<string>();

  for (const r of active) {
    const isRenewal = Boolean(r.listing_id && renewedListings.has(r.listing_id));
    // Occupied at yesterday 23:59 = stay straddles yesterday.
    if (
      r.check_in_date &&
      r.check_out_date &&
      r.check_in_date <= yesterdayYmd &&
      r.check_out_date > yesterdayYmd
    ) {
      if (r.listing_id) occupiedListings.add(r.listing_id);
    }
    if (r.check_in_date === yesterdayYmd && !isRenewal) {
      check_ins += 1;
      revenue_usd += r.host_payout_usd || 0;
    }
    if (r.check_out_date === yesterdayYmd && !isRenewal) {
      check_outs += 1;
    }
  }

  // Turnover = different-guest checkout + checkin on yesterday, same listing.
  const yCheckins = new Map<string, string | null>();
  for (const r of active) {
    if (r.check_in_date === yesterdayYmd && r.listing_id) {
      yCheckins.set(r.listing_id, r.guest_name ?? null);
    }
  }
  for (const [listingId, outGuest] of yCoGuests) {
    const inGuest = yCheckins.get(listingId);
    if (inGuest != null && inGuest !== outGuest) turnovers += 1;
  }

  return {
    occupied: occupiedListings.size,
    total_units: inventories.total_all,
    check_ins,
    check_outs,
    turnovers,
    revenue_usd: Math.round(revenue_usd * 100) / 100,
  };
}
