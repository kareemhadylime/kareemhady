import 'server-only';
import { addDays } from './cairo-dates';
import {
  ordersInRange,
  linesForOrders,
  type KikaCorpus,
  type KikaOrder,
} from './corpus';
import type { WeeklyDigest } from './types';

// Weekly digest section — only emitted on Sunday reports (Q9 #1). Window
// = the most recent Sun → Sat (the Cairo retail week). The digest is
// EXTRA on top of the daily report; it doesn't replace any daily section.
//
// Repeat purchase rate (60-day rolling): customers with ≥2 non-cancelled
// orders in the past 60 days, divided by all unique customers in the past
// 60 days. Volatile day-over-day (Q6 in plan), stable enough weekly.

const round2 = (n: number): number => Math.round(n * 100) / 100;

function aggregateWindow(orders: KikaOrder[], corpus: KikaCorpus): {
  net: number;
  orders: number;
  units: number;
  uniqueCustomers: number;
} {
  const nonCancelled = orders.filter(o => !o.is_cancelled);
  const collected = nonCancelled.filter(o => o.is_collected);
  const gross = collected.reduce((s, o) => s + o.total, 0);
  const refunds = nonCancelled.reduce((s, o) => s + o.refunded_amount, 0);
  const lines = linesForOrders(corpus, nonCancelled.map(o => o.id));
  const units = lines.reduce((s, li) => s + li.quantity, 0);
  const customerKeys = new Set<string>();
  for (const o of nonCancelled) {
    customerKeys.add(String(o.customer_id ?? o.email ?? `ord:${o.id}`));
  }
  return {
    net: round2(gross - refunds),
    orders: nonCancelled.length,
    units,
    uniqueCustomers: customerKeys.size,
  };
}

function computeRollingRepeatRate(
  corpus: KikaCorpus,
  windowFrom: string,
  windowTo: string
): number | null {
  const window = ordersInRange(corpus, windowFrom, windowTo).filter(
    o => !o.is_cancelled
  );
  if (window.length === 0) return null;
  const perCustomer = new Map<string, number>();
  for (const o of window) {
    const key = String(o.customer_id ?? o.email ?? `ord:${o.id}`);
    perCustomer.set(key, (perCustomer.get(key) || 0) + 1);
  }
  const unique = perCustomer.size;
  if (unique === 0) return null;
  const repeat = Array.from(perCustomer.values()).filter(n => n > 1).length;
  return Number(((repeat / unique) * 100).toFixed(1));
}

function pctChange(current: number, prior: number): number | null {
  if (prior === 0 && current === 0) return null;
  if (prior === 0) return null;
  return Number((((current - prior) / Math.abs(prior)) * 100).toFixed(1));
}

const fmtEgp = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) return `EGP ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `EGP ${Math.round(n / 1000)}k`;
  return `EGP ${Math.round(n).toLocaleString('en-US')}`;
};

export function buildWeeklyDigest(args: {
  corpus: KikaCorpus;
  yesterday: string;
  weekStart: string;            // most recent Sunday <= yesterday
  weekDaysElapsed: number;
}): WeeklyDigest {
  const weekEnd = args.yesterday; // run on Sunday → describes Sun–Sat completed week
  const windowOrders = ordersInRange(args.corpus, args.weekStart, weekEnd);
  const cur = aggregateWindow(windowOrders, args.corpus);

  const priorWeekStart = addDays(args.weekStart, -7);
  const priorWeekEnd = addDays(weekEnd, -7);
  const priorOrders = ordersInRange(args.corpus, priorWeekStart, priorWeekEnd);
  const prior = aggregateWindow(priorOrders, args.corpus);

  const repeatRate = computeRollingRepeatRate(
    args.corpus,
    addDays(weekEnd, -59),
    weekEnd
  );

  const netVsPrior = pctChange(cur.net, prior.net);
  const ordVsPrior = pctChange(cur.orders, prior.orders);

  const arrow = (p: number | null): string =>
    p === null ? '·' : p > 5 ? '▲' : p < -5 ? '▼' : '—';

  const oneliner = [
    `Week ${args.weekStart} → ${weekEnd}:`,
    `${fmtEgp(cur.net)} net`,
    netVsPrior !== null
      ? `(${arrow(netVsPrior)} ${netVsPrior > 0 ? '+' : ''}${netVsPrior}% wk-over-wk)`
      : '',
    `· ${cur.orders} orders`,
    ordVsPrior !== null
      ? `(${arrow(ordVsPrior)} ${ordVsPrior > 0 ? '+' : ''}${ordVsPrior}%)`
      : '',
    repeatRate !== null ? `· repeat rate ${repeatRate}% (60d)` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    week_start: args.weekStart,
    week_end: weekEnd,
    days_elapsed: args.weekDaysElapsed,
    net_revenue_egp: cur.net,
    orders: cur.orders,
    units: cur.units,
    unique_customers: cur.uniqueCustomers,
    repeat_rate_pct: repeatRate,
    prior_week_net_revenue_egp: prior.net,
    prior_week_orders: prior.orders,
    net_revenue_vs_prior_week_pct: netVsPrior,
    orders_vs_prior_week_pct: ordVsPrior,
    oneliner,
  };
}
