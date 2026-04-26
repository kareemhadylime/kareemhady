import 'server-only';
import { addDays, dayDiff, type MonthRange } from './cairo-dates';
import { nightsInRange, type ReservationRow } from './reservations';
import type { AllInventories } from './units';
import {
  BUILDING_CODES,
  type AllBucket,
  type BuildingBucket,
  type BuildingCode,
} from './types';

// Build the per-building + "All" rows for the main metrics table.
// Today, MTD performance, pace, length-of-stay all live here so we
// only walk the reservation list once per metric.

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (num: number, den: number) =>
  den > 0 ? Math.round((num / den) * 1000) / 10 : 0;

function emptyBucket(total_units: number): BuildingBucket {
  return {
    total_units,
    occupied_today: 0,
    occupancy_today_pct: 0,
    check_ins_today: 0,
    check_outs_today: 0,
    turnovers_today: 0,
    revenue_mtd_usd: 0,
    forward_occupancy_pct: 0,
    backward_occupancy_pct: 0,
    backward_avg_units_per_day: 0,
    adr_mtd_usd: 0,
    opportunity_nights: 0,
    opportunity_value_usd: 0,
    bookings_per_day_mtd: 0,
    avg_lead_time_days: 0,
    pickup_vs_prior_month_pct: 0,
    avg_los_nights: 0,
  };
}

type Accumulator = {
  // Today
  occupied_listings: Set<string>;
  check_ins: number;
  check_outs: number;
  checkin_listings: Set<string>;
  checkout_listings: Set<string>;
  // MTD
  revenue_usd: number;
  nights_mtd: number;                       // nights between [start, today]
  forward_nights_booked: number;            // nights between (today, end]
  backward_nights_started_in_month: number; // user's literal-formula numerator
  // Pace
  bookings_created_mtd: number;
  lead_time_sum: number;
  lead_time_n: number;
  bookings_created_prior_mtd: number;       // through same day-of-month last month
  // LoS
  los_sum: number;
  los_n: number;
};

function emptyAcc(): Accumulator {
  return {
    occupied_listings: new Set(),
    check_ins: 0,
    check_outs: 0,
    checkin_listings: new Set(),
    checkout_listings: new Set(),
    revenue_usd: 0,
    nights_mtd: 0,
    forward_nights_booked: 0,
    backward_nights_started_in_month: 0,
    bookings_created_mtd: 0,
    lead_time_sum: 0,
    lead_time_n: 0,
    bookings_created_prior_mtd: 0,
    los_sum: 0,
    los_n: 0,
  };
}

/**
 * Compute prior month's [start, sameDayOfMonth] window. If today is the
 * 26th of April, this returns 1-26 March. Edge cases (no Feb 30, etc.)
 * cap to the last valid day of that prior month.
 */
function priorMonthWindow(today: string): { start: string; end: string } {
  const [y, m, d] = today.split('-').map(Number);
  const prior = new Date(Date.UTC(y, m - 2, 1));
  const py = prior.getUTCFullYear();
  const pm = prior.getUTCMonth(); // 0-indexed
  const lastDay = new Date(Date.UTC(py, pm + 1, 0)).getUTCDate();
  const cappedDay = Math.min(d, lastDay);
  const start = `${py}-${String(pm + 1).padStart(2, '0')}-01`;
  const end = `${py}-${String(pm + 1).padStart(2, '0')}-${String(cappedDay).padStart(2, '0')}`;
  return { start, end };
}

function isInDateRange(d: string | null, fromYmd: string, toYmd: string): boolean {
  return !!d && d >= fromYmd && d <= toYmd;
}

function isInIsoRange(iso: string | null, fromYmd: string, toYmd: string): boolean {
  if (!iso) return false;
  const day = iso.slice(0, 10);
  return day >= fromYmd && day <= toYmd;
}

