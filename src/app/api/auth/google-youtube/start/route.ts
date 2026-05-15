// src/app/api/auth/google-youtube/start/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const accountIdParam = (url.searchParams.get('account_id') ?? '').trim();
  if (!/^\d+$/.test(accountIdParam)) {
    return NextResponse.json({ error: 'missing_account_id' }, { status: 400 });
  }

  const csrf = crypto.randomBytes(16).toString('hex');
  const state = `${csrf}.${accountIdParam}`;

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.limeinc.cc'}/api/auth/google-youtube/callback`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('state', state);

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set('oauth_yt_state', csrf, {
    httpOnly: true,
    secure: req.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}
