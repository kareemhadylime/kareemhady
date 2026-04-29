import Link from 'next/link';
import { Plus, Download, Upload, Search, AlertCircle, CircleDot } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { listItems, listCategories, listUoms, type Category } from '@/lib/beithady/inventory/catalog';
import { ItemFormButton } from './_components/item-form-button';
import { ImportButton } from './_components/import-button';
import { ItemsSectionList } from './_components/items-section-list';
import { CategoryJumpSelect } from './_components/category-jump-select';

export const dynamic = 'force-dynamic';

function buildQs(
  current: { search?: string; status?: string; low?: string; needs_review?: string },
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
  searchParams: Promise<{ search?: string; status?: string; low?: string; needs_review?: string }>;
}) {
  const { roles } = await requireBeithadyPermission('inventory', 'read');
  const sp = await searchParams;
  const canWrite = roles.some(r => ['admin', 'manager', 'ops', 'warehouse_manager'].includes(r));

  const [items, categories, uoms] = await Promise.all([
    listItems({
      search: sp.search,
      status: (sp.status as 'active' | 'inactive' | 'all') || 'active',
      lowStock: sp.low === '1',
      needsReview: sp.needs_review === '1',
    }),
    listCategories(),
    listUoms(),
  ]);

  const lowStockCount = items.filter(it => it.total_on_hand < it.min_qty).length;
  const needsReviewCount = items.filter(it => it.amazon_eg_url && !it.amazon_eg_url_reviewed_at).length;
  const sourcedCount = items.filter(it => it.amazon_eg_url).length;
  const reviewedCount = items.filter(it => it.amazon_eg_url_reviewed_at).length;

  // Group items by category, in the order returned by listCategories so the
  // sections render in the same order across the app.
  const byCategoryId = new Map<string, typeof items>();
  for (const it of items) {
    const arr = byCategoryId.get(it.category_id) || [];
    arr.push(it);
    byCategoryId.set(it.category_id, arr);
  }
  const sections = categories
    .map((cat: Category) => ({ category: cat, items: byCategoryId.get(cat.id) || [] }))
    .filter(s => s.items.length > 0);

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
        subtitle={`${items.length} item${items.length === 1 ? '' : 's'} · ${sourcedCount} with Amazon EG source · ${reviewedCount} reviewed. Operators confirm or change canonical URLs from the Source column — every change cascades into per-config check-in budgets.`}
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
            name="status"
            defaultValue={sp.status || 'active'}
            className="ix-input"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
          {/* Hidden inputs preserve filter state on submit so the search form
              doesn't strip them. */}
          {sp.low === '1' && <input type="hidden" name="low" value="1" />}
          {sp.needs_review === '1' && <input type="hidden" name="needs_review" value="1" />}
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
          >
            Apply
          </button>
          {(sp.search || sp.low || sp.needs_review) && (
            <Link
              href="/beithady/inventory/items"
              className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-100"
            >
              Clear
            </Link>
          )}
          <Link
            href={buildQs(sp, { low: sp.low === '1' ? '' : '1' })}
            className={`px-2 py-1 rounded text-[11px] border ${sp.low === '1' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'}`}
          >
            <AlertCircle size={11} className="inline mr-1" /> Low stock only
          </Link>
          <Link
            href={buildQs(sp, { needs_review: sp.needs_review === '1' ? '' : '1' })}
            className={`px-2 py-1 rounded text-[11px] border ${sp.needs_review === '1' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'}`}
            title="Items with a URL set but not yet confirmed"
          >
            <CircleDot size={10} className="inline mr-1" /> Needs review
            {needsReviewCount > 0 && sp.needs_review !== '1' && (
              <span className="ml-1 inline-block min-w-[1.1rem] text-center bg-amber-200 text-amber-900 rounded px-1 text-[9px] font-semibold">
                {needsReviewCount}
              </span>
            )}
          </Link>
          <CategoryJumpSelect categories={categories} />
        </form>

        {canWrite && (
          <div className="flex items-center gap-2">
            <a
              href="/api/beithady/inventory/items/template"
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
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
        <div className="ix-card border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
          <AlertCircle size={14} className="inline mr-1.5" />
          {lowStockCount} item{lowStockCount === 1 ? '' : 's'} below reorder threshold.{' '}
          <Link href={buildQs(sp, { low: '1' })} className="underline font-medium">
            Show low-stock only →
          </Link>
        </div>
      )}

      {needsReviewCount > 0 && sp.needs_review !== '1' && (
        <div className="ix-card border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
          <CircleDot size={14} className="inline mr-1.5" />
          {needsReviewCount} item{needsReviewCount === 1 ? '' : 's'} have a URL set but no operator review yet — these drive unit-config budgets without a human signoff.{' '}
          <Link href={buildQs(sp, { needs_review: '1' })} className="underline font-medium">
            Show needs-review only →
          </Link>
        </div>
      )}

      <ItemsSectionList
        sections={sections}
        categories={categories}
        uoms={uoms}
        canWrite={canWrite}
      />

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Inventory · Items · Phase M.15.4 · Source-URL editing drives unit-config budget rollups
      </footer>
    </BeithadyShell>
  );
}
