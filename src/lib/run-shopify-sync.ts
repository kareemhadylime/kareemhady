import { supabaseAdmin } from './supabase';
import {
  iterateShopifyOrders,
  iterateShopifyProducts,
  iterateShopifyCustomers,
  type ShopifyOrder,
  type ShopifyOrderLineItem,
  type ShopifyProduct,
  type ShopifyCustomer,
} from './shopify';

// Shopify order mirror sync. Pulls orders in the backfill window plus any
// updated since the last successful sync. Upserts by id so reruns are safe.

const BACKFILL_DAYS = 365;

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toTs(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
async function shopDomain(): Promise<string> {
  const { getCredential } = await import('./credentials');
  const raw = (await getCredential('shopify', 'store_domain', { required: true })).trim();
  return raw.includes('.') ? raw : `${raw}.myshopify.com`;
}

export async function runShopifySync(trigger: 'cron' | 'manual') {
  const sb = supabaseAdmin();

  const { data: run, error: runErr } = await sb
    .from('shopify_sync_runs')
    .insert({ trigger, status: 'running' })
    .select()
    .single();
  if (runErr || !run) {
    return { ok: false, error: 'failed_to_open_run', details: runErr };
  }
  const runId = (run as { id: string }).id;

  const domain = await shopDomain();
  const cutoff = new Date(
    Date.now() - BACKFILL_DAYS * 24 * 3600 * 1000
  ).toISOString();

  let ordersSynced = 0;
  let lineItemsSynced = 0;
  let productsSynced = 0;
  let customersSynced = 0;

  try {
    // Products master — small catalog, sync first so orders can reference.
    for await (const batch of iterateShopifyProducts({ pageSize: 250 })) {
      if (batch.length === 0) continue;
      const rows = batch.map((p: ShopifyProduct) => {
        const variants = Array.isArray(p.variants) ? p.variants : [];
        const totalInventory = variants.reduce(
          (s, v) => s + (Number(v.inventory_quantity) || 0),
          0
        );
        return {
          id: p.id,
          title: p.title || null,
          product_type: p.product_type || null,
          vendor: p.vendor || null,
          status: p.status || null,
          handle: p.handle || null,
          tags:
            typeof p.tags === 'string' && p.tags.trim().length > 0
              ? p.tags.split(',').map(t => t.trim())
              : [],
          total_inventory: totalInventory,
          variant_count: variants.length,
          created_at: toTs(p.created_at),
          updated_at: toTs(p.updated_at),
          raw: (p as unknown) as Record<string, unknown>,
          synced_at: new Date().toISOString(),
        };
      });
      for (let i = 0; i < rows.length; i += 200) {
        await sb
          .from('shopify_products')
          .upsert(rows.slice(i, i + 200), { onConflict: 'id' });
      }
      productsSynced += rows.length;
    }

    // Customer master
    for await (const batch of iterateShopifyCustomers({ pageSize: 250 })) {
      if (batch.length === 0) continue;
      const rows = batch.map((c: ShopifyCustomer) => ({
        id: c.id,
        email: c.email || null,
        first_name: c.first_name || null,
        last_name: c.last_name || null,
        phone: c.phone || null,
        orders_count: c.orders_count ?? 0,
        total_spent: toNumber(c.total_spent),
        tags:
          typeof c.tags === 'string' && c.tags.trim().length > 0
            ? c.tags.split(',').map(t => t.trim())
            : [],
        state: c.state || null,
        created_at: toTs(c.created_at),
        updated_at: toTs(c.updated_at),
        last_order_id: c.last_order_id ?? null,
        raw: (c as unknown) as Record<string, unknown>,
        synced_at: new Date().toISOString(),
      }));
      for (let i = 0; i < rows.length; i += 200) {
        await sb
          .from('shopify_customers')
          .upsert(rows.slice(i, i + 200), { onConflict: 'id' });
      }
      customersSynced += rows.length;
    }

    for await (const batch of iterateShopifyOrders({
      status: 'any',
      createdAtMin: cutoff,
      pageSize: 250,
    })) {
      if (batch.length === 0) continue;

      const orderRows = batch.map((o: ShopifyOrder) => {
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
        // Fulfillment timestamps for the exec dashboard.
        const fulfillments = Array.isArray(o.fulfillments) ? o.fulfillments : [];
        const firstFulfilledAt = fulfillments
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
          shop_domain: domain,
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
      });

      for (let i = 0; i < orderRows.length; i += 100) {
        await sb
          .from('shopify_orders')
          .upsert(orderRows.slice(i, i + 100), { onConflict: 'id' });
      }
      ordersSynced += orderRows.length;

      // Line items — upsert in a second pass so the FK is satisfied.
      const lineRows: Array<Record<string, unknown>> = [];
      for (const o of batch) {
        for (const li of (o.line_items || []) as ShopifyOrderLineItem[]) {
          lineRows.push({
            id: li.id,
            order_id: o.id,
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
          });
        }
      }
      for (let i = 0; i < lineRows.length; i += 200) {
        await sb
          .from('shopify_line_items')
          .upsert(lineRows.slice(i, i + 200), { onConflict: 'id' });
      }
      lineItemsSynced += lineRows.length;
    }

    await sb
      .from('shopify_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'succeeded',
        orders_synced: ordersSynced,
        line_items_synced: lineItemsSynced,
        products_synced: productsSynced,
        customers_synced: customersSynced,
      })
      .eq('id', runId);

    return {
      ok: true,
      run_id: runId,
      orders_synced: ordersSynced,
      line_items_synced: lineItemsSynced,
      products_synced: productsSynced,
      customers_synced: customersSynced,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb
      .from('shopify_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'failed',
        error: msg,
        orders_synced: ordersSynced,
        line_items_synced: lineItemsSynced,
        products_synced: productsSynced,
        customers_synced: customersSynced,
      })
      .eq('id', runId);
    return { ok: false, error: msg };
  }
}
