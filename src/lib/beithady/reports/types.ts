// Beithady · Generate Report · type contracts.
// ReportConfig is what the operator builds in the UI; ReportData is what
// /api/beithady/reports/run returns. Both are jsonb-stable so saved reports
// survive deployments.

export type BuildingCode = 'BH-26' | 'BH-73' | 'BH-435' | 'BH-OK' | 'OTHER';
export type BedroomBucket = 'studio' | '1' | '2' | '3' | '4_plus';
export type ChannelBucket = 'airbnb' | 'booking_com' | 'other_ota' | 'manual';
export type ListingType = 'SINGLE' | 'MTL' | 'SLT';

export type GroupAxis =
  | 'building'
  | 'bedroom'
  | 'listing'
  | 'channel'
  | 'listing_type'
  | 'building_x_bedroom';

export type MetricKey =
  // Occupancy
  | 'occupancy_pct'
  | 'market_occupancy_pct'
  | 'occ_vs_market_pp'
  // Revenue
  | 'total_revenue_usd'
  | 'avg_revenue_per_month_usd'
  | 'revpar_usd'
  | 'revenue_share_pct'
  // Rate
  | 'adr_usd'
  // Bookings
  | 'reservations_count'
  | 'avg_lead_time_days'
  | 'avg_los_nights'
  // Reviews
  | 'avg_overall_rating'
  | 'total_reviews';

export type PeriodSpec = {
  id: string;        // 'p1' | 'p2' | ...
  label: string;     // human label, used in chart legends + PDF header
  from: string;      // YYYY-MM-DD
  to: string;        // YYYY-MM-DD (inclusive)
};

export type ChartType =
  | 'time_series'
  | 'stacked_bar'
  | 'grouped_bar'
  | 'bcg'
  | 'heatmap';

export type ChartSpec = {
  id: string;
  type: ChartType;
  metricKey: MetricKey;
  title?: string;
  bcgThresholds?: { occHigh: number; revHigh: number };
};

export type ComparisonMode = 'period' | 'group' | 'market' | 'target' | 'none';

export type ReportConfig = {
  title: string;
  description?: string;
  template_key?:
    | 'bh_yearly'
    | 'bcg_2wk'
    | 'per_listing'
    | 'building_h2h'
    | 'channel_mix'
    | 'pricing_vs_market'
    | null;
  periods: PeriodSpec[];
  groupBy: { primary: GroupAxis; secondary?: GroupAxis };
  metrics: MetricKey[];
  filters: {
    buildings?: BuildingCode[];
    bedrooms?: BedroomBucket[];
    channels?: ChannelBucket[];
    listingIds?: string[];
    listingTypes?: ListingType[];
    includeCancelled?: boolean;
    minRating?: number;
  };
  comparison?: {
    mode: ComparisonMode;
    baseline?: string;            // periodId or groupKey
    targets?: Partial<Record<MetricKey, number>>;
  };
  alignDates?: boolean;
  visualization: {
    showKpiStrip: boolean;
    showPivotTable: boolean;
    charts: ChartSpec[];
  };
  enableAiCommentary?: boolean;
  enableAnomalyDetection?: boolean;
};

export type MetricUnit = 'pct' | 'usd' | 'count' | 'days' | 'rating' | 'nights' | 'pp';

export type MetricCell = {
  value: number | null;
  formatted: string;
  unit: MetricUnit;
  flagged?: 'above_target' | 'below_target' | 'anomaly_high' | 'anomaly_low' | null;
};

export type ReportRow = {
  groupKey: string;
  groupLabels: { primary: string; secondary?: string };
  cells: Record<string, MetricCell>;        // key = `${periodId}::${metricKey}`
  channelSplit?: Record<string, Record<ChannelBucket, number>>; // key = periodId, optional
  samples: { reservations: number; nights: number; reviews: number };
};

export type ReportData = {
  config: ReportConfig;
  runAt: string;
  rows: ReportRow[];
  totals: Record<string, MetricCell>;       // key = `${periodId}::${metricKey}`
  comparisons: {
    deltas: Record<string, { abs: number | null; pct: number | null }>;
  };
  anomalies: Array<{ groupKey: string; metricKey: MetricKey; periodId: string; reason: string }>;
  commentary?: { bullets: string[]; notes?: string; action_items?: string[] };
  warnings?: string[];
};

export const METRIC_LABEL: Record<MetricKey, string> = {
  occupancy_pct: 'Occupancy %',
  market_occupancy_pct: 'Market Occupancy %',
  occ_vs_market_pp: 'Occ vs Market (pp)',
  total_revenue_usd: 'Total Revenue',
  avg_revenue_per_month_usd: 'Avg Revenue / Month',
  revpar_usd: 'RevPAR',
  revenue_share_pct: 'Revenue Share %',
  adr_usd: 'ADR',
  reservations_count: 'Reservations',
  avg_lead_time_days: 'Avg Lead Time',
  avg_los_nights: 'Avg LOS',
  avg_overall_rating: 'Avg Rating',
  total_reviews: 'Total Reviews',
};

export const METRIC_UNIT: Record<MetricKey, MetricUnit> = {
  occupancy_pct: 'pct',
  market_occupancy_pct: 'pct',
  occ_vs_market_pp: 'pp',
  total_revenue_usd: 'usd',
  avg_revenue_per_month_usd: 'usd',
  revpar_usd: 'usd',
  revenue_share_pct: 'pct',
  adr_usd: 'usd',
  reservations_count: 'count',
  avg_lead_time_days: 'days',
  avg_los_nights: 'nights',
  avg_overall_rating: 'rating',
  total_reviews: 'count',
};

export function fmtMetric(value: number | null, unit: MetricUnit): string {
  if (value == null || !Number.isFinite(value)) return '—';
  switch (unit) {
    case 'pct':
      return `${value.toFixed(1)}%`;
    case 'pp':
      return `${value >= 0 ? '+' : ''}${value.toFixed(1)}pp`;
    case 'usd':
      return `$${Math.round(value).toLocaleString('en-US')}`;
    case 'count':
      return Math.round(value).toLocaleString('en-US');
    case 'days':
      return `${value.toFixed(1)}d`;
    case 'nights':
      return `${value.toFixed(1)}n`;
    case 'rating':
      return value.toFixed(2);
    default:
      return String(value);
  }
}

export function makeCell(value: number | null, key: MetricKey): MetricCell {
  const unit = METRIC_UNIT[key];
  return { value, formatted: fmtMetric(value, unit), unit, flagged: null };
}
