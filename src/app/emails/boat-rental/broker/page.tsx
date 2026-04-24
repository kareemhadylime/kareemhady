import Link from 'next/link';
import { Ship, Calendar, ChevronRight } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { cairoTodayStr } from '@/lib/boat-rental/pricing';
import { TabNav, BROKER_TABS } from '../_components/tabs';
import { cancelReservationBrokerAction } from './actions';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  booking_date: string;
  status: string;
  price_egp_snapshot: string | number;
  notes: string | null;
  boat: { name: string; owner: { name: string } | null } | null;
  booking: { client_name: string; guest_count: number; trip_ready_time: string; destination: { name: string } | null } | null;
};

function statusPill(status: string) {
  const map: Record<string, string> = {
    held: 'bg-amber-50 text-amber-700 border-amber-200',
    confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
    details_filled: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    paid_to_owner: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
    expired: 'bg-slate-50 text-slate-500 border-slate-200',
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
      boat:boat_rental_boats ( name, owner:boat_rental_owners ( name ) ),
      booking:boat_rental_bookings ( client_name, guest_count, trip_ready_time, destination:boat_rental_destinations ( name ) )
    `
    )
    .eq('broker_id', me!.id)
    .order('booking_date', { ascending: false })
    .limit(200);
  const rows = ((data as unknown) as Row[] | null) || [];

  const upcoming = rows.filter(r =>
    ['confirmed', 'details_filled'].includes(r.status) && r.booking_date >= today
  ).sort((a, b) => a.booking_date.localeCompare(b.booking_date));
  const past = rows.filter(r =>
    ['paid_to_owner', 'cancelled', 'expired'].includes(r.status) || (r.booking_date < today && ['confirmed', 'details_filled'].includes(r.status))
  );
  const tomorrow = (() => {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <>
      <header className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-cyan-50 text-cyan-600">
          <Ship size={24} strokeWidth={2.2} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Broker Portal</p>
          <h1 className="text-3xl font-bold tracking-tight">My Bookings</h1>
        </div>
      </header>
      <TabNav tabs={BROKER_TABS} currentPath="/emails/boat-rental/broker" />

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Upcoming</h2>
        {upcoming.length === 0 ? (
          <div className="ix-card p-6 text-sm text-slate-500 text-center">No upcoming bookings.</div>
        ) : (
          <div className="space-y-3">
            {upcoming.map(r => {
              const needsDetailsTomorrow = r.status === 'confirmed' && r.booking_date === tomorrow;
              const needsDetails = r.status === 'confirmed' && r.booking_date >= today;
              return (
                <div key={r.id} className="ix-card p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{r.boat?.name || '(boat)'}</h3>
                        <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${statusPill(r.status)}`}>
                          {r.status}
                        </span>
                        {needsDetailsTomorrow && (
                          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                            Trip tomorrow — fill details
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mt-1">
                        {r.booking_date} · EGP {Number(r.price_egp_snapshot).toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Owner · {r.boat?.owner?.name || '—'}
                        {r.booking?.client_name ? ` · Client · ${r.booking.client_name} (${r.booking.guest_count} guests)` : ''}
                        {r.booking?.destination?.name ? ` · ${r.booking.destination.name}` : ''}
                        {r.booking?.trip_ready_time ? ` · Ready ${r.booking.trip_ready_time}` : ''}
                      </p>
                      {r.notes && (
                        <p className="text-xs text-amber-700 mt-1">
                          <strong>Notes:</strong> {r.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {needsDetails && (
                        <Link
                          href={`/emails/boat-rental/broker/trip/${r.id}`}
                          className="ix-btn-secondary"
                        >
                          <Calendar size={14} /> Enter trip details
                        </Link>
                      )}
                      <form action={cancelReservationBrokerAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className="text-xs text-slate-500 hover:text-rose-700 inline-flex items-center gap-1"
                          title="Cancel (allowed only ≥72h before booking date, Cairo time)"
                        >
                          Cancel
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Past</h2>
          <div className="space-y-2">
            {past.slice(0, 50).map(r => (
              <div key={r.id} className="ix-card p-4 text-sm">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span className="font-medium">{r.boat?.name || '(boat)'}</span>
                    <span className="text-slate-500"> · {r.booking_date}</span>
                    <span className="ml-2 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border inline-block align-middle" >
                      <span className={statusPill(r.status) + ' px-1 py-0.5 rounded'}>{r.status}</span>
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
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
