import { Clock, CheckCircle2, X, Ship } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { TabNav, BROKER_TABS } from '../../_components/tabs';
import { HoldCountdown } from '../_components/countdown';
import { confirmPaymentAction, cancelHoldAction } from '../actions';

export const dynamic = 'force-dynamic';

type HoldRow = {
  id: string;
  booking_date: string;
  price_egp_snapshot: string | number;
  pricing_tier_snapshot: string;
  held_until: string | null;
  notes: string | null;
  boat: { name: string; owner: { name: string } | null } | null;
};

export default async function BrokerHolds() {
  const me = await getCurrentUser();
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_reservations')
    .select(
      `
      id, booking_date, price_egp_snapshot, pricing_tier_snapshot, held_until, notes,
      boat:boat_rental_boats ( name, owner:boat_rental_owners ( name ) )
    `
    )
    .eq('broker_id', me!.id)
    .eq('status', 'held')
    .order('held_until', { ascending: true });
  const holds = ((data as unknown) as HoldRow[] | null) || [];

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Active Holds</h1>
        <p className="text-sm text-slate-500 mt-1">
          2-hour temporary reservations. Confirm once the client has paid, or they auto-expire.
        </p>
      </header>
      <TabNav tabs={BROKER_TABS} currentPath="/emails/boat-rental/broker/holds" />

      <section className="mt-8 space-y-4">
        {holds.length === 0 && (
          <div className="ix-card p-8 text-sm text-slate-500 text-center">
            <Ship size={24} className="mx-auto text-slate-300 mb-2" />
            No active holds. Go check availability to reserve a boat.
          </div>
        )}
        {holds.map(h => (
          <div key={h.id} className="ix-card p-5 border-amber-200 bg-amber-50/30">
            <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-amber-600" />
                  <h3 className="font-semibold">{h.boat?.name || '(boat)'}</h3>
                  <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    held
                  </span>
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  {h.booking_date} · EGP {Number(h.price_egp_snapshot).toLocaleString()} ({h.pricing_tier_snapshot})
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Owner · {h.boat?.owner?.name || '—'}</p>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Expires in</div>
                {h.held_until ? (
                  <div className="text-xl">
                    <HoldCountdown until={h.held_until} />
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">—</div>
                )}
              </div>
            </div>

            <form action={confirmPaymentAction} className="space-y-3">
              <input type="hidden" name="id" value={h.id} />
              <label className="text-sm block">
                <span className="text-slate-600 text-xs">
                  Special trip requirements (optional — goes out on the confirmation WhatsApp and again on day-before)
                </span>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={h.notes || ''}
                  placeholder="e.g. extra coolers, specific music setup, pickup location detail"
                  className="ix-input mt-1"
                />
              </label>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <button type="submit" className="ix-btn-primary">
                  <CheckCircle2 size={14} /> Mark client paid & confirm booking
                </button>
              </div>
            </form>

            <form action={cancelHoldAction} className="mt-3 flex justify-end">
              <input type="hidden" name="id" value={h.id} />
              <button
                type="submit"
                className="text-xs text-slate-500 hover:text-rose-700 inline-flex items-center gap-1"
              >
                <X size={12} /> Release hold
              </button>
            </form>
          </div>
        ))}
      </section>
    </>
  );
}
