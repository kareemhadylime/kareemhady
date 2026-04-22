import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import {
  shopifyOrderToRow,
  shopifyLineItemToRow,
} from '@/lib/shopify-order-mapper';
import type { ShopifyOrder, ShopifyOrderLineItem } from '@/lib/shopify';

// Shopify webhook receiver. Single endpoint handles all topics
// (orders/create, orders/updated, orders/fulfilled, orders/cancelled,
// refunds/create). Authentication = HMAC-SHA256 of the raw request body
// keyed by the app's Client Secret, compared constant-time against the
// X-Shopify-Hmac-Sha256 header.
//
// Register via POST /api/shopify/register-webhooks after OAuth install.
// Shopify pushes a test event on registration; any 2xx response counts
// as acknowledgement.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { getCredential } = await import('@/lib/credentials');
  const secret = await getCredential('shopify', 'app_client_secret');
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'shopify.app_client_secret not configured' },
      { status: 500 }
    );
  }

  // Read raw body for HMAC verification. Must NOT parse JSON first.
  const raw = await req.text();
  const receivedHmac = req.headers.get('x-shopify-hmac-sha256') || '';
  const topic = req.headers.get('x-shopify-topic') || '';
  const shop = req.headers.get('x-shopify-shop-domain') || '';

  const expected = crypto
    .createHmac('sha256', secret)
    .update(raw, 'utf8')
    .digest('base64');

  try {
    const a = Buffer.from(receivedHmac, 'base64');
    const b = Buffer.from(expected, 'base64');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json(
        { ok: false, error: 'hmac_mismatch' },
        { status: 401 }
      );
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: 'hmac_decode_failed' },
      { status: 401 }
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json' },
      { status: 400 }
    );
  }

  const sb = supabaseAdmin();

  try {
    switch (topic) {
      case 'orders/create':
      case 'orders/updated':
      case 'orders/fulfilled':
      case 'orders/partially_fulfilled':
      case 'orders/cancelled':
      case 'orders/paid': {
        const order = payload as unknown as ShopifyOrder;
        const orderRow = shopifyOrderToRow(order, shop);
        await sb
          .from('shopify_orders')
          .upsert([orderRow], { onConflict: 'id' });

        const lineRows = (order.line_items || []).map(
          (li: ShopifyOrderLineItem) => shopifyLineItemToRow(li, order.id)
        );
        if (lineRows.length > 0) {
          await sb
            .from('shopify_line_items')
            .upsert(lineRows, { onConflict: 'id' });
        }
        return NextResponse.json({ ok: true, topic, id: order.id });
      }

      case 'refunds/create': {
        // Refund payload has `order_id`. Re-sum refunded_amount from all
        // refunds on that order by re-fetching via API would be cleaner,
        // but webhooks of this topic include full refund object with
        // transactions. We additively bump the refunded_amount on the
        // order row.
        const refund = payload as unknown as {
          order_id: number;
          transactions?: Array<{ amount?: string; kind?: string }>;
        };
        if (!refund.order_id) {
          return NextResponse.json({ ok: false, error: 'no_order_id' }, { status: 400 });
        }
        const refundAmount = (refund.transactions || [])
          .filter(t => (t.kind || '').toLowerCase().includes('refund') ||
                       t.kind === 'change')
          .reduce((s, t) => s + (Number(t.amount) || 0), 0);
        // Read, sum, update — tiny race acceptable since a subsequent
        // bulk sync will re-normalize from the full refunds array.
        const { data: existing } = await sb
          .from('shopify_orders')
          .select('refunded_amount')
          .eq('id', refund.order_id)
          .maybeSingle();
        const prev =
          (existing as { refunded_amount: number | null } | null)
            ?.refunded_amount || 0;
        await sb
          .from('shopify_orders')
          .update({ refunded_amount: prev + refundAmount })
          .eq('id', refund.order_id);
        return NextResponse.json({
          ok: true,
          topic,
          order_id: refund.order_id,
          added: refundAmount,
        });
      }

      default:
        // Accept-and-ignore so Shopify doesn't retry unknown topics.
        return NextResponse.json({ ok: true, topic, ignored: true });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, topic, error: msg },
      { status: 500 }
    );
  }
}
