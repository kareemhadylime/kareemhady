// API-based Beithady payouts aggregator. Replaces email parsing for the
// `beithady_payout_aggregate` rule.
//
// Semantics shift: the email aggregator read "Airbnb sent a payout of X
// AED on date Y with these line items" — actual bank-settlement events.
// The /v1/payouts endpoint doesn't exist on our PRO tier (404, confirmed
// 2026-04-23), so we reconstruct the equivalent view from:
//   1. `guesty_reservations.host_payout` — the per-reservation expected
//      payout after commission. Aggregated by check_in_date month/building/
//      channel since that's the closest proxy to when Airbnb actually
//      disburses (payouts typically post ~24h after check-in).
//   2. Stripe API breakdown — actual bank deposits via stripe-payouts.ts.
//      Kept as-is for the reconciliation view.
//
// Output: the existing BeithadyPayoutAggregate shape is preserved so the
// /emails/beithady/[ruleId] page renders unchanged. Email-only fields
// (airbnb_payouts[], airbnb_line_items[] with bank IBAN etc.) are set to
// safe zero/empty values; new numbers come from reservations + Stripe.

import { supabaseAdmin } from '@/lib/supabase';
import type {
  BeithadyPayoutAggregate,
  PayoutMonthBucket,
  PayoutBuildingBucket,
} from './beithady-payout';
import type { StripeApiBreakdown } from '@/lib/stripe-payouts';

// Reservation money is reported in USD by Guesty for Beithady; the page
// displays in USD. Keep totals in USD; expose an AED-equivalent via the
// UAE Central Bank peg 1 USD = 3.6725 AED.
const AED_PER_USD = 3.6725;
const round2 = (n: number) => Math.round(n * 100) / 100;

type ReservationRow = {
  id: string;
  confirmation_code: string | null;
  platform_confirmation_code: string | null;
  status: string | null;
  source: string | null;
  guest_name: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  nights: number | null;
  currency: string | null;
  host_payout: number | null;
  listing_id: string | null;
  listing_nickname: string | null;
  listing: {
    nickname: string | null;
    title: string | null;
    building_code: string | null;
  } | null;
};

function normalizeChannel(source: string | null): string {
  const raw = String(source || '').trim().toLowerCase();
  if (!raw) return 'Direct';
  if (raw.includes('airbnb')) return 'Airbnb';
  if (raw.includes('booking')) return 'Booking.com';
  if (raw.includes('vrbo') || raw.includes('homeaway')) return 'Vrbo';
  if (raw.includes('expedia')) return 'Expedia';
  if (raw === 'manual' || raw === 'direct' || raw.includes('direct'))
    return 'Direct';
  if (raw.includes('website')) return 'Direct';
  return raw.replace(/\b\w/g, c => c.toUpperCase());
}

