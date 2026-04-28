import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { reportPeriodWindow, addDays as addDaysCairo, endOfMonth } from '@/lib/beithady-daily-report/cairo-dates';
import type { Brief, BriefSection } from './types';

// Finance & Accounting brief — what finance needs at 8am.
//
// Semantics
// ---------
// - "Yesterday's revenue" = bookings CREATED yesterday Cairo (accrual basis).
//   Earlier versions filtered on check_in_date which counts arrivals, not
//   sales. Switched to created_at_odoo (= raw.createdAt) on 2026-04-28.
// - "Month-to-date" = bookings CREATED so far this Cairo month. Same
//   accrual semantics.
// - "Expected payouts" = confirmed reservations whose CHECK-IN falls in
//   the window. host_payout is in the reservation's local currency
//   (Booking/Airbnb pre-collect; we display the per-currency mix).
// - "Direct booking revenue yesterday" = channel='manual' bookings created
//   yesterday. (channel-meta labels manual=Direct; this catches walk-ins,
//   phone bookings, and admin-imported direct deals — same as the
//   calendar grid's Direct chip.)

export async function buildFinanceBrief(dateIso: string): Promise<Brief> {
  const sb = supabaseAdmin();
  const period = reportPeriodWindow(dateIso);

  const yesterdayStartUtc = period.period_start_iso;            // 00:00 Cairo (yesterday) as UTC ISO
  const yesterdayEndUtc = cairoStartOfNextDayUtc(period.yesterday); // exclusive upper bound (= today 00:00 Cairo)

  const mtdStartUtc = cairoStartOfDayUtc(period.mtd_start);
  // MTD upper bound = start of (today + 1) Cairo, so "today" itself is included.
  const mtdEndUtc = cairoStartOfNextDayUtc(dateIso);

  // Payout forecast windows (check-in based)
  const next2Iso = addDaysCairo(dateIso, 2);
  const monthEndIso = endOfMonth(dateIso);
  // 7d window for unpaid+arriving
  const sevenDaysIso = addDaysCairo(dateIso, 7);

  const [
    { data: yesterdayBookings },
    { data: mtdBookings },
    { data: unpaidUpcoming },
    { data: directBookingsYesterday },
    { data: payouts2d },
    { data: payoutsMonth },
  ] = await Promise.all([
    // Bookings CREATED yesterday Cairo (accrual). Excludes cancellations
    // AND owner stays (which are calendar blocks with no charge).
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, host_payout, commission, fare_accommodation, channel, currency, building_code, check_in_date, created_at_odoo')
      .gte('created_at_odoo', yesterdayStartUtc)
      .lt('created_at_odoo', yesterdayEndUtc)
      .neq('status', 'canceled')
      .neq('source_label', 'owner'),
    // Month-to-date by booking creation (Cairo TZ). Same exclusions.
    sb.from('beithady_reservation_grid_v')
      .select('host_payout, commission, currency, channel, created_at_odoo')
      .gte('created_at_odoo', mtdStartUtc)
      .lt('created_at_odoo', mtdEndUtc)
      .neq('status', 'canceled')
      .neq('source_label', 'owner'),
    // Unpaid + arriving in next 7 days (check-in based, this is correct)
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, building_code, guest_name, check_in_date, payment_balance_cents, payment_currency, channel')
      .eq('flagged_unpaid', true)
      .gte('check_in_date', dateIso)
      .lte('check_in_date', sevenDaysIso)
      .neq('status', 'canceled')
      .neq('source_label', 'owner')
      .order('check_in_date'),
    // Direct bookings created yesterday: channel=manual (= Direct in
    // channel-meta.ts) MINUS owner stays. Owner stays are calendar
    // blocks with no charge, not revenue, so they're excluded from
    // direct-booking revenue counts. Walk-ins, phone bookings, and
    // website-direct bookings remain.
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, host_payout, commission, currency, listing_nickname, source_label, created_at_odoo')
      .gte('created_at_odoo', yesterdayStartUtc)
      .lt('created_at_odoo', yesterdayEndUtc)
      .eq('channel', 'manual')
      .neq('source_label', 'owner')
      .neq('status', 'canceled'),
    // Expected payouts (next 2 days): confirmed reservations checking in.
    // Owner stays excluded — they're zero-charge blocks, not payouts.
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, host_payout, channel, currency, listing_nickname, building_code, check_in_date')
      .gte('check_in_date', dateIso)
      .lte('check_in_date', next2Iso)
      .eq('status', 'confirmed')
      .neq('source_label', 'owner')
      .order('check_in_date'),
    // Expected payouts (until month end): confirmed reservations checking in.
    sb.from('beithady_reservation_grid_v')
      .select('host_payout, channel, currency, check_in_date')
      .gte('check_in_date', dateIso)
      .lte('check_in_date', monthEndIso)
      .eq('status', 'confirmed')
      .neq('source_label', 'owner'),
  ]);

  type RevRow = { reservation_id: string; host_payout: number | string | null; commission: number | string | null; fare_accommodation: number | string | null; channel: string | null; currency: string; building_code: string | null; check_in_date: string };
  const yest = (yesterdayBookings as RevRow[] | null) || [];
  const mtd = (mtdBookings as Array<{ host_payout: number | string | null; commission: number | string | null; currency: string; channel: string | null }> | null) || [];
  const unpaid = (unpaidUpcoming as Array<{ reservation_id: string; listing_nickname: string | null; building_code: string | null; guest_name: string | null; check_in_date: string; payment_balance_cents: number | null; payment_currency: string | null; channel: string | null }> | null) || [];
  const direct = (directBookingsYesterday as Array<{ reservation_id: string; host_payout: number | string | null; commission: number | string | null; currency: string; listing_nickname: string | null }> | null) || [];
  const payouts2 = (payouts2d as Array<{ reservation_id: string; host_payout: number | string | null; channel: string | null; currency: string; listing_nickname: string | null; building_code: string | null; check_in_date: string }> | null) || [];
  const payoutsM = (payoutsMonth as Array<{ host_payout: number | string | null; channel: string | null; currency: string; check_in_date: string }> | null) || [];

  // ---- Per-currency aggregation helpers ----
  // Avoid summing across currencies: USD + AED + EGP must stay separate.
  type CcyTotals = Map<string, number>;
  const sumByCcy = <T extends { currency: string; host_payout: number | string | null; commission?: number | string | null }>(
    rows: T[],
    includeCommission = true,
  ): CcyTotals => {
    const out = new Map<string, number>();
    for (const r of rows) {
      const k = r.currency || 'USD';
      const v = Number(r.host_payout || 0) + (includeCommission ? Number(r.commission || 0) : 0);
      out.set(k, (out.get(k) || 0) + v);
    }
    return out;
  };
  const formatCcy = (totals: CcyTotals): string => {
    const entries = Array.from(totals.entries()).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return '$0';
    return entries.map(([k, v]) => `${formatMoney(v, k)}`).join(' + ');
  };
  const formatMoney = (v: number, ccy: string): string => {
    const rounded = Math.round(v).toLocaleString();
    if (ccy === 'USD') return `$${rounded}`;
    return `${rounded} ${ccy}`;
  };

  const yestCcy = sumByCcy(yest, true);
  const mtdCcy = sumByCcy(mtd, true);
  const directCcy = sumByCcy(direct, true);

  // For the summary numeric, fall back to USD-equivalent best-effort:
  // we report only the USD bucket (don't conflate with AED). The
  // per-ccy line in the section text shows the full mix.
  const yesterdayUsd = yestCcy.get('USD') || 0;
  const mtdUsd = mtdCcy.get('USD') || 0;
  const directUsd = directCcy.get('USD') || 0;

  // Channel breakdown for yesterday (by USD only, to keep the line clean)
  const yestByChannel = new Map<string, number>();
  for (const r of yest) {
    if ((r.currency || 'USD') !== 'USD') continue;
    const k = r.channel || 'unknown';
    yestByChannel.set(k, (yestByChannel.get(k) || 0) + Number(r.host_payout || 0) + Number(r.commission || 0));
  }
  const yestChannelLines = Array.from(yestByChannel.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: $${Math.round(v).toLocaleString()}`)
    .join(' · ');

  // Unpaid total (in cents per row's payment_currency — most are USD;
  // we sum cents and divide by 100 in the same currency bucket).
  const unpaidTotalCents = unpaid.reduce((s, r) => s + (r.payment_balance_cents || 0), 0);

  // Payout forecast: per-currency (no FX conversion in V1)
  const payouts2Ccy = sumByCcy(payouts2 as Array<{ currency: string; host_payout: number | string | null }>, false);
  const payoutsMCcy = sumByCcy(payoutsM as Array<{ currency: string; host_payout: number | string | null }>, false);
  const payouts2UsdTotal = payouts2Ccy.get('USD') || 0;
  const payoutsMUsdTotal = payoutsMCcy.get('USD') || 0;

  // Group 2-day payouts by channel for the breakdown line (USD only)
  const payouts2ByChannel = new Map<string, number>();
  for (const r of payouts2) {
    if ((r.currency || 'USD') !== 'USD') continue;
    const k = r.channel || 'unknown';
    payouts2ByChannel.set(k, (payouts2ByChannel.get(k) || 0) + Number(r.host_payout || 0));
  }
  const payouts2ChannelLine = Array.from(payouts2ByChannel.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: $${Math.round(v).toLocaleString()}`)
    .join(' · ');

  const sections: BriefSection[] = [
    {
      title: `Yesterday's revenue (${yest.length} bookings)`,
      emoji: '💰',
      items: [
        {
          primary: `${formatCcy(yestCcy)} accrued`,
          secondary: yestChannelLines || (yestCcy.size > 1 ? 'Multi-currency mix above' : 'No channel mix'),
          tag: yest.length === 0
            ? { label: 'Quiet day', tone: 'slate' }
            : { label: `${yest.length} new`, tone: 'green' },
        },
      ],
    },
    {
      title: 'Month-to-date',
      emoji: '📊',
      items: [
        {
          primary: `${formatCcy(mtdCcy)} MTD across ${mtd.length} bookings`,
          secondary: mtdCcy.size > 1
            ? 'Per currency above (no FX conversion).'
            : 'USD only',
        },
      ],
    },
    {
      title: `Expected payouts — next 2 days (${payouts2.length})`,
      emoji: '⏱',
      items: payouts2.length > 0 ? [
        {
          primary: `${formatCcy(payouts2Ccy)} accruing across ${payouts2.length} confirmed check-in${payouts2.length === 1 ? '' : 's'}`,
          secondary: payouts2ChannelLine || '—',
          tag: { label: 'Forecast', tone: 'cyan' },
        },
        ...payouts2.slice(0, 8).map(r => ({
          primary: `${r.check_in_date} · ${r.listing_nickname || '—'}`,
          secondary: `${r.channel || ''} · ${formatMoney(Number(r.host_payout || 0), r.currency || 'USD')}${r.building_code ? ` · ${r.building_code}` : ''}`,
        })),
      ] : [],
      empty_message: 'No confirmed check-ins in the next 2 days.',
    },
    {
      title: `Expected payouts — through month end (${payoutsM.length})`,
      emoji: '📅',
      items: payoutsM.length > 0 ? [
        {
          primary: `${formatCcy(payoutsMCcy)} forecast through ${monthEndIso}`,
          secondary: `${payoutsM.length} confirmed reservation${payoutsM.length === 1 ? '' : 's'}. Assumes channel pre-collection (Airbnb/Booking) and clears within their normal payout window.`,
          tag: { label: 'Forecast', tone: 'cyan' },
        },
      ] : [],
      empty_message: 'No confirmed bookings checking in this month.',
    },
    {
      title: `Unpaid + arriving ≤7 days (${unpaid.length})`,
      emoji: '🔴',
      items: unpaid.length > 0 ? [
        {
          primary: `${unpaid.length} reservation${unpaid.length === 1 ? '' : 's'} · $${Math.round(unpaidTotalCents / 100).toLocaleString()} balance`,
          secondary: 'Confirm payment with each guest before check-in',
          tag: { label: 'Action', tone: 'red' },
        },
        ...unpaid.slice(0, 8).map(r => ({
          primary: `${r.check_in_date} · ${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
          secondary: `${r.channel || ''}${r.payment_balance_cents != null ? ` · $${Math.round((r.payment_balance_cents || 0) / 100).toLocaleString()}` : ''}${r.building_code ? ` · ${r.building_code}` : ''}`,
          href: `/beithady/operations/calendar?reservation=${r.reservation_id}`,
        })),
      ] : [],
      empty_message: 'No unpaid reservations in the next 7 days. ✓',
    },
    {
      title: `Direct-booking revenue yesterday (${direct.length})`,
      emoji: '🎯',
      items: direct.length > 0
        ? [{
            primary: `${formatCcy(directCcy)} from ${direct.length} direct booking${direct.length === 1 ? '' : 's'}`,
            secondary: direct.map(d => d.listing_nickname).filter(Boolean).slice(0, 5).join(' · '),
            tag: { label: 'No commission', tone: 'green' },
          }]
        : [],
      empty_message: 'No direct bookings yesterday. Push the Direct funnel.',
    },
  ];

  return {
    role: 'finance',
    date_iso: dateIso,
    cairo_label: cairoLabel(dateIso),
    language: 'en',
    sections,
    summary: {
      yesterday_bookings: yest.length,
      yesterday_revenue_usd: Math.round(yesterdayUsd),
      mtd_revenue_usd: Math.round(mtdUsd),
      mtd_bookings: mtd.length,
      unpaid_arriving: unpaid.length,
      unpaid_balance_usd: Math.round(unpaidTotalCents / 100),
      direct_bookings_yesterday: direct.length,
      direct_revenue_usd: Math.round(directUsd),
      payouts_2d_count: payouts2.length,
      payouts_2d_usd: Math.round(payouts2UsdTotal),
      payouts_month_count: payoutsM.length,
      payouts_month_usd: Math.round(payoutsMUsdTotal),
    },
  };
}

// Returns the UTC ISO timestamp of "00:00:00 Cairo" on the given Cairo
// calendar date. Inlined here (not exported from cairo-dates.ts) to keep
// the helper change minimal.
function cairoStartOfDayUtc(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const naiveUtc = Date.UTC(y, m - 1, d, 0, 0, 0);
  const cairoLocal = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(naiveUtc));
  const lookup = Object.fromEntries(cairoLocal.map(p => [p.type, p.value]));
  const cairoMs = Date.UTC(
    parseInt(lookup.year, 10),
    parseInt(lookup.month, 10) - 1,
    parseInt(lookup.day, 10),
    parseInt((lookup.hour === '24' ? '0' : lookup.hour) || '0', 10),
    parseInt(lookup.minute || '0', 10),
    parseInt(lookup.second || '0', 10),
  );
  const offsetMs = cairoMs - naiveUtc;
  return new Date(naiveUtc - offsetMs).toISOString();
}

function cairoStartOfNextDayUtc(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d));
  next.setUTCDate(next.getUTCDate() + 1);
  return cairoStartOfDayUtc(next.toISOString().slice(0, 10));
}

function cairoLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
