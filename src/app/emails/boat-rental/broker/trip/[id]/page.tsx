import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, Send } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { fillTripDetailsAction } from '../../actions';
import { TabNav, BROKER_TABS } from '../../../_components/tabs';

export const dynamic = 'force-dynamic';

type Res = {
  id: string;
  status: string;
  broker_id: string;
  booking_date: string;
  price_egp_snapshot: string | number;
  notes: string | null;
  boat: { name: string; capacity_guests: number; skipper_name: string; owner: { name: string } | null } | null;
  booking:
    | {
        client_name: string;
        client_phone: string;
        guest_count: number;
        trip_ready_time: string;
        destination_id: string;
        extra_notes: string | null;
        skipper_collects_cash: boolean | null;
        skipper_instructions: string | null;
      }
    | null;
};

export default async function BrokerTripDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  const sb = supabaseAdmin();
  const { data: resRow } = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, status, broker_id, booking_date, price_egp_snapshot, notes,
      boat:boat_rental_boats ( name, capacity_guests, skipper_name, owner:boat_rental_owners ( name ) ),
      booking:boat_rental_bookings ( client_name, client_phone, guest_count, trip_ready_time, destination_id, extra_notes, skipper_collects_cash, skipper_instructions )
    `
    )
    .eq('id', id)
    .maybeSingle();
  const r = (resRow as unknown) as Res | null;
  if (!r) notFound();
  if (r.broker_id !== me!.id) redirect('/emails/boat-rental/broker');
  if (!['confirmed', 'details_filled'].includes(r.status)) redirect('/emails/boat-rental/broker');

  const { data: destRaw } = await sb
    .from('boat_rental_destinations')
    .select('id, name')
    .eq('active', true)
    .order('name');
  const destinations = ((destRaw as unknown) as Array<{ id: string; name: string }> | null) || [];

  return (
    <>
      <header className="mb-6 flex items-center gap-2">
        <Link href="/emails/boat-rental/broker" className="text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
          <ChevronLeft size={14} /> My Bookings
        </Link>
      </header>
      <TabNav tabs={BROKER_TABS} currentPath="/emails/boat-rental/broker" />

      <section className="mt-8 ix-card p-6">
        <h1 className="text-2xl font-bold tracking-tight">Enter Trip Details</h1>
        <div className="text-sm text-slate-600 mt-1">
          <strong>{r.boat?.name || '(boat)'}</strong> · {r.booking_date} · Owner · {r.boat?.owner?.name || '—'}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          Boat capacity: {r.boat?.capacity_guests || '—'} guests · Skipper: {r.boat?.skipper_name || '—'}
        </div>
        {r.notes && (
          <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
            <strong>Special requirements from confirmation:</strong> {r.notes}
          </div>
        )}

        <form action={fillTripDetailsAction} className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input type="hidden" name="id" value={id} />
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Client name *</span>
            <input
              name="client_name"
              required
              defaultValue={r.booking?.client_name || ''}
              className="ix-input mt-1"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Client phone *</span>
            <input
              name="client_phone"
              type="tel"
              inputMode="tel"
              required
              defaultValue={r.booking?.client_phone || ''}
              className="ix-input mt-1"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">
              Guest count * (max {r.boat?.capacity_guests || '—'})
            </span>
            <input
              name="guest_count"
              type="number"
              inputMode="numeric"
              min="1"
              max={r.boat?.capacity_guests || 50}
              required
              defaultValue={r.booking?.guest_count ?? ''}
              className="ix-input mt-1"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Trip ready time *</span>
            <input
              name="trip_ready_time"
              type="time"
              required
              defaultValue={r.booking?.trip_ready_time || '09:00'}
              className="ix-input mt-1"
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="text-slate-600 text-xs">Destination *</span>
            <select
              name="destination_id"
              required
              defaultValue={r.booking?.destination_id || ''}
              className="ix-input mt-1"
            >
              <option value="">Select destination…</option>
              {destinations.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            <span className="text-slate-600 text-xs">Additional notes (optional)</span>
            <textarea
              name="extra_notes"
              rows={2}
              defaultValue={r.booking?.extra_notes || ''}
              className="ix-input mt-1"
              placeholder="Anything to add on top of the earlier confirmation notes."
            />
          </label>

          {/* Skipper-collects-cash option (broker can toggle until trip happens). */}
          <fieldset className="md:col-span-2 mt-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/30 p-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200 px-1">
              Payment collection
            </legend>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="skipper_collects_cash"
                value="1"
                defaultChecked={!!r.booking?.skipper_collects_cash}
                className="mt-1 h-4 w-4 accent-amber-500"
              />
              <span className="text-sm">
                <span className="font-semibold text-amber-900 dark:text-amber-100">
                  Skipper will collect EGP {Number(r.price_egp_snapshot).toLocaleString()} cash from client before boarding
                </span>
                <span className="block text-xs text-amber-800/80 dark:text-amber-200/70 mt-0.5">
                  Moves payment responsibility to the skipper &amp; owner. Owner gets cash on the dock — no broker
                  transfer required. Payment Confirmation will mark this trip as &ldquo;collected on board&rdquo; once the
                  booking date passes.
                </span>
              </span>
            </label>
            <label className="text-sm block mt-3">
              <span className="text-slate-600 dark:text-slate-300 text-xs">
                Instructions to skipper (optional — included in the Arabic WhatsApp)
              </span>
              <textarea
                name="skipper_instructions"
                rows={2}
                defaultValue={r.booking?.skipper_instructions || ''}
                className="ix-input mt-1"
                placeholder="e.g. Client will pay in 1000 EGP notes; bring change. Pickup at the dock gate at 9:45."
              />
            </label>
          </fieldset>

          <div className="md:col-span-2 flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-slate-500">
              Submitting will send a WhatsApp confirmation to the owner &amp; broker (English) and the skipper (Arabic).
            </p>
            <button type="submit" className="ix-btn-primary">
              <Send size={14} /> Submit & notify skipper
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
