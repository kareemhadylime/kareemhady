import type { AnomalyFlag, InventorySection, ToplineKpi, DiscountSection, TopProductRow } from './types';

// Anomaly detection — adds a banner at the top of the report when something
// notable happened yesterday. Hardcoded thresholds (Q7 — UI editor v2).
//
// Triggers:
//   1. revenue spike/drop  — > 2σ off rolling-30-day mean of net revenue
//   2. sold out             — any SKU with on_hand=0 AND velocity>0 yesterday
//   3. concentration risk   — single SKU >= 30% of yesterday's net revenue
//   4. discount heavy       — discount cost > 20% of gross revenue

export const ANOMALY_SIGMA = 2.0;
export const ANOMALY_CONCENTRATION_PCT = 30;
export const ANOMALY_DISCOUNT_HEAVY_PCT = 20;

/**
 * Compute mean and standard deviation. Returns nulls if fewer than 7
 * non-zero observations (too noisy to flag as σ-deviation).
 */
function meanStdev(values: number[]): { mean: number; stdev: number } | null {
  const nonZero = values.filter(v => v > 0);
  if (nonZero.length < 7) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
  return { mean, stdev: Math.sqrt(variance) };
}

export function detectAnomalies(args: {
  topline: ToplineKpi;
  inventory: InventorySection;
  discounts: DiscountSection;
  topProducts: TopProductRow[];
  revenueHistory14d: number[];      // net revenue daily series, oldest→newest, length 14 (drop today)
}): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];

  // 1. Revenue σ-deviation
  const stats = meanStdev(args.revenueHistory14d);
  if (stats && stats.stdev > 0) {
    const z = (args.topline.net_revenue_egp - stats.mean) / stats.stdev;
    if (z >= ANOMALY_SIGMA) {
      flags.push({
        kind: 'revenue_spike',
        severity: 'info',
        message: `Revenue spiked ${z.toFixed(1)}σ above 14-day mean (~EGP ${Math.round(stats.mean).toLocaleString()}).`,
        details: { z, mean: stats.mean, stdev: stats.stdev },
      });
    } else if (z <= -ANOMALY_SIGMA) {
      flags.push({
        kind: 'revenue_drop',
        severity: 'warn',
        message: `Revenue dropped ${Math.abs(z).toFixed(1)}σ below 14-day mean (~EGP ${Math.round(stats.mean).toLocaleString()}).`,
        details: { z, mean: stats.mean, stdev: stats.stdev },
      });
    }
  }

  // 2. Sold out SKUs
  if (args.inventory.stockouts.length > 0) {
    const top = args.inventory.stockouts.slice(0, 3);
    const summary = top
      .map(s => `${s.title}${s.variant_label ? ' / ' + s.variant_label : ''}`)
      .join(' · ');
    flags.push({
      kind: 'sold_out',
      severity: 'warn',
      message: `${args.inventory.stockouts.length} SKU${args.inventory.stockouts.length === 1 ? '' : 's'} sold out yesterday: ${summary}${args.inventory.stockouts.length > 3 ? ' · …' : ''}`,
      details: { count: args.inventory.stockouts.length },
    });
  }

  // 3. Concentration risk
  if (args.topProducts.length > 0 && args.topline.net_revenue_egp > 0) {
    const top = args.topProducts[0];
    if (top.share_of_day_pct >= ANOMALY_CONCENTRATION_PCT) {
      flags.push({
        kind: 'concentration_risk',
        severity: 'info',
        message: `${top.title} drove ${top.share_of_day_pct.toFixed(0)}% of yesterday's revenue — single-SKU concentration risk.`,
        details: { product_id: top.product_id, pct: top.share_of_day_pct },
      });
    }
  }

  // 4. Discount-heavy day
  if (
    args.topline.gross_revenue_egp > 0 &&
    args.discounts.pct_of_gross_revenue !== null &&
    args.discounts.pct_of_gross_revenue >= ANOMALY_DISCOUNT_HEAVY_PCT
  ) {
    flags.push({
      kind: 'discount_heavy',
      severity: 'info',
      message: `Discounts cost ${args.discounts.pct_of_gross_revenue.toFixed(0)}% of gross — promo-heavy day, watch margin.`,
      details: { pct: args.discounts.pct_of_gross_revenue },
    });
  }

  return flags;
}
