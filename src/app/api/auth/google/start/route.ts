import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthUrl } from '@/lib/gmail';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const domainParam = (url.searchParams.get('domain') ?? '').trim();
  // The cookie stores the CSRF token only. The OAuth state shipped to
  // Google is `${csrf}.${domain}` so the callback can reconstruct
  // domain-tagging intent without trusting any other input.
  const csrf = crypto.randomBytes(16).toString('hex');
  const state = `${csrf}.${domainParam}`;
  // Derive redirect URI from the actual request host so the cookie
  // (set on this host) and the eventual callback (which Google sends
  // to redirect_uri) land on the same origin. Every host used must be
  // registered as an Authorized redirect URI in Google Cloud Console.
  const redirectUri = `${url.origin}/api/auth/google/callback`;
  const oauthUrl = getAuthUrl(state, redirectUri);
  const res = NextResponse.redirect(oauthUrl);
  res.cookies.set('oauth_state', csrf, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}
