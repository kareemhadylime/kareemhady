import { supabaseAdmin } from './supabase';
import {
  iterateShopifyOrders,
  type ShopifyOrder,
  type ShopifyOrderLineItem,
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
function shopDomain(): string {
  const raw = (process.env.SHOPIFY_STORE_DOMAIN || '').trim();
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

  const domain = shopDomain();
  const cutoff = new Date(
    Date.now() - BACKFILL_DAYS * 24 * 3600 * 1000
  ).toISOString();

  let ordersSynced = 0;
  let lineItemsSynced = 0;

  try {
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
      })
      .eq('id', runId);

    return {
      ok: true,
      run_id: runId,
      orders_synced: ordersSynced,
      line_items_synced: lineItemsSynced,
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
      })
      .eq('id', runId);
    return { ok: false, error: msg };
  }
}
