import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';
import { addDays as addDaysCairo } from '@/lib/beithady-daily-report/cairo-dates';
import { countryForBuilding, type CountryCode } from './country';
import type { Brief, BriefSection } from './types';

// Operations & Housekeeping brief — what crew + ops manager need at 8am.
// Rendered in Arabic (RTL).
//
// Audit changes (2026-04-30)
// --------------------------
// * **Status filter tightened.** Same-day flips, departures, arrivals,
//   long-stays, tomorrow-prep all now require status IN
//   ('confirmed','reserved','awaiting_payment') — Guesty parity.
//   Inquiries no longer trigger phantom housekeeping flips.
// * **Country segregation.** Section headers carry per-country counts
//   (مصر / الإمارات). Items prefixed with country flag.
// * **"Currently staying" section.** New section matches Guesty's
//   homepage tile so housekeeping has visibility on in-house guests
//   (linen / waste / supplies pacing).
//
// Older audit (2026-04-28)
// ------------------------
// * Owner stays + manual blocks excluded from arrivals / departures /
//   long-stays / tomorrow-prep — they're not real guest events.
// * Open tasks filtered to ≤7 d window.
// * Section order: Same-day flips → Departures → Arrivals → Long stays
//   → Open tasks → Manual blocks → Tomorrow's prep.

const ACTIVE_STATUSES = ['confirmed', 'reserved', 'awaiting_payment'] as const;

const COUNTRY_FLAG: Record<CountryCode, string> = {
  EG: '🇪🇬',
  AE: '🇦🇪',
  OTHER: '🌍',
};
const COUNTRY_AR: Record<CountryCode, string> = {
  EG: 'مصر',
  AE: 'الإمارات',
  OTHER: 'أخرى',
};

