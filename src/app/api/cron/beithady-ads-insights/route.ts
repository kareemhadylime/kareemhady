import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { loadMetaCredentials, metaGet } from '@/lib/beithady/ads/meta-client';
import { recordAudit } from '@/lib/beithady/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily insights pull from Meta Marketing API → ads_daily_metrics.
// Runs 05:30 Cairo (after Beithady CRM sync) so by morning the
// dashboard reflects yesterday's spend/impressions/leads/CPL.
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
    const yesterday = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
    // Pull campaign-level insights for yesterday
    const path = `${creds.creds.adAccountId}/insights?level=campaign&time_range=${encodeURIComponent(JSON.stringify({ since: yesterday, until: yesterday }))}&fields=campaign_id,impressions,clicks,spend,reach,actions&limit=200`;
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
      await sb.from('ads_daily_metrics').upsert({
        account_id: cc.account_id,
        campaign_id: cc.id,
        platform: 'meta',
        metric_date: yesterday,
        impressions: Number(it.impressions || 0),
        clicks: Number(it.clicks || 0),
        spend_micros: spendMicros,
        reach: Number(it.reach || 0),
        leads,
        raw: it as object,
      }, { onConflict: 'campaign_id,metric_date' });
      upserted++;
      totalLeads += leads;
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
      metadata: { date: yesterday, rows: upserted, leads: totalLeads, started_at: startedAt },
    });

    return NextResponse.json({ ok: true, date: yesterday, rows_upserted: upserted, leads: totalLeads });
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
