import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { loadMetaCredentials, metaPost } from './meta-client';
import { setGoogleCampaignStatus } from './google-publish';
import { setTikTokCampaignStatus } from './tiktok-paid-publish';
import { recordAudit } from '@/lib/beithady/audit';

// Unified per-platform campaign status dispatcher. Used by the budget-guard
// cron + any other code that needs to flip a campaign's status without
// caring about which platform it lives on.
//
// Statuses are normalized to PAUSED | ACTIVE in our DB. Each platform's
// API speaks its own dialect:
//   Meta:   status = 'PAUSED' | 'ACTIVE' (Graph API)
//   Google: status = 'PAUSED' | 'ENABLED'
//   TikTok: operation_status = 'DISABLE' | 'ENABLE'

export type UnifiedStatus = 'PAUSED' | 'ACTIVE';

export type SetCampaignStatusResult =
  | { ok: true; platform: string; mode: 'live' | 'draft' }
  | { ok: false; platform: string; error: string };

export async function setCampaignStatusUnified(
  campaignDbId: number,
  status: UnifiedStatus,
  reason?: string
): Promise<SetCampaignStatusResult> {
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('ads_campaigns')
    .select('id, external_id, platform, status, account_id')
    .eq('id', campaignDbId)
    .maybeSingle();
  if (!row) return { ok: false, platform: 'unknown', error: 'campaign_not_found' };
  const c = row as { id: number; external_id: string; platform: string; status: string | null; account_id: number };

  // Draft mode — DB-only
  if (c.external_id.startsWith('draft_')) {
    await sb.from('ads_campaigns').update({
      status,
      ...(status === 'PAUSED' && reason ? { auto_paused_at: new Date().toISOString(), auto_paused_reason: reason } : {}),
      ...(status === 'ACTIVE' ? { auto_paused_at: null, auto_paused_reason: null } : {}),
    }).eq('id', campaignDbId);
    return { ok: true, platform: c.platform, mode: 'draft' };
  }

  // Live mode — dispatch to platform
  if (c.platform === 'meta') {
    const creds = await loadMetaCredentials();
    if (creds.ok) {
      // 1. Campaign
      const r = await metaPost(c.external_id, { status }, creds.creds.token);
      if (!r.ok) return { ok: false, platform: 'meta', error: r.error };

      // 2. Cascade to ad sets — Meta requires each level to be ACTIVE for ads to run
      const { data: adsetRows } = await sb
        .from('ads_ad_sets')
        .select('id, external_id')
        .eq('campaign_id', campaignDbId)
        .not('external_id', 'is', null);
      const adsets = (adsetRows as Array<{ id: number; external_id: string }> | null) || [];
      const adsetIds: number[] = [];
      for (const a of adsets) {
        if (a.external_id?.startsWith('draft_')) continue;
        const r2 = await metaPost(a.external_id, { status }, creds.creds.token);
        if (r2.ok) adsetIds.push(a.id);
        // Continue on individual failure — campaign-level toggle already succeeded
      }
      if (adsetIds.length) {
        await sb.from('ads_ad_sets').update({ status }).in('id', adsetIds);
      }

      // 3. Cascade to ads
      if (adsets.length) {
        const { data: adRows } = await sb
          .from('ads_ads')
          .select('id, external_id')
          .in('ad_set_id', adsets.map(a => a.id))
          .not('external_id', 'is', null);
        const ads = (adRows as Array<{ id: number; external_id: string }> | null) || [];
        const adIds: number[] = [];
        for (const ad of ads) {
          if (ad.external_id?.startsWith('draft_')) continue;
          const r3 = await metaPost(ad.external_id, { status }, creds.creds.token);
          if (r3.ok) adIds.push(ad.id);
        }
        if (adIds.length) {
          await sb.from('ads_ads').update({ status }).in('id', adIds);
        }
      }
    }
    await sb.from('ads_campaigns').update({
      status,
      ...(status === 'PAUSED' && reason ? { auto_paused_at: new Date().toISOString(), auto_paused_reason: reason } : {}),
      ...(status === 'ACTIVE' ? { auto_paused_at: null, auto_paused_reason: null } : {}),
    }).eq('id', campaignDbId);
    return { ok: true, platform: 'meta', mode: 'live' };
  }

  if (c.platform === 'google') {
    const r = await setGoogleCampaignStatus(campaignDbId, status === 'ACTIVE' ? 'ENABLED' : 'PAUSED');
    if (!r.ok) return { ok: false, platform: 'google', error: r.error };
    if (status === 'PAUSED' && reason) {
      await sb.from('ads_campaigns').update({
        auto_paused_at: new Date().toISOString(),
        auto_paused_reason: reason,
      }).eq('id', campaignDbId);
    } else if (status === 'ACTIVE') {
      await sb.from('ads_campaigns').update({ auto_paused_at: null, auto_paused_reason: null }).eq('id', campaignDbId);
    }
    return { ok: true, platform: 'google', mode: 'live' };
  }

  if (c.platform === 'tiktok') {
    const r = await setTikTokCampaignStatus(campaignDbId, status === 'ACTIVE' ? 'ENABLED' : 'PAUSED');
    if (!r.ok) return { ok: false, platform: 'tiktok', error: r.error };
    if (status === 'PAUSED' && reason) {
      await sb.from('ads_campaigns').update({
        auto_paused_at: new Date().toISOString(),
        auto_paused_reason: reason,
      }).eq('id', campaignDbId);
    } else if (status === 'ACTIVE') {
      await sb.from('ads_campaigns').update({ auto_paused_at: null, auto_paused_reason: null }).eq('id', campaignDbId);
    }
    return { ok: true, platform: 'tiktok', mode: 'live' };
  }

  return { ok: false, platform: c.platform, error: 'unknown_platform' };
}

