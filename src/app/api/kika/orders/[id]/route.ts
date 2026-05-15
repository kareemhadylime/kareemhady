import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireDomainAccess } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import type {
  KikaOrderDetail,
  ShopifyAddress,
} from '@/app/emails/kika/exec/_components/order-detail-types';

export const dynamic = 'force-dynamic';

type ShopifyRaw = {
  phone?: string | null;
  note?: string | null;
  payment_gateway_names?: string[];
  shipping_address?: ShopifyAddress | null;
  billing_address?: ShopifyAddress | null;
  discount_codes?: Array<{ code?: string | null; amount?: string | number | null; type?: string | null }>;
  shipping_lines?: Array<{ title?: string | null; price?: string | number | null; code?: string | null }>;
  fulfillments?: Array<{ id?: number; status?: string | null; created_at?: string | null; updated_at?: string | null; tracking_number?: string | null; tracking_company?: string | null; tracking_url?: string | null }>;
};

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  await requireDomainAccess('kika');
  const { id: idParam } = await ctx.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const [orderRes, linesRes] = await Promise.all([
    sb
      .from('shopify_orders')
      .select(
        'id, shop_domain, name, email, customer_id, customer_name, created_at, processed_at, cancelled_at, financial_status, fulfillment_status, currency, subtotal, total, total_discounts, total_tax, total_shipping, refunded_amount, tags, raw'
      )
      .eq('id', id)
      .maybeSingle(),
    sb
      .from('shopify_line_items')
      .select('id, title, name, sku, vendor, quantity, price, total_discount')
      .eq('order_id', id)
      .order('id', { ascending: true }),
  ]);

  if (orderRes.error) {
    return NextResponse.json({ error: orderRes.error.message }, { status: 500 });
  }
  if (!orderRes.data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const raw = (orderRes.data.raw || {}) as ShopifyRaw;

  const detail: KikaOrderDetail = {
    id: orderRes.data.id as number,
    name: orderRes.data.name ?? null,
    shop_domain: orderRes.data.shop_domain ?? null,
    email: orderRes.data.email ?? null,
    phone: raw.phone ?? raw.shipping_address?.phone ?? raw.billing_address?.phone ?? null,
    customer_id: orderRes.data.customer_id ?? null,
    customer_name: orderRes.data.customer_name ?? null,
    created_at: orderRes.data.created_at ?? null,
    processed_at: orderRes.data.processed_at ?? null,
    cancelled_at: orderRes.data.cancelled_at ?? null,
    financial_status: orderRes.data.financial_status ?? null,
    fulfillment_status: orderRes.data.fulfillment_status ?? null,
    currency: orderRes.data.currency ?? null,
    subtotal: numOrNull(orderRes.data.subtotal),
    total: numOrNull(orderRes.data.total),
    total_discounts: numOrNull(orderRes.data.total_discounts),
    total_tax: numOrNull(orderRes.data.total_tax),
    total_shipping: numOrNull(orderRes.data.total_shipping),
    refunded_amount: numOrNull(orderRes.data.refunded_amount),
    tags: (orderRes.data.tags as string[] | null) ?? null,
    note: raw.note ?? null,
    payment_gateways: Array.isArray(raw.payment_gateway_names) ? raw.payment_gateway_names : [],
    shipping_address: raw.shipping_address ?? null,
    billing_address: raw.billing_address ?? null,
    discount_codes: Array.isArray(raw.discount_codes)
      ? raw.discount_codes.map(d => ({
          code: String(d.code ?? ''),
          amount: numOrNull(d.amount),
          type: d.type ?? null,
        }))
      : [],
    shipping_lines: Array.isArray(raw.shipping_lines)
      ? raw.shipping_lines.map(s => ({
          title: String(s.title ?? ''),
          price: numOrNull(s.price),
          code: s.code ?? null,
        }))
      : [],
    fulfillments: Array.isArray(raw.fulfillments)
      ? raw.fulfillments.map(f => ({
          id: f.id ?? null,
          status: f.status ?? null,
          created_at: f.created_at ?? null,
          tracking_number: f.tracking_number ?? null,
          tracking_company: f.tracking_company ?? null,
          tracking_url: f.tracking_url ?? null,
        }))
      : [],
    line_items: (linesRes.data ?? []).map(l => {
      const qty = numOrNull(l.quantity) ?? 0;
      const price = numOrNull(l.price) ?? 0;
      const disc = numOrNull(l.total_discount) ?? 0;
      return {
        id: l.id as number,
        title: l.title ?? null,
        name: l.name ?? null,
        sku: l.sku ?? null,
        vendor: l.vendor ?? null,
        quantity: numOrNull(l.quantity),
        price: numOrNull(l.price),
        total_discount: numOrNull(l.total_discount),
        line_total: qty > 0 ? qty * price - disc : null,
      };
    }),
  };

  return NextResponse.json(detail);
}
