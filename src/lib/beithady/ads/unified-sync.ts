import 'server-only';
import { syncGoogleAds } from './google-sync';
import { syncTikTokAds } from './tiktok-sync';
import type { SyncResult } from './platforms';
import { supabaseAdmin } from '@/lib/supabase';
import { loadMetaCredentials, metaGet } from './meta-client';

// Unified "Sync now (all)" orchestrator — fires Meta + Google + TikTok
// syncs in parallel and returns aggregated results.

export type UnifiedSyncResult = {
  ok: boolean;
  duration_ms: number;
  platforms: SyncResult[];
  total_rows: number;
};

export async function syncAllPlatforms(): Promise<UnifiedSyncResult> {
  const t0 = Date.now();
  const [meta, google, tiktok] = await Promise.all([
    syncMetaInsightsLight().catch(e => ({
      ok: false, platform: 'meta' as const, job_name: 'beithady-ads-meta-sync',
      rows_upserted: 0, leads_ingested: 0,
      duration_ms: 0, error: e instanceof Error ? e.message : String(e),
    })),
    syncGoogleAds().catch(e => ({
      ok: false, platform: 'google' as const, job_name: 'beithady-ads-google-sync',
      rows_upserted: 0, leads_ingested: 0,
      duration_ms: 0, error: e instanceof Error ? e.message : String(e),
    })),
    syncTikTokAds().catch(e => ({
      ok: false, platform: 'tiktok' as const, job_name: 'beithady-ads-tiktok-sync',
      rows_upserted: 0, leads_ingested: 0,
      duration_ms: 0, error: e instanceof Error ? e.message : String(e),
    })),
  ]);
  const platforms: SyncResult[] = [meta, google, tiktok];
  const totalRows = platforms.reduce((s, p) => s + p.rows_upserted, 0);
  return {
    ok: platforms.every(p => p.ok),
    duration_ms: Date.now() - t0,
    platforms,
    total_rows: totalRows,
  };
}

// Light Meta insights pull — campaign-level for last 7 days.
// (The existing Phase H cron 'beithady-ads-insights' handles the full daily
// pull; this is a lighter version used by the "Sync now" button so the
// dashboard reflects today's numbers right away.)
async function syncMetaInsightsLight(): Promise<SyncResult> {
  const sb = supabaseAdmin();
  const t0 = Date.now();
  const startedAt = new Date().toISOString();
  const credsRes = await loadMetaCredentials();
  if (!credsRes.ok) {
    return {
      ok: false, platform: 'meta', job_name: 'beithady-ads-meta-sync-light',
      rows_upserted: 0, leads_ingested: 0, duration_ms: Date.now() - t0,
      error: credsRes.error,
    };
  }
  const { data: accounts } = await sb
    .from('ads_accounts')
    .select('id, external_id')
    .eq('platform', 'meta')
    .eq('status', 'active');
  const accs = (accounts as Array<{ id: number; external_id: string }> | null) || [];
  let rows = 0;
  for (const acc of accs) {
    if (!acc.external_id || acc.external_id.startsWith('draft_')) continue;
    // Pull campaign-level last 7 days (cheap)
    const url = `${acc.external_id}/insights?level=campaign&date_preset=last_7d&fields=campaign_id,campaign_name,impressions,clicks,spend,reach,date_start,date_stop&time_increment=1&limit=500`;
    const r = await metaGet<{ data?: Array<Record<string, unknown>> }>(url, credsRes.creds.token);
    if (!r.ok) continue;
    const insights = ((r.data as { data?: Array<Record<string, unknown>> }).data) || [];
    // Map campaign external_id → DB id
    const { data: cm } = await sb.from('ads_campaigns').select('id, external_id').eq('platform', 'meta').eq('account_id', acc.id);
    const map: Record<string, number> = {};
    ((cm as Array<{ id: number; external_id: string }> | null) || []).forEach(c => { map[c.external_id] = c.id; });

    type MetaInsightRow = { campaign_id?: string; date_start?: string; impressions?: string; clicks?: string; spend?: string; reach?: string };
    const metricRows = insights.map(row => {
      const r2 = row as MetaInsightRow;
      const campId = map[String(r2.campaign_id || '')];
      if (!campId) return null;
      return {
        platform: 'meta' as const,
        account_id: acc.id,
        campaign_id: campId,
        ad_set_id: null,
        ad_id: null,
        metric_date: r2.date_start,
        impressions: Number(r2.impressions || 0),
        clicks: Number(r2.clicks || 0),
        spend_micros: Math.round(Number(r2.spend || 0) * 1_000_000),
        reach: Number(r2.reach || 0),
        leads: 0,
        conversions: 0,
        raw: row as object,
      };
    }).filter(Boolean) as Array<Record<string, unknown>>;
    if (metricRows.length) {
      const dates = Array.from(new Set(metricRows.map(r => r.metric_date))).filter(Boolean) as string[];
      await sb.from('ads_daily_metrics').delete()
        .eq('platform', 'meta').eq('account_id', acc.id)
        .is('ad_id', null).is('ad_set_id', null)
        .in('metric_date', dates);
      const ins = await sb.from('ads_daily_metrics').insert(metricRows);
      if (!ins.error) rows += metricRows.length;
    }
  }
  await sb.from('ads_sync_log').insert({
    job_name: 'beithady-ads-meta-sync-light',
    platform: 'meta',
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: 'success',
    rows_upserted: rows,
    details: { window: 'last_7d' },
  });
  return {
    ok: true, platform: 'meta', job_name: 'beithady-ads-meta-sync-light',
    rows_upserted: rows, leads_ingested: 0, duration_ms: Date.now() - t0,
  };
}
