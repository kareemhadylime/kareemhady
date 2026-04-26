// Typed shape of the daily-report payload. Stored as jsonb in
// `daily_report_snapshots.payload` and consumed by both the HTML preview
// and the PDF renderer. Keep this stable — schema changes will require
// invalidating in-flight snapshots.

export type BuildingCode = 'BH-26' | 'BH-73' | 'BH-435' | 'BH-OK' | 'OTHER';

export const BUILDING_CODES: readonly BuildingCode[] = [
  'BH-26',
  'BH-73',
  'BH-435',
  'BH-OK',
  'OTHER',
] as const;

export const BUILDING_LABEL: Record<BuildingCode, string> = {
  'BH-26': 'BH-26',
  'BH-73': 'BH-73',
  'BH-435': 'BH-435',
  'BH-OK': 'BH-OK · One Kattameya',
  OTHER: 'Other',
};

// All money is USD (per Q2). Per-building + total ('all') columns.
export type BuildingBucket = {
  total_units: number;             // physical sub-unit denominator
  // ---- Today (report day) ----
  occupied_today: number;
  occupancy_today_pct: number;     // 0..100
  check_ins_today: number;
  check_outs_today: number;
  turnovers_today: number;         // same-unit checkout + checkin same day
  // ---- MTD performance ----
  revenue_mtd_usd: number;         // sum host_payout for reservations touching this month
  forward_occupancy_pct: number;   // today → end of month, on-the-books
  backward_occupancy_pct: number;  // start-of-month → today, classic %
  backward_avg_units_per_day: number; // user's literal formula: nights/days_elapsed
  adr_mtd_usd: number;
  opportunity_nights: number;      // free unit-nights from today → EOM
  opportunity_value_usd: number;   // = opportunity_nights × adr (single multiply)
  // ---- Pace + length-of-stay ----
  bookings_per_day_mtd: number;    // new bookings created per day (a)
  avg_lead_time_days: number;      // (b) booking-made → check-in
  pickup_vs_prior_month_pct: number; // (c) MTD bookings vs same-day-of-month last month, %
  avg_los_nights: number;          // length of stay
};

export type AllBucket = BuildingBucket & {
  // "All" = source-of-truth Guesty/PriceLabs query, NOT the sum of buckets (Q1 clarification).
  // We compare and flag if drift > 1% — surfaces sync gaps.
  drift_warning: string | null;
};

export type ReviewSummary = {
  reservation_id: string | null;
  unit: string;                    // listing nickname or building_code
  channel: string;                 // 'Airbnb' | 'Booking.com' | ...
  rating: number | null;           // 1-5 (post-normalization)
  raw_text: string;
  ai_summary: string;              // Haiku 1-line summary
  flagged: boolean;                // rating < 4
  created_at: string;              // ISO
};

export type ReviewsSection = {
  count_mtd: number;
  star_distribution: { stars: 1 | 2 | 3 | 4 | 5; count: number }[];
  avg_rating_mtd: number;
  per_building_count: { building: BuildingCode; count: number }[];
  last_24h: ReviewSummary[];       // detailed rows with summaries
};

export type PayoutsSection = {
  // Past — what landed since start-of-month till report day
  mtd_received_airbnb_usd: number;
  mtd_received_stripe_usd: number;
  mtd_received_total_usd: number;
  // Today — what we expect to settle today
  expected_today_airbnb_usd: number;
  expected_today_stripe_usd: number;
  expected_today_total_usd: number;
  // Forecast — next 7 days
  next_7d_projected_airbnb_usd: number;
  next_7d_projected_stripe_usd: number;
  next_7d_projected_total_usd: number;
};

export type ChannelMix = {
  channel: string;
  revenue_usd: number;
  pct: number;                     // 0..100
};

export type CancellationSummary = {
  count_today: number;
  value_today_usd: number;
  count_mtd: number;
  value_mtd_usd: number;
};

export type DeadInventoryRow = {
  unit: string;
  building: BuildingCode;
  nights_booked_next_14: number;   // 0 = dead inventory candidate
};

export type PricingAlert = {
  unit: string;
  building: BuildingCode;
  current_price_usd: number;
  recommended_price_usd: number;
  delta_pct: number;               // negative = priced below recommendation
};

export type InquiryTriage = {
  inquiries_unanswered_count: number;
  in_stay_immediate_count: number;
  in_stay_high_count: number;
};

export type CleaningOpsRow = {
  unit: string;
  building: BuildingCode;
  checkout_guest: string | null;
  checkin_guest: string | null;
};

export type DailyReportPayload = {
  // ---- Header / context ----
  report_date: string;             // 'YYYY-MM-DD' (Cairo)
  generated_at_iso: string;        // server timestamp
  generated_at_cairo: string;      // human "Sun, 26 Apr 2026 09:00 Cairo"
  month_label: string;             // 'April 2026'
  month_days_total: number;
  month_days_elapsed: number;

  // ---- Buildings table ----
  all: AllBucket;
  per_building: Record<BuildingCode, BuildingBucket>;

  // ---- Singletons ----
  payouts: PayoutsSection;
  reviews: ReviewsSection;

  // ---- Extras (S2/S5/S6/S7/S8/S9) ----
  channel_mix: ChannelMix[];
  cancellations: CancellationSummary;
  dead_inventory: DeadInventoryRow[];
  pricing_alerts: PricingAlert[];
  inquiry_triage: InquiryTriage;
  cleaning_ops_today: CleaningOpsRow[];

  // ---- One-line digest at the top of the report ----
  digest_oneliner: string;

  // ---- Build metadata ----
  build_warnings: string[];        // soft errors that didn't fail the build
  fx_rates_used: { quote: string; rate: number; source: string }[];
};
