import 'server-only';
import { supabaseAdmin } from '../supabase';
import { addDays } from './cairo-dates';

// One-shot corpus loader for the daily report. Pulls a 60-day window of
// orders + line items + customers off `shopify_orders` / `shopify_line_items`
// / `shopify_customers` so every downstream section builder can slice from
// the same in-memory rows without round-tripping to Supabase.
//
// Currency: EGP-only (Q5). Non-EGP rows are dropped and counted in
// `skipped_non_egp` so build.ts can surface a build-warning.
//
// 60 days covers: yesterday, prior day, prior weekday, prior MTD same-window,
// 14-day sparkline + 14-day inventory velocity + 60-day rolling repeat rate.
// YoY is a separate small query, only fired when prior_year >= 2024.

export type KikaOrder = {
  id: number;
  name: string | null;
  email: string | null;
  customer_id: number | null;
  customer_name: string | null;
  created_at: string | null;          // timestamptz ISO
  cancelled_at: string | null;
  first_fulfilled_at: string | null;
  hours_to_fulfill: number | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  currency: string | null;
  total: number;
  subtotal: number;
  total_discounts: number;
  total_tax: number;
  total_shipping: number;
  refunded_amount: number;
  line_item_count: number;
  raw: Record<string, unknown> | null;
  // Derived
  created_ymd: string | null;          // YYYY-MM-DD (Cairo wall date the order belongs to)
  is_cancelled: boolean;
  is_fulfilled: boolean;
  is_collected: boolean;               // paid + fulfilled + non-cancelled
};

export type KikaLineItem = {
  order_id: number;
  product_id: number | null;
  variant_id: number | null;
  title: string | null;
  name: string | null;
  sku: string | null;
  quantity: number;
  price: number;
};

export type KikaCustomer = {
  id: number;
  orders_count: number;
  created_at: string | null;
};

export type KikaCorpus = {
  /** Orders inside the 60-day window, EGP-only. */
  orders: KikaOrder[];
  /** Line items joined to those orders. */
  line_items: KikaLineItem[];
  /** Customers referenced by those orders (lifetime data). */
  customers: Map<number, KikaCustomer>;
  /** Abandoned checkouts inside yesterday's wall date. */
  abandoned_yesterday: AbandonedRow[];
  /** Window bounds (Cairo wall dates, inclusive). */
  window_from: string;
  window_to: string;
  /** Orders dropped because currency != EGP. */
  skipped_non_egp: number;
};

export type AbandonedRow = {
  id: number;
  email: string | null;
  customer_name: string | null;
  total_price: number | null;
  line_items_count: number | null;
  abandoned_checkout_url: string | null;
  created_at: string | null;
  completed_at: string | null;
};

const WINDOW_DAYS = 60;
const PAGE = 1000;

