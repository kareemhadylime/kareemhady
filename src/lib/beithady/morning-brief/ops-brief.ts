import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { addDays as addDaysCairo } from '@/lib/beithady-daily-report/cairo-dates';
import type { Brief, BriefSection } from './types';

// Operations & Housekeeping brief — what crew + ops manager need at 8am.
// Rendered in Arabic per user request (RTL).
//
// Audit changes (2026-04-28)
// --------------------------
// * Owner stays + manual blocks excluded from arrivals / departures /
//   long-stays / tomorrow-prep — they're not real guest events.
// * Open tasks now filtered to a freshness window (overdue ≤7 d OR
//   due in next 7 d). Pending zombie tasks no longer haunt the brief.
// * `limit(N)` and `slice(N)` aligned at 10 (was 20 vs 10 — fetched
//   10 wasted rows).
// * NULL nights renders as "— ليالٍ" instead of "0 ليالٍ".
// * Departures secondary now shows nights stayed (parity with Arrivals).
// * Long-stay items show nights remaining ("X ليالٍ متبقية").
// * Section order: Same-day flips → Departures → Arrivals → Long stays
//   → Open tasks → Manual blocks → Tomorrow's prep (was: Departures →
//   Arrivals → Flips → Tasks → Blocks → Long stays).
// * NEW: Tomorrow's check-ins prep section — heads-up for staging.

const REASON_AR: Record<string, string> = {
  owner_stay: 'إقامة المالك',
  maintenance: 'صيانة',
  hold: 'حجز إداري',
  other: 'أخرى',
};

const PRIORITY_AR: Record<string, string> = {
  urgent: 'عاجل',
  high: 'مرتفعة',
  medium: 'متوسطة',
  low: 'منخفضة',
};

const TASK_TYPE_AR: Record<string, string> = {
  cleaning: 'تنظيف',
  maintenance: 'صيانة',
  upsell: 'بيع إضافي',
  inspection: 'فحص',
  delivery: 'توصيل',
};

function arDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const TASK_FRESHNESS_DAYS = 7;

