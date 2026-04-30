// Beithady · Generate Report · 6 quick-template seeds.
// Each replicates one of the manually-built reports the team produces today.

import type { ReportConfig } from './types';
import { fixedYear, rollingDays, todayIso } from './period-resolver';

export type TemplateKey =
  | 'bh_yearly'
  | 'bcg_2wk'
  | 'per_listing'
  | 'building_h2h'
  | 'channel_mix'
  | 'pricing_vs_market';

export const TEMPLATE_META: Record<
  TemplateKey,
  { title: string; description: string; icon: string }
> = {
  bh_yearly: {
    title: 'BH all-units · yearly',
    description:
      'Year-over-year occupancy, ADR, avg revenue/month per building × bedroom. Mirrors the 2024-2025-2026 manual sheet.',
    icon: 'TrendingUp',
  },
  bcg_2wk: {
    title: 'BCG matrix · last 2 weeks',
    description:
      'Per-bedroom Stars / Cash Cows / Question Marks / Dogs scatter for one building.',
    icon: 'Target',
  },
  per_listing: {
    title: 'Per-listing breakdown',
    description:
      'Last-N-months listing-by-listing reservations × channel × revenue × rating.',
    icon: 'List',
  },
  building_h2h: {
    title: 'Building head-to-head',
    description: 'Pin one building, render Δ% deltas vs the others.',
    icon: 'Swords',
  },
  channel_mix: {
    title: 'Channel mix',
    description: 'Reservations + revenue split by Airbnb / Booking / Other OTA / Manual.',
    icon: 'PieChart',
  },
  pricing_vs_market: {
    title: 'Pricing vs market',
    description: 'Own occupancy + ADR vs PriceLabs market for the same period.',
    icon: 'BarChart3',
  },
};

