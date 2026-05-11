// Beithady · Fee Audit · type contracts.
// FeeAuditConfig is what the operator picks via filter bar + sidebar.
// FeeAuditData is what /api/beithady/fees-audit/run returns.

import type { BuildingBucket as BuildingCode, ChannelBucket } from '@/lib/beithady/guesty-metrics';
export type { BuildingCode };

export type WindowDays = 7 | 14 | 30;
export type PriceMode = 'host_net' | 'guest_gross' | 'both';

export type FeeCategory =
  // Nightly rate
  | 'daily_rate' | 'weekend_uplift' | 'holiday_rate'
  // Stay-level fees
  | 'cleaning' | 'service' | 'pet' | 'extra_guest' | 'security_deposit'
  // Taxes
  | 'vat' | 'occupancy_tax' | 'service_charge' | 'total_tax_burden'
  // Commission
  | 'channel_commission' | 'guest_service_fee'
  // Stay rules
  | 'min_stay' | 'max_stay' | 'lead_time' | 'prep_time'
  // Discounts
  | 'weekly_discount' | 'monthly_discount' | 'last_minute_discount'
  // Country segmentation (Egypt EGP economy vs UAE AED)
  | 'country_egypt' | 'country_uae' | 'country_split'
  // Analytic dimensions (cross-cuts)
  | 'analytic_bedroom_class' | 'analytic_building' | 'analytic_channel_mix' | 'analytic_capacity'
  // Comparisons
  | 'vs_market' | 'vs_self' | 'vs_peer';

export const FEE_CATEGORY_LABEL: Record<FeeCategory, string> = {
  daily_rate: 'Daily Rate',
  weekend_uplift: 'Weekend Uplift',
  holiday_rate: 'Holiday Rate',
  cleaning: 'Cleaning Fee',
  service: 'Service Fee',
  pet: 'Pet Fee',
  extra_guest: 'Extra Guest Fee',
  security_deposit: 'Security Deposit',
  vat: 'VAT',
  occupancy_tax: 'Occupancy / Tourism Tax',
  service_charge: 'Service Charge',
  total_tax_burden: 'Total Tax Burden %',
  channel_commission: 'Host Service Fee',
  guest_service_fee: 'Guest Service Fee',
  min_stay: 'Min Stay (nights)',
  max_stay: 'Max Stay (nights)',
  lead_time: 'Lead Time (hours)',
  prep_time: 'Prep Time (hours)',
  weekly_discount: 'Weekly Discount %',
  monthly_discount: 'Monthly Discount %',
  last_minute_discount: 'Last-Minute Discount %',
  country_egypt: '🇪🇬 Egypt only (EGP economy)',
  country_uae: '🇦🇪 UAE only (AED economy)',
  country_split: '🌍 Egypt vs UAE side-by-side',
  analytic_bedroom_class: 'By bedroom class',
  analytic_building: 'By building',
  analytic_channel_mix: 'By channel mix',
  analytic_capacity: 'By capacity (accommodates)',
  vs_market: 'vs Market (PriceLabs)',
  vs_self: 'vs Self (across channels)',
  vs_peer: 'vs Peer (same bedrooms)',
};

export type FeeAuditConfig = {
  buildings: BuildingCode[];          // [] = all
  startDate: string;                  // YYYY-MM-DD Cairo
  windowDays: WindowDays;
  channels: ChannelBucket[];          // [] = all
  priceMode: PriceMode;
  selectedFeeCategory: FeeCategory;
  bedroomFilter?: number[];
  bathroomFilter?: number[];
};

export type ListingTax = {
  type: string;            // 'VAT' | 'occupancy' | 'service_charge' | 'tourism_dirham' | …
  rate_pct?: number;
  amount?: number;         // fixed amount overrides rate
  amount_currency?: string;
  applies_to?: string;     // 'accommodation' | 'cleaning' | 'all'
};

export type ListingMeta = {
  id: string;
  nickname: string;
  building: BuildingCode;
  bedrooms: number;
  bathrooms: number | null;
  capacity: number;
  cleaning_fee: number | null;        // USD
  security_deposit: number | null;
  pet_fee: number | null;
  extra_guest_fee: number | null;
  extra_guest_threshold: number | null;
  min_nights_default: number | null;
  min_nights_per_channel: Record<string, number>;  // { airbnb2: 2, booking_com: 1, … }
  max_nights: number | null;
  prep_time_hours: number | null;
  advance_notice_hours: number | null;
  taxes: ListingTax[];
  has_full_data: boolean;
  missing_data_reasons: string[];
};

