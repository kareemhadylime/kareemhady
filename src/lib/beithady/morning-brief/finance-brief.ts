import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { reportPeriodWindow, addDays as addDaysCairo, endOfMonth } from '@/lib/beithady-daily-report/cairo-dates';
import {
  bucketForListing,
  isExcludedFromRevenue,
  sumByBucketCurrency,
  countByBucket,
  formatEgyptTotalsLine,
  formatDxbInfoLine,
  formatMoneyByCurrency,
  formatMoneyBucket,
  sumEgyptByCurrency,
  BUCKET_LABEL,
  EGYPT_BUCKETS,
  type BriefBucket,
} from './country';
import { getCurrentlyStaying, CANONICAL_FOOTER_EN } from '@/lib/beithady/guesty-metrics';
import type { Brief, BriefSection } from './types';

// Finance & Accounting brief — what finance needs at 8am.
//
// Audit changes (2026-04-30 part 2)
// ---------------------------------
// * **Bucket rebucket.** Replaced country-based EG/AE buckets with 6
//   building buckets: BH-26 / BH-73 / BH-435 / BH-OK / BH-OTHERS /
//   BH-DXB. UAE (BH-DXB) is ALWAYS shown on a separate info line and
//   NEVER counts toward revenue / payouts / cost / headline counts.
// * **Status filter** still excludes inquiry / declined / expired
//   (Guesty parity).
//
// Semantics
// ---------
// - "Yesterday's revenue" = bookings CREATED yesterday Cairo (accrual basis).
//   Excludes canceled + inquiry + owner stays + UAE.
// - "Month-to-date" = bookings CREATED so far this Cairo month, same
//   exclusions.
// - "Expected payouts" = confirmed reservations whose CHECK-IN falls in
//   the window. host_payout reported in the row's local currency,
//   grouped per Egypt bucket. UAE shown as separate excluded line.

const NON_REVENUE_STATUSES = ['canceled', 'inquiry', 'declined', 'expired'] as const;