export async function buildOpsBrief(dateIso: string): Promise<Brief> {
  const sb = supabaseAdmin();
  const tomorrow = addDaysCairo(dateIso, 1);
  const taskWindowFloor = addDaysCairo(dateIso, -TASK_FRESHNESS_DAYS);
  const taskWindowCeil = addDaysCairo(dateIso, TASK_FRESHNESS_DAYS);
  // Use ISO-day boundaries for due_at (timestamptz). Loose envelope
  // (UTC midnight) is fine for daily-grain filtering.
  const taskWindowFloorTs = `${taskWindowFloor}T00:00:00Z`;
  const taskWindowCeilTs = `${taskWindowCeil}T23:59:59Z`;

  const [
    { data: checkouts },
    { data: checkins },
    { data: tomorrowCheckins },
    { data: openTasks },
    { data: blocks },
    { data: extensions },
  ] = await Promise.all([
    // Today's check-outs (real guests + non-block reservations only)
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_id, listing_nickname, building_code, guest_name, channel, nights')
      .eq('check_out_date', dateIso)
      .neq('status', 'canceled')
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('listing_nickname'),
    // Today's check-ins
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_id, listing_nickname, building_code, guest_name, channel, nights')
      .eq('check_in_date', dateIso)
      .neq('status', 'canceled')
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('listing_nickname'),
    // Tomorrow's check-ins — prep heads-up
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_id, listing_nickname, building_code, guest_name, channel, nights')
      .eq('check_in_date', tomorrow)
      .neq('status', 'canceled')
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('listing_nickname'),
    // Open tasks within freshness window (overdue ≤7d OR due ≤7d)
    sb.from('beithady_tasks')
      .select('id, title, type, priority, status, due_at, building_code, reservation_id')
      .in('status', ['pending', 'in_progress'])
      .gte('due_at', taskWindowFloorTs)
      .lte('due_at', taskWindowCeilTs)
      .order('due_at', { ascending: true })
      .limit(10),
    // Manual blocks starting today (narrow — only NEW disruptions)
    sb.from('beithady_calendar_manual_blocks')
      .select('id, listing_id, start_date, end_date, reason, notes')
      .eq('start_date', dateIso),
    // Long stays in progress (≥7 nights)
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, guest_name, check_in_date, check_out_date, nights, building_code')
      .lte('check_in_date', dateIso)
      .gt('check_out_date', dateIso)
      .neq('status', 'canceled')
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .gte('nights', 7)
      .order('check_out_date'),
  ]);

  type Res = { reservation_id: string; listing_id: string; listing_nickname: string | null; building_code: string | null; guest_name: string | null; channel: string | null; nights: number | null };
  const co = (checkouts as Res[] | null) || [];
  const ci = (checkins as Res[] | null) || [];
  const ciTomorrow = (tomorrowCheckins as Res[] | null) || [];
  const tasks = (openTasks as Array<{ id: string; title: string; type: string; priority: string | null; status: string; due_at: string | null; building_code: string | null; reservation_id: string | null }> | null) || [];
  const blockRows = (blocks as Array<{ id: string; listing_id: string; start_date: string; end_date: string; reason: string; notes: string | null }> | null) || [];
  const ext = (extensions as Array<{ reservation_id: string; listing_nickname: string | null; guest_name: string | null; check_in_date: string; check_out_date: string; nights: number | null; building_code: string | null }> | null) || [];

  // Same-day flips: listings present in BOTH today's check-outs AND
  // today's check-ins. Both sets already exclude owner stays + blocks,
  // so a flip here always means real cleaning is needed.
  const checkoutListings = new Set(co.map(r => r.listing_id));
  const sameDayFlips = ci.filter(r => checkoutListings.has(r.listing_id));

  const nightsLabel = (n: number | null): string =>
    n != null && n > 0 ? `${n} ليالٍ` : '— ليالٍ';
  const nightsRemainingLabel = (checkOut: string, today: string): string => {
    const remain = Math.max(0, daysBetween(today, checkOut));
    return remain > 0 ? `${remain} ليالٍ متبقية` : 'تغادر اليوم';
  };

  const sections: BriefSection[] = [
    {
      title: `تنظيف بين النزلاء في نفس اليوم (${sameDayFlips.length})`,
      emoji: '⚠️',
      items: sameDayFlips.map(r => ({
        primary: `${r.listing_nickname || r.listing_id}`,
        secondary: 'مغادرة الساعة 11 ووصول نزيل جديد نفس اليوم. أعطِ الأولوية لطاقم النظافة.',
        tag: { label: 'أولوية', tone: 'red' },
      })),
      empty_message: 'لا توجد عمليات تنظيف بين نزلاء بنفس اليوم. يمكن للطاقم التنظيم بشكل طبيعي.',
    },
    {
      title: `المغادرات اليوم (${co.length})`,
      emoji: '📤',
      items: co.map(r => ({
        primary: `${r.listing_nickname || '—'} · ${r.guest_name || 'الضيف'}`,
        secondary: `${r.channel || ''} · ${nightsLabel(r.nights)}${r.building_code ? ` · ${r.building_code}` : ''}`,
        tag: checkoutListings.has(r.listing_id) && sameDayFlips.find(f => f.listing_id === r.listing_id)
          ? { label: 'تنظيف عاجل', tone: 'red' }
          : undefined,
      })),
      empty_message: 'لا توجد مغادرات اليوم.',
    },
    {
      title: `الوصول اليوم (${ci.length})`,
      emoji: '📥',
      items: ci.map(r => ({
        primary: `${r.listing_nickname || '—'} · ${r.guest_name || 'الضيف'}`,
        secondary: `${r.channel || ''} · ${nightsLabel(r.nights)}${r.building_code ? ` · ${r.building_code}` : ''}`,
        tag: checkoutListings.has(r.listing_id)
          ? { label: 'تنظيف بين النزلاء', tone: 'red' }
          : undefined,
      })),
      empty_message: 'لا توجد وصولات اليوم.',
    },
    {
      title: `إقامات طويلة لا تزال قائمة (${ext.length})`,
      emoji: '🏠',
      items: ext.slice(0, 10).map(r => ({
        primary: `${r.listing_nickname || '—'} · ${r.guest_name || 'الضيف'}`,
        secondary: `${nightsRemainingLabel(r.check_out_date, dateIso)} · حتى ${r.check_out_date}${r.building_code ? ` · ${r.building_code}` : ''}`,
      })),
      empty_message: 'لا توجد إقامات طويلة اليوم.',
    },
    {
      title: `المهام المفتوحة (${tasks.length})`,
      emoji: '🛠',
      items: tasks.map(t => ({
        primary: t.title,
        secondary: `${TASK_TYPE_AR[t.type] || t.type}${t.priority ? ` · ${PRIORITY_AR[t.priority] || t.priority}` : ''}${t.due_at ? ` · موعد ${new Date(t.due_at).toLocaleDateString('ar-EG')}` : ''}${t.building_code ? ` · ${t.building_code}` : ''}`,
        tag: t.priority === 'high' || t.priority === 'urgent'
          ? { label: PRIORITY_AR[t.priority] || t.priority, tone: 'red' }
          : undefined,
      })),
      empty_message: 'لا توجد مهام مستحقة خلال ٧ أيام. عمل ممتاز.',
    },
    {
      title: `حجوزات إدارية تبدأ اليوم (${blockRows.length})`,
      emoji: '🔒',
      items: blockRows.map(b => ({
        primary: `${b.listing_id} · ${REASON_AR[b.reason] || b.reason}`,
        secondary: `${b.start_date} ← ${b.end_date}${b.notes ? ` · ${b.notes}` : ''}`,
        tag: { label: REASON_AR[b.reason] || b.reason, tone: 'slate' },
      })),
      empty_message: 'لا توجد حجوزات إدارية تبدأ اليوم.',
    },
    {
      title: `تحضير الغد (${ciTomorrow.length})`,
      emoji: '🌅',
      items: ciTomorrow.slice(0, 10).map(r => ({
        primary: `${r.listing_nickname || '—'} · ${r.guest_name || 'الضيف'}`,
        secondary: `${r.channel || ''} · ${nightsLabel(r.nights)}${r.building_code ? ` · ${r.building_code}` : ''}`,
        tag: { label: 'تحضير', tone: 'cyan' },
      })),
      empty_message: 'لا وصولات غدًا. يمكن للطاقم التخطيط بحرية.',
    },
  ];

  return {
    role: 'ops',
    date_iso: dateIso,
    cairo_label: arDate(dateIso),
    language: 'ar',
    sections,
    summary: {
      checkouts: co.length,
      checkins: ci.length,
      same_day_flips: sameDayFlips.length,
      open_tasks: tasks.length,
      manual_blocks: blockRows.length,
      long_stays: ext.length,
      tomorrow_checkins: ciTomorrow.length,
    },
  };
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const [y1, m1, d1] = fromYmd.split('-').map(Number);
  const [y2, m2, d2] = toYmd.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
