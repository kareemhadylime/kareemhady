// All money values are USD. All dates are 'YYYY-MM-DD' (Cairo wall-time).

export type PaceCountry = 'EG' | 'AE';

export type PaceFilters = {
  countries: PaceCountry[];           // empty array = no country filter
  cities: string[];                   // empty = all cities; values match guesty_listings.address_city
  tags: string[];                     // empty = all; ANY-match against guesty_listings.tags
  listingIds: string[];               // empty = no nickname pin; otherwise restricts to these listing IDs
  includeInactive: boolean;           // default false → only active=true listings
  includeHistorical: boolean;         // default false → exclude canceled reservations
};

export type PaceDateRange = {
  from: string;                        // inclusive
  to: string;                          // inclusive
  label: string;                       // 'May 2026' | 'Last Month' | 'May 1 — May 16, 2026'
};

export type PaceKpiMetric = 'revenue' | 'booked_days' | 'occupancy_pct' | 'anr';

export type PaceKpi = {
  metric: PaceKpiMetric;
  current_value: number;
  prior_value: number;
  delta_pct: number | null;            // null when prior_value is 0
};

export type DailyPerfRow = {
  date: string;                        // YYYY-MM-DD
  revenue_usd: number;
  booked_days: number;                 // confirmed nights anchored to this date
  reserved_days: number;               // always 0 in Phase 1 (no inquiry-hold sync)
  bookable_days: number;               // physical_units_in_scope (1 night each)
  available_days: number;              // bookable - booked - reserved
  occupancy_pct: number;               // booked / bookable × 100
  anr_usd: number;                     // revenue / booked_days (0 when no booked)
};

export type CohortBucket =
  | 'same_month'
  | 'one_month'
  | 'two_month'
  | 'three_to_five_month'
  | 'six_plus_month';

export const COHORT_LABELS: Record<CohortBucket, string> = {
  same_month: 'Created Same Month',
  one_month: 'Created 1 Month Before',
  two_month: 'Created 2 Months Before',
  three_to_five_month: 'Created 3-5 Months Before',
  six_plus_month: 'Created 6+ Months Before',
};

export type PickupCohortRow = {
  check_in_month: string;              // 'YYYY-MM'
  buckets: Record<CohortBucket, { revenue_usd: number; booked_days: number; anr_usd: number }>;
};

export type PropertyRow = {
  listing_id: string;
  nickname: string;
  unit_type: 'Single Unit' | 'Multi Unit';
  city: string | null;
  country: PaceCountry | null;
  revenue_usd: number;
  booked_days: number;
  reserved_days: number;
  bookable_days: number;
  available_days: number;
  occupancy_pct: number;
  anr_usd: number;
  revpar_usd: number;                  // revenue / bookable_days
};

export type CityRow = {
  city: string;
  country: PaceCountry | null;
  unit_count: number;
  revenue_usd: number;
  booked_days: number;
  reserved_days: number;
  bookable_days: number;
  available_days: number;
  occupancy_pct: number;
  anr_usd: number;
  revpar_usd: number;
};

export type PaceReportPayload = {
  generated_at_iso: string;
  date_range: PaceDateRange;
  prior_date_range: PaceDateRange;
  filters_applied: PaceFilters;
  unit_count_in_scope: number;
  kpis: PaceKpi[];                     // length 4: revenue, booked_days, occupancy_pct, anr (in this order)
  daily: DailyPerfRow[];
  pickup_cohorts: PickupCohortRow[];
  by_property: PropertyRow[];
  by_city: CityRow[];
  build_warnings: string[];
};
