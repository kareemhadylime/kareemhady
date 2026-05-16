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

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  // Plain-text projection: drop tags, decode the small set of HTML entities
  // we see in Shopify descriptions, collapse whitespace.
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

/** Picks the best image URL for a line item: variant-specific if the variant
 * has an image_id we can resolve back to raw.images[], otherwise the product's
 * primary image. Returns null if there's no product or no images at all. */
function pickLineItemImage(
  productRaw: Record<string, unknown> | null,
  variantId: number | null
): string | null {
  if (!productRaw) return null;
  const images = (productRaw['images'] as Array<Record<string, unknown>> | null) || [];
  // Variant → image_id lookup.
  if (variantId) {
    const variants = (productRaw['variants'] as Array<Record<string, unknown>> | null) || [];
    const v = variants.find(x => Number(x['id']) === variantId);
    const imageId = v && v['image_id'] != null ? Number(v['image_id']) : null;
    if (imageId) {
      const match = images.find(im => Number(im['id']) === imageId);
      const src = match && typeof match['src'] === 'string' ? (match['src'] as string) : null;
      if (src) return src;
    }
  }
  // Fall back to product primary.
  const primary =
    (productRaw['image'] as Record<string, unknown> | null) || images[0] || null;
  if (primary && typeof primary['src'] === 'string') {
    return primary['src'] as string;
  }
  return null;
}

function pickVariantTitle(
  productRaw: Record<string, unknown> | null,
  variantId: number | null
): string | null {
  if (!productRaw || !variantId) return null;
  const variants = (productRaw['variants'] as Array<Record<string, unknown>> | null) || [];
  const v = variants.find(x => Number(x['id']) === variantId);
  if (!v) return null;
  // Shopify pre-builds a 'title' like "Beige / MEDIUM". If that's missing or
  // generic ("Default Title"), reconstruct from option1/option2/option3.
  const t = typeof v['title'] === 'string' ? (v['title'] as string) : null;
  if (t && t.toLowerCase() !== 'default title') return t;
  const opts = [v['option1'], v['option2'], v['option3']]
    .filter(o => typeof o === 'string' && o)
    .map(o => o as string);
  return opts.length > 0 ? opts.join(' / ') : null;
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
      .select('id, product_id, variant_id, title, name, sku, vendor, quantity, price, total_discount')
      .eq('order_id', id)
      .order('id', { ascending: true }),
  ]);

  if (orderRes.error) {
    return NextResponse.json({ error: orderRes.error.message }, { status: 500 });
  }
  if (!orderRes.data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Pull related product rows so we can attach a thumbnail + variant title +
  // description to each line item. Same primary-image rules as the inventory
  // page: prefer raw.image, fall back to first of raw.images[]. For variants,
  // try matching the variant's image_id back to raw.images[].
  type ProductRow = {
    id: number;
    title: string | null;
    raw: Record<string, unknown> | null;
  };
  const productIds = Array.from(
    new Set(
      (linesRes.data ?? [])
        .map(l => l.product_id)
        .filter((p): p is number => typeof p === 'number' && p > 0)
    )
  );
  const productMap = new Map<number, ProductRow>();
  if (productIds.length > 0) {
    const { data: prodRows } = await sb
      .from('shopify_products')
      .select('id, title, raw')
      .in('id', productIds);
    for (const p of (prodRows ?? []) as ProductRow[]) {
      productMap.set(p.id, p);
    }
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
      const product = l.product_id ? productMap.get(l.product_id) : undefined;
      const productRaw = (product?.raw ?? null) as Record<string, unknown> | null;
      const bodyHtml = productRaw && typeof productRaw['body_html'] === 'string'
        ? (productRaw['body_html'] as string)
        : null;
      return {
        id: l.id as number,
        product_id: l.product_id ?? null,
        variant_id: l.variant_id ?? null,
        title: l.title ?? null,
        name: l.name ?? null,
        sku: l.sku ?? null,
        vendor: l.vendor ?? null,
        quantity: numOrNull(l.quantity),
        price: numOrNull(l.price),
        total_discount: numOrNull(l.total_discount),
        line_total: qty > 0 ? qty * price - disc : null,
        variant_title: pickVariantTitle(productRaw, l.variant_id ?? null),
        image_url: pickLineItemImage(productRaw, l.variant_id ?? null),
        product_description: stripHtml(bodyHtml),
      };
    }),
  };

  return NextResponse.json(detail);
}
