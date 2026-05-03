import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, XCircle } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { signedImageUrl } from '@/lib/boat-rental/storage';
import { isWithinCancellationWindow, cairoTodayStr } from '@/lib/boat-rental/pricing';
import { computeBalance } from '@/lib/boat-rental/payment-balance';
import { getDefaultSkipper } from '@/lib/boat-rental/skipper-resolver';
import { TabNav, OWNER_TABS } from '../../../_components/tabs';
import { ClickToContact } from '../../../_components/click-to-contact';
import { RecordPaymentForm } from '../../_components/record-payment-form';
import { cancelReservationOwnerAction } from '../../actions';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Res = any;

type PaymentRow = {
  id: string;
  amount_egp: string | number;
  paid_at: string;
  receipt_path: string | null;
  method: string | null;
  note: string | null;
  recorded_by_role: string | null;
};

export default async function OwnerBookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  const ownerIds = me ? await getOwnedOwnerIds(me) : [];
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, booking_date, status, price_egp_snapshot, pricing_tier_snapshot, notes,
      cancelled_at, cancelled_by_role, cancel_reason, refund_pending,
      source, external_broker_id,
      boat:boat_rental_boats ( id, name, owner_id ),
      broker:app_users!boat_rental_reservations_broker_id_fkey ( id, username ),
      external_broker:boat_rental_external_brokers ( id, name, phone ),
      booking:boat_rental_bookings ( client_name, client_phone, guest_count, trip_ready_time, extra_notes, destination:boat_rental_destinations ( name ) ),
      payments:boat_rental_payments ( id, amount_egp, paid_at, receipt_path, method, note, recorded_by_role )
    `
    )
    .eq('id', id)
    .maybeSingle();
  const r = data as Res | null;
  if (!r) notFound();
  if (!ownerIds.includes(r.boat.owner_id)) notFound();

  const defaultSkipper = await getDefaultSkipper(r.boat.id as string);

  const payments = ((r.payments ?? []) as PaymentRow[]).slice().sort((a, b) =>
    new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime()
  );
  const price = Number(r.price_egp_snapshot);
  const balance = computeBalance(price, payments.map((p) => p.amount_egp));
  const remaining = balance.remaining;
  const totalPaid = balance.total_paid;
  const latestReceiptPath = [...payments].reverse().find((p) => p.receipt_path)?.receipt_path ?? null;
  const receiptUrl = latestReceiptPath ? await signedImageUrl(latestReceiptPath) : null;

  const canCancel = ['held', 'confirmed'].includes(r.status) && isWithinCancellationWindow(r.booking_date);
  const canRecordPayment = ['confirmed', 'details_filled'].includes(r.status) && remaining > 0;

  return (
    <>
      <header className="mb-6 flex items-center gap-2">
        <Link href="/emails/boat-rental/owner/calendar" className="text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
          <ChevronLeft size={14} /> Calendar
        </Link>
      </header>
      <TabNav tabs={OWNER_TABS} currentPath="/emails/boat-rental/owner/calendar" />

      <section className="mt-8 ix-card p-6">
        <h1 className="text-2xl font-bold tracking-tight">{r.boat.name} · {r.booking_date}</h1>
        <div className="mt-1 text-sm">
          Status: <StatusPill status={r.status} />
          {r.refund_pending && (
            <span className="ml-2 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
              Refund pending
            </span>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h2 className="font-semibold mb-2">Booking</h2>
            <div className="text-slate-700">
              Price (net to you):{' '}
              <span className="font-bold tabular-nums">EGP {price.toLocaleString()}</span>{' '}
              <span className="text-xs text-slate-500">({r.pricing_tier_snapshot})</span>
            </div>
            {defaultSkipper && (
              <div className="text-slate-700 mt-1">Skipper: {defaultSkipper.name}</div>
            )}
            {r.notes && (
              <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                <strong>Special requirements:</strong> {r.notes}
              </div>
            )}
          </div>
          <div>
            <h2 className="font-semibold mb-2">Source</h2>
            {r.source === 'external_broker' && r.external_broker ? (
              <div className="text-slate-700">
                External broker · {r.external_broker.name}
                {r.external_broker.phone && (
                  <span className="text-xs text-slate-500"> · {r.external_broker.phone}</span>
                )}
              </div>
            ) : r.source === 'client_direct' ? (
              <div className="text-slate-700">Client direct (owner-created)</div>
            ) : (
              <div className="text-slate-700">Broker · {r.broker?.username || '—'}</div>
            )}
          </div>
        </div>

        {r.booking && (
          <div className="mt-6">
            <h2 className="font-semibold mb-2">Trip details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">Client</div>
                <div className="font-medium">{r.booking.client_name}</div>
                <ClickToContact
                  phone={r.booking.client_phone}
                  whatsappText={`Hi ${r.booking.client_name}, regarding your boat trip on ${r.booking_date}.`}
                  className="mt-1"
                />
              </div>
              <div>
                <div className="text-xs text-slate-500">Guests</div>
                <div>{r.booking.guest_count}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Ready time</div>
                <div>{r.booking.trip_ready_time}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Destination</div>
                <div>{r.booking.destination?.name || '—'}</div>
              </div>
              {r.booking.extra_notes && (
                <div className="md:col-span-2">
                  <div className="text-xs text-slate-500">Broker additional notes</div>
                  <div>{r.booking.extra_notes}</div>
                </div>
              )}
            </div>
          </div>
        )}

        <section className="mt-6">
          <h2 className="font-semibold mb-3">Payments</h2>
          <div className="text-sm grid grid-cols-3 gap-3 mb-3">
            <div>
              <div className="text-xs text-slate-500">Trip price</div>
              <div className="font-medium tabular-nums">EGP {price.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Total received</div>
              <div className="font-medium tabular-nums">EGP {totalPaid.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Remaining</div>
              <div className="font-bold tabular-nums">EGP {remaining.toLocaleString()}</div>
            </div>
          </div>
          {payments.length > 0 ? (
            <ul className="text-sm divide-y divide-slate-100 border-y border-slate-100 mb-3">
              {payments.map((p) => (
                <li key={p.id} className="py-2 flex items-start justify-between gap-3">
                  <div>
                    <div>
                      {new Date(p.paid_at).toLocaleDateString()} ·{' '}
                      <span className="text-slate-500">{p.method ?? '—'}</span>
                      {p.recorded_by_role && (
                        <span className="text-[11px] text-slate-400"> · by {p.recorded_by_role}</span>
                      )}
                    </div>
                    {p.note && <div className="text-xs text-slate-500 mt-0.5">{p.note}</div>}
                  </div>
                  <span className="tabular-nums font-medium">
                    EGP {Number(p.amount_egp).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500 mb-3">No payments yet.</p>
          )}
          {receiptUrl && (
            <a
              href={receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-cyan-700 hover:underline inline-block mb-3"
            >
              View latest receipt →
            </a>
          )}
          {canRecordPayment && (
            <RecordPaymentForm
              reservationId={r.id}
              remaining={remaining}
              todayCairo={cairoTodayStr()}
            />
          )}
        </section>
      </section>

      {canCancel && (
        <section className="mt-6 ix-card p-5 border-rose-200 bg-rose-50/20">
          <h2 className="font-semibold mb-2 text-rose-800 text-sm flex items-center gap-2">
            <XCircle size={14} /> Cancel booking
          </h2>
          <p className="text-xs text-rose-900/70 mb-3">
            Cancellation is allowed up to 72 hours before the booking date (Cairo time).
            If payment was already confirmed, admin will handle the refund manually.
          </p>
          <form action={cancelReservationOwnerAction}>
            <input type="hidden" name="id" value={r.id} />
            <button type="submit" className="inline-flex items-center gap-1 text-sm text-rose-700 hover:text-rose-900">
              <XCircle size={14} /> Cancel this booking
            </button>
          </form>
        </section>
      )}
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    held: 'bg-amber-50 text-amber-700 border-amber-200',
    confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
    details_filled: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    paid_to_owner: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
    expired: 'bg-slate-50 text-slate-500 border-slate-200',
  };
  return (
    <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${map[status] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
      {status}
    </span>
  );
}
