import Link from 'next/link';
import { Plus, Download, Upload, Search, AlertCircle } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { listItems, listCategories, listUoms } from '@/lib/beithady/inventory/catalog';
import { ItemFormButton } from './_components/item-form-button';
import { ImportButton } from './_components/import-button';

export const dynamic = 'force-dynamic';

function buildQs(
  current: { search?: string; category?: string; status?: string; low?: string },
  patch: Partial<typeof current>,
) {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(current)) if (v) merged[k] = String(v);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === '') delete merged[k];
    else merged[k] = String(v);
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `?${qs}` : '';
}

export default async function InventoryItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; category?: string; status?: string; low?: string }>;
}) {
  const { roles } = await requireBeithadyPermission('inventory', 'read');
  const sp = await searchParams;
  const canWrite = roles.some(r => ['admin', 'manager', 'ops', 'warehouse_manager'].includes(r));

  const [items, categories, uoms] = await Promise.all([
    listItems({
      search: sp.search,
      categoryCode: sp.category,
      status: (sp.status as 'active' | 'inactive' | 'all') || 'active',
      lowStock: sp.low === '1',
    }),
    listCategories(),
    listUoms(),
  ]);

  const lowStockCount = items.filter(it => it.total_on_hand < it.min_qty).length;

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Items' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Items"
        title="Items / Catalog"
        subtitle={`${items.length} item${items.length === 1 ? '' : 's'} · ${categories.length} categories · ${uoms.length} UoMs. Manual add or Excel import.`}
      />

      {/* Action bar */}
      <section className="flex items-center justify-between gap-3 flex-wrap">
        <form action="" method="get" className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="search"
              name="search"
              defaultValue={sp.search || ''}
              placeholder="Search SKU / name / brand…"
              className="ix-input pl-8 w-[260px]"
            />
          </div>
          <select
            name="category"
            defaultValue={sp.category || ''}
            className="ix-input"
          >
            <option value="">All categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.code}>{c.name_en}</option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={sp.status || 'active'}
            className="ix-input"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
          >
            Apply
          </button>
          {(sp.search || sp.category || sp.low) && (
            <Link
              href="/beithady/inventory/items"
              className="text-[11px] text-slate-500 hover:text-slate-700"
            >
              Clear
            </Link>
          )}
          <Link
            href={buildQs(sp, { low: sp.low === '1' ? '' : '1' })}
            className={`px-2 py-1 rounded text-[11px] border ${sp.low === '1' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200'}`}
          >
            <AlertCircle size={11} className="inline mr-1" /> Low stock only
          </Link>
        </form>

        {canWrite && (
          <div className="flex items-center gap-2">
            <a
              href="/api/beithady/inventory/items/template"
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              <Download size={14} /> Excel template
            </a>
            <ImportButton
              triggerLabel={
                <>
                  <Upload size={14} /> Import from Excel
                </>
              }
              triggerClass="px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-600 text-white hover:bg-cyan-700 inline-flex items-center gap-1.5 shadow-sm"
            />
            <ItemFormButton
              mode="create"
              categories={categories}
              uoms={uoms}
              triggerLabel={
                <>
                  <Plus size={14} /> Add item
                </>
              }
              triggerClass="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5 shadow-sm"
            />
          </div>
        )}
      </section>

      {lowStockCount > 0 && sp.low !== '1' && (
        <div className="ix-card border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertCircle size={14} className="inline mr-1.5" />
          {lowStockCount} item{lowStockCount === 1 ? '' : 's'} below reorder threshold.{' '}
          <Link href={buildQs(sp, { low: '1' })} className="underline font-medium">
            Show low-stock only →
          </Link>
        </div>
      )}

      {/* Items table */}
      <section className="ix-card overflow-hidden">
        {items.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <p>No items match your filter.</p>
            {canWrite && (
              <p className="text-[11px] mt-2">Use <strong>Add item</strong> for manual entry, or <strong>Excel template</strong> + <strong>Import from Excel</strong> for bulk.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">SKU</th>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Category</th>
                  <th className="text-left px-3 py-2">UoM</th>
                  <th className="text-right px-3 py-2">On hand</th>
                  <th className="text-right px-3 py-2">Min</th>
                  <th className="text-right px-3 py-2">Cost (EGP)</th>
                  <th className="text-right px-3 py-2">Avg cost</th>
                  <th className="text-left px-3 py-2">Flags</th>
                  <th className="text-right px-3 py-2">{canWrite && 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-[11px]">{it.sku}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{it.name_en}</div>
                      <div className="text-[10px] text-slate-500" dir="rtl">{it.name_ar}</div>
                      {it.brand && <div className="text-[10px] text-slate-400">{it.brand}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        {it.category_name_en}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px]">{it.uom}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className={
                        it.total_on_hand === 0 ? 'text-rose-600 font-semibold' :
                        it.total_on_hand < it.min_qty ? 'text-amber-700 font-semibold' :
                        ''
                      }>
                        {Number(it.total_on_hand).toLocaleString('en-US', { maximumFractionDigits: 1 })}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{it.min_qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(it.default_cost_egp).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {it.avg_cost_egp > 0
                        ? Number(it.avg_cost_egp).toLocaleString('en-US', { maximumFractionDigits: 2 })
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-[10px]">
                      <div className="flex flex-wrap gap-1">
                        {it.batch_tracked && <span className="px-1 py-0.5 rounded bg-violet-50 text-violet-700">Batch</span>}
                        {it.expiry_tracked && <span className="px-1 py-0.5 rounded bg-rose-50 text-rose-700">Expiry</span>}
                        {it.owner_billable && <span className="px-1 py-0.5 rounded bg-amber-50 text-amber-700">Owner</span>}
                        {it.is_asset && <span className="px-1 py-0.5 rounded bg-cyan-50 text-cyan-700">Asset</span>}
                        {!it.active && <span className="px-1 py-0.5 rounded bg-slate-100 text-slate-500">Inactive</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canWrite && (
                        <ItemFormButton
                          mode="edit"
                          existing={it}
                          categories={categories}
                          uoms={uoms}
                          triggerLabel="Edit"
                          triggerClass="text-[11px] text-cyan-700 hover:text-cyan-900 hover:underline"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Inventory · Items · Phase M.4 · Excel import via exceljs
      </footer>
    </BeithadyShell>
  );
}
