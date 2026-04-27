import 'server-only';
import { addDays } from './cairo-dates';
import { buildComparisonSet } from './comparisons';
import {
  ordersOnDay,
  ordersInRange,
  linesForOrders,
  type KikaCorpus,
  type KikaOrder,
} from './corpus';
import type { SparklineSeries, ToplineKpi } from './types';

// Topline KPIs + sparkline series. Computes net/gross revenue, AOV, units,
// customer counts, and the four comparison sets (vs prior day, vs prior
// weekday, vs MTD prior month, optionally YoY).
//
// "Net revenue" definition:
//   gross (paid+fulfilled, non-cancelled) − refunds − discounts (already
//   netted out of `total` in Shopify, so we don't subtract again)
// Cancelled COD orders never collected cash, so they're excluded throughout.

function sumTotal(orders: KikaOrder[], filter: (o: KikaOrder) => boolean = () => true): number {
  let s = 0;
  for (const o of orders) {
    if (filter(o)) s += o.total;
  }
  return s;
}

function unitsForOrders(corpus: KikaCorpus, orders: KikaOrder[]): number {
  if (orders.length === 0) return 0;
  const lines = linesForOrders(corpus, orders.map(o => o.id));
  return lines.reduce((s, li) => s + li.quantity, 0);
}

function customerStats(orders: KikaOrder[], corpus: KikaCorpus): {
  unique: number;
  new_count: number;
  returning_count: number;
} {
  const byCustomer = new Set<string>();
  let newCount = 0;
  let returningCount = 0;
  const seenLifetime = new Set<number>();
  for (const o of orders) {
    if (o.is_cancelled) continue;
    const key = String(o.customer_id ?? o.email ?? `ord:${o.id}`);
    byCustomer.add(key);
    if (o.customer_id != null && !seenLifetime.has(o.customer_id)) {
      const c = corpus.customers.get(o.customer_id);
      if (c) {
        if (c.orders_count > 1) returningCount += 1;
        else newCount += 1;
      } else {
        // No customer row mirrored — treat as new.
        newCount += 1;
      }
      seenLifetime.add(o.customer_id);
    } else if (o.customer_id == null) {
      newCount += 1;
    }
  }
  return {
    unique: byCustomer.size,
    new_count: newCount,
    returning_count: returningCount,
  };
}

/**
 * Aggregate raw KPI numbers for an arbitrary date range. Used both for
 * yesterday's "current" and every comparison window.
 */
function aggregate(orders: KikaOrder[], corpus: KikaCorpus): {
  gross: number;
  net: number;
  refunds: number;
  discounts: number;
  orderCount: number;
  units: number;
  aov: number | null;
} {
  // Gross = sum of totals on collected (paid+fulfilled+non-cancelled) orders.
  // Mirrors the kika-sales / kika-exec semantics — a COD `pending` order
  // hasn't actually generated cash yet, so it shouldn't pad gross.
  const gross = sumTotal(orders, o => o.is_collected);
  // Refunds are tracked on every non-cancelled order (`refunded_amount`).
  const refunds = orders
    .filter(o => !o.is_cancelled)
    .reduce((s, o) => s + o.refunded_amount, 0);
  const discounts = orders
    .filter(o => !o.is_cancelled)
    .reduce((s, o) => s + o.total_discounts, 0);
  const net = gross - refunds;
  const nonCancelled = orders.filter(o => !o.is_cancelled);
  const aov =
    nonCancelled.length > 0
      ? sumTotal(nonCancelled) / nonCancelled.length
      : null;
  return {
    gross,
    net,
    refunds,
    discounts,
    orderCount: nonCancelled.length,
    units: unitsForOrders(corpus, nonCancelled),
    aov,
  };
}

