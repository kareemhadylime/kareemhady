import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { loadMetaCredentials, fetchMetaInsightsBreakdown } from '@/lib/beithady/ads/meta-client';
import {
  loadGoogleAdsCredentials, getGoogleAccessToken,
  fetchGoogleGeoView, fetchGoogleDemoView, fetchGoogleDeviceView,
  getEffectiveGoogleCustomerIds,
} from '@/lib/beithady/ads/google-client';
import {
  loadTikTokAppCredentials, fetchTikTokIntegratedReport,
} from '@/lib/beithady/ads/tiktok-client';
import {
  normalizeMetaGeoRows, normalizeGoogleGeoRows, normalizeTikTokGeoRows, upsertGeoRows,
} from '@/lib/beithady/ads/insights-geo';
import {
  normalizeMetaDemoRows, normalizeGoogleDemoRows, normalizeTikTokDemoRows, upsertDemoRows,
} from '@/lib/beithady/ads/insights-demo';
import {
  normalizeMetaDeviceRows, normalizeGoogleDeviceRows, normalizeTikTokDeviceRows, upsertDeviceRows,
} from '@/lib/beithady/ads/insights-device';
import { recordAudit } from '@/lib/beithady/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1'
      && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

type CampaignRow = {
  id: number; account_id: number; platform: 'meta' | 'google' | 'tiktok';
  external_id: string; status: string | null;
};
type AccountRow = {
  id: number; platform: 'meta' | 'google' | 'tiktok'; external_id: string;
  google_login_customer_id: string | null;
};

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  try {
  const sb = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const sevenAgo = new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10);
  const fromDate = req.nextUrl.searchParams.get('from') || sevenAgo;
  const toDate = req.nextUrl.searchParams.get('to') || today;

  const { data: accounts } = await sb.from('ads_accounts')
    .select('id, platform, external_id, google_login_customer_id')
    .eq('status', 'active');
  const { data: campaigns } = await sb.from('ads_campaigns')
    .select('id, account_id, platform, external_id, status')
    .neq('status', 'REMOVED');

  const acctList = (accounts as AccountRow[] | null) ?? [];
  const campList = (campaigns as CampaignRow[] | null) ?? [];
  const acctById = new Map<number, AccountRow>();
  for (const a of acctList) acctById.set(a.id, a);

  // Hoist Google creds + access token + per-account effective customer IDs
  // out of the per-campaign loop. The OAuth refresh token lives on
  // ads_accounts.google_refresh_token (NOT integration_credentials), so we
  // must pass it as the fallback — otherwise loadGoogleAdsCredentials returns
  // missing_credentials and every Google campaign fails.
  const { data: firstGooAccRaw } = await sb.from('ads_accounts')
    .select('google_refresh_token').eq('platform', 'google').eq('status', 'active')
    .limit(1).maybeSingle();
  const googleAccountRefreshToken = (firstGooAccRaw as { google_refresh_token?: string | null } | null)?.google_refresh_token;
  const googleCredsRes = await loadGoogleAdsCredentials(googleAccountRefreshToken);
  const googleTokRes = googleCredsRes.ok ? await getGoogleAccessToken(googleCredsRes.creds) : null;
  const googleEffectiveByAccount = new Map<number, string[]>();
  if (googleCredsRes.ok && googleTokRes?.ok) {
    for (const acct of acctList.filter(a => a.platform === 'google')) {
      const eff = await getEffectiveGoogleCustomerIds(acct.external_id, googleCredsRes.creds, googleTokRes.access_token);
      googleEffectiveByAccount.set(acct.id, eff.ok ? eff.ids : []);
    }
  }

  const summary: Array<{ campaignId: number; platform: string; ok: boolean; error?: string }> = [];

  for (const c of campList) {
    const acct = acctById.get(c.account_id);
    if (!acct) continue;
    try {
      if (c.platform === 'meta') {
        const creds = await loadMetaCredentials();
        if (!creds.ok) { summary.push({ campaignId: c.id, platform: 'meta', ok: false, error: creds.error }); continue; }
        const [geo, demo, dev] = await Promise.all([
          fetchMetaInsightsBreakdown({ entityId: c.external_id, level: 'campaign', breakdowns: 'country', fromDate, toDate, token: creds.creds.token }),
          fetchMetaInsightsBreakdown({ entityId: c.external_id, level: 'campaign', breakdowns: 'age,gender', fromDate, toDate, token: creds.creds.token }),
          fetchMetaInsightsBreakdown({ entityId: c.external_id, level: 'campaign', breakdowns: 'device_platform,publisher_platform,publisher_position', fromDate, toDate, token: creds.creds.token }),
        ]);
        const ctx = { accountId: acct.id, campaignId: c.id, adSetId: null, platform: 'meta' as const };
        if (geo.ok) await upsertGeoRows(normalizeMetaGeoRows(geo.rows, ctx));
        if (demo.ok) await upsertDemoRows(normalizeMetaDemoRows(demo.rows, ctx));
        if (dev.ok) await upsertDeviceRows(normalizeMetaDeviceRows(dev.rows, ctx));
        summary.push({ campaignId: c.id, platform: 'meta', ok: geo.ok && demo.ok && dev.ok });
      } else if (c.platform === 'google') {
        if (!googleCredsRes.ok) { summary.push({ campaignId: c.id, platform: 'google', ok: false, error: googleCredsRes.error }); continue; }
        if (!googleTokRes?.ok) { summary.push({ campaignId: c.id, platform: 'google', ok: false, error: 'oauth_failed' }); continue; }
        const effectiveIds = googleEffectiveByAccount.get(acct.id) || [];
        if (effectiveIds.length === 0) { summary.push({ campaignId: c.id, platform: 'google', ok: false, error: 'no_effective_customer' }); continue; }
        const ctx = { accountId: acct.id, campaignId: c.id, adSetId: null, platform: 'google' as const };
        // For an MCC, only one child customer owns the campaign. Iterate
        // effective customers, upsert whichever returns rows, and stop on
        // the first non-empty response. For a leaf, this loop runs once.
        let geoOk = false, demoOk = false, devOk = false;
        let lastErr: string | null = null;
        for (const customerId of effectiveIds) {
          const [geo, demo, dev] = await Promise.all([
            fetchGoogleGeoView({ customerId, campaignId: c.external_id, fromDate, toDate, creds: googleCredsRes.creds, accessToken: googleTokRes.access_token }),
            fetchGoogleDemoView({ customerId, campaignId: c.external_id, fromDate, toDate, creds: googleCredsRes.creds, accessToken: googleTokRes.access_token }),
            fetchGoogleDeviceView({ customerId, campaignId: c.external_id, fromDate, toDate, creds: googleCredsRes.creds, accessToken: googleTokRes.access_token }),
          ]);
          if (geo.ok && geo.rows.length) { await upsertGeoRows(normalizeGoogleGeoRows(geo.rows, ctx)); geoOk = true; }
          if (demo.ok && (demo.gender.length || demo.ageRange.length)) { await upsertDemoRows(normalizeGoogleDemoRows({ gender: demo.gender, ageRange: demo.ageRange }, ctx)); demoOk = true; }
          if (dev.ok && dev.rows.length) { await upsertDeviceRows(normalizeGoogleDeviceRows(dev.rows, ctx)); devOk = true; }
          if (!geo.ok) lastErr = typeof geo.error === 'string' ? geo.error : JSON.stringify(geo.error).slice(0, 200);
          if (geoOk || demoOk || devOk) break;
        }
        summary.push({ campaignId: c.id, platform: 'google', ok: geoOk || demoOk || devOk, ...(geoOk || demoOk || devOk ? {} : { error: lastErr || 'no_rows_any_customer' }) });
      } else if (c.platform === 'tiktok') {
        const creds = await loadTikTokAppCredentials();
        if (!creds.ok) { summary.push({ campaignId: c.id, platform: 'tiktok', ok: false, error: creds.error }); continue; }
        const advertiserId = acct.external_id;
        const ctx = { accountId: acct.id, campaignId: c.id, adSetId: null, platform: 'tiktok' as const };
        const [geo, demo, dev] = await Promise.all([
          fetchTikTokIntegratedReport({ advertiserId, campaignIds: [c.external_id], dimensions: ['country_code'], fromDate, toDate, marketingToken: creds.creds.marketing_access_token }),
          fetchTikTokIntegratedReport({ advertiserId, campaignIds: [c.external_id], dimensions: ['age', 'gender'], fromDate, toDate, marketingToken: creds.creds.marketing_access_token }),
          fetchTikTokIntegratedReport({ advertiserId, campaignIds: [c.external_id], dimensions: ['placement'], fromDate, toDate, marketingToken: creds.creds.marketing_access_token }),
        ]);
        if (geo.ok) await upsertGeoRows(normalizeTikTokGeoRows(geo.rows, ctx));
        if (demo.ok) await upsertDemoRows(normalizeTikTokDemoRows(demo.rows, ctx));
        if (dev.ok) await upsertDeviceRows(normalizeTikTokDeviceRows(dev.rows, ctx));
        summary.push({ campaignId: c.id, platform: 'tiktok', ok: geo.ok && demo.ok && dev.ok });
      }
    } catch (e) {
      summary.push({ campaignId: c.id, platform: c.platform, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  await recordAudit({
    module: 'ads', action: 'breakdowns_cron',
    metadata: {
      fromDate, toDate,
      total: summary.length,
      failed: summary.filter(s => !s.ok).length,
      failures: summary.filter(s => !s.ok).map(s => ({ campaignId: s.campaignId, platform: s.platform, error: s.error || null })),
    },
  });

  return NextResponse.json({ ok: true, fromDate, toDate, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
