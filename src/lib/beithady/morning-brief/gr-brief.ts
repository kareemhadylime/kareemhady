import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { addDays as addDaysCairo } from '@/lib/beithady-daily-report/cairo-dates';
import type { Brief, BriefSection } from './types';

// Guest Relations brief — what GR agents need to act on at 8am Cairo.
//
// Audit changes (2026-04-28)
// --------------------------
// * Owner stays + calendar blocks (is_manual_block=true) excluded from
//   every reservation-grid query — they're not guest events.
// * CSAT "yesterday" filter switched to Cairo TZ (was UTC; clipped 2-3 h
//   off either end of the wall day).
// * CSAT average ignores null ratings (comment-only responses no longer
//   drag the average toward 0).
// * Pre-arrival window expanded to today + tomorrow (catches morning
//   misses for late-afternoon same-day arrivals).
// * VIP window expanded to today → today+3 (today's VIPs no longer
//   only visible in the generic Arrivals section).
// * Late SLA capped at 48 h freshness so weeks-old unresolved breaches
//   don't repeat forever.
// * Departures section now shows channel + nights stayed (parity with
//   Arrivals).
// * Section order: Arrivals → VIP → Departures → Pre-arrival → At-risk
//   → Late SLA → CSAT.
// * All section titles include a count.
// * NULL nights renders as "—" instead of "0 nights".

const SLA_FRESHNESS_SEC = 48 * 3600;

