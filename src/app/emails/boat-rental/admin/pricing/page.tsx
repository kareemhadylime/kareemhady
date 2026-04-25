import { supabaseAdmin } from '@/lib/supabase';
import { BackToAdminMenu } from '../_components/back-to-menu';
import { PricingRow } from './_components/pricing-row';

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

  function priceFor(boatId: string, tier: string): number | null {
    const row = pricing.find(p => p.boat_id === boatId && p.tier === tier);
    return row ? Number(row.amount_egp) : null;
  }

  return (
    <>
      <BackToAdminMenu />
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Pricing</h1>
        <p className="text-sm text-slate-500 mt-1">
          Each boat has its own three tiers — Weekday (Sun–Thu), Weekend (Fri–Sat), Season/Holiday.
          Amounts are <strong>net to owner</strong> — what the broker transfers after the trip. Broker markup on top is not tracked.
          Prices stay locked once saved; press <strong>Edit prices</strong> on a row to change them.
          Price snapshot is taken on each reservation, so edits here don&apos;t retroactively change existing bookings.
        </p>
      </header>

      <section className="mt-8 space-y-4">
        {boats.length === 0 && (
          <div className="ix-card p-6 text-sm text-slate-500 text-center">Add boats first.</div>
        )}
        {boats.map(b => {
          const prices = {
            weekday: priceFor(b.id, 'weekday'),
            weekend: priceFor(b.id, 'weekend'),
            season: priceFor(b.id, 'season'),
          };
          return <PricingRow key={b.id} boat={b} prices={prices} />;
        })}
      </section>
    </>
  );
}
