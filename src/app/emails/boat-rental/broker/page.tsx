import Link from 'next/link';
import { Ship, Calendar as CalendarIcon, Receipt } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { cairoTodayStr, isWithinCancellationWindow } from '@/lib/boat-rental/pricing';
import { TabNav, BROKER_TABS } from '../_components/tabs';
import { CancelReservationButton } from './_components/cancel-reservation';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  booking_date: string;
  status: string;
  price_egp_snapshot: string | number;
  notes: string | null;
  cancellation_requested_at: string | null;
  cancellation_request_resolved_at: string | null;
  cancellation_request_resolution: string | null;
  boat: { name: string; owner: { name: string } | null } | null;
  booking: { client_name: string; guest_count: number; trip_ready_time: string; destination: { name: string } | null } | null;
  payment: { amount_egp: string | number; paid_at: string } | null;
};

function statusPill(status: string) {
  const map: Record<string, string> = {
    held: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    confirmed: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
    details_filled: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800',
    paid_to_owner: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
    cancelled: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
    expired: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  };
  return map[status] || 'bg-slate-50 text-slate-600 border-slate-200';
}

export default async function BrokerLanding() {
  const me = await getCurrentUser();
  const sb = supabaseAdmin();
  const today = cairoTodayStr();
  const { data } = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, booking_date, status, price_egp_snapshot, notes,
      cancellation_requested_at, cancellation_request_resolved_at, cancellation_request_resolution,
      boat:boat_rental_boats ( name, owner:boat_rental_owners ( name ) ),
      booking:boat_rental_bookings ( client_name, guest_count, trip_ready_time, destination:boat_rental_destinations ( name ) ),
      payment:boat_rental_payments ( amount_egp, paid_at )
    `
    )
    .eq('broker_id', me!.id)
    .order('booking_date', { ascending: false })
    .limit(200);
  const rows = ((data as unknown) as Row[] | null) || [];

  const tomorrow = (() => {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const upcoming = rows.filter(r =>
    ['confirmed', 'details_filled'].includes(r.status) && r.booking_date >= today
  ).sort((a, b) => a.booking_date.localeCompare(b.booking_date));

  const awaitingPayment = rows.filter(r =>
    ['confirmed', 'details_filled'].includes(r.status) && r.booking_date < today && !r.payment
  );

  const past = rows.filter(r =>
    ['paid_to_owner', 'cancelled', 'expired'].includes(r.status)
  ).slice(0, 50);

  return (
    <>
      <header className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-300 shrink-0">
          <Ship size={24} strokeWidth={2.2} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">Broker Portal</p>
          <h1 className="text-3xl font-bold tracking-tight">Reservations</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Your active reservations with state-aware actions per row.
          </p>
        </div>
      </header>
      <TabNav tabs={BROKER_TABS} currentPath="/emails/boat-rental/broker" />

      {awaitingPayment.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-rose-700 dark:text-rose-300 uppercase tracking-wide mb-3">
            Awaiting payment confirmation ({awaitingPayment.length})
          </h2>
          <div className="space-y-3">
            {awaitingPayment.map(r => (
              <div key={r.id} className="ix-card p-5 border-rose-200 dark:border-rose-800 bg-rose-50/30 dark:bg-rose-950/20">
                <Card row={r} today={today} tomorrow={tomorrow} bucket="awaiting" />
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
            No upcoming reservations. Use Inquire to find availability.
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map(r => (
              <div key={r.id} className="ix-card p-5">
                <Card row={r} today={today} tomorrow={tomorrow} bucket="upcoming" />
              </div>
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
            Past
          </h2>
          <div className="space-y-2">
            {past.map(r => (
              <div key={r.id} className="ix-card p-4 text-sm">
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
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Card({
  row, today, tomorrow, bucket,
}: {
  row: Row;
  today: string;
  tomorrow: string;
  bucket: 'upcoming' | 'awaiting';
}) {
  const r = row;
  const needsDetails = r.status === 'confirmed' && r.booking_date >= today;
  const needsDetailsTomorrow = needsDetails && r.booking_date === tomorrow;
  const requiresOwnerApproval = !isWithinCancellationWindow(r.booking_date);
  const hasPendingRequest =
    !!r.cancellation_requested_at && !r.cancellation_request_resolved_at;
  const wasRejected =
    !!r.cancellation_requested_at &&
    !!r.cancellation_request_resolved_at &&
    (r.cancellation_request_resolution || '').startsWith('rejected');

  return (
    <>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold">{r.boat?.name || '(boat)'}</h3>
            <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${statusPill(r.status)}`}>
              {r.status}
            </span>
            {needsDetailsTomorrow && (
              <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                Trip tomorrow — fill details
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            {r.booking_date} · EGP {Number(r.price_egp_snapshot).toLocaleString()} · 10AM → sunset
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Owner · {r.boat?.owner?.name || '—'}
            {r.booking?.client_name ? ` · Client · ${r.booking.client_name} (${r.booking.guest_count} guests)` : ''}
            {r.booking?.destination?.name ? ` · ${r.booking.destination.name}` : ''}
            {r.booking?.trip_ready_time ? ` · Ready ${r.booking.trip_ready_time}` : ''}
          </p>
          {r.notes && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              <strong>Notes:</strong> {r.notes}
            </p>
          )}
          {wasRejected && (
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-1">
              Owner rejected your earlier cancellation request.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {needsDetails && (
            <Link href={`/emails/boat-rental/broker/trip/${r.id}`} className="ix-btn-secondary">
              <CalendarIcon size={14} /> Trip details
            </Link>
          )}
          {bucket === 'awaiting' && (
            <Link href="/emails/boat-rental/broker/payments" className="ix-btn-primary">
              <Receipt size={14} /> Payment
            </Link>
          )}
          <CancelReservationButton
            reservationId={r.id}
            status={r.status}
            requiresOwnerApproval={requiresOwnerApproval}
            pendingRequest={hasPendingRequest}
          />
        </div>
      </div>
    </>
  );
}
