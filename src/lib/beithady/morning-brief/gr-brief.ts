import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { addDays as addDaysCairo } from '@/lib/beithady-daily-report/cairo-dates';
import {
  bucketForListing,
  isExcludedFromRevenue,
  countByBucket,
  BUCKET_LABEL,
  EGYPT_BUCKETS,
  type BriefBucket,
} from './country';
import {
  getCurrentlyStaying,
  CANONICAL_BOOKED_STATUSES,
} from '@/lib/beithady/guesty-metrics';
import type { Brief, BriefSection } from './types';

// Guest Relations brief — what GR agents need to act on at 8am Cairo.
//
// Audit changes (2026-04-30 part 2)
// ---------------------------------
// * **Bucket rebucket.** Country-based EG/AE buckets replaced with
//   per-building (BH-26 / BH-73 / BH-435 / BH-OK / BH-OTHERS / BH-DXB).
//   UAE units always shown on a separate "BH-DXB: N reservations
//   (excluded from totals)" info line, never in headline counts.
// * **Status filter** still IN ('confirmed','reserved','awaiting_payment')
//   for Guesty parity.

const SLA_FRESHNESS_SEC = 48 * 3600;

// CANONICAL alignment (2026-05-03): use guesty-metrics canonical statuses.
// Was: ['confirmed', 'reserved', 'awaiting_payment'] — caused mismatches with
// Daily Performance Report. All briefs now use the same triplet for parity.
const ACTIVE_STATUSES = CANONICAL_BOOKED_STATUSES;

