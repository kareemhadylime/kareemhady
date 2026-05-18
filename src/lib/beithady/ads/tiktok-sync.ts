import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import {
  loadTikTokBusinessCredentials,
  ttBizGet,
  ttBizPost,
  tikTokStatusToOurs,
} from './tiktok-client';
import type { SyncResult } from './platforms';

// Daily TikTok paid sync — pulls campaigns, ad groups, ads, last-30-day metrics.
// Ports C:\Voltauto-pricing\supabase\functions\ads-tiktok-sync\index.ts.

const JOB_NAME = 'beithady-ads-tiktok-sync';

function dateRange(days: number): { start: string; end: string } {
  const today = new Date();
  const past = new Date(today.getTime() - days * 86_400_000);
  return { start: past.toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) };
}

export async function syncTikTokAds(accountId?: number): Promise<SyncResult> {
  const sb = supabaseAdmin();
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const credsRes = await loadTikTokBusinessCredentials();
  if (!credsRes.ok || !credsRes.creds.marketing_access_token) {
    await logSync(sb, startedAt, 0, [], 'error', 'missing_marketing_token');
    return { ok: false, platform: 'tiktok', job_name: JOB_NAME, rows_upserted: 0, leads_ingested: 0, duration_ms: Date.now() - t0, error: 'missing_marketing_token' };
  }
  const token = credsRes.creds.marketing_access_token;

  let q = sb.from('ads_accounts').select('*').eq('platform', 'tiktok');
  if (accountId) q = q.eq('id', accountId);
  else q = q.eq('status', 'active');
  const { data: accountsRaw } = await q;
  const accounts = (accountsRaw as Array<{ id: number; tiktok_advertiser_id: string | null }> | null) || [];
  if (!accounts.length) {
    await logSync(sb, startedAt, 0, [], 'success', null);
    return { ok: true, platform: 'tiktok', job_name: JOB_NAME, rows_upserted: 0, leads_ingested: 0, duration_ms: Date.now() - t0 };
  }

  let totalRows = 0;
  const perAccount: Array<Record<string, unknown>> = [];

  for (const acc of accounts) {
    const advertiserId = String(acc.tiktok_advertiser_id || '').replace(/[^\d]/g, '');
    if (!advertiserId) {
      perAccount.push({ account_id: acc.id, ok: false, error: 'no_advertiser_id' });
      continue;
    }

    let acctErr: unknown = null;
    let acctCampaigns = 0;
    let acctAdsets = 0;
    let acctAds = 0;
    let acctMetrics = 0;

    try {
      // 1) Campaigns
      const cR = await ttBizGet(`/campaign/get/?advertiser_id=${advertiserId}&page_size=1000`, token);
      if (!cR.ok) { acctErr = { step: 'list_campaigns', raw: cR.body }; throw new Error('campaigns'); }
      const campaigns = ((cR.body as { data?: { list?: Array<Record<string, unknown>> } }).data?.list) || [];

      const campaignRows = campaigns.map(c => {
        const r = c as { campaign_id?: string | number; campaign_name?: string; primary_status?: string; operation_status?: string; status?: string; objective_type?: string; budget?: number | string };
        return {
          platform: 'tiktok' as const,
          account_id: acc.id,
          external_id: String(r.campaign_id),
          name: r.campaign_name || '(unnamed)',
          status: tikTokStatusToOurs(r.primary_status || r.operation_status || r.status),
          objective: r.objective_type || null,
          buying_type: 'AUCTION',
          daily_budget_micros: r.budget ? Math.round(Number(r.budget) * 1_000_000) : null,
          raw: c as object,
          updated_at: new Date().toISOString(),
        };
      });

      if (campaignRows.length) {
        const up = await sb.from('ads_campaigns').upsert(campaignRows, { onConflict: 'platform,external_id' }).select('id,external_id');
        if (up.error) { acctErr = { step: 'upsert_campaigns', error: up.error.message }; throw new Error('upsert_campaigns'); }
        acctCampaigns = up.data?.length || 0;
        totalRows += acctCampaigns;
      }

      // Map external_id → internal id
      const { data: mapped } = await sb.from('ads_campaigns').select('id,external_id').eq('platform', 'tiktok').eq('account_id', acc.id);
      const campIdMap: Record<string, number> = {};
      ((mapped as Array<{ id: number; external_id: string }> | null) || []).forEach(r => { campIdMap[String(r.external_id)] = r.id; });

      // 2) Ad groups
      const agR = await ttBizGet(`/adgroup/get/?advertiser_id=${advertiserId}&page_size=1000`, token);
      if (!agR.ok) { acctErr = { step: 'list_adgroups', raw: agR.body }; throw new Error('adgroups'); }
      const adgroups = ((agR.body as { data?: { list?: Array<Record<string, unknown>> } }).data?.list) || [];

      const adsetRows = adgroups.map(a => {
        const r = a as { adgroup_id?: string | number; adgroup_name?: string; campaign_id?: string | number; primary_status?: string; operation_status?: string; status?: string; optimization_goal?: string; budget?: number | string; age_groups?: unknown; gender?: string; location_ids?: unknown; placements?: unknown };
        const campRowId = campIdMap[String(r.campaign_id)];
        if (!campRowId) return null;
        return {
          platform: 'tiktok' as const,
          campaign_id: campRowId,
          external_id: String(r.adgroup_id),
          name: r.adgroup_name || '(unnamed)',
          status: tikTokStatusToOurs(r.primary_status || r.operation_status || r.status),
          optimization_goal: r.optimization_goal || null,
          daily_budget_micros: r.budget ? Math.round(Number(r.budget) * 1_000_000) : null,
          targeting: { age_groups: r.age_groups, gender: r.gender, location_ids: r.location_ids, placements: r.placements } as object,
          raw: a as object,
          updated_at: new Date().toISOString(),
        };
      }).filter(Boolean) as Array<Record<string, unknown>>;

      if (adsetRows.length) {
        const up = await sb.from('ads_ad_sets').upsert(adsetRows, { onConflict: 'platform,external_id' }).select('id,external_id');
        if (up.error) { acctErr = { step: 'upsert_adsets', error: up.error.message }; throw new Error('upsert_adsets'); }
        acctAdsets = up.data?.length || 0;
        totalRows += acctAdsets;
      }

      const { data: adsetMapped } = await sb.from('ads_ad_sets').select('id,external_id').eq('platform', 'tiktok');
      const adsetIdMap: Record<string, number> = {};
      ((adsetMapped as Array<{ id: number; external_id: string }> | null) || []).forEach(r => { adsetIdMap[String(r.external_id)] = r.id; });

      // 3) Ads
      const adR = await ttBizGet(`/ad/get/?advertiser_id=${advertiserId}&page_size=1000`, token);
      if (!adR.ok) { acctErr = { step: 'list_ads', raw: adR.body }; throw new Error('ads'); }
      const ads = ((adR.body as { data?: { list?: Array<Record<string, unknown>> } }).data?.list) || [];

      const adRows = ads.map(a => {
        const r = a as { ad_id?: string | number; ad_name?: string; adgroup_id?: string | number; primary_status?: string; operation_status?: string; status?: string; ad_text?: string; landing_page_url?: string };
        const adsetRowId = adsetIdMap[String(r.adgroup_id)];
        if (!adsetRowId) return null;
        return {
          platform: 'tiktok' as const,
          ad_set_id: adsetRowId,
          external_id: String(r.ad_id),
          name: r.ad_name || '(unnamed)',
          status: tikTokStatusToOurs(r.primary_status || r.operation_status || r.status),
          creative_type: 'video',
          headline: (r.ad_text || '').slice(0, 200),
          body: r.ad_text || null,
          landing_url: r.landing_page_url || null,
          raw: a as object,
          updated_at: new Date().toISOString(),
        };
      }).filter(Boolean) as Array<Record<string, unknown>>;

      if (adRows.length) {
        const up = await sb.from('ads_ads').upsert(adRows, { onConflict: 'platform,external_id' });
        if (up.error) { acctErr = { step: 'upsert_ads', error: up.error.message }; throw new Error('upsert_ads'); }
        acctAds = adRows.length;
        totalRows += acctAds;
      }

      // 4) Daily metrics
      const range = dateRange(30);
      const reportRes = await ttBizPost('/report/integrated/get/', {
        advertiser_id: advertiserId,
        report_type: 'BASIC',
        data_level: 'AUCTION_CAMPAIGN',
        dimensions: ['campaign_id', 'stat_time_day'],
        metrics: ['impressions', 'clicks', 'spend', 'video_play_actions', 'conversion'],
        start_date: range.start,
        end_date: range.end,
        page_size: 1000,
      }, token);
      if (!reportRes.ok) { acctErr = { step: 'report_get', raw: reportRes.body }; throw new Error('report'); }
      const reportRows = ((reportRes.body as { data?: { list?: Array<Record<string, unknown>> } }).data?.list) || [];

      const metricRows = reportRows.map(row => {
        const r = row as { dimensions?: { campaign_id?: string | number; stat_time_day?: string }; metrics?: Record<string, unknown> };
        const campId = campIdMap[String(r.dimensions?.campaign_id)];
        if (!campId) return null;
        const m = r.metrics || {};
        return {
          platform: 'tiktok' as const,
          account_id: acc.id,
          campaign_id: campId,
          ad_set_id: null,
          ad_id: null,
          metric_date: String(r.dimensions?.stat_time_day || '').slice(0, 10),
          impressions: Number(m.impressions || 0),
          clicks: Number(m.clicks || 0),
          spend_micros: m.spend ? Math.round(Number(m.spend) * 1_000_000) : 0,
          reach: null,
          leads: 0,
          conversions: Number(m.conversion || 0),
          conversion_value_micros: 0,
          video_views: Number(m.video_play_actions || 0),
          raw: row as object,
        };
      }).filter(Boolean) as Array<Record<string, unknown>>;

      if (metricRows.length) {
        const dates = Array.from(new Set(metricRows.map(r => r.metric_date))).filter(Boolean) as string[];
        if (dates.length) {
          const del = await sb.from('ads_daily_metrics').delete()
            .eq('platform', 'tiktok').eq('account_id', acc.id)
            .is('ad_id', null).is('ad_set_id', null)
            .in('metric_date', dates);
          if (del.error) { acctErr = { step: 'delete_metrics', error: del.error.message }; throw new Error('del_metrics'); }
        }
        const ins = await sb.from('ads_daily_metrics').insert(metricRows);
        if (ins.error) { acctErr = { step: 'insert_metrics', error: ins.error.message }; throw new Error('ins_metrics'); }
        acctMetrics = metricRows.length;
        totalRows += acctMetrics;
      }
    } catch (_e) {
      // acctErr already set
    }

    if (acctErr) perAccount.push({ account_id: acc.id, ok: false, advertiser_id: advertiserId, ...(acctErr as object) });
    else perAccount.push({ account_id: acc.id, ok: true, advertiser_id: advertiserId, campaigns: acctCampaigns, adsets: acctAdsets, ads: acctAds, metrics: acctMetrics });
  }

  const anyFailed = perAccount.some(p => !p.ok);
  await logSync(sb, startedAt, totalRows, perAccount, anyFailed ? 'partial' : 'success', null);

  return {
    ok: !anyFailed,
    platform: 'tiktok',
    job_name: JOB_NAME,
    rows_upserted: totalRows,
    leads_ingested: 0,
    duration_ms: Date.now() - t0,
    details: { per_account: perAccount },
  };
}

async function logSync(
  sb: ReturnType<typeof supabaseAdmin>,
  startedAt: string,
  rowsUpserted: number,
  perAccount: unknown,
  status: 'running' | 'success' | 'error' | 'partial',
  error: string | null
): Promise<void> {
  await sb.from('ads_sync_log').insert({
    job_name: JOB_NAME,
    platform: 'tiktok',
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status,
    rows_upserted: rowsUpserted,
    error,
    details: { per_account: perAccount },
  });
}