export function buildBuildingsTable(
  active: ReservationRow[],
  inventories: AllInventories,
  ctx: MonthRange
): { all: AllBucket; per_building: Record<BuildingCode, BuildingBucket> } {
  const today = ctx.today;
  const monthStart = ctx.start;
  const monthEnd = ctx.end;
  const tomorrow = addDays(today, 1);

  // Initialize accumulators per-building + a "REAL_ALL" pass that
  // re-walks the same data filtered to physical units only — avoiding
  // the per-bucket sum vs Guesty-source-of-truth drift the user flagged
  // (Q1: "Total not the sum but Real Total Coming from Guesty or PriceLabs").
  const accs = new Map<BuildingCode, Accumulator>();
  for (const b of BUILDING_CODES) accs.set(b, emptyAcc());
  const accAll = emptyAcc();

  const prior = priorMonthWindow(today);

  for (const r of active) {
    const acc = accs.get(r.building) || emptyAcc();

    // ---- Today ----
    if (
      r.check_in_date &&
      r.check_out_date &&
      r.check_in_date <= today &&
      r.check_out_date > today
    ) {
      if (r.listing_id) acc.occupied_listings.add(r.listing_id);
      if (r.listing_id) accAll.occupied_listings.add(r.listing_id);
    }
    if (r.check_in_date === today) {
      acc.check_ins += 1;
      accAll.check_ins += 1;
      if (r.listing_id) {
        acc.checkin_listings.add(r.listing_id);
        accAll.checkin_listings.add(r.listing_id);
      }
    }
    if (r.check_out_date === today) {
      acc.check_outs += 1;
      accAll.check_outs += 1;
      if (r.listing_id) {
        acc.checkout_listings.add(r.listing_id);
        accAll.checkout_listings.add(r.listing_id);
      }
    }

    // ---- MTD revenue + nights ----
    const usd = r.host_payout_usd || 0;
    const totalNights = r.nights || 0;
    const nightsThisMonth = nightsInRange(r, monthStart, monthEnd);
    if (nightsThisMonth > 0 && totalNights > 0) {
      // Revenue allocated proportionally to the month-overlap nights.
      const allocated = (usd * nightsThisMonth) / totalNights;
      acc.revenue_usd += allocated;
      accAll.revenue_usd += allocated;
    } else if (nightsThisMonth > 0 && totalNights === 0) {
      acc.revenue_usd += usd;
      accAll.revenue_usd += usd;
    }

    const nightsMtdElapsed = nightsInRange(r, monthStart, today);
    acc.nights_mtd += nightsMtdElapsed;
    accAll.nights_mtd += nightsMtdElapsed;

    if (today < monthEnd) {
      const fwd = nightsInRange(r, tomorrow, monthEnd);
      acc.forward_nights_booked += fwd;
      accAll.forward_nights_booked += fwd;
    }

    // Backward (user's formula): reservations whose check_in is in [start_of_month, today]
    // contribute their full nights to "Total Days Reserved".
    if (isInDateRange(r.check_in_date, monthStart, today)) {
      acc.backward_nights_started_in_month += totalNights;
      accAll.backward_nights_started_in_month += totalNights;
    }

    // ---- Pace ----
    if (isInIsoRange(r.created_at_iso, monthStart, today)) {
      acc.bookings_created_mtd += 1;
      accAll.bookings_created_mtd += 1;
      // Lead time: created → check-in
      if (r.created_at_iso && r.check_in_date) {
        const leadDays = Math.max(0, dayDiff(r.created_at_iso.slice(0, 10), r.check_in_date));
        acc.lead_time_sum += leadDays;
        acc.lead_time_n += 1;
        accAll.lead_time_sum += leadDays;
        accAll.lead_time_n += 1;
      }
    }
    if (isInIsoRange(r.created_at_iso, prior.start, prior.end)) {
      acc.bookings_created_prior_mtd += 1;
      accAll.bookings_created_prior_mtd += 1;
    }

    // ---- LoS for stays beginning in current month ----
    if (isInDateRange(r.check_in_date, monthStart, today) && totalNights > 0) {
      acc.los_sum += totalNights;
      acc.los_n += 1;
      accAll.los_sum += totalNights;
      accAll.los_n += 1;
    }

    accs.set(r.building, acc);
  }

  // Materialize per-building buckets.
  const per_building: Record<BuildingCode, BuildingBucket> = {
    'BH-26': emptyBucket(inventories['BH-26'].total_units),
    'BH-73': emptyBucket(inventories['BH-73'].total_units),
    'BH-435': emptyBucket(inventories['BH-435'].total_units),
    'BH-OK': emptyBucket(inventories['BH-OK'].total_units),
    OTHER: emptyBucket(inventories.OTHER.total_units),
  };

  for (const b of BUILDING_CODES) {
    const acc = accs.get(b)!;
    const inv = inventories[b];
    const units = inv.total_units;
    const occupied = acc.occupied_listings.size;
    const turnovers = [...acc.checkin_listings].filter(l =>
      acc.checkout_listings.has(l)
    ).length;

    const adr =
      acc.nights_mtd > 0 ? acc.revenue_usd / acc.nights_mtd : 0;
    const remainingNights = ctx.days_remaining * units;
    const opp_nights = Math.max(0, remainingNights - acc.forward_nights_booked);
    const fwd_avail = Math.max(0, ctx.days_remaining * units);

    per_building[b] = {
      total_units: units,
      occupied_today: occupied,
      occupancy_today_pct: pct(occupied, units),
      check_ins_today: acc.check_ins,
      check_outs_today: acc.check_outs,
      turnovers_today: turnovers,
      revenue_mtd_usd: round2(acc.revenue_usd),
      forward_occupancy_pct: pct(acc.forward_nights_booked, fwd_avail),
      backward_occupancy_pct: pct(acc.nights_mtd, ctx.days_elapsed * units),
      backward_avg_units_per_day:
        ctx.days_total > 0
          ? round1(acc.backward_nights_started_in_month / ctx.days_total)
          : 0,
      adr_mtd_usd: round2(adr),
      opportunity_nights: opp_nights,
      opportunity_value_usd: round2(opp_nights * adr),
      bookings_per_day_mtd:
        ctx.days_elapsed > 0
          ? round1(acc.bookings_created_mtd / ctx.days_elapsed)
          : 0,
      avg_lead_time_days:
        acc.lead_time_n > 0 ? round1(acc.lead_time_sum / acc.lead_time_n) : 0,
      pickup_vs_prior_month_pct:
        acc.bookings_created_prior_mtd > 0
          ? round1(
              ((acc.bookings_created_mtd - acc.bookings_created_prior_mtd) /
                acc.bookings_created_prior_mtd) *
                100
            )
          : 0,
      avg_los_nights: acc.los_n > 0 ? round1(acc.los_sum / acc.los_n) : 0,
    };
  }

  // ---- All bucket ----
  // "All" comes from the same reservation pass but with the FULL set of
  // physical listings as denominator. Drift detection compares the sum
  // of per-building buckets vs the Real Total below — surfaces sync gaps
  // between Guesty mirror and our static catalog.
  const totalUnits = inventories.total_all;
  const occupiedAll = accAll.occupied_listings.size;
  const turnoversAll = [...accAll.checkin_listings].filter(l =>
    accAll.checkout_listings.has(l)
  ).length;
  const adrAll = accAll.nights_mtd > 0 ? accAll.revenue_usd / accAll.nights_mtd : 0;
  const fwd_avail_all = Math.max(0, ctx.days_remaining * totalUnits);
  const opp_nights_all = Math.max(
    0,
    ctx.days_remaining * totalUnits - accAll.forward_nights_booked
  );

  // Drift check: compare summed per-building MTD revenue vs accAll.revenue_usd
  const summedRevenue = BUILDING_CODES.reduce(
    (s, b) => s + per_building[b].revenue_mtd_usd,
    0
  );
  const driftPct =
    accAll.revenue_usd > 0
      ? Math.abs(summedRevenue - accAll.revenue_usd) / accAll.revenue_usd
      : 0;
  const drift_warning =
    driftPct > 0.01
      ? `Sum-of-buildings differs from total by ${(driftPct * 100).toFixed(1)}% — possible Guesty mirror drift.`
      : null;

  const all: AllBucket = {
    total_units: totalUnits,
    occupied_today: occupiedAll,
    occupancy_today_pct: pct(occupiedAll, totalUnits),
    check_ins_today: accAll.check_ins,
    check_outs_today: accAll.check_outs,
    turnovers_today: turnoversAll,
    revenue_mtd_usd: round2(accAll.revenue_usd),
    forward_occupancy_pct: pct(accAll.forward_nights_booked, fwd_avail_all),
    backward_occupancy_pct: pct(accAll.nights_mtd, ctx.days_elapsed * totalUnits),
    backward_avg_units_per_day:
      ctx.days_total > 0
        ? round1(accAll.backward_nights_started_in_month / ctx.days_total)
        : 0,
    adr_mtd_usd: round2(adrAll),
    opportunity_nights: opp_nights_all,
    opportunity_value_usd: round2(opp_nights_all * adrAll),
    bookings_per_day_mtd:
      ctx.days_elapsed > 0
        ? round1(accAll.bookings_created_mtd / ctx.days_elapsed)
        : 0,
    avg_lead_time_days:
      accAll.lead_time_n > 0
        ? round1(accAll.lead_time_sum / accAll.lead_time_n)
        : 0,
    pickup_vs_prior_month_pct:
      accAll.bookings_created_prior_mtd > 0
        ? round1(
            ((accAll.bookings_created_mtd - accAll.bookings_created_prior_mtd) /
              accAll.bookings_created_prior_mtd) *
              100
          )
        : 0,
    avg_los_nights:
      accAll.los_n > 0 ? round1(accAll.los_sum / accAll.los_n) : 0,
    drift_warning,
  };

  return { all, per_building };
}
