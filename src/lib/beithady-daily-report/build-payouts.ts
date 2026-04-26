import 'server-only';
import { stripe } from '../stripe';
import { addDays, type MonthRange } from './cairo-dates';
import { toUsd } from './fx';
import { normalizeChannel, type ReservationRow } from './reservations';
import type { PayoutsSection } from './types';

// Payout calculations:
//
// MTD received:
//   Airbnb  = Σ host_payout (USD) for active reservations with
//             check_in_date in [month_start, today − 1]. Airbnb pays
//             ~24h after check-in, so by report-time those have settled.
//   Stripe  = Σ Stripe payouts (via API) with arrival_date in
//             [month_start, today]. Converted to USD.
//
// Expected today / tomorrow (per Q6):
//   Airbnb  = Σ host_payout for reservations with check_in_date = today − 1
//             (settles into bank "today")
//   Stripe  = Σ Stripe payouts with arrival_date = today + 1
//             (the user wants tomorrow's payout pulled from API)
//
// Next 7 days:
//   Airbnb projection = Σ host_payout for reservations with check_in_date
//                       in [today, today + 6] (will settle 24h after)
//   Stripe projection = Σ Stripe payouts with arrival_date in
//                       [today + 1, today + 7]

const round2 = (n: number) => Math.round(n * 100) / 100;

type StripePayoutLite = {
  id: string;
  amount_usd: number;
  arrival_date_ymd: string | null;
};

async function loadStripePayouts(
  fromYmd: string,
  toYmd: string,
  fxDate: Date
): Promise<{ rows: StripePayoutLite[]; error: string | null }> {
  let client;
  try {
    client = stripe();
  } catch (e: any) {
    return { rows: [], error: String(e?.message || e) };
  }
  const fromTs = Math.floor(Date.parse(`${fromYmd}T00:00:00Z`) / 1000);
  const toTs = Math.floor(Date.parse(`${toYmd}T23:59:59Z`) / 1000);
  const out: StripePayoutLite[] = [];
  try {
    for await (const p of client.payouts.list({
      arrival_date: { gte: fromTs, lte: toTs },
      limit: 100,
    })) {
      const arrival = p.arrival_date
        ? new Date(p.arrival_date * 1000).toISOString().slice(0, 10)
        : null;
      const major = (p.amount || 0) / 100;
      const usd = await toUsd(major, p.currency || 'USD', fxDate);
      out.push({
        id: p.id,
        amount_usd: usd ?? 0,
        arrival_date_ymd: arrival,
      });
      if (out.length >= 200) break;
    }
    return { rows: out, error: null };
  } catch (e: any) {
    return { rows: out, error: String(e?.message || e) };
  }
}

export async function buildPayoutsSection(
  active: ReservationRow[],
  ctx: MonthRange
): Promise<{ section: PayoutsSection; warnings: string[] }> {
  const warnings: string[] = [];
  const today = ctx.today;
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const next7End = addDays(today, 6);
  const next7StripeStart = addDays(today, 1);
  const next7StripeEnd = addDays(today, 7);

  // ---- Airbnb side (from reservations) ----
  let mtd_received_airbnb_usd = 0;
  let expected_today_airbnb_usd = 0;
  let next_7d_airbnb_usd = 0;

  for (const r of active) {
    if (!r.check_in_date || !r.host_payout_usd) continue;
    if (normalizeChannel(r.source) !== 'Airbnb') continue;

    if (r.check_in_date >= ctx.start && r.check_in_date <= yesterday) {
      mtd_received_airbnb_usd += r.host_payout_usd;
    }
    if (r.check_in_date === yesterday) {
      expected_today_airbnb_usd += r.host_payout_usd;
    }
    if (r.check_in_date >= today && r.check_in_date <= next7End) {
      next_7d_airbnb_usd += r.host_payout_usd;
    }
  }

  // ---- Stripe side (from API) ----
  // MTD window
  const stripeMtd = await loadStripePayouts(
    ctx.start,
    today,
    new Date(`${today}T12:00:00Z`)
  );
  if (stripeMtd.error) warnings.push(`stripe_mtd: ${stripeMtd.error}`);
  const mtd_received_stripe_usd = stripeMtd.rows
    .filter(p => p.arrival_date_ymd && p.arrival_date_ymd >= ctx.start && p.arrival_date_ymd <= today)
    .reduce((s, p) => s + p.amount_usd, 0);

  // Tomorrow window (single-day expected)
  const stripeTmrw = await loadStripePayouts(
    tomorrow,
    tomorrow,
    new Date(`${today}T12:00:00Z`)
  );
  if (stripeTmrw.error) warnings.push(`stripe_tomorrow: ${stripeTmrw.error}`);
  const expected_today_stripe_usd = stripeTmrw.rows.reduce(
    (s, p) => s + p.amount_usd,
    0
  );

  // Next 7d window
  const stripe7 = await loadStripePayouts(
    next7StripeStart,
    next7StripeEnd,
    new Date(`${today}T12:00:00Z`)
  );
  if (stripe7.error) warnings.push(`stripe_next7: ${stripe7.error}`);
  const next_7d_stripe_usd = stripe7.rows.reduce(
    (s, p) => s + p.amount_usd,
    0
  );

  const section: PayoutsSection = {
    mtd_received_airbnb_usd: round2(mtd_received_airbnb_usd),
    mtd_received_stripe_usd: round2(mtd_received_stripe_usd),
    mtd_received_total_usd: round2(
      mtd_received_airbnb_usd + mtd_received_stripe_usd
    ),
    expected_today_airbnb_usd: round2(expected_today_airbnb_usd),
    expected_today_stripe_usd: round2(expected_today_stripe_usd),
    expected_today_total_usd: round2(
      expected_today_airbnb_usd + expected_today_stripe_usd
    ),
    next_7d_projected_airbnb_usd: round2(next_7d_airbnb_usd),
    next_7d_projected_stripe_usd: round2(next_7d_stripe_usd),
    next_7d_projected_total_usd: round2(
      next_7d_airbnb_usd + next_7d_stripe_usd
    ),
  };

  return { section, warnings };
}
