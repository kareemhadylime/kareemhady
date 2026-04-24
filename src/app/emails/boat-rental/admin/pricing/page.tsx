import { Save } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { TabNav, ADMIN_TABS } from '../../_components/tabs';
import { upsertPricingAction } from './actions';

export const dynamic = 'force-dynamic';

type Boat = { id: string; name: string; status: string };
type Pricing = { boat_id: string; tier: string; amount_egp: string | number };

export default async function PricingAdmin() {
  const sb = supabaseAdmin();
  const [boatsRes, pricingRes] = await Promise.all([
    sb
      .from('boat_rental_boats')
      .select('id, name, status')
      .order('status')
      .order('name'),
    sb.from('boat_rental_pricing').select('boat_id, tier, amount_egp'),
  ]);
  const boats = ((boatsRes.data as unknown) as Boat[] | null) || [];
  const pricing = ((pricingRes.data as unknown) as Pricing[] | null) || [];

  function priceFor(boatId: string, tier: string): string {
    const row = pricing.find(p => p.boat_id === boatId && p.tier === tier);
    return row ? String(Number(row.amount_egp)) : '';
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Pricing</h1>
        <p className="text-sm text-slate-500 mt-1">
          Amounts are <strong>net to owner</strong> — what the broker transfers after the trip. Broker markup on top is not tracked.
          Price snapshot is taken on each reservation, so edits here don&apos;t retroactively change existing bookings.
        </p>
      </header>
      <TabNav tabs={ADMIN_TABS} currentPath="/emails/boat-rental/admin/pricing" />

      <section className="mt-8 space-y-4">
        {boats.length === 0 && (
          <div className="ix-card p-6 text-sm text-slate-500 text-center">Add boats first.</div>
        )}
        {boats.map(b => (
          <div key={b.id} className="ix-card p-5">
            <form action={upsertPricingAction} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <input type="hidden" name="boat_id" value={b.id} />
              <div className="md:col-span-2">
                <div className="font-semibold">{b.name}</div>
                <div className="text-xs text-slate-500">
                  Status: {b.status}
                </div>
              </div>
              <label className="text-sm">
                <span className="text-slate-600 text-xs">Weekday (Sun–Thu) EGP</span>
                <input
                  name="amount_weekday"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={priceFor(b.id, 'weekday')}
                  className="ix-input mt-1"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600 text-xs">Weekend (Fri–Sat) EGP</span>
                <input
                  name="amount_weekend"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={priceFor(b.id, 'weekend')}
                  className="ix-input mt-1"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600 text-xs">Season/Holiday EGP</span>
                <input
                  name="amount_season"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={priceFor(b.id, 'season')}
                  className="ix-input mt-1"
                />
              </label>
              <div className="md:col-span-5 flex justify-end">
                <button type="submit" className="ix-btn-primary"><Save size={14} /> Save prices</button>
              </div>
            </form>
          </div>
        ))}
      </section>
    </>
  );
}
