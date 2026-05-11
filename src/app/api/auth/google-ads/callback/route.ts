import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCredential } from '@/lib/credentials';
import { encrypt } from '@/lib/crypto';

// Google Ads API OAuth callback. Distinct from the Gmail OAuth callback
// (which writes to `accounts.oauth_refresh_token_encrypted`) because Google
// Ads creds are stored per ads_accounts row OR globally in
// integration_credentials.google_ads.refresh_token.
//
// State format: `<csrf>.<scope>` where scope = 'global' | <ads_accounts.id>
//   - global → updates integration_credentials.google_ads.refresh_token
//   - <id>   → updates ads_accounts.google_refresh_token for that row

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const cookieState = req.cookies.get('google_ads_oauth_state')?.value;

  const dotIdx = state.indexOf('.');
  const csrf = dotIdx === -1 ? state : state.slice(0, dotIdx);
  const scope = dotIdx === -1 ? 'global' : state.slice(dotIdx + 1);

  if (!code || !csrf || csrf !== cookieState) {
    return NextResponse.redirect(new URL('/admin/integrations?google_ads=invalid_state', req.url));
  }

  const clientId = await getCredential('google_ads', 'client_id');
  const clientSecret = await getCredential('google_ads', 'client_secret');
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/admin/integrations?google_ads=missing_app_creds', req.url));
  }

  const redirectUri = process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI
    || `${url.origin}/api/auth/google-ads/callback`;

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  const refresh = (j.refresh_token as string) || '';
  if (!refresh) {
    return NextResponse.redirect(
      new URL(`/admin/integrations?google_ads=no_refresh_token`, req.url)
    );
  }

  const sb = supabaseAdmin();
  if (scope === 'global') {
    // Upsert into integration_credentials.google_ads.config.refresh_token
    const { data: existing } = await sb
      .from('integration_credentials')
      .select('config')
      .eq('provider', 'google_ads')
      .maybeSingle();
    const oldConfig = ((existing as { config?: Record<string, string> } | null)?.config) || {};
    const newConfig = { ...oldConfig, refresh_token: refresh };
    await sb.from('integration_credentials').upsert(
      { provider: 'google_ads', config: newConfig, enabled: true },
      { onConflict: 'provider' }
    );
    return NextResponse.redirect(new URL('/admin/integrations?google_ads=connected', req.url));
  }

  const accountId = Number(scope);
  if (!Number.isFinite(accountId) || accountId <= 0) {
    return NextResponse.redirect(new URL('/admin/integrations?google_ads=bad_state', req.url));
  }
  await sb.from('ads_accounts').update({
    google_refresh_token: encrypt(refresh),
  }).eq('id', accountId);

  return NextResponse.redirect(
    new URL(`/beithady/ads/google/accounts?connected=${accountId}`, req.url)
  );
}
