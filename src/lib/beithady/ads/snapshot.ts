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
