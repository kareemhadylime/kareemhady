import Link from 'next/link';
import { Receipt, Upload, ChevronRight, ArrowLeft, AlertTriangle } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { cairoTodayStr } from '@/lib/boat-rental/pricing';
import { signedImageUrls } from '@/lib/boat-rental/storage';
import { TabNav, BROKER_TABS } from '../../_components/tabs';
import { uploadReceiptAction } from '../actions';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  booking_date: string;
  status: string;
  price_egp_snapshot: string | number;
  boat: { name: string; owner: { name: string } | null } | null;
  booking: { client_name: string } | null;
  payment: { amount_egp: string | number; paid_at: string; receipt_path: string | null } | null;
};

type SearchParams = Promise<{ id?: string }>;

// Step-by-step UX:
//   1. (no ?id) Show list of pending reservations to choose from
//   2. (?id=...) Show selected reservation details + the upload form

export default async function BrokerPayments({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const selectedId = sp.id;
  const me = await getCurrentUser();
  const sb = supabaseAdmin();
  const today = cairoTodayStr();

  // Pending: trips whose booking date is today or earlier AND not yet paid_to_owner.
  const pendingRes = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, booking_date, status, price_egp_snapshot,
      boat:boat_rental_boats ( name, owner:boat_rental_owners ( name ) ),
      booking:boat_rental_bookings ( client_name ),
      payment:boat_rental_payments ( amount_egp, paid_at, receipt_path )
    `
    )
    .eq('broker_id', me!.id)
    .in('status', ['confirmed', 'details_filled'])
    .lte('booking_date', today)
    .order('booking_date', { ascending: false });
  const pending = ((pendingRes.data as unknown) as Row[] | null) || [];

  const doneRes = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, booking_date, status, price_egp_snapshot,
      boat:boat_rental_boats ( name, owner:boat_rental_owners ( name ) ),
      booking:boat_rental_bookings ( client_name ),
      payment:boat_rental_payments ( amount_egp, paid_at, receipt_path )
    `
    )
    .eq('broker_id', me!.id)
    .eq('status', 'paid_to_owner')
    .order('booking_date', { ascending: false })
    .limit(20);
  const done = ((doneRes.data as unknown) as Row[] | null) || [];
  const doneReceiptUrls = await signedImageUrls(done.map(r => r.payment?.receipt_path || null));

  // If a specific id is in the URL, render Step 2.
  const selected = selectedId ? pending.find(r => r.id === selectedId) : undefined;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Payment Confirmation</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          After the trip, transfer the net-to-owner amount and upload the receipt.
        </p>
      </header>
      <TabNav tabs={BROKER_TABS} currentPath="/emails/boat-rental/broker/payments" />

      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-2 text-xs">
        <Step n={1} label="Choose reservation" active={!selected} done={!!selected} />
        <ChevronRight size={12} className="text-slate-400" />
        <Step n={2} label="Enter amount + receipt" active={!!selected} done={false} />
        <ChevronRight size={12} className="text-slate-400" />
        <Step n={3} label="Submit" active={false} done={false} />
      </div>

      {!selected && (
        <>
          <section>
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
              Reservations pending payment ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <div className="ix-card p-8 text-sm text-slate-500 dark:text-slate-400 text-center">
                No reservations are awaiting payment confirmation right now.
              </div>
            ) : (
              <div className="space-y-3">
                {pending.map(r => (
                  <Link
                    key={r.id}
                    href={`?id=${r.id}`}
                    className="group ix-card p-5 block hover:shadow-md hover:border-cyan-300 dark:hover:border-cyan-700 transition"
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h3 className="font-semibold">{r.boat?.name || '(boat)'}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                          {r.booking_date} · Owner · {r.boat?.owner?.name || '—'}
                          {r.booking?.client_name ? ` · Client · ${r.booking.client_name}` : ''}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Amount due to owner:{' '}
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            EGP {Number(r.price_egp_snapshot).toLocaleString()}
                          </span>
                        </p>
                      </div>
                      <div className="ix-btn-secondary group-hover:border-cyan-400">
                        <Receipt size={14} /> Confirm payment
                        <ChevronRight size={14} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {done.length > 0 && (
            <section className="mt-10">
              <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                Recent transfers
              </h2>
              <div className="space-y-2">
                {done.map((r, i) => (
                  <div key={r.id} className="ix-card p-4 text-sm flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <span className="font-medium">{r.boat?.name || '(boat)'}</span>
                      <span className="text-slate-500 dark:text-slate-400"> · {r.booking_date}</span>
                      {r.payment && (
                        <span className="text-slate-500 dark:text-slate-400 ml-2">
                          · EGP {Number(r.payment.amount_egp).toLocaleString()} paid{' '}
                          {new Date(r.payment.paid_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {doneReceiptUrls[i] && (
                      <a
                        href={doneReceiptUrls[i] as string}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-cyan-700 dark:text-cyan-300 hover:underline inline-flex items-center gap-1"
                      >
                        <Receipt size={12} /> View receipt
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {selected && (
        <section>
          <Link
            href="/emails/boat-rental/broker/payments"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-300 mb-4"
          >
            <ArrowLeft size={14} /> Back to pending list
          </Link>

          <div className="ix-card p-6">
            <div className="mb-5 pb-5 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Receipt size={18} className="text-cyan-600 dark:text-cyan-300" />
                Confirm payment for {selected.boat?.name || '(boat)'}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                {selected.booking_date} · Owner · {selected.boat?.owner?.name || '—'}
                {selected.booking?.client_name ? ` · Client · ${selected.booking.client_name}` : ''}
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-2 tabular-nums">
                Amount due to owner: EGP {Number(selected.price_egp_snapshot).toLocaleString()}
              </p>
            </div>

            <form action={uploadReceiptAction} encType="multipart/form-data" className="space-y-4">
              <input type="hidden" name="id" value={selected.id} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm block">
                  <span className="text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wide">
                    Step 1 · Transferred amount (EGP) *
                  </span>
                  <input
                    name="amount_egp"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    required
                    defaultValue={Number(selected.price_egp_snapshot)}
                    className="ix-input mt-1"
                  />
                </label>
                <label className="text-sm block">
                  <span className="text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wide">
                    Method
                  </span>
                  <select name="method" className="ix-input mt-1">
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="instapay">Instapay</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>

              <label className="text-sm block">
                <span className="text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wide">
                  Step 2 · Upload payment receipt *
                </span>
                <input
                  name="receipt"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  capture="environment"
                  required
                  className="ix-input mt-1 cursor-pointer"
                />
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  JPG, PNG, WEBP, or PDF — 10MB max. On mobile this opens the camera by default.
                </span>
              </label>

              <label className="text-sm block">
                <span className="text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wide">
                  Optional note
                </span>
                <input name="note" className="ix-input mt-1" placeholder="Reference number, anything to add…" />
              </label>

              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  Submitting will mark this reservation paid and notify the owner via WhatsApp. Make sure the amount and
                  receipt are correct.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Link href="/emails/boat-rental/broker/payments" className="ix-btn-ghost">
                  Cancel
                </Link>
                <button type="submit" className="ix-btn-primary">
                  <Upload size={14} /> Step 3 · Confirm &amp; notify owner
                </button>
              </div>
            </form>
          </div>
        </section>
      )}
    </>
  );
}

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  const tint = active
    ? 'bg-cyan-600 text-white border-cyan-600'
    : done
      ? 'bg-emerald-600 text-white border-emerald-600'
      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
  const text = active ? 'text-cyan-700 dark:text-cyan-300 font-semibold' : 'text-slate-500 dark:text-slate-400';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold border ${tint}`}>
        {done ? '✓' : n}
      </span>
      <span className={text}>{label}</span>
    </span>
  );
}
