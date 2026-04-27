import 'server-only';
import { ordersOnDay, ordersInRange, type KikaCorpus, type KikaOrder } from './corpus';
import type { FulfillmentSection } from './types';

// Fulfillment KPIs for yesterday + a forward-looking "oldest unfulfilled"
// list. Operations cares about:
//   - % of yesterday's orders shipped within 24h
//   - count of orders >48h old still unfulfilled (escalation list)
//   - average + median time-to-fulfill on yesterday's fulfilled orders
//   - the 5 oldest unfulfilled orders across the whole 60-day window
//     (could include cold tail — that's the point: they need attention)

const round1 = (n: number): number => Math.round(n * 10) / 10;

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function ageHoursFromNow(o: KikaOrder): number | null {
  if (!o.created_at) return null;
  return Math.max(0, (Date.now() - new Date(o.created_at).getTime()) / 3_600_000);
}

export function buildFulfillmentSection(args: {
  corpus: KikaCorpus;
  yesterday: string;
}): FulfillmentSection {
  const yest = ordersOnDay(args.corpus, args.yesterday).filter(
    o => !o.is_cancelled
  );

  // Yesterday's fulfilled set + their hours-to-fulfill distribution
  const fulfilledYesterday = yest.filter(o => o.is_fulfilled);
  const hoursArr = fulfilledYesterday
    .map(o => o.hours_to_fulfill)
    .filter((h): h is number => h !== null && h >= 0);
  const within24h = hoursArr.filter(h => h <= 24).length;
  const shippedWithin24hPct =
    yest.length > 0 ? (within24h / yest.length) * 100 : null;
  const avgHours =
    hoursArr.length > 0
      ? hoursArr.reduce((s, h) => s + h, 0) / hoursArr.length
      : null;
  const medianHours = median(hoursArr);

  // Forward look — every unfulfilled non-cancelled order across the corpus
  // window (60 days). We surface the 5 oldest by created_at.
  const unfulfilled = args.corpus.orders.filter(
    o => !o.is_cancelled && !o.is_fulfilled
  );
  const overdue48h = unfulfilled.filter(o => {
    const age = ageHoursFromNow(o);
    return age !== null && age > 48;
  });

  const oldest = unfulfilled
    .slice()
    .sort((a, b) => {
      const aa = ageHoursFromNow(a) ?? 0;
      const bb = ageHoursFromNow(b) ?? 0;
      return bb - aa;
    })
    .slice(0, 5)
    .map(o => ({
      id: o.id,
      name: o.name || `#${o.id}`,
      customer_name: o.customer_name,
      age_hours:
        ageHoursFromNow(o) !== null
          ? Number((ageHoursFromNow(o) ?? 0).toFixed(1))
          : null,
      total_egp: o.total,
    }));

  return {
    fulfilled_count: fulfilledYesterday.length,
    unfulfilled_count: yest.length - fulfilledYesterday.length,
    shipped_within_24h_pct:
      shippedWithin24hPct !== null ? round1(shippedWithin24hPct) : null,
    delayed_over_48h_count: overdue48h.length,
    avg_hours_to_fulfill: avgHours !== null ? round1(avgHours) : null,
    median_hours_to_fulfill: medianHours !== null ? round1(medianHours) : null,
    oldest_unfulfilled: oldest,
  };
}

// Re-export so build.ts can use it.
export { ordersInRange };
