// src/lib/pace-report/load-reservations.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { toUsd } from '@/lib/beithady-daily-report/fx';
import type { PaceDateRange } from './types';

export type PaceReservation = {
  id: string;
  listing_id: string;
  status: string | null;
  check_in_date: string;          // YYYY-MM-DD
  check_out_date: string;         // YYYY-MM-DD (exclusive in standard hotel math)
  nights: number;
  host_payout_usd: number;
  created_at_iso: string | null;
  is_canceled: boolean;
};

const ACTIVE_STATUSES = new Set(['confirmed', 'checked_in', 'checked_out', 'reserved']);
const CANCELED_STATUSES = new Set(['canceled', 'cancelled']);

/**
 * Pulls reservations whose stay overlaps [range.from, range.to].
 *
 * The pickup-by-creation-month panel doesn't need a separate creation-date
 * lookback — every row already carries its own `created_at_iso`, and the
 * aggregator buckets by lead-time between createdAt and check-in month.
 *
 * host_payout is converted to USD via the daily-report FX cache.
 *
 * Cancellations are kept (with is_canceled=true) so the includeHistorical
 * toggle can flip them on in aggregate.ts without a second query.
 */
export async function loadPaceReservations(
  range: PaceDateRange,
  listingIds: string[],
): Promise<PaceReservation[]> {
  if (listingIds.length === 0) return [];

  const sb = supabaseAdmin();
  const PAGE = 1000;
  const collected: Array<Record<string, unknown>> = [];

  for (let offset = 0; offset < 100_000; offset += PAGE) {
    const { data, error } = await sb
      .from('guesty_reservations')
      .select(
        `id, status, listing_id, check_in_date, check_out_date, nights,
         currency, host_payout, created_at_odoo`,
      )
      .in('listing_id', listingIds)
      .lte('check_in_date', range.to)
      .gte('check_out_date', range.from)
      .order('check_in_date', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`pace_reservations_query_failed: ${error.message}`);
    const batch = (data || []) as Array<Record<string, unknown>>;
    collected.push(...batch);
    if (batch.length < PAGE) break;
  }

  const fxDate = new Date();
  const out: PaceReservation[] = [];
  for (const r of collected) {
    const id = String(r.id || '');
    if (!id) continue;
    const status = ((r.status as string | null) || '').toLowerCase();
    const listingId = (r.listing_id as string | null) || '';
    const checkIn = (r.check_in_date as string | null) || '';
    const checkOut = (r.check_out_date as string | null) || '';
    if (!listingId || !checkIn || !checkOut) continue;
    if (!ACTIVE_STATUSES.has(status) && !CANCELED_STATUSES.has(status)) continue;

    const rawPayout = r.host_payout as number | string | null;
    const payoutNum =
      typeof rawPayout === 'string' ? Number(rawPayout) : rawPayout;
    const usd = await toUsd(
      typeof payoutNum === 'number' && Number.isFinite(payoutNum) ? payoutNum : null,
      ((r.currency as string | null) || 'USD').toUpperCase(),
      fxDate,
    );

    out.push({
      id,
      listing_id: listingId,
      status: status || null,
      check_in_date: checkIn,
      check_out_date: checkOut,
      nights: typeof r.nights === 'number' ? (r.nights as number) : 0,
      host_payout_usd: usd ?? 0,
      created_at_iso: (r.created_at_odoo as string | null) || null,
      is_canceled: CANCELED_STATUSES.has(status),
    });
  }

  return out;
}