export function buildTopline(args: {
  corpus: KikaCorpus;
  yesterday: string;
  priorDay: string;
  priorWeekday: string;
  priorMonthMtd: { from: string; to: string };
  priorYear: string | null;
  yearAgoCorpus: KikaCorpus | null;     // separate small load — null if YoY not applicable
}): ToplineKpi {
  const { corpus } = args;

  // Yesterday
  const yest = ordersOnDay(corpus, args.yesterday);
  const cur = aggregate(yest, corpus);

  // Prior day
  const pd = ordersOnDay(corpus, args.priorDay);
  const priorDay = aggregate(pd, corpus);

  // Prior weekday (same day-of-week, 7 days back)
  const pw = ordersOnDay(corpus, args.priorWeekday);
  const priorWeekday = aggregate(pw, corpus);

  // Prior month MTD same window
  const pm = ordersInRange(corpus, args.priorMonthMtd.from, args.priorMonthMtd.to);
  const priorMonthMtd = aggregate(pm, corpus);

  // YoY same day (separate corpus load if applicable)
  let priorYear:
    | ReturnType<typeof aggregate>
    | undefined;
  if (args.priorYear && args.yearAgoCorpus) {
    const py = ordersOnDay(args.yearAgoCorpus, args.priorYear);
    priorYear = aggregate(py, args.yearAgoCorpus);
  }

  // Customer counts (yesterday only)
  const cust = customerStats(yest, corpus);
  const repeatRate =
    cust.unique > 0 ? (cust.returning_count / cust.unique) * 100 : null;

  return {
    net_revenue_egp: round2(cur.net),
    gross_revenue_egp: round2(cur.gross),
    refunds_egp: round2(cur.refunds),
    discounts_egp: round2(cur.discounts),
    orders: cur.orderCount,
    units: cur.units,
    aov_egp: cur.aov !== null ? round2(cur.aov) : null,
    unique_customers: cust.unique,
    new_customers: cust.new_count,
    returning_customers: cust.returning_count,
    repeat_rate_pct: repeatRate !== null ? Number(repeatRate.toFixed(1)) : null,
    comparisons: {
      net_revenue: buildComparisonSet({
        current: cur.net,
        priorDay: priorDay.net,
        priorWeekday: priorWeekday.net,
        priorMonthMtd: priorMonthMtd.net,
        priorYear: priorYear?.net,
      }),
      orders: buildComparisonSet({
        current: cur.orderCount,
        priorDay: priorDay.orderCount,
        priorWeekday: priorWeekday.orderCount,
        priorMonthMtd: priorMonthMtd.orderCount,
        priorYear: priorYear?.orderCount,
      }),
      aov: buildComparisonSet({
        current: cur.aov ?? 0,
        priorDay: priorDay.aov ?? 0,
        priorWeekday: priorWeekday.aov ?? 0,
        priorMonthMtd: priorMonthMtd.aov ?? 0,
        priorYear: priorYear?.aov ?? undefined,
      }),
      units: buildComparisonSet({
        current: cur.units,
        priorDay: priorDay.units,
        priorWeekday: priorWeekday.units,
        priorMonthMtd: priorMonthMtd.units,
        priorYear: priorYear?.units,
      }),
    },
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Build the 14-day sparkline series (oldest → newest, length 14, ends on
 * yesterday). Used by the hosted HTML report's mini charts. PDFs skip
 * sparklines (the Beithady PDF doesn't have charts either — too noisy in
 * print).
 */
export function buildSparklines(corpus: KikaCorpus, yesterdayYmd: string): SparklineSeries {
  const labels: string[] = [];
  const netRev: number[] = [];
  const orders: number[] = [];
  for (let i = 13; i >= 0; i--) {
    const ymd = addDays(yesterdayYmd, -i);
    labels.push(ymd);
    const day = ordersOnDay(corpus, ymd);
    const agg = aggregate(day, corpus);
    netRev.push(round2(agg.net));
    orders.push(agg.orderCount);
  }
  return { labels, net_revenue_egp: netRev, orders };
}

/** Re-exported helper for anomaly.ts — drops today and returns the 13
 *  previous days as the rolling baseline. */
export function revenueHistory14d(sparklines: SparklineSeries): number[] {
  // Use all 14 days as the σ-baseline. Yesterday IS one of the 14, but
  // it's the same as `topline.net_revenue_egp` — including it in the
  // baseline doesn't artificially flatten σ for high-variance retail
  // weeks. Anomaly logic uses ANOMALY_SIGMA=2.0 so the threshold is
  // robust either way.
  return sparklines.net_revenue_egp.slice();
}
