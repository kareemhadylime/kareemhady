import Link from 'next/link';
import {
  Home, CalendarCheck, CalendarX, History, MessageSquareQuote, Loader2, ExternalLink,
} from 'lucide-react';
import {
  computeReservationVariant, computeStayProgress, fmtShortDate, fmtDateRange,
  type ReservationVariant,
} from '@/lib/beithady/communication/reservation-status';
import type { ThreadReservation } from '@/lib/beithady/communication/inbox';

// Q.1 — Reservation status chip in the right-panel header. Surfaces the
// guest's booking state at a glance:
//   🟢 IN-HOUSE NOW · pulse  →  🔵 Confirmed (future)  →  ⚪ Past
//   🟡 Inquiry (requested dates)  →  ❌ Cancelled  →  ❓ No reservation
// Click → opens the existing 10-tab reservation drawer on the calendar
// page (preserves the inbox sidebar selection in returnTo).

const VARIANT_CLASSES: Record<ReservationVariant, string> = {
  in_house:
    'bg-emerald-500 text-white dark:bg-emerald-600 dark:text-white shadow-sm animate-pulse',
  future:
    'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  past:
    'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  inquiry:
    'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
  cancelled:
    'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100',
  pending_sync:
    'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  none:
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const VARIANT_ICONS: Record<ReservationVariant, React.ComponentType<{ size?: number }>> = {
  in_house: Home,
  future: CalendarCheck,
  past: History,
  inquiry: MessageSquareQuote,
  cancelled: CalendarX,
  pending_sync: Loader2,
  none: MessageSquareQuote,
};

export function ReservationStatusChip({
  reservation,
  hasReservationId,
}: {
  reservation: ThreadReservation | null;
  hasReservationId: boolean;
}) {
  const variant = computeReservationVariant(
    reservation
      ? {
          status: reservation.status,
          check_in_date: reservation.check_in_date,
          check_out_date: reservation.check_out_date,
        }
      : null,
    hasReservationId,
  );
  if (variant === 'none') return null;
  const Icon = VARIANT_ICONS[variant];
  const cls = VARIANT_CLASSES[variant];

  let label = '';
  switch (variant) {
    case 'in_house': {
      const p = computeStayProgress({
        status: reservation!.status,
        check_in_date: reservation!.check_in_date,
        check_out_date: reservation!.check_out_date,
      });
      label = p ? `IN-HOUSE NOW · Night ${p.current} of ${p.total}` : 'IN-HOUSE NOW';
      break;
    }
    case 'future':
      label = `Confirmed · arrives ${fmtShortDate(reservation!.check_in_date)}${
        reservation!.nights ? ` · ${reservation!.nights}n` : ''
      }`;
      break;
    case 'past':
      label = `Past stay · ${fmtDateRange(reservation!.check_in_date, reservation!.check_out_date)}`;
      break;
    case 'inquiry':
      label = `Inquiry · wants ${fmtDateRange(reservation!.check_in_date, reservation!.check_out_date)}`;
      break;
    case 'cancelled':
      label = `Cancelled · was ${fmtDateRange(reservation!.check_in_date, reservation!.check_out_date)}`;
      break;
    case 'pending_sync':
      label = 'Reservation syncing…';
      break;
  }

  // The 10-tab calendar drawer reads ?reservation=<id> on
  // /beithady/operations/calendar — wired in Phase G.
  const href = reservation?.id
    ? `/beithady/operations/calendar?reservation=${reservation.id}`
    : null;

  const inner = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold px-2.5 py-1 text-[11px] uppercase tracking-wide ${cls}`}
      title={label}
    >
      <Icon size={12} />
      {label}
      {href && <ExternalLink size={10} className="opacity-60" />}
    </span>
  );

  if (!href) return inner;
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:opacity-90 transition"
      title="Open full reservation detail"
    >
      {inner}
    </Link>
  );
}
