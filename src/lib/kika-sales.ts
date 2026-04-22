import { supabaseAdmin } from './supabase';

export type KikaSalesRow = {
  id: number;
  name: string;
  customer_name: string | null;
  email: string | null;
  created_at: string | null;
  cancelled_at: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  total: number | null;
  currency: string | null;
  line_item_count: number | null;
  refunded_amount: number | null;
};

export type KikaSalesDailyBucket = {
  day: string; // YYYY-MM-DD
  orders: number;
  revenue: number;
  units: number;
};

export type KikaSalesProductBucket = {
  product_id: number | null;
  title: string;
  units: number;
  revenue: number;
  orders: number;
};

export type KikaSalesCustomerBucket = {
  customer_id: number | null;
  name: string;
  orders: number;
  revenue: number;
};

export type KikaSalesReport = {
  period: { from: string; to: string; label: string };
  totals: {
    orders: number;
    paid_orders: number;
    pending_orders: number;
    refunded_orders: number;
    gross_revenue: number;       // paid + fulfilled only (cash actually collected)
    potential_revenue: number;   // sum of all non-cancelled orders (includes pending COD)
    net_revenue: number;         // gross - refunds
    avg_order_value: number | null;
    units_sold: number;
    unique_customers: number;
  };
  by_financial_status: Array<{ status: string; count: number; revenue: number }>;
  by_fulfillment_status: Array<{ status: string; count: number }>;
  daily: KikaSalesDailyBucket[];
  top_products: KikaSalesProductBucket[];
  top_customers: KikaSalesCustomerBucket[];
  recent_orders: KikaSalesRow[];
  latest_sync: {
    finished_at: string | null;
    orders_synced: number;
    line_items_synced: number;
  } | null;
};

function numberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function buildKikaSalesReport(params: {
  fromDate: string;
  toDate: string;
  label: string;
}): Promise<KikaSalesReport> {
  const sb = supabaseAdmin();

  // Pull orders in the period. 1000-row Supabase cap handled via range().
  const PAGE = 1000;
  let offset = 0;
  type Order = {
    id: number;
    name: string | null;
    email: string | null;
    customer_id: number | null;
    customer_name: string | null;
    created_at: string | null;
    cancelled_at: string | null;
    first_fulfilled_at: string | null;
    financial_status: string | null;
    fulfillment_status: string | null;
    currency: string | null;
    total: number | null;
    subtotal: number | null;
    refunded_amount: number | null;
    line_item_count: number | null;
  };
  const orders: Order[] = [];
  while (true) {
    const { data, error } = await sb
      .from('shopify_orders')
      .select(
        'id, name, email, customer_id, customer_name, created_at, cancelled_at, first_fulfilled_at, financial_status, fulfillment_status, currency, total, subtotal, refunded_amount, line_item_count'
      )
      .gte('created_at', `${params.fromDate}T00:00:00Z`)
      .lt('created_at', `${params.toDate}T23:59:59Z`)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`buildKikaSalesReport orders: ${error.message}`);
    const rows = (data as Order[]) || [];
    if (rows.length === 0) break;
    orders.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  // Line items for the same order ids
  const orderIds = orders.map(o => o.id);
  type LineItem = {
    order_id: number;
    product_id: number | null;
    title: string | null;
    quantity: number | null;
    price: number | null;
  };
  const items: LineItem[] = [];
  if (orderIds.length > 0) {
    // .in() has URL-length limits; chunk the ids.
    const chunkSize = 500;
    for (let i = 0; i < orderIds.length; i += chunkSize) {
      const chunk = orderIds.slice(i, i + chunkSize);
      const { data, error } = await sb
        .from('shopify_line_items')
        .select('order_id, product_id, title, quantity, price')
        .in('order_id', chunk);
      if (error)
        throw new Error(`buildKikaSalesReport lines: ${error.message}`);
      items.push(...((data as LineItem[]) || []));
    }
  }

  // Totals
  const financialCounts = new Map<string, { count: number; revenue: number }>();
  const fulfillmentCounts = new Map<string, number>();
  const dailyMap = new Map<string, KikaSalesDailyBucket>();
  // Gross Revenue = cash actually collected = paid + fulfilled orders.
  // For a COD store, a 'pending' order is COD awaiting door-collection —
  // it's not revenue yet. Matches the Exec Summary's Revenue Collected.
  // potentialRevenue tracks the non-cancelled order-value superset (what
  // would roll in if every pending order gets collected) so the operator
  // can see the ceiling.
  let grossRevenue = 0;
  let potentialRevenue = 0;
  let refundTotal = 0;
  let paidOrders = 0;
  let pendingOrders = 0;
  let refundedOrders = 0;
  let nonCancelledOrders = 0;
  const customers = new Set<string>();
  const customerRevenue = new Map<
    string,
    { name: string; orders: number; revenue: number; customer_id: number | null }
  >();

  const isCancelledSales = (o: Order): boolean =>
    !!o.cancelled_at ||
    o.financial_status === 'voided' ||
    o.fulfillment_status === 'cancelled';

  for (const o of orders) {
    const total = numberOrNull(o.total) || 0;
    const cancelled = isCancelledSales(o);
    const fulfilled =
      o.fulfillment_status === 'fulfilled' || o.first_fulfilled_at != null;
    const collected = !cancelled && fulfilled && o.financial_status === 'paid';
    // Revenue & daily tallies SKIP cancelled orders — a cancelled COD
    // never collected cash, so including it inflates the numbers.
    if (!cancelled) {
      potentialRevenue += total;
      if (collected) grossRevenue += total;
      refundTotal += numberOrNull(o.refunded_amount) || 0;
      nonCancelledOrders += 1;
    }
    // Financial/fulfillment breakdowns still include cancelled orders so
    // operators can see the voided/cancelled bucket separately.
    const fs = o.financial_status || 'unknown';
    const ff = cancelled ? 'cancelled' : o.fulfillment_status || 'unfulfilled';
    const fin = financialCounts.get(fs) || { count: 0, revenue: 0 };
    fin.count += 1;
    fin.revenue += cancelled ? 0 : total;
    financialCounts.set(fs, fin);
    fulfillmentCounts.set(ff, (fulfillmentCounts.get(ff) || 0) + 1);
    if (!cancelled && fs === 'paid') paidOrders++;
    else if (!cancelled && fs === 'pending') pendingOrders++;
    else if (fs === 'refunded' || fs === 'partially_refunded') refundedOrders++;

    if (o.created_at && !cancelled) {
      const day = o.created_at.slice(0, 10);
      const d = dailyMap.get(day) || {
        day,
        orders: 0,
        revenue: 0,
        units: 0,
      };
      d.orders += 1;
      d.revenue += total;
      dailyMap.set(day, d);
    }

    if (cancelled) continue; // exclude from customer revenue aggregation too

    const custKey = String(o.customer_id ?? o.email ?? `ord:${o.id}`);
    customers.add(custKey);
    const existing = customerRevenue.get(custKey);
    if (existing) {
      existing.orders += 1;
      existing.revenue += total;
    } else {
      customerRevenue.set(custKey, {
        customer_id: o.customer_id,
        name: o.customer_name || o.email || '—',
        orders: 1,
        revenue: total,
      });
    }
  }

  // Aggregate line items into product buckets + attach units to daily totals
  const productMap = new Map<string, KikaSalesProductBucket>();
  const orderIdToDay = new Map<number, string>();
  for (const o of orders) {
    if (o.created_at) orderIdToDay.set(o.id, o.created_at.slice(0, 10));
  }
  let unitsSold = 0;
  for (const li of items) {
    const qty = Number(li.quantity) || 0;
    const price = Number(li.price) || 0;
    unitsSold += qty;
    const day = orderIdToDay.get(li.order_id);
    if (day) {
      const d = dailyMap.get(day);
      if (d) d.units += qty;
    }
    const key = String(li.product_id ?? li.title ?? 'unknown');
    const bucket = productMap.get(key) || {
      product_id: li.product_id,
      title: li.title || 'Untitled',
      units: 0,
      revenue: 0,
      orders: 0,
    };
    bucket.units += qty;
    bucket.revenue += price * qty;
    productMap.set(key, bucket);
  }
  // Count distinct orders per product
  const productOrderSets = new Map<string, Set<number>>();
  for (const li of items) {
    const key = String(li.product_id ?? li.title ?? 'unknown');
    const s = productOrderSets.get(key) || new Set<number>();
    s.add(li.order_id);
    productOrderSets.set(key, s);
  }
  for (const [k, b] of productMap.entries()) {
    b.orders = productOrderSets.get(k)?.size ?? 0;
  }

  const totals = {
    orders: orders.length,
    paid_orders: paidOrders,
    pending_orders: pendingOrders,
    refunded_orders: refundedOrders,
    gross_revenue: grossRevenue,
    potential_revenue: potentialRevenue,
    net_revenue: grossRevenue - refundTotal,
    // AOV = potential revenue (non-cancelled order superset) ÷ non-cancelled
    // order count. Using grossRevenue (paid+fulfilled only) in the numerator
    // with non-cancelled-count in the denominator would understate AOV.
    avg_order_value:
      nonCancelledOrders > 0 ? potentialRevenue / nonCancelledOrders : null,
    units_sold: unitsSold,
    unique_customers: customers.size,
  };

  const daily = Array.from(dailyMap.values()).sort((a, b) =>
    a.day.localeCompare(b.day)
  );
  const top_products = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);
  const top_customers = Array.from(customerRevenue.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15)
    .map(c => ({
      customer_id: c.customer_id,
      name: c.name,
      orders: c.orders,
      revenue: c.revenue,
    }));

  const recent_orders: KikaSalesRow[] = orders.slice(0, 15).map(o => ({
    id: o.id,
    name: o.name || `#${o.id}`,
    customer_name: o.customer_name,
    email: o.email,
    created_at: o.created_at,
    cancelled_at: o.cancelled_at,
    financial_status: o.financial_status,
    fulfillment_status: o.fulfillment_status,
    total: numberOrNull(o.total),
    currency: o.currency,
    line_item_count: o.line_item_count,
    refunded_amount: numberOrNull(o.refunded_amount),
  }));

  const { data: latestSync } = await sb
    .from('shopify_sync_runs')
    .select('finished_at, orders_synced, line_items_synced')
    .eq('status', 'succeeded')
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    period: { from: params.fromDate, to: params.toDate, label: params.label },
    totals,
    by_financial_status: Array.from(financialCounts.entries())
      .map(([status, v]) => ({ status, count: v.count, revenue: v.revenue }))
      .sort((a, b) => b.count - a.count),
    by_fulfillment_status: Array.from(fulfillmentCounts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    daily,
    top_products,
    top_customers,
    recent_orders,
    latest_sync: (latestSync as {
      finished_at: string | null;
      orders_synced: number;
      line_items_synced: number;
    } | null) || null,
  };
}

