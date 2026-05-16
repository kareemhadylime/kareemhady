import 'server-only';
import { supabaseAdmin } from './supabase';

// KIKA Manufacturing report — aggregates open (unfulfilled, non-cancelled)
// orders within the dashboard's period filter, rolls them up per variant,
// and nets against the current Shopify inventory_quantity to compute how
// many of each variant production actually needs to make.
//
// Scope choice (matches user spec):
//   - Time scope is bounded by the dashboard period filter (created_at in
//     [fromDate, toDate]). If the user wants the full open backlog they can
//     widen the picker (e.g. YTD).
//   - "Open" = fulfillment_status NULL/empty/'unfulfilled'/'partial'/
//     'partially_fulfilled', AND cancelled_at IS NULL, AND financial_status
//     NOT IN ('voided', 'cancelled').
//   - Granularity is per-variant. Default Title variants (one-variant
//     products) collapse to product-level naturally.
//   - For each line item we subtract any quantity already shipped via
//     non-cancelled fulfillments (raw.fulfillments[].line_items[].quantity
//     keyed by line_item.id), so partial fulfillments don't inflate the
//     Open qty / Net to make numbers.
//   - In stock is clamped to max(0, inventory_quantity). Negative Shopify
//     stock = oversold past zero, and those units are already counted
//     inside Open qty (Shopify decrements on order placement, not on
//     fulfillment), so leaving them negative double-counts demand.

/** One open order that contains a given variant. Powers the "click the
 * Orders count to see which orders contain this variant" popup. */
export type VariantOrder = {
  order_id: number;
  order_name: string;
  customer_name: string | null;
  email: string | null;
  created_at: string | null;
  age_days: number | null;
  /** Remaining qty of this variant in this order (after partial fulfillments). */
  qty: number;
};

export type ManufacturingRow = {
  product_id: number;
  variant_id: number | null;
  product_title: string;
  variant_title: string | null;
  sku: string | null;
  image_url: string | null;
  short_description: string | null;
  /** Total qty across open unfulfilled orders. */
  open_qty: number;
  /** Current Shopify inventory_quantity on this variant. */
  in_stock: number;
  /** max(0, open_qty - in_stock) — what production actually needs to make. */
  net_to_make: number;
  /** How many distinct open orders this variant appears in. */
  order_count: number;
  /** The actual orders behind that count. */
  orders: VariantOrder[];
  /** Earliest created_at of any open order this variant appears in. */
  oldest_order_date: string | null;
  oldest_age_days: number | null;
};

export type ManufacturingReport = {
  fromDate: string;
  toDate: string;
  label: string;
  rows: ManufacturingRow[];
  totals: {
    total_open_units: number;
    total_net_to_make: number;
    distinct_variants: number;
    distinct_products: number;
    open_order_count: number;
  };
};

const OPEN_FULFILLMENT = new Set([
  '',
  'unfulfilled',
  'partial',
  'partially_fulfilled',
  'partially-fulfilled',
]);

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

function pickProductImage(
  raw: Record<string, unknown> | null,
  variantId: number | null
): string | null {
  if (!raw) return null;
  const images = (raw['images'] as Array<Record<string, unknown>> | null) || [];
  if (variantId) {
    const variants = (raw['variants'] as Array<Record<string, unknown>> | null) || [];
    const v = variants.find(x => Number(x['id']) === variantId);
    const imageId = v && v['image_id'] != null ? Number(v['image_id']) : null;
    if (imageId) {
      const match = images.find(im => Number(im['id']) === imageId);
      if (match && typeof match['src'] === 'string') return match['src'] as string;
    }
  }
  const primary = (raw['image'] as Record<string, unknown> | null) || images[0] || null;
  if (primary && typeof primary['src'] === 'string') return primary['src'] as string;
  return null;
}

