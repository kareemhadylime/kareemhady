import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { Brief, BriefSection } from './types';

// Finance & Accounting brief — what finance needs at 8am.

export async function buildFinanceBrief(dateIso: string): Promise<Brief> {
  const sb = supabaseAdmin();
  const yesterday = new Date(dateIso + 'T00:00:00');
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);
  const sevenDays = new Date(dateIso + 'T00:00:00');
  sevenDays.setDate(sevenDays.getDate() + 7);
  const sevenDaysIso = sevenDays.toISOString().slice(0, 10);

  // Month-to-date date math
  const mtdStart = new Date(dateIso + 'T00:00:00');
  mtdStart.setDate(1);
  const mtdStartIso = mtdStart.toISOString().slice(0, 10);

  // Payout forecast windows (J.7 stripe + channel logic for paid status,
  // here we use confirmed reservations whose check-in falls in the window
  // as a proxy for "expected payout this period").
  const next2 = new Date(dateIso + 'T00:00:00');
  next2.setDate(next2.getDate() + 2);
  const next2Iso = next2.toISOString().slice(0, 10);
  const monthEnd = new Date(dateIso + 'T00:00:00');
  monthEnd.setMonth(monthEnd.getMonth() + 1, 0); // last day of current month
  const monthEndIso = monthEnd.toISOString().slice(0, 10);

  const [
    { data: yesterdayBookings },
    { data: mtdBookings },
    { data: unpaidUpcoming },
    { data: directBookingsYesterday },
    { data: payouts2d },
    { data: payoutsMonth },
  ] = await Promise.all([
    // Bookings created yesterday (revenue accrual)
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, host_payout, commission, fare_accommodation, channel, currency, building_code, check_in_date')
      .gte('check_in_date', yesterdayIso)
      .lte('check_in_date', yesterdayIso),
    // Month-to-date bookings (by check-in date)
    sb.from('beithady_reservation_grid_v')
      .select('host_payout, commission, currency, channel')
      .gte('check_in_date', mtdStartIso)
      .lte('check_in_date', dateIso)
      .neq('status', 'canceled'),
    // Unpaid + arriving in next 7 days
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, building_code, guest_name, check_in_date, payment_balance_cents, payment_currency, channel')
      .eq('flagged_unpaid', true)
      .gte('check_in_date', dateIso)
      .lte('check_in_date', sevenDaysIso)
      .order('check_in_date'),
    // New direct bookings yesterday (manual channel)
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, host_payout, commission, currency, listing_nickname')
      .gte('check_in_date', yesterdayIso)
      .lte('check_in_date', yesterdayIso)
      .eq('channel', 'manual')
      .neq('status', 'canceled'),
    // Expected payouts (next 2 days): confirmed reservations checking in
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, host_payout, channel, currency, listing_nickname, building_code, check_in_date')
      .gte('check_in_date', dateIso)
      .lte('check_in_date', next2Iso)
      .eq('status', 'confirmed')
      .order('check_in_date'),
    // Expected payouts (until month end): confirmed reservations checking in
    sb.from('beithady_reservation_grid_v')
      .select('host_payout, channel, currency, check_in_date')
      .gte('check_in_date', dateIso)
      .lte('check_in_date', monthEndIso)
      .eq('status', 'confirmed'),
  ]);

  type RevRow = { reservation_id: string; host_payout: number | string | null; commission: number | string | null; fare_accommodation: number | string | null; channel: string | null; currency: string; building_code: string | null; check_in_date: string };
  const yest = (yesterdayBookings as RevRow[] | null) || [];
  const mtd = (mtdBookings as Array<{ host_payout: number | string | null; commission: number | string | null; currency: string; channel: string | null }> | null) || [];
  const unpaid = (unpaidUpcoming as Array<{ reservation_id: string; listing_nickname: string | null; building_code: string | null; guest_name: string | null; check_in_date: string; payment_balance_cents: number | null; payment_currency: string | null; channel: string | null }> | null) || [];
  const direct = (directBookingsYesterday as Array<{ reservation_id: string; host_payout: number | string | null; commission: number | string | null; currency: string; listing_nickname: string | null }> | null) || [];
  const payouts2 = (payouts2d as Array<{ reservation_id: string; host_payout: number | string | null; channel: string | null; currency: string; listing_nickname: string | null; building_code: string | null; check_in_date: string }> | null) || [];
  const payoutsM = (payoutsMonth as Array<{ host_payout: number | string | null; channel: string | null; currency: string; check_in_date: string }> | null) || [];

  // Sums (in USD; for V1 we don't FX-convert — flag the mix)
  const sumPayout = (rows: Array<{ host_payout: number | string | null; commission: number | string | null }>) =>
    rows.reduce((s, r) => s + (Number(r.host_payout || 0) + Number(r.commission || 0)), 0);

  const yesterdayTotal = sumPayout(yest);
  const mtdTotal = sumPayout(mtd);
  const directTotal = sumPayout(direct);

  // Channel breakdown for yesterday
  const yestByChannel = new Map<string, number>();
  for (const r of yest) {
    const k = r.channel || 'unknown';
    yestByChannel.set(k, (yestByChannel.get(k) || 0) + Number(r.host_payout || 0) + Number(r.commission || 0));
  }
  const yestChannelLines = Array.from(yestByChannel.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: $${Math.round(v).toLocaleString()}`)
    .join(' · ');

  // Currency mix
  const yestByCcy = new Map<string, number>();
  for (const r of mtd) {
    const k = r.currency || 'USD';
    yestByCcy.set(k, (yestByCcy.get(k) || 0) + Number(r.host_payout || 0) + Number(r.commission || 0));
  }
  const ccyLines = Array.from(yestByCcy.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${Math.round(v).toLocaleString()}`)
    .join(' · ');

  // Unpaid total
  const unpaidTotalCents = unpaid.reduce((s, r) => s + (r.payment_balance_cents || 0), 0);

  // Payout forecast totals (host_payout only — what we actually receive)
  const payouts2Total = payouts2.reduce((s, r) => s + Number(r.host_payout || 0), 0);
  const payoutsMonthTotal = payoutsM.reduce((s, r) => s + Number(r.host_payout || 0), 0);
  // Group 2-day payouts by channel for the breakdown line
  const payouts2ByChannel = new Map<string, number>();
  for (const r of payouts2) {
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
          primary: `$${Math.round(yesterdayTotal).toLocaleString()} accrued`,
          secondary: yestChannelLines || 'No channel mix',
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
          primary: `$${Math.round(mtdTotal).toLocaleString()} MTD across ${mtd.length} bookings`,
          secondary: `Currency mix: ${ccyLines || 'USD only'}`,
        },
      ],
    },
    {
      title: `Expected payouts — next 2 days (${payouts2.length})`,
      emoji: '⏱',
      items: payouts2.length > 0 ? [
        {
          primary: `$${Math.round(payouts2Total).toLocaleString()} accruing across ${payouts2.length} confirmed check-in${payouts2.length === 1 ? '' : 's'}`,
          secondary: payouts2ChannelLine || '—',
          tag: { label: 'Forecast', tone: 'cyan' },
        },
        ...payouts2.slice(0, 8).map(r => ({
          primary: `${r.check_in_date} · ${r.listing_nickname || '—'}`,
          secondary: `${r.channel || ''} · $${Math.round(Number(r.host_payout || 0)).toLocaleString()}${r.building_code ? ` · ${r.building_code}` : ''}`,
        })),
      ] : [],
      empty_message: 'No confirmed check-ins in the next 2 days.',
    },
    {
      title: `Expected payouts — through month end (${payoutsM.length})`,
      emoji: '📅',
      items: payoutsM.length > 0 ? [
        {
          primary: `$${Math.round(payoutsMonthTotal).toLocaleString()} forecast through ${monthEndIso}`,
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
          href: `/emails/beithady/operations/calendar?reservation=${r.reservation_id}`,
        })),
      ] : [],
      empty_message: 'No unpaid reservations in the next 7 days. ✓',
    },
    {
      title: `Direct-booking revenue yesterday (${direct.length})`,
      emoji: '🎯',
      items: direct.length > 0
        ? [{
            primary: `$${Math.round(directTotal).toLocaleString()} from ${direct.length} direct booking${direct.length === 1 ? '' : 's'}`,
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
      yesterday_revenue_usd: Math.round(yesterdayTotal),
      mtd_revenue_usd: Math.round(mtdTotal),
      mtd_bookings: mtd.length,
      unpaid_arriving: unpaid.length,
      unpaid_balance_usd: Math.round(unpaidTotalCents / 100),
      direct_bookings_yesterday: direct.length,
      direct_revenue_usd: Math.round(directTotal),
      payouts_2d_count: payouts2.length,
      payouts_2d_usd: Math.round(payouts2Total),
      payouts_month_count: payoutsM.length,
      payouts_month_usd: Math.round(payoutsMonthTotal),
    },
  };
}

function cairoLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
