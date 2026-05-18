import { NextRequest, NextResponse } from 'next/server';
import { getCredential } from '@/lib/credentials';

// Kick off TikTok Marketing API OAuth. Distinct from the Login Kit flow at
// /api/auth/tiktok/start — Marketing API uses business-api.tiktok.com/portal/auth,
// no `scope` parameter (scopes are app-level, defined in the developer portal),
// and the credential set lives under provider `tiktok_business` (not `tiktok_ads`).
//
// Called from /beithady/ads/tiktok/accounts → "Authorize Marketing API" button.
// Query param: account_id (numeric ads_accounts.id) — round-trips via `state`.

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get('account_id') || '';
  if (!accountId.match(/^[0-9]+$/)) {
    return NextResponse.json({ error: 'account_id required' }, { status: 400 });
  }
  const appId = await getCredential('tiktok_business', 'app_id');
  if (!appId) {
    return NextResponse.redirect(
      new URL('/beithady/ads/tiktok/accounts?error=tiktok_business_app_id_not_set', req.url)
    );
  }
  const redirectUri = process.env.TIKTOK_BUSINESS_OAUTH_REDIRECT_URI
    || `${url.origin}/api/auth/tiktok-business/callback`;
  const authorizeUrl = `https://business-api.tiktok.com/portal/auth?app_id=${encodeURIComponent(appId)}&state=${encodeURIComponent(accountId)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  return NextResponse.redirect(authorizeUrl);
}
