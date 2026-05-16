import 'server-only';

export type PickerScope = 'all' | 'older_than_7d' | 'older_than_14d' | 'this_week';

export type PickerOrderLine = {
  qty: number;
  product_title: string;
  variant_title: string | null;
  sku: string | null;
};

export type PickerOrder = {
  id: number;
  name: string;
  customer_name: string | null;
  email: string | null;
  created_at: string | null;
  age_days: number | null;
  remaining_line_count: number;
  remaining_unit_count: number;
  lines: PickerOrderLine[];
};

export type PickerBucket = {
  key: 1 | 2 | 3 | 4;
  label: string;
  orders: PickerOrder[];
  total_orders: number;
  total_units: number;
  oldest_age_days: number | null;
};

export type PickerCommonVariant = {
  variant_id: number | null;
  variant_title: string | null;
  sku: string | null;
  orders: number;
  units: number;
};

export type PickerCommonItem = {
  product_id: number;
  product_title: string;
  short_description: string | null;
  image_url: string | null;
  variants: PickerCommonVariant[];
  total_orders: number;
  total_units: number;
};

export type PickerReport = {
  scope: PickerScope;
  scope_label: string;
  generated_at: string;
  totals: {
    open_orders: number;
    total_lines: number;
    total_units: number;
    oldest_age_days: number | null;
  };
  buckets: PickerBucket[];
  common_items: PickerCommonItem[];
};

// ----- Pure helpers -----

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Cairo wall-clock date+weekday at the given instant. */
function cairoLocalParts(now: Date): {
  year: number;
  month: number;
  day: number;
  weekday: string; // 'Mon' | 'Tue' | …
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: get('weekday'),
  };
}

/** Cairo UTC offset at the given instant, as an ISO suffix like '+02:00' or '+03:00'. */
function cairoOffsetSuffix(at: Date): string {
  const tz = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Cairo',
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find(p => p.type === 'timeZoneName')?.value;
  // tz is like 'GMT+03:00' or 'GMT+02:00'. Fall back to +02:00 (EET) if Intl
  // ever fails to produce it (shouldn't happen on any modern runtime).
  return tz ? tz.replace('GMT', '') : '+02:00';
}

/** ISO timestamp for Cairo-local Monday 00:00 of the week containing `now`. */
function cairoMondayIso(now: Date): string {
  const { year, month, day, weekday } = cairoLocalParts(now);
  const WEEKDAY_INDEX: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  const daysSinceMonday = WEEKDAY_INDEX[weekday];
  if (daysSinceMonday === undefined) {
    throw new Error(`cairoMondayIso: unrecognized weekday abbreviation "${weekday}"`);
  }
  // Build the Monday date in UTC space first (purely arithmetic).
  const mondayUtc = new Date(Date.UTC(year, month - 1, day - daysSinceMonday));
  const isoDate = `${mondayUtc.getUTCFullYear()}-${pad(mondayUtc.getUTCMonth() + 1)}-${pad(mondayUtc.getUTCDate())}`;
  // Use midday Cairo on that Monday to ask Intl for the correct offset
  // (avoids any DST-transition ambiguity at 00:00 itself).
  const offset = cairoOffsetSuffix(new Date(`${isoDate}T12:00:00Z`));
  return `${isoDate}T00:00:00${offset}`;
}

/** Resolves a scope choice to ISO timestamp bounds and a human label.
 * - `all`: no bounds
 * - `older_than_7d` / `older_than_14d`: orders created strictly before (now − N days)
 * - `this_week`: orders created on or after Cairo-local Monday 00:00
 * All non-null bounds are full ISO timestamps (with `Z` for UTC or `±HH:MM`
 * for Cairo), so consumers can pass them directly to Supabase comparisons.
 */
