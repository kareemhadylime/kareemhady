import 'server-only';
import { ordersOnDay, linesForOrders, type KikaCorpus } from './corpus';
import type { TopProductRow } from './types';

// Top products + variants for yesterday. Top 10 by revenue, with each row
// keyed at the product OR variant level depending on data quality:
//   - If variant_id is present and the order has a variant title, we show
//     the variant ("Marina One-Piece — Black M").
//   - Otherwise we collapse to product title only.
//
// `share_of_day_pct` is share of yesterday's NET revenue (gross − refunds),
// matching the topline. So if a product had 12 units / EGP 24k and net
// revenue was EGP 48k, share = 50%.

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function buildTopProducts(args: {
  corpus: KikaCorpus;
  yesterday: string;
  yesterdayNetRevenue: number;
}): TopProductRow[] {
  const yest = ordersOnDay(args.corpus, args.yesterday).filter(
    o => !o.is_cancelled
  );
  const lines = linesForOrders(args.corpus, yest.map(o => o.id));

  type Bucket = {
    product_id: number | null;
    title: string;
    variant_label: string | null;
    units: number;
    revenue: number;
    order_ids: Set<number>;
  };

  const map = new Map<string, Bucket>();
  for (const li of lines) {
    // Variant-level key when we have a variant + a variant-specific name.
    // Shopify line-item `name` is "Product — Variant" if variant exists,
    // else just "Product"; the bare `title` is product-only.
    const variantLabel =
      li.variant_id && li.name && li.title && li.name !== li.title
        ? li.name.replace(li.title, '').replace(/^[\s\-—–]+/, '').trim() || null
        : null;
    const key = `${li.product_id ?? 'p'}|${li.variant_id ?? 'v'}|${li.title ?? 'untitled'}`;
    const b = map.get(key) || {
      product_id: li.product_id,
      title: li.title || 'Untitled',
      variant_label: variantLabel,
      units: 0,
      revenue: 0,
      order_ids: new Set<number>(),
    };
    b.units += li.quantity;
    b.revenue += li.price * li.quantity;
    b.order_ids.add(li.order_id);
    map.set(key, b);
  }

  const denom = args.yesterdayNetRevenue > 0 ? args.yesterdayNetRevenue : 1;
  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(b => ({
      product_id: b.product_id,
      title: b.title,
      variant_label: b.variant_label,
      units: b.units,
      revenue_egp: round2(b.revenue),
      share_of_day_pct: Number(((b.revenue / denom) * 100).toFixed(1)),
    }));
}
