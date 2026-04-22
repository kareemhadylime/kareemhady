import type { ShopifyOrder, ShopifyOrderLineItem } from './shopify';

// Shared order→row mapping used by both the bulk sync worker and the
// real-time webhook handler. Kept isolated here so both paths produce
// identical rows — no drift between bulk and incremental ingestion.

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toTs(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export type ShopifyOrderRow = ReturnType<typeof shopifyOrderToRow>;
export type ShopifyLineRow = ReturnType<typeof shopifyLineItemToRow>;

export function shopifyOrderToRow(o: ShopifyOrder, shopDomain: string) {
  const shippingAmount =
    o.total_shipping_price_set?.shop_money?.amount || null;
  const refunded = (o.refunds || [])
    .flatMap(r => r.transactions || [])
    .reduce((s, t) => s + (toNumber(t.amount) || 0), 0);
  const customer = o.customer || null;
  const customerName = customer
    ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() ||
      customer.email ||
      null
    : null;
  const fulfillments = Array.isArray(o.fulfillments) ? o.fulfillments : [];
  const firstFulfilledAt =
    fulfillments
      .map(f => f.created_at)
      .filter((d): d is string => typeof d === 'string')
      .sort()[0] || null;
  const firstDeliveredAt =
    fulfillments
      .filter(f => f.shipment_status === 'delivered')
      .map(f => f.updated_at)
      .filter((d): d is string => typeof d === 'string')
      .sort()[0] || null;
  const hoursToFulfill =
    firstFulfilledAt && o.created_at
      ? (new Date(firstFulfilledAt).getTime() -
          new Date(o.created_at).getTime()) /
        3_600_000
      : null;
  return {
    id: o.id,
    shop_domain: shopDomain,
    name: o.name || null,
    email: o.email || null,
    customer_id: customer?.id ?? null,
    customer_name: customerName,
    created_at: toTs(o.created_at),
    processed_at: toTs(o.processed_at),
    cancelled_at: toTs(o.cancelled_at),
    first_fulfilled_at: firstFulfilledAt,
    first_delivered_at: firstDeliveredAt,
    hours_to_fulfill:
      hoursToFulfill != null && Number.isFinite(hoursToFulfill)
        ? Number(hoursToFulfill.toFixed(2))
        : null,
    financial_status: o.financial_status || null,
    fulfillment_status: o.fulfillment_status || null,
    currency: o.currency || null,
    subtotal: toNumber(o.subtotal_price),
    total: toNumber(o.total_price),
    total_discounts: toNumber(o.total_discounts),
    total_tax: toNumber(o.total_tax),
    total_shipping: toNumber(shippingAmount),
    refunded_amount: refunded || null,
    tags:
      typeof o.tags === 'string' && o.tags.trim().length > 0
        ? o.tags.split(',').map((t: string) => t.trim())
        : [],
    line_item_count: (o.line_items || []).length,
    raw: (o as unknown) as Record<string, unknown>,
    synced_at: new Date().toISOString(),
  };
}

export function shopifyLineItemToRow(li: ShopifyOrderLineItem, orderId: number) {
  return {
    id: li.id,
    order_id: orderId,
    product_id: li.product_id ?? null,
    variant_id: li.variant_id ?? null,
    title: li.title || null,
    name: li.name || null,
    sku: li.sku || null,
    vendor: li.vendor || null,
    quantity: li.quantity ?? 0,
    price: toNumber(li.price),
    total_discount: toNumber(li.total_discount),
    synced_at: new Date().toISOString(),
  };
}
