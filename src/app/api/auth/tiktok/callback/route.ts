import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exchangeTikTokOAuthCode, fetchTikTokUserInfo } from '@/lib/beithady/ads/tiktok-client';
import { encrypt } from '@/lib/crypto';

// TikTok OAuth callback. The connect-flow on /beithady/ads/tiktok/accounts
// kicks the user off to TikTok's authorize URL with `state=<ads_account_id>`
// (numeric). Here we exchange the code, persist refresh_token (encrypted)
// + open_id + username on the matching ads_accounts row.
//
// TikTok rotates refresh tokens — every subsequent call to refreshTikTokAccessToken
// stores the new rotated token automatically.

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  // TikTok developer portal verification (used for URL property verification).
  // Echoes a verification token back as plain text.
  const verifyToken = url.searchParams.get('tiktok_verify_token');
  if (verifyToken) {
    return new NextResponse(verifyToken, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const code = url.searchParams.get('code') || url.searchParams.get('auth_code') || '';
  const state = url.searchParams.get('state') || '';
  const error = url.searchParams.get('error') || '';

  if (error) {
    return NextResponse.redirect(
      new URL(`/beithady/ads/tiktok/accounts?error=${encodeURIComponent(error)}`, req.url)
    );
  }
  if (!code) {
    return NextResponse.redirect(
      new URL('/beithady/ads/tiktok/accounts?error=no_code', req.url)
    );
  }

  const accountId = Number(state.replace(/[^0-9]/g, ''));
  if (!Number.isFinite(accountId) || accountId <= 0) {
    return NextResponse.redirect(
      new URL('/beithady/ads/tiktok/accounts?error=bad_state', req.url)
    );
  }

  const redirectUri = process.env.TIKTOK_OAUTH_REDIRECT_URI
    || `${url.origin}/api/auth/tiktok/callback`;
  const ex = await exchangeTikTokOAuthCode(code, redirectUri);
  if (!ex.ok) {
    return NextResponse.redirect(
      new URL(`/beithady/ads/tiktok/accounts?error=${encodeURIComponent(ex.error)}`, req.url)
    );
  }

  // Optional: fetch user info so the row shows the @handle
  const info = await fetchTikTokUserInfo(ex.access_token);
  const userBlock = (info.body as { data?: { user?: { open_id?: string; username?: string; display_name?: string } } }).data?.user;
  const openId = userBlock?.open_id || ex.open_id || null;
  const username = userBlock?.username || null;

  const sb = supabaseAdmin();
  const now = Date.now();
  await sb.from('ads_accounts').update({
    tiktok_refresh_token: encrypt(ex.refresh_token),
    tiktok_open_id: openId,
    tiktok_username: username,
    tiktok_token_expires_at: ex.expires_in ? new Date(now + ex.expires_in * 1000).toISOString() : null,
    tiktok_refresh_expires_at: ex.refresh_expires_in ? new Date(now + ex.refresh_expires_in * 1000).toISOString() : null,
  }).eq('id', accountId);

  return NextResponse.redirect(
    new URL(`/beithady/ads/tiktok/accounts?connected=${encodeURIComponent(username || 'tiktok')}`, req.url)
  );
}