export async function buildGuestRelationsBrief(dateIso: string): Promise<Brief> {
  const sb = supabaseAdmin();
  const today = dateIso;
  const tomorrow = addDaysCairo(dateIso, 1);
  const in3Days = addDaysCairo(dateIso, 3);
  const yesterday = addDaysCairo(dateIso, -1);
  const fourteenDaysFromTodayIso = addDaysCairo(dateIso, 14);

  // CSAT freshness window: Cairo "yesterday" 00:00 → today 00:00 as UTC
  const yesterdayStartUtc = cairoStartOfDayUtc(yesterday);
  const todayStartUtc = cairoStartOfDayUtc(today);

  const [
    { data: arrivals },
    { data: departures },
    { data: vipUpcoming },
    { data: prearrivalPending },
    { data: yesterdayCsat },
    { data: lateThreads },
    { data: atRiskRows },
  ] = await Promise.all([
    // Arrivals today (real guest arrivals only)
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, building_code, channel, guest_name, nights, loyalty_tier, is_vip')
      .eq('check_in_date', today)
      .neq('status', 'canceled')
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('listing_nickname'),
    // Departures today (parity: now also pulls channel + nights)
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, building_code, channel, guest_name, nights, loyalty_tier, is_vip')
      .eq('check_out_date', today)
      .neq('status', 'canceled')
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('listing_nickname'),
    // VIP arrivals today → today+3 (was tomorrow → +3)
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, building_code, guest_name, check_in_date, nights, loyalty_tier, is_vip, channel')
      .gte('check_in_date', today)
      .lte('check_in_date', in3Days)
      .neq('status', 'canceled')
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .or('is_vip.eq.true,loyalty_tier.in.(platinum,gold,vip)')
      .order('check_in_date'),
    // Pre-arrival not sent — today + tomorrow (was tomorrow only)
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, guest_name, check_in_date')
      .gte('check_in_date', today)
      .lte('check_in_date', tomorrow)
      .is('prearrival_sent_at', null)
      .neq('status', 'canceled')
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('check_in_date')
      .order('listing_nickname'),
    // CSAT created during Cairo "yesterday" (UTC instants)
    sb.from('beithady_csat_responses')
      .select('id, rating, comment, building_code')
      .gte('created_at', yesterdayStartUtc)
      .lt('created_at', todayStartUtc),
    // Late SLA breaches — capped at 48 h freshness (was unbounded)
    sb.from('beithady_conversations')
      .select('id, channel, listing_nickname, guest_full_name, sla_age_seconds')
      .eq('sla_breach', true)
      .lte('sla_age_seconds', SLA_FRESHNESS_SEC)
      .order('sla_age_seconds', { ascending: false })
      .limit(10),
    // At-risk re-confirms (Phase K.2): score ≥ 70, not re-confirmed last 24 h
    sb.from('beithady_reservation_overrides')
      .select('reservation_id, cancel_risk_score, last_reconfirmation_sent_at')
      .gte('cancel_risk_score', 70)
      .order('cancel_risk_score', { ascending: false })
      .limit(20),
  ]);

  type ResRow = {
    reservation_id: string;
    listing_nickname: string | null;
    building_code: string | null;
    channel: string | null;
    guest_name: string | null;
    nights: number | null;
    loyalty_tier: string | null;
    is_vip: boolean | null;
  };
  type VipRow = ResRow & { check_in_date: string };
  const arr = (arrivals as ResRow[] | null) || [];
  const dep = (departures as ResRow[] | null) || [];
  const vip = (vipUpcoming as VipRow[] | null) || [];
  const pre = (prearrivalPending as Array<{ reservation_id: string; listing_nickname: string | null; guest_name: string | null; check_in_date: string }> | null) || [];
  const csat = (yesterdayCsat as Array<{ id: string; rating: number | null; comment: string | null; building_code: string | null }> | null) || [];
  const late = (lateThreads as Array<{ id: string; channel: string; listing_nickname: string | null; guest_full_name: string | null; sla_age_seconds: number | null }> | null) || [];

  // Hydrate at-risk via the dedup'd grid view (same exclusions)
  const atRiskOverrides = (atRiskRows as Array<{ reservation_id: string; cancel_risk_score: number; last_reconfirmation_sent_at: string | null }> | null) || [];
  const recentlyReconfirmed = new Set(
    atRiskOverrides
      .filter(o => o.last_reconfirmation_sent_at && new Date(o.last_reconfirmation_sent_at) > new Date(Date.now() - 24 * 3600 * 1000))
      .map(o => o.reservation_id)
  );
  const candidateIds = atRiskOverrides
    .filter(o => !recentlyReconfirmed.has(o.reservation_id))
    .map(o => o.reservation_id);
  const { data: atRiskDetail } = candidateIds.length > 0
    ? await sb.from('beithady_reservation_grid_v')
        .select('reservation_id, listing_nickname, building_code, guest_name, channel, check_in_date, nights, payment_status')
        .in('reservation_id', candidateIds)
        .gte('check_in_date', dateIso)
        .lte('check_in_date', fourteenDaysFromTodayIso)
        .neq('status', 'canceled')
        .neq('source_label', 'owner')
        .neq('is_manual_block', true)
    : { data: [] };
  const atRiskScoreById = new Map(atRiskOverrides.map(o => [o.reservation_id, o.cancel_risk_score]));
  type AtRiskDetail = { reservation_id: string; listing_nickname: string | null; building_code: string | null; guest_name: string | null; channel: string | null; check_in_date: string; nights: number | null; payment_status: string | null };
  const atRiskRowsHydrated = ((atRiskDetail as AtRiskDetail[] | null) || [])
    .filter(r => atRiskScoreById.has(r.reservation_id))
    .sort((a, b) => (atRiskScoreById.get(b.reservation_id) || 0) - (atRiskScoreById.get(a.reservation_id) || 0))
    .slice(0, 8);

  const isVipFlag = (r: { is_vip: boolean | null; loyalty_tier: string | null }) =>
    r.is_vip || ['platinum', 'gold', 'vip'].includes((r.loyalty_tier || '').toLowerCase());

  const nightsLabel = (n: number | null): string =>
    n != null && n > 0 ? `${n} night${n === 1 ? '' : 's'}` : '— nights';

  // CSAT — average ignores null ratings (comment-only responses).
  const ratedCsat = csat.filter(c => c.rating != null);
  const csatAvg = ratedCsat.length > 0
    ? ratedCsat.reduce((s, c) => s + (c.rating || 0), 0) / ratedCsat.length
    : null;
  const csatLow = ratedCsat.filter(c => (c.rating || 0) <= 6).length;

  const sections: BriefSection[] = [
    {
      title: `Arrivals today (${arr.length})`,
      emoji: '📥',
      items: arr.map(r => ({
        primary: `${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
        secondary: `${r.channel || ''} · ${nightsLabel(r.nights)}${r.building_code ? ` · ${r.building_code}` : ''}`,
        tag: isVipFlag(r) ? { label: '⭐ VIP', tone: 'violet' } : undefined,
        href: `/emails/beithady/operations/calendar?reservation=${r.reservation_id}`,
      })),
      empty_message: 'No arrivals today.',
    },
    {
      title: `VIP arrivals today → 3 days (${vip.length})`,
      emoji: '⭐',
      items: vip.map(r => ({
        primary: `${r.check_in_date} · ${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
        secondary: `${r.loyalty_tier || (r.is_vip ? 'VIP' : '—')} · ${nightsLabel(r.nights)}${r.building_code ? ` · ${r.building_code}` : ''}`,
        tag: { label: 'VIP', tone: 'violet' },
        href: `/emails/beithady/operations/calendar?reservation=${r.reservation_id}`,
      })),
      empty_message: 'No VIP arrivals in the next 3 days.',
    },
    {
      title: `Departures today (${dep.length})`,
      emoji: '📤',
      items: dep.map(r => ({
        primary: `${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
        secondary: `${r.channel || ''} · ${nightsLabel(r.nights)}${r.building_code ? ` · ${r.building_code}` : ''}`,
        tag: isVipFlag(r) ? { label: '⭐ VIP', tone: 'violet' } : undefined,
        href: `/emails/beithady/operations/calendar?reservation=${r.reservation_id}`,
      })),
      empty_message: 'No departures today.',
    },
    {
      title: `Pre-arrival not sent — today + tomorrow (${pre.length})`,
      emoji: '📨',
      items: pre.map(r => ({
        primary: `${r.check_in_date === today ? 'Today' : 'Tomorrow'} · ${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
        secondary: 'Send pre-arrival message',
        tag: { label: 'Action', tone: 'amber' },
        href: `/emails/beithady/operations/calendar?reservation=${r.reservation_id}`,
      })),
      empty_message: 'All today + tomorrow arrivals have been messaged. ✓',
    },
    {
      title: `At-risk re-confirms — cancel-risk ≥70, ≤14d (${atRiskRowsHydrated.length})`,
      emoji: '🚨',
      items: atRiskRowsHydrated.map(r => ({
        primary: `${r.check_in_date} · ${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
        secondary: `${r.channel || ''}${r.payment_status ? ` · ${r.payment_status}` : ''}${r.building_code ? ` · ${r.building_code}` : ''} · risk ${atRiskScoreById.get(r.reservation_id)}`,
        tag: { label: 'Re-confirm', tone: 'red' },
        href: `/emails/beithady/operations/cancel-risk`,
      })),
      empty_message: 'No high-risk reservations need re-confirmation in the next 14 days. ✓',
    },
    {
      title: `Late SLA breaches — last 48h (${late.length})`,
      emoji: '🔴',
      items: late.map(c => ({
        primary: `${c.guest_full_name || 'Guest'} · ${c.channel}`,
        secondary: `${Math.round((c.sla_age_seconds || 0) / 60)} min waiting${c.listing_nickname ? ` · ${c.listing_nickname}` : ''}`,
        tag: { label: 'SLA', tone: 'red' },
        href: `/emails/beithady/communication/${c.channel}/${c.id}`,
      })),
      empty_message: 'All conversations within SLA. ✓',
    },
    {
      title: `Yesterday's CSAT (${ratedCsat.length})`,
      emoji: '⭐',
      items: ratedCsat.length > 0 ? [{
        primary: `${ratedCsat.length} rated response${ratedCsat.length === 1 ? '' : 's'}${csatAvg != null ? ` · avg ${csatAvg.toFixed(1)} / 10` : ''}`,
        secondary: csatLow > 0
          ? `${csatLow} score(s) ≤ 6 — review needed`
          : 'No low scores',
        tag: csatLow > 0
          ? { label: 'Review', tone: 'amber' }
          : { label: 'Healthy', tone: 'green' },
      }] : [],
      empty_message: csat.length > 0
        ? `${csat.length} comment-only response${csat.length === 1 ? '' : 's'} (no ratings).`
        : 'No CSAT responses yesterday.',
    },
  ];

  return {
    role: 'guest_relations',
    date_iso: dateIso,
    cairo_label: cairoLabel(dateIso),
    language: 'en',
    sections,
    summary: {
      arrivals: arr.length,
      departures: dep.length,
      vip_upcoming: vip.length,
      prearrival_pending: pre.length,
      sla_breaches: late.length,
      csat_yesterday: ratedCsat.length,
      csat_low: csatLow,
      at_risk_reconfirms: atRiskRowsHydrated.length,
    },
  };
}

// UTC ISO timestamp of "00:00:00 Cairo" on the given Cairo calendar
// date. Same logic as the helper in finance-brief.ts; inlined here to
// keep the dependency surface small.
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

function cairoLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