function pickVariantTitle(
  raw: Record<string, unknown> | null,
  variantId: number | null
): string | null {
  if (!raw || !variantId) return null;
  const variants = (raw['variants'] as Array<Record<string, unknown>> | null) || [];
  const v = variants.find(x => Number(x['id']) === variantId);
  if (!v) return null;
  const t = typeof v['title'] === 'string' ? (v['title'] as string) : null;
  if (t && t.toLowerCase() !== 'default title') return t;
  const opts = [v['option1'], v['option2'], v['option3']]
    .filter(o => typeof o === 'string' && o)
    .map(o => o as string);
  return opts.length > 0 ? opts.join(' / ') : null;
}

function pickVariantStock(
  raw: Record<string, unknown> | null,
  variantId: number | null
): number {
  if (!raw || !variantId) return 0;
  const variants = (raw['variants'] as Array<Record<string, unknown>> | null) || [];
  const v = variants.find(x => Number(x['id']) === variantId);
  if (!v) return 0;
  const qty = Number(v['inventory_quantity']);
  if (!Number.isFinite(qty)) return 0;
  // Negative inventory_quantity in Shopify usually means "oversold past zero"
  // — those units are already represented inside Open qty (Shopify decrements
  // inventory_quantity on order placement, not on fulfillment). Clamping to 0
  // here prevents double-counting the same demand twice in net_to_make.
  return Math.max(0, qty);
}

