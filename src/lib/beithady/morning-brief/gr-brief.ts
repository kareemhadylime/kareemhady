import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { Brief, BriefSection } from './types';

// Guest Relations brief — what GR agents need to act on at 8am Cairo.

export async function buildGuestRelationsBrief(dateIso: string): Promise<Brief> {
  const sb = supabaseAdmin();
  const today = dateIso;
  const tomorrow = new Date(dateIso + 'T00:00:00');
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);
  const in3Days = new Date(dateIso + 'T00:00:00');
  in3Days.setDate(in3Days.getDate() + 3);
  const in3DaysIso = in3Days.toISOString().slice(0, 10);
  const yesterday = new Date(dateIso + 'T00:00:00');
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);

  const [
    { data: arrivals },
    { data: departures },
    { data: vipUpcoming },
    { data: prearrivalPending },
    { data: yesterdayCsat },
    { data: lateThreads },
  ] = await Promise.all([
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, building_code, channel, guest_name, nights, loyalty_tier, is_vip')
      .eq('check_in_date', today)
      .neq('status', 'canceled')
      .order('listing_nickname'),
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, building_code, guest_name, loyalty_tier, is_vip')
      .eq('check_out_date', today)
      .neq('status', 'canceled')
      .order('listing_nickname'),
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, building_code, guest_name, check_in_date, nights, loyalty_tier, is_vip')
      .gte('check_in_date', tomorrowIso)
      .lte('check_in_date', in3DaysIso)
      .neq('status', 'canceled')
      .or('is_vip.eq.true,loyalty_tier.in.(platinum,gold,vip)')
      .order('check_in_date'),
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, guest_name, check_in_date')
      .gte('check_in_date', tomorrowIso)
      .lte('check_in_date', tomorrowIso)
      .is('prearrival_sent_at', null)
      .neq('status', 'canceled')
      .order('listing_nickname'),
    sb.from('beithady_csat_responses')
      .select('id, rating, comment, building_code')
      .gte('created_at', yesterdayIso + 'T00:00:00')
      .lt('created_at', dateIso + 'T00:00:00'),
    sb.from('beithady_conversations')
      .select('id, channel, listing_nickname, guest_full_name, sla_age_seconds')
      .eq('sla_breach', true)
      .order('sla_age_seconds', { ascending: false })
      .limit(10),
  ]);

  type ArrivalRow = { reservation_id: string; listing_nickname: string | null; building_code: string | null; channel: string | null; guest_name: string | null; nights: number | null; loyalty_tier: string | null; is_vip: boolean | null };
  const arr = (arrivals as ArrivalRow[] | null) || [];
  const dep = (departures as Array<{ reservation_id: string; listing_nickname: string | null; building_code: string | null; guest_name: string | null; loyalty_tier: string | null; is_vip: boolean | null }> | null) || [];
  const vip = (vipUpcoming as Array<{ reservation_id: string; listing_nickname: string | null; building_code: string | null; guest_name: string | null; check_in_date: string; nights: number | null; loyalty_tier: string | null; is_vip: boolean | null }> | null) || [];
  const pre = (prearrivalPending as Array<{ reservation_id: string; listing_nickname: string | null; guest_name: string | null }> | null) || [];
  const csat = (yesterdayCsat as Array<{ id: string; rating: number | null; comment: string | null; building_code: string | null }> | null) || [];
  const late = (lateThreads as Array<{ id: string; channel: string; listing_nickname: string | null; guest_full_name: string | null; sla_age_seconds: number | null }> | null) || [];

  const isVipFlag = (r: { is_vip: boolean | null; loyalty_tier: string | null }) =>
    r.is_vip || ['platinum', 'gold', 'vip'].includes((r.loyalty_tier || '').toLowerCase());

  const sections: BriefSection[] = [
    {
      title: 'Arrivals today',
      emoji: '📥',
      items: arr.map(r => ({
        primary: `${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
        secondary: `${r.channel || ''} · ${r.nights || 0} nights${r.building_code ? ` · ${r.building_code}` : ''}`,
        tag: isVipFlag(r) ? { label: '⭐ VIP', tone: 'violet' } : undefined,
        href: `/emails/beithady/operations/calendar?reservation=${r.reservation_id}`,
      })),
      empty_message: 'No arrivals today.',
    },
    {
      title: 'Departures today',
      emoji: '📤',
      items: dep.map(r => ({
        primary: `${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
        secondary: r.building_code || '',
        tag: isVipFlag(r) ? { label: '⭐ VIP', tone: 'violet' } : undefined,
        href: `/emails/beithady/operations/calendar?reservation=${r.reservation_id}`,
      })),
      empty_message: 'No departures today.',
    },
    {
      title: 'Pre-arrival not sent (check-in tomorrow)',
      emoji: '📨',
      items: pre.map(r => ({
        primary: `${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
        secondary: 'Send pre-arrival message today',
        tag: { label: 'Action', tone: 'amber' },
        href: `/emails/beithady/operations/calendar?reservation=${r.reservation_id}`,
      })),
      empty_message: 'All tomorrow\'s arrivals have been messaged. ✓',
    },
    {
      title: 'Late SLA breaches',
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
      title: 'VIP arrivals next 3 days',
      emoji: '⭐',
      items: vip.map(r => ({
        primary: `${r.check_in_date} · ${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
        secondary: `${r.loyalty_tier || (r.is_vip ? 'VIP' : '—')} · ${r.nights || 0} nights${r.building_code ? ` · ${r.building_code}` : ''}`,
        tag: { label: 'VIP', tone: 'violet' },
        href: `/emails/beithady/operations/calendar?reservation=${r.reservation_id}`,
      })),
      empty_message: 'No VIP arrivals in the next 3 days.',
    },
    {
      title: 'Yesterday\'s CSAT',
      emoji: '⭐',
      items: csat.length > 0 ? [{
        primary: `${csat.length} response${csat.length === 1 ? '' : 's'} · avg ${(csat.reduce((s, c) => s + (c.rating || 0), 0) / csat.length).toFixed(1)} / 10`,
        secondary: csat.filter(c => (c.rating || 0) <= 6).length > 0
          ? `${csat.filter(c => (c.rating || 0) <= 6).length} score(s) ≤ 6 — review needed`
          : 'No low scores',
        tag: csat.filter(c => (c.rating || 0) <= 6).length > 0
          ? { label: 'Review', tone: 'amber' }
          : { label: 'Healthy', tone: 'green' },
      }] : [],
      empty_message: 'No CSAT responses yesterday.',
    },
  ];

  return {
    role: 'guest_relations',
    date_iso: dateIso,
    cairo_label: cairoLabel(dateIso),
    sections,
    summary: {
      arrivals: arr.length,
      departures: dep.length,
      vip_upcoming: vip.length,
      prearrival_pending: pre.length,
      sla_breaches: late.length,
      csat_yesterday: csat.length,
      csat_low: csat.filter(c => (c.rating || 0) <= 6).length,
    },
  };
}

function cairoLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
