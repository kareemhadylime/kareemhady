import { supabaseAdmin } from '@/lib/supabase';
import { PricesForm } from '../_components/prices-form';

export const dynamic = 'force-dynamic';

export default async function PricesPage() {
  const client = supabaseAdmin();
  const pos = await client.from('v_personal_stock_positions').select('instrument_id, qty_held, avg_cost');
  const instrIds = [...new Set((pos.data ?? []).map((p) => p.instrument_id))];
  const ins = await client.from('personal_stock_instruments').select('id, ticker, name').in('id', instrIds);
  const prices = await client.from('personal_stock_current_prices').select('instrument_id, price, as_of_date').in('instrument_id', instrIds).order('as_of_date', { ascending: false });

  const latest = new Map<number, { price: number; asOf: string }>();
  for (const p of prices.data ?? []) {
    if (!latest.has(p.instrument_id)) latest.set(p.instrument_id, { price: Number(p.price), asOf: p.as_of_date });
  }

  const rows = (pos.data ?? []).map((p) => {
    const i = (ins.data ?? []).find((x) => x.id === p.instrument_id);
    const lp = latest.get(p.instrument_id);
    return {
      instrumentId: p.instrument_id,
      ticker: i?.ticker ?? '?',
      name: i?.name ?? '?',
      qtyHeld: Number(p.qty_held),
      avgCost: Number(p.avg_cost),
      lastPrice: lp?.price ?? null,
      lastAsOf: lp?.asOf ?? null,
    };
  });

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Current prices</h2>
      <p className="text-xs text-slate-500">Enter today's price per held instrument to refresh unrealized P&L.</p>
      <PricesForm rows={rows} />
    </div>
  );
}