export async function buildFinanceBrief(dateIso: string): Promise<Brief> {
  const sb = supabaseAdmin();
  const period = reportPeriodWindow(dateIso);

  const yesterdayStartUtc = period.period_start_iso;
  const yesterdayEndUtc = cairoStartOfNextDayUtc(period.yesterday);

  const mtdStartUtc = cairoStartOfDayUtc(period.mtd_start);
  const mtdEndUtc = cairoStartOfNextDayUtc(dateIso);

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
  ] = await Promise.all([
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, host_payout, commission, fare_accommodation, channel, currency, building_code, listing_id, listing_nickname, check_in_date, created_at_odoo, status')
      .gte('created_at_odoo', yesterdayStartUtc)
      .lt('created_at_odoo', yesterdayEndUtc)
      .not('status', 'in', `(${NON_REVENUE_STATUSES.join(',')})`)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true),
    sb.from('beithady_reservation_grid_v')
      .select('host_payout, commission, currency, channel, building_code, listing_id, listing_nickname, created_at_odoo, status')
      .gte('created_at_odoo', mtdStartUtc)
      .lt('created_at_odoo', mtdEndUtc)
      .not('status', 'in', `(${NON_REVENUE_STATUSES.join(',')})`)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true),
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, listing_id, building_code, guest_name, check_in_date, payment_balance_cents, payment_currency, channel, currency')
      .eq('flagged_unpaid', true)
      .gte('check_in_date', dateIso)
      .lte('check_in_date', sevenDaysIso)
      .eq('status', 'confirmed')
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('check_in_date'),
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, host_payout, commission, currency, listing_nickname, listing_id, source_label, building_code, created_at_odoo')
      .gte('created_at_odoo', yesterdayStartUtc)
      .lt('created_at_odoo', yesterdayEndUtc)
      .eq('channel', 'manual')
      .neq('source_label', 'owner')
      .not('status', 'in', `(${NON_REVENUE_STATUSES.join(',')})`)
      .neq('is_manual_block', true),
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, host_payout, channel, currency, listing_nickname, listing_id, building_code, check_in_date')
      .gte('check_in_date', dateIso)
      .lte('check_in_date', next2Iso)
      .eq('status', 'confirmed')
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('check_in_date'),
    sb.from('beithady_reservation_grid_v')
      .select('host_payout, channel, currency, building_code, listing_id, listing_nickname, check_in_date')
      .gte('check_in_date', dateIso)
      .lte('check_in_date', monthEndIso)
      .eq('status', 'confirmed')
      .neq('source_label', 'owner')
      .neq('is_manual_block', true),
  ]);

  // Currently staying — uses canonical guesty-metrics module so this number
  // matches every other report (briefs / Daily Performance / Reports module).
  // See src/lib/beithady/guesty-metrics.ts for locked-in semantics.
  const stayingCanonical = await getCurrentlyStaying(dateIso);

  type RevRow = {
    reservation_id?: string;
    host_payout: number | string | null;
    commission: number | string | null;
    fare_accommodation?: number | string | null;
    channel: string | null;
    currency: string;
    building_code: string | null;
    listing_id?: string | null;
    listing_nickname?: string | null;
    check_in_date?: string;
    status?: string;
  };
  const yest = (yesterdayBookings as RevRow[] | null) || [];
  const mtd = (mtdBookings as Array<{ host_payout: number | string | null; commission: number | string | null; currency: string; channel: string | null; building_code: string | null; listing_id: string | null; listing_nickname: string | null }> | null) || [];
  const unpaid = (unpaidUpcoming as Array<{ reservation_id: string; listing_nickname: string | null; listing_id: string | null; building_code: string | null; guest_name: string | null; check_in_date: string; payment_balance_cents: number | null; payment_currency: string | null; channel: string | null; currency: string | null }> | null) || [];
  const direct = (directBookingsYesterday as Array<{ reservation_id: string; host_payout: number | string | null; commission: number | string | null; currency: string; listing_nickname: string | null; listing_id: string | null; building_code: string | null }> | null) || [];
  const payouts2 = (payouts2d as Array<{ reservation_id: string; host_payout: number | string | null; channel: string | null; currency: string; listing_nickname: string | null; listing_id: string | null; building_code: string | null; check_in_date: string }> | null) || [];
  const payoutsM = (payoutsMonth as Array<{ host_payout: number | string | null; channel: string | null; currency: string; building_code: string | null; listing_id: string | null; listing_nickname: string | null; check_in_date: string }> | null) || [];
  // Map canonical result to the local shape (so the rest of this file works
  // unchanged). Canonical module uses BUILDING_BUCKET ('BH-DXB','OTHER');
  // local code uses raw building_code strings (preserves NULL).
  const staying = stayingCanonical.reservations.map(r => ({
    reservation_id: r.reservation_id,
    host_payout: r.host_payout,
    currency: r.currency || 'USD',
    building_code: r.building === 'OTHER' ? null : r.building,
    listing_id: r.listing_id,
    listing_nickname: r.listing_nickname,
    guest_count: r.guests,
    nights: r.nights,
    check_in_date: r.check_in_date,
    check_out_date: r.check_out_date,
  }));
  const stayingManualBlocks = stayingCanonical.manual_block_unpaid;

  // Aggregate every collection per BriefBucket. UAE is captured in
  // BH-DXB but NOT counted in headlines / totals — only displayed on
  // its own info line.
  const yestTotals = sumByBucketCurrency(yest, { includeCommission: true });
  const mtdTotals = sumByBucketCurrency(mtd, { includeCommission: true });
  const directTotals = sumByBucketCurrency(direct, { includeCommission: true });
  const payouts2Totals = sumByBucketCurrency(payouts2);
  const payoutsMTotals = sumByBucketCurrency(payoutsM);
  const stayingTotals = sumByBucketCurrency(staying);

  const yestCount = countByBucket(yest);
  const mtdCount = countByBucket(mtd);
  const stayingCount = countByBucket(staying);
  const payouts2Count = countByBucket(payouts2);
  const payoutsMCount = countByBucket(payoutsM);
  const directCount = countByBucket(direct);

  // Egypt-only headline counts (per Q3=A: total counts exclude UAE).
  const egyptCount = (counts: Record<BriefBucket, number>): number =>
    EGYPT_BUCKETS.reduce((s, b) => s + counts[b], 0);

  const yestEgypt = egyptCount(yestCount);
  const mtdEgypt = egyptCount(mtdCount);
  const stayingEgypt = egyptCount(stayingCount);
  const payouts2Egypt = egyptCount(payouts2Count);
  const payoutsMEgypt = egyptCount(payoutsMCount);
  const directEgypt = egyptCount(directCount);

  // Channel breakdown for yesterday — Egypt only, per-channel.
  const yestByChannel = new Map<string, Map<string, number>>();
  for (const r of yest) {
    const bucket = bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname });
    if (isExcludedFromRevenue(bucket)) continue;
    const ccy = (r.currency || 'USD').toUpperCase();
    const k = r.channel || 'unknown';
    const v = Number(r.host_payout || 0) + Number(r.commission || 0);
    if (v === 0) continue;
    let m = yestByChannel.get(k);
    if (!m) { m = new Map(); yestByChannel.set(k, m); }
    m.set(ccy, (m.get(ccy) || 0) + v);
  }
  const yestChannelLine = Array.from(yestByChannel.entries())
    .map(([chan, m]) => {
      const totals = Array.from(m.entries()).map(([ccy, v]) => formatMoneyByCurrency(v, ccy)).join(' + ');
      return `${chan}: ${totals}`;
    })
    .join(' · ');

  // Unpaid breakdown — Egypt only (UAE excluded per rule).
  const unpaidByBucket: Record<BriefBucket, { count: number; cents: Map<string, number> }> = {
    'BH-26':     { count: 0, cents: new Map() },
    'BH-73':     { count: 0, cents: new Map() },
    'BH-435':    { count: 0, cents: new Map() },
    'BH-OK':     { count: 0, cents: new Map() },
    'BH-OTHERS': { count: 0, cents: new Map() },
    'BH-DXB':    { count: 0, cents: new Map() },
  };
  for (const r of unpaid) {
    const bucket = bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname });
    unpaidByBucket[bucket].count += 1;
    const ccy = (r.payment_currency || r.currency || BUCKET_LABEL[bucket].display_currency).toUpperCase();
    unpaidByBucket[bucket].cents.set(ccy, (unpaidByBucket[bucket].cents.get(ccy) || 0) + (r.payment_balance_cents || 0));
  }
  const unpaidEgyptLine = (() => {
    const parts: string[] = [];
    for (const b of EGYPT_BUCKETS) {
      const x = unpaidByBucket[b];
      if (x.count === 0) continue;
      const totals = Array.from(x.cents.entries()).filter(([, v]) => v > 0).map(([ccy, v]) => formatMoneyByCurrency(v / 100, ccy)).join(' + ');
      parts.push(`${BUCKET_LABEL[b].en}: ${x.count}${totals ? ` (${totals})` : ''}`);
    }
    return parts.join(' · ');
  })();
  const unpaidEgyptCount = EGYPT_BUCKETS.reduce((s, b) => s + unpaidByBucket[b].count, 0);
  const unpaidDxbCount = unpaidByBucket['BH-DXB'].count;
  const unpaidDxbLine = unpaidDxbCount > 0
    ? `BH-DXB: ${unpaidDxbCount} reservation${unpaidDxbCount === 1 ? '' : 's'} (excluded from totals)`
    : null;

  // Helper: "BH-DXB: N reservations · X AED (excluded from totals)" when there's UAE activity.
  const dxbLine = (totals: typeof yestTotals, count: number) =>
    formatDxbInfoLine(totals, count, 'en');

  const sections: BriefSection[] = [
    {
      title: `Yesterday's revenue (${yestEgypt} bookings)`,
      emoji: '💰',
      items: [
        {
          primary: `${formatEgyptTotalsLine(yestTotals, 'en')} accrued`,
          secondary: yestChannelLine || (yestEgypt === 0 ? 'Quiet day' : 'Per-bucket above'),
          tag: yestEgypt === 0
            ? { label: 'Quiet day', tone: 'slate' }
            : { label: `${yestEgypt} new`, tone: 'green' },
        },
        ...(yestCount['BH-DXB'] > 0 ? [{
          primary: dxbLine(yestTotals, yestCount['BH-DXB']) || '',
          secondary: undefined,
          tag: { label: 'UAE — excluded', tone: 'slate' as const },
        }] : []),
      ],
    },
    {
      title: 'Month-to-date',
      emoji: '📊',
      items: [
        {
          primary: `${formatEgyptTotalsLine(mtdTotals, 'en')} MTD across ${mtdEgypt} bookings`,
          secondary: 'Per Egypt bucket in native currency · UAE excluded.',
        },
        ...(mtdCount['BH-DXB'] > 0 ? [{
          primary: dxbLine(mtdTotals, mtdCount['BH-DXB']) || '',
          secondary: undefined,
          tag: { label: 'UAE — excluded', tone: 'slate' as const },
        }] : []),
      ],
    },
    {
      title: `Currently staying (${stayingEgypt})`,
      emoji: '🏨',
      items: [
        {
          primary: `${formatEgyptTotalsLine(stayingTotals, 'en')} live host-payout in flight`,
          secondary: EGYPT_BUCKETS.filter(b => stayingCount[b] > 0).map(b => `${BUCKET_LABEL[b].en}: ${stayingCount[b]}`).join(' · ') || 'No active stays',
          tag: { label: 'In-flight', tone: 'cyan' },
        },
        ...(stayingCount['BH-DXB'] > 0 ? [{
          primary: dxbLine(stayingTotals, stayingCount['BH-DXB']) || '',
          secondary: undefined,
          tag: { label: 'UAE — excluded', tone: 'slate' as const },
        }] : []),
      ],
      empty_message: 'No active stays today.',
    },
    // Manual blocks / owner stays — surfaced separately so finance has
    // visibility on units off-market without booking revenue (Q2 ratification).
    {
      title: `Manual Block Unpaid (${stayingManualBlocks.length})`,
      emoji: '🛠',
      items: stayingManualBlocks.length > 0
        ? stayingManualBlocks.slice(0, 8).map(r => ({
            primary: `${r.listing_nickname || r.listing_id || '—'} · ${r.guest_name || 'Owner / block'}`,
            secondary: `${r.building} · ${r.source || 'manual'} · ${r.check_in_date} → ${r.check_out_date}`,
            tag: { label: 'Off-market', tone: 'amber' as const },
          }))
        : [],
      empty_message: 'No manual blocks or owner stays today.',
    },
    {
      title: `Expected payouts — next 2 days (${payouts2Egypt})`,
      emoji: '⏱',
      items: payouts2Egypt > 0 ? [
        {
          primary: `${formatEgyptTotalsLine(payouts2Totals, 'en')} accruing`,
          secondary: EGYPT_BUCKETS.filter(b => payouts2Count[b] > 0).map(b => `${BUCKET_LABEL[b].en}: ${payouts2Count[b]}`).join(' · '),
          tag: { label: 'Forecast', tone: 'cyan' },
        },
        ...payouts2.filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname }))).slice(0, 8).map(r => {
          const bucket = bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname });
          return {
            primary: `${r.check_in_date} · ${r.listing_nickname || '—'}`,
            secondary: `${BUCKET_LABEL[bucket].en} · ${r.channel || ''} · ${formatMoneyBucket(Number(r.host_payout || 0), bucket)}`,
          };
        }),
        ...(payouts2Count['BH-DXB'] > 0 ? [{
          primary: dxbLine(payouts2Totals, payouts2Count['BH-DXB']) || '',
          secondary: undefined,
          tag: { label: 'UAE — excluded', tone: 'slate' as const },
        }] : []),
      ] : (payouts2Count['BH-DXB'] > 0 ? [{
        primary: dxbLine(payouts2Totals, payouts2Count['BH-DXB']) || '',
        secondary: undefined,
        tag: { label: 'UAE — excluded', tone: 'slate' as const },
      }] : []),
      empty_message: 'No confirmed check-ins in the next 2 days.',
    },
    {
      title: `Expected payouts — through month end (${payoutsMEgypt})`,
      emoji: '📅',
      items: payoutsMEgypt > 0 ? [
        {
          primary: `${formatEgyptTotalsLine(payoutsMTotals, 'en')} forecast through ${monthEndIso}`,
          secondary: `${EGYPT_BUCKETS.filter(b => payoutsMCount[b] > 0).map(b => `${BUCKET_LABEL[b].en}: ${payoutsMCount[b]}`).join(' · ')} · assumes channel pre-collect.`,
          tag: { label: 'Forecast', tone: 'cyan' },
        },
        ...(payoutsMCount['BH-DXB'] > 0 ? [{
          primary: dxbLine(payoutsMTotals, payoutsMCount['BH-DXB']) || '',
          secondary: undefined,
          tag: { label: 'UAE — excluded', tone: 'slate' as const },
        }] : []),
      ] : [],
      empty_message: 'No confirmed bookings checking in this month.',
    },
    {
      title: `Unpaid + arriving ≤7 days (${unpaidEgyptCount})`,
      emoji: '🔴',
      items: unpaidEgyptCount > 0 ? [
        {
          primary: `${unpaidEgyptCount} reservation${unpaidEgyptCount === 1 ? '' : 's'}`,
          secondary: unpaidEgyptLine || 'Confirm payment with each guest before check-in',
          tag: { label: 'Action', tone: 'red' },
        },
        ...unpaid
          .filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname })))
          .slice(0, 8)
          .map(r => {
            const bucket = bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname });
            const ccy = (r.payment_currency || r.currency || BUCKET_LABEL[bucket].display_currency).toUpperCase();
            return {
              primary: `${r.check_in_date} · ${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
              secondary: `${BUCKET_LABEL[bucket].en} · ${r.channel || ''}${r.payment_balance_cents != null ? ` · ${formatMoneyByCurrency((r.payment_balance_cents || 0) / 100, ccy)}` : ''}`,
              href: `/beithady/operations/calendar?reservation=${r.reservation_id}`,
            };
          }),
        ...(unpaidDxbLine ? [{
          primary: unpaidDxbLine,
          secondary: undefined,
          tag: { label: 'UAE — excluded', tone: 'slate' as const },
        }] : []),
      ] : (unpaidDxbLine ? [{
        primary: unpaidDxbLine,
        secondary: undefined,
        tag: { label: 'UAE — excluded', tone: 'slate' as const },
      }] : []),
      empty_message: 'No unpaid reservations in the next 7 days. ✓',
    },
    {
      title: `Direct-booking revenue yesterday (${directEgypt})`,
      emoji: '🎯',
      items: directEgypt > 0
        ? [{
            primary: `${formatEgyptTotalsLine(directTotals, 'en')} from ${directEgypt} direct booking${directEgypt === 1 ? '' : 's'}`,
            secondary: direct.filter(d => !isExcludedFromRevenue(bucketForListing({ building_code: d.building_code, listing_id: d.listing_id, nickname: d.listing_nickname }))).map(d => d.listing_nickname).filter(Boolean).slice(0, 5).join(' · '),
            tag: { label: 'No commission', tone: 'green' },
          }, ...(directCount['BH-DXB'] > 0 ? [{
            primary: dxbLine(directTotals, directCount['BH-DXB']) || '',
            secondary: undefined,
            tag: { label: 'UAE — excluded', tone: 'slate' as const },
          }] : [])]
        : (directCount['BH-DXB'] > 0 ? [{
            primary: dxbLine(directTotals, directCount['BH-DXB']) || '',
            secondary: undefined,
            tag: { label: 'UAE — excluded', tone: 'slate' as const },
          }] : []),
      empty_message: 'No direct bookings yesterday. Push the Direct funnel.',
    },
  ];

  // Numeric summary — Egypt-aggregated USD + per-bucket detail.
  const egyptUsd = (totals: typeof yestTotals): number =>
    Math.round(sumEgyptByCurrency(totals).get('USD') || 0);
  const egyptAed = (totals: typeof yestTotals): number =>
    Math.round(sumEgyptByCurrency(totals).get('AED') || 0);
  const dxbAed = (totals: typeof yestTotals): number =>
    Math.round(totals['BH-DXB'].get('AED') || 0);

  return {
    role: 'finance',
    date_iso: dateIso,
    cairo_label: cairoLabel(dateIso),
    language: 'en',
    sections,
    summary: {
      // Egypt-only headlines (UAE excluded per user rule)
      yesterday_bookings: yestEgypt,
      yesterday_revenue_egypt_usd: egyptUsd(yestTotals),
      yesterday_revenue_egypt_aed: egyptAed(yestTotals),
      mtd_bookings: mtdEgypt,
      mtd_revenue_egypt_usd: egyptUsd(mtdTotals),
      mtd_revenue_egypt_aed: egyptAed(mtdTotals),
      currently_staying: stayingEgypt,
      currently_staying_eg_usd: egyptUsd(stayingTotals),
      payouts_2d_count: payouts2Egypt,
      payouts_2d_egypt_usd: egyptUsd(payouts2Totals),
      payouts_month_count: payoutsMEgypt,
      payouts_month_egypt_usd: egyptUsd(payoutsMTotals),
      unpaid_arriving: unpaidEgyptCount,
      direct_bookings_yesterday: directEgypt,
      direct_revenue_egypt_usd: egyptUsd(directTotals),
      // UAE info-only counts (NOT in totals — shown for transparency)
      uae_bookings_yesterday_excluded: yestCount['BH-DXB'],
      uae_bookings_mtd_excluded: mtdCount['BH-DXB'],
      uae_currently_staying_excluded: stayingCount['BH-DXB'],
      uae_revenue_yesterday_aed_excluded: dxbAed(yestTotals),
      uae_revenue_mtd_aed_excluded: dxbAed(mtdTotals),
    },
  };
}

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