// -------- Per-order drill-down --------
// Powers the order-detail modal on /emails/kika/sales. Gets the full order
// row (all columns + raw jsonb for shipping address / notes) plus every
// line item for that order.

export type KikaOrderDetailLine = {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  title: string | null;
  name: string | null;
  sku: string | null;
  vendor: string | null;
  quantity: number | null;
  price: number | null;
  total_discount: number | null;
};

export type KikaOrderDetail = {
  id: number;
  name: string | null;
  email: string | null;
  customer_id: number | null;
  customer_name: string | null;
  created_at: string | null;
  processed_at: string | null;
  cancelled_at: string | null;
  first_fulfilled_at: string | null;
  first_delivered_at: string | null;
  hours_to_fulfill: number | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  currency: string | null;
  subtotal: number | null;
  total: number | null;
  total_discounts: number | null;
  total_tax: number | null;
  total_shipping: number | null;
  refunded_amount: number | null;
  tags: string[] | null;
  line_item_count: number | null;
  raw: Record<string, unknown> | null;
  line_items: KikaOrderDetailLine[];
};

export async function fetchKikaOrderDetail(
  orderIdOrName: string
): Promise<KikaOrderDetail | null> {
  const sb = supabaseAdmin();
  // Accept either numeric id ("7181021610156") or order-name ("#18643")
  const asNum = Number(orderIdOrName);
  let query = sb
    .from('shopify_orders')
    .select(
      'id, name, email, customer_id, customer_name, created_at, processed_at, cancelled_at, first_fulfilled_at, first_delivered_at, hours_to_fulfill, financial_status, fulfillment_status, currency, subtotal, total, total_discounts, total_tax, total_shipping, refunded_amount, tags, line_item_count, raw'
    );
  if (Number.isFinite(asNum) && asNum > 0) {
    query = query.eq('id', asNum);
  } else {
    query = query.eq('name', orderIdOrName.startsWith('#') ? orderIdOrName : `#${orderIdOrName}`);
  }
  const { data } = await query.maybeSingle();
  if (!data) return null;
  const o = data as KikaOrderDetail;

  const { data: lines } = await sb
    .from('shopify_line_items')
    .select('id, product_id, variant_id, title, name, sku, vendor, quantity, price, total_discount')
    .eq('order_id', o.id)
    .order('id');
  return { ...o, line_items: (lines as KikaOrderDetailLine[]) || [] };
}
