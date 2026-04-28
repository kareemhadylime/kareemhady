import Link from 'next/link';
import {
  TrendingDown, AlertCircle, Package, Building2, Boxes, ArrowRight, Calculator, Bot, Calendar,
} from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { supabaseAdmin } from '@/lib/supabase';
import { listConsumptionRules } from '@/lib/beithady/inventory/rules';
import { CostCalculatorWidget } from './_components/cost-calculator-widget';

export const dynamic = 'force-dynamic';

export default async function InventoryDashboardPage() {
  await requireBeithadyPermission('inventory', 'read');
  const sb = supabaseAdmin();

  const { data: stockRows } = await sb
    .from('beithady_inventory_stock')
    .select('item_id, qty_on_hand, avg_cost_egp, expiry_date');
  const stockValue = ((stockRows as Array<{ qty_on_hand: number; avg_cost_egp: number }> | null) || [])
    .reduce((s, r) => s + Number(r.qty_on_hand || 0) * Number(r.avg_cost_egp || 0), 0);

  const itemTotals = new Map<string, number>();
  for (const r of (stockRows as Array<{ item_id: string; qty_on_hand: number }> | null) || []) {
    itemTotals.set(r.item_id, (itemTotals.get(r.item_id) || 0) + Number(r.qty_on_hand || 0));
  }

  const { data: items } = await sb
    .from('beithady_inventory_items')
    .select('id, sku, name_en, min_qty, reorder_qty, uom, default_cost_egp')
    .eq('active', true);
  const allItems = (items as Array<{
    id: string; sku: string; name_en: string; min_qty: number; reorder_qty: number | null;
    uom: string; default_cost_egp: number;
  }> | null) || [];

  const lowStockItems = allItems
    .map(it => ({ ...it, on_hand: itemTotals.get(it.id) || 0 }))
    .filter(it => it.on_hand < Number(it.min_qty || 0))
    .sort((a, b) => a.on_hand - b.on_hand);
  const stockoutCount = lowStockItems.filter(it => it.on_hand === 0).length;

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400_000);
  const expiringSoon = ((stockRows as Array<{ expiry_date: string | null }> | null) || [])
    .filter(r => r.expiry_date && new Date(r.expiry_date) <= in30 && new Date(r.expiry_date) >= now).length;

  const [grnPending, issuePending, poPending, openCounts] = await Promise.all([
    sb.from('beithady_inventory_grns').select('id', { count: 'exact', head: true })
      .in('status', ['submitted', 'pending_approval']),
    sb.from('beithady_inventory_issues').select('id', { count: 'exact', head: true })
      .in('status', ['submitted', 'pending_approval']),
    sb.from('beithady_inventory_purchase_orders').select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'pending_approval']),
    sb.from('beithady_inventory_count_sessions').select('id', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress', 'pending_approval']),
  ]);
  const totalApprovals = (grnPending.count || 0) + (issuePending.count || 0) + (poPending.count || 0);

  const thirtyAgo = new Date(now.getTime() - 30 * 86400_000).toISOString();
  const { data: tx30 } = await sb
    .from('beithady_inventory_transactions')
    .select('item_id, qty_delta, type')
    .gte('ts', thirtyAgo)
    .in('type', ['issue', 'reservation_hold', 'transfer_out']);
  const usage30: Record<string, number> = {};
  for (const t of (tx30 as Array<{ item_id: string; qty_delta: number; type: string }> | null) || []) {
    usage30[t.item_id] = (usage30[t.item_id] || 0) + Math.abs(Number(t.qty_delta));
  }
  const topMovers = Object.entries(usage30)
    .map(([itemId, qty]) => ({
      itemId,
      qty,
      item: allItems.find(it => it.id === itemId),
    }))
    .filter(x => x.item)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8);

  const rules = await listConsumptionRules({ activeOnly: true });

  const { count: upcomingCount } = await sb
    .from('guesty_reservations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .gte('check_in_date', now.toISOString().slice(0, 10))
    .lte('check_in_date', new Date(now.getTime() + 14 * 86400_000).toISOString().slice(0, 10));

  const { count: warehouseCount } = await sb
    .from('beithady_inventory_warehouses')
    .select('id', { count: 'exact', head: true })
    .eq('active', true);

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Dashboard' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Dashboard"
        title="Inventory Dashboard"
        subtitle="Live KPIs · per-checkin cost calculator · 30-day movement velocity · reorder alerts. Refreshes every page-load."
      />

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Kpi label="Stock value (EGP)" value={stockValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} icon={Package} />
        <Kpi label="Active items" value={String(allItems.length)} icon={Boxes} />
        <Kpi label="Active warehouses" value={String(warehouseCount || 0)} icon={Building2} />
        <Kpi label="Active rules" value={String(rules.length)} icon={Bot} tone={rules.length === 0 ? 'amber' : 'neutral'} />

        <Kpi label="Stockouts" value={String(stockoutCount)} icon={AlertCircle} tone={stockoutCount > 0 ? 'rose' : 'neutral'} />
        <Kpi label="Below reorder" value={String(lowStockItems.length - stockoutCount)} icon={TrendingDown} tone={lowStockItems.length > 0 ? 'amber' : 'neutral'} />
        <Kpi label="Expiring ≤30d" value={String(expiringSoon)} icon={Calendar} tone={expiringSoon > 0 ? 'amber' : 'neutral'} />
        <Kpi label="Pending approvals" value={String(totalApprovals + (openCounts.count || 0))} icon={AlertCircle} tone={totalApprovals > 0 ? 'amber' : 'neutral'} />
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
          <Calculator size={12} className="inline mr-1" /> Per-checkin cost calculator
        </h2>
        <CostCalculatorWidget />
      </section>

      {lowStockItems.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
            <AlertCircle size={12} className="inline mr-1 text-amber-600" /> Reorder alerts ({lowStockItems.length})
          </h2>
          <div className="ix-card overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="text-right px-3 py-2">On hand</th>
                  <th className="text-right px-3 py-2">Min</th>
                  <th className="text-right px-3 py-2">Reorder qty</th>
                  <th className="text-right px-3 py-2">Est. cost (EGP)</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.slice(0, 30).map(it => {
                  const reorderQty = it.reorder_qty || (Number(it.min_qty) - it.on_hand);
                  const cost = reorderQty * Number(it.default_cost_egp);
                  return (
                    <tr key={it.id} className={`border-t border-slate-100 ${it.on_hand === 0 ? 'bg-rose-50/30' : ''}`}>
                      <td className="px-3 py-2">
                        <div className="font-mono text-[11px]">{it.sku}</div>
                        <div className="text-[10px] text-slate-500">{it.name_en}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        <span className={it.on_hand === 0 ? 'text-rose-700' : 'text-amber-700'}>
                          {it.on_hand} {it.uom}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{it.min_qty}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{reorderQty}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {cost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-3 py-2 text-[10px]">
                        <span className={`px-1.5 py-0.5 rounded font-medium ${it.on_hand === 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                          {it.on_hand === 0 ? 'Stockout' : 'Below reorder'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {lowStockItems.length > 30 && (
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              Showing top 30 of {lowStockItems.length}.{' '}
              <Link href="/beithady/inventory/items?low=1" className="text-cyan-700 underline">View all</Link>
            </p>
          )}
        </section>
      )}

      {topMovers.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
            <ArrowRight size={12} className="inline mr-1" /> Top movers — last 30 days
          </h2>
          <div className="ix-card overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2 w-10">#</th>
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="text-right px-3 py-2">Issued (30d)</th>
                  <th className="text-right px-3 py-2">Velocity / day</th>
                  <th className="text-right px-3 py-2">Days of stock</th>
                </tr>
              </thead>
              <tbody>
                {topMovers.map((m, i) => {
                  const dailyRate = m.qty / 30;
                  const onHand = itemTotals.get(m.itemId) || 0;
                  const daysLeft = dailyRate > 0 ? Math.floor(onHand / dailyRate) : Infinity;
                  return (
                    <tr key={m.itemId} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2">
                        <div className="font-mono text-[11px]">{m.item!.sku}</div>
                        <div className="text-[10px] text-slate-500">{m.item!.name_en}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.qty.toFixed(1)} {m.item!.uom}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{dailyRate.toFixed(2)} / day</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${daysLeft < 7 ? 'text-rose-700' : daysLeft < 14 ? 'text-amber-700' : 'text-slate-700'}`}>
                        {daysLeft === Infinity ? '∞' : `${daysLeft} days`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="ix-card p-4 text-xs">
        <h3 className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
          <Calendar size={12} className="inline mr-1" /> 14-day check-in forecast
        </h3>
        <div className="text-slate-700">
          <strong>{upcomingCount || 0}</strong> confirmed reservations checking in in the next 14 days.
          {rules.length === 0 ? (
            <> Auto-issue cron is <span className="text-rose-700">inert</span> (no consumption rules). <Link href="/beithady/inventory/rules" className="text-cyan-700 underline">Add rules →</Link></>
          ) : (
            <> Auto-issue cron will fire daily at Cairo 11:00 against {rules.length} active rule{rules.length === 1 ? '' : 's'}. <Link href="/beithady/inventory/issue?type=per_reservation" className="text-cyan-700 underline">View auto-issued →</Link></>
          )}
        </div>
      </section>

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Inventory · Dashboard · Phase M.11 · Live page-load aggregation
      </footer>
    </BeithadyShell>
  );
}

function Kpi({
  label, value, icon: Icon, tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone?: 'amber' | 'rose' | 'neutral';
}) {
  const cls = tone === 'amber' ? 'text-amber-700' : tone === 'rose' ? 'text-rose-700' : 'text-slate-700';
  return (
    <div className="ix-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 inline-flex items-center gap-1">
        <Icon size={10} /> {label}
      </div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