// M.14: build the inventory stockout-risk section. Lifted out so the
// sections array can stay declarative.
async function buildStockoutSection(sb: SupabaseClient): Promise<BriefSection> {
  const { data: stockRows } = await sb
    .from('beithady_inventory_stock')
    .select('item_id, qty_on_hand');
  const totals = new Map<string, number>();
  for (const r of (stockRows as Array<{ item_id: string; qty_on_hand: number }> | null) || []) {
    totals.set(r.item_id, (totals.get(r.item_id) || 0) + Number(r.qty_on_hand || 0));
  }
  const { data: items } = await sb
    .from('beithady_inventory_items')
    .select('id, sku, name_ar, name_en, min_qty, uom')
    .eq('active', true);
  const lowStock = ((items as Array<{
    id: string; sku: string; name_ar: string; name_en: string; min_qty: number; uom: string;
  }> | null) || [])
    .map(it => ({ ...it, on_hand: totals.get(it.id) || 0 }))
    .filter(it => it.on_hand < Number(it.min_qty || 0))
    .sort((a, b) => a.on_hand - b.on_hand)
    .slice(0, 10);
  return {
    title: `أصناف قاربت على النفاد (${lowStock.length})`,
    emoji: '📦',
    items: lowStock.map(it => ({
      primary: `${it.name_ar || it.name_en} (${it.sku})`,
      secondary: it.on_hand === 0
        ? `نفد المخزون · الحد الأدنى ${it.min_qty} ${it.uom}`
        : `متبقي ${it.on_hand} ${it.uom} · الحد الأدنى ${it.min_qty}`,
      tag: it.on_hand === 0
        ? { label: 'نفد', tone: 'red' as const }
        : { label: 'منخفض', tone: 'amber' as const },
    })),
    empty_message: 'مستويات المخزون مطمئنة. لا حاجة لإعادة طلب فورية.',
  };
}

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
  const taskWindowFloorTs = `${taskWindowFloor}T00:00:00Z`;
  const taskWindowCeilTs = `${taskWindowCeil}T23:59:59Z`;

  const [
    { data: checkouts },
    { data: checkins },
    { data: tomorrowCheckins },
    { data: currentlyStaying },
    { data: openTasks },
    { data: blocks },
    { data: extensions },
  ] = await Promise.all([
    // Today's check-outs (real guests + non-block reservations only)
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_id, listing_nickname, building_code, guest_name, channel, nights')
      .eq('check_out_date', dateIso)
      .in('status', ACTIVE_STATUSES)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('listing_nickname'),
    // Today's check-ins
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_id, listing_nickname, building_code, guest_name, channel, nights')
      .eq('check_in_date', dateIso)
      .in('status', ACTIVE_STATUSES)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('listing_nickname'),
    // Tomorrow's check-ins — prep heads-up
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_id, listing_nickname, building_code, guest_name, channel, nights')
      .eq('check_in_date', tomorrow)
      .in('status', ACTIVE_STATUSES)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('listing_nickname'),
    // Currently staying — Guesty parity
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_id, listing_nickname, building_code, guest_name, guest_count, nights, check_in_date, check_out_date')
      .lte('check_in_date', dateIso)
      .gt('check_out_date', dateIso)
      .in('status', ACTIVE_STATUSES)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true),
    // Open tasks within freshness window
    sb.from('beithady_tasks')
      .select('id, title, type, priority, status, due_at, building_code, reservation_id')
      .in('status', ['pending', 'in_progress'])
      .gte('due_at', taskWindowFloorTs)
      .lte('due_at', taskWindowCeilTs)
      .order('due_at', { ascending: true })
      .limit(10),
    // Manual blocks starting today
    sb.from('beithady_calendar_manual_blocks')
      .select('id, listing_id, start_date, end_date, reason, notes')
      .eq('start_date', dateIso),
    // Long stays in progress (≥7 nights)
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, guest_name, check_in_date, check_out_date, nights, building_code')
      .lte('check_in_date', dateIso)
      .gt('check_out_date', dateIso)
      .in('status', ACTIVE_STATUSES)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .gte('nights', 7)
      .order('check_out_date'),
  ]);

  type Res = { reservation_id: string; listing_id: string; listing_nickname: string | null; building_code: string | null; guest_name: string | null; channel: string | null; nights: number | null };
  type Stay = Res & { guest_count: number | null; check_in_date: string; check_out_date: string };
  const co = (checkouts as Res[] | null) || [];
  const ci = (checkins as Res[] | null) || [];
  const ciTomorrow = (tomorrowCheckins as Res[] | null) || [];
  const stay = (currentlyStaying as Stay[] | null) || [];
  const tasks = (openTasks as Array<{ id: string; title: string; type: string; priority: string | null; status: string; due_at: string | null; building_code: string | null; reservation_id: string | null }> | null) || [];
  const blockRows = (blocks as Array<{ id: string; listing_id: string; start_date: string; end_date: string; reason: string; notes: string | null }> | null) || [];
  const opsBlocks = blockRows.filter(b => b.reason === 'maintenance' || b.reason === 'other');
  const ownerBlocks = blockRows.filter(b => b.reason === 'owner_stay' || b.reason === 'hold');
  const ext = (extensions as Array<{ reservation_id: string; listing_nickname: string | null; guest_name: string | null; check_in_date: string; check_out_date: string; nights: number | null; building_code: string | null }> | null) || [];

  // Same-day flips: listings present in BOTH today's check-outs AND
  // today's check-ins.
  const checkoutListings = new Set(co.map(r => r.listing_id));
  const sameDayFlips = ci.filter(r => checkoutListings.has(r.listing_id));

  const nightsLabel = (n: number | null): string =>
    n != null && n > 0 ? `${n} ليالٍ` : '— ليالٍ';
  const nightsRemainingLabel = (checkOut: string, today: string): string => {
    const remain = Math.max(0, daysBetween(today, checkOut));
    return remain > 0 ? `${remain} ليالٍ متبقية` : 'تغادر اليوم';
  };

  // Per-country counts.
  const countByCountry = <T extends { building_code: string | null }>(rows: T[]) => {
    const out: Record<CountryCode, number> = { EG: 0, AE: 0, OTHER: 0 };
    for (const r of rows) out[countryForBuilding(r.building_code)] += 1;
    return out;
  };
  const countryBreakdownAr = (counts: Record<CountryCode, number>): string => {
    const parts: string[] = [];
    if (counts.EG > 0) parts.push(`${COUNTRY_AR.EG}: ${counts.EG}`);
    if (counts.AE > 0) parts.push(`${COUNTRY_AR.AE}: ${counts.AE}`);
    if (counts.OTHER > 0) parts.push(`${COUNTRY_AR.OTHER}: ${counts.OTHER}`);
    return parts.join(' · ');
  };

  const coCounts = countByCountry(co);
  const ciCounts = countByCountry(ci);
  const stayCounts = countByCountry(stay);
  const flipCounts = countByCountry(sameDayFlips);
  const ciTomorrowCounts = countByCountry(ciTomorrow);

  const countryTag = (code: string | null): string =>
    COUNTRY_FLAG[countryForBuilding(code)];

  const totalGuestsStaying = stay.reduce((s, r) => s + (r.guest_count || 0), 0);

  const sections: BriefSection[] = [
    {
      title: `تنظيف بين النزلاء في نفس اليوم (${sameDayFlips.length})${sameDayFlips.length > 0 ? ` — ${countryBreakdownAr(flipCounts)}` : ''}`,
      emoji: '⚠️',
      items: sameDayFlips.map(r => ({
        primary: `${countryTag(r.building_code)} ${r.listing_nickname || r.listing_id}`,
        secondary: 'مغادرة الساعة 11 ووصول نزيل جديد نفس اليوم. أعطِ الأولوية لطاقم النظافة.',
        tag: { label: 'أولوية', tone: 'red' },
      })),
      empty_message: 'لا توجد عمليات تنظيف بين نزلاء بنفس اليوم. يمكن للطاقم التنظيم بشكل طبيعي.',
    },
    {
      title: `النزلاء الحاليون داخل الوحدات (${stay.length})${stay.length > 0 ? ` — ${countryBreakdownAr(stayCounts)} · ${totalGuestsStaying} ضيوف` : ''}`,
      emoji: '🏨',
      items: [
        ...(stayCounts.EG > 0 ? [{
          primary: `🇪🇬 ${COUNTRY_AR.EG} — ${stayCounts.EG} وحدة مأهولة`,
          secondary: `إجمالي الضيوف: ${stay.filter(r => countryForBuilding(r.building_code) === 'EG').reduce((s, r) => s + (r.guest_count || 0), 0)}`,
        }] : []),
        ...(stayCounts.AE > 0 ? [{
          primary: `🇦🇪 ${COUNTRY_AR.AE} — ${stayCounts.AE} وحدة مأهولة`,
          secondary: `إجمالي الضيوف: ${stay.filter(r => countryForBuilding(r.building_code) === 'AE').reduce((s, r) => s + (r.guest_count || 0), 0)}`,
        }] : []),
      ],
      empty_message: 'لا توجد إقامات نشطة اليوم.',
    },
    {
      title: `المغادرات اليوم (${co.length})${co.length > 0 ? ` — ${countryBreakdownAr(coCounts)}` : ''}`,
      emoji: '📤',
      items: co.map(r => ({
        primary: `${countryTag(r.building_code)} ${r.listing_nickname || '—'} · ${r.guest_name || 'الضيف'}`,
        secondary: `${r.channel || ''} · ${nightsLabel(r.nights)}${r.building_code ? ` · ${r.building_code}` : ''}`,
        tag: checkoutListings.has(r.listing_id) && sameDayFlips.find(f => f.listing_id === r.listing_id)
          ? { label: 'تنظيف عاجل', tone: 'red' }
          : undefined,
      })),
      empty_message: 'لا توجد مغادرات اليوم.',
    },
    {
      title: `الوصول اليوم (${ci.length})${ci.length > 0 ? ` — ${countryBreakdownAr(ciCounts)}` : ''}`,
      emoji: '📥',
      items: ci.map(r => ({
        primary: `${countryTag(r.building_code)} ${r.listing_nickname || '—'} · ${r.guest_name || 'الضيف'}`,
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
        primary: `${countryTag(r.building_code)} ${r.listing_nickname || '—'} · ${r.guest_name || 'الضيف'}`,
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
      title: `حجوزات صيانة / أخرى تبدأ اليوم (${opsBlocks.length})`,
      emoji: '🔧',
      items: opsBlocks.map(b => ({
        primary: `${b.listing_id} · ${REASON_AR[b.reason] || b.reason}`,
        secondary: `${b.start_date} ← ${b.end_date}${b.notes ? ` · ${b.notes}` : ''}`,
        tag: { label: REASON_AR[b.reason] || b.reason, tone: 'amber' },
      })),
      empty_message: 'لا توجد حجوزات صيانة أو أخرى تبدأ اليوم.',
    },
    {
      title: `إقامات المالك / حجوزات إدارية تبدأ اليوم (${ownerBlocks.length})`,
      emoji: '🏠',
      items: ownerBlocks.map(b => ({
        primary: `${b.listing_id} · ${REASON_AR[b.reason] || b.reason}`,
        secondary: `${b.start_date} ← ${b.end_date}${b.notes ? ` · ${b.notes}` : ''}`,
        tag: { label: REASON_AR[b.reason] || b.reason, tone: 'slate' },
      })),
      empty_message: 'لا توجد إقامات للمالك أو حجوزات إدارية تبدأ اليوم.',
    },
    {
      title: `تحضير الغد (${ciTomorrow.length})${ciTomorrow.length > 0 ? ` — ${countryBreakdownAr(ciTomorrowCounts)}` : ''}`,
      emoji: '🌅',
      items: ciTomorrow.slice(0, 10).map(r => ({
        primary: `${countryTag(r.building_code)} ${r.listing_nickname || '—'} · ${r.guest_name || 'الضيف'}`,
        secondary: `${r.channel || ''} · ${nightsLabel(r.nights)}${r.building_code ? ` · ${r.building_code}` : ''}`,
        tag: { label: 'تحضير', tone: 'cyan' },
      })),
      empty_message: 'لا وصولات غدًا. يمكن للطاقم التخطيط بحرية.',
    },
    await buildStockoutSection(sb),
  ];

  return {
    role: 'ops',
    date_iso: dateIso,
    cairo_label: arDate(dateIso),
    language: 'ar',
    sections,
    summary: {
      checkouts: co.length,
      checkouts_eg: coCounts.EG,
      checkouts_ae: coCounts.AE,
      checkins: ci.length,
      checkins_eg: ciCounts.EG,
      checkins_ae: ciCounts.AE,
      currently_staying: stay.length,
      currently_staying_eg: stayCounts.EG,
      currently_staying_ae: stayCounts.AE,
      currently_staying_guests: totalGuestsStaying,
      same_day_flips: sameDayFlips.length,
      open_tasks: tasks.length,
      manual_blocks: blockRows.length,
      ops_blocks: opsBlocks.length,
      owner_blocks: ownerBlocks.length,
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
