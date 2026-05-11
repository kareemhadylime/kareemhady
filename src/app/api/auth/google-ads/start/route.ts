import { NextRequest, NextResponse } from 'next/server';
import { getCredential } from '@/lib/credentials';
import { randomBytes } from 'node:crypto';

// Kick off Google Ads OAuth. CSRF token stored as cookie + state.
// Query: scope = 'global' (default) | <ads_accounts.id>

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const scope = url.searchParams.get('scope') || 'global';
  const clientId = await getCredential('google_ads', 'client_id');
  if (!clientId) {
    return NextResponse.json({ error: 'google_ads_client_id_not_set' }, { status: 500 });
  }
  const redirectUri = process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI
    || `${url.origin}/api/auth/google-ads/callback`;
  const csrf = randomBytes(16).toString('hex');
  const state = `${csrf}.${scope}`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/adwords',
    access_type: 'offline',
    prompt: 'consent',                 // ensures refresh_token is returned
    state,
  });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set('google_ads_oauth_state', csrf, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
