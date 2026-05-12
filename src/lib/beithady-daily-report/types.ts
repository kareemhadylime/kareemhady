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
  // Revenue lines — three methodologies:
  //   revenue_mtd_usd        = host_payout for reservations whose CHECK-IN
  //                            is anywhere in this calendar month (incl.
  //                            future). This IS the "Month Revenue (OTB)"
  //                            number — name kept for backward compat with
  //                            historical snapshots; UI labels it as such.
  //   revenue_mtd_actual_usd = host_payout for reservations whose CHECK-IN
  //                            is in [start_of_month, today] — TRUE past-only
  //                            MTD revenue (no future check-ins).
  //   revenue_created_mtd_usd = host_payout for reservations CREATED in this
  //                            calendar month (Guesty Analytics parity).
  // All three shown side-by-side in the daily report so methodology is
  // explicit and the operator can cross-check Guesty UI.
  //
  // Occupancy variants: forward_occupancy_pct covers today → EOM (on-the-books);
  // backward_occupancy_pct covers start-of-month → today (classic MTD %);
  // month_occupancy_pct is a weighted blend — backward weighted by days_elapsed
  // and forward weighted by days_remaining — giving a whole-month OTB figure.
  // Formula: (nights_mtd + forward_nights_booked) / (days_total × total_units) × 100.
  //
  // Added 2026-05-12: revenue_mtd_actual_usd and month_occupancy_pct are new
  // fields; pre-deploy snapshots will have `undefined` — UI consumers fall back to 0.
  revenue_mtd_usd: number;
  revenue_mtd_actual_usd: number;  // added 2026-05-12; undefined in older snapshots → 0
  revenue_created_mtd_usd: number;
  forward_occupancy_pct: number;   // today → end of month, on-the-books
  backward_occupancy_pct: number;  // start-of-month → today, classic %
  month_occupancy_pct: number;     // 0..100, whole-month OTB (formula above); added 2026-05-12 → 0
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
  // Forecast — next 3 days (v3)
  next_3d_airbnb_usd: number;
  next_3d_stripe_usd: number;
  next_3d_total_usd: number;
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

// v2 additions: per-section types for new metrics. The detail-row shapes
// for popouts (cancellations details, no-show list, agent slow threads)
// are owned by their respective build modules and re-exported here.
export type CancellationDetailRow = {
  id: string;
  code: string | null;
  unit: string;
  channel: string;
  guest: string | null;
  check_in: string | null;
  value_usd: number;
  canceled_at: string;
};

export type ConversationsSectionV2 = {
  yesterday: { avg_response_minutes: number; first_response_avg_minutes: number; guest_message_count: number; sample_size: number };
  mtd: { avg_response_minutes: number; first_response_avg_minutes: number; guest_message_count: number; sample_size: number };
  worst_2_agents: Array<{
    agent_name: string;
    avg_response_minutes: number;
    sample_size: number;
    slow_threads: Array<{ conversation_id: string; subject: string | null; minutes: number; created_at: string }>;
  }>;
  sla_buckets_yesterday: { bucket: '<1h' | '1-4h' | '4-24h' | '>24h'; count: number }[];
};

export type CheckinPaymentSectionV2 = {
  yesterday: { checkins: number; with_payment: number; without_payment: number; pct: number };
  mtd: { checkins: number; with_payment: number; without_payment: number; pct: number };
  flagged: Array<{ code: string | null; unit: string; guest: string | null; check_in_date: string; reason: string }>;
};

export type BlocksSectionV2 = {
  yesterday: { manual_block_units: number; confirmed_block_units: number; total_blocked_units: number; occupancy_pct: number };
  forward: {
    days_remaining: number;
    total_unit_nights: number;
    manual_block_nights: number;
    confirmed_block_nights: number;
    available_nights: number;
    available_pct: number;
  };
  manual_blocks_open: Array<{ unit: string; from: string; to: string }>;
};

export type NoShowSectionV2 = {
  expected: number;
  checked_in: number;
  no_shows: Array<{ code: string | null; unit: string; guest: string | null; channel: string }>;
};

export type WeeklyDigestV2 = {
  week_start: string;
  week_end: string;
  days_elapsed: number;
  revenue_usd: number;
  bookings: number;
  cancellations: number;
  prior_revenue_usd: number;
  prior_bookings: number;
  revenue_vs_last_week_pct: number;
  bookings_vs_last_week_pct: number;
  oneliner: string;
};

