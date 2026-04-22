import Link from 'next/link';
import {
  ChevronRight,
  Boxes,
  Plus,
  Search,
  ImageOff,
  AlertTriangle,
  Trash2,
  Save,
  Check,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { getCurrentUser, canAccessDomain } from '@/lib/auth';
import {
  listRawMaterials,
  fetchRawMaterial,
  summarizeRawMaterials,
  RAW_MATERIAL_CATEGORIES,
  RAW_MATERIAL_UNITS,
  type RawMaterial,
  type RawMaterialCategory,
} from '@/lib/kika-raw-materials';
import {
  createRawMaterial,
  updateRawMaterial,
  deleteRawMaterial,
  adjustStockAction,
} from './actions';
import { InventoryTabs } from '../_components/inventory-tabs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function buildQs(
  current: {
    search?: string;
    category?: string;
    low?: string;
    material?: string;
    ok?: string;
    err?: string;
  },
  next: Partial<{
    search: string | null;
    category: string | null;
    low: string | null;
    material: string | null;
    ok: string | null;
    err: string | null;
  }>
): string {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(current)) {
    if (v) merged[k] = String(v);
  }
  for (const [k, v] of Object.entries(next)) {
    if (v === null) delete merged[k];
    else if (v !== undefined) merged[k] = String(v);
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `?${qs}` : '';
}

const fmt = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(Number(n))
    ? '—'
    : Math.round(Number(n)).toLocaleString('en-US');
const fmt2 = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toFixed(2);

