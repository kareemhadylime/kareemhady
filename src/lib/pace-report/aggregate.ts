// src/lib/pace-report/aggregate.ts
import { unitTypeLabel } from './load-listings';
import { bucketCohort } from './cohorts';
import { enumerateDays, daysBetween } from './date-ranges';
import type {
  CityRow,
  CohortBucket,
  DailyPerfRow,
  PaceDateRange,
  PaceKpi,
  PaceReportPayload,
  PickupCohortRow,
  PropertyRow,
} from './types';
import type { PaceListing } from './load-listings';
import type { PaceReservation } from './load-reservations';

const ALL_BUCKETS: CohortBucket[] = [
  'same_month', 'one_month', 'two_month', 'three_to_five_month', 'six_plus_month',
];

function emptyBucketRow(): Record<CohortBucket, { revenue_usd: number; booked_days: number; anr_usd: number }> {
  return ALL_BUCKETS.reduce((acc, b) => {
    acc[b] = { revenue_usd: 0, booked_days: 0, anr_usd: 0 };
    return acc;
  }, {} as Record<CohortBucket, { revenue_usd: number; booked_days: number; anr_usd: number }>);
}

/** Inclusive overlap count between [fromYmd, toYmd] and [ci, co). */
function nightsAnchoredInRange(ci: string, co: string, fromYmd: string, toYmd: string): number {
  // The night anchored to day D = stay covers D as a night (ci ≤ D < co).
  const days = enumerateDays(fromYmd, toYmd);
  let count = 0;
  for (const d of days) {
    if (ci <= d && d < co) count++;
  }
  return count;
}

type AggregateInput = {
  range: PaceDateRange;
  priorRange: PaceDateRange;
  listings: PaceListing[];
  reservationsCurrent: PaceReservation[];
  reservationsPrior: PaceReservation[];
  includeHistorical: boolean;
};