export async function buildKikaManufacturingReport(params: {
  fromDate: string; // YYYY-MM-DD inclusive
  toDate: string;
  label: string;
}): Promise<ManufacturingReport> {
  const sb = supabaseAdmin();

  // 1. Pull open unfulfilled, non-cancelled orders in the window. We need
  // `raw` for the fulfillments[] array so we can subtract already-shipped
  // qty from each line item in partial orders. We also pull `name`,
  // `customer_name`, `email` so each manufacturing row can carry a list
  // of the orders behind its count (for the click-through popup).
  type OrderRow = {
    id: number;
    name: string | null;
    customer_name: string | null;
    email: string | null;
    created_at: string | null;
    fulfillment_status: string | null;
    financial_status: string | null;
    cancelled_at: string | null;
    raw: Record<string, unknown> | null;
  };
  const orders: OrderRow[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from('shopify_orders')
      .select('id, name, customer_name, email, created_at, fulfillment_status, financial_status, cancelled_at, raw')
      .gte('created_at', `${params.fromDate}T00:00:00Z`)
      .lt('created_at', `${params.toDate}T23:59:59Z`)
      .is('cancelled_at', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`mfg orders: ${error.message}`);
    const rows = (data as OrderRow[]) || [];
    if (rows.length === 0) break;
    orders.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  const openOrders = orders.filter(o => {
    const fs = (o.fulfillment_status || '').toLowerCase();
    if (!OPEN_FULFILLMENT.has(fs)) return false;
    const finStatus = (o.financial_status || '').toLowerCase();
    if (finStatus === 'voided' || finStatus === 'cancelled') return false;
    return true;
  });

  if (openOrders.length === 0) {
    return {
      fromDate: params.fromDate,
      toDate: params.toDate,
      label: params.label,
      rows: [],
      totals: {
        total_open_units: 0,
        total_net_to_make: 0,
        distinct_variants: 0,
        distinct_products: 0,
        open_order_count: 0,
      },
    };
  }

  const openOrderIds = openOrders.map(o => o.id);
  const orderCreatedById = new Map(openOrders.map(o => [o.id, o.created_at]));
  const orderInfoById = new Map<
    number,
    { name: string | null; customer_name: string | null; email: string | null; created_at: string | null }
  >(
    openOrders.map(o => [
      o.id,
      {
        name: o.name,
        customer_name: o.customer_name,
        email: o.email,
        created_at: o.created_at,
      },
    ])
  );

  // 1b. Build a {line_item_id -> already_fulfilled_qty} map from the
  // fulfillments embedded in each order's raw payload. We ignore any
  // fulfillment whose status is 'cancelled' or 'failure' — those didn't
  // ship and shouldn't reduce the open qty.
  const fulfilledByLineItemId = new Map<number, number>();
  for (const o of openOrders) {
    const raw = (o.raw || {}) as Record<string, unknown>;
    const fulfillments =
      (raw['fulfillments'] as Array<Record<string, unknown>> | null) || [];
    for (const f of fulfillments) {
      const status =
        (typeof f['status'] === 'string' ? (f['status'] as string) : '').toLowerCase();
      if (status === 'cancelled' || status === 'failure') continue;
      const flines =
        (f['line_items'] as Array<Record<string, unknown>> | null) || [];
      for (const fl of flines) {
        const id = Number(fl['id']);
        const qty = Number(fl['quantity']);
        if (!Number.isFinite(id) || !Number.isFinite(qty) || qty <= 0) continue;
        fulfilledByLineItemId.set(id, (fulfilledByLineItemId.get(id) || 0) + qty);
      }
    }
  }

  // 2. Pull line items for those orders. We need `id` so we can look it up
  // in fulfilledByLineItemId for partial-fulfillment netting.
  type LineRow = {
    id: number;
    order_id: number;
    product_id: number | null;
    variant_id: number | null;
    title: string | null;
    name: string | null;
    sku: string | null;
    quantity: number | null;
  };
  const lines: LineRow[] = [];
  for (let i = 0; i < openOrderIds.length; i += 500) {
    const chunk = openOrderIds.slice(i, i + 500);
    const { data, error } = await sb
      .from('shopify_line_items')
      .select('id, order_id, product_id, variant_id, title, name, sku, quantity')
      .in('order_id', chunk);
    if (error) throw new Error(`mfg lines: ${error.message}`);
    lines.push(...((data as LineRow[]) || []));
  }

  // 3. Pull product rows for the products that appear.
  const productIds = Array.from(
    new Set(
      lines.map(l => l.product_id).filter((p): p is number => typeof p === 'number' && p > 0)
    )
  );
  type ProductRow = {
    id: number;
    title: string | null;
    raw: Record<string, unknown> | null;
  };
  const productMap = new Map<number, ProductRow>();
  for (let i = 0; i < productIds.length; i += 500) {
    const chunk = productIds.slice(i, i + 500);
    const { data, error } = await sb
      .from('shopify_products')
      .select('id, title, raw')
      .in('id', chunk);
    if (error) throw new Error(`mfg products: ${error.message}`);
    for (const p of (data ?? []) as ProductRow[]) {
      productMap.set(p.id, p);
    }
  }

  // 4. Aggregate per (product_id, variant_id). Per-order qty is tracked in
  // a nested map so the same variant appearing on two line items in the
  // same order (rare but possible) sums correctly, and so we can emit a
  // VariantOrder[] list for the click-through popup.
  type Bucket = {
    product_id: number;
    variant_id: number | null;
    line_title_seed: string | null;   // fallback if product row missing
    line_sku_seed: string | null;
    open_qty: number;
    qtyByOrderId: Map<number, number>;
    oldest_order_date: string | null;
  };
  const buckets = new Map<string, Bucket>();
  const todayMs = Date.now();
  for (const li of lines) {
    if (!li.product_id) continue; // skip free-text line items
    const totalQty = Number(li.quantity) || 0;
    const alreadyShipped = fulfilledByLineItemId.get(li.id) || 0;
    const remaining = Math.max(0, totalQty - alreadyShipped);
    if (remaining === 0) continue; // line is fully shipped, nothing to make
    const key = `${li.product_id}::${li.variant_id ?? 0}`;
    const b: Bucket = buckets.get(key) || {
      product_id: li.product_id,
      variant_id: li.variant_id ?? null,
      line_title_seed: li.title ?? li.name ?? null,
      line_sku_seed: li.sku ?? null,
      open_qty: 0,
      qtyByOrderId: new Map(),
      oldest_order_date: null,
    };
    b.open_qty += remaining;
    b.qtyByOrderId.set(li.order_id, (b.qtyByOrderId.get(li.order_id) || 0) + remaining);
    const created = orderCreatedById.get(li.order_id) || null;
    if (created) {
      if (!b.oldest_order_date || created < b.oldest_order_date) {
        b.oldest_order_date = created;
      }
    }
    buckets.set(key, b);
  }

  // 5. Project to ManufacturingRow + compute net.
  const rows: ManufacturingRow[] = [];
  for (const b of buckets.values()) {
    const product = productMap.get(b.product_id);
    const productRaw = product?.raw ?? null;
    const inStock = pickVariantStock(productRaw, b.variant_id);
    const netToMake = Math.max(0, b.open_qty - inStock);
    const oldestMs = b.oldest_order_date ? Date.parse(b.oldest_order_date) : null;
    const ageDays = oldestMs && Number.isFinite(oldestMs)
      ? Math.floor((todayMs - oldestMs) / 86_400_000)
      : null;
    const productTitle =
      product?.title || b.line_title_seed || '(unknown product)';
    const variantTitle = pickVariantTitle(productRaw, b.variant_id);
    const sku =
      b.line_sku_seed ||
      // Fall back to the variant's sku if line item didn't carry it
      (productRaw && b.variant_id
        ? (() => {
            const vs = (productRaw['variants'] as Array<Record<string, unknown>> | null) || [];
            const v = vs.find(x => Number(x['id']) === b.variant_id);
            return v && typeof v['sku'] === 'string' ? (v['sku'] as string) : null;
          })()
        : null);
    const desc = productRaw && typeof productRaw['body_html'] === 'string'
      ? stripHtml(productRaw['body_html'] as string)
      : null;
    // Build the per-row order list — sorted oldest first so production sees
    // the urgent backlog first when they pop it open.
    const variantOrders: VariantOrder[] = Array.from(b.qtyByOrderId.entries())
      .map(([orderId, qty]) => {
        const info = orderInfoById.get(orderId);
        const created = info?.created_at ?? null;
        const createdMs = created ? Date.parse(created) : null;
        const orderAge =
          createdMs && Number.isFinite(createdMs)
            ? Math.floor((todayMs - createdMs) / 86_400_000)
            : null;
        return {
          order_id: orderId,
          order_name: info?.name || `#${orderId}`,
          customer_name: info?.customer_name ?? null,
          email: info?.email ?? null,
          created_at: created,
          age_days: orderAge,
          qty,
        };
      })
      .sort((x, y) => {
        // Oldest first. Nulls sink to the bottom.
        if (x.created_at && y.created_at) return x.created_at.localeCompare(y.created_at);
        if (x.created_at) return -1;
        if (y.created_at) return 1;
        return 0;
      });
    rows.push({
      product_id: b.product_id,
      variant_id: b.variant_id,
      product_title: productTitle,
      variant_title: variantTitle,
      sku,
      image_url: pickProductImage(productRaw, b.variant_id),
      short_description: desc,
      open_qty: b.open_qty,
      in_stock: inStock,
      net_to_make: netToMake,
      order_count: variantOrders.length,
      orders: variantOrders,
      oldest_order_date: b.oldest_order_date,
      oldest_age_days: ageDays,
    });
  }

  // Default sort: by net_to_make desc (most urgent first), then by oldest age.
  rows.sort((a, b) => {
    if (b.net_to_make !== a.net_to_make) return b.net_to_make - a.net_to_make;
    return (b.oldest_age_days ?? 0) - (a.oldest_age_days ?? 0);
  });

  return {
    fromDate: params.fromDate,
    toDate: params.toDate,
    label: params.label,
    rows,
    totals: {
      total_open_units: rows.reduce((s, r) => s + r.open_qty, 0),
      total_net_to_make: rows.reduce((s, r) => s + r.net_to_make, 0),
      distinct_variants: rows.length,
      distinct_products: new Set(rows.map(r => r.product_id)).size,
      open_order_count: openOrders.length,
    },
  };
}
