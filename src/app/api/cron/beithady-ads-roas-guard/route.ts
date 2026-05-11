import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { setCampaignStatusUnified } from '@/lib/beithady/ads/status';
import { convertToUsd } from '@/lib/fx-rates';
import { recordAudit } from '@/lib/beithady/audit';

// ROAS guard — counterpart to budget-guard. Pauses ACTIVE campaigns
// whose 14-day ROAS drops below a threshold AND that have meaningful
// spend (>= $100). This isn't an "always-on safety net" — only kicks
// in once a campaign has spent enough that the math is significant.
//
// Heuristic, deliberately conservative:
//   - lookback:  14 days of campaign-level metrics
//   - min_spend: $100 (skip campaigns still in their warm-up)
//   - threshold: 0.5x (lose 50c per $1 — pause)
//   - cooldown:  don't keep re-pausing the same campaign every cycle;
//                if it was auto-paused by the ROAS guard already, skip.
//
// Daily run, 09:00 Cairo (after the morning sync).

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const LOOKBACK_DAYS = 14;
const MIN_SPEND_USD = 100;
const ROAS_THRESHOLD = 0.5;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);

  const { data: campsRaw } = await sb
    .from('ads_campaigns')
    .select('id, name, platform, status, auto_paused_at, auto_paused_reason')
    .eq('status', 'ACTIVE');
  const campaigns = (campsRaw as Array<{ id: number; name: string; platform: string; status: string; auto_paused_at: string | null; auto_paused_reason: string | null }> | null) || [];
  if (campaigns.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, paused: 0 });
  }
  const campaignIds = campaigns.map(c => c.id);

  // Spend
  const { data: spendRaw } = await sb
    .from('ads_daily_metrics')
    .select('campaign_id, spend_micros')
    .in('campaign_id', campaignIds)
    .is('ad_id', null)
    .is('ad_set_id', null)
    .gte('metric_date', cutoff);
  const spendByCampaign: Record<number, number> = {};
  for (const r of (spendRaw as Array<{ campaign_id: number; spend_micros: number }> | null) || []) {
    spendByCampaign[r.campaign_id] = (spendByCampaign[r.campaign_id] || 0) + (Number(r.spend_micros) || 0);
  }

  // Revenue (attributed bookings within the window, converted to USD)
  const { data: leadsRaw } = await sb
    .from('ads_lead_funnel')
    .select('campaign_id, matched_reservation_id, booking_value, booking_currency, matched_at')
    .in('campaign_id', campaignIds)
    .gte('matched_at', cutoff)
    .not('matched_reservation_id', 'is', null);
  type FunnelRow = { campaign_id: number; matched_reservation_id: string | null; booking_value: number | null; booking_currency: string | null; matched_at: string };
  const revenueUsdByCampaign: Record<number, number> = {};
  for (const r of (leadsRaw as FunnelRow[] | null) || []) {
    if (r.booking_value == null) continue;
    const usd = await convertToUsd(r.booking_value, r.booking_currency);
    revenueUsdByCampaign[r.campaign_id] = (revenueUsdByCampaign[r.campaign_id] || 0) + usd;
  }

  let paused = 0;
  const details: Array<{ campaign_id: number; name: string; spend: number; revenue: number; roas: number | null; action: string }> = [];
  for (const c of campaigns) {
    if ((c.auto_paused_reason || '').startsWith('roas-guard:')) continue;
    const spendUsd = (spendByCampaign[c.id] || 0) / 1_000_000;
    if (spendUsd < MIN_SPEND_USD) {
      details.push({ campaign_id: c.id, name: c.name, spend: spendUsd, revenue: revenueUsdByCampaign[c.id] || 0, roas: null, action: 'skipped_min_spend' });
      continue;
    }
    const revenue = revenueUsdByCampaign[c.id] || 0;
    const roas = spendUsd > 0 ? revenue / spendUsd : null;
    if (roas != null && roas < ROAS_THRESHOLD) {
      const reason = `roas-guard: ${roas.toFixed(2)}x ROAS on $${spendUsd.toFixed(2)} (${LOOKBACK_DAYS}d) below ${ROAS_THRESHOLD}x threshold`;
      const r = await setCampaignStatusUnified(c.id, 'PAUSED', reason);
      if (r.ok) {
        paused += 1;
        await recordAudit({
          module: 'ads',
          action: 'campaign_auto_paused',
          target_type: 'campaign',
          target_id: String(c.id),
          metadata: { reason: 'low_roas', roas, spend_usd: spendUsd, revenue_usd: revenue, lookback_days: LOOKBACK_DAYS },
        });
        details.push({ campaign_id: c.id, name: c.name, spend: spendUsd, revenue, roas, action: 'paused' });
      } else {
        details.push({ campaign_id: c.id, name: c.name, spend: spendUsd, revenue, roas, action: 'error' });
      }
    } else {
      details.push({ campaign_id: c.id, name: c.name, spend: spendUsd, revenue, roas, action: 'within_threshold' });
    }
  }

  await sb.from('ads_sync_log').insert({
    job_name: 'beithady-ads-roas-guard',
    platform: 'meta',
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    status: 'success',
    rows_upserted: paused,
    details: { scanned: campaigns.length, paused, threshold: ROAS_THRESHOLD, min_spend_usd: MIN_SPEND_USD, per_campaign: details },
  });

  return NextResponse.json({ ok: true, scanned: campaigns.length, paused, details });
}
