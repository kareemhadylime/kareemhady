import { supabaseAdmin } from './supabase';

// Executive dashboard for KIKA Shopify — easy-reading KPIs the operator
// asked for (2026-04-22):
//   - Number of orders
//   - Order values (total, AOV, distribution)
//   - Most items ordered (by product)
//   - Returning customers (count + rate)
//   - Time to fulfill orders (avg, median, p90)
//   - Most delayed orders
//   - Delivered then Refunded (count + %)
//   - Undelivered orders (count + %)
//
// Context: all kika-swim-wear orders are cash orders (COD or prepaid in
// person). "Pending" financial_status here means awaiting cash collection,
// not a failed payment gateway.

export type KikaExecReport = {
  period: { from: string; to: string; label: string };
  totals: {
    orders: number;
    order_value_total: number;
    order_value_avg: number | null;
    order_value_median: number | null;
    order_value_max: number | null;
    units: number;
  };
  customers: {
    unique: number;
    returning_in_period: number;     // customers with >1 order THIS period
    returning_lifetime: number;      // customers with lifetime orders_count > 1 (from shopify_customers)
    returning_rate_lifetime_pct: number | null;
    new_in_period: number;
  };
  fulfillment: {
    fulfilled_count: number;
    unfulfilled_count: number;             // in-flight: not fulfilled AND not cancelled
    unfulfilled_pct: number | null;
    avg_hours_to_fulfill: number | null;
    median_hours_to_fulfill: number | null;
    p90_hours_to_fulfill: number | null;
  };
  refunds: {
    delivered_then_refunded_count: number;
    delivered_then_refunded_pct: number | null;   // over fulfilled orders
    refunds_amount_total: number;
  };
  cancelled: {
    count: number;
    pct: number | null;                    // over orders in period
    amount_total: number;                  // sum of cancelled-order totals
  };
  most_items: Array<{
    product_id: number | null;
    title: string;
    units: number;
    orders: number;
    revenue: number;
  }>;
  most_delayed: Array<{
    id: number;
    name: string;
    customer_name: string | null;
    hours_to_fulfill: number | null;
    created_at: string | null;
    first_fulfilled_at: string | null;
    fulfillment_status: string | null;
    financial_status: string | null;       // so UI can show voided / refunded / paid etc.
    cancelled_at: string | null;           // excluded from most_delayed, but kept for future use
    total: number | null;
  }>;
};

