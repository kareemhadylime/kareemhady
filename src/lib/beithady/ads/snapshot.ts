import 'server-only';
import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Schema version of AdsSnapshotPayload. Bump if the shape changes; the
 * /r/ route can then gracefully degrade older snapshots.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

/**
 * BH Ads V4 snapshot payload. JSONB blob persisted in
 * ads_dashboard_snapshots.payload. ~50-200KB. Postgres TOAST handles
 * compression transparently.
 *
 * NOTE: data slice types (DashboardKpis, FrtData, etc.) are loosely typed
 * here as `unknown`-ish to avoid circular imports across V1/V2/V3 lib
 * modules. The actual shapes are documented in the spec § 6.1 and
 * enforced at assembly time by getAdsSnapshotData().
 */
export type AdsSnapshotPayload = {
  meta: {
    schema_version: typeof SNAPSHOT_SCHEMA_VERSION;
    generated_at: string;
    generated_by_user_id: string | null;
    generated_by_user_email: string | null;
    range: { from: string; to: string; preset: string };
    compare: 'prev_period' | 'prev_year' | null;
    building: string | null;
    ai_used: boolean;
    ai_skipped_reason?: 'cap_reached' | 'error';
  };
  kpis: { current: Record<string, unknown>; prior: Record<string, unknown> | null };
  campaigns: Array<Record<string, unknown>>;
  recent_leads: Array<Record<string, unknown>>;
  platform_status: { meta: unknown; google: unknown; tiktok: unknown };
  frt: Record<string, unknown> | null;
  spend_pacing: Record<string, unknown>;
  anomalies: Array<Record<string, unknown>>;
  audience_summary: Record<string, unknown>;
  ai_summary: string | null;
  audience_geo: Array<Record<string, unknown>>;
  audience_demo: Array<Record<string, unknown>>;
  audience_device: Array<Record<string, unknown>>;
  funnel: Record<string, unknown>;
  quality: Array<Record<string, unknown>>;
  cohort: Record<string, unknown>;
  time: { lead_density: Array<Record<string, unknown>>; meta_hourly: Array<Record<string, unknown>> };
  optimize: { top_ads: Array<Record<string, unknown>>; top_assets: Array<Record<string, unknown>> };
};

/**
 * 192-bit token (24 random bytes, base64url-encoded → 32 chars).
 * Same entropy + encoding as daily_report_snapshots.token.
 */
export function generateSnapshotToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Hourly cleanup — zeroes payload + marks deleted_at on expired rows.
 * Row stays for audit, payload bytes freed via TOAST.
 * Called from the existing beithady-daily-report-cleanup cron.
 *
 * Return shape matches cleanupExpiredSnapshots from beithady-daily-report/run.ts
 * so the cron route can aggregate both cleanly.
 */
export async function cleanupExpiredAdsSnapshots(): Promise<{ ok: true; cleaned: number }> {
  const sb = supabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from('ads_dashboard_snapshots')
    .update({ payload: null, deleted_at: nowIso })
    .lt('expires_at', nowIso)
    .is('deleted_at', null)
    .select('id');
  if (error) throw new Error(`ads_snapshot_cleanup_failed: ${error.message}`);
  return { ok: true, cleaned: (data as unknown[] | null)?.length ?? 0 };
}

// ---------------------------------------------------------------------------
// getAdsSnapshotData — gather all 13 dashboard slices
// ---------------------------------------------------------------------------

import { getDashboardKpisWithCompare, listCampaigns, listLeadFunnel } from './reporting';
import { getFrtSummary, getFrtPerCampaign } from './frt';
import { getSpendPacing } from './pacing';
import { detectAnomalies } from './anomalies';
import { queryGeoRollup } from './insights-geo';
import { queryDemoRollup } from './insights-demo';
import { queryDeviceRollup } from './insights-device';
import { getFunnelStages } from './funnel';
import { getLeadQualityPerCampaign } from './lead-quality';
import { getLeadDensityHeatmap, getMetaHourlyHeatmap } from './hourly';
import { getTopAds } from './top-ads';
import { getTopAssets } from './top-assets';
import { getProviderEnabled, getProviderStatus } from '@/lib/credentials';
import { convertManyToEgp } from '@/lib/fx-rates';

/**
 * Gather every data slice the /beithady/ads dashboard renders.
 * Called by createAdsShareLinkAction before storing the snapshot.
 *
 * All slices fetch in parallel via Promise.all. If any throws, the
 * whole gather fails — the caller (action) returns a data_error response.
 *
 * AI summary is gathered separately by the action (force regenerate
 * via generateAiSummary, with graceful skip on cap/error).
 */
export type SnapshotGatherInput = {
  range: { from: string; to: string; preset: string };
  compare: 'prev_period' | 'prev_year' | null;
  building: string | null;
};

export type SnapshotGatherResult = Omit<AdsSnapshotPayload, 'meta' | 'ai_summary'>;

