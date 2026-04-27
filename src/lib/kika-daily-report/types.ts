// Typed shape of the KIKA daily-report payload. Stored as jsonb in
// `daily_report_snapshots.payload` (report_kind = 'kika_daily') and consumed
// by both the HTML preview and the PDF renderer. Schema changes require
// invalidating in-flight snapshots — additions only when possible.
//
// All money figures are EGP (Egyptian Pounds). KIKA orders are EGP-only;
// any non-EGP order detected during build is filtered out and surfaced in
// `build_warnings` with a count.

export type ComparisonChip = {
  abs: number;            // absolute delta in source unit (orders, EGP, units, %, etc.)
  pct: number | null;     // null if base period was zero (so pct is undefined)
  direction: 'up' | 'down' | 'flat';   // sign bucketed at ±5% threshold
};

export type ComparisonSet = {
  vs_prior_day: ComparisonChip | null;            // yesterday vs day-before
  vs_prior_weekday: ComparisonChip | null;        // last Sun vs Sun-before
  vs_mtd_prior_month: ComparisonChip | null;      // 1..yesterday-of-month vs same window prior month
  vs_prior_year: ComparisonChip | null;           // YoY (only present when ≥365d of data)
};

export type ToplineKpi = {
  // Yesterday's day total
  net_revenue_egp: number;        // gross - discounts - refunds
  gross_revenue_egp: number;      // sum order totals (paid + fulfilled, non-cancelled)
  refunds_egp: number;            // refunded amount yesterday
  discounts_egp: number;          // total discount applied yesterday
  orders: number;                 // count of non-cancelled orders yesterday
  units: number;                  // sum line-item quantities
  aov_egp: number | null;         // gross / orders, null if orders=0
  unique_customers: number;
  new_customers: number;          // first-time-ever buyers (lifetime orders_count == 1)
  returning_customers: number;    // repeat buyers
  repeat_rate_pct: number | null; // returning / unique * 100

  // Comparisons — same-shape per metric, only attached to the most-watched ones
  comparisons: {
    net_revenue: ComparisonSet;
    orders: ComparisonSet;
    aov: ComparisonSet;
    units: ComparisonSet;
  };
};

export type TopProductRow = {
  product_id: number | null;
  title: string;
  variant_label: string | null;   // "Black / S" etc., null if rolled to product
  units: number;
  revenue_egp: number;
  share_of_day_pct: number;       // % of yesterday's net revenue
};

export type InventoryRow = {
  product_id: number | null;
  variant_id: number | string | null;
  title: string;
  variant_label: string | null;
  on_hand: number;
  daily_velocity: number;          // 14-day rolling avg units/day
  days_of_cover: number | null;   // on_hand / velocity, null if velocity=0
  status: 'stockout' | 'low' | 'overstock' | 'healthy';
};

export type InventorySection = {
  stockouts: InventoryRow[];      // on_hand=0 AND velocity>0 (sold out, was selling)
  low: InventoryRow[];            // days_of_cover < 14
  overstock: InventoryRow[];      // days_of_cover > 120 (top 10)
  total_skus_tracked: number;
};

export type AbandonedSection = {
  count: number;
  recoverable_egp: number;
  avg_cart_egp: number | null;
  recovery_rate_pct: number | null;   // completed / (completed + abandoned)
  with_email_count: number;
  with_email_pct: number | null;
  top_5: Array<{
    id: number;
    customer_name: string | null;
    email: string | null;
    total_egp: number;
    line_items: number;
    age_hours: number | null;
    resume_url: string | null;
  }>;
};

export type FulfillmentSection = {
  fulfilled_count: number;
  unfulfilled_count: number;
  shipped_within_24h_pct: number | null;
  delayed_over_48h_count: number;       // unfulfilled with age >48h
  avg_hours_to_fulfill: number | null;
  median_hours_to_fulfill: number | null;
  oldest_unfulfilled: Array<{
    id: number;
    name: string;
    customer_name: string | null;
    age_hours: number | null;
    total_egp: number | null;
  }>;
};

export type DiscountUsageRow = {
  code: string;
  uses: number;
  revenue_egp: number;            // gross of discounted orders
  discount_egp: number;           // total discount cost
};

export type DiscountSection = {
  total_orders_with_discount: number;
  total_discount_egp: number;
  pct_of_gross_revenue: number | null;   // discount / gross * 100
  by_code: DiscountUsageRow[];
};

export type GeoRow = {
  label: string;                   // e.g. "Cairo" or "Egypt"
  orders: number;
  revenue_egp: number;
  pct_of_revenue: number;
};

export type GeoSection = {
  by_country: GeoRow[];           // top 5
  by_governorate: GeoRow[];       // top 5 within Egypt
};

export type WeeklyDigest = {
  week_start: string;              // YYYY-MM-DD (most recent Sunday)
  week_end: string;                // = yesterday (mid-week) or following Saturday
  days_elapsed: number;
  net_revenue_egp: number;
  orders: number;
  units: number;
  unique_customers: number;
  repeat_rate_pct: number | null;  // 60-day rolling repeat rate
  prior_week_net_revenue_egp: number;
  prior_week_orders: number;
  net_revenue_vs_prior_week_pct: number | null;
  orders_vs_prior_week_pct: number | null;
  oneliner: string;                 // English week summary
};

export type AnomalyFlag = {
  kind: 'revenue_spike' | 'revenue_drop' | 'sold_out' | 'concentration_risk' | 'discount_heavy';
  severity: 'info' | 'warn' | 'critical';
  message: string;                  // human-readable single sentence
  details?: Record<string, unknown>;
};

export type WhyAttribution = {
  metric: 'net_revenue' | 'orders';      // which big mover triggered the explanation
  comparison: 'vs_prior_day' | 'vs_prior_weekday' | 'vs_mtd_prior_month';
  text: string;                            // single sentence English
};

// Sparkline data — 14-day series for the hosted HTML report's mini charts.
export type SparklineSeries = {
  labels: string[];                // YYYY-MM-DD ascending, length 14
  net_revenue_egp: number[];       // length 14
  orders: number[];                // length 14
};

export type KikaDailyPayload = {
  // ---- Header / context ----
  report_date: string;              // 'YYYY-MM-DD' Cairo (the day the report DESCRIBES = yesterday)
  generated_at_iso: string;         // server timestamp ISO
  generated_at_cairo: string;       // human "for Sun 26 Apr 2026 · Generated 27 Apr 09:00 Cairo"
  generation_date: string;          // YYYY-MM-DD when the report was generated (today Cairo)
  weekday_label: string;            // 'Sunday', 'Monday', etc. for report_date
  is_sunday_digest: boolean;        // true → include weekly_digest section
  month_label: string;              // 'April 2026'

  // ---- Headline / digest ----
  digest_oneliner: string;          // English summary at top of report
  anomalies: AnomalyFlag[];         // empty if all quiet
  why: WhyAttribution[];            // 0..2 explanations for dramatic comparisons

  // ---- Topline KPIs ----
  topline: ToplineKpi;

  // ---- Section bodies ----
  sparklines: SparklineSeries;
  top_products: TopProductRow[];    // top 10 by revenue, with variant breakdown for #1-3
  inventory: InventorySection;
  abandoned: AbandonedSection;
  fulfillment: FulfillmentSection;
  discounts: DiscountSection;
  geo: GeoSection;

  // ---- Weekly snapshot (Sunday only) ----
  weekly_digest?: WeeklyDigest;

  // ---- Build metadata ----
  build_warnings: string[];         // e.g. "skipped 3 non-EGP orders"
  currency: 'EGP';
};
