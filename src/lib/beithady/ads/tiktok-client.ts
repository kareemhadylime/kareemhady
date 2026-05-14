import 'server-only';
import { getCredential, getProviderEnabled } from '@/lib/credentials';
import { supabaseAdmin } from '@/lib/supabase';

// TikTok Open API v2 (organic Content Posting + OAuth) + TikTok Business API v1.3 (paid ads).
// Two different bases; one credential set for the app, plus per-account
// (advertiser-scoped) refresh tokens persisted on ads_accounts.

export const TT_OPEN_BASE = 'https://open.tiktokapis.com';
export const TT_BIZ_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

// App-level credentials (TIKTOK_APP_ID + secret + access_token + advertiser_id).
// access_token here is the long-lived Business Center token used for the
// Marketing API (paid ads). Refresh tokens for the Content Posting API
// (organic) are stored per ads_accounts row.
export type TikTokAppCredentials = {
  app_id: string;
  secret: string;
  marketing_access_token: string;   // BC long-lived (paid ads)
  default_advertiser_id: string;    // optional default
};

export async function loadTikTokAppCredentials(): Promise<
  | { ok: true; creds: TikTokAppCredentials }
  | { ok: false; error: string; missing: string[] }
> {
  const enabled = await getProviderEnabled('tiktok_ads');
  if (!enabled) return { ok: false, error: 'tiktok_ads_disabled', missing: [] };
  const [app_id, secret, marketing_access_token, default_advertiser_id] = await Promise.all([
    getCredential('tiktok_ads', 'app_id'),
    getCredential('tiktok_ads', 'secret'),
    getCredential('tiktok_ads', 'access_token'),
    getCredential('tiktok_ads', 'advertiser_id'),
  ]);
  const missing = [
    !app_id && 'app_id',
    !secret && 'secret',
  ].filter((x): x is string => !!x);
  if (missing.length) return { ok: false, error: 'missing_credentials', missing };
  return { ok: true, creds: { app_id, secret, marketing_access_token, default_advertiser_id } };
}

// Refresh a per-account TikTok access token (organic Content Posting API).
// Rotates the stored refresh token + expiry on success.
export async function refreshTikTokAccessToken(
  accountId: number,
  refreshToken: string
): Promise<
  | { ok: true; access_token: string }
  | { ok: false; error: string; raw?: unknown }