export async function getAdsSnapshotData(
  input: SnapshotGatherInput,
): Promise<SnapshotGatherResult> {
  const { range, compare, building } = input;
  const buildingCode = building ?? undefined;

  const [
    kpisCompare,
    campaigns,
    recent_leads,
    metaEnabled, metaStatus,
    googleEnabled, googleStatus,
    tiktokEnabled, tiktokStatus,
    frtSummary, frtPerCampaign,
    spend_pacing,
    anomalies,
    audience_geo, audience_demo, audience_device,
    funnel,
    quality,
    leadDensity, metaHourly,
    top_ads, top_assets,
  ] = await Promise.all([
    getDashboardKpisWithCompare({ range: { from: range.from, to: range.to }, compare: compare !== null }),
    listCampaigns(),
    listLeadFunnel({ limit: 10 }),
    getProviderEnabled('meta_marketing'), getProviderStatus('meta_marketing'),
    getProviderEnabled('google_ads'), getProviderStatus('google_ads'),
    getProviderEnabled('tiktok_ads'), getProviderStatus('tiktok_ads'),
    getFrtSummary({ from: range.from, to: range.to, buildingCode }),
    getFrtPerCampaign({ from: range.from, to: range.to, buildingCode }),
    getSpendPacing({ range: { from: range.from, to: range.to } }),
    detectAnomalies(),
    queryGeoRollup({ from: range.from, to: range.to }),
    queryDemoRollup({ from: range.from, to: range.to }),
    queryDeviceRollup({ from: range.from, to: range.to }),
    getFunnelStages({ from: range.from, to: range.to, buildingCode }),
    getLeadQualityPerCampaign({ from: range.from, to: range.to }),
    getLeadDensityHeatmap({ from: range.from, to: range.to, buildingCode }),
    getMetaHourlyHeatmap({ from: range.from, to: range.to }),
    getTopAds({ from: range.from, to: range.to, sortBy: 'leads', limit: 20, buildingCode }),
    getTopAssets({ buildingCode, limit: 20 }),
  ]);

  // EGP-convert campaign spend up front so the snapshot doesn't need
  // FX rates at render time.
  const campaignSpendEgp = await convertManyToEgp(
    campaigns.map((c: { spend: unknown; account_currency: string }) => ({
      amount: Number(c.spend) || 0,
      currency: c.account_currency,
    })),
  );
  // Defensive guard: convertManyToEgp must preserve array length. If FX
  // rates fail partially and shorten the result, downstream `spend_egp: 0`
  // would silently misreport campaign performance. Better to fail loud.
  if (campaignSpendEgp.length !== campaigns.length) {
    throw new Error(
      `FX conversion length mismatch: ${campaigns.length} campaigns vs ${campaignSpendEgp.length} converted`,
    );
  }
  const campaignsWithEgp = campaigns.map((c: Record<string, unknown>, i: number) => ({
    ...c,
    spend_egp: campaignSpendEgp[i] || 0,
  }));

  // Platform connection status: matches PlatformStatusCard in page.tsx
  function platformConfigured(
    enabled: boolean,
    status: { config_keys_set: string[]; has_env_fallback: string[] },
    minKeys: number,
  ) {
    return enabled && (status.config_keys_set.length >= minKeys || status.has_env_fallback.length >= minKeys);
  }
  const platform_status = {
    meta: { configured: platformConfigured(metaEnabled, metaStatus, 4) },
    google: { configured: platformConfigured(googleEnabled, googleStatus, 4) },
    tiktok: { configured: platformConfigured(tiktokEnabled, tiktokStatus, 2) },
  };

  // Build the AudienceSummaryWidget shape (it normally fetches all 3
  // breakdowns + a total). We've already got geo/demo/device above.
  const audience_summary = {
    geo: audience_geo.slice(0, 3),
    demo: audience_demo.slice(0, 3),
    device: audience_device.slice(0, 3),
    totals: {
      geo_clicks: (audience_geo as Array<{ clicks: number }>).reduce((s, r) => s + r.clicks, 0) || 1,
      demo_clicks: (audience_demo as Array<{ clicks: number }>).reduce((s, r) => s + r.clicks, 0) || 1,
      device_clicks: (audience_device as Array<{ clicks: number }>).reduce((s, r) => s + r.clicks, 0) || 1,
    },
  };

  // FRT: null if no leads in range
  const frt = frtSummary.total_leads === 0
    ? null
    : { summary: frtSummary, per_campaign: frtPerCampaign };

  // Cohort: placeholder shape — getLeadToBookingCohort is a V2 export but
  // not currently rendered on the dashboard. Add an empty bucket array
  // (CohortTabView handles empty).
  const cohort = { buckets: [] };

  return {
    kpis: { current: kpisCompare.current, prior: kpisCompare.prior },
    campaigns: campaignsWithEgp,
    recent_leads,
    platform_status,
    frt,
    spend_pacing,
    anomalies,
    audience_summary,
    audience_geo,
    audience_demo,
    audience_device,
    funnel,
    quality,
    cohort,
    time: { lead_density: leadDensity, meta_hourly: metaHourly },
    optimize: { top_ads, top_assets },
  };
}
