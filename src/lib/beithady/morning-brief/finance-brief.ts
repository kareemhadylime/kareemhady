import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { reportPeriodWindow, addDays as addDaysCairo, endOfMonth } from '@/lib/beithady-daily-report/cairo-dates';
import {
  countryForBuilding,
  formatMoneyCountry,
  COUNTRY_LABEL,
  type CountryCode,
} from './country';
import type { Brief, BriefSection } from './types';

// Finance & Accounting brief — what finance needs at 8am.
//
// Audit changes (2026-04-30)
// --------------------------
// * **Country segregation everywhere.** Standing rule from owner: every
//   revenue / payout figure is split Egypt-vs-UAE, in each country's
//   functional reporting currency (Egypt USD, UAE AED). No FX on the
//   line — totals are reported in their native currency.
// * **Status filter tightened.** Bookings yesterday + MTD now exclude
//   `inquiry` (un-booked guest enquiries). They still INCLUDE `reserved`
//   because reserved = guaranteed booking awaiting payment confirmation,
//   which is real accrued revenue.
// * **"Currently staying" exposure.** Surfaced as a separate section so
//   finance has visibility on in-flight payouts (matches Guesty
//   homepage's "Currently staying" tile).
//
// Semantics
// ---------
// - "Yesterday's revenue" = bookings CREATED yesterday Cairo (accrual basis).
//   Excludes canceled + inquiry + owner stays.
// - "Month-to-date" = bookings CREATED so far this Cairo month, same
//   exclusions.
// - "Expected payouts" = confirmed reservations whose CHECK-IN falls in
//   the window. host_payout reported in the reservation's local currency,
//   grouped by country.

