// src/app/api/auth/google-youtube/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') ?? '';
  const cookieCsrf = req.cookies.get('oauth_yt_state')?.value;

  const [stateCsrf, accountIdStr] = state.split('.');
  if (!code || !cookieCsrf || cookieCsrf !== stateCsrf || !/^\d+$/.test(accountIdStr ?? '')) {
    return NextResponse.json({ error: 'invalid_state' }, { status: 400 });
  }
  const accountId = Number(accountIdStr);

  // 1. Exchange code for tokens
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.limeinc.cc'}/api/auth/google-youtube/callback`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokenJson = await tokenRes.json() as {
    access_token?: string; refresh_token?: string; expires_in?: number; error?: string;
  };
  if (!tokenJson.access_token || !tokenJson.refresh_token) {
    return NextResponse.json({ error: 'token_exchange_failed', detail: tokenJson.error }, { status: 400 });
  }

  // 2. Capture channel info
  const chRes = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true',
    { headers: { Authorization: `Bearer ${tokenJson.access_token}` } }
  );
  const chJson = await chRes.json() as {
    items?: Array<{
      id: string;
      snippet?: { title?: string; customUrl?: string };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }>;
  };
  const ch = chJson.items?.[0];
  if (!ch) return NextResponse.json({ error: 'no_channel' }, { status: 400 });

  // 3. Write to ads_accounts
  const sb = supabaseAdmin();
  await sb.from('ads_accounts').update({
    youtube_channel_id: ch.id,
    youtube_channel_handle: ch.snippet?.customUrl ?? null,
    youtube_channel_name: ch.snippet?.title ?? null,
    youtube_refresh_token: encrypt(tokenJson.refresh_token),
    youtube_access_token: encrypt(tokenJson.access_token),
    youtube_access_token_expires_at: new Date(Date.now() + (tokenJson.expires_in ?? 3600) * 1000).toISOString(),
    youtube_uploads_playlist_id: ch.contentDetails?.relatedPlaylists?.uploads ?? null,
  }).eq('id', accountId);

  return NextResponse.redirect(new URL('/beithady/ads/accounts?connected=youtube', req.url));
}