function asNumber(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Convert an order's `created_at` (ISO timestamptz) to a Cairo wall date
 * (YYYY-MM-DD). Naive UTC slice would put orders created near midnight
 * UTC into the wrong wall day; we reformat through `Intl.DateTimeFormat`
 * so DST-correct boundaries hold.
 */
function isoToCairoYmd(iso: string | null): string | null {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(dt).map(p => [p.type, p.value]));
  if (!parts.year || !parts.month || !parts.day) return null;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function loadKikaCorpus(yesterdayYmd: string): Promise<KikaCorpus> {
  const sb = supabaseAdmin();
  const windowFrom = addDays(yesterdayYmd, -WINDOW_DAYS);
  const windowTo = yesterdayYmd;

  // ----- Orders (60-day window) -----
  type OrderRaw = {
    id: number;
    name: string | null;
    email: string | null;
    customer_id: number | null;
    customer_name: string | null;
    created_at: string | null;
    cancelled_at: string | null;
    first_fulfilled_at: string | null;
    hours_to_fulfill: number | null;
    financial_status: string | null;
    fulfillment_status: string | null;
    currency: string | null;
    total: number | string | null;
    subtotal: number | string | null;
    total_discounts: number | string | null;
    total_tax: number | string | null;
    total_shipping: number | string | null;
    refunded_amount: number | string | null;
    line_item_count: number | null;
    raw: Record<string, unknown> | null;
  };
  const ordersRaw: OrderRaw[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from('shopify_orders')
      .select(
        'id, name, email, customer_id, customer_name, created_at, cancelled_at, first_fulfilled_at, hours_to_fulfill, financial_status, fulfillment_status, currency, total, subtotal, total_discounts, total_tax, total_shipping, refunded_amount, line_item_count, raw'
      )
      // Cairo wall date `windowFrom` 00:00 → `windowTo` 23:59:59.999.
      // For the worst-case 3-hour summer offset, `windowFrom-1d` UTC start
      // is generous; the Cairo-ymd reclassification below handles it.
      .gte('created_at', `${addDays(windowFrom, -1)}T00:00:00Z`)
      .lt('created_at', `${addDays(windowTo, 1)}T00:00:00Z`)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`kika_corpus orders: ${error.message}`);
    const rows = (data as OrderRaw[]) || [];
    if (rows.length === 0) break;
    ordersRaw.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  // Reclassify each row to a Cairo wall date and drop non-EGP. Currency
  // 'EGP' is canonical; rows with null currency are kept (default Shopify
  // currency at this store IS EGP — null only happens on freshly-synced
  // rows before the field populates).
  let skipped_non_egp = 0;
  const orders: KikaOrder[] = [];
  for (const r of ordersRaw) {
    const cur = (r.currency || '').toUpperCase();
    if (cur && cur !== 'EGP') {
      skipped_non_egp += 1;
      continue;
    }
    const ymd = isoToCairoYmd(r.created_at);
    // Drop rows whose Cairo wall date falls outside the requested window
    // (the SQL side fetches a bit wider to be safe; trim here).
    if (!ymd || ymd < windowFrom || ymd > windowTo) continue;
    const isCancelled =
      !!r.cancelled_at ||
      r.financial_status === 'voided' ||
      r.fulfillment_status === 'cancelled';
    const isFulfilled =
      r.first_fulfilled_at != null || r.fulfillment_status === 'fulfilled';
    const isCollected =
      !isCancelled && isFulfilled && r.financial_status === 'paid';
    orders.push({
      id: r.id,
      name: r.name,
      email: r.email,
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      created_at: r.created_at,
      cancelled_at: r.cancelled_at,
      first_fulfilled_at: r.first_fulfilled_at,
      hours_to_fulfill: r.hours_to_fulfill ?? null,
      financial_status: r.financial_status,
      fulfillment_status: r.fulfillment_status,
      currency: r.currency,
      total: asNumber(r.total),
      subtotal: asNumber(r.subtotal),
      total_discounts: asNumber(r.total_discounts),
      total_tax: asNumber(r.total_tax),
      total_shipping: asNumber(r.total_shipping),
      refunded_amount: asNumber(r.refunded_amount),
      line_item_count: r.line_item_count ?? 0,
      raw: r.raw,
      created_ymd: ymd,
      is_cancelled: isCancelled,
      is_fulfilled: isFulfilled,
      is_collected: isCollected,
    });
  }

  // ----- Line items -----
  const orderIds = orders.map(o => o.id);
  type LineRaw = {
    order_id: number;
    product_id: number | null;
    variant_id: number | null;
    title: string | null;
    name: string | null;
    sku: string | null;
    quantity: number | null;
    price: number | string | null;
  };
  const lineItems: KikaLineItem[] = [];
  if (orderIds.length > 0) {
    for (let i = 0; i < orderIds.length; i += 500) {
      const chunk = orderIds.slice(i, i + 500);
      const { data, error } = await sb
        .from('shopify_line_items')
        .select('order_id, product_id, variant_id, title, name, sku, quantity, price')
        .in('order_id', chunk);
      if (error) throw new Error(`kika_corpus lines: ${error.message}`);
      for (const r of (data as LineRaw[]) || []) {
        lineItems.push({
          order_id: r.order_id,
          product_id: r.product_id,
          variant_id: r.variant_id,
          title: r.title,
          name: r.name,
          sku: r.sku,
          quantity: Number(r.quantity) || 0,
          price: asNumber(r.price),
        });
      }
    }
  }

  // ----- Customers -----
  const customerIds = Array.from(
    new Set(
      orders
        .map(o => o.customer_id)
        .filter((v): v is number => typeof v === 'number')
    )
  );
  const customers = new Map<number, KikaCustomer>();
  if (customerIds.length > 0) {
    for (let i = 0; i < customerIds.length; i += 500) {
      const chunk = customerIds.slice(i, i + 500);
      const { data } = await sb
        .from('shopify_customers')
        .select('id, orders_count, created_at')
        .in('id', chunk);
      for (const c of (data as KikaCustomer[] | null) || []) {
        customers.set(c.id, c);
      }
    }
  }

  // ----- Abandoned checkouts (yesterday only — short window) -----
  const { data: ab } = await sb
    .from('shopify_abandoned_checkouts')
    .select(
      'id, email, customer_name, total_price, line_items_count, abandoned_checkout_url, created_at, completed_at'
    )
    .gte('created_at', `${yesterdayYmd}T00:00:00Z`)
    .lt('created_at', `${addDays(yesterdayYmd, 1)}T00:00:00Z`)
    .order('total_price', { ascending: false, nullsFirst: false })
    .limit(500);
  const abandoned_yesterday: AbandonedRow[] = (ab as AbandonedRow[] | null) || [];

  return {
    orders,
    line_items: lineItems,
    customers,
    abandoned_yesterday,
    window_from: windowFrom,
    window_to: windowTo,
    skipped_non_egp,
  };
}

/** Filter the corpus to a single Cairo wall date. */
export function ordersOnDay(corpus: KikaCorpus, ymd: string): KikaOrder[] {
  return corpus.orders.filter(o => o.created_ymd === ymd);
}

/** Filter the corpus to a date range (inclusive). */
export function ordersInRange(
  corpus: KikaCorpus,
  fromYmd: string,
  toYmd: string
): KikaOrder[] {
  return corpus.orders.filter(
    o => o.created_ymd && o.created_ymd >= fromYmd && o.created_ymd <= toYmd
  );
}

/** Line items belonging to the given orders. */
export function linesForOrders(
  corpus: KikaCorpus,
  orderIds: number[]
): KikaLineItem[] {
  const set = new Set(orderIds);
  return corpus.line_items.filter(li => set.has(li.order_id));
}
