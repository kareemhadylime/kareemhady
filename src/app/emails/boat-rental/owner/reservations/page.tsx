import Link from 'next/link';
import { Ship, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { cairoTodayStr } from '@/lib/boat-rental/pricing';
import { TabNav, OWNER_TABS } from '../../_components/tabs';
import { approveCancellationAction, rejectCancellationAction } from '../actions';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function statusPill(status: string) {
  const map: Record<string, string> = {
    held: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    confirmed: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
    details_filled: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800',
    paid_to_owner: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
    cancelled: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
  };
  return map[status] || 'bg-slate-50 text-slate-600 border-slate-200';
}

export default async function OwnerReservations() {
  const me = await getCurrentUser();
  const ownerIds = me ? await getOwnedOwnerIds(me) : [];
  const sb = supabaseAdmin();

  const { data: boats } = ownerIds.length
    ? await sb.from('boat_rental_boats').select('id').in('owner_id', ownerIds)
    : { data: [] };
  const boatIds = ((boats as Array<{ id: string }> | null) || []).map(b => b.id);

  const today = cairoTodayStr();

  const reservations: Row[] = boatIds.length
    ? (
        ((
          await sb
            .from('boat_rental_reservations')
            .select(
              `
              id, booking_date, status, price_egp_snapshot, notes,
              cancellation_requested_at, cancellation_request_reason, cancellation_request_resolved_at, cancellation_request_role,
              boat:boat_rental_boats ( name ),
              broker:app_users!boat_rental_reservations_broker_id_fkey ( id, username ),
              booking:boat_rental_bookings ( client_name, guest_count, trip_ready_time, destination:boat_rental_destinations ( name ) ),
              payment:boat_rental_payments ( amount_egp, paid_at )
            `
            )
            .in('boat_id', boatIds)
            .order('booking_date', { ascending: false })
            .limit(200)
        ).data) as Row[] | null
      ) || []
    : [];

  const pendingApprovals = reservations.filter(
    r => r.cancellation_requested_at && !r.cancellation_request_resolved_at
  );
  const upcoming = reservations.filter(r =>
    ['confirmed', 'details_filled'].includes(r.status) && r.booking_date >= today
  ).sort((a, b) => a.booking_date.localeCompare(b.booking_date));
  const awaitingPayment = reservations.filter(r =>
    ['confirmed', 'details_filled'].includes(r.status) && r.booking_date < today && !r.payment
  );
  const past = reservations.filter(r =>
    ['paid_to_owner', 'cancelled', 'expired'].includes(r.status)
  ).slice(0, 50);

  return (
    <>
      <header className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-300 shrink-0">
          <Ship size={24} strokeWidth={2.2} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">Owner Portal</p>
          <h1 className="text-3xl font-bold tracking-tight">Reservations</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            All reservations across your boats. Cancellation requests within 72h need your approval.
          </p>
        </div>
      </header>
      <TabNav tabs={OWNER_TABS} currentPath="/emails/boat-rental/owner/reservations" />

      {pendingApprovals.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <AlertTriangle size={14} /> Cancellation requests pending your approval ({pendingApprovals.length})
          </h2>
          <div className="space-y-3">
            {pendingApprovals.map(r => (
              <div key={r.id} className="ix-card p-5 border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/30">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="font-semibold">{r.boat?.name || '(boat)'}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                      {r.booking_date} · EGP {Number(r.price_egp_snapshot).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Broker · {r.broker?.username || '—'}
                      {r.booking?.client_name ? ` · Client · ${r.booking.client_name}` : ''}
                    </p>
                    <p className="text-xs text-amber-800 dark:text-amber-200 mt-2">
                      <strong>Reason:</strong> {r.cancellation_request_reason?.replace(/_/g, ' ') || '—'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Requested {new Date(r.cancellation_requested_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <form action={approveCancellationAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="ix-btn-danger">
                        <CheckCircle2 size={14} /> Approve cancellation
                      </button>
                    </form>
                    <form action={rejectCancellationAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="ix-btn-secondary">
                        <XCircle size={14} /> Reject
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <div className="ix-card p-6 text-sm text-slate-500 dark:text-slate-400 text-center">
            No upcoming reservations.
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map(r => (
              <Link
                key={r.id}
                href={`/emails/boat-rental/owner/booking/${r.id}`}
                className="ix-card p-5 block hover:shadow-md transition"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{r.boat?.name || '(boat)'}</h3>
                      <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${statusPill(r.status)}`}>
                        {r.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                      {r.booking_date} · EGP {Number(r.price_egp_snapshot).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Broker · {r.broker?.username || '—'}
                      {r.booking?.client_name ? ` · ${r.booking.client_name} (${r.booking.guest_count})` : ''}
                    </p>
                    {r.notes && (
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                        <strong>Notes:</strong> {r.notes}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {awaitingPayment.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
            Awaiting payment ({awaitingPayment.length})
          </h2>
          <div className="space-y-2">
            {awaitingPayment.map(r => (
              <Link
                key={r.id}
                href={`/emails/boat-rental/owner/booking/${r.id}`}
                className="ix-card p-4 text-sm block hover:shadow-sm transition"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span className="font-medium">{r.boat?.name || '(boat)'}</span>
                    <span className="text-slate-500 dark:text-slate-400"> · {r.booking_date}</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    EGP {Number(r.price_egp_snapshot).toLocaleString()}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
            Past
          </h2>
          <div className="space-y-2">
            {past.map(r => (
              <Link
                key={r.id}
                href={`/emails/boat-rental/owner/booking/${r.id}`}
                className="ix-card p-4 text-sm block hover:shadow-sm transition"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span className="font-medium">{r.boat?.name || '(boat)'}</span>
                    <span className="text-slate-500 dark:text-slate-400"> · {r.booking_date}</span>
                    <span className={`ml-2 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${statusPill(r.status)}`}>
                      {r.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    EGP {Number(r.price_egp_snapshot).toLocaleString()}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