function pct(num: number, denom: number): number | null {
  if (!denom) return null;
  return (num / denom) * 100;
}
function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
function percentile(nums: number[], p: number): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}
function numberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function buildKikaExecReport(params: {
  fromDate: string; // YYYY-MM-DD inclusive
  toDate: string;
  label: string;
}): Promise<KikaExecReport> {
  const sb = supabaseAdmin();

  // Pull all in-period orders
  type OrderRow = {
    id: number;
    name: string | null;
    customer_id: number | null;
    customer_name: string | null;
    email: string | null;
    created_at: string | null;
    cancelled_at: string | null;
    first_fulfilled_at: string | null;
    first_delivered_at: string | null;
    hours_to_fulfill: number | null;
    financial_status: string | null;
    fulfillment_status: string | null;
    total: number | null;
    refunded_amount: number | null;
    line_item_count: number | null;
  };
  const orders: OrderRow[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from('shopify_orders')
      .select(
        'id, name, customer_id, customer_name, email, created_at, cancelled_at, first_fulfilled_at, first_delivered_at, hours_to_fulfill, financial_status, fulfillment_status, total, refunded_amount, line_item_count'
      )
      .gte('created_at', `${params.fromDate}T00:00:00Z`)
      .lt('created_at', `${params.toDate}T23:59:59Z`)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`exec orders: ${error.message}`);
    const rows = (data as OrderRow[]) || [];
    if (rows.length === 0) break;
    orders.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  // Line items for in-period orders
  type LineRow = {
    order_id: number;
    product_id: number | null;
    title: string | null;
    quantity: number | null;
    price: number | null;
  };
  const lines: LineRow[] = [];
  const orderIds = orders.map(o => o.id);
  if (orderIds.length > 0) {
    for (let i = 0; i < orderIds.length; i += 500) {
      const chunk = orderIds.slice(i, i + 500);
      const { data, error } = await sb
        .from('shopify_line_items')
        .select('order_id, product_id, title, quantity, price')
        .in('order_id', chunk);
      if (error) throw new Error(`exec lines: ${error.message}`);
      lines.push(...((data as LineRow[]) || []));
    }
  }

  // Customers — for returning/new classification using lifetime orders_count.
  // Match against customer_id from in-period orders.
  const customerIds = Array.from(
    new Set(
      orders
        .map(o => o.customer_id)
        .filter((v): v is number => typeof v === 'number')
    )
  );
  type CustomerRow = {
    id: number;
    orders_count: number;
    created_at: string | null;
  };
  const customerRows: CustomerRow[] = [];
  if (customerIds.length > 0) {
    for (let i = 0; i < customerIds.length; i += 500) {
      const chunk = customerIds.slice(i, i + 500);
      const { data } = await sb
        .from('shopify_customers')
        .select('id, orders_count, created_at')
        .in('id', chunk);
      customerRows.push(...((data as CustomerRow[]) || []));
    }
  }
  const customerById = new Map<number, CustomerRow>();
  for (const c of customerRows) customerById.set(c.id, c);

  // ----- Classification helpers (hoisted so downstream sections share them) -----
  // Cancelled orders must be classified separately. Shopify signals
  // cancellation via any of: cancelled_at timestamp set, financial_status
  // in {voided, refunded} without a fulfillment, or fulfillment_status
  // literally 'cancelled'. A truly-voided order is neither 'unfulfilled'
  // nor 'delayed' — it's done.
  const isCancelled = (o: OrderRow): boolean =>
    !!o.cancelled_at ||
    o.financial_status === 'voided' ||
    o.fulfillment_status === 'cancelled';
  const isFulfilled = (o: OrderRow): boolean =>
    o.first_fulfilled_at != null || o.fulfillment_status === 'fulfilled';

  // ----- Totals -----
  // Revenue figures exclude cancelled orders (a cancelled COD order never
  // collected cash, so it shouldn't inflate gross revenue). Order count
  // still shows ALL orders placed in the period.
  const nonCancelledOrders = orders.filter(o => !isCancelled(o));
  const totalValues = nonCancelledOrders
    .map(o => numberOrNull(o.total))
    .filter((n): n is number => n != null);
  const orderValueTotal = totalValues.reduce((s, n) => s + n, 0);
  const unitsTotal = lines.reduce((s, li) => s + (Number(li.quantity) || 0), 0);

  // ----- Customers -----
  const perCustomerOrders = new Map<string, number>();
  for (const o of orders) {
    const key = String(o.customer_id ?? o.email ?? `ord:${o.id}`);
    perCustomerOrders.set(key, (perCustomerOrders.get(key) || 0) + 1);
  }
  const uniqueCustomers = perCustomerOrders.size;
  const returningInPeriod = Array.from(perCustomerOrders.values()).filter(
    n => n > 1
  ).length;
  let returningLifetime = 0;
  let newInPeriod = 0;
  const periodStartTs = new Date(`${params.fromDate}T00:00:00Z`).getTime();
  for (const o of orders) {
    const c = o.customer_id != null ? customerById.get(o.customer_id) : null;
    if (c && c.orders_count > 1) {
      returningLifetime++;
    }
    if (c?.created_at) {
      const createdTs = new Date(c.created_at).getTime();
      if (createdTs >= periodStartTs) newInPeriod++;
    }
  }
  // Dedup lifetime-returning count per customer
  const returningLifetimeSet = new Set<number>();
  for (const o of orders) {
    if (o.customer_id != null) {
      const c = customerById.get(o.customer_id);
      if (c && c.orders_count > 1) returningLifetimeSet.add(o.customer_id);
    }
  }

  // ----- Fulfillment -----
  const fulfilledOrders = orders.filter(o => !isCancelled(o) && isFulfilled(o));
  const unfulfilled = orders.filter(
    o => !isCancelled(o) && !isFulfilled(o)
  );
  const hoursArr = fulfilledOrders
    .map(o => numberOrNull(o.hours_to_fulfill))
    .filter((n): n is number => n != null && n >= 0);

  // ----- Refunds -----
  // "Delivered then Refunded" — orders that were fulfilled AND have a
  // refund amount > 0, EXCLUDING cancelled orders (cancelled-with-refund
  // is its own bucket, not a "delivered then refunded" case).
  const deliveredThenRefunded = orders.filter(
    o =>
      !isCancelled(o) &&
      isFulfilled(o) &&
      (numberOrNull(o.refunded_amount) || 0) > 0
  );
  const refundsAmountTotal = orders
    .filter(o => !isCancelled(o))
    .reduce((s, o) => s + (numberOrNull(o.refunded_amount) || 0), 0);

  // ----- Cancelled orders -----
  const cancelledOrders = orders.filter(isCancelled);
  const cancelledAmountTotal = cancelledOrders.reduce(
    (s, o) => s + (numberOrNull(o.total) || 0),
    0
  );

  // ----- Most items ordered (by product) -----
  const prodMap = new Map<
    string,
    { product_id: number | null; title: string; units: number; revenue: number; orders: Set<number> }
  >();
  for (const li of lines) {
    const key = String(li.product_id ?? li.title ?? 'unknown');
    const bucket = prodMap.get(key) || {
      product_id: li.product_id,
      title: li.title || 'Untitled',
      units: 0,
      revenue: 0,
      orders: new Set<number>(),
    };
    const qty = Number(li.quantity) || 0;
    const price = Number(li.price) || 0;
    bucket.units += qty;
    bucket.revenue += price * qty;
    bucket.orders.add(li.order_id);
    prodMap.set(key, bucket);
  }
  const most_items = Array.from(prodMap.values())
    .sort((a, b) => b.units - a.units)
    .slice(0, 15)
    .map(b => ({
      product_id: b.product_id,
      title: b.title,
      units: b.units,
      orders: b.orders.size,
      revenue: b.revenue,
    }));

  // ----- Most delayed orders -----
  // Cancelled orders are excluded — they're not delayed, they're done.
  const most_delayed = orders
    .filter(o => !isCancelled(o))
    .map(o => ({
      id: o.id,
      name: o.name || `#${o.id}`,
      customer_name: o.customer_name,
      hours_to_fulfill: numberOrNull(o.hours_to_fulfill),
      created_at: o.created_at,
      first_fulfilled_at: o.first_fulfilled_at,
      fulfillment_status: o.fulfillment_status,
      financial_status: o.financial_status,
      cancelled_at: o.cancelled_at,
      total: numberOrNull(o.total),
    }))
    .filter(o => o.hours_to_fulfill != null || o.fulfillment_status !== 'fulfilled')
    .sort((a, b) => {
      // Unfulfilled (no ts) sort to top — use AGE from created_at vs now.
      const ageA = a.hours_to_fulfill ??
        (a.created_at
          ? (Date.now() - new Date(a.created_at).getTime()) / 3_600_000
          : 0);
      const ageB = b.hours_to_fulfill ??
        (b.created_at
          ? (Date.now() - new Date(b.created_at).getTime()) / 3_600_000
          : 0);
      return ageB - ageA;
    })
    .slice(0, 15);

  const fulfilledCount = fulfilledOrders.length;
  const unfulfilledCount = unfulfilled.length;

  return {
    period: { from: params.fromDate, to: params.toDate, label: params.label },
    totals: {
      orders: orders.length,
      order_value_total: orderValueTotal,
      order_value_avg: totalValues.length
        ? orderValueTotal / totalValues.length
        : null,
      order_value_median: median(totalValues),
      order_value_max: totalValues.length ? Math.max(...totalValues) : null,
      units: unitsTotal,
    },
    customers: {
      unique: uniqueCustomers,
      returning_in_period: returningInPeriod,
      returning_lifetime: returningLifetimeSet.size,
      returning_rate_lifetime_pct: pct(returningLifetimeSet.size, uniqueCustomers),
      new_in_period: newInPeriod,
    },
    fulfillment: {
      fulfilled_count: fulfilledCount,
      unfulfilled_count: unfulfilledCount,
      unfulfilled_pct: pct(unfulfilledCount, nonCancelledOrders.length),
      avg_hours_to_fulfill: hoursArr.length
        ? hoursArr.reduce((s, h) => s + h, 0) / hoursArr.length
        : null,
      median_hours_to_fulfill: median(hoursArr),
      p90_hours_to_fulfill: percentile(hoursArr, 90),
    },
    refunds: {
      delivered_then_refunded_count: deliveredThenRefunded.length,
      delivered_then_refunded_pct: pct(
        deliveredThenRefunded.length,
        fulfilledCount
      ),
      refunds_amount_total: refundsAmountTotal,
    },
    cancelled: {
      count: cancelledOrders.length,
      pct: pct(cancelledOrders.length, orders.length),
      amount_total: cancelledAmountTotal,
    },
    most_items,
    most_delayed,
  };
}