export function templateConfig(key: TemplateKey, ref?: string): ReportConfig {
  const today = ref || todayIso();
  switch (key) {
    case 'bh_yearly':
      return {
        title: 'BH all-units · yearly comparison',
        description:
          'Occupancy, ADR, and avg revenue/month per building × bedroom across recent years.',
        template_key: 'bh_yearly',
        periods: [
          { ...fixedYear(2024, 6, 12), label: '2024 (Jun-Dec)' },
          fixedYear(2025),
          fixedYear(2026, 1, 4),
        ],
        groupBy: { primary: 'building_x_bedroom' },
        metrics: [
          'occupancy_pct',
          'avg_revenue_per_month_usd',
          'adr_usd',
          'total_revenue_usd',
        ],
        filters: { includeCancelled: false },
        comparison: { mode: 'period', baseline: fixedYear(2025).id },
        alignDates: true,
        visualization: {
          showKpiStrip: true,
          showPivotTable: true,
          charts: [
            {
              id: 'c1',
              type: 'grouped_bar',
              metricKey: 'occupancy_pct',
              title: 'Occupancy by building × bedroom',
            },
            {
              id: 'c2',
              type: 'grouped_bar',
              metricKey: 'adr_usd',
              title: 'ADR by building × bedroom',
            },
          ],
        },
        enableAiCommentary: true,
        enableAnomalyDetection: true,
      };

    case 'bcg_2wk': {
      const p = rollingDays(14, today);
      return {
        title: 'BCG matrix · last 2 weeks',
        description:
          'Plot bedroom classes by Average Revenue × Occupancy. Stars / Cash Cows / Question Marks / Dogs.',
        template_key: 'bcg_2wk',
        periods: [p],
        groupBy: { primary: 'bedroom' },
        metrics: ['occupancy_pct', 'adr_usd', 'avg_revenue_per_month_usd', 'total_revenue_usd'],
        filters: { buildings: ['BH-73'], includeCancelled: false },
        visualization: {
          showKpiStrip: true,
          showPivotTable: true,
          charts: [
            {
              id: 'c1',
              type: 'bcg',
              metricKey: 'avg_revenue_per_month_usd',
              title: 'BCG quadrant (Avg Revenue × Occupancy)',
              bcgThresholds: { occHigh: 50, revHigh: 400 },
            },
          ],
        },
        enableAiCommentary: true,
      };
    }

    case 'per_listing': {
      const p = rollingDays(120, today);
      return {
        title: 'Per-listing breakdown · last 4 months',
        description:
          'Listing-by-listing reservations × channel × revenue × rating, like the One K manual sheet.',
        template_key: 'per_listing',
        periods: [p],
        groupBy: { primary: 'listing' },
        metrics: [
          'reservations_count',
          'occupancy_pct',
          'adr_usd',
          'total_revenue_usd',
          'revenue_share_pct',
          'avg_overall_rating',
        ],
        filters: { buildings: ['BH-OK'], includeCancelled: false },
        visualization: {
          showKpiStrip: true,
          showPivotTable: true,
          charts: [
            {
              id: 'c1',
              type: 'stacked_bar',
              metricKey: 'reservations_count',
              title: 'Reservations by channel per listing',
            },
            {
              id: 'c2',
              type: 'grouped_bar',
              metricKey: 'total_revenue_usd',
              title: 'Total Revenue per listing',
            },
          ],
        },
        enableAiCommentary: true,
      };
    }

    case 'building_h2h': {
      const p = rollingDays(90, today);
      return {
        title: 'Building head-to-head · last 90 days',
        description: 'Compare buildings side by side — pin BH-435 as baseline, others render Δ%.',
        template_key: 'building_h2h',
        periods: [p],
        groupBy: { primary: 'building' },
        metrics: [
          'occupancy_pct',
          'adr_usd',
          'total_revenue_usd',
          'revpar_usd',
          'avg_overall_rating',
        ],
        filters: { includeCancelled: false },
        comparison: { mode: 'group', baseline: 'BH-435' },
        visualization: {
          showKpiStrip: true,
          showPivotTable: true,
          charts: [
            {
              id: 'c1',
              type: 'grouped_bar',
              metricKey: 'occupancy_pct',
              title: 'Occupancy per building',
            },
            {
              id: 'c2',
              type: 'grouped_bar',
              metricKey: 'revpar_usd',
              title: 'RevPAR per building',
            },
          ],
        },
        enableAiCommentary: true,
      };
    }

    case 'channel_mix': {
      const p = rollingDays(90, today);
      return {
        title: 'Channel mix · last 90 days',
        description: 'Reservations + revenue split by Airbnb / Booking / Other OTA / Manual.',
        template_key: 'channel_mix',
        periods: [p],
        groupBy: { primary: 'channel' },
        metrics: [
          'reservations_count',
          'total_revenue_usd',
          'revenue_share_pct',
          'adr_usd',
          'avg_los_nights',
        ],
        filters: { includeCancelled: false },
        visualization: {
          showKpiStrip: true,
          showPivotTable: true,
          charts: [
            {
              id: 'c1',
              type: 'stacked_bar',
              metricKey: 'total_revenue_usd',
              title: 'Revenue by channel',
            },
            {
              id: 'c2',
              type: 'stacked_bar',
              metricKey: 'reservations_count',
              title: 'Reservations by channel',
            },
          ],
        },
        enableAiCommentary: true,
      };
    }

    case 'pricing_vs_market': {
      const p = rollingDays(60, today);
      return {
        title: 'Pricing vs market · last 60 days',
        description: 'Compare own occupancy & ADR vs PriceLabs market for the same window.',
        template_key: 'pricing_vs_market',
        periods: [p],
        groupBy: { primary: 'building' },
        metrics: ['occupancy_pct', 'market_occupancy_pct', 'occ_vs_market_pp', 'adr_usd'],
        filters: { includeCancelled: false },
        comparison: { mode: 'market' },
        visualization: {
          showKpiStrip: true,
          showPivotTable: true,
          charts: [
            {
              id: 'c1',
              type: 'grouped_bar',
              metricKey: 'occupancy_pct',
              title: 'Own vs market occupancy',
            },
          ],
        },
        enableAiCommentary: true,
      };
    }
  }
}
