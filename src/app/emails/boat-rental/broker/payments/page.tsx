import { Receipt, Upload } from 'lucide-react';
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
  payment: { amount_egp: string | number; paid_at: string; receipt_path: string | null } | null;
};

export default async function BrokerPayments() {
  const me = await getCurrentUser();
  const sb = supabaseAdmin();
  const today = cairoTodayStr();

  // Pending: trips whose booking date is today or in the past AND not yet paid_to_owner.
  // Include both 'details_filled' (normal flow) and 'confirmed' (broker forgot to fill details before trip).
  const pendingRes = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, booking_date, status, price_egp_snapshot,
      boat:boat_rental_boats ( name, owner:boat_rental_owners ( name ) ),
      payment:boat_rental_payments ( amount_egp, paid_at, receipt_path )
    `
    )
    .eq('broker_id', me!.id)
    .in('status', ['confirmed', 'details_filled'])
    .lte('booking_date', today)
    .order('booking_date', { ascending: false });

  // Done: historical paid_to_owner rows for reference (last 20).
  const doneRes = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, booking_date, status, price_egp_snapshot,
      boat:boat_rental_boats ( name, owner:boat_rental_owners ( name ) ),
      payment:boat_rental_payments ( amount_egp, paid_at, receipt_path )
    `
    )
    .eq('broker_id', me!.id)
    .eq('status', 'paid_to_owner')
    .order('booking_date', { ascending: false })
    .limit(20);

  const pending = ((pendingRes.data as unknown) as Row[] | null) || [];
  const done = ((doneRes.data as unknown) as Row[] | null) || [];

  const doneReceiptUrls = await signedImageUrls(
    done.map(r => r.payment?.receipt_path || null)
  );

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Payment Confirmation</h1>
        <p className="text-sm text-slate-500 mt-1">
          After the trip, transfer the net-to-owner amount and upload the receipt here.
        </p>
      </header>
      <TabNav tabs={BROKER_TABS} currentPath="/emails/boat-rental/broker/payments" />

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Awaiting transfer</h2>
        {pending.length === 0 ? (
          <div className="ix-card p-6 text-sm text-slate-500 text-center">No pending transfers.</div>
        ) : (
          <div className="space-y-3">
            {pending.map(r => (
              <div key={r.id} className="ix-card p-5">
                <div className="mb-4">
                  <h3 className="font-semibold">{r.boat?.name || '(boat)'}</h3>
                  <p className="text-sm text-slate-600 mt-0.5">
                    {r.booking_date} · Owner · {r.boat?.owner?.name || '—'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Amount due to owner: EGP {Number(r.price_egp_snapshot).toLocaleString()}
                  </p>
                </div>
                <form action={uploadReceiptAction} encType="multipart/form-data" className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input type="hidden" name="id" value={r.id} />
                  <label className="text-sm">
                    <span className="text-slate-600 text-xs">Transferred amount (EGP) *</span>
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
                    <select name="method" className="ix-input mt-1">
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="instapay">Instapay</option>
                      <option value="cash">Cash</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="text-slate-600 text-xs">Receipt file (JPG/PNG/WEBP/PDF, 10MB max) *</span>
                    <input
                      name="receipt"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      required
                      className="ix-input mt-1 cursor-pointer"
                    />
                  </label>
                  <label className="text-sm md:col-span-3">
                    <span className="text-slate-600 text-xs">Note</span>
                    <input name="note" className="ix-input mt-1" />
                  </label>
                  <div className="md:col-span-3">
                    <button type="submit" className="ix-btn-primary">
                      <Upload size={14} /> Upload & notify owner
                    </button>
                  </div>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      {done.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Recent transfers</h2>
          <div className="space-y-2">
            {done.map((r, i) => (
              <div key={r.id} className="ix-card p-4 text-sm flex items-center justify-between gap-3">
                <div>
                  <span className="font-medium">{r.boat?.name || '(boat)'}</span>
                  <span className="text-slate-500"> · {r.booking_date}</span>
                  {r.payment && (
                    <span className="text-slate-500 ml-2">
                      · EGP {Number(r.payment.amount_egp).toLocaleString()} paid {new Date(r.payment.paid_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {doneReceiptUrls[i] && (
                  <a
                    href={doneReceiptUrls[i] as string}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-cyan-700 hover:underline inline-flex items-center gap-1"
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
  );
}
