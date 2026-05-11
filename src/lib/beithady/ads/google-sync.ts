import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import {
  loadGoogleAdsCredentials,
  getGoogleAccessToken,
  gaqlSearch,
} from './google-client';
import type { SyncResult } from './platforms';

// Pull last-30-day Google Ads campaign + daily metrics into
// ads_campaigns + ads_daily_metrics. Ports
// C:\Voltauto-pricing\supabase\functions\ads-google-sync\index.ts.
//
// Behavior:
// - Iterates ads_accounts WHERE platform='google' AND status='active'
// - For each account: detect manager (MCC) vs leaf; expand manager to children
// - Per customer: pull campaigns + last-30-day metrics
// - Logs to ads_sync_log

const JOB_NAME = 'beithady-ads-google-sync';

export async function syncGoogleAds(accountId?: number): Promise<SyncResult> {
  const sb = supabaseAdmin();
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const credsRes = await loadGoogleAdsCredentials();
  if (!credsRes.ok) {
    await logSync(sb, startedAt, 0, [], 'error', `missing_credentials: ${credsRes.missing.join(', ')}`);
    return { ok: false, platform: 'google', job_name: JOB_NAME, rows_upserted: 0, leads_ingested: 0, duration_ms: Date.now() - t0, error: 'missing_credentials' };
  }
  const tokRes = await getGoogleAccessToken(credsRes.creds);
  if (!tokRes.ok) {
    await logSync(sb, startedAt, 0, [], 'error', `oauth_failed`);
    return { ok: false, platform: 'google', job_name: JOB_NAME, rows_upserted: 0, leads_ingested: 0, duration_ms: Date.now() - t0, error: 'oauth_failed' };
  }
  const accessToken = tokRes.access_token;
  const creds = credsRes.creds;

  let q = sb.from('ads_accounts').select('*').eq('platform', 'google');
  if (accountId) q = q.eq('id', accountId);
  else q = q.eq('status', 'active');
  const { data: accountsRaw } = await q;
  const accounts = (accountsRaw as Array<{ id: number; external_id: string; status: string; name: string }> | null) || [];
  if (!accounts.length) {
    await logSync(sb, startedAt, 0, [], 'success', null);
    return { ok: true, platform: 'google', job_name: JOB_NAME, rows_upserted: 0, leads_ingested: 0, duration_ms: Date.now() - t0 };
  }

  let totalRows = 0;
  const perAccount: Array<Record<string, unknown>> = [];

  for (const acc of accounts) {
    const rootCustomerId = String(acc.external_id || '').replace(/[^\d]/g, '');
    if (!rootCustomerId) {
      perAccount.push({ account_id: acc.id, ok: false, error: 'bad_external_id' });
      continue;
    }

    // Detect manager
    const ck = await gaqlSearch<{ customer: { id?: string; manager?: boolean } }>(
      rootCustomerId,
      'SELECT customer.id, customer.manager FROM customer',
      creds, accessToken
    );
    if (!ck.ok) {
      perAccount.push({ account_id: acc.id, ok: false, step: 'detect_manager', error: ck.error });
      continue;
    }
    const isManager = !!(ck.rows[0]?.customer?.manager);

    let effectiveCustomerIds: string[];
    if (isManager) {
      const qc0 = "SELECT customer_client.id, customer_client.manager, customer_client.status, customer_client.level FROM customer_client WHERE customer_client.manager = FALSE AND customer_client.level <= 2 AND customer_client.status = 'ENABLED'";
      const rc0 = await gaqlSearch<{ customerClient?: { id?: string }; customer_client?: { id?: string } }>(rootCustomerId, qc0, creds, accessToken);
      if (!rc0.ok) {
        perAccount.push({ account_id: acc.id, ok: false, step: 'list_children', error: rc0.error });
        continue;
      }
      effectiveCustomerIds = rc0.rows.map(r => String((r.customerClient || r.customer_client)?.id || '')).filter(Boolean);
      if (!effectiveCustomerIds.length) {
        perAccount.push({ account_id: acc.id, ok: true, note: 'manager_no_children', campaigns: 0, metrics: 0 });
        continue;
      }
    } else {
      effectiveCustomerIds = [rootCustomerId];
    }

    let acctCampaigns = 0;
    let acctMetrics = 0;
    let acctErr: unknown = null;

    for (const customerId of effectiveCustomerIds) {
      // Pull campaigns
      const qc = "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'";
      const rc = await gaqlSearch<Record<string, unknown>>(customerId, qc, creds, accessToken);
      if (!rc.ok) { acctErr = { step: 'gaql_campaigns', customerId, error: rc.error }; break; }

      const campaignRows = rc.rows.map(row => {
        const r = row as { campaign?: Record<string, unknown>; campaignBudget?: Record<string, unknown>; campaign_budget?: Record<string, unknown> };
        const c = r.campaign || {};
        const b = r.campaignBudget || r.campaign_budget || {};
        return {
          platform: 'google' as const,
          account_id: acc.id,
          external_id: String(c.id),
          name: (c.name as string) || '(unnamed)',
          status: (c.status as string) || null,
          objective: (c.advertisingChannelType as string) || (c.advertising_channel_type as string) || null,
          daily_budget_micros: b.amountMicros ? Number(b.amountMicros) : (b.amount_micros ? Number(b.amount_micros) : null),
          raw: row as object,
          updated_at: new Date().toISOString(),
        };
      });

      if (campaignRows.length) {
        const up = await sb.from('ads_campaigns').upsert(campaignRows, { onConflict: 'platform,external_id' }).select('id,external_id');
        if (up.error) { acctErr = { step: 'upsert_campaigns', customerId, error: up.error.message }; break; }
        acctCampaigns += up.data?.length || 0;
        totalRows += up.data?.length || 0;
      }

      // Build id map
      const { data: mapped } = await sb.from('ads_campaigns').select('id,external_id').eq('platform', 'google').eq('account_id', acc.id);
      const idMap: Record<string, number> = {};
      ((mapped as Array<{ id: number; external_id: string }> | null) || []).forEach(r => { idMap[String(r.external_id)] = r.id; });

      // Metrics (campaign-level, last 30 days)
      const qm = "SELECT campaign.id, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'";
      const rm = await gaqlSearch<Record<string, unknown>>(customerId, qm, creds, accessToken);
      if (!rm.ok) { acctErr = { step: 'gaql_metrics', customerId, error: rm.error }; break; }

      const metricRows = rm.rows.map(row => {
        const r = row as { campaign?: { id?: string }; segments?: { date?: string }; metrics?: Record<string, unknown> };
        const c = r.campaign || {};
        const s = r.segments || {};
        const m = r.metrics || {};
        const campId = idMap[String(c.id)];
        if (!campId) return null;
        return {
          platform: 'google' as const,
          account_id: acc.id,
          campaign_id: campId,
          ad_set_id: null,
          ad_id: null,
          metric_date: s.date || null,
          impressions: Number(m.impressions || 0),
          clicks: Number(m.clicks || 0),
          spend_micros: Number(m.costMicros || m.cost_micros || 0),
          reach: null,
          leads: 0,
          conversions: Number(m.conversions || 0),
          conversion_value_micros: m.conversionsValue ? Math.round(Number(m.conversionsValue) * 1_000_000) : (m.conversions_value ? Math.round(Number(m.conversions_value) * 1_000_000) : 0),
          raw: row as object,
        };
      }).filter(Boolean) as Array<Record<string, unknown>>;

      if (metricRows.length) {
        const dates = Array.from(new Set(metricRows.map(r => r.metric_date))).filter(Boolean) as string[];
        if (dates.length) {
          const del = await sb.from('ads_daily_metrics').delete()
            .eq('platform', 'google').eq('account_id', acc.id)
            .is('ad_id', null).is('ad_set_id', null)
            .in('metric_date', dates);
          if (del.error) { acctErr = { step: 'delete_metrics', customerId, error: del.error.message }; break; }
        }
        const ins = await sb.from('ads_daily_metrics').insert(metricRows);
        if (ins.error) { acctErr = { step: 'insert_metrics', customerId, error: ins.error.message }; break; }
        acctMetrics += metricRows.length;
        totalRows += metricRows.length;
      }
    }

    if (acctErr) perAccount.push({ account_id: acc.id, ok: false, manager: isManager, ...(acctErr as object) });
    else perAccount.push({ account_id: acc.id, ok: true, manager: isManager, campaigns: acctCampaigns, metrics: acctMetrics });
  }

  const anyFailed = perAccount.some(p => !p.ok);
  await logSync(sb, startedAt, totalRows, perAccount, anyFailed ? 'partial' : 'success', null);

  return {
    ok: !anyFailed,
    platform: 'google',
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
    platform: 'google',
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status,
    rows_upserted: rowsUpserted,
    error,
    details: { per_account: perAccount },
  });
}