export function resolveScope(
  scope: PickerScope,
  now: Date
): { fromDate: string | null; toDate: string | null; label: string } {
  switch (scope) {
    case 'older_than_7d': {
      const cutoff = new Date(now.getTime() - 7 * 86_400_000);
      return { fromDate: null, toDate: cutoff.toISOString(), label: 'Older than 7 days' };
    }
    case 'older_than_14d': {
      const cutoff = new Date(now.getTime() - 14 * 86_400_000);
      return { fromDate: null, toDate: cutoff.toISOString(), label: 'Older than 14 days' };
    }
    case 'this_week':
      return { fromDate: cairoMondayIso(now), toDate: null, label: 'This week' };
    case 'all':
    default:
      return { fromDate: null, toDate: null, label: 'All open backlog' };
  }
}

/** Maps a remaining-line-count to its bucket key. Clamps to [1, 4]. */
export function bucketKey(remainingLineCount: number): 1 | 2 | 3 | 4 {
  if (remainingLineCount <= 1) return 1;
  if (remainingLineCount === 2) return 2;
  if (remainingLineCount === 3) return 3;
  return 4;
}

/** Remaining qty for a line item after subtracting already-fulfilled qty.
 * Clamped to ≥ 0 (defensive against over-fulfillment data drift). */
export function netRemaining(quantity: number, alreadyFulfilled: number): number {
  const remaining = quantity - alreadyFulfilled;
  return remaining > 0 ? remaining : 0;
}

import { supabaseAdmin } from './supabase';

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

