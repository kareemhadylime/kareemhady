// Pure compute for the reservation-status chip on the unified inbox
// right panel. Deliberately client-safe — no server-only imports — so
// both the server-rendered initial paint and any future client-side
// re-render share the same logic.

export type ReservationVariant =
  | 'in_house'        // confirmed/reserved/checked_in/checked_out AND today ∈ [check_in, check_out]
  | 'future'          // confirmed/reserved AND check_in > today
  | 'past'            // confirmed/checked_out AND check_out < today
  | 'inquiry'         // unconfirmed quote — date span shown but never "in-house"
  | 'cancelled'       // canceled/cancelled/declined/closed
  | 'pending_sync'    // reservation_id set but row not (yet) in guesty_reservations
  | 'none';           // no reservation_id — cold lead

export type ReservationStatusInput = {
  status: string | null;
  check_in_date: string | null;   // YYYY-MM-DD wall date (Cairo / property tz)
  check_out_date: string | null;
};

// Set of Guesty status values we treat as "has booking, look at dates".
// `inquiry` is intentionally excluded — those are unconfirmed quotes
// even if their requested date span includes today, per Q.0.2 finding
// (34 inquiry conversations had today inside [check_in, check_out],
// none of which represent actual in-house guests).
const ACTIVE_BOOKING_STATUSES = new Set([
  'confirmed',
  'reserved',
  'checked_in',
  'checked_out',
]);

const CANCELLED_STATUSES = new Set([
  'canceled',
  'cancelled',
  'declined',
  'closed',
]);

function todayCairoIso(): string {
  // `en-CA` locale gives YYYY-MM-DD — same wall-date format Guesty
  // uses on check_in_date / check_out_date.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

export function computeReservationVariant(
  res: ReservationStatusInput | null,
  hasReservationId: boolean,
): ReservationVariant {
  if (!hasReservationId) return 'none';
  if (!res) return 'pending_sync';
  const s = (res.status || '').toLowerCase();
  if (CANCELLED_STATUSES.has(s)) return 'cancelled';
  if (s === 'inquiry') return 'inquiry';
  if (!ACTIVE_BOOKING_STATUSES.has(s)) {
    // Unknown status — fall back to date-bucketing if we have dates.
    // This is conservative; we'd rather show a date chip than hide.
    if (!res.check_in_date || !res.check_out_date) return 'pending_sync';
  }
  if (!res.check_in_date || !res.check_out_date) return 'future';
  const today = todayCairoIso();
  if (today < res.check_in_date) return 'future';
  if (today > res.check_out_date) return 'past';
  return 'in_house';
}

// Day index inside the stay, 1-based. Returns null if not in-house.
// "Night 2 of 4" — nights are computed by day count between check-in
// (inclusive) and check-out (exclusive); see Guesty conventions.
export function computeStayProgress(
  res: ReservationStatusInput | null,
): { current: number; total: number } | null {
  if (!res?.check_in_date || !res?.check_out_date) return null;
  const today = todayCairoIso();
  if (today < res.check_in_date || today > res.check_out_date) return null;
  const ci = Date.parse(res.check_in_date + 'T00:00:00Z');
  const co = Date.parse(res.check_out_date + 'T00:00:00Z');
  const td = Date.parse(today + 'T00:00:00Z');
  const total = Math.max(1, Math.round((co - ci) / 86_400_000));
  const current = Math.max(1, Math.round((td - ci) / 86_400_000) + 1);
  return { current: Math.min(current, total), total };
}

// Short YYYY-MM-DD → "Apr 12" for chip line.
export function fmtShortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// "Apr 12 → Apr 16" for date-span lines.
export function fmtDateRange(
  ci: string | null,
  co: string | null,
): string {
  if (!ci || !co) return '—';
  return `${fmtShortDate(ci)} → ${fmtShortDate(co)}`;
}

// Friendly variant labels for chip text + screen-reader.
export const RESERVATION_VARIANT_LABEL: Record<ReservationVariant, string> = {
  in_house: 'In-house now',
  future: 'Confirmed',
  past: 'Past stay',
  inquiry: 'Inquiry',
  cancelled: 'Cancelled',
  pending_sync: 'Pending sync',
  none: 'No reservation',
};
