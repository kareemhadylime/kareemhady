import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exchangeTikTokBusinessAuthCode, fetchTikTokAdvertisers } from '@/lib/beithady/ads/tiktok-client';
import { invalidateCredentials } from '@/lib/credentials';

// TikTok Marketing API OAuth callback. The /beithady/ads/tiktok/accounts page
// fires /api/auth/tiktok-business/start?account_id=<id>, the user grants
// consent inside business-api.tiktok.com, then TikTok redirects here with
// ?auth_code=...&state=<account_id>.
//
// Stores access_token + advertiser_id in two places:
//   1. integration_credentials.tiktok_business.config — so the sync engine
//      (which calls loadTikTokBusinessCredentials() globally) picks it up.
//   2. ads_accounts.id={state}.tiktok_advertiser_id — so per-account sync
//      can route to the right advertiser.
//
// If TikTok returns multiple advertiser_ids, we redirect to a picker page
// (TODO — for now we just store the first one and surface the full list as
// a query param so the user can re-OAuth to switch later if needed).

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  // Optional: domain verification challenge (mirrors the Login Kit callback)
  const verifyToken = url.searchParams.get('tiktok_verify_token');
  if (verifyToken) {
    return new NextResponse(verifyToken, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const authCode = url.searchParams.get('auth_code') || url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const error = url.searchParams.get('error') || url.searchParams.get('error_description') || '';

  if (error) {
    return NextResponse.redirect(
      new URL(`/beithady/ads/tiktok/accounts?error=${encodeURIComponent(error)}`, req.url)
    );
  }
  if (!authCode) {
    return NextResponse.redirect(
      new URL('/beithady/ads/tiktok/accounts?error=no_auth_code', req.url)
    );
  }

  const accountId = Number(state.replace(/[^0-9]/g, ''));
  if (!Number.isFinite(accountId) || accountId <= 0) {
    return NextResponse.redirect(
      new URL('/beithady/ads/tiktok/accounts?error=bad_state', req.url)
    );
  }

  const ex = await exchangeTikTokBusinessAuthCode(authCode);
  if (!ex.ok) {
    const detail = ex.raw ? `${ex.error}: ${JSON.stringify(ex.raw).slice(0, 400)}` : ex.error;
    return NextResponse.redirect(
      new URL(`/beithady/ads/tiktok/accounts?error=${encodeURIComponent(detail)}`, req.url)
    );
  }

  // Resolve advertiser names so we can show a friendlier confirmation message.
  const advRes = await fetchTikTokAdvertisers(ex.access_token, ex.advertiser_ids);
  const advList = advRes.ok ? advRes.list : ex.advertiser_ids.map(id => ({ advertiser_id: id, advertiser_name: id, currency: '' }));
  const primary = advList[0];

  // Read existing config first so the upsert merges (preserves app_id + secret
  // that the admin pasted in /admin/integrations) rather than wiping them.
  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('integration_credentials')
    .select('config')
    .eq('provider', 'tiktok_business')
    .maybeSingle();
  const existingConfig = ((existing as { config?: Record<string, string> } | null)?.config) || {};

  await sb.from('integration_credentials').upsert(
    {
      provider: 'tiktok_business',
      config: {
        ...existingConfig,
        access_token: ex.access_token,
        advertiser_id: primary?.advertiser_id || existingConfig.advertiser_id || '',
      } as Record<string, string>,
      enabled: true,
      last_tested_at: new Date().toISOString(),
      last_test_status: 'ok',
      last_test_error: `OAuth complete — ${advList.length} advertiser(s) authorized`,
    },
    { onConflict: 'provider', ignoreDuplicates: false }
  );

  invalidateCredentials('tiktok_business');

  // Also stamp the chosen ads_accounts row so per-account sync works.
  if (primary?.advertiser_id) {
    await sb.from('ads_accounts').update({
      tiktok_advertiser_id: primary.advertiser_id,
    }).eq('id', accountId);
  }

  const okMsg = primary
    ? `${primary.advertiser_name || primary.advertiser_id} (${advList.length} advertiser${advList.length === 1 ? '' : 's'})`
    : 'no advertisers returned';
  return NextResponse.redirect(
    new URL(`/beithady/ads/tiktok/accounts?marketing_connected=${encodeURIComponent(okMsg)}`, req.url)
  );
}
