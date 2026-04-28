import { CalendarDays, Users, DollarSign, Moon } from 'lucide-react';
import { fmtShortDate } from '@/lib/beithady/communication/reservation-status';
import type { ThreadReservation } from '@/lib/beithady/communication/inbox';

// Q.1 / Q.4 #1 — compact timeline strip under the chip. Renders only
// when we have an actual booking (not for inquiry / cancelled). For
// inquiry / cancelled the chip itself already carries the date range
// so we suppress the strip to avoid duplicate info.

export function ReservationMiniTimeline({ reservation }: { reservation: ThreadReservation | null }) {
  if (!reservation) return null;
  const status = (reservation.status || '').toLowerCase();
  // Only show for actual bookings — see Q.0.2 finding.
  if (!['confirmed', 'reserved', 'checked_in', 'checked_out'].includes(status)) return null;

  const adr =
    reservation.guest_paid && reservation.nights && reservation.nights > 0
      ? Math.round(reservation.guest_paid / reservation.nights)
      : null;

  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-600 dark:text-slate-400">
      <span className="inline-flex items-center gap-1">
        <CalendarDays size={11} />
        {fmtShortDate(reservation.check_in_date)} → {fmtShortDate(reservation.check_out_date)}
      </span>
      {reservation.nights != null && (
        <span className="inline-flex items-center gap-1">
          <Moon size={11} />
          {reservation.nights}n
        </span>
      )}
      {reservation.guests != null && (
        <span className="inline-flex items-center gap-1">
          <Users size={11} />
          {reservation.guests}
        </span>
      )}
      {reservation.guest_paid != null && (
        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
          <DollarSign size={11} />
          {(reservation.currency || '').toUpperCase()} {Math.round(reservation.guest_paid).toLocaleString()}
          {adr && (
            <span className="text-slate-400 dark:text-slate-500 font-normal">
              · {adr.toLocaleString()}/n
            </span>
          )}
        </span>
      )}
      {reservation.confirmation_code && (
        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
          {reservation.platform_confirmation_code || reservation.confirmation_code}
        </span>
      )}
    </div>
  );
}