export type PairedChannelMixV2 = {
  channel: string;
  yesterday_revenue_usd: number;
  yesterday_pct: number;
  mtd_revenue_usd: number;
  mtd_pct: number;
  yesterday_net_usd: number | null;
  mtd_net_usd: number | null;
};

// v3 (2026-05-12): yesterday-closing one-liner. Renewal-excluded counts
// matching the same `snapRenewedListings` logic used in build-buildings.ts
// for the today/yesterday turnover detection.
export type YesterdaySummary = {
  occupied: number;          // units occupied at yesterday 23:59 Cairo
  total_units: number;
  check_ins: number;         // same-guest renewals excluded
  check_outs: number;        // same-guest renewals excluded
  turnovers: number;         // different-guest check-out + check-in same day
  revenue_usd: number;       // host_payout_usd summed for yesterday's check-ins
};

// v3 (2026-05-12): DXB partition. Egypt aggregates stay untouched; this is
// a parallel mini-aggregate computed from a DXB-only corpus + inventory.
// `next_3d_total_usd` is Airbnb-only for DXB since Stripe payouts can't
// be partitioned by market (see spec).
export type DxbSection = {
  today: {
    occupied: number;
    total_units: number;
    check_ins: number;
    check_outs: number;
    turnovers: number;
  };
  yesterday: {
    occupied: number;
    total_units: number;
    check_ins: number;
    check_outs: number;
    revenue_usd: number;
  };
  revenue_mtd: {
    check_in_attribution_usd: number;
    booked_attribution_usd: number;
  };
  next_3d_total_usd: number;     // Airbnb-only (DXB-specific limitation)
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

  // ---- v2 additions ----
  /** Wall date the report DESCRIBES (yesterday in Cairo). */
  period_yesterday?: string;
  /** Wall date the report was GENERATED (today in Cairo). */
  period_generated_today?: string;
  /** Cancellation popout detail rows for yesterday. */
  cancellation_details?: CancellationDetailRow[];
  /** Conversations section v2 (response time + agent ranking + SLA buckets). */
  conversations?: ConversationsSectionV2;
  /** Check-ins with recorded payment cross-check. */
  checkin_payment?: CheckinPaymentSectionV2;
  /** Blocks + available-nights forward look. */
  blocks?: BlocksSectionV2;
  /** No-show alert list for yesterday. */
  no_show?: NoShowSectionV2;
  /** Weekly digest banner (Sun→Sat). */
  weekly_digest?: WeeklyDigestV2;
  /** Booking-channel mix paired Yesterday + MTD (replaces v1 `channel_mix` long-term). */
  paired_channel_mix?: PairedChannelMixV2[];

  /** v3 — Pricing intelligence (PriceLabs comp-set comparison). null if endpoint absent. */
  pricing_intelligence?: PricingIntelligenceSectionV3 | null;

  /** v4 — Performance Dashboard derivatives (Phase 3 of dashboard plan). */
  revpar?: RevparBucket | null;
  revenue_concentration?: RevenueConcentrationSection | null;
  forward_occupancy?: ForwardOccupancyRow[] | null;
  occupancy_gaps?: OccupancyGapNight[] | null;
  cancel_risk?: CancelRiskSection | null;
  revenue_waterfall?: RevenueWaterfallSection | null;
  stly?: StlyComparison;
  top_movers?: TopMover[] | null;
  sparklines?: SparklinesSection | null;
  goal?: GoalSection;

  /** v5 — AI-derived (Phase 5). */
  insights?: AIInsight[] | null;
  review_topics?: ReviewTopicsSection | null;

  /** v3 — Yesterday closing snapshot (renewal-excluded). */
  yesterday_summary?: YesterdaySummary;
  /** v3 — DXB market partition (parallel mini-aggregate). */
  dxb?: DxbSection;
  /** v3 — Freshness watermark: max(synced_at) from guesty_reservations. null if unavailable. */
  data_fresh_to_iso?: string | null;
};

export type PricingIntelligenceRowV3 = {
  building: string;
  bedroom_bucket: string;
  unit_count: number;
  our_avg_base_usd: number | null;
  our_avg_adr_past_30_usd: number | null;
  comp_median_usd: number | null;
  comp_median_weekday_usd: number | null;
  comp_median_weekend_usd: number | null;
  comp_avg_rating: number | null;
  comp_set_size: number;
  comp_occupancy_pct: number | null;
  our_avg_occupancy_pct: number | null;
  delta_pct: number | null;
  stly_delta_pct: number | null;
  alert_level: string;
  recommended_price_usd: number | null;
};

