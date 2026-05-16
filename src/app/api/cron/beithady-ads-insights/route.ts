import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { loadMetaCredentials, metaGet } from '@/lib/beithady/ads/meta-client';
import { recordAudit } from '@/lib/beithady/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily insights pull from Meta Marketing API → ads_daily_metrics.
// Runs 05:30 Cairo (after Beithady CRM sync). Pulls yesterday + today
// (time_increment=1) so the dashboard reflects same-day spend/clicks
// without waiting another 24h for the next cron tick.
//
// No-op when credentials missing.

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) {
    console.error('[cron beithady-ads-insights] CRON_SECRET unset — refusing');
    return false;
  }
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const sb = supabaseAdmin();
  const startedAt = new Date().toISOString();

  // Open run row
  const { data: runIns } = await sb
    .from('ads_sync_log')
    .insert({ job_name: 'meta_insights_daily', platform: 'meta', status: 'running' })
    .select('id')
    .single();
  const runId = (runIns as { id: number } | null)?.id;

  const creds = await loadMetaCredentials();
  if (!creds.ok) {
    await sb.from('ads_sync_log').update({
      finished_at: new Date().toISOString(),
      status: 'partial',
      error: creds.error,
    }).eq('id', runId);
    return NextResponse.json({ ok: true, skipped: 'credentials_missing', detail: creds.error });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
    // Pull campaign-level insights for yesterday + today (intraday refresh).
    // time_increment=1 yields one row per day per campaign, with date_start used as metric_date.
    const path = `${creds.creds.adAccountId}/insights?level=campaign&time_range=${encodeURIComponent(JSON.stringify({ since: yesterday, until: today }))}&time_increment=1&fields=campaign_id,impressions,clicks,spend,reach,actions,date_start&limit=200`;
    const r = await metaGet<{ data: Array<Record<string, unknown>> }>(path, creds.creds.token);
    if (!r.ok) {
      await sb.from('ads_sync_log').update({
        finished_at: new Date().toISOString(),
        status: 'error',
        error: r.error,
      }).eq('id', runId);
      return NextResponse.json({ ok: false, error: r.error }, { status: 200 });
    }

    // Map external campaign_ids to local ids
    const items = (r.data as { data?: Array<Record<string, unknown>> })?.data || [];
    let upserted = 0;
    let totalLeads = 0;
    for (const it of items) {
      const externalId = it.campaign_id as string | undefined;
      if (!externalId) continue;
      const { data: c } = await sb
        .from('ads_campaigns')
        .select('id, account_id')
        .eq('platform', 'meta')
        .eq('external_id', externalId)
        .maybeSingle();
      if (!c) continue;
      const cc = c as { id: number; account_id: number };
      const actions = (it.actions as Array<{ action_type: string; value: string }> | undefined) || [];
      const leads = Number(actions.find(a => a.action_type === 'onsite_conversion.messaging_conversation_started_7d' || a.action_type === 'onsite_conversion.lead_grouped')?.value || 0);
      const spendMicros = Math.round(Number(it.spend || 0) * 1_000_000);
      const metricDate = (it.date_start as string | undefined) || yesterday;
      const row = {
        account_id: cc.account_id,
        campaign_id: cc.id,
        platform: 'meta' as const,
        metric_date: metricDate,
        impressions: Number(it.impressions || 0),
        clicks: Number(it.clicks || 0),
        spend_micros: spendMicros,
        reach: Number(it.reach || 0),
        leads,
        raw: it as object,
      };
      // Manual upsert: the table's unique index on (campaign_id, metric_date) is
      // PARTIAL (WHERE ad_id IS NULL AND ad_set_id IS NULL) — PostgREST's onConflict
      // can't target partial indexes, so we look up + insert/update by id.
      const { data: existing, error: selErr } = await sb
        .from('ads_daily_metrics')
        .select('id')
        .eq('campaign_id', cc.id)
        .eq('metric_date', metricDate)
        .is('ad_set_id', null)
        .is('ad_id', null)
        .maybeSingle();
      if (selErr) {
        console.error('[cron beithady-ads-insights] select error', { campaign_id: cc.id, metricDate, err: selErr.message });
        continue;
      }
      if (existing) {
        const { error: updErr } = await sb.from('ads_daily_metrics').update(row).eq('id', (existing as { id: number }).id);
        if (updErr) {
          console.error('[cron beithady-ads-insights] update error', { id: (existing as { id: number }).id, err: updErr.message });
          continue;
        }
      } else {
        const { error: insErr } = await sb.from('ads_daily_metrics').insert(row);
        if (insErr) {
          console.error('[cron beithady-ads-insights] insert error', { campaign_id: cc.id, metricDate, err: insErr.message });
          continue;
        }
      }
      upserted++;
      totalLeads += leads;
    }

    // === V3 D1: also pull hourly stats per campaign (Meta only) ===
    // Fetches hourly_stats_aggregated_by_advertiser_time_zone for yesterday+today
    // and upserts into ads_hourly_metrics. Per-campaign isolation: a failure on
    // one campaign doesn't abort the rest. Wrapped in its own try/catch so this
    // new block can NOT break the existing daily-fetch sync log close.
    try {
      const { normalizeMetaHourlyRow } = await import('@/lib/beithady/ads/hourly');
      const { data: metaCampaigns } = await sb
        .from('ads_campaigns')
        .select('id, external_id, account_id')
        .eq('platform', 'meta')
        .neq('status', 'REMOVED');
      for (const c of (metaCampaigns as Array<{ id: number; external_id: string; account_id: number }> | null) ?? []) {
        const hourlyPath = `${c.external_id}/insights?fields=impressions,clicks,spend,date_start&breakdowns=hourly_stats_aggregated_by_advertiser_time_zone&time_range=${encodeURIComponent(JSON.stringify({ since: yesterday, until: today }))}&time_increment=1&level=campaign&limit=200`;
        const hr = await metaGet<{ data: Array<Record<string, unknown>> }>(hourlyPath, creds.creds.token);
        if (!hr.ok) {
          console.warn(`[ads-insights] meta hourly fetch failed for campaign ${c.id}:`, hr.error);
          continue;
        }
        const rawRows = (hr.data?.data ?? []) as Array<Record<string, unknown>>;
        const normalized = rawRows
          .map(r => normalizeMetaHourlyRow(r as Parameters<typeof normalizeMetaHourlyRow>[0], { accountId: c.account_id, campaignId: c.id }))
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (normalized.length === 0) continue;
        const { error: upErr } = await sb
          .from('ads_hourly_metrics')
          .upsert(normalized, { onConflict: 'campaign_id,metric_date,hour,platform' });
        if (upErr) console.error(`[ads-insights] meta hourly upsert failed for campaign ${c.id}:`, upErr);
      }
    } catch (e) {
      console.error('[ads-insights] meta hourly block failed (non-fatal):', e);
    }

    await sb.from('ads_sync_log').update({
      finished_at: new Date().toISOString(),
      status: 'success',
      rows_upserted: upserted,
      leads_ingested: totalLeads,
    }).eq('id', runId);

    await recordAudit({
      module: 'ads',
      action: 'insights_pulled',
      metadata: { since: yesterday, until: today, rows: upserted, leads: totalLeads, started_at: startedAt },
    });

    return NextResponse.json({ ok: true, since: yesterday, until: today, rows_upserted: upserted, leads: totalLeads });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from('ads_sync_log').update({
      finished_at: new Date().toISOString(),
      status: 'error',
      error: msg,
    }).eq('id', runId);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