const NON_REVENUE_STATUSES = ['canceled', 'inquiry', 'declined', 'expired'] as const;

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
  const sevenDaysIso = addDaysCairo(dateIso, 7);

  const [
    { data: yesterdayBookings },
    { data: mtdBookings },
    { data: unpaidUpcoming },
    { data: directBookingsYesterday },
    { data: payouts2d },
    { data: payoutsMonth },
    { data: currentlyStaying },
  ] = await Promise.all([
    // Bookings CREATED yesterday Cairo (accrual). Excludes cancellations,
    // inquiries (un-booked), owner stays, and manual blocks.
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, host_payout, commission, fare_accommodation, channel, currency, building_code, listing_nickname, check_in_date, created_at_odoo, status')
      .gte('created_at_odoo', yesterdayStartUtc)
      .lt('created_at_odoo', yesterdayEndUtc)
      .not('status', 'in', `(${NON_REVENUE_STATUSES.join(',')})`)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true),
    // Month-to-date by booking creation (Cairo TZ). Same exclusions.
    sb.from('beithady_reservation_grid_v')
      .select('host_payout, commission, currency, channel, building_code, listing_nickname, created_at_odoo, status')
      .gte('created_at_odoo', mtdStartUtc)
      .lt('created_at_odoo', mtdEndUtc)
      .not('status', 'in', `(${NON_REVENUE_STATUSES.join(',')})`)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true),
    // Unpaid + arriving in next 7 days (check-in based). Confirmed only.
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, building_code, guest_name, check_in_date, payment_balance_cents, payment_currency, channel, currency')
      .eq('flagged_unpaid', true)
      .gte('check_in_date', dateIso)
      .lte('check_in_date', sevenDaysIso)
      .eq('status', 'confirmed')
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('check_in_date'),
    // Direct bookings created yesterday: channel=manual.
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, host_payout, commission, currency, listing_nickname, source_label, building_code, created_at_odoo')
      .gte('created_at_odoo', yesterdayStartUtc)
      .lt('created_at_odoo', yesterdayEndUtc)
      .eq('channel', 'manual')
      .neq('source_label', 'owner')
      .not('status', 'in', `(${NON_REVENUE_STATUSES.join(',')})`)
      .neq('is_manual_block', true),
    // Expected payouts (next 2 days): confirmed reservations checking in.
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, host_payout, channel, currency, listing_nickname, building_code, check_in_date')
      .gte('check_in_date', dateIso)
      .lte('check_in_date', next2Iso)
      .eq('status', 'confirmed')
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('check_in_date'),
    // Expected payouts (until month end): confirmed reservations checking in.
    sb.from('beithady_reservation_grid_v')
      .select('host_payout, channel, currency, building_code, check_in_date')
      .gte('check_in_date', dateIso)
      .lte('check_in_date', monthEndIso)
      .eq('status', 'confirmed')
      .neq('source_label', 'owner')
      .neq('is_manual_block', true),
    // Currently staying (Guesty homepage parity): confirmed reservations
    // whose stay covers today (checked-in but not checked-out yet).
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, host_payout, currency, building_code, guest_count, nights, check_in_date, check_out_date')
      .lte('check_in_date', dateIso)
      .gt('check_out_date', dateIso)
      .eq('status', 'confirmed')
      .neq('source_label', 'owner')
      .neq('is_manual_block', true),
  ]);

  type RevRow = {
    reservation_id?: string;
    host_payout: number | string | null;
    commission: number | string | null;
    fare_accommodation?: number | string | null;
    channel: string | null;
    currency: string;
    building_code: string | null;
    listing_nickname?: string | null;
    check_in_date?: string;
    status?: string;
  };
  const yest = (yesterdayBookings as RevRow[] | null) || [];
  const mtd = (mtdBookings as Array<{ host_payout: number | string | null; commission: number | string | null; currency: string; channel: string | null; building_code: string | null; listing_nickname: string | null }> | null) || [];
  const unpaid = (unpaidUpcoming as Array<{ reservation_id: string; listing_nickname: string | null; building_code: string | null; guest_name: string | null; check_in_date: string; payment_balance_cents: number | null; payment_currency: string | null; channel: string | null; currency: string | null }> | null) || [];
  const direct = (directBookingsYesterday as Array<{ reservation_id: string; host_payout: number | string | null; commission: number | string | null; currency: string; listing_nickname: string | null; building_code: string | null }> | null) || [];
  const payouts2 = (payouts2d as Array<{ reservation_id: string; host_payout: number | string | null; channel: string | null; currency: string; listing_nickname: string | null; building_code: string | null; check_in_date: string }> | null) || [];
  const payoutsM = (payoutsMonth as Array<{ host_payout: number | string | null; channel: string | null; currency: string; building_code: string | null; check_in_date: string }> | null) || [];
  const staying = (currentlyStaying as Array<{ reservation_id: string; host_payout: number | string | null; currency: string; building_code: string | null; guest_count: number | null; nights: number | null; check_in_date: string; check_out_date: string }> | null) || [];

  // Per-country, per-currency aggregation. Egypt totals stay in their
  // native currency (mostly USD via Airbnb/Booking pre-collection); UAE
  // totals stay in AED. We never cross-sum currencies inside a country.
  const sumByCountry = (
    rows: Array<{ building_code?: string | null; currency?: string | null; host_payout: number | string | null; commission?: number | string | null }>,
    includeCommission: boolean,
  ) => {
    const out: Record<CountryCode, Map<string, number>> = {
      EG: new Map(), AE: new Map(), OTHER: new Map(),
    };
    for (const r of rows) {
      const country = countryForBuilding(r.building_code || null);
      const ccy = (r.currency || (country === 'AE' ? 'AED' : 'USD')).toUpperCase();
      const v = Number(r.host_payout || 0) + (includeCommission ? Number(r.commission || 0) : 0);
      if (v === 0) continue;
      out[country].set(ccy, (out[country].get(ccy) || 0) + v);
    }
    return out;
  };

  const formatCountryLine = (
    totals: Record<CountryCode, Map<string, number>>,
  ): string => {
    const parts: string[] = [];
    for (const c of ['EG', 'AE', 'OTHER'] as CountryCode[]) {
      const m = totals[c];
      const entries = Array.from(m.entries()).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      if (entries.length === 0) continue;
      const inline = entries.map(([ccy, v]) => `${formatMoney(v, ccy)}`).join(' + ');
      parts.push(`${COUNTRY_LABEL[c].en}: ${inline}`);
    }
    return parts.length > 0 ? parts.join(' · ') : '$0';
  };

  const countByCountry = (
    rows: Array<{ building_code?: string | null }>,
  ): Record<CountryCode, number> => {
    const out: Record<CountryCode, number> = { EG: 0, AE: 0, OTHER: 0 };
    for (const r of rows) out[countryForBuilding(r.building_code || null)] += 1;
    return out;
  };

  const formatMoney = (v: number, ccy: string): string => {
    const rounded = Math.round(v).toLocaleString();
    if (ccy === 'USD') return `$${rounded}`;
    return `${rounded} ${ccy}`;
  };

  const yestByCountry = sumByCountry(yest, true);
  const mtdByCountry = sumByCountry(mtd, true);
  const directByCountry = sumByCountry(direct, true);
  const payouts2ByCountry = sumByCountry(payouts2, false);
  const payoutsMByCountry = sumByCountry(payoutsM, false);
  const stayingByCountry = sumByCountry(staying, false);

  const yestCountByCountry = countByCountry(yest);
  const mtdCountByCountry = countByCountry(mtd);
  const stayingCountByCountry = countByCountry(staying);
  const payouts2CountByCountry = countByCountry(payouts2);
  const payoutsMCountByCountry = countByCountry(payoutsM);

  // Channel breakdown for yesterday — split by country so the user can
  // see Egypt-airbnb vs UAE-bookingCom separately.
  const channelLineByCountry = (rows: typeof yest): string => {
    const byCountry: Record<CountryCode, Map<string, number>> = {
      EG: new Map(), AE: new Map(), OTHER: new Map(),
    };
    for (const r of rows) {
      const country = countryForBuilding(r.building_code || null);
      const ccy = (r.currency || 'USD').toUpperCase();
      const k = `${r.channel || 'unknown'}|${ccy}`;
      const v = Number(r.host_payout || 0) + Number(r.commission || 0);
      if (v === 0) continue;
      byCountry[country].set(k, (byCountry[country].get(k) || 0) + v);
    }
    const parts: string[] = [];
    for (const c of ['EG', 'AE'] as CountryCode[]) {
      const m = byCountry[c];
      if (m.size === 0) continue;
      const top = Array.from(m.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => {
          const [chan, ccy] = k.split('|');
          return `${chan} ${formatMoney(v, ccy)}`;
        })
        .join(' · ');
      parts.push(`${COUNTRY_LABEL[c].en} → ${top}`);
    }
    return parts.join('  |  ');
  };
  const yestChannelLines = channelLineByCountry(yest);

  // Unpaid arriving in next 7 days — split by country in their native ccy.
  const unpaidByCountry: Record<CountryCode, { count: number; cents: Map<string, number> }> = {
    EG: { count: 0, cents: new Map() },
    AE: { count: 0, cents: new Map() },
    OTHER: { count: 0, cents: new Map() },
  };
  for (const r of unpaid) {
    const country = countryForBuilding(r.building_code || null);
    unpaidByCountry[country].count += 1;
    const ccy = (r.payment_currency || r.currency || (country === 'AE' ? 'AED' : 'USD')).toUpperCase();
    unpaidByCountry[country].cents.set(
      ccy,
      (unpaidByCountry[country].cents.get(ccy) || 0) + (r.payment_balance_cents || 0),
    );
  }
  const unpaidLine = (() => {
    const parts: string[] = [];
    for (const c of ['EG', 'AE', 'OTHER'] as CountryCode[]) {
      const b = unpaidByCountry[c];
      if (b.count === 0) continue;
      const totals = Array.from(b.cents.entries())
        .filter(([, v]) => v > 0)
        .map(([ccy, v]) => formatMoney(v / 100, ccy))
        .join(' + ');
      parts.push(`${COUNTRY_LABEL[c].en}: ${b.count} (${totals || '0'})`);
    }
    return parts.join(' · ');
  })();
  const unpaidTotalCount = unpaid.length;

  // Sections
  const sections: BriefSection[] = [
    {
      title: `Yesterday's revenue (${yest.length} bookings)`,
      emoji: '💰',
      items: [
        {
          primary: `${formatCountryLine(yestByCountry)} accrued`,
          secondary: yestChannelLines || (yest.length === 0 ? 'Quiet day' : 'Multi-currency mix above'),
          tag: yest.length === 0
            ? { label: 'Quiet day', tone: 'slate' }
            : { label: `${yest.length} new`, tone: 'green' },
        },
        ...(yestCountByCountry.EG > 0 ? [{
          primary: `Egypt: ${yestCountByCountry.EG} booking${yestCountByCountry.EG === 1 ? '' : 's'}`,
          secondary: 'Egypt-side accrued in USD (Airbnb/Booking pre-collect).',
        }] : []),
        ...(yestCountByCountry.AE > 0 ? [{
          primary: `UAE: ${yestCountByCountry.AE} booking${yestCountByCountry.AE === 1 ? '' : 's'}`,
          secondary: 'UAE-side accrued in AED.',
        }] : []),
      ],
    },
    {
      title: 'Month-to-date',
      emoji: '📊',
      items: [
        {
          primary: `${formatCountryLine(mtdByCountry)}`,
          secondary: `${mtd.length} booking${mtd.length === 1 ? '' : 's'} created MTD · per country in native currency (no FX).`,
        },
        ...(mtdCountByCountry.EG > 0 ? [{
          primary: `Egypt — ${mtdCountByCountry.EG} bookings`,
          secondary: undefined,
        }] : []),
        ...(mtdCountByCountry.AE > 0 ? [{
          primary: `UAE — ${mtdCountByCountry.AE} bookings`,
          secondary: undefined,
        }] : []),
      ],
    },
    {
      title: `Currently staying (${staying.length})`,
      emoji: '🏨',
      items: [
        {
          primary: `${formatCountryLine(stayingByCountry)} live host-payout in flight`,
          secondary: `Egypt: ${stayingCountByCountry.EG} · UAE: ${stayingCountByCountry.AE}${stayingCountByCountry.OTHER > 0 ? ` · Other: ${stayingCountByCountry.OTHER}` : ''}`,
          tag: { label: 'In-flight', tone: 'cyan' },
        },
      ],
      empty_message: 'No active stays today.',
    },
    {
      title: `Expected payouts — next 2 days (${payouts2.length})`,
      emoji: '⏱',
      items: payouts2.length > 0 ? [
        {
          primary: `${formatCountryLine(payouts2ByCountry)} accruing`,
          secondary: `Egypt: ${payouts2CountByCountry.EG} · UAE: ${payouts2CountByCountry.AE}${payouts2CountByCountry.OTHER > 0 ? ` · Other: ${payouts2CountByCountry.OTHER}` : ''}`,
          tag: { label: 'Forecast', tone: 'cyan' },
        },
        ...payouts2.slice(0, 8).map(r => {
          const country = countryForBuilding(r.building_code || null);
          return {
            primary: `${r.check_in_date} · ${r.listing_nickname || '—'}`,
            secondary: `${COUNTRY_LABEL[country].en} · ${r.channel || ''} · ${formatMoneyCountry(Number(r.host_payout || 0), country)}${r.building_code ? ` · ${r.building_code}` : ''}`,
          };
        }),
      ] : [],
      empty_message: 'No confirmed check-ins in the next 2 days.',
    },
    {
      title: `Expected payouts — through month end (${payoutsM.length})`,
      emoji: '📅',
      items: payoutsM.length > 0 ? [
        {
          primary: `${formatCountryLine(payoutsMByCountry)} forecast through ${monthEndIso}`,
          secondary: `Egypt: ${payoutsMCountByCountry.EG} · UAE: ${payoutsMCountByCountry.AE}${payoutsMCountByCountry.OTHER > 0 ? ` · Other: ${payoutsMCountByCountry.OTHER}` : ''} · assumes channel pre-collect.`,
          tag: { label: 'Forecast', tone: 'cyan' },
        },
      ] : [],
      empty_message: 'No confirmed bookings checking in this month.',
    },
    {
      title: `Unpaid + arriving ≤7 days (${unpaidTotalCount})`,
      emoji: '🔴',
      items: unpaidTotalCount > 0 ? [
        {
          primary: `${unpaidTotalCount} reservation${unpaidTotalCount === 1 ? '' : 's'}`,
          secondary: unpaidLine || 'Confirm payment with each guest before check-in',
          tag: { label: 'Action', tone: 'red' },
        },
        ...unpaid.slice(0, 8).map(r => {
          const country = countryForBuilding(r.building_code || null);
          const ccy = (r.payment_currency || r.currency || (country === 'AE' ? 'AED' : 'USD')).toUpperCase();
          return {
            primary: `${r.check_in_date} · ${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
            secondary: `${COUNTRY_LABEL[country].en} · ${r.channel || ''}${r.payment_balance_cents != null ? ` · ${formatMoney((r.payment_balance_cents || 0) / 100, ccy)}` : ''}${r.building_code ? ` · ${r.building_code}` : ''}`,
            href: `/beithady/operations/calendar?reservation=${r.reservation_id}`,
          };
        }),
      ] : [],
      empty_message: 'No unpaid reservations in the next 7 days. ✓',
    },
    {
      title: `Direct-booking revenue yesterday (${direct.length})`,
      emoji: '🎯',
      items: direct.length > 0
        ? [{
            primary: `${formatCountryLine(directByCountry)} from ${direct.length} direct booking${direct.length === 1 ? '' : 's'}`,
            secondary: direct.map(d => d.listing_nickname).filter(Boolean).slice(0, 5).join(' · '),
            tag: { label: 'No commission', tone: 'green' },
          }]
        : [],
      empty_message: 'No direct bookings yesterday. Push the Direct funnel.',
    },
  ];

  // Numeric summary — keep per-country totals so trend dashboards can
  // chart Egypt and UAE separately. USD still reported (Egypt's display
  // currency); AED reported separately.
  const sumCcy = (totals: Record<CountryCode, Map<string, number>>, country: CountryCode, ccy: string) =>
    Math.round(totals[country].get(ccy) || 0);

  return {
    role: 'finance',
    date_iso: dateIso,
    cairo_label: cairoLabel(dateIso),
    language: 'en',
    sections,
    summary: {
      yesterday_bookings: yest.length,
      yesterday_revenue_eg_usd: sumCcy(yestByCountry, 'EG', 'USD'),
      yesterday_revenue_ae_aed: sumCcy(yestByCountry, 'AE', 'AED'),
      mtd_revenue_eg_usd: sumCcy(mtdByCountry, 'EG', 'USD'),
      mtd_revenue_ae_aed: sumCcy(mtdByCountry, 'AE', 'AED'),
      mtd_bookings: mtd.length,
      currently_staying: staying.length,
      currently_staying_eg: stayingCountByCountry.EG,
      currently_staying_ae: stayingCountByCountry.AE,
      unpaid_arriving: unpaidTotalCount,
      direct_bookings_yesterday: direct.length,
      direct_revenue_eg_usd: sumCcy(directByCountry, 'EG', 'USD'),
      direct_revenue_ae_aed: sumCcy(directByCountry, 'AE', 'AED'),
      payouts_2d_count: payouts2.length,
      payouts_2d_eg_usd: sumCcy(payouts2ByCountry, 'EG', 'USD'),
      payouts_2d_ae_aed: sumCcy(payouts2ByCountry, 'AE', 'AED'),
      payouts_month_count: payoutsM.length,
      payouts_month_eg_usd: sumCcy(payoutsMByCountry, 'EG', 'USD'),
      payouts_month_ae_aed: sumCcy(payoutsMByCountry, 'AE', 'AED'),
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