export type PricingIntelligenceSectionV3 = {
  available: boolean;
  rows: PricingIntelligenceRowV3[];
  summary: {
    underpriced_groups: number;
    overpriced_groups: number;
    in_band_groups: number;
    insufficient_groups: number;
    daily_revenue_gap_usd: number;
  };
};

// ============================================================================
// v4 — Performance Dashboard derivatives (Phase 3 of Performance Dashboard plan)
// All optional. Builders that fail return null/empty so the dashboard can render
// graceful fallbacks. AI-derived fields land in v5 (Phase 5).
// ============================================================================

export type RevparBucket = {
  all: number;
  by_building: Record<BuildingCode, number>;
};

export type ConcentrationRow = {
  key: string;          // building code or channel name
  revenue_usd: number;
  pct_of_total: number; // 0..100
};

export type RevenueConcentrationSection = {
  by_building: ConcentrationRow[];   // sorted DESC by revenue
  by_channel: ConcentrationRow[];    // sorted DESC by revenue
  top3_building_pct: number;         // sum of top 3 buildings' pct
  top1_channel_pct: number;          // largest channel's pct (concentration risk)
};

export type ForwardOccupancyRow = {
  building: BuildingCode;
  d7_pct: number;
  d30_pct: number;
  d60_pct: number;
};

export type OccupancyGapNight = {
  date: string;             // YYYY-MM-DD
  building: BuildingCode;
  unit: string | null;
  occupancy_pct: number;    // 0..100 — only emitted when <50
  current_price_usd: number | null;
  market_median_usd: number | null;
};

export type CancelRiskSection = {
  count: number;
  value_at_risk_usd: number;
  reservations: Array<{
    code: string | null;
    unit: string;
    guest: string | null;
    check_in: string | null;
    score: number;
    value_usd: number;
  }>;
};

export type RevenueWaterfallSection = {
  gross_usd: number;
  channel_fees_usd: number;
  taxes_usd: number;
  net_usd: number;
};

export type StlyComparison = {
  current_mtd_revenue_usd: number;
  prior_mtd_revenue_usd: number;
  delta_pct: number;
  current_mtd_occupancy_pct: number;
  prior_mtd_occupancy_pct: number;
  delta_pp: number;
} | null;

export type TopMover = {
  scope: 'building' | 'channel' | 'pace';
  key: string;                   // e.g. 'BH-26' or 'Airbnb' or 'overall'
  metric: string;                // 'occupancy_pct' | 'adr' | 'revenue' | 'pickup'
  delta: number;                 // raw delta in metric's natural unit
  delta_unit: '%' | 'pp' | '$' | 'pct'; // pp = percentage points, % = percent change
  prior_value: number;
  current_value: number;
  one_liner: string;             // human-readable single line for ribbon display
};

export type HeroKpiId =
  | 'occupancy'
  | 'mtd_occupancy'
  | 'month_to_end_occupancy'
  | 'month_occupancy'
  | 'mtd_revenue'              // historical: now represents Month Revenue (OTB)
  | 'mtd_revenue_actual'
  | 'revpar'
  | 'pace'
  | 'reviews_avg'
  | 'response_time';
export type SparklinesSection = Record<HeroKpiId, number[]>;

export type GoalSection = {
  monthly_revenue_target_usd: number;
  current_mtd_usd: number;
  pct_of_target: number;
  days_remaining: number;
  projected_eom_usd: number;
} | null;

// ============================================================================
// v5 — AI-derived (Phase 5 of Performance Dashboard plan). Optional. Builders
// fail soft when ANTHROPIC_API_KEY is missing or the API errors.
// ============================================================================

export type AIInsight = {
  /** Severity tier — used by the panel to color-code bullets. */
  tone: 'positive' | 'neutral' | 'warning';
  /** Concise narrative bullet (under 30 words). */
  text: string;
};

export type ReviewTopicCount = {
  topic: string;     // e.g. "cleanliness" / "staff" / "noise"
  count: number;
  example: string | null;
};

export type ReviewTopicsSection = {
  praised: ReviewTopicCount[];
  complained: ReviewTopicCount[];
};