export type FeeBreakdown = {
  // Per-stay totals (computed for the chosen night-count)
  base_rate_total_usd: number;
  weekend_uplift_usd: number;
  cleaning_usd: number;
  pet_usd: number;
  extra_guest_usd: number;
  taxes_usd: number;
  taxes_breakdown: Array<{ type: string; amount_usd: number }>;
  /** Total host-paid OTA fee = base commission + VAT on commission (Airbnb Egypt). */
  channel_commission_usd: number;
  /**
   * Human-readable label for the commission line, e.g. "15.5% + 14% VAT" for
   * Airbnb or "15%" for Booking. Optional — falls back to "Host service fee"
   * with no annotation when absent. Populated by the calculator from the
   * live channel config.
   */
  channel_commission_label?: string;
  guest_service_fee_usd: number;
  security_deposit_usd: number;       // refundable; not part of payment
  total_guest_pays_usd: number;       // what guest sees on channel page
  total_host_receives_usd: number;    // what host net of commission
  min_nights_required: number | null;
};

export type DailyCell = {
  listing_id: string;
  date: string;
  base_price_usd: number | null;
  is_weekend: boolean;
  is_blocked: boolean;
  weekly_discount_pct: number | null;
  monthly_discount_pct: number | null;
  last_minute_discount_pct: number | null;
  per_channel: Array<{
    channel: ChannelBucket;
    guest_gross_usd: number | null;
    host_net_usd: number | null;
    breakdown: FeeBreakdown;
  }>;
};

export type AnomalySeverity = 'critical' | 'warning' | 'info';

export type AnomalyKind =
  | 'zero_cleaning_fee'
  | 'missing_tax_config'
  | 'missing_forward_calendar'
  | 'channel_rate_gap_warning'
  | 'channel_rate_gap_critical'
  | 'cleaning_fee_outlier'
  | 'min_stay_parity_violation'
  | 'no_last_minute_discount'
  | 'price_below_min'
  | 'fee_recently_changed';

export type Anomaly = {
  severity: AnomalySeverity;
  kind: AnomalyKind;
  listing_id: string;
  listing_nickname: string;
  channel?: ChannelBucket;
  date?: string;
  message: string;
  details: Record<string, unknown>;
};

export type FeeAuditData = {
  config: FeeAuditConfig;
  runAt: string;
  listings: ListingMeta[];
  daily: DailyCell[];
  anomalies: Anomaly[];
  totals: {
    avg_daily_rate_usd: number | null;
    avg_cleaning_usd: number | null;
    avg_total_tax_pct: number | null;
    avg_min_nights: number | null;
    listings_with_missing_data: number;
    anomaly_count_by_severity: Record<AnomalySeverity, number>;
    /** Sellable inventory = standalones + SLT children (the count of units
     *  that can actually be booked). MTL parents are virtual umbrellas
     *  over their children's inventory, so they don't count toward the
     *  total. Per operator 2026-05-11: "When counting units, count
     *  standalones + children, not MTLs". */
    physical_units: number;
    /** Rows the dashboard renders = standalones + MTL parents (children
     *  are rolled up into their parent row, so this is usually smaller
     *  than physical_units for portfolios with multi-unit listings). */
    displayed_rows: number;
    /** Raw `active = true` count from guesty_listings, including SLT
     *  children and MTL parents. */
    total_active_listings: number;
    /** Count of SLT child listings rolled up under their MTL parent in the
     *  displayed rows. Equals physical_units - displayed_rows + (number
     *  of MTL parents shown). */
    slt_children_excluded: number;
  };
  warnings?: string[];
};

// Fixed thresholds per Q8.
export const ANOMALY_THRESHOLDS = {
  channel_rate_gap_warn_pct: 15,
  channel_rate_gap_critical_pct: 50,
  cleaning_outlier_pct: 50,
  parity_min_stay_strict: true,
  low_occupancy_pct: 50,
};

export const ANOMALY_LABEL: Record<AnomalyKind, string> = {
  zero_cleaning_fee: 'Zero / missing cleaning fee',
  missing_tax_config: 'Missing tax config',
  missing_forward_calendar: 'Missing PriceLabs forward calendar',
  channel_rate_gap_warning: 'Channel rate gap (15%+)',
  channel_rate_gap_critical: 'Channel rate gap (50%+)',
  cleaning_fee_outlier: 'Cleaning fee outlier vs peer bedrooms',
  min_stay_parity_violation: 'Min-stay differs across channels',
  no_last_minute_discount: 'No last-minute discount on low-occupancy day',
  price_below_min: 'Live price below configured min_price',
  fee_recently_changed: 'Fee changed in last 7 days',
};
