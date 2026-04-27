import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { Brief, BriefSection } from './types';

// Operations & Housekeeping brief — what crew + ops manager need at 8am.
// Rendered in Arabic per user request (RTL).

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

export async function buildOpsBrief(dateIso: string): Promise<Brief> {
  const sb = supabaseAdmin();

  const [
    { data: checkouts },
    { data: checkins },
    { data: openTasks },
    { data: blocks },
    { data: extensions },
  ] = await Promise.all([
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_id, listing_nickname, building_code, guest_name, channel')
      .eq('check_out_date', dateIso)
      .neq('status', 'canceled')
      .order('listing_nickname'),
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_id, listing_nickname, building_code, guest_name, channel, nights')
      .eq('check_in_date', dateIso)
      .neq('status', 'canceled')
      .order('listing_nickname'),
    sb.from('beithady_tasks')
      .select('id, title, type, priority, status, due_at, building_code, reservation_id')
      .in('status', ['pending', 'in_progress'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(20),
    sb.from('beithady_calendar_manual_blocks')
      .select('id, listing_id, start_date, end_date, reason, notes')
      .eq('start_date', dateIso),
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

  const checkoutListings = new Set(co.map(r => r.listing_id));
  const sameDayFlips = ci.filter(r => checkoutListings.has(r.listing_id));

  const sections: BriefSection[] = [
    {
      title: `المغادرات اليوم (${co.length})`,
      emoji: '📤',
      items: co.map(r => ({
        primary: `${r.listing_nickname || '—'} · ${r.guest_name || 'الضيف'}`,
        secondary: `${r.channel || ''}${r.building_code ? ` · ${r.building_code}` : ''}`,
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
        secondary: `${r.channel || ''} · ${r.nights || 0} ليالٍ${r.building_code ? ` · ${r.building_code}` : ''}`,
        tag: checkoutListings.has(r.listing_id)
          ? { label: 'تنظيف بين النزلاء', tone: 'red' }
          : undefined,
      })),
      empty_message: 'لا توجد وصولات اليوم.',
    },
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
      title: `المهام المفتوحة (${tasks.length})`,
      emoji: '🛠',
      items: tasks.slice(0, 10).map(t => ({
        primary: t.title,
        secondary: `${TASK_TYPE_AR[t.type] || t.type}${t.priority ? ` · ${PRIORITY_AR[t.priority] || t.priority}` : ''}${t.due_at ? ` · موعد ${new Date(t.due_at).toLocaleDateString('ar-EG')}` : ''}${t.building_code ? ` · ${t.building_code}` : ''}`,
        tag: t.priority === 'high' || t.priority === 'urgent'
          ? { label: PRIORITY_AR[t.priority] || t.priority, tone: 'red' }
          : undefined,
      })),
      empty_message: 'لا توجد مهام مفتوحة. عمل ممتاز.',
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
      title: `إقامات طويلة لا تزال قائمة (${ext.length})`,
      emoji: '🏠',
      items: ext.slice(0, 10).map(r => ({
        primary: `${r.listing_nickname || '—'} · ${r.guest_name || 'الضيف'}`,
        secondary: `حتى ${r.check_out_date}`,
      })),
      empty_message: 'لا توجد إقامات طويلة اليوم.',
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
    },
  };
}
