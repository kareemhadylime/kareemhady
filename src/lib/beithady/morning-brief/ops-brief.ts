import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
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
import { CANONICAL_BOOKED_STATUSES, getCurrentlyStaying } from '@/lib/beithady/guesty-metrics';
import type { Brief, BriefSection } from './types';

// Operations & Housekeeping brief — what crew + ops manager need at 8am.
// Rendered in Arabic (RTL).
//
// Audit changes (2026-04-30 part 2)
// ---------------------------------
// * **Bucket rebucket.** UAE units (BH-DXB) always shown on a separate
//   info line in Arabic ("BH-DXB: ن وحدة (مستثناة من الإجمالي)"), never
//   counted in headlines.
// * Status filter IN ('confirmed','reserved','awaiting_payment').

// CANONICAL alignment (2026-05-03): all briefs use the same triplet so
// arrivals/departures/staying counts match across briefs + Daily Report.
const ACTIVE_STATUSES = CANONICAL_BOOKED_STATUSES;

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

  // Canonical "Manual Block Unpaid" feed for ops (Q2 ratification 2026-05-03).
  const stayingCanonical = await getCurrentlyStaying(dateIso);
  const manualBlocksToday = stayingCanonical.manual_block_unpaid;

  const [
    { data: checkouts },
    { data: checkins },
    { data: tomorrowCheckins },
    { data: currentlyStaying },
    { data: openTasks },
    { data: blocks },
    { data: extensions },
  ] = await Promise.all([
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_id, listing_nickname, building_code, guest_name, channel, nights')
      .eq('check_out_date', dateIso)
      .in('status', ACTIVE_STATUSES)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('listing_nickname'),
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_id, listing_nickname, building_code, guest_name, channel, nights')
      .eq('check_in_date', dateIso)
      .in('status', ACTIVE_STATUSES)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('listing_nickname'),
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_id, listing_nickname, building_code, guest_name, channel, nights')
      .eq('check_in_date', tomorrow)
      .in('status', ACTIVE_STATUSES)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true)
      .order('listing_nickname'),
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_id, listing_nickname, building_code, guest_name, guest_count, nights, check_in_date, check_out_date')
      .lte('check_in_date', dateIso)
      .gt('check_out_date', dateIso)
      .in('status', ACTIVE_STATUSES)
      .neq('source_label', 'owner')
      .neq('is_manual_block', true),
    sb.from('beithady_tasks')
      .select('id, title, type, priority, status, due_at, building_code, reservation_id')
      .in('status', ['pending', 'in_progress'])
      .gte('due_at', taskWindowFloorTs)
      .lte('due_at', taskWindowCeilTs)
      .order('due_at', { ascending: true })
      .limit(10),
    sb.from('beithady_calendar_manual_blocks')
      .select('id, listing_id, start_date, end_date, reason, notes')
      .eq('start_date', dateIso),
    sb.from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, listing_id, guest_name, check_in_date, check_out_date, nights, building_code')
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
  const coRaw = (checkouts as Res[] | null) || [];
  const ciRaw = (checkins as Res[] | null) || [];
  // Exclude same-guest reservation extensions from all checkout/checkin counts and lists.
  // Unified with daily-activity-live.ts, the departures drawer, and build-buildings.ts.
  const _opsCoGuests = new Map<string, string | null>();
  for (const r of coRaw) if (r.listing_id) _opsCoGuests.set(r.listing_id, r.guest_name ?? null);
  const opsRenewedListings = new Set<string>();
  for (const r of ciRaw) {
    if (!r.listing_id) continue;
    const outGuest = _opsCoGuests.get(r.listing_id);
    if (outGuest != null && outGuest === (r.guest_name ?? null)) opsRenewedListings.add(r.listing_id);
  }
  const co = coRaw.filter(r => !opsRenewedListings.has(r.listing_id ?? ''));
  const ci = ciRaw.filter(r => !opsRenewedListings.has(r.listing_id ?? ''));
  const ciTomorrow = (tomorrowCheckins as Res[] | null) || [];
  const stay = (currentlyStaying as Stay[] | null) || [];
  const tasks = (openTasks as Array<{ id: string; title: string; type: string; priority: string | null; status: string; due_at: string | null; building_code: string | null; reservation_id: string | null }> | null) || [];
  const blockRows = (blocks as Array<{ id: string; listing_id: string; start_date: string; end_date: string; reason: string; notes: string | null }> | null) || [];
  const opsBlocks = blockRows.filter(b => b.reason === 'maintenance' || b.reason === 'other');
  const ownerBlocks = blockRows.filter(b => b.reason === 'owner_stay' || b.reason === 'hold');
  const ext = (extensions as Array<{ reservation_id: string; listing_nickname: string | null; listing_id: string | null; guest_name: string | null; check_in_date: string; check_out_date: string; nights: number | null; building_code: string | null }> | null) || [];

  // Same-day flips: listings present in BOTH today's check-outs AND
  // today's check-ins. Egypt-only for the headline.
  const checkoutListingIds = new Set(co.map(r => r.listing_id));
  const sameDayFlips = ci.filter(r => checkoutListingIds.has(r.listing_id));

  const nightsLabel = (n: number | null): string =>
    n != null && n > 0 ? `${n} ليالٍ` : '— ليالٍ';
  const nightsRemainingLabel = (checkOut: string, today: string): string => {
    const remain = Math.max(0, daysBetween(today, checkOut));
    return remain > 0 ? `${remain} ليالٍ متبقية` : 'تغادر اليوم';
  };

  // Per-bucket counts.
  const coCount = countByBucket(co);
  const ciCount = countByBucket(ci);
  const stayCount = countByBucket(stay);
  const flipCount = countByBucket(sameDayFlips);
  const ciTomorrowCount = countByBucket(ciTomorrow);

  const sumEgypt = (counts: Record<BriefBucket, number>): number =>
    EGYPT_BUCKETS.reduce((s, b) => s + counts[b], 0);

  const coEgypt = sumEgypt(coCount);
  const ciEgypt = sumEgypt(ciCount);
  const stayEgypt = sumEgypt(stayCount);
  const flipEgypt = sumEgypt(flipCount);
  const ciTomorrowEgypt = sumEgypt(ciTomorrowCount);

  const bucketBreakdownAr = (counts: Record<BriefBucket, number>): string =>
    EGYPT_BUCKETS.filter(b => counts[b] > 0).map(b => `${BUCKET_LABEL[b].ar}: ${counts[b]}`).join(' · ');

  const dxbInfoAr = (count: number, noun = 'وحدة'): string | null => {
    if (count === 0) return null;
    return `BH-DXB: ${count} ${noun} (مستثناة من الإجمالي)`;
  };

  const tagBucket = (r: { building_code: string | null; listing_id: string | null; listing_nickname: string | null }): string =>
    BUCKET_LABEL[bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname })].en;

  const totalGuestsEgypt = stay
    .filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname })))
    .reduce((s, r) => s + (r.guest_count || 0), 0);

  const sections: BriefSection[] = [
    {
      title: `تنظيف بين النزلاء في نفس اليوم (${flipEgypt})`,
      emoji: '⚠️',
      items: [
        ...sameDayFlips
          .filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname })))
          .map(r => ({
            primary: `[${tagBucket(r)}] ${r.listing_nickname || r.listing_id}`,
            secondary: 'مغادرة الساعة 11 ووصول نزيل جديد نفس اليوم. أعطِ الأولوية لطاقم النظافة.',
            tag: { label: 'أولوية', tone: 'red' as const },
          })),
        ...(flipCount['BH-DXB'] > 0 ? [{
          primary: dxbInfoAr(flipCount['BH-DXB'], 'تنظيف') || '',
          secondary: undefined,
          tag: { label: 'الإمارات — مستثناة', tone: 'slate' as const },
        }] : []),
      ],
      empty_message: 'لا توجد عمليات تنظيف بين نزلاء بنفس اليوم. يمكن للطاقم التنظيم بشكل طبيعي.',
    },
    {
      title: `النزلاء الحاليون داخل الوحدات (${stayEgypt})${stayingCanonical.already_arrived ? ` — ${stayingCanonical.already_arrived.length} داخل الوحدات · ${stayingCanonical.arriving_today?.length || 0} يصل اليوم` : ''}`,
      emoji: '🏨',
      items: [
        ...(stayEgypt > 0 ? [{
          primary: `${bucketBreakdownAr(stayCount)} · إجمالي الضيوف ${totalGuestsEgypt}`,
          secondary: 'وحدات مصر المأهولة.',
          tag: { label: 'مأهولة', tone: 'green' as const },
        }] : []),
        ...((stayingCanonical.arriving_today?.length || 0) > 0 ? [{
          primary: `${stayingCanonical.arriving_today!.length} حجز يصل اليوم (محسوب في إجمالي الإقامة)`,
          secondary: 'يظهر في قائمة الوصولات أيضًا — Guesty قد يعرضهم بعد تسجيل الدخول الفعلي فقط.',
          tag: { label: 'بانتظار الوصول', tone: 'amber' as const },
        }] : []),
        ...(stayCount['BH-DXB'] > 0 ? [{
          primary: `BH-DXB: ${stayCount['BH-DXB']} وحدة (مستثناة من الإجمالي)`,
          secondary: undefined,
          tag: { label: 'الإمارات — مستثناة', tone: 'slate' as const },
        }] : []),
      ],
      empty_message: 'لا توجد إقامات نشطة اليوم.',
    },
    // حجوزات يدوية / إقامات مالك — مدرجة منفصلة (Q2 2026-05-03)
    {
      title: `حجز يدوي بدون دفع (${manualBlocksToday.length})`,
      emoji: '🛠',
      items: manualBlocksToday.length > 0
        ? manualBlocksToday.slice(0, 8).map(r => ({
            primary: `${r.listing_nickname || r.listing_id || '—'} · ${r.guest_name || 'مالك / حجز إداري'}`,
            secondary: `${r.building} · ${r.source || 'manual'} · ${r.check_in_date} → ${r.check_out_date}`,
            tag: { label: 'خارج السوق', tone: 'amber' as const },
          }))
        : [],
      empty_message: 'لا توجد حجوزات يدوية أو إقامات مالك اليوم.',
    },
    {
      title: `المغادرات اليوم (${coEgypt})`,
      emoji: '📤',
      items: [
        ...co
          .filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname })))
          .map(r => ({
            primary: `[${tagBucket(r)}] ${r.listing_nickname || '—'} · ${r.guest_name || 'الضيف'}`,
            secondary: `${r.channel || ''} · ${nightsLabel(r.nights)}${r.building_code ? ` · ${r.building_code}` : ''}`,
            tag: checkoutListingIds.has(r.listing_id) && sameDayFlips.find(f => f.listing_id === r.listing_id)
              ? { label: 'تنظيف عاجل', tone: 'red' as const }
              : undefined,
          })),
        ...(coEgypt > 0 ? [{
          primary: `توزيع — ${bucketBreakdownAr(coCount)}`,
          secondary: undefined,
          tag: { label: 'مصر', tone: 'green' as const },
        }] : []),
        ...(coCount['BH-DXB'] > 0 ? [{
          primary: dxbInfoAr(coCount['BH-DXB'], 'مغادرات') || '',
          secondary: undefined,
          tag: { label: 'الإمارات — مستثناة', tone: 'slate' as const },
        }] : []),
      ],
      empty_message: 'لا توجد مغادرات اليوم.',
    },
    {
      title: `الوصول اليوم (${ciEgypt})`,
      emoji: '📥',
      items: [
        ...ci
          .filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname })))
          .map(r => ({
            primary: `[${tagBucket(r)}] ${r.listing_nickname || '—'} · ${r.guest_name || 'الضيف'}`,
            secondary: `${r.channel || ''} · ${nightsLabel(r.nights)}${r.building_code ? ` · ${r.building_code}` : ''}`,
            tag: checkoutListingIds.has(r.listing_id)
              ? { label: 'تنظيف بين النزلاء', tone: 'red' as const }
              : undefined,
          })),
        ...(ciEgypt > 0 ? [{
          primary: `توزيع — ${bucketBreakdownAr(ciCount)}`,
          secondary: undefined,
          tag: { label: 'مصر', tone: 'green' as const },
        }] : []),
        ...(ciCount['BH-DXB'] > 0 ? [{
          primary: dxbInfoAr(ciCount['BH-DXB'], 'وصولات') || '',
          secondary: undefined,
          tag: { label: 'الإمارات — مستثناة', tone: 'slate' as const },
        }] : []),
      ],
      empty_message: 'لا توجد وصولات اليوم.',
    },
    {
      title: `إقامات طويلة لا تزال قائمة (${ext.filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname }))).length})`,
      emoji: '🏠',
      items: [
        ...ext
          .filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname })))
          .slice(0, 10)
          .map(r => ({
            primary: `[${tagBucket(r)}] ${r.listing_nickname || '—'} · ${r.guest_name || 'الضيف'}`,
            secondary: `${nightsRemainingLabel(r.check_out_date, dateIso)} · حتى ${r.check_out_date}${r.building_code ? ` · ${r.building_code}` : ''}`,
          })),
        ...(ext.filter(r => isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname }))).length > 0 ? [{
          primary: `BH-DXB: ${ext.filter(r => isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname }))).length} إقامة (مستثناة من الإجمالي)`,
          secondary: undefined,
          tag: { label: 'الإمارات — مستثناة', tone: 'slate' as const },
        }] : []),
      ],
      empty_message: 'لا توجد إقامات طويلة اليوم.',
    },
    {
      title: `المهام المفتوحة (${tasks.length})`,
      emoji: '🛠',
      items: tasks.map(t => ({
        primary: t.title,
        secondary: `${TASK_TYPE_AR[t.type] || t.type}${t.priority ? ` · ${PRIORITY_AR[t.priority] || t.priority}` : ''}${t.due_at ? ` · موعد ${new Date(t.due_at).toLocaleDateString('ar-EG')}` : ''}${t.building_code ? ` · ${t.building_code}` : ''}`,
        tag: t.priority === 'high' || t.priority === 'urgent'
          ? { label: PRIORITY_AR[t.priority] || t.priority, tone: 'red' as const }
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
        tag: { label: REASON_AR[b.reason] || b.reason, tone: 'amber' as const },
      })),
      empty_message: 'لا توجد حجوزات صيانة أو أخرى تبدأ اليوم.',
    },
    {
      title: `إقامات المالك / حجوزات إدارية تبدأ اليوم (${ownerBlocks.length})`,
      emoji: '🏠',
      items: ownerBlocks.map(b => ({
        primary: `${b.listing_id} · ${REASON_AR[b.reason] || b.reason}`,
        secondary: `${b.start_date} ← ${b.end_date}${b.notes ? ` · ${b.notes}` : ''}`,
        tag: { label: REASON_AR[b.reason] || b.reason, tone: 'slate' as const },
      })),
      empty_message: 'لا توجد إقامات للمالك أو حجوزات إدارية تبدأ اليوم.',
    },
    {
      title: `تحضير الغد (${ciTomorrowEgypt})`,
      emoji: '🌅',
      items: [
        ...ciTomorrow
          .filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname })))
          .slice(0, 10)
          .map(r => ({
            primary: `[${tagBucket(r)}] ${r.listing_nickname || '—'} · ${r.guest_name || 'الضيف'}`,
            secondary: `${r.channel || ''} · ${nightsLabel(r.nights)}${r.building_code ? ` · ${r.building_code}` : ''}`,
            tag: { label: 'تحضير', tone: 'cyan' as const },
          })),
        ...(ciTomorrowCount['BH-DXB'] > 0 ? [{
          primary: dxbInfoAr(ciTomorrowCount['BH-DXB'], 'وصولات') || '',
          secondary: undefined,
          tag: { label: 'الإمارات — مستثناة', tone: 'slate' as const },
        }] : []),
      ],
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
      checkouts: coEgypt,
      checkouts_dxb_excluded: coCount['BH-DXB'],
      checkins: ciEgypt,
      checkins_dxb_excluded: ciCount['BH-DXB'],
      currently_staying: stayEgypt,
      currently_staying_guests: totalGuestsEgypt,
      currently_staying_dxb_excluded: stayCount['BH-DXB'],
      same_day_flips: flipEgypt,
      same_day_flips_dxb_excluded: flipCount['BH-DXB'],
      open_tasks: tasks.length,
      manual_blocks: blockRows.length,
      ops_blocks: opsBlocks.length,
      owner_blocks: ownerBlocks.length,
      long_stays: ext.filter(r => !isExcludedFromRevenue(bucketForListing({ building_code: r.building_code, listing_id: r.listing_id, nickname: r.listing_nickname }))).length,
      tomorrow_checkins: ciTomorrowEgypt,
      tomorrow_checkins_dxb_excluded: ciTomorrowCount['BH-DXB'],
    },
  };
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const [y1, m1, d1] = fromYmd.split('-').map(Number);
  const [y2, m2, d2] = toYmd.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
