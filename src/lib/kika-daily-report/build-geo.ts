import 'server-only';
import { ordersOnDay, type KikaCorpus, type KikaOrder } from './corpus';
import type { GeoRow, GeoSection } from './types';

// Geography section — top markets by yesterday's revenue. Reads
// `shipping_address.country` and `shipping_address.province` (governorate
// for Egypt) off `shopify_orders.raw`. Top 5 each.
//
// Provinces inside Egypt get aggregated into a separate "by_governorate"
// list; foreign orders feed only the country bucket. This is the right
// shape for a swimwear brand operating mostly domestically with a small
// GCC tail.

const round2 = (n: number): number => Math.round(n * 100) / 100;

function pickShippingAddress(o: KikaOrder): {
  country: string | null;
  province: string | null;
  city: string | null;
} {
  const raw = (o.raw || {}) as Record<string, unknown>;
  const addr =
    (raw.shipping_address as Record<string, unknown> | null) ||
    (raw.billing_address as Record<string, unknown> | null) ||
    null;
  if (!addr) return { country: null, province: null, city: null };
  const country = typeof addr.country === 'string' ? addr.country : null;
  const province =
    typeof addr.province === 'string' ? addr.province : null;
  const city = typeof addr.city === 'string' ? addr.city : null;
  return { country, province, city };
}

export function buildGeoSection(args: {
  corpus: KikaCorpus;
  yesterday: string;
}): GeoSection {
  const yest = ordersOnDay(args.corpus, args.yesterday).filter(
    o => !o.is_cancelled
  );
  const total = yest.reduce((s, o) => s + o.total, 0);

  const countryMap = new Map<string, { orders: number; revenue: number }>();
  const govMap = new Map<string, { orders: number; revenue: number }>();

  for (const o of yest) {
    const addr = pickShippingAddress(o);
    const country = addr.country || 'Unknown';
    const cb = countryMap.get(country) || { orders: 0, revenue: 0 };
    cb.orders += 1;
    cb.revenue += o.total;
    countryMap.set(country, cb);

    if (country.toLowerCase() === 'egypt' && (addr.province || addr.city)) {
      const label = addr.province || addr.city || 'Egypt — unknown';
      const gb = govMap.get(label) || { orders: 0, revenue: 0 };
      gb.orders += 1;
      gb.revenue += o.total;
      govMap.set(label, gb);
    }
  }

  const denom = total > 0 ? total : 1;
  const toRows = (m: Map<string, { orders: number; revenue: number }>): GeoRow[] =>
    Array.from(m.entries())
      .map(([label, v]) => ({
        label,
        orders: v.orders,
        revenue_egp: round2(v.revenue),
        pct_of_revenue: Number(((v.revenue / denom) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.revenue_egp - a.revenue_egp)
      .slice(0, 5);

  return {
    by_country: toRows(countryMap),
    by_governorate: toRows(govMap),
  };
}
