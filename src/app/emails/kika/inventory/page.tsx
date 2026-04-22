import Link from 'next/link';
import {
  ChevronRight,
  Search,
  ImageOff,
  ExternalLink,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { SyncPills } from '@/app/_components/sync-pills';
import { getSyncFreshness } from '@/lib/sync-freshness';
import {
  listKikaProducts,
  fetchKikaProductDetail,
  type KikaProductRow,
  type KikaProductDetail,
} from '@/lib/kika-inventory';
import { InventoryTabs } from './_components/inventory-tabs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function buildQs(
  current: { search?: string; status?: string; product?: string },
  next: Partial<{ search: string | null; status: string | null; product: string | null }>
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

export default async function KikaInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; product?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter: 'active' | 'any' = sp.status === 'any' ? 'any' : 'active';
  const [products, pills, productDetail] = await Promise.all([
    listKikaProducts({ search: sp.search, status: statusFilter }),
    getSyncFreshness(['shopify']),
    sp.product ? fetchKikaProductDetail(sp.product) : Promise.resolve(null),
  ]);

  return (
    <>
      <TopNav>
        <Link href="/emails" className="ix-link">Emails</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/emails/kika" className="ix-link">KIKA</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Inventory</span>
      </TopNav>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-6 flex-1">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              KIKA · Inventory
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              Product catalogue
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {products.length.toLocaleString('en-US')}{' '}
              {statusFilter === 'active' ? 'active' : 'all'} product
              {products.length === 1 ? '' : 's'} synced from kika-swim-wear.
              Click any row for full variants, images, and description.
            </p>
            <div className="mt-2"><SyncPills pills={pills} /></div>
          </div>
        </header>

        <InventoryTabs active="products" />

        {/* Filter bar */}
        <section className="ix-card p-4 flex items-center gap-3 flex-wrap">
          <form action="" method="get" className="flex items-center gap-2 flex-wrap">
            {sp.status && (
              <input type="hidden" name="status" value={sp.status} />
            )}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="search"
                name="search"
                defaultValue={sp.search || ''}
                placeholder="Search title / handle / type…"
                className="ix-input pl-8 w-[280px]"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
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
          <div className="ml-auto flex items-center gap-1.5 text-[11px]">
            <Link
              href={buildQs(sp, { status: statusFilter === 'any' ? null : null })}
              className={`px-2 py-1 rounded ${
                statusFilter === 'active'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
              }`}
            >
              Active
            </Link>
            <Link
              href={buildQs(sp, { status: 'any' })}
              className={`px-2 py-1 rounded ${
                statusFilter === 'any'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
              }`}
            >
              All statuses
            </Link>
          </div>
        </section>

        {/* Product list */}
        <section className="ix-card overflow-hidden">
          {products.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-500">
              No products match your filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-2 w-16">Image</th>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Short name</th>
                    <th className="text-left px-3 py-2">Primary SKU</th>
                    <th className="text-right px-3 py-2">In stock</th>
                    <th className="text-right px-3 py-2">Variants</th>
                    <th className="text-left px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <ProductRow key={p.id} p={p} hrefFor={() => buildQs(sp, { product: String(p.id) })} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="text-[11px] text-slate-400 border-t border-slate-200 pt-4">
          Source: shopify_products mirror · rows snapshot the Shopify REST
          payload in <code className="text-[10px]">raw</code> jsonb so images,
          variants + SKUs, and body_html description are always at-hand. Daily
          sync ~04:45 UTC; manual trigger at{' '}
          <code className="text-[10px]">/api/shopify/run-now</code>.
        </footer>
      </main>

      {productDetail && (
        <ProductDetailModal
          product={productDetail}
          closeHref={buildQs(sp, { product: null })}
        />
      )}
    </>
  );
}

function ProductRow({
  p,
  hrefFor,
}: {
  p: KikaProductRow;
  hrefFor: () => string;
}) {
  const href = hrefFor();
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer group">
      <td className="px-3 py-2">
        <Link href={href} scroll={false} className="block">
          {p.primary_image_url ? (
            <img
              src={p.primary_image_url}
              alt={p.title}
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
          <div className="font-medium truncate group-hover:text-emerald-700">
            {p.title}
          </div>
          {p.product_type && (
            <div className="text-[11px] text-slate-500 truncate">
              {p.product_type}
              {p.vendor ? ` · ${p.vendor}` : ''}
            </div>
          )}
        </Link>
      </td>
      <td className="px-3 py-2 text-[11px]">
        <Link href={href} scroll={false} className="block">
          {p.handle ? (
            <code className="font-mono text-slate-600">{p.handle}</code>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </Link>
      </td>
      <td className="px-3 py-2 text-[11px]">
        <Link href={href} scroll={false} className="block">
          {p.primary_sku ? (
            <code className="font-mono text-slate-900">{p.primary_sku}</code>
          ) : (
            <span className="text-slate-400">—</span>
          )}
          {p.sku_count > 1 && (
            <span className="text-[10px] text-slate-500 ml-1.5">
              +{p.sku_count - 1} more
            </span>
          )}
        </Link>
      </td>
      <td className="px-3 py-2 text-right tabular-nums font-medium">
        {p.total_inventory != null ? (
          <span
            className={
              p.total_inventory === 0
                ? 'text-rose-600'
                : p.total_inventory < 5
                  ? 'text-amber-600'
                  : ''
            }
          >
            {fmt(p.total_inventory)}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
        {p.variant_count ?? '—'}
      </td>
      <td className="px-3 py-2 text-[11px]">
        <span
          className={`inline-block px-1.5 py-0.5 rounded capitalize font-medium ${
            p.status === 'active'
              ? 'bg-emerald-50 text-emerald-700'
              : p.status === 'draft'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-slate-100 text-slate-500'
          }`}
        >
          {p.status || 'unknown'}
        </span>
      </td>
    </tr>
  );
}

function ProductDetailModal({
  product,
  closeHref,
}: {
  product: KikaProductDetail;
  closeHref: string;
}) {
  return (
    <>
      <Link
        href={closeHref || '/emails/kika/inventory'}
        scroll={false}
        aria-label="Close product"
        className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[1px]"
      />
      <div
        role="dialog"
        aria-label={`Product ${product.title}`}
        className="fixed inset-0 z-50 pointer-events-none flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      >
        <div className="pointer-events-auto w-full max-w-4xl bg-white rounded-2xl shadow-xl my-4">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap sticky top-0 bg-white rounded-t-2xl z-10">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold tracking-tight">
                  {product.title}
                </h2>
                <span
                  className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${
                    product.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700'
                      : product.status === 'draft'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {product.status || 'unknown'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {product.handle && (
                  <code className="font-mono mr-2">{product.handle}</code>
                )}
                {product.product_type || '—'}
                {product.vendor ? ` · ${product.vendor}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {product.storefront_url && (
                <a
                  href={product.storefront_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-emerald-700"
                >
                  Storefront <ExternalLink size={10} />
                </a>
              )}
              {product.admin_url && (
                <a
                  href={product.admin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-emerald-700"
                >
                  Shopify admin <ExternalLink size={10} />
                </a>
              )}
              <Link
                href={closeHref || '/emails/kika/inventory'}
                scroll={false}
                className="text-slate-500 hover:text-slate-900 text-sm border border-slate-200 rounded-full px-3 py-1 hover:bg-slate-50"
              >
                Close ×
              </Link>
            </div>
          </div>

          <div className="px-6 py-5 space-y-6 text-sm">
            {/* Images gallery */}
            {product.images.length > 0 ? (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-2">
                  Images ({product.images.length})
                </p>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {product.images.map(img => (
                    <a
                      key={img.id}
                      href={img.src || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 block"
                      title={img.alt || product.title}
                    >
                      {img.src ? (
                        <img
                          src={img.src}
                          alt={img.alt || product.title}
                          loading="lazy"
                          className="h-48 w-auto rounded-lg border border-slate-200 bg-slate-50 object-contain"
                        />
                      ) : (
                        <div className="h-48 w-48 rounded-lg bg-slate-100 inline-flex items-center justify-center text-slate-400">
                          <ImageOff size={24} />
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-slate-500 text-[12px] italic">
                No images on this product.
              </div>
            )}

            {/* Variants */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-2">
                Variants ({product.variants.length})
              </p>
              {product.variants.length === 0 ? (
                <p className="text-slate-500 text-[12px]">—</p>
              ) : (
                <div className="overflow-x-auto border border-slate-100 rounded-lg">
                  <table className="w-full text-[12px]">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="text-left px-3 py-1.5">Variant</th>
                        <th className="text-left px-3 py-1.5">SKU</th>
                        <th className="text-left px-3 py-1.5">Barcode</th>
                        <th className="text-right px-3 py-1.5">Price (EGP)</th>
                        <th className="text-right px-3 py-1.5">In stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.variants.map(v => (
                        <tr key={v.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5">
                            <div className="font-medium">{v.title || '—'}</div>
                            {[v.option1, v.option2, v.option3]
                              .filter(Boolean)
                              .length > 0 && (
                              <div className="text-[10px] text-slate-500">
                                {[v.option1, v.option2, v.option3]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[11px]">
                            {v.sku || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">
                            {v.barcode || '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {v.price != null ? fmt(v.price) : '—'}
                            {v.compare_at_price != null &&
                              v.compare_at_price > (v.price || 0) && (
                                <div className="text-[10px] text-slate-400 line-through">
                                  {fmt(v.compare_at_price)}
                                </div>
                              )}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {v.inventory_quantity != null ? (
                              <span
                                className={
                                  v.inventory_quantity === 0
                                    ? 'text-rose-600'
                                    : v.inventory_quantity < 5
                                      ? 'text-amber-600'
                                      : ''
                                }
                              >
                                {fmt(v.inventory_quantity)}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Description */}
            {product.body_html && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-2">
                  Description
                </p>
                {/* Shopify body_html renders as-is — admin-only view so the
                    trade-off on dangerouslySetInnerHTML is acceptable here
                    (tenant controls every product description). */}
                <div
                  className="prose prose-sm max-w-none prose-slate text-[13px]"
                  dangerouslySetInnerHTML={{ __html: product.body_html }}
                />
              </div>
            )}

            {/* Meta */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                  Inventory
                </p>
                <p className="text-2xl font-bold tabular-nums mt-0.5">
                  {product.total_inventory != null
                    ? fmt(product.total_inventory)
                    : '—'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {product.variants.length} variant
                  {product.variants.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="space-y-1 text-[12px]">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">
                  Meta
                </p>
                <MetaRow label="Product ID" value={String(product.id)} mono />
                {product.tags.length > 0 && (
                  <MetaRow label="Tags" value={product.tags.join(', ')} />
                )}
                {product.created_at && (
                  <MetaRow
                    label="Created"
                    value={new Date(product.created_at).toLocaleDateString('en-US')}
                  />
                )}
                {product.updated_at && (
                  <MetaRow
                    label="Updated"
                    value={new Date(product.updated_at).toLocaleDateString('en-US')}
                  />
                )}
                {product.published_at && (
                  <MetaRow
                    label="Published"
                    value={new Date(product.published_at).toLocaleDateString('en-US')}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={`text-right truncate max-w-[260px] ${
          mono ? 'font-mono text-[11px]' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
