import 'server-only';
import { supabaseAdmin } from '../supabase';
import { priceForBoatOnDate, type PricingTier } from './pricing';

// Single source of truth for boat-on-date availability. A date is
// considered unavailable if either:
//   - a reservation in a live status ('held','confirmed','details_filled','paid_to_owner') exists, OR
//   - an owner block row exists.
// Brokers see "blocked" vs "booked" differently in the UI; admins see both.

export type AvailabilityStatus =
  | { kind: 'available'; tier: PricingTier; amountEgp: number }
  | { kind: 'no_price' }
  | { kind: 'booked'; reservationId: string; status: string }
  | { kind: 'blocked'; blockId: string; reason: string }
  | { kind: 'invalid' };

export async function checkAvailability(
  boatId: string,
  dateStr: string
): Promise<AvailabilityStatus> {
  if (!boatId || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { kind: 'invalid' };
  const sb = supabaseAdmin();

  // Reservation conflict?
  const { data: resRow } = await sb
    .from('boat_rental_reservations')
    .select('id, status')
    .eq('boat_id', boatId)
    .eq('booking_date', dateStr)
    .in('status', ['held', 'confirmed', 'details_filled', 'paid_to_owner'])
    .maybeSingle();
  if (resRow) {
    const r = resRow as { id: string; status: string };
    return { kind: 'booked', reservationId: r.id, status: r.status };
  }

  // Owner block conflict?
  const { data: blockRow } = await sb
    .from('boat_rental_owner_blocks')
    .select('id, reason')
    .eq('boat_id', boatId)
    .eq('blocked_date', dateStr)
    .maybeSingle();
  if (blockRow) {
    const b = blockRow as { id: string; reason: string };
    return { kind: 'blocked', blockId: b.id, reason: b.reason };
  }

  // Free — resolve price.
  const price = await priceForBoatOnDate(boatId, dateStr);
  if (!price) return { kind: 'no_price' };
  return { kind: 'available', tier: price.tier, amountEgp: price.amountEgp };
}

// Bulk check: given a date range, returns per-day status. Used by the
// 7-day price strip on the inquiry view + the calendar pages.
export async function checkAvailabilityRange(
  boatId: string,
  fromDateStr: string,
  daysCount: number
): Promise<Array<{ date: string; status: AvailabilityStatus }>> {
  const dates: string[] = [];
  const [y, m, d] = fromDateStr.split('-').map(Number);
  for (let i = 0; i < daysCount; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    dates.push(
      `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
    );
  }
  const results = await Promise.all(dates.map(date => checkAvailability(boatId, date)));
  return dates.map((date, i) => ({ date, status: results[i] }));
}
