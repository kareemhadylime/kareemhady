import 'server-only';
import { supabaseAdmin } from '../supabase';
import { addDays, type MonthRange } from './cairo-dates';
import {
  nightsInRange,
  normalizeChannel,
  type ReservationRow,
} from './reservations';
import type { AllInventories } from './units';
import { bucketFromGuestyListing } from './units';
import {
  BUILDING_CODES,
  type BuildingCode,
  type CancellationSummary,
  type ChannelMix,
  type CleaningOpsRow,
  type DeadInventoryRow,
  type InquiryTriage,
  type PricingAlert,
} from './types';

// Extras: channel mix (S2), cancellations (S7), dead inventory (S8),
// pricing alerts (S5), inquiry triage (S6), cleaning ops (S9).
//
// All numbers are USD. Pulls from `guesty_reservations`, `guesty_conversations`,
// and `pricelabs_listing_snapshots` (latest snapshot per listing).

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildChannelMix(
  active: ReservationRow[],
  ctx: MonthRange
): ChannelMix[] {
  const totals = new Map<string, number>();
  for (const r of active) {
    if (!r.host_payout_usd || !r.nights) continue;
    const nightsThisMonth = nightsInRange(r, ctx.start, ctx.end);
    if (nightsThisMonth === 0) continue;
    const allocated = (r.host_payout_usd * nightsThisMonth) / r.nights;
    const ch = normalizeChannel(r.source);
    totals.set(ch, (totals.get(ch) || 0) + allocated);
  }
  const sum = [...totals.values()].reduce((s, v) => s + v, 0);
  return [...totals.entries()]
    .map(([channel, revenue_usd]) => ({
      channel,
      revenue_usd: round2(revenue_usd),
      pct: sum > 0 ? Math.round((revenue_usd / sum) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue_usd - a.revenue_usd);
}

export function buildCancellations(
  canceled: ReservationRow[],
  ctx: MonthRange
): CancellationSummary & {
  details_yesterday: Array<{
    id: string;
    code: string | null;
    unit: string;
    channel: string;
    guest: string | null;
    check_in: string | null;
    value_usd: number;
    canceled_at: string;
  }>;
} {
  const today = ctx.today;
  let count_today = 0;
  let value_today_usd = 0;
  let count_mtd = 0;
  let value_mtd_usd = 0;
  const details_yesterday: Array<{
    id: string;
    code: string | null;
    unit: string;
    channel: string;
    guest: string | null;
    check_in: string | null;
    value_usd: number;
    canceled_at: string;
  }> = [];
  for (const r of canceled) {
    // Prefer cancelled_at (the actual cancellation event) over updated_at
    // (which is "any field on the row was modified" — too noisy and
    // historically stale for canceled reservations on this tenant).
    const effective = (r.effective_cancel_at_iso || r.updated_at_iso || '').slice(0, 10);
    if (!effective) continue;
    const usd = r.host_payout_usd || 0;
    if (effective === today) {
      count_today += 1;
      value_today_usd += usd;
      details_yesterday.push({
        id: r.id,
        code: r.confirmation_code,
        unit: r.listing_nickname || r.listing_id || 'Unknown',
        channel: normalizeChannelInline(r.source),
        guest: r.guest_name,
        check_in: r.check_in_date,
        value_usd: round2(usd),
        canceled_at: r.effective_cancel_at_iso || r.updated_at_iso || '',
      });
    }
    if (effective >= ctx.start && effective <= today) {
      count_mtd += 1;
      value_mtd_usd += usd;
    }
  }
  return {
    count_today,
    value_today_usd: round2(value_today_usd),
    count_mtd,
    value_mtd_usd: round2(value_mtd_usd),
    details_yesterday: details_yesterday.sort(
      (a, b) => b.value_usd - a.value_usd
    ),
  };
}

function normalizeChannelInline(source: string | null): string {
  const raw = String(source || '').trim().toLowerCase();
  if (!raw) return 'Direct';
  if (raw.includes('airbnb')) return 'Airbnb';
  if (raw.includes('booking')) return 'Booking.com';
  if (raw === 'manual' || raw === 'direct' || raw.includes('direct')) return 'Direct';
  return raw.replace(/\b\w/g, c => c.toUpperCase());
}

export async function buildDeadInventoryAsync(
  active: ReservationRow[],
  inventories: AllInventories,
  ctx: MonthRange
): Promise<DeadInventoryRow[]> {
  const next14End = addDays(ctx.today, 13);
  const today = ctx.today;
  const booked = new Set<string>();
  for (const r of active) {
    if (!r.listing_id) continue;
    const nights = nightsInRange(r, today, next14End);
    if (nights > 0) booked.add(r.listing_id);
  }
  const allListingIds = inventories.physical_listing_ids_all;
  const deadIds = allListingIds.filter(id => !booked.has(id));
  if (deadIds.length === 0) return [];

  const sb = supabaseAdmin();
  const { data } = await sb
    .from('guesty_listings')
    .select('id, nickname, building_code')
    .in('id', deadIds.slice(0, 200));
  const out: DeadInventoryRow[] = [];
  for (const row of (data || []) as Array<{
    id: string;
    nickname: string | null;
    building_code: string | null;
  }>) {
    const bucket = bucketFromGuestyListing({
      building_code: row.building_code,
      id: row.id,
    });
    out.push({
      unit: row.nickname || row.id,
      building: bucket as BuildingCode,
      nights_booked_next_14: 0,
    });
  }
  out.sort(
    (a, b) =>
      a.building.localeCompare(b.building) || a.unit.localeCompare(b.unit)
  );
  return out;
}

export async function buildPricingAlerts(): Promise<{
  alerts: PricingAlert[];
  warnings: string[];
}> {
  const sb = supabaseAdmin();
  const warnings: string[] = [];
  // Latest snapshot per listing — distinct on listing_id, ordered by snapshot_date desc.
  // Postgres approach: window function. Easier here: pull a recent slice, group client-side.
  const { data, error } = await sb
    .from('pricelabs_listing_snapshots')
    .select(
      `listing_id, snapshot_date, base, recommended_base_price, rec_base_unavailable,
       listing:pricelabs_listings!inner(name, building_code, push_enabled, is_hidden)`
    )
    .order('snapshot_date', { ascending: false })
    .limit(1000);
  if (error) {
    warnings.push(`pricing_alerts_query_failed: ${error.message}`);
    return { alerts: [], warnings };
  }
  type Row = {
    listing_id: string;
    snapshot_date: string;
    base: number | string | null;
    recommended_base_price: number | string | null;
    rec_base_unavailable: boolean;
    listing: {
      name: string | null;
      building_code: string | null;
      push_enabled: boolean | null;
      is_hidden: boolean | null;
    } | null;
  };
  const seen = new Set<string>();
  const alerts: PricingAlert[] = [];
  for (const r of (data as unknown as Row[]) || []) {
    if (seen.has(r.listing_id)) continue;
    seen.add(r.listing_id);
    if (!r.listing || r.listing.is_hidden) continue;
    if (r.rec_base_unavailable) continue;
    const base = typeof r.base === 'string' ? Number(r.base) : r.base;
    const rec =
      typeof r.recommended_base_price === 'string'
        ? Number(r.recommended_base_price)
        : r.recommended_base_price;
    if (!base || !rec || base <= 0 || rec <= 0) continue;
    const delta = ((base - rec) / rec) * 100;
    if (Math.abs(delta) < 10) continue;
    const bucket = bucketFromGuestyListing({
      building_code: r.listing.building_code,
      id: r.listing_id,
    });
    alerts.push({
      unit: r.listing.name || r.listing_id,
      building: bucket as BuildingCode,
      current_price_usd: round2(base),
      recommended_price_usd: round2(rec),
      delta_pct: Math.round(delta * 10) / 10,
    });
  }
  alerts.sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct));
  return { alerts: alerts.slice(0, 25), warnings };
}

export async function buildInquiryTriage(): Promise<{
  triage: InquiryTriage;
  warnings: string[];
}> {
  const sb = supabaseAdmin();
  const warnings: string[] = [];

  // Inquiries with the guest awaiting response (last_message_nonuser_at >
  // last_message_user_at, status='inquiry', state.read=false).
  const { count: inq, error: e1 } = await sb
    .from('guesty_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('reservation_status', 'inquiry')
    .eq('state_read', false);
  if (e1) warnings.push(`inquiry_count_failed: ${e1.message}`);

  // In-stay urgent (priority high or immediate) for active reservations.
  const { count: urgent, error: e2 } = await sb
    .from('guesty_conversations')
    .select('id', { count: 'exact', head: true })
    .in('reservation_status', ['confirmed', 'checked_in', 'checked_out'])
    .eq('state_read', false)
    .gte('priority', 11);
  if (e2) warnings.push(`urgent_count_failed: ${e2.message}`);

  // High-priority unread (priority between 11-19, treat 20+ as immediate)
  const { count: high, error: e3 } = await sb
    .from('guesty_conversations')
    .select('id', { count: 'exact', head: true })
    .in('reservation_status', ['confirmed', 'checked_in', 'checked_out'])
    .eq('state_read', false)
    .gte('priority', 11)
    .lt('priority', 20);
  if (e3) warnings.push(`high_count_failed: ${e3.message}`);

  return {
    triage: {
      inquiries_unanswered_count: inq ?? 0,
      in_stay_immediate_count: Math.max(0, (urgent ?? 0) - (high ?? 0)),
      in_stay_high_count: high ?? 0,
    },
    warnings,
  };
}

export function buildCleaningOps(
  active: ReservationRow[],
  ctx: MonthRange
): CleaningOpsRow[] {
  const today = ctx.today;
  // For each listing, gather the checkout-today guest and checkin-today guest.
  type Slot = {
    listing_id: string;
    nickname: string;
    building: BuildingCode;
    checkout_guest: string | null;
    checkin_guest: string | null;
  };
  const map = new Map<string, Slot>();
  for (const r of active) {
    if (!r.listing_id) continue;
    if (r.check_out_date === today) {
      const slot =
        map.get(r.listing_id) || {
          listing_id: r.listing_id,
          nickname: r.listing_nickname || r.listing_id,
          building: r.building,
          checkout_guest: null,
          checkin_guest: null,
        };
      slot.checkout_guest = r.guest_name || 'Guest';
      map.set(r.listing_id, slot);
    }
    if (r.check_in_date === today) {
      const slot =
        map.get(r.listing_id) || {
          listing_id: r.listing_id,
          nickname: r.listing_nickname || r.listing_id,
          building: r.building,
          checkout_guest: null,
          checkin_guest: null,
        };
      slot.checkin_guest = r.guest_name || 'Guest';
      map.set(r.listing_id, slot);
    }
  }
  const out: CleaningOpsRow[] = [];
  for (const slot of map.values()) {
    if (slot.checkout_guest && slot.checkin_guest) {
      out.push({
        unit: slot.nickname,
        building: slot.building,
        checkout_guest: slot.checkout_guest,
        checkin_guest: slot.checkin_guest,
      });
    }
  }
  out.sort(
    (a, b) =>
      a.building.localeCompare(b.building) || a.unit.localeCompare(b.unit)
  );
  return out;
}
