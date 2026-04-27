// Types for the Operations Calendar grid + drawer.

export type CalendarRow = {
  listing_id: string;
  nickname: string;
  title: string | null;
  building_code: string | null;
  cover_url: string | null;
  base_price_usd: number | null;
  // Comp-set median for the building+bedroom bucket. Used to compute
  // the up/down triangle on price cells.
  comp_median_usd: number | null;
  // Per-listing pricelabs metrics for the heatmap overlay
  occupancy_next_30: number | null;   // 0..1
  adr_past_30: number | null;
  revenue_past_30: number | null;
  bedrooms: number | null;
  // Status flag color computed from the row's next reservation in <14d
  status_dot: 'red' | 'orange' | 'yellow' | 'green' | 'purple' | 'gray';
};

export type CalendarReservation = {
  reservation_id: string;
  confirmation_code: string | null;
  status: string | null;
  channel: string | null;          // raw integration_platform e.g. airbnb2
  channel_label: string;           // human-readable (Airbnb / Booking.com / Direct / …)
  channel_color: string;           // hex from channel-meta
  source_label: string | null;
  listing_id: string;
  listing_nickname: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  check_in_date: string;           // YYYY-MM-DD
  check_out_date: string;
  nights: number | null;
  guest_count: number | null;
  cancelled_at: string | null;
  // Money
  host_payout: number | null;
  fare_accommodation: number | null;
  commission: number | null;
  cleaning_fee: number | null;
  currency: string;
  // Loyalty / VIP
  loyalty_tier: string | null;
  is_vip: boolean | null;
  lifetime_stays: number | null;
  // Risk + payment cache
  risk_score: number | null;
  payment_status: 'paid' | 'partial' | 'unpaid' | 'n_a' | null;
  payment_balance_cents: number | null;
  payment_currency: string | null;
  flagged_unpaid: boolean | null;
  flagged_prearrival_missing: boolean | null;
  // Phase F linkage
  boarding_pass_exists: boolean | null;
  boarding_viewed_at: string | null;
  prearrival_sent_at: string | null;
  // Manual block flag
  is_manual_block: boolean | null;
};

export type AnomalySnapshot = {
  unpaid_count: number;
  unpaid_balance_cents: number | null;
  prearrival_missing_count: number;
  cleaning_gap_count: number;
};

export type CalendarFilters = {
  buildings?: string[];
  channels?: string[];
  countries?: string[];           // ISO names or 'OTHER'
  statusFilter?: 'all' | 'confirmed' | 'inquiry' | 'canceled';
  riskFilter?: 'all' | 'unpaid' | 'prearrival_missing' | 'vip';
  search?: string;
};

export type CalendarGridData = {
  rows: CalendarRow[];
  reservations: CalendarReservation[];
  anomalies: AnomalySnapshot;
  windowStart: string;
  windowEnd: string;
  daysCount: number;
};