// =====================================================================
// Budget guard — pauses campaigns whose MTD spend > monthly_budget_cap_usd.
// =====================================================================

export type BudgetGuardResult = {
  ok: boolean;
  checked: number;
  paused: number;
  errors: number;
  details: Array<{
    campaign_id: number;
    name: string;
    platform: string;
    cap: number;
    mtd_spend: number;
    action: 'paused' | 'within_cap' | 'error';
    error?: string;
  }>;
  duration_ms: number;
};

export async function runBudgetGuard(): Promise<BudgetGuardResult> {
  const sb = supabaseAdmin();
  const t0 = Date.now();
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const startOfMonthIso = startOfMonth.toISOString().slice(0, 10);

  // Pull active campaigns with a cap
  const { data: campsRaw } = await sb
    .from('ads_campaigns')
    .select('id, external_id, platform, name, monthly_budget_cap_usd, status')
    .eq('status', 'ACTIVE')
    .not('monthly_budget_cap_usd', 'is', null);
  const camps = (campsRaw as Array<{ id: number; external_id: string; platform: string; name: string; monthly_budget_cap_usd: number; status: string }> | null) || [];

  if (!camps.length) {
    await logSync(sb, 0, 0, [], 'success', t0);
    return { ok: true, checked: 0, paused: 0, errors: 0, details: [], duration_ms: Date.now() - t0 };
  }

  // Aggregate MTD spend per campaign in one query
  const campaignIds = camps.map(c => c.id);
  const { data: spendRaw } = await sb
    .from('ads_daily_metrics')
    .select('campaign_id, spend_micros')
    .in('campaign_id', campaignIds)
    .is('ad_id', null)
    .is('ad_set_id', null)
    .gte('metric_date', startOfMonthIso);
  const spendByCampaign: Record<number, number> = {};
  for (const r of (spendRaw as Array<{ campaign_id: number; spend_micros: number }> | null) || []) {
    spendByCampaign[r.campaign_id] = (spendByCampaign[r.campaign_id] || 0) + Number(r.spend_micros) || 0;
  }

  const details: BudgetGuardResult['details'] = [];
  let paused = 0;
  let errors = 0;

  for (const c of camps) {
    const cap = Number(c.monthly_budget_cap_usd) || 0;
    const spendUsd = (spendByCampaign[c.id] || 0) / 1_000_000;
    if (spendUsd >= cap) {
      const r = await setCampaignStatusUnified(
        c.id,
        'PAUSED',
        `auto-pause: MTD spend $${spendUsd.toFixed(2)} reached cap $${cap.toFixed(2)}`
      );
      if (r.ok) {
        paused += 1;
        await recordAudit({
          module: 'ads',
          action: 'campaign_auto_paused',
          target_type: 'campaign',
          target_id: String(c.id),
          metadata: {
            platform: c.platform,
            cap_usd: cap,
            mtd_spend_usd: Math.round(spendUsd * 100) / 100,
            external_id: c.external_id,
          },
        });
        details.push({ campaign_id: c.id, name: c.name, platform: c.platform, cap, mtd_spend: Math.round(spendUsd * 100) / 100, action: 'paused' });
      } else {
        errors += 1;
        details.push({ campaign_id: c.id, name: c.name, platform: c.platform, cap, mtd_spend: Math.round(spendUsd * 100) / 100, action: 'error', error: r.error });
      }
    } else {
      details.push({ campaign_id: c.id, name: c.name, platform: c.platform, cap, mtd_spend: Math.round(spendUsd * 100) / 100, action: 'within_cap' });
    }
  }

  await logSync(sb, camps.length, paused, details, errors > 0 ? 'partial' : 'success', t0);

  return {
    ok: errors === 0,
    checked: camps.length,
    paused,
    errors,
    details,
    duration_ms: Date.now() - t0,
  };
}

async function logSync(
  sb: ReturnType<typeof supabaseAdmin>,
  checked: number,
  paused: number,
  details: unknown,
  status: 'success' | 'error' | 'partial',
  t0: number
): Promise<void> {
  await sb.from('ads_sync_log').insert({
    job_name: 'beithady-ads-budget-guard',
    platform: 'meta', // sentinel — cross-platform; required by NOT NULL constraint
    started_at: new Date(t0).toISOString(),
    finished_at: new Date().toISOString(),
    status,
    rows_upserted: paused,
    details: { checked, paused, per_campaign: details },
  });
}