export async function buildGuestRelationsBrief(dateIso: string): Promise<Brief> {
  const sb = supabaseAdmin();
  const today = dateIso;
  const tomorrow = addDaysCairo(dateIso, 1);
  const in3Days = addDaysCairo(dateIso, 3);
  const yesterday = addDaysCairo(dateIso, -1);
  const fourteenDaysFromTodayIso = addDaysCairo(dateIso, 14);

  const yesterdayStartUtc = cairoStartOfDayUtc(yesterday);
  const todayStartUtc = cairoStartOfDayUtc(today);

  // Canonical "Manual Block Unpaid" feed — owner stays + manual blocks
  // currently staying. Per Q2 (2026-05-03), these are excluded from main
  // arrivals/departures/staying counts but listed separately for visibility.
  const stayingCanonical = await getCurrentlyStaying(today);
  const manualBlocksToday = stayingCanonical.manual_block_unpaid;

  const [
    { data: arrivals },
    { data: departures },
    { data: currentlyStaying },
    { data: vipUpcoming },
    { data: prearrivalPending },
    { data: yesterdayCsat },
    { data: lateThreads },
    { data: atRiskRows },
  ] = await Promise.all([
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, listing_id, building_code, channel, guest_name, nights, loyalty_tier, is_vip, status')
      .eq('check_in_date', today)
      .in('status', ACTIVE_STATUSES)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('listing_nickname'),
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, listing_id, building_code, channel, guest_name, nights, loyalty_tier, is_vip, status')
      .eq('check_out_date', today)
      .in('status', ACTIVE_STATUSES)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('listing_nickname'),
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, listing_id, building_code, channel, guest_name, guest_count, nights, check_in_date, check_out_date, loyalty_tier, is_vip')
      .lte('check_in_date', today)
      .gt('check_out_date', today)
      .in('status', ACTIVE_STATUSES)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true),
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, listing_id, building_code, guest_name, check_in_date, nights, loyalty_tier, is_vip, channel')
      .gte('check_in_date', today)
      .lte('check_in_date', in3Days)
      .in('status', ACTIVE_STATUSES)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .or('is_vip.eq.true,loyalty_tier.in.(platinum,gold,vip)')
      .order('check_in_date'),
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, listing_id, building_code, guest_name, check_in_date')
      .gte('check_in_date', today)
      .lte('check_in_date', tomorrow)
      .is('prearrival_sent_at', null)
      .in('status', ACTIVE_STATUSES)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('check_in_date')
      .order('listing_nickname'),
    sb.from('beithady_csat_responses')
      .select('id, rating, comment, building_code')
      .gte('created_at', yesterdayStartUtc)
      .lt('created_at', todayStartUtc),
    sb.from('beithady_conversations')
      .select('id, channel, listing_nickname, guest_full_name, sla_age_seconds')
      .eq('sla_breach', true)
      .lte('sla_age_seconds', SLA_FRESHNESS_SEC)
      .order('sla_age_seconds', { ascending: false })
      .limit(10),
    sb.from('beithady_reservation_overrides')
      .select('reservation_id, cancel_risk_score, last_reconfirmation_sent_at')
      .gte('cancel_risk_score', 70)
      .order('cancel_risk_score', { ascending: false })
      .limit(20),
  ]);

  type ResRow = {
    reservation_id: string;
    listing_nickname: string | null;
    listing_id: string | null;
    building_code: string | null;
    channel: string | null;
    guest_name: string | null;
    nights: number | null;
    loyalty_tier: string | null;
    is_vip: boolean | null;
  };
  type StayRow = ResRow & { guest_count: number | null; check_in_date: string; check_out_date: string };
  type VipRow = ResRow & { check_in_date: string };
  const arrRaw = (arrivals as ResRow[] | null) || [];
  const depRaw = (departures as ResRow[] | null) || [];
  // Exclude same-guest reservation extensions from arrivals/departures counts and lists.
  // Unified with daily-activity-live.ts, the departures drawer, and build-buildings.ts.
  const _grDepGuests = new Map<string, string | null>();
  for (const r of depRaw) if (r.listing_id) _grDepGuests.set(r.listing_id, r.guest_name ?? null);
  const grRenewedListings = new Set<string>();
  for (const r of arrRaw) {
    if (!r.listing_id) continue;
    const outGuest = _grDepGuests.get(r.listing_id);
    if (outGuest != null && outGuest === (r.guest_name ?? null)) grRenewedListings.add(r.listing_id);
  }
  const arr = arrRaw.filter(r => !grRenewedListings.has(r.listing_id ?? ''));
  const dep = depRaw.filter(r => !grRenewedListings.has(r.listing_id ?? ''));
  const stay = (currentlyStaying as StayRow[] | null) || [];
  const vip = (vipUpcoming as VipRow[] | null) || [];
  const pre = (prearrivalPending as Array<{ reservation_id: string; listing_nickname: string | null; listing_id: string | null; building_code: string | null; guest_name: string | null; check_in_date: string }> | null) || [];
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
        .select('reservation_id, listing_nickname, listing_id, building_code, guest_name, channel, check_in_date, nights, payment_status')
        .in('reservation_id', candidateIds)
        .gte('check_in_date', dateIso)
        .lte('check_in_date', fourteenDaysFromTodayIso)
        .in('status', ACTIVE_STATUSES)
        .neq('source_label', 'owner')
        .neq('is_manual_block', true)
    : { data: [] };
  const atRiskScoreById = new Map(atRiskOverrides.map(o => [o.reservation_id, o.cancel_risk_score]));
  type AtRiskDetail = { reservation_id: string; listing_nickname: string | null; listing_id: string | null; building_code: string | null; guest_name: string | null; channel: string | null; check_in_date: string; nights: number | null; payment_status: string | null };
  const atRiskRowsHydrated = ((atRiskDetail as AtRiskDetail[] | null) || [])
    .filter(r => atRiskScoreById.has(r.reservation_id))
    .sort((a, b) => (atRiskScoreById.get(b.reservation_id) || 0) - (atRiskScoreById.get(a.reservation_id) || 0))
    .slice(0, 8);

  const isVipFlag = (r: { is_vip: boolean | null; loyalty_tier: string | null }) =>
    r.is_vip || ['platinum', 'gold', 'vip'].includes((r.loyalty_tier || '').toLowerCase());

  const nightsLabel = (n: number | null): string =>
    n != null && n > 0 ? `${n} night${n === 1 ? '' : 's'}` : '— nights';

  // Per-bucket counts; Egypt-only headline.
  const arrCount = countByBucket(arr);
  const depCount = countByBucket(dep);
  const stayCount = countByBucket(stay);
  const vipCount = countByBucket(vip);

  const sumEgypt = (counts: Record<BriefBucket, number>): number =>
    EGYPT_BUCKETS.reduce((s, b) => s + counts[b], 0);

  const arrEgypt = sumEgypt(arrCount);
  const depEgypt = sumEgypt(depCount);
  const stayEgypt = sumEgypt(stayCount);
  const vipEgypt = sumEgypt(vipCount);

  const bucketBreakdownLine = (counts: Record<BriefBucket, number>): string =>
    EGYPT_BUCKETS.filter(b => counts[b] > 0).map(b => `${BUCKET_LABEL[b].en}: ${counts[b]}`).join(' · ');

  const dxbLine = (count: number, sectionVerb = 'reservations'): string | null => {
    if (count === 0) return null;
    return `BH-DXB: ${count} ${sectionVerb} (excluded from totals)`;
  };

  // CSAT — average ignores null ratings (comment-only responses).
  const ratedCsat = csat.filter(c => c.rating != null);
  const csatAvg = ratedCsat.length > 0
    ? ratedCsat.reduce((s, c) => s + (c.rating || 0), 0) / ratedCsat.length
    : null;
  const csatLow = ratedCsat.filter(c => (c.rating || 0) <= 6).length;

  // Bucket-tag a reservation row for inline rendering.
  const tagBucket = (r: { building_code: string | null; listing_id: string | null; listing_nickname: string | null }): string =>
    BUCKET_LABEL[bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname })].en;

  // Total guests currently staying — Egypt only.
  const totalGuestsEgypt = stay
    .filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname })))
    .reduce((s, r) => s + (r.guest_count || 0), 0);

  const dxbStaying = stay.filter(r => isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname })));
  const dxbStayingGuests = dxbStaying.reduce((s, r) => s + (r.guest_count || 0), 0);

  const sections: BriefSection[] = [
    {
      title: `Arrivals today (${arrEgypt})`,
      emoji: '📥',
      items: [
        ...arr
          .filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname })))
          .map(r => ({
            primary: `[${tagBucket(r)}] ${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
            secondary: `${r.channel || ''} · ${nightsLabel(r.nights)}${r.building_code ? ` · ${r.building_code}` : ''}`,
            tag: isVipFlag(r) ? { label: '⭐ VIP', tone: 'violet' as const } : undefined,
            href: `/beithady/operations/calendar?reservation=${r.reservation_id}`,
          })),
        ...(arrEgypt > 0 ? [{
          primary: `Bucket breakdown — ${bucketBreakdownLine(arrCount)}`,
          secondary: undefined,
          tag: { label: 'Egypt', tone: 'green' as const },
        }] : []),
        ...(arrCount['BH-DXB'] > 0 ? [{
          primary: dxbLine(arrCount['BH-DXB'], 'arrivals') || '',
          secondary: undefined,
          tag: { label: 'UAE — excluded', tone: 'slate' as const },
        }] : []),
      ],
      empty_message: 'No arrivals today.',
    },
    {
      title: `Currently staying (${stayEgypt})${stayingCanonical.already_arrived ? ` — ${stayingCanonical.already_arrived.length} in-house · ${stayingCanonical.arriving_today?.length || 0} arriving today` : ''}`,
      emoji: '🏨',
      items: [
        ...(stayEgypt > 0 ? [{
          primary: `${bucketBreakdownLine(stayCount)} · ${totalGuestsEgypt} guests`,
          secondary: 'Egypt-side in-house reservations.',
          tag: { label: 'In-house', tone: 'green' as const },
        }] : []),
        ...((stayingCanonical.arriving_today?.length || 0) > 0 ? [{
          primary: `${stayingCanonical.arriving_today!.length} arriving today (counted in stay total)`,
          secondary: 'These appear in both Arrivals and Currently staying — Guesty UI may count them only after physical check-in.',
          tag: { label: 'Pending arrival', tone: 'amber' as const },
        }] : []),
        ...(stayCount['BH-DXB'] > 0 ? [{
          primary: `BH-DXB: ${stayCount['BH-DXB']} reservation${stayCount['BH-DXB'] === 1 ? '' : 's'} · ${dxbStayingGuests} guests (excluded from totals)`,
          secondary: undefined,
          tag: { label: 'UAE — excluded', tone: 'slate' as const },
        }] : []),
      ],
      empty_message: 'No active stays today.',
    },
    // Manual blocks / owner stays — listed separately so GR has visibility
    // on units off-market (Q2 ratification).
    {
      title: `Manual Block Unpaid (${manualBlocksToday.length})`,
      emoji: '🛠',
      items: manualBlocksToday.length > 0
        ? manualBlocksToday.slice(0, 8).map(r => ({
            primary: `${r.listing_nickname || r.listing_id || '—'} · ${r.guest_name || 'Owner / block'}`,
            secondary: `${r.building} · ${r.source || 'manual'} · ${r.check_in_date} → ${r.check_out_date}`,
            tag: { label: 'Off-market', tone: 'amber' as const },
          }))
        : [],
      empty_message: 'No manual blocks or owner stays today.',
    },
    {
      title: `VIP arrivals today → 3 days (${vipEgypt})`,
      emoji: '⭐',
      items: [
        ...vip
          .filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname })))
          .map(r => ({
            primary: `[${tagBucket(r)}] ${r.check_in_date} · ${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
            secondary: `${r.loyalty_tier || (r.is_vip ? 'VIP' : '—')} · ${nightsLabel(r.nights)}${r.building_code ? ` · ${r.building_code}` : ''}`,
            tag: { label: 'VIP', tone: 'violet' as const },
            href: `/beithady/operations/calendar?reservation=${r.reservation_id}`,
          })),
        ...(vipCount['BH-DXB'] > 0 ? [{
          primary: dxbLine(vipCount['BH-DXB'], 'VIP arrivals') || '',
          secondary: undefined,
          tag: { label: 'UAE — excluded', tone: 'slate' as const },
        }] : []),
      ],
      empty_message: 'No VIP arrivals in the next 3 days.',
    },
    {
      title: `Departures today (${depEgypt})`,
      emoji: '📤',
      items: [
        ...dep
          .filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname })))
          .map(r => ({
            primary: `[${tagBucket(r)}] ${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
            secondary: `${r.channel || ''} · ${nightsLabel(r.nights)}${r.building_code ? ` · ${r.building_code}` : ''}`,
            tag: isVipFlag(r) ? { label: '⭐ VIP', tone: 'violet' as const } : undefined,
            href: `/beithady/operations/calendar?reservation=${r.reservation_id}`,
          })),
        ...(depEgypt > 0 ? [{
          primary: `Bucket breakdown — ${bucketBreakdownLine(depCount)}`,
          secondary: undefined,
          tag: { label: 'Egypt', tone: 'green' as const },
        }] : []),
        ...(depCount['BH-DXB'] > 0 ? [{
          primary: dxbLine(depCount['BH-DXB'], 'departures') || '',
          secondary: undefined,
          tag: { label: 'UAE — excluded', tone: 'slate' as const },
        }] : []),
      ],
      empty_message: 'No departures today.',
    },
    {
      title: `Pre-arrival not sent — today + tomorrow (${pre.filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname }))).length})`,
      emoji: '📨',
      items: [
        ...pre
          .filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname })))
          .map(r => ({
            primary: `[${tagBucket(r)}] ${r.check_in_date === today ? 'Today' : 'Tomorrow'} · ${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
            secondary: 'Send pre-arrival message',
            tag: { label: 'Action', tone: 'amber' as const },
            href: `/beithady/operations/calendar?reservation=${r.reservation_id}`,
          })),
        ...(pre.filter(r => isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname }))).length > 0 ? [{
          primary: `BH-DXB: ${pre.filter(r => isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname }))).length} pending (excluded from totals)`,
          secondary: undefined,
          tag: { label: 'UAE — excluded', tone: 'slate' as const },
        }] : []),
      ],
      empty_message: 'All today + tomorrow arrivals have been messaged. ✓',
    },
    {
      title: `At-risk re-confirms — cancel-risk ≥70, ≤14d (${atRiskRowsHydrated.filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname }))).length})`,
      emoji: '🚨',
      items: [
        ...atRiskRowsHydrated
          .filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname })))
          .map(r => ({
            primary: `[${tagBucket(r)}] ${r.check_in_date} · ${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
            secondary: `${r.channel || ''}${r.payment_status ? ` · ${r.payment_status}` : ''}${r.building_code ? ` · ${r.building_code}` : ''} · risk ${atRiskScoreById.get(r.reservation_id)}`,
            tag: { label: 'Re-confirm', tone: 'red' as const },
            href: `/beithady/operations/cancel-risk`,
          })),
        ...(atRiskRowsHydrated.filter(r => isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname }))).length > 0 ? [{
          primary: `BH-DXB: ${atRiskRowsHydrated.filter(r => isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname }))).length} at-risk (excluded from totals)`,
          secondary: undefined,
          tag: { label: 'UAE — excluded', tone: 'slate' as const },
        }] : []),
      ],
      empty_message: 'No high-risk reservations need re-confirmation in the next 14 days. ✓',
    },
    {
      title: `Late SLA breaches — last 48h (${late.length})`,
      emoji: '🔴',
      items: late.map(c => ({
        primary: `${c.guest_full_name || 'Guest'} · ${c.channel}`,
        secondary: `${Math.round((c.sla_age_seconds || 0) / 60)} min waiting${c.listing_nickname ? ` · ${c.listing_nickname}` : ''}`,
        tag: { label: 'SLA', tone: 'red' as const },
        href: `/beithady/communication/${c.channel}/${c.id}`,
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
          ? { label: 'Review', tone: 'amber' as const }
          : { label: 'Healthy', tone: 'green' as const },
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
      arrivals: arrEgypt,
      arrivals_bh26: arrCount['BH-26'],
      arrivals_bh73: arrCount['BH-73'],
      arrivals_bh435: arrCount['BH-435'],
      arrivals_bhok: arrCount['BH-OK'],
      arrivals_bhothers: arrCount['BH-OTHERS'],
      arrivals_dxb_excluded: arrCount['BH-DXB'],
      departures: depEgypt,
      departures_bh26: depCount['BH-26'],
      departures_bh73: depCount['BH-73'],
      departures_bh435: depCount['BH-435'],
      departures_bhok: depCount['BH-OK'],
      departures_bhothers: depCount['BH-OTHERS'],
      departures_dxb_excluded: depCount['BH-DXB'],
      currently_staying: stayEgypt,
      currently_staying_guests: totalGuestsEgypt,
      currently_staying_dxb_excluded: stayCount['BH-DXB'],
      vip_upcoming: vipEgypt,
      vip_dxb_excluded: vipCount['BH-DXB'],
      prearrival_pending: pre.filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname }))).length,
      sla_breaches: late.length,
      csat_yesterday: ratedCsat.length,
      csat_low: csatLow,
      at_risk_reconfirms: atRiskRowsHydrated.filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname }))).length,
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

function cairoLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
