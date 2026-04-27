import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { Brief, BriefSection } from './types';

// Operations & Housekeeping brief — what crew + ops manager need at 8am.

export async function buildOpsBrief(dateIso: string): Promise<Brief> {
  const sb = supabaseAdmin();
  const tomorrow = new Date(dateIso + 'T00:00:00');
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    { data: checkouts },
    { data: checkins },
    { data: openTasks },
    { data: blocks },
    { data: extensions },
  ] = await Promise.all([
    // Today's checkouts (must clean before today's check-in if same listing)
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_id, listing_nickname, building_code, guest_name, channel')
      .eq('check_out_date', dateIso)
      .neq('status', 'canceled')
      .order('listing_nickname'),
    // Today's check-ins
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_id, listing_nickname, building_code, guest_name, channel, nights')
      .eq('check_in_date', dateIso)
      .neq('status', 'canceled')
      .order('listing_nickname'),
    // Open maintenance/cleaning tasks (not done, not cancelled)
    sb.from('beithady_tasks')
      .select('id, title, type, priority, status, due_at, building_code, reservation_id')
      .in('status', ['pending', 'in_progress'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(20),
    // Manual blocks starting today
    sb.from('beithady_calendar_manual_blocks')
      .select('id, listing_id, start_date, end_date, reason, notes')
      .eq('start_date', dateIso),
    // Long-stay extensions (guest staying past today, no checkout today)
    sb.from('beithady_reservation_grid_v')
      .select('listing_nickname, guest_name, check_out_date')
      .lte('check_in_date', dateIso)
      .gt('check_out_date', dateIso)
      .neq('status', 'canceled')
      .gte('nights', 7)
      .order('check_out_date'),
  ]);

  type CO = { reservation_id: string; listing_id: string; listing_nickname: string | null; building_code: string | null; guest_name: string | null; channel: string | null };
  type CI = CO & { nights: number | null };
  const co = (checkouts as CO[] | null) || [];
  const ci = (checkins as CI[] | null) || [];
  const tasks = (openTasks as Array<{ id: string; title: string; type: string; priority: string | null; status: string; due_at: string | null; building_code: string | null; reservation_id: string | null }> | null) || [];
  const blockRows = (blocks as Array<{ id: string; listing_id: string; start_date: string; end_date: string; reason: string; notes: string | null }> | null) || [];
  const ext = (extensions as Array<{ listing_nickname: string | null; guest_name: string | null; check_out_date: string }> | null) || [];

  // Detect cleaning gaps: same listing checks out + checks in same day
  const checkoutListings = new Set(co.map(r => r.listing_id));
  const sameDayFlips = ci.filter(r => checkoutListings.has(r.listing_id));

  const sections: BriefSection[] = [
    {
      title: `Check-outs today (${co.length})`,
      emoji: '📤',
      items: co.map(r => ({
        primary: `${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
        secondary: `${r.channel || ''}${r.building_code ? ` · ${r.building_code}` : ''}`,
        tag: checkoutListings.has(r.listing_id) && sameDayFlips.find(f => f.listing_id === r.listing_id)
          ? { label: 'Same-day flip', tone: 'red' }
          : undefined,
      })),
      empty_message: 'No check-outs today.',
    },
    {
      title: `Check-ins today (${ci.length})`,
      emoji: '📥',
      items: ci.map(r => ({
        primary: `${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
        secondary: `${r.channel || ''} · ${r.nights || 0} nights${r.building_code ? ` · ${r.building_code}` : ''}`,
        tag: checkoutListings.has(r.listing_id)
          ? { label: 'Cleaning flip', tone: 'red' }
          : undefined,
      })),
      empty_message: 'No check-ins today.',
    },
    {
      title: `Same-day cleaning flips (${sameDayFlips.length})`,
      emoji: '⚠️',
      items: sameDayFlips.map(r => ({
        primary: `${r.listing_nickname || r.listing_id}`,
        secondary: 'Checkout 11:00 → next check-in same day. Prioritise crew.',
        tag: { label: 'Priority', tone: 'red' },
      })),
      empty_message: 'No same-day flips. Crew can pace cleaning normally.',
    },
    {
      title: `Open tasks (${tasks.length})`,
      emoji: '🛠',
      items: tasks.slice(0, 10).map(t => ({
        primary: t.title,
        secondary: `${t.type}${t.priority ? ` · ${t.priority}` : ''}${t.due_at ? ` · due ${new Date(t.due_at).toLocaleDateString()}` : ''}${t.building_code ? ` · ${t.building_code}` : ''}`,
        tag: t.priority === 'high'
          ? { label: 'High', tone: 'red' }
          : t.priority === 'urgent'
          ? { label: 'Urgent', tone: 'red' }
          : undefined,
      })),
      empty_message: 'No open tasks. Nice work.',
    },
    {
      title: `Manual blocks starting today (${blockRows.length})`,
      emoji: '🔒',
      items: blockRows.map(b => ({
        primary: `${b.listing_id} · ${b.reason}`,
        secondary: `${b.start_date} → ${b.end_date}${b.notes ? ` · ${b.notes}` : ''}`,
        tag: { label: b.reason, tone: 'slate' },
      })),
      empty_message: 'No new blocks today.',
    },
    {
      title: `Long-stay guests in residence (${ext.length})`,
      emoji: '🏠',
      items: ext.slice(0, 10).map(r => ({
        primary: `${r.listing_nickname || '—'} · ${r.guest_name || 'Guest'}`,
        secondary: `Until ${r.check_out_date}`,
      })),
      empty_message: 'No long-stay guests today.',
    },
  ];

  return {
    role: 'ops',
    date_iso: dateIso,
    cairo_label: cairoLabel(dateIso),
    sections,
    summary: {
      checkouts: co.length,
      checkins: ci.length,
      same_day_flips: sameDayFlips.length,
      open_tasks: tasks.length,
      manual_blocks: blockRows.length,
      long_stays: ext.length,
    },
  };
}

function cairoLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
