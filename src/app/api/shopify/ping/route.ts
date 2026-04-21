import { NextRequest, NextResponse } from 'next/server';
import {
  getShopifyShop,
  listShopifyOrders,
  countShopifyOrders,
} from '@/lib/shopify';

// Smoke-test endpoint for the Kika Shopify (shopfromkika) integration.
// Protected by CRON_SECRET. Returns shop metadata + last-30d order count
// + a small sample of recent orders.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://kareemhady.vercel.app/api/shopify/ping

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  const env = {
    SHOPIFY_STORE_DOMAIN: !!process.env.SHOPIFY_STORE_DOMAIN,
    SHOPIFY_ADMIN_ACCESS_TOKEN: !!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
  };
  const missing = Object.entries(env).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `Shopify credentials missing: ${missing.join(', ')}. Generate via Shopify Admin → Apps → Develop apps → your custom app → API credentials.`,
        env,
      },
      { status: 400 }
    );
  }

  const started = Date.now();
  try {
    const shop = await getShopifyShop();
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400e3).toISOString();

    const [orderCount30d, orderCountYtd, recentOrders] = await Promise.all([
      countShopifyOrders({ createdAtMin: thirtyDaysAgo }),
      countShopifyOrders({
        createdAtMin: `${now.getUTCFullYear()}-01-01T00:00:00Z`,
      }),
      listShopifyOrders({ limit: 10, createdAtMin: thirtyDaysAgo }),
    ]);

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - started,
      shop: {
        name: shop?.name,
        domain: shop?.domain,
        currency: shop?.currency,
        timezone: shop?.timezone,
        plan: shop?.plan_name,
      },
      orders: {
        last_30_days: orderCount30d,
        ytd: orderCountYtd,
      },
      sample: recentOrders.map(o => ({
        id: o.id,
        name: o.name,
        email: o.email || null,
        created_at: o.created_at,
        financial_status: o.financial_status || null,
        fulfillment_status: o.fulfillment_status || null,
        total: o.total_price,
        currency: o.currency,
        line_item_count: (o.line_items || []).length,
        customer:
          o.customer?.first_name || o.customer?.last_name
            ? `${o.customer?.first_name || ''} ${o.customer?.last_name || ''}`.trim()
            : null,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, duration_ms: Date.now() - started, error: msg },
      { status: 500 }
    );
  }
}
