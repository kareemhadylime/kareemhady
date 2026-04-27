import 'server-only';
import { ordersOnDay, type KikaCorpus, type KikaOrder } from './corpus';
import type { DiscountSection, DiscountUsageRow } from './types';

// Discount usage section. Reads discount codes off `shopify_orders.raw`
// (Shopify Admin API persists them under `discount_codes[]` and
// `discount_applications[]`). For our purposes we want:
//   - per-code: usage count, gross revenue of orders carrying it, total
//     discount EGP applied
//   - aggregate: total orders with any discount, total discount EGP, and
//     discount-as-% of gross revenue (margin pressure indicator)

type RawDiscountCode = {
  code?: string;
  amount?: number | string;
  type?: string;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

function pickCodes(o: KikaOrder): Array<{ code: string; amount: number }> {
  const raw = (o.raw || {}) as Record<string, unknown>;
  // Primary source: top-level `discount_codes` array
  const codes = (raw.discount_codes as RawDiscountCode[] | undefined) || [];
  const out: Array<{ code: string; amount: number }> = [];
  for (const dc of codes) {
    const code = String(dc.code || '').trim();
    if (!code) continue;
    const amt = typeof dc.amount === 'string' ? Number(dc.amount) : Number(dc.amount || 0);
    out.push({ code, amount: Number.isFinite(amt) ? amt : 0 });
  }
  return out;
}

export function buildDiscountSection(args: {
  corpus: KikaCorpus;
  yesterday: string;
  yesterdayGross: number;
}): DiscountSection {
  const yest = ordersOnDay(args.corpus, args.yesterday).filter(
    o => !o.is_cancelled
  );

  let totalOrdersWithDiscount = 0;
  let totalDiscount = 0;

  type Bucket = { code: string; uses: number; revenue: number; discount: number };
  const byCode = new Map<string, Bucket>();

  for (const o of yest) {
    const codes = pickCodes(o);
    if (codes.length > 0) totalOrdersWithDiscount += 1;
    totalDiscount += o.total_discounts;
    for (const dc of codes) {
      const b = byCode.get(dc.code) || {
        code: dc.code,
        uses: 0,
        revenue: 0,
        discount: 0,
      };
      b.uses += 1;
      b.revenue += o.total;
      // Per-code amount is what Shopify allocates to that code; sum across
      // all uses to get the discount-cost contribution from this code alone.
      b.discount += dc.amount;
      byCode.set(dc.code, b);
    }
  }

  const rows: DiscountUsageRow[] = Array.from(byCode.values())
    .sort((a, b) => b.uses - a.uses)
    .map(b => ({
      code: b.code,
      uses: b.uses,
      revenue_egp: round2(b.revenue),
      discount_egp: round2(b.discount),
    }));

  const pctOfGross =
    args.yesterdayGross > 0
      ? (totalDiscount / args.yesterdayGross) * 100
      : null;

  return {
    total_orders_with_discount: totalOrdersWithDiscount,
    total_discount_egp: round2(totalDiscount),
    pct_of_gross_revenue:
      pctOfGross !== null ? Number(pctOfGross.toFixed(1)) : null,
    by_code: rows,
  };
}
