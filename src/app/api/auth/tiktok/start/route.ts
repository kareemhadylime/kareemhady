import { NextRequest, NextResponse } from 'next/server';
import { getCredential } from '@/lib/credentials';

// Kick off TikTok OAuth — redirects to TikTok's authorize URL.
// Called from /beithady/ads/tiktok/accounts via a "Connect" button.
// Query param: account_id (numeric ads_accounts.id)

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get('account_id') || '';
  if (!accountId.match(/^[0-9]+$/)) {
    return NextResponse.json({ error: 'account_id required' }, { status: 400 });
  }
  const clientKey = await getCredential('tiktok_ads', 'app_id');
  if (!clientKey) {
    return NextResponse.json({ error: 'tiktok_app_id_not_set' }, { status: 500 });
  }
  const redirectUri = process.env.TIKTOK_OAUTH_REDIRECT_URI
    || `${url.origin}/api/auth/tiktok/callback`;
  const scope = 'user.info.basic,video.publish,video.upload';
  const authorizeUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(clientKey)}&scope=${encodeURIComponent(scope)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${accountId}`;
  return NextResponse.redirect(authorizeUrl);
}