> {
  const credsRes = await loadTikTokAppCredentials();
  if (!credsRes.ok) return { ok: false, error: credsRes.error };
  const body = new URLSearchParams({
    client_key: credsRes.creds.app_id,
    client_secret: credsRes.creds.secret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  try {
    const r = await fetch(`${TT_OPEN_BASE}/v2/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.error) {
      // If TikTok says the refresh token itself is dead, clear it from the DB
      // so the UI can surface a Reconnect link instead of repeatedly retrying
      // with a stale token. (Refresh tokens rotate on every successful call;
      // a lost-race or failed-write leaves us holding an invalidated token.)
      const errCode = String(j.error || '');
      if (errCode === 'invalid_grant' || errCode === 'invalid_token') {
        const sb = supabaseAdmin();
        await sb.from('ads_accounts').update({
          tiktok_refresh_token: null,
          tiktok_token_expires_at: null,
          tiktok_refresh_expires_at: null,
        }).eq('id', accountId);
        console.warn('[tiktok] cleared dead refresh_token on account', { accountId, errCode, raw: j });
      }
      return { ok: false, error: 'refresh_failed', raw: j };
    }
    const access = String(j.access_token || '');
    if (!access) return { ok: false, error: 'no_access_token', raw: j };

    const now = Date.now();
    const accExpAt = j.expires_in ? new Date(now + Number(j.expires_in) * 1000).toISOString() : null;
    const refExpAt = j.refresh_expires_in ? new Date(now + Number(j.refresh_expires_in) * 1000).toISOString() : null;
    const sb = supabaseAdmin();
    await sb.from('ads_accounts').update({
      tiktok_refresh_token: (j.refresh_token as string) || refreshToken,
      tiktok_token_expires_at: accExpAt,
      tiktok_refresh_expires_at: refExpAt,
      tiktok_open_id: (j.open_id as string) || undefined,
    }).eq('id', accountId);

    return { ok: true, access_token: access };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Exchange OAuth authorization_code for refresh + access tokens.
// Used by the /api/auth/tiktok/callback route after the user grants consent.
export async function exchangeTikTokOAuthCode(
  code: string,
  redirectUri: string
): Promise<
  | {
      ok: true;
      access_token: string;
      refresh_token: string;
      open_id: string | null;
      expires_in: number | null;
      refresh_expires_in: number | null;
    }
  | { ok: false; error: string; raw?: unknown }
> {
  const credsRes = await loadTikTokAppCredentials();
  if (!credsRes.ok) return { ok: false, error: credsRes.error };
  const body = new URLSearchParams({
    client_key: credsRes.creds.app_id,
    client_secret: credsRes.creds.secret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  try {
    const r = await fetch(`${TT_OPEN_BASE}/v2/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.error) return { ok: false, error: 'oauth_exchange_failed', raw: j };
    const access = String(j.access_token || '');
    const refresh = String(j.refresh_token || '');
    if (!access || !refresh) return { ok: false, error: 'missing_tokens', raw: j };
    return {
      ok: true,
      access_token: access,
      refresh_token: refresh,
      open_id: (j.open_id as string) || null,
      expires_in: j.expires_in ? Number(j.expires_in) : null,
      refresh_expires_in: j.refresh_expires_in ? Number(j.refresh_expires_in) : null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Open API (organic) — Bearer auth, JSON body. Used for /v2/post/publish/*
export async function ttOpenPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  accessToken: string
): Promise<{ ok: boolean; status: number; body: T | Record<string, unknown> }> {
  try {
    const r = await fetch(`${TT_OPEN_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    const errCode = (j.error as { code?: string } | undefined)?.code;
    const ok = r.ok && (!errCode || errCode === 'ok');
    return { ok, status: r.status, body: j as T };
  } catch (e) {
    return { ok: false, status: 0, body: { error: e instanceof Error ? e.message : String(e) } };
  }
}

export async function ttOpenGet(
  path: string,
  accessToken: string
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  try {
    const sep = path.includes('?') ? '&' : '?';
    const r = await fetch(`${TT_OPEN_BASE}${path}${sep}_=${Date.now()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    const errCode = (j.error as { code?: string } | undefined)?.code;
    const ok = r.ok && (!errCode || errCode === 'ok');
    return { ok, status: r.status, body: j };
  } catch (e) {
    return { ok: false, status: 0, body: { error: e instanceof Error ? e.message : String(e) } };
  }
}

// Business API (paid) — Access-Token header (NOT Bearer)
export async function ttBizPost(
  path: string,
  body: Record<string, unknown> | null,
  marketingToken: string
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  try {
    const opts: RequestInit = {
      method: 'POST',
      headers: { 'Access-Token': marketingToken, 'Content-Type': 'application/json' },
    };
    if (body !== null) opts.body = JSON.stringify(body);
    const r = await fetch(`${TT_BIZ_BASE}${path}`, { ...opts, signal: AbortSignal.timeout(60_000) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    const code = j.code as number | undefined;
    const ok = r.ok && (code === 0 || code === undefined);
    return { ok, status: r.status, body: j };
  } catch (e) {
    return { ok: false, status: 0, body: { error: e instanceof Error ? e.message : String(e) } };
  }
}

export async function ttBizGet(
  path: string,
  marketingToken: string
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  try {
    const r = await fetch(`${TT_BIZ_BASE}${path}`, {
      headers: { 'Access-Token': marketingToken, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    const code = j.code as number | undefined;
    const ok = r.ok && (code === 0 || code === undefined);
    return { ok, status: r.status, body: j };
  } catch (e) {
    return { ok: false, status: 0, body: { error: e instanceof Error ? e.message : String(e) } };
  }
}

// Fetch TikTok user info — used to populate open_id + username after OAuth.
export async function fetchTikTokUserInfo(
  accessToken: string
): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const r = await ttOpenGet('/v2/user/info/?fields=open_id,union_id,display_name,username,avatar_url', accessToken);
  return r;
}

// Map TikTok primary_status → our DB convention.
export function tikTokStatusToOurs(s: string | null | undefined): string | null {
  if (!s) return null;
  if (s === 'STATUS_ENABLE' || s === 'ENABLE' || s === 'ACTIVE') return 'ACTIVE';
  if (s === 'STATUS_DISABLE' || s === 'DISABLE' || s === 'PAUSED') return 'PAUSED';
  return s;
}

// TikTok age_groups buckets ↔ age range.
export function ageGroupsFor(min: number, max: number): string[] {
  const buckets = [
    { code: 'AGE_13_17', lo: 13, hi: 17 },
    { code: 'AGE_18_24', lo: 18, hi: 24 },
    { code: 'AGE_25_34', lo: 25, hi: 34 },
    { code: 'AGE_35_44', lo: 35, hi: 44 },
    { code: 'AGE_45_54', lo: 45, hi: 54 },
    { code: 'AGE_55_100', lo: 55, hi: 100 },
  ];
  return buckets.filter(b => b.hi >= min && b.lo <= max).map(b => b.code);
}

// Build TikTok title (caption + hashtags, capped at 2200 chars)
export function buildTikTokTitle(caption?: string, hashtags?: string[]): string {
  const tags = (hashtags || [])
    .map(t => (t || '').trim())
    .filter(Boolean)
    .map(t => (t.startsWith('#') ? t : `#${t}`));
  const tagBlock = tags.length ? '\n\n' + tags.join(' ') : '';
  return ((caption || '').trim() + tagBlock).slice(0, 2200);
}
