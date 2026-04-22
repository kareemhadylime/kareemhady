import { supabaseAdmin } from './supabase';

// Kika Inventory — product catalogue view backed by the shopify_products
// mirror table. The bulk sync persists the full Shopify REST payload in the
// `raw` jsonb column, so per-variant SKUs, full image arrays, description
// HTML, and vendor all come from there (the top-level columns only carry
// the summary fields: total_inventory, variant_count, tags[], status).

export type KikaProductRow = {
  id: number;
  title: string;
  handle: string | null;        // 'valentina-set' — short-name / URL slug
  status: string | null;        // active / archived / draft
  product_type: string | null;
  vendor: string | null;
  tags: string[];
  total_inventory: number | null;
  variant_count: number | null;
  primary_sku: string | null;   // first variant SKU (or null if none)
  sku_count: number;            // distinct non-empty variant SKUs
  primary_image_url: string | null;
  image_count: number;
};

export async function listKikaProducts(
  opts: { search?: string; status?: 'active' | 'any'; limit?: number } = {}
): Promise<KikaProductRow[]> {
  const sb = supabaseAdmin();
  let query = sb
    .from('shopify_products')
    .select(
      'id, title, handle, status, product_type, vendor, tags, total_inventory, variant_count, raw'
    )
    .order('total_inventory', { ascending: false, nullsFirst: false })
    .limit(opts.limit ?? 1000);
  if (opts.status !== 'any') query = query.eq('status', 'active');
  if (opts.search && opts.search.trim()) {
    const s = opts.search.trim();
    // .or() on Supabase requires PostgREST-style filter string. `ilike.*term*`
    // for case-insensitive substring match.
    const needle = s.replace(/[,()]/g, ' ');
    query = query.or(
      `title.ilike.%${needle}%,handle.ilike.%${needle}%,product_type.ilike.%${needle}%`
    );
  }
  const { data, error } = await query;
  if (error) throw new Error(`listKikaProducts: ${error.message}`);
  const rows = (data || []) as Array<{
    id: number;
    title: string | null;
    handle: string | null;
    status: string | null;
    product_type: string | null;
    vendor: string | null;
    tags: string[] | null;
    total_inventory: number | null;
    variant_count: number | null;
    raw: Record<string, unknown> | null;
  }>;
  return rows.map(r => {
    const raw = (r.raw || {}) as Record<string, unknown>;
    const variants = (raw['variants'] as Array<Record<string, unknown>> | null) || [];
    const images = (raw['images'] as Array<Record<string, unknown>> | null) || [];
    const primaryImageObj =
      (raw['image'] as Record<string, unknown> | null) || images[0] || null;
    const primaryImageUrl =
      primaryImageObj && typeof primaryImageObj['src'] === 'string'
        ? (primaryImageObj['src'] as string)
        : null;
    const firstSku = variants
      .map(v => (typeof v['sku'] === 'string' ? (v['sku'] as string).trim() : ''))
      .find(s => s.length > 0) || null;
    const skuCount = new Set(
      variants
        .map(v =>
          typeof v['sku'] === 'string' ? (v['sku'] as string).trim() : ''
        )
        .filter(s => s.length > 0)
    ).size;
    return {
      id: r.id,
      title: r.title || '(untitled)',
      handle: r.handle,
      status: r.status,
      product_type: r.product_type,
      vendor: r.vendor,
      tags: Array.isArray(r.tags) ? r.tags : [],
      total_inventory: r.total_inventory,
      variant_count: r.variant_count,
      primary_sku: firstSku,
      sku_count: skuCount,
      primary_image_url: primaryImageUrl,
      image_count: images.length || (primaryImageObj ? 1 : 0),
    };
  });
}

// --- Per-product drill-down ---

export type KikaProductVariant = {
  id: number | string;
  title: string | null;
  sku: string | null;
  price: number | null;
  compare_at_price: number | null;
  inventory_quantity: number | null;
  weight: number | null;
  weight_unit: string | null;
  barcode: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
};

export type KikaProductImage = {
  id: number | string;
  src: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
};

export type KikaProductDetail = {
  id: number;
  title: string;
  handle: string | null;
  status: string | null;
  product_type: string | null;
  vendor: string | null;
  tags: string[];
  total_inventory: number | null;
  body_html: string | null;      // raw Shopify description HTML
  created_at: string | null;
  updated_at: string | null;
  published_at: string | null;
  images: KikaProductImage[];
  variants: KikaProductVariant[];
  storefront_url: string | null;
  admin_url: string | null;
};

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function pickNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function fetchKikaProductDetail(
  idOrHandle: string
): Promise<KikaProductDetail | null> {
  const sb = supabaseAdmin();
  const asNum = Number(idOrHandle);
  let query = sb
    .from('shopify_products')
    .select(
      'id, title, handle, status, product_type, vendor, tags, total_inventory, created_at, updated_at, raw'
    );
  if (Number.isFinite(asNum) && asNum > 0) query = query.eq('id', asNum);
  else query = query.eq('handle', idOrHandle);
  const { data } = await query.maybeSingle();
  if (!data) return null;
  const r = data as {
    id: number;
    title: string | null;
    handle: string | null;
    status: string | null;
    product_type: string | null;
    vendor: string | null;
    tags: string[] | null;
    total_inventory: number | null;
    created_at: string | null;
    updated_at: string | null;
    raw: Record<string, unknown> | null;
  };
  const raw = (r.raw || {}) as Record<string, unknown>;
  const images = ((raw['images'] as Array<Record<string, unknown>> | null) || []).map(
    img => ({
      id: (img['id'] as number | string | undefined) ?? '',
      src: pickString(img, 'src'),
      alt: pickString(img, 'alt'),
      width: pickNumber(img, 'width'),
      height: pickNumber(img, 'height'),
    })
  );
  const variants = ((raw['variants'] as Array<Record<string, unknown>> | null) || []).map(
    v => ({
      id: (v['id'] as number | string | undefined) ?? '',
      title: pickString(v, 'title'),
      sku: pickString(v, 'sku'),
      price: pickNumber(v, 'price'),
      compare_at_price: pickNumber(v, 'compare_at_price'),
      inventory_quantity: pickNumber(v, 'inventory_quantity'),
      weight: pickNumber(v, 'weight'),
      weight_unit: pickString(v, 'weight_unit'),
      barcode: pickString(v, 'barcode'),
      option1: pickString(v, 'option1'),
      option2: pickString(v, 'option2'),
      option3: pickString(v, 'option3'),
    })
  );

  // Build storefront + admin URLs best-effort. Shopify store domain comes
  // from the sync helper, but a reasonable default for kika-swim-wear is:
  const storefrontBase = 'https://thekikastore.com';
  const adminBase =
    'https://admin.shopify.com/store/kika-swim-wear/products';
  const handle = r.handle;
  return {
    id: r.id,
    title: r.title || '(untitled)',
    handle,
    status: r.status,
    product_type: r.product_type,
    vendor: r.vendor,
    tags: Array.isArray(r.tags) ? r.tags : [],
    total_inventory: r.total_inventory,
    body_html: pickString(raw, 'body_html'),
    created_at: r.created_at,
    updated_at: r.updated_at,
    published_at: pickString(raw, 'published_at'),
    images,
    variants,
    storefront_url: handle ? `${storefrontBase}/products/${handle}` : null,
    admin_url: `${adminBase}/${r.id}`,
  };
}
