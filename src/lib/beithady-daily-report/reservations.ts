import 'server-only';
import { supabaseAdmin } from '../supabase';
import { toUsd } from './fx';
import { bucketFromGuestyListing } from './units';
import type { BuildingCode } from './types';

// Shared reservation loader. Pulls all reservations whose date range
// overlaps a given window plus a buffer (so we can compute today's
// occupancy, MTD revenue, next-N-days projections from one query).
//
// All host_payout values are normalized to USD using the FX cache.

export type ReservationRow = {
  id: string;
  status: string | null;
  source: string | null;
  listing_id: string | null;
  listing_nickname: string | null;
  guest_name: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  nights: number | null;
  currency: string | null;
  host_payout_usd: number | null;     // converted
  host_payout_raw: number | null;     // original
  created_at_iso: string | null;      // Guesty createdAt
  updated_at_iso: string | null;
  building: BuildingCode;
};

export type ReservationCorpus = {
  rows: ReservationRow[];
  // Pre-bucketed views for speed
  active: ReservationRow[];           // status in confirmed/checked_in/checked_out
  canceled: ReservationRow[];
};

const ACTIVE_STATUSES = new Set([
  'confirmed',
  'checked_in',
  'checked_out',
]);

/**
 * Normalize Guesty channel/source strings to a small canonical set so
 * the channel mix bucket counts cleanly.
 */
export function normalizeChannel(source: string | null): string {
  const raw = String(source || '').trim().toLowerCase();
  if (!raw) return 'Direct';
  if (raw.includes('airbnb')) return 'Airbnb';
  if (raw.includes('booking')) return 'Booking.com';
  if (raw.includes('vrbo') || raw.includes('homeaway')) return 'Vrbo';
  if (raw.includes('expedia')) return 'Expedia';
  if (raw === 'manual' || raw === 'direct' || raw.includes('direct'))
    return 'Direct';
  if (raw.includes('website')) return 'Direct';
  return raw.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Load all reservations whose stay or creation overlaps the report
 * window. We pull a 90-day stay window (start-of-month minus 30,
 * end-of-month plus 14, capped to 90 days) plus a 60-day creation
 * window (for pace metrics).
 */
export async function loadReservationCorpus(
  windowFromYmd: string,
  windowToYmd: string,
  fxDate: Date = new Date()
): Promise<ReservationCorpus> {
  const sb = supabaseAdmin();
  const PAGE = 1000;
  const collected: Array<Record<string, unknown>> = [];

  // Pull anything with a stay touching the window OR created in the window.
  // Since `check_in_date` is DATE and `created_at_odoo` is timestamptz,
  // do two simpler passes and dedupe.
  for (let offset = 0; offset < 50000; offset += PAGE) {
    const { data, error } = await sb
      .from('guesty_reservations')
      .select(
        `id, status, source, listing_id, listing_nickname, guest_name,
         check_in_date, check_out_date, nights, currency, host_payout,
         created_at_odoo, updated_at_odoo,
         listing:guesty_listings!left(building_code)`
      )
      .lte('check_in_date', windowToYmd)
      .gte('check_out_date', windowFromYmd)
      .order('check_in_date', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`reservation_query_failed: ${error.message}`);
    const batch = (data || []) as Array<Record<string, unknown>>;
    collected.push(...batch);
    if (batch.length < PAGE) break;
  }

  // Convert + bucket
  const seen = new Set<string>();
  const rows: ReservationRow[] = [];
  for (const r of collected) {
    const id = String(r.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const listing = (r.listing as { building_code: string | null } | null) || null;
    const building = bucketFromGuestyListing({
      building_code: listing?.building_code || null,
      id: (r.listing_id as string | null) || undefined,
    });

    const rawPayout = r.host_payout as number | string | null;
    const payoutNum =
      typeof rawPayout === 'string' ? Number(rawPayout) : rawPayout;
    const usd = await toUsd(
      typeof payoutNum === 'number' && Number.isFinite(payoutNum)
        ? payoutNum
        : null,
      (r.currency as string | null) || 'USD',
      fxDate
    );

    rows.push({
      id,
      status: ((r.status as string | null) || '').toLowerCase() || null,
      source: (r.source as string | null) || null,
      listing_id: (r.listing_id as string | null) || null,
      listing_nickname: (r.listing_nickname as string | null) || null,
      guest_name: (r.guest_name as string | null) || null,
      check_in_date: (r.check_in_date as string | null) || null,
      check_out_date: (r.check_out_date as string | null) || null,
      nights:
        typeof r.nights === 'number' ? (r.nights as number) : null,
      currency: ((r.currency as string | null) || 'USD').toUpperCase(),
      host_payout_usd: usd,
      host_payout_raw:
        typeof payoutNum === 'number' && Number.isFinite(payoutNum)
          ? payoutNum
          : null,
      created_at_iso: (r.created_at_odoo as string | null) || null,
      updated_at_iso: (r.updated_at_odoo as string | null) || null,
      building,
    });
  }

  const active = rows.filter(r => r.status && ACTIVE_STATUSES.has(r.status));
  const canceled = rows.filter(r => r.status === 'canceled');

  return { rows, active, canceled };
}

/**
 * Count nights from a reservation that fall within an inclusive date range.
 * Standard hospitality math: a booking from check_in→check_out covers
 * (check_out - check_in) nights, each anchored to a specific date.
 */
export function nightsInRange(
  res: { check_in_date: string | null; check_out_date: string | null },
  fromYmd: string,
  toYmd: string
): number {
  if (!res.check_in_date || !res.check_out_date) return 0;
  const ci = res.check_in_date;
  const co = res.check_out_date;
  // Effective overlap = [max(ci, from), min(co, toExclusive))
  // toYmd is inclusive, so the night anchored to toYmd counts only if
  // ci <= toYmd < co.
  const start = ci > fromYmd ? ci : fromYmd;
  const endExclusive = co; // co is the morning of checkout, no night anchored
  // Convert to day diff
  if (endExclusive <= start) return 0;
  // Cap at toYmd+1 (i.e. include toYmd as a night)
  const cap = addOneDay(toYmd);
  const finalEnd = endExclusive < cap ? endExclusive : cap;
  if (finalEnd <= start) return 0;
  return diffDays(start, finalEnd);
}

function addOneDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / 86400_000);
}
