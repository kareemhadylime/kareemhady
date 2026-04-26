import 'server-only';
import type { ReportPeriodWindow } from './cairo-dates';
import type { ReservationRow } from './reservations';

// No-show alert (S2): of yesterday's confirmed reservations
// (check_in_date = yesterday), how many never transitioned to
// status='checked_in' / 'checked_out'?
//
// Note: reservation status is "confirmed" right up until the guest
// physically checks in; Guesty/PMS flips to checked_in after that.
// So a no-show ≈ check_in_date=yesterday AND status='confirmed'
// AND (now > check_out_date for stays that should have ended,
//      OR now > check_in_date+24h for ongoing).

export type NoShowSection = {
  expected: number;
  checked_in: number;
  no_shows: Array<{
    code: string | null;
    unit: string;
    guest: string | null;
    channel: string;
  }>;
};

export function buildNoShowSection(
  active: ReservationRow[],
  ctx: ReportPeriodWindow
): NoShowSection {
  const yesterday = ctx.yesterday;
  let expected = 0;
  let checkedIn = 0;
  const no_shows: NoShowSection['no_shows'] = [];

  for (const r of active) {
    if (r.check_in_date !== yesterday) continue;
    if (!r.status) continue;
    expected += 1;
    if (r.status === 'checked_in' || r.status === 'checked_out') {
      checkedIn += 1;
    } else if (r.status === 'confirmed') {
      // Still listed as confirmed past check-in date → no-show
      no_shows.push({
        code: r.confirmation_code,
        unit: r.listing_nickname || r.listing_id || 'Unknown',
        guest: r.guest_name,
        channel: normalizeChannel(r.source),
      });
    }
  }

  return { expected, checked_in: checkedIn, no_shows };
}

function normalizeChannel(source: string | null): string {
  const raw = String(source || '').trim().toLowerCase();
  if (!raw) return 'Direct';
  if (raw.includes('airbnb')) return 'Airbnb';
  if (raw.includes('booking')) return 'Booking.com';
  if (raw === 'manual' || raw === 'direct' || raw.includes('direct')) return 'Direct';
  return raw.replace(/\b\w/g, c => c.toUpperCase());
}
