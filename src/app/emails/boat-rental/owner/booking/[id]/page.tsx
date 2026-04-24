import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, CheckCircle2, XCircle, Phone, MessageCircle } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { signedImageUrl } from '@/lib/boat-rental/storage';
import { isWithinCancellationWindow } from '@/lib/boat-rental/pricing';
import { TabNav, OWNER_TABS } from '../../../_components/tabs';
import { markPaidManuallyAction, cancelReservationOwnerAction } from '../../actions';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Res = any;

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
      boat:boat_rental_boats ( name, owner_id, skipper_name ),
      broker:app_users!boat_rental_reservations_broker_id_fkey ( id, username ),
      booking:boat_rental_bookings ( client_name, client_phone, guest_count, trip_ready_time, extra_notes, destination:boat_rental_destinations ( name ) ),
      payment:boat_rental_payments ( amount_egp, paid_at, receipt_path, method, note, recorded_by_role )
    `
    )
    .eq('id', id)
    .maybeSingle();
  const r = data as Res | null;
  if (!r) notFound();
  if (!ownerIds.includes(r.boat.owner_id)) notFound();

  const receiptUrl = r.payment?.receipt_path ? await signedImageUrl(r.payment.receipt_path) : null;
  const canCancel = ['held', 'confirmed'].includes(r.status) && isWithinCancellationWindow(r.booking_date);
  const canMarkPaid = ['confirmed', 'details_filled'].includes(r.status);

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
            <div className="text-slate-700">Price (net to you): <span className="font-bold tabular-nums">EGP {Number(r.price_egp_snapshot).toLocaleString()}</span> <span className="text-xs text-slate-500">({r.pricing_tier_snapshot})</span></div>
            <div className="text-slate-700 mt-1">Skipper: {r.boat.skipper_name}</div>
            {r.notes && (
              <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                <strong>Special requirements:</strong> {r.notes}
              </div>
            )}
          </div>
          <div>
            <h2 className="font-semibold mb-2">Broker</h2>
            <div className="text-slate-700">{r.broker?.username || '—'}</div>
          </div>
        </div>

        {r.booking && (
          <div className="mt-6">
            <h2 className="font-semibold mb-2">Trip details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">Client</div>
                <div className="flex items-center gap-2">
                  {r.booking.client_name}
                  <a
                    href={`tel:${r.booking.client_phone}`}
                    title="Call"
                    className="text-slate-500 hover:text-slate-900"
                  >
                    <Phone size={12} />
                  </a>
                  <a
                    href={`https://wa.me/${r.booking.client_phone.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    title="WhatsApp"
                    className="text-emerald-600 hover:text-emerald-800"
                  >
                    <MessageCircle size={12} />
                  </a>
                </div>
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

        {r.payment && (
          <div className="mt-6">
            <h2 className="font-semibold mb-2">Payment</h2>
            <div className="text-sm text-slate-700">
              EGP {Number(r.payment.amount_egp).toLocaleString()} on{' '}
              {new Date(r.payment.paid_at).toLocaleString()} · {r.payment.method || '—'} · recorded by {r.payment.recorded_by_role}
            </div>
            {r.payment.note && <div className="text-xs text-slate-500 mt-1">Note: {r.payment.note}</div>}
            {receiptUrl && (
              <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-cyan-700 hover:underline mt-2 inline-block">
                View receipt →
              </a>
            )}
          </div>
        )}
      </section>

      {canMarkPaid && (
        <section className="mt-6 ix-card p-6 border-emerald-200 bg-emerald-50/30">
          <h2 className="font-semibold mb-2 text-emerald-900 flex items-center gap-2">
            <CheckCircle2 size={16} /> Mark as paid manually
          </h2>
          <p className="text-xs text-emerald-900/80 mb-3">
            Use this if you&apos;ve received the transfer directly from the broker (cash, Instapay, etc.) and they haven&apos;t uploaded a receipt.
          </p>
          <form action={markPaidManuallyAction} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="hidden" name="id" value={r.id} />
            <label className="text-sm">
              <span className="text-slate-600 text-xs">Amount received (EGP) *</span>
              <input
                name="amount_egp"
                type="number"
                min="0"
                step="1"
                required
                defaultValue={Number(r.price_egp_snapshot)}
                className="ix-input mt-1"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-600 text-xs">Method</span>
              <select name="method" className="ix-input mt-1" defaultValue="manual_override">
                <option value="manual_override">Manual override</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="instapay">Instapay</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="text-slate-600 text-xs">Note</span>
              <input name="note" className="ix-input mt-1" />
            </label>
            <div className="md:col-span-3">
              <button type="submit" className="ix-btn-primary">
                <CheckCircle2 size={14} /> Confirm received
              </button>
            </div>
          </form>
        </section>
      )}

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