export function aggregatePaceReport(input: AggregateInput): PaceReportPayload {
  const { range, priorRange, listings, includeHistorical } = input;
  const filterRes = (rs: PaceReservation[]) =>
    rs.filter((r) => includeHistorical || !r.is_canceled);
  const resCurrent = filterRes(input.reservationsCurrent);
  const resPrior = filterRes(input.reservationsPrior);

  const unitCount = listings.length;
  const periodDays = daysBetween(range.from, range.to);

  // ----- KPIs (current vs prior) -----
  const computeBasics = (
    rs: PaceReservation[],
    r: PaceDateRange,
  ) => {
    let revenue = 0;
    let bookedDays = 0;
    for (const x of rs) {
      const n = nightsAnchoredInRange(x.check_in_date, x.check_out_date, r.from, r.to);
      if (n <= 0) continue;
      bookedDays += n;
      // Pro-rate revenue if the stay straddles the period.
      const nightsInStay = x.nights || (daysBetween(x.check_in_date, x.check_out_date) - 1);
      if (nightsInStay > 0) {
        revenue += x.host_payout_usd * (n / nightsInStay);
      } else {
        revenue += x.host_payout_usd;
      }
    }
    const days = daysBetween(r.from, r.to);
    const bookable = listings.length * days;
    const occPct = bookable > 0 ? (bookedDays / bookable) * 100 : 0;
    const anr = bookedDays > 0 ? revenue / bookedDays : 0;
    return { revenue, bookedDays, occPct, anr };
  };

  const cur = computeBasics(resCurrent, range);
  const pri = computeBasics(resPrior, priorRange);
  const pct = (a: number, b: number) => (b === 0 ? null : ((a - b) / b) * 100);

  const kpis: PaceKpi[] = [
    { metric: 'revenue',       current_value: cur.revenue,    prior_value: pri.revenue,    delta_pct: pct(cur.revenue, pri.revenue) },
    { metric: 'booked_days',   current_value: cur.bookedDays, prior_value: pri.bookedDays, delta_pct: pct(cur.bookedDays, pri.bookedDays) },
    { metric: 'occupancy_pct', current_value: cur.occPct,     prior_value: pri.occPct,     delta_pct: pct(cur.occPct, pri.occPct) },
    { metric: 'anr',           current_value: cur.anr,        prior_value: pri.anr,        delta_pct: pct(cur.anr, pri.anr) },
  ];

  // ----- Daily perf grid -----
  const days = enumerateDays(range.from, range.to);
  const daily: DailyPerfRow[] = days.map((d) => {
    let revenue = 0;
    let booked = 0;
    for (const r of resCurrent) {
      if (r.check_in_date <= d && d < r.check_out_date) {
        booked += 1;
        const nightsInStay = r.nights || (daysBetween(r.check_in_date, r.check_out_date) - 1);
        revenue += nightsInStay > 0 ? r.host_payout_usd / nightsInStay : 0;
      }
    }
    const bookable = unitCount;
    const reserved = 0;
    const available = Math.max(bookable - booked - reserved, 0);
    const occ = bookable > 0 ? (booked / bookable) * 100 : 0;
    const anr = booked > 0 ? revenue / booked : 0;
    return {
      date: d, revenue_usd: revenue, booked_days: booked, reserved_days: reserved,
      bookable_days: bookable, available_days: available, occupancy_pct: occ, anr_usd: anr,
    };
  });

  // ----- Pickup cohorts (current period only) -----
  const cohortMap = new Map<string, ReturnType<typeof emptyBucketRow>>();
  for (const r of resCurrent) {
    const n = nightsAnchoredInRange(r.check_in_date, r.check_out_date, range.from, range.to);
    if (n <= 0) continue;
    const month = r.check_in_date.slice(0, 7);
    const bucket = bucketCohort(r.created_at_iso, r.check_in_date);
    if (!cohortMap.has(month)) cohortMap.set(month, emptyBucketRow());
    const row = cohortMap.get(month)!;
    const nightsInStay = r.nights || (daysBetween(r.check_in_date, r.check_out_date) - 1);
    const rev = nightsInStay > 0 ? r.host_payout_usd * (n / nightsInStay) : r.host_payout_usd;
    row[bucket].revenue_usd += rev;
    row[bucket].booked_days += n;
  }
  // Fill anr per bucket
  for (const row of cohortMap.values()) {
    for (const b of ALL_BUCKETS) {
      row[b].anr_usd = row[b].booked_days > 0 ? row[b].revenue_usd / row[b].booked_days : 0;
    }
  }
  const pickup_cohorts: PickupCohortRow[] = [...cohortMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, buckets]) => ({ check_in_month: month, buckets }));

  // ----- Per-property -----
  const byListing = new Map<string, { revenue: number; booked: number }>();
  for (const r of resCurrent) {
    const n = nightsAnchoredInRange(r.check_in_date, r.check_out_date, range.from, range.to);
    if (n <= 0) continue;
    if (!byListing.has(r.listing_id)) byListing.set(r.listing_id, { revenue: 0, booked: 0 });
    const slot = byListing.get(r.listing_id)!;
    const nightsInStay = r.nights || (daysBetween(r.check_in_date, r.check_out_date) - 1);
    slot.revenue += nightsInStay > 0 ? r.host_payout_usd * (n / nightsInStay) : r.host_payout_usd;
    slot.booked += n;
  }

  const by_property: PropertyRow[] = listings.map((l) => {
    const slot = byListing.get(l.id) || { revenue: 0, booked: 0 };
    const bookable = periodDays;
    const reserved = 0;
    const available = Math.max(bookable - slot.booked - reserved, 0);
    const occ = bookable > 0 ? (slot.booked / bookable) * 100 : 0;
    const anr = slot.booked > 0 ? slot.revenue / slot.booked : 0;
    const revpar = bookable > 0 ? slot.revenue / bookable : 0;
    return {
      listing_id: l.id, nickname: l.nickname, unit_type: unitTypeLabel(l),
      city: l.city, country: l.country,
      revenue_usd: slot.revenue, booked_days: slot.booked, reserved_days: reserved,
      bookable_days: bookable, available_days: available,
      occupancy_pct: occ, anr_usd: anr, revpar_usd: revpar,
    };
  }).sort((a, b) => b.revenue_usd - a.revenue_usd);

  // ----- Per-city (roll up properties) -----
  const cityMap = new Map<string, CityRow>();
  for (const row of by_property) {
    const key = row.city || '—';
    if (!cityMap.has(key)) {
      cityMap.set(key, {
        city: key, country: row.country, unit_count: 0,
        revenue_usd: 0, booked_days: 0, reserved_days: 0,
        bookable_days: 0, available_days: 0,
        occupancy_pct: 0, anr_usd: 0, revpar_usd: 0,
      });
    }
    const slot = cityMap.get(key)!;
    slot.unit_count += 1;
    slot.revenue_usd += row.revenue_usd;
    slot.booked_days += row.booked_days;
    slot.bookable_days += row.bookable_days;
  }
  const by_city: CityRow[] = [...cityMap.values()].map((c) => {
    c.available_days = Math.max(c.bookable_days - c.booked_days - c.reserved_days, 0);
    c.occupancy_pct = c.bookable_days > 0 ? (c.booked_days / c.bookable_days) * 100 : 0;
    c.anr_usd = c.booked_days > 0 ? c.revenue_usd / c.booked_days : 0;
    c.revpar_usd = c.bookable_days > 0 ? c.revenue_usd / c.bookable_days : 0;
    return c;
  }).sort((a, b) => b.revenue_usd - a.revenue_usd);

  return {
    generated_at_iso: new Date().toISOString(),
    date_range: range,
    prior_date_range: priorRange,
    filters_applied: {
      countries: [], cities: [], tags: [], listingIds: [],
      includeInactive: false, includeHistorical,
    },
    unit_count_in_scope: unitCount,
    kpis, daily, pickup_cohorts, by_property, by_city,
    build_warnings: [],
  };
}
