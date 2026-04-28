import Link from 'next/link';
import { Search, AlertTriangle, Clock, BookOpen } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { listStockBalances } from '@/lib/beithady/inventory/stock';
import { listAllWarehouses, BEITHADY_BUILDING_CODES } from '@/lib/beithady/inventory/warehouses';
import { listCategories } from '@/lib/beithady/inventory/catalog';
import { LedgerDrawer } from './_components/ledger-drawer';

export const dynamic = 'force-dynamic';

export default async function InventoryStockPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    warehouse?: string;
    building?: string;
    category?: string;
    status?: string;
    drilldown?: string;
  }>;
}) {
  await requireBeithadyPermission('inventory', 'read');
  const sp = await searchParams;

  const [balances, warehouses, categories] = await Promise.all([
    listStockBalances({
      search: sp.search,
      warehouseId: sp.warehouse,
      buildingCode: sp.building,
      categoryCode: sp.category,
      status: (sp.status as 'all') || 'all',
    }),
    listAllWarehouses({ includeInactive: false }),
    listCategories(),
  ]);

  // Aggregate KPIs
  const totalRows = balances.length;
  const totalValueEgp = balances.reduce((s, r) => s + (r.qty_on_hand * r.avg_cost_egp), 0);
  const lowStockCount = new Set(
    balances
      .filter(r => r.warehouse_id !== '')
      .reduce((acc, r) => {
        const itemTotal = balances
          .filter(b => b.item_id === r.item_id)
          .reduce((s, b) => s + b.qty_on_hand, 0);
        if (itemTotal < r.item_min_qty && itemTotal > 0) acc.push(r.item_id);
        return acc;
      }, [] as string[]),
  ).size;
  const stockoutCount = new Set(
    balances
      .filter(r => {
        const itemTotal = balances
          .filter(b => b.item_id === r.item_id)
          .reduce((s, b) => s + b.qty_on_hand, 0);
        return itemTotal === 0;
      })
      .map(r => r.item_id),
  ).size;

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Stock' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Stock"
        title="Stock"
        subtitle="Balance per item × warehouse × batch. Click any row to drill into the immutable transaction ledger."
      />

      {/* KPI strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Stat label="Stock value" value={`${totalValueEgp.toLocaleString('en-US', { maximumFractionDigits: 0 })} EGP`} tone="neutral" />
        <Stat label="Balance rows" value={String(totalRows)} tone="neutral" />
        <Stat label="Low stock" value={String(lowStockCount)} tone={lowStockCount > 0 ? 'amber' : 'neutral'} icon={AlertTriangle} />
        <Stat label="Stockouts" value={String(stockoutCount)} tone={stockoutCount > 0 ? 'rose' : 'neutral'} icon={AlertTriangle} />
      </section>

      {/* Filter bar */}
      <section className="ix-card p-3 flex items-center gap-2 flex-wrap text-xs">
        <form action="" method="get" className="flex items-center gap-2 flex-wrap w-full">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="search"
              name="search"
              defaultValue={sp.search || ''}
              placeholder="Search SKU / name / brand…"
              className="ix-input pl-8 w-[220px]"
            />
          </div>
          <select name="building" defaultValue={sp.building || ''} className="ix-input">
            <option value="">All buildings</option>
            {BEITHADY_BUILDING_CODES.map(bc => <option key={bc} value={bc}>{bc}</option>)}
          </select>
          <select name="warehouse" defaultValue={sp.warehouse || ''} className="ix-input">
            <option value="">All warehouses</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name_en}</option>)}
          </select>
          <select name="category" defaultValue={sp.category || ''} className="ix-input">
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.code}>{c.name_en}</option>)}
          </select>
          <select name="status" defaultValue={sp.status || 'all'} className="ix-input">
            <option value="all">All statuses</option>
            <option value="in_stock">In stock</option>
            <option value="low">Low (below min)</option>
            <option value="stockout">Stockout (zero everywhere)</option>
            <option value="expiring">Expiring (≤90 days)</option>
          </select>
          <button type="submit" className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700">
            Apply
          </button>
          {(sp.search || sp.warehouse || sp.building || sp.category || sp.status) && (
            <Link href="/beithady/inventory/stock" className="text-[11px] text-slate-500 hover:text-slate-700">Clear</Link>
          )}
        </form>
      </section>

      {/* Stock table */}
      <section className="ix-card overflow-hidden">
        {balances.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No stock matches your filter. {totalRows === 0 && 'Add items first, then receive stock via GRN.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">SKU</th>
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="text-left px-3 py-2">Category</th>
                  <th className="text-left px-3 py-2">Warehouse</th>
                  <th className="text-left px-3 py-2">Batch</th>
                  <th className="text-right px-3 py-2">On hand</th>
                  <th className="text-right px-3 py-2">Reserved</th>
                  <th className="text-right px-3 py-2">Avg cost</th>
                  <th className="text-right px-3 py-2">Value (EGP)</th>
                  <th className="text-left px-3 py-2">Expiry</th>
                  <th className="text-right px-3 py-2">Last move</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b, i) => {
                  const value = b.qty_on_hand * b.avg_cost_egp;
                  const isExpiringSoon = b.expiry_date && new Date(b.expiry_date) <= new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                  return (
                    <tr
                      key={`${b.item_id}-${b.warehouse_id}-${b.batch_no}-${i}`}
                      className={`border-t border-slate-100 hover:bg-slate-50 cursor-pointer ${
                        b.warehouse_id === '' ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="px-3 py-2 font-mono text-[11px]">
                        <Link href={`?${new URLSearchParams({ ...sp, drilldown: b.item_id }).toString()}`} className="hover:text-cyan-700 hover:underline">
                          {b.item_sku}
                        </Link>
                      </td>
                      <td className="px-3 py-2 max-w-[220px]">
                        <div className="font-medium truncate">{b.item_name_en}</div>
                        <div className="text-[10px] text-slate-500 truncate" dir="rtl">{b.item_name_ar}</div>
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{b.item_category_name_en}</span>
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        {b.warehouse_id === '' ? (
                          <span className="text-slate-400 italic">—</span>
                        ) : (
                          <>
                            <div className="font-medium">{b.warehouse_name_en}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{b.warehouse_code}</div>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] font-mono text-slate-500">
                        {b.batch_no === '__bulk__' ? '—' : b.batch_no}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={
                          b.qty_on_hand === 0 ? 'text-slate-400' :
                          b.qty_on_hand < b.item_min_qty ? 'text-amber-700 font-semibold' : ''
                        }>
                          {b.qty_on_hand.toLocaleString('en-US', { maximumFractionDigits: 1 })} {b.item_uom}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                        {b.qty_reserved > 0 ? b.qty_reserved.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                        {b.avg_cost_egp > 0 ? b.avg_cost_egp.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {value > 0 ? value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        {b.expiry_date ? (
                          <span className={isExpiringSoon ? 'text-rose-700 inline-flex items-center gap-1' : 'text-slate-500'}>
                            {isExpiringSoon && <Clock size={10} />}
                            {b.expiry_date}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-[10px] text-slate-400">
                        {b.last_movement_at
                          ? new Date(b.last_movement_at).toLocaleDateString('en-GB')
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-slate-400">
        <BookOpen size={11} className="inline mr-1" />
        Click any SKU to open the immutable transaction ledger drill-in (every receipt, issue, transfer, adjustment in chronological order).
      </p>

      {sp.drilldown && (
        <LedgerDrawer itemId={sp.drilldown} closeHref={`/beithady/inventory/stock${(() => {
          const cleaned = { ...sp };
          delete cleaned.drilldown;
          const qs = new URLSearchParams(cleaned as Record<string, string>).toString();
          return qs ? `?${qs}` : '';
        })()}`} />
      )}

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Inventory · Stock · Phase M.6
      </footer>
    </BeithadyShell>
  );
}

function Stat({
  label, value, tone, icon: Icon,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'amber' | 'rose';
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  const cls = tone === 'amber' ? 'text-amber-700' : tone === 'rose' ? 'text-rose-700' : 'text-slate-700';
  return (
    <div className="ix-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 inline-flex items-center gap-1">
        {Icon && <Icon size={10} />}{label}
      </div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
