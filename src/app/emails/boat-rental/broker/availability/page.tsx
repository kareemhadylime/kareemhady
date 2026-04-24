import { Search, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { priceForBoatOnDate, cairoTodayStr } from '@/lib/boat-rental/pricing';
import { TabNav, BROKER_TABS } from '../../_components/tabs';
import { reserveHoldAction } from './actions';

export const dynamic = 'force-dynamic';

type Boat = { id: string; name: string; capacity_guests: number; skipper_name: string };

type SearchParams = Promise<{ boat_id?: string; date?: string }>;

export default async function BrokerAvailability({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const selectedBoat = sp.boat_id || '';
  const selectedDate = sp.date || '';

  const sb = supabaseAdmin();
  const { data: boatsRaw } = await sb
    .from('boat_rental_boats')
    .select('id, name, capacity_guests, skipper_name')
    .eq('status', 'active')
    .order('name');
  const boats = ((boatsRaw as unknown) as Boat[] | null) || [];

  let result: {
    status: 'available' | 'booked' | 'no_price' | 'invalid';
    boatName?: string;
    tier?: string;
    amountEgp?: number;
    existingStatus?: string;
  } | null = null;

  if (selectedBoat && selectedDate) {
    const boat = boats.find(b => b.id === selectedBoat);
    if (!boat) {
      result = { status: 'invalid' };
    } else {
      const { data: existing } = await sb
        .from('boat_rental_reservations')
        .select('status')
        .eq('boat_id', selectedBoat)
        .eq('booking_date', selectedDate)
        .in('status', ['held', 'confirmed', 'details_filled', 'paid_to_owner'])
        .maybeSingle();
      if (existing) {
        result = {
          status: 'booked',
          boatName: boat.name,
          existingStatus: (existing as { status: string }).status,
        };
      } else {
        const price = await priceForBoatOnDate(selectedBoat, selectedDate);
        if (!price) {
          result = { status: 'no_price', boatName: boat.name };
        } else {
          result = {
            status: 'available',
            boatName: boat.name,
            tier: price.tier,
            amountEgp: price.amountEgp,
          };
        }
      }
    }
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Check Availability</h1>
        <p className="text-sm text-slate-500 mt-1">Pick a boat and date to see availability and price.</p>
      </header>
      <TabNav tabs={BROKER_TABS} currentPath="/emails/boat-rental/broker/availability" />

      <section className="mt-8 ix-card p-6">
        <form method="get" className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Boat</span>
            <select name="boat_id" defaultValue={selectedBoat} required className="ix-input mt-1">
              <option value="">Select boat…</option>
              {boats.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} (cap. {b.capacity_guests})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Date</span>
            <input
              name="date"
              type="date"
              min={cairoTodayStr()}
              defaultValue={selectedDate}
              required
              className="ix-input mt-1"
            />
          </label>
          <button type="submit" className="ix-btn-primary"><Search size={14} /> Check</button>
        </form>
      </section>

      {result && (
        <section className="mt-6">
          {result.status === 'available' && (
            <div className="ix-card p-6 border-emerald-200 bg-emerald-50/40">
              <div className="flex items-start gap-3 mb-4">
                <CheckCircle2 size={22} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-emerald-900">Available</div>
                  <div className="text-sm text-emerald-800 mt-0.5">
                    {result.boatName} · {selectedDate}
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-emerald-900 mt-2">
                    EGP {(result.amountEgp || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-emerald-700 mt-0.5">
                    {result.tier === 'season'
                      ? 'Season/Holiday tier'
                      : result.tier === 'weekend'
                        ? 'Weekend tier (Fri/Sat)'
                        : 'Weekday tier'}{' '}
                    · net to owner
                  </div>
                </div>
              </div>
              <form action={reserveHoldAction}>
                <input type="hidden" name="boat_id" value={selectedBoat} />
                <input type="hidden" name="booking_date" value={selectedDate} />
                <button type="submit" className="ix-btn-primary">
                  <Clock size={14} /> Reserve (2-hour hold)
                </button>
              </form>
            </div>
          )}
          {result.status === 'booked' && (
            <div className="ix-card p-6 border-rose-200 bg-rose-50/40">
              <div className="flex items-start gap-3">
                <XCircle size={22} className="text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-rose-900">Not available</div>
                  <div className="text-sm text-rose-800 mt-0.5">
                    {result.boatName} is already {result.existingStatus} for {selectedDate}.
                  </div>
                </div>
              </div>
            </div>
          )}
          {result.status === 'no_price' && (
            <div className="ix-card p-6 border-amber-200 bg-amber-50/40">
              <div className="flex items-start gap-3">
                <AlertTriangle size={22} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-900">No price configured</div>
                  <div className="text-sm text-amber-800 mt-0.5">
                    {result.boatName} has no price for this date tier. Ask the admin to set pricing.
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