export async function aggregateBeithadyPayoutsFromApi(
  fromIso: string,
  toIso: string,
  stripeApi: StripeApiBreakdown | null = null
): Promise<BeithadyPayoutAggregate> {
  const sb = supabaseAdmin();

  // Filter by check_in_date within the range — that's when Airbnb actually
  // posts the payout. Drop non-earning statuses. The payout dashboard is
  // about money we expect, so filter to confirmed stays only.
  const rows: ReservationRow[] = [];
  const PAGE = 1000;
  // `check_in_date` is a DATE, not timestamptz. Compare against the date
  // portion of the iso strings.
  const fromDate = fromIso.slice(0, 10);
  const toDate = toIso.slice(0, 10);

  for (let offset = 0; offset < 50000; offset += PAGE) {
    const { data, error } = await sb
      .from('guesty_reservations')
      .select(
        `id, confirmation_code, platform_confirmation_code, status, source,
         guest_name, check_in_date, check_out_date, nights, currency,
         host_payout, listing_id, listing_nickname,
         listing:guesty_listings!left(nickname, title, building_code)`
      )
      .gte('check_in_date', fromDate)
      .lt('check_in_date', toDate)
      .order('check_in_date', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`payout_query_failed: ${error.message}`);
    const batch = (data as unknown as ReservationRow[]) || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  let totalUsd = 0;
  let reservationCount = 0;
  const uniqueReservations = new Set<string>();
  const monthMap = new Map<string, PayoutMonthBucket>();
  const buildingMap = new Map<string, PayoutBuildingBucket>();
  const byChannel = new Map<string, { count: number; total_usd: number }>();

  const lineItems: BeithadyPayoutAggregate['airbnb_line_items'] = [];

  for (const r of rows) {
    const status = String(r.status || '').toLowerCase();
    const countable =
      status === 'confirmed' ||
      status === 'checked_in' ||
      status === 'checked_out';
    if (!countable) continue;

    const payout = Number(r.host_payout) || 0;
    totalUsd += payout;
    reservationCount += 1;
    const code = r.platform_confirmation_code || r.confirmation_code || r.id;
    uniqueReservations.add(code);

    // By month — keyed on check-in month (YYYY-MM).
    if (r.check_in_date) {
      const key = r.check_in_date.slice(0, 7);
      const d = new Date(r.check_in_date + 'T00:00:00Z');
      const label = d.toLocaleString(undefined, {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
      const bucket = monthMap.get(key);
      const airbnb = normalizeChannel(r.source) === 'Airbnb' ? payout : 0;
      const stripe = airbnb === 0 ? payout : 0;
      if (bucket) {
        bucket.airbnb_aed += airbnb * AED_PER_USD;
        bucket.stripe_aed += stripe * AED_PER_USD;
        bucket.total_aed += payout * AED_PER_USD;
        bucket.count += 1;
      } else {
        monthMap.set(key, {
          month: key,
          label,
          airbnb_aed: airbnb * AED_PER_USD,
          stripe_aed: stripe * AED_PER_USD,
          total_aed: payout * AED_PER_USD,
          count: 1,
        });
      }
    }

    // By building
    const building =
      r.listing?.building_code ||
      (r.listing_nickname && extractBuildingFromNickname(r.listing_nickname)) ||
      'UNKNOWN';
    const bKey = building;
    const existing = buildingMap.get(bKey);
    if (existing) {
      existing.line_item_count += 1;
      existing.unique_reservations += 1;
      existing.total_usd += payout;
    } else {
      buildingMap.set(bKey, {
        key: bKey,
        line_item_count: 1,
        unique_reservations: 1,
        total_usd: payout,
      });
    }

    // By channel
    const channel = normalizeChannel(r.source);
    const ch = byChannel.get(channel);
    if (ch) {
      ch.count += 1;
      ch.total_usd += payout;
    } else {
      byChannel.set(channel, { count: 1, total_usd: payout });
    }

    // Line items — each reservation becomes a "line item" in the same
    // shape the email aggregator produces, so the page's line-item table
    // renders without change.
    lineItems.push({
      confirmation_code: code,
      guest_name: r.guest_name || 'Guest',
      listing_name: r.listing?.title || r.listing_nickname || null,
      listing_airbnb_id: null,
      booking_type: 'Home',
      check_in_date: r.check_in_date,
      check_out_date: r.check_out_date,
      amount: round2(payout),
      currency: r.currency || 'USD',
      is_refund: false,
      email_sent_date: null,
      building_code: building === 'UNKNOWN' ? null : building,
    });
  }

  const byMonth = Array.from(monthMap.values())
    .map(m => ({
      ...m,
      airbnb_aed: round2(m.airbnb_aed),
      stripe_aed: round2(m.stripe_aed),
      total_aed: round2(m.total_aed),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const byBuilding = Array.from(buildingMap.values())
    .map(b => ({ ...b, total_usd: round2(b.total_usd) }))
    .sort((a, b) => b.total_usd - a.total_usd);

  const totalAed = round2(totalUsd * AED_PER_USD);
  const totalUsdRounded = round2(totalUsd);

  // Stripe API totals — the Stripe REST breakdown is still live.
  const stripeApiTotalAed = stripeApi?.total_amount ?? 0;
  let stripeApiChargeCount = 0;
  let stripeApiRefundCount = 0;
  let stripeApiGuestNames = 0;
  for (const p of stripeApi?.api_payouts || []) {
    for (const t of p.transactions) {
      if (t.type === 'charge' || t.type === 'payment') stripeApiChargeCount += 1;
      if (
        t.type === 'refund' ||
        t.type === 'payment_refund' ||
        t.type === 'payment_failure_refund'
      )
        stripeApiRefundCount += 1;
      if (
        (t.metadata && (t.metadata.guest_name || t.metadata.guestName)) ||
        (t.description && /guest|reservation|booking/i.test(t.description))
      ) {
        stripeApiGuestNames += 1;
      }
    }
  }

  return {
    airbnb_email_count: 0,
    stripe_email_count: 0,
    airbnb_parse_errors: 0,
    stripe_parse_errors: 0,
    airbnb_parse_failures: [],
    stripe_parse_failures: [],
    total_aed: round2(totalAed + stripeApiTotalAed),
    airbnb_total_aed: totalAed,
    stripe_total_aed: round2(stripeApiTotalAed),
    airbnb_line_items_count: reservationCount,
    airbnb_unique_reservations: uniqueReservations.size,
    airbnb_total_usd: totalUsdRounded,
    refund_count: 0,
    refund_total_usd: 0,
    guesty_enriched_count: reservationCount,
    airbnb_payouts: [], // no per-batch payout events when API-sourced
    airbnb_line_items: lineItems,
    stripe_payouts: [],
    by_month: byMonth,
    by_building: byBuilding,
    stripe_api: stripeApi,
    stripe_api_total_aed: stripeApiTotalAed,
    // reconciliation — only Stripe API side is meaningful now
    reconcile_matched: 0,
    reconcile_api_only: stripeApi?.api_payouts?.length ?? 0,
    reconcile_email_only: 0,
    stripe_api_charge_count: stripeApiChargeCount,
    stripe_api_refund_count: stripeApiRefundCount,
    stripe_api_guest_names: stripeApiGuestNames,
  };
}

function extractBuildingFromNickname(nickname: string): string | null {
  const n = nickname.toUpperCase();
  const major = /\bBH-?(26|34|73|435)(?:[-\s]|$)/.exec(n);
  if (major) return `BH-${major[1]}`;
  if (/\bBH-?(OK|OKAT)/.test(n)) return 'BH-OK';
  if (/\bBH-?\d/.test(n)) return 'BH-OK';
  return null;
}
