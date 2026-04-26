import 'server-only';
import {
  nightsInRange,
  type ReservationRow,
} from './reservations';
import { addDays, type ReportPeriodWindow } from './cairo-dates';

// Weekly digest banner (S8) — week defined Sunday → Saturday in Cairo.
// Banner sits at the very top of the report. Compares this week so far
// (Sunday → yesterday) vs the same Sunday → same-weekday last week.

export type WeeklyDigest = {
  week_start: string;
  week_end: string;
  days_elapsed: number;
  // This week so far (Sunday → yesterday)
  revenue_usd: number;
  bookings: number;
  cancellations: number;
  // Same window last week
  prior_revenue_usd: number;
  prior_bookings: number;
  // Comparison
  revenue_vs_last_week_pct: number;
  bookings_vs_last_week_pct: number;
  // One-line
  oneliner: string;
};

const ACTIVE_STATUSES = new Set(['confirmed', 'checked_in', 'checked_out']);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildWeeklyDigest(
  active: ReservationRow[],
  canceled: ReservationRow[],
  ctx: ReportPeriodWindow
): WeeklyDigest {
  const week_start = ctx.week_start;
  const week_end = ctx.yesterday; // current week is Sunday → yesterday
  const days_elapsed = ctx.week_days_elapsed;

  // Prior week same window (offset by 7 days).
  const prior_start = addDays(week_start, -7);
  const prior_end = addDays(week_end, -7);

  let revenue_usd = 0;
  let bookings = 0;
  let prior_revenue_usd = 0;
  let prior_bookings = 0;

  for (const r of active) {
    if (!r.status || !ACTIVE_STATUSES.has(r.status)) continue;
    if (!r.host_payout_usd || !r.nights) continue;

    // Per-night allocation across this week's days
    const nThis = nightsInRange(r, week_start, week_end);
    if (nThis > 0) {
      revenue_usd += (r.host_payout_usd * nThis) / r.nights;
    }
    const nPrior = nightsInRange(r, prior_start, prior_end);
    if (nPrior > 0) {
      prior_revenue_usd += (r.host_payout_usd * nPrior) / r.nights;
    }

    // Booking count = reservations created (any check-in date) in window.
    const createdDay = (r.created_at_iso || '').slice(0, 10);
    if (createdDay >= week_start && createdDay <= week_end) bookings += 1;
    if (createdDay >= prior_start && createdDay <= prior_end) prior_bookings += 1;
  }

  let cancellations = 0;
  for (const r of canceled) {
    const day = (r.effective_cancel_at_iso || r.updated_at_iso || '').slice(0, 10);
    if (day >= week_start && day <= week_end) cancellations += 1;
  }

  const revenue_vs_last_week_pct =
    prior_revenue_usd > 0
      ? round1(((revenue_usd - prior_revenue_usd) / prior_revenue_usd) * 100)
      : 0;
  const bookings_vs_last_week_pct =
    prior_bookings > 0
      ? round1(((bookings - prior_bookings) / prior_bookings) * 100)
      : 0;

  const fmtK = (n: number) =>
    Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;
  const arrow =
    revenue_vs_last_week_pct > 0
      ? `▲ +${revenue_vs_last_week_pct}%`
      : revenue_vs_last_week_pct < 0
        ? `▼ ${revenue_vs_last_week_pct}%`
        : '▲ 0%';
  const oneliner =
    `Week ${week_start} → ${week_end} (${days_elapsed} day${days_elapsed === 1 ? '' : 's'}): ` +
    `${fmtK(revenue_usd)} revenue ${arrow} vs last week, ` +
    `${bookings} bookings, ${cancellations} cancellations.`;

  return {
    week_start,
    week_end,
    days_elapsed,
    revenue_usd: Math.round(revenue_usd),
    bookings,
    cancellations,
    prior_revenue_usd: Math.round(prior_revenue_usd),
    prior_bookings,
    revenue_vs_last_week_pct,
    bookings_vs_last_week_pct,
    oneliner,
  };
}