export default async function KikaRawMaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    category?: string;
    low?: string;
    material?: string;
    ok?: string;
    err?: string;
  }>;
}) {
  const sp = await searchParams;
  const category = (sp.category as RawMaterialCategory | 'all' | undefined) || 'all';
  const lowOnly = sp.low === '1';
  const me = await getCurrentUser();
  const canEdit = !!me && canAccessDomain(me, 'kika') && me.role !== 'viewer';

  const [rows, summary, selected] = await Promise.all([
    listRawMaterials({
      domain: 'kika',
      search: sp.search,
      category,
      lowStockOnly: lowOnly,
    }),
    summarizeRawMaterials('kika'),
    sp.material ? fetchRawMaterial(sp.material) : Promise.resolve(null),
  ]);

  return (
    <>
      <TopNav>
        <Link href="/emails" className="ix-link">Emails</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/emails/kika" className="ix-link">KIKA</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/emails/kika/inventory" className="ix-link">Inventory</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Raw Materials</span>
      </TopNav>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-6 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            KIKA · Inventory · Raw Materials
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Raw materials catalogue</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Fabrics, trims, zippers, buttons, thread, elastic, labels,
            packaging and everything else that goes into a finished garment.
            Each row has an internal SKU, supplier, unit cost and stock level
            — the building blocks for per-product Bill-of-Materials costing
            later on.
          </p>
        </header>

        <InventoryTabs active="raw" />

        {sp.ok === '1' && (
          <div className="ix-card p-3 flex items-center gap-2 text-[12px] text-emerald-700 bg-emerald-50/50 border-emerald-200">
            <Check size={14} /> Saved.
          </div>
        )}
        {sp.ok === 'deleted' && (
          <div className="ix-card p-3 flex items-center gap-2 text-[12px] text-slate-700">
            <Check size={14} /> Material deleted.
          </div>
        )}
        {sp.err && (
          <div className="ix-card p-3 flex items-center gap-2 text-[12px] text-rose-700 bg-rose-50/50 border-rose-200">
            <AlertTriangle size={14} /> {sp.err}
          </div>
        )}

        {/* Summary chips */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Active SKUs" value={fmt(summary.active_count)} tone="indigo" />
          <SummaryCard
            label="Low-stock"
            value={fmt(summary.low_stock_count)}
            tone={summary.low_stock_count > 0 ? 'rose' : 'slate'}
          />
          <SummaryCard
            label="Stock value"
            value={`EGP ${fmt(summary.total_stock_value)}`}
            tone="emerald"
          />
          <SummaryCard
            label="Categories"
            value={fmt(summary.by_category.length)}
            sub={summary.by_category
              .slice(0, 3)
              .map(b => `${RAW_MATERIAL_CATEGORIES.find(c => c.id === b.category)?.label || b.category} (${b.count})`)
              .join(' · ')}
            tone="slate"
          />
        </section>

        {/* Filter + Add */}
        <section className="ix-card p-4 flex items-center gap-3 flex-wrap">
          <form action="" method="get" className="flex items-center gap-2 flex-wrap">
            {sp.category && <input type="hidden" name="category" value={sp.category} />}
            {sp.low && <input type="hidden" name="low" value={sp.low} />}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="search"
                name="search"
                defaultValue={sp.search || ''}
                placeholder="Search name / code / supplier / color…"
                className="ix-input pl-8 w-[280px]"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 shadow-sm"
            >
              Apply
            </button>
            {sp.search && (
              <Link
                href={buildQs(sp, { search: null })}
                className="text-[11px] text-slate-500 hover:text-slate-700"
              >
                Clear
              </Link>
            )}
          </form>
          <div className="ml-auto flex items-center gap-1.5 text-[11px] flex-wrap">
            <Link
              href={buildQs(sp, { category: null })}
              className={`px-2 py-1 rounded ${
                category === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
              }`}
            >
              All
            </Link>
            {RAW_MATERIAL_CATEGORIES.map(c => (
              <Link
                key={c.id}
                href={buildQs(sp, { category: c.id })}
                className={`px-2 py-1 rounded ${
                  category === c.id
                    ? 'bg-sky-50 text-sky-700 border border-sky-200'
                    : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                }`}
              >
                {c.label}
              </Link>
            ))}
            <Link
              href={buildQs(sp, { low: lowOnly ? null : '1' })}
              className={`px-2 py-1 rounded inline-flex items-center gap-1 ${
                lowOnly
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
              }`}
            >
              <AlertTriangle size={11} /> Low stock only
            </Link>
          </div>
        </section>

        {/* Add form — collapsible via <details> so it only takes up space when opened */}
        {canEdit && (
          <details className="ix-card group">
            <summary className="cursor-pointer list-none px-5 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold inline-flex items-center gap-2">
                <Plus size={16} className="text-sky-600" />
                Add raw material
              </span>
              <span className="text-[11px] text-slate-400 group-open:hidden">
                click to expand
              </span>
              <span className="text-[11px] text-slate-400 hidden group-open:inline">
                click to collapse
              </span>
            </summary>
            <form action={createRawMaterial} className="px-5 pb-5 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Name *" name="name" required />
                <Field label="Internal SKU / Code" name="code" placeholder="e.g. KIKA-FAB-001" />
                <SelectField
                  label="Category *"
                  name="category"
                  defaultValue="fabric"
                  required
                  options={RAW_MATERIAL_CATEGORIES.map(c => ({ id: c.id, label: c.label }))}
                />
                <Field label="Subcategory" name="subcategory" placeholder="e.g. mesh, knit, metal…" />
                <Field label="Color" name="color" placeholder="e.g. Navy, Rose gold" />
                <SelectField
                  label="Unit *"
                  name="unit"
                  defaultValue="pc"
                  required
                  options={RAW_MATERIAL_UNITS}
                />
                <Field label="Unit cost (EGP)" name="unit_cost" type="number" step="0.01" />
                <Field label="Qty on hand" name="qty_on_hand" type="number" step="0.001" defaultValue="0" />
                <Field label="Min qty (reorder)" name="qty_min" type="number" step="0.001" />
                <Field label="Supplier" name="supplier" />
                <Field label="Supplier SKU" name="supplier_sku" />
                <Field label="Image URL" name="image_url" placeholder="https://…" />
              </div>
              <label className="block">
                <span className="block text-xs font-medium text-slate-700 mb-1">
                  Description / spec notes
                </span>
                <textarea
                  name="description"
                  rows={2}
                  className="ix-input w-full"
                  placeholder="Fabric weight, composition, width, or any supplier notes."
                />
              </label>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700"
                >
                  <Plus size={14} /> Create material
                </button>
              </div>
            </form>
          </details>
        )}

        {/* List */}
        <section className="ix-card overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Boxes size={24} className="text-slate-300 mx-auto" />
              <p className="text-sm text-slate-500">
                {summary.total_count === 0
                  ? 'No raw materials yet — add your first fabric, zipper or button above.'
                  : 'No materials match the current filter.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-2 w-14">Img</th>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Code</th>
                    <th className="text-left px-3 py-2">Category</th>
                    <th className="text-right px-3 py-2">Stock</th>
                    <th className="text-right px-3 py-2">Unit cost (EGP)</th>
                    <th className="text-right px-3 py-2">Value (EGP)</th>
                    <th className="text-left px-3 py-2">Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(m => (
                    <MaterialRow
                      key={m.id}
                      m={m}
                      href={buildQs(sp, { material: m.id })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="text-[11px] text-slate-400 border-t border-slate-200 pt-4 space-y-1">
          <p>
            {summary.active_count} active · {summary.low_stock_count} low-stock
            · stock value EGP {fmt(summary.total_stock_value)}.
          </p>
          <p>
            Next up: Bill of Materials. When you're ready, finished
            Shopify products will link to a quantity of each raw material
            here so the BOM auto-computes cost-per-product. Keep this
            catalogue in good shape and that costing lands for free.
          </p>
        </footer>
      </main>

      {selected && (
        <MaterialDetailModal
          m={selected}
          canEdit={canEdit}
          closeHref={buildQs(sp, { material: null, ok: null, err: null })}
        />
      )}
    </>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'indigo' | 'rose' | 'emerald' | 'slate';
}) {
  const toneCls =
    tone === 'indigo'
      ? 'text-indigo-700'
      : tone === 'rose'
        ? 'text-rose-700'
        : tone === 'emerald'
          ? 'text-emerald-700'
          : 'text-slate-800';
  return (
    <div className="ix-card p-4 space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">
        {label}
      </p>
      <p className={`text-2xl font-bold tabular-nums ${toneCls}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 truncate">{sub}</p>}
    </div>
  );
}

function MaterialRow({ m, href }: { m: RawMaterial; href: string }) {
  const categoryLabel =
    RAW_MATERIAL_CATEGORIES.find(c => c.id === m.category)?.label || m.category;
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer group">
      <td className="px-3 py-2">
        <Link href={href} scroll={false} className="block">
          {m.image_url ? (
            <img
              src={m.image_url}
              alt={m.name}
              loading="lazy"
              className="w-12 h-12 rounded-md object-cover border border-slate-200 bg-slate-50"
            />
          ) : (
            <div className="w-12 h-12 rounded-md bg-slate-100 inline-flex items-center justify-center text-slate-400">
              <ImageOff size={16} />
            </div>
          )}
        </Link>
      </td>
      <td className="px-3 py-2 max-w-[320px]">
        <Link href={href} scroll={false} className="block">
          <div className="font-medium truncate group-hover:text-sky-700">
            {m.name}
          </div>
          {(m.subcategory || m.color) && (
            <div className="text-[11px] text-slate-500 truncate">
              {[m.subcategory, m.color].filter(Boolean).join(' · ')}
            </div>
          )}
        </Link>
      </td>
      <td className="px-3 py-2 text-[11px]">
        <Link href={href} scroll={false} className="block">
          {m.code ? (
            <code className="font-mono text-slate-900">{m.code}</code>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </Link>
      </td>
      <td className="px-3 py-2 text-[11px]">
        <Link href={href} scroll={false} className="block">
          <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 capitalize">
            {categoryLabel}
          </span>
        </Link>
      </td>
      <td className="px-3 py-2 text-right tabular-nums font-medium">
        <Link href={href} scroll={false} className="block">
          <span
            className={
              m.qty_on_hand <= 0
                ? 'text-rose-600'
                : m.low_stock
                  ? 'text-amber-600'
                  : ''
            }
          >
            {fmt2(m.qty_on_hand)} {m.unit}
          </span>
          {m.qty_min != null && (
            <div className="text-[10px] text-slate-400">
              min {fmt2(m.qty_min)} {m.unit}
            </div>
          )}
        </Link>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        <Link href={href} scroll={false} className="block">
          {m.unit_cost != null ? fmt2(m.unit_cost) : '—'}
        </Link>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        <Link href={href} scroll={false} className="block">
          {m.stock_value != null ? fmt(m.stock_value) : '—'}
        </Link>
      </td>
      <td className="px-3 py-2 text-[11px] text-slate-500 truncate max-w-[160px]">
        <Link href={href} scroll={false} className="block">
          {m.supplier || '—'}
        </Link>
      </td>
    </tr>
  );
}

function MaterialDetailModal({
  m,
  canEdit,
  closeHref,
}: {
  m: RawMaterial;
  canEdit: boolean;
  closeHref: string;
}) {
  const categoryLabel =
    RAW_MATERIAL_CATEGORIES.find(c => c.id === m.category)?.label || m.category;
  return (
    <>
      <Link
        href={closeHref || '/emails/kika/inventory/raw-materials'}
        scroll={false}
        aria-label="Close material"
        className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[1px]"
      />
      <div
        role="dialog"
        aria-label={`Material ${m.name}`}
        className="fixed inset-0 z-50 pointer-events-none flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      >
        <div className="pointer-events-auto w-full max-w-3xl bg-white rounded-2xl shadow-xl my-4">
          <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap sticky top-0 bg-white rounded-t-2xl z-10">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold tracking-tight">{m.name}</h2>
                <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                  {categoryLabel}
                </span>
                {!m.active && (
                  <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                    archived
                  </span>
                )}
                {m.low_stock && (
                  <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 inline-flex items-center gap-1">
                    <AlertTriangle size={10} /> low stock
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {m.code && <code className="font-mono mr-2">{m.code}</code>}
                {[m.subcategory, m.color].filter(Boolean).join(' · ')}
              </p>
            </div>
            <Link
              href={closeHref || '/emails/kika/inventory/raw-materials'}
              scroll={false}
              className="text-slate-500 hover:text-slate-900 text-sm border border-slate-200 rounded-full px-3 py-1 hover:bg-slate-50"
            >
              Close ×
            </Link>
          </div>

          <div className="px-6 py-5 space-y-5 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                {m.image_url ? (
                  <img
                    src={m.image_url}
                    alt={m.name}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 object-contain max-h-[280px]"
                  />
                ) : (
                  <div className="w-full h-48 rounded-lg bg-slate-100 inline-flex items-center justify-center text-slate-400">
                    <ImageOff size={28} />
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <MetricLine label="Stock on hand" value={`${fmt2(m.qty_on_hand)} ${m.unit}`} emphasis />
                {m.qty_min != null && (
                  <MetricLine label="Reorder minimum" value={`${fmt2(m.qty_min)} ${m.unit}`} />
                )}
                <MetricLine
                  label="Unit cost"
                  value={m.unit_cost != null ? `EGP ${fmt2(m.unit_cost)} / ${m.unit}` : '—'}
                />
                <MetricLine
                  label="Stock value"
                  value={m.stock_value != null ? `EGP ${fmt(m.stock_value)}` : '—'}
                  emphasis
                />
                {m.supplier && (
                  <MetricLine
                    label="Supplier"
                    value={
                      m.supplier_sku
                        ? `${m.supplier} · ${m.supplier_sku}`
                        : m.supplier
                    }
                  />
                )}
                {canEdit && (
                  <div className="pt-2 flex items-center gap-2 flex-wrap">
                    <form action={adjustStockAction} className="inline-flex items-center gap-1">
                      <input type="hidden" name="id" value={m.id} />
                      <input
                        type="number"
                        step="0.001"
                        name="delta"
                        defaultValue="1"
                        className="ix-input w-20 py-1 text-xs"
                      />
                      <button
                        type="submit"
                        className="px-2 py-1 rounded border border-emerald-200 text-emerald-700 text-[11px] hover:bg-emerald-50"
                      >
                        + Stock in
                      </button>
                    </form>
                    <form action={adjustStockAction} className="inline-flex items-center gap-1">
                      <input type="hidden" name="id" value={m.id} />
                      <input
                        type="number"
                        step="0.001"
                        name="delta"
                        defaultValue="-1"
                        className="ix-input w-20 py-1 text-xs"
                      />
                      <button
                        type="submit"
                        className="px-2 py-1 rounded border border-rose-200 text-rose-700 text-[11px] hover:bg-rose-50"
                      >
                        − Stock out
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>

            {m.description && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">
                  Description / spec
                </p>
                <p className="text-[13px] whitespace-pre-wrap bg-slate-50 rounded-lg p-3">
                  {m.description}
                </p>
              </div>
            )}

            {canEdit && (
              <details className="bg-slate-50 rounded-lg p-3">
                <summary className="cursor-pointer text-[12px] font-semibold text-slate-700">
                  Edit fields
                </summary>
                <form action={updateRawMaterial} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={m.id} />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Name" name="name" defaultValue={m.name} required />
                    <Field label="Internal SKU / Code" name="code" defaultValue={m.code || ''} />
                    <SelectField
                      label="Category"
                      name="category"
                      defaultValue={m.category}
                      options={RAW_MATERIAL_CATEGORIES.map(c => ({ id: c.id, label: c.label }))}
                    />
                    <Field label="Subcategory" name="subcategory" defaultValue={m.subcategory || ''} />
                    <Field label="Color" name="color" defaultValue={m.color || ''} />
                    <SelectField
                      label="Unit"
                      name="unit"
                      defaultValue={m.unit}
                      options={RAW_MATERIAL_UNITS}
                    />
                    <Field
                      label="Unit cost (EGP)"
                      name="unit_cost"
                      type="number"
                      step="0.01"
                      defaultValue={m.unit_cost != null ? String(m.unit_cost) : ''}
                    />
                    <Field
                      label="Qty on hand"
                      name="qty_on_hand"
                      type="number"
                      step="0.001"
                      defaultValue={String(m.qty_on_hand)}
                    />
                    <Field
                      label="Min qty"
                      name="qty_min"
                      type="number"
                      step="0.001"
                      defaultValue={m.qty_min != null ? String(m.qty_min) : ''}
                    />
                    <Field label="Supplier" name="supplier" defaultValue={m.supplier || ''} />
                    <Field
                      label="Supplier SKU"
                      name="supplier_sku"
                      defaultValue={m.supplier_sku || ''}
                    />
                    <Field
                      label="Image URL"
                      name="image_url"
                      defaultValue={m.image_url || ''}
                    />
                  </div>
                  <label className="block">
                    <span className="block text-xs font-medium text-slate-700 mb-1">
                      Description / spec notes
                    </span>
                    <textarea
                      name="description"
                      rows={2}
                      className="ix-input w-full"
                      defaultValue={m.description || ''}
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      name="active"
                      defaultChecked={m.active}
                    />
                    <span>Active (visible in catalogue)</span>
                  </label>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 shadow-sm"
                    >
                      <Save size={14} /> Save
                    </button>
                  </div>
                </form>
                <form action={deleteRawMaterial} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={m.id} />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 text-xs font-medium hover:bg-rose-50 hover:border-rose-300"
                  >
                    <Trash2 size={12} /> Delete material
                  </button>
                </form>
              </details>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function MetricLine({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">
        {label}
      </span>
      <span
        className={`text-right tabular-nums ${
          emphasis ? 'text-base font-bold text-slate-900' : 'text-[13px]'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  name,
  required,
  type = 'text',
  step,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  step?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="ix-input w-full"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  required,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-slate-700">{label}</span>
      <select
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="ix-input w-full"
      >
        {options.map(o => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