function pickPrimaryImage(
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

function pickVariantSku(
  raw: Record<string, unknown> | null,
  variantId: number | null
): string | null {
  if (!raw || !variantId) return null;
  const variants = (raw['variants'] as Array<Record<string, unknown>> | null) || [];
  const v = variants.find(x => Number(x['id']) === variantId);
  return v && typeof v['sku'] === 'string' ? (v['sku'] as string) : null;
}

export async function buildKikaPickerReport(params: {
  scope: PickerScope;
}): Promise<PickerReport> {
  const sb = supabaseAdmin();
  const now = new Date();
  const range = resolveScope(params.scope, now);

  // 1. Open orders matching scope.
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
    let q = sb
      .from('shopify_orders')
      .select(
        'id, name, customer_name, email, created_at, fulfillment_status, financial_status, cancelled_at, raw'
      )
      .is('cancelled_at', null);
    if (range.fromDate) q = q.gte('created_at', range.fromDate);
    if (range.toDate) q = q.lt('created_at', range.toDate);
    q = q.order('created_at', { ascending: true }).range(offset, offset + PAGE - 1);
    const { data, error } = await q;
    if (error) throw new Error(`picker orders: ${error.message}`);
    const rows = (data as OrderRow[]) || [];
    if (rows.length === 0) break;
    orders.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  const openOrders = orders.filter(o => {
    const fs = (o.fulfillment_status || '').toLowerCase();
    if (!OPEN_FULFILLMENT.has(fs)) return false;
    const fin = (o.financial_status || '').toLowerCase();
    if (fin === 'voided' || fin === 'cancelled') return false;
    return true;
  });

  if (openOrders.length === 0) {
    return {
      scope: params.scope,
      scope_label: range.label,
      generated_at: now.toISOString(),
      totals: { open_orders: 0, total_lines: 0, total_units: 0, oldest_age_days: null },
      buckets: [],
      common_items: [],
    };
  }

  // 2. Build {line_item_id -> already_fulfilled_qty} from each order's
  //    raw.fulfillments[].line_items[]. Skip cancelled/failed fulfillments.
  const fulfilledByLineItemId = new Map<number, number>();
  for (const o of openOrders) {
    const raw = (o.raw || {}) as Record<string, unknown>;
    const fulfillments = (raw['fulfillments'] as Array<Record<string, unknown>> | null) || [];
    for (const f of fulfillments) {
      const status =
        (typeof f['status'] === 'string' ? (f['status'] as string) : '').toLowerCase();
      if (status === 'cancelled' || status === 'failure') continue;
      const flines = (f['line_items'] as Array<Record<string, unknown>> | null) || [];
      for (const fl of flines) {
        const id = Number(fl['id']);
        const qty = Number(fl['quantity']);
        if (!Number.isFinite(id) || !Number.isFinite(qty) || qty <= 0) continue;
        fulfilledByLineItemId.set(id, (fulfilledByLineItemId.get(id) || 0) + qty);
      }
    }
  }

  // 3. Line items for the surviving orders.
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
  const openOrderIds = openOrders.map(o => o.id);
  const lines: LineRow[] = [];
  for (let i = 0; i < openOrderIds.length; i += 500) {
    const chunk = openOrderIds.slice(i, i + 500);
    const { data, error } = await sb
      .from('shopify_line_items')
      .select('id, order_id, product_id, variant_id, title, name, sku, quantity')
      .in('order_id', chunk);
    if (error) throw new Error(`picker lines: ${error.message}`);
    lines.push(...((data as LineRow[]) || []));
  }

  // 4. Products for description / image / variant title fallback.
  const productIds = Array.from(
    new Set(
      lines.map(l => l.product_id).filter((p): p is number => typeof p === 'number' && p > 0)
    )
  );
  type ProductRow = { id: number; title: string | null; raw: Record<string, unknown> | null };
  const productMap = new Map<number, ProductRow>();
  for (let i = 0; i < productIds.length; i += 500) {
    const chunk = productIds.slice(i, i + 500);
    const { data, error } = await sb
      .from('shopify_products')
      .select('id, title, raw')
      .in('id', chunk);
    if (error) throw new Error(`picker products: ${error.message}`);
    for (const p of (data ?? []) as ProductRow[]) productMap.set(p.id, p);
  }

  // 5. Group lines by order, drop fully shipped lines, build PickerOrder shape.
  const linesByOrder = new Map<number, LineRow[]>();
  for (const l of lines) {
    const arr = linesByOrder.get(l.order_id) || [];
    arr.push(l);
    linesByOrder.set(l.order_id, arr);
  }

  const pickerOrders: PickerOrder[] = [];
  const todayMs = now.getTime();
  for (const o of openOrders) {
    const orderLines = linesByOrder.get(o.id) || [];
    const survivingLines: PickerOrderLine[] = [];
    for (const l of orderLines) {
      const totalQty = Number(l.quantity) || 0;
      const alreadyShipped = fulfilledByLineItemId.get(l.id) || 0;
      const remaining = netRemaining(totalQty, alreadyShipped);
      if (remaining === 0) continue;
      const product = l.product_id ? productMap.get(l.product_id) : undefined;
      const productRaw = (product?.raw ?? null) as Record<string, unknown> | null;
      const productTitle =
        product?.title || l.title || l.name || '(unknown product)';
      const variantTitle = pickVariantTitle(productRaw, l.variant_id ?? null);
      const sku = l.sku || pickVariantSku(productRaw, l.variant_id ?? null);
      survivingLines.push({
        qty: remaining,
        product_title: productTitle,
        variant_title: variantTitle,
        sku,
      });
    }
    if (survivingLines.length === 0) continue;
    const createdMs = o.created_at ? Date.parse(o.created_at) : NaN;
    const ageDays = Number.isFinite(createdMs)
      ? Math.floor((todayMs - createdMs) / 86_400_000)
      : null;
    pickerOrders.push({
      id: o.id,
      name: o.name || `#${o.id}`,
      customer_name: o.customer_name,
      email: o.email,
      created_at: o.created_at,
      age_days: ageDays,
      remaining_line_count: survivingLines.length,
      remaining_unit_count: survivingLines.reduce((s, ln) => s + ln.qty, 0),
      lines: survivingLines,
    });
  }

  // 6. Bucket the orders.
  const bucketMap = new Map<1 | 2 | 3 | 4, PickerOrder[]>();
  for (const po of pickerOrders) {
    const key = bucketKey(po.remaining_line_count);
    const arr = bucketMap.get(key) || [];
    arr.push(po);
    bucketMap.set(key, arr);
  }

  const BUCKET_LABEL: Record<1 | 2 | 3 | 4, string> = {
    1: '1 line',
    2: '2 lines',
    3: '3 lines',
    4: '4+ lines',
  };

  const buckets: PickerBucket[] = ([1, 2, 3, 4] as const)
    .map(key => {
      const arr = (bucketMap.get(key) || []).slice().sort((a, b) => {
        // Oldest first
        const am = a.created_at ? Date.parse(a.created_at) : Number.MAX_SAFE_INTEGER;
        const bm = b.created_at ? Date.parse(b.created_at) : Number.MAX_SAFE_INTEGER;
        return am - bm;
      });
      return {
        key,
        label: BUCKET_LABEL[key],
        orders: arr,
        total_orders: arr.length,
        total_units: arr.reduce((s, o) => s + o.remaining_unit_count, 0),
        oldest_age_days: arr.reduce<number | null>(
          (acc, o) => (o.age_days != null && (acc == null || o.age_days > acc) ? o.age_days : acc),
          null
        ),
      };
    })
    .filter(b => b.total_orders > 0);

  // 7. Most-common items rollup. Walk surviving lines, group by product_id +
  //    variant_id. Track distinct order_ids for the orders count.
  type VariantAgg = {
    variant_id: number | null;
    variant_title: string | null;
    sku: string | null;
    orders: Set<number>;
    units: number;
  };
  type ProductAgg = {
    product_id: number;
    product_title: string;
    image_url: string | null;
    short_description: string | null;
    variants: Map<number | 'none', VariantAgg>;
    orders: Set<number>;
  };
  const productAggs = new Map<number, ProductAgg>();

  for (const po of pickerOrders) {
    const orderLines = linesByOrder.get(po.id) || [];
    for (const l of orderLines) {
      if (!l.product_id) continue;
      const totalQty = Number(l.quantity) || 0;
      const remaining = netRemaining(totalQty, fulfilledByLineItemId.get(l.id) || 0);
      if (remaining === 0) continue;
      const product = productMap.get(l.product_id);
      const productRaw = (product?.raw ?? null) as Record<string, unknown> | null;
      const pAgg: ProductAgg =
        productAggs.get(l.product_id) || {
          product_id: l.product_id,
          product_title: product?.title || l.title || l.name || '(unknown product)',
          image_url: pickPrimaryImage(productRaw, null),
          short_description: productRaw && typeof productRaw['body_html'] === 'string'
            ? stripHtml(productRaw['body_html'] as string)
            : null,
          variants: new Map(),
          orders: new Set(),
        };
      const vKey: number | 'none' = l.variant_id ?? 'none';
      const vAgg: VariantAgg =
        pAgg.variants.get(vKey) || {
          variant_id: l.variant_id ?? null,
          variant_title: pickVariantTitle(productRaw, l.variant_id ?? null),
          sku: l.sku || pickVariantSku(productRaw, l.variant_id ?? null),
          orders: new Set(),
          units: 0,
        };
      vAgg.units += remaining;
      vAgg.orders.add(po.id);
      pAgg.variants.set(vKey, vAgg);
      pAgg.orders.add(po.id);
      productAggs.set(l.product_id, pAgg);
    }
  }

  const common_items: PickerCommonItem[] = Array.from(productAggs.values())
    .map(p => {
      const variants = Array.from(p.variants.values())
        .map(v => ({
          variant_id: v.variant_id,
          variant_title: v.variant_title,
          sku: v.sku,
          orders: v.orders.size,
          units: v.units,
        }))
        .sort((a, b) => b.units - a.units);
      return {
        product_id: p.product_id,
        product_title: p.product_title,
        short_description: p.short_description,
        image_url: p.image_url,
        variants,
        total_orders: p.orders.size,
        total_units: variants.reduce((s, v) => s + v.units, 0),
      };
    })
    .sort((a, b) => {
      if (b.total_orders !== a.total_orders) return b.total_orders - a.total_orders;
      return b.total_units - a.total_units;
    });

  // 8. Totals.
  const totals = {
    open_orders: pickerOrders.length,
    total_lines: pickerOrders.reduce((s, o) => s + o.remaining_line_count, 0),
    total_units: pickerOrders.reduce((s, o) => s + o.remaining_unit_count, 0),
    oldest_age_days: pickerOrders.reduce<number | null>(
      (acc, o) => (o.age_days != null && (acc == null || o.age_days > acc) ? o.age_days : acc),
      null
    ),
  };

  return {
    scope: params.scope,
    scope_label: range.label,
    generated_at: now.toISOString(),
    totals,
    buckets,
    common_items,
  };
}
