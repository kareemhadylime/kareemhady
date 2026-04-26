import 'server-only';
import { supabaseAdmin } from '../supabase';

// Pricing Intelligence reads the pre-aggregated pricelabs_market_snapshots
// table (most-recent snapshot_date per (building, bucket)) and renders
// the table + summary ribbon in the daily report.
//
// All computation happens upstream in run-pricelabs-sync.ts. This module
// is purely a query layer. If no rows are found (endpoint not on tier
// per P6=A), returns null and the report renders nothing.

export type PricingIntelligenceRow = {
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

export type PricingIntelligenceSection = {
  available: boolean;                      // false → endpoint absent / no data
  rows: PricingIntelligenceRow[];
  summary: {
    underpriced_groups: number;            // warn_under + critical_under
    overpriced_groups: number;             // warn_over + critical_over
    in_band_groups: number;
    insufficient_groups: number;
    daily_revenue_gap_usd: number;         // sum (rec - our) * unit_count for under-priced
  };
};

export async function buildPricingIntelligenceSection(): Promise<{
  section: PricingIntelligenceSection;
  warnings: string[];
}> {
  const sb = supabaseAdmin();
  const warnings: string[] = [];

  // Most-recent snapshot_date for each (building, bucket).
  const { data: latestDateRow } = await sb
    .from('pricelabs_market_snapshots')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1);
  const latest = (latestDateRow as { snapshot_date: string }[] | null)?.[0]
    ?.snapshot_date;
  if (!latest) {
    return {
      section: {
        available: false,
        rows: [],
        summary: {
          underpriced_groups: 0,
          overpriced_groups: 0,
          in_band_groups: 0,
          insufficient_groups: 0,
          daily_revenue_gap_usd: 0,
        },
      },
      warnings: ['no_market_snapshot_yet'],
    };
  }

  const { data, error } = await sb
    .from('pricelabs_market_snapshots')
    .select(
      'building_code, bedroom_bucket, unit_count, our_avg_base_usd, our_avg_adr_past_30_usd, comp_median_usd, comp_median_weekday_usd, comp_median_weekend_usd, comp_avg_rating, comp_set_size, comp_occupancy_pct, our_avg_occupancy_pct, delta_pct, stly_delta_pct, alert_level, recommended_price_usd'
    )
    .eq('snapshot_date', latest)
    .order('building_code', { ascending: true })
    .order('bedroom_bucket', { ascending: true });

  if (error) {
    warnings.push(`market_snapshot_query_failed: ${error.message}`);
    return {
      section: {
        available: false,
        rows: [],
        summary: {
          underpriced_groups: 0,
          overpriced_groups: 0,
          in_band_groups: 0,
          insufficient_groups: 0,
          daily_revenue_gap_usd: 0,
        },
      },
      warnings,
    };
  }

  const raw = (data as Array<{
    building_code: string;
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
  }> | null) || [];

  const rows: PricingIntelligenceRow[] = raw.map(r => ({
    building: r.building_code,
    bedroom_bucket: r.bedroom_bucket,
    unit_count: r.unit_count,
    our_avg_base_usd: r.our_avg_base_usd,
    our_avg_adr_past_30_usd: r.our_avg_adr_past_30_usd,
    comp_median_usd: r.comp_median_usd,
    comp_median_weekday_usd: r.comp_median_weekday_usd,
    comp_median_weekend_usd: r.comp_median_weekend_usd,
    comp_avg_rating: r.comp_avg_rating,
    comp_set_size: r.comp_set_size,
    comp_occupancy_pct: r.comp_occupancy_pct,
    our_avg_occupancy_pct: r.our_avg_occupancy_pct,
    delta_pct: r.delta_pct,
    stly_delta_pct: r.stly_delta_pct,
    alert_level: r.alert_level,
    recommended_price_usd: r.recommended_price_usd,
  }));

  // Summary ribbon — W2=A: count all warn+critical alerts.
  let underpriced_groups = 0;
  let overpriced_groups = 0;
  let in_band_groups = 0;
  let insufficient_groups = 0;
  let daily_revenue_gap_usd = 0;
  for (const r of rows) {
    if (r.alert_level === 'warn_under' || r.alert_level === 'critical_under') {
      underpriced_groups += 1;
      if (r.recommended_price_usd != null && r.our_avg_base_usd != null) {
        // Per-night revenue gap = (rec - our) * unit_count, assuming all
        // units occupied. A conservative approximation but useful as a
        // single-number "money on the table".
        daily_revenue_gap_usd +=
          Math.max(0, r.recommended_price_usd - r.our_avg_base_usd) *
          r.unit_count;
      }
    } else if (r.alert_level === 'warn_over' || r.alert_level === 'critical_over') {
      overpriced_groups += 1;
    } else if (r.alert_level === 'in_band') in_band_groups += 1;
    else if (r.alert_level === 'insufficient') insufficient_groups += 1;
  }

  return {
    section: {
      available: rows.length > 0,
      rows,
      summary: {
        underpriced_groups,
        overpriced_groups,
        in_band_groups,
        insufficient_groups,
        daily_revenue_gap_usd: Math.round(daily_revenue_gap_usd),
      },
    },
    warnings,
  };
}
