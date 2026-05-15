// src/lib/beithady/youtube/youtube-client.ts
import { supabaseAdmin } from '@/lib/supabase';
import { encrypt, decrypt } from '@/lib/crypto';
import { YouTubeAuthError } from './types';

export function unwrapStoredRefreshToken(stored: string | null): string {
  if (!stored) return '';
  try {
    return decrypt(stored);
  } catch {
    return stored;
  }
}

type AccountRow = {
  id: number;
  youtube_refresh_token: string | null;
  youtube_access_token: string | null;
  youtube_access_token_expires_at: string | null;
};

async function loadAccount(accountId: number): Promise<AccountRow> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('ads_accounts')
    .select('id, youtube_refresh_token, youtube_access_token, youtube_access_token_expires_at')
    .eq('id', accountId)
    .single();
  if (error || !data) throw new YouTubeAuthError('no_token');
  return data as AccountRow;
}

async function clearDeadToken(accountId: number): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from('ads_accounts').update({
    youtube_refresh_token: null,
    youtube_access_token: null,
    youtube_access_token_expires_at: null,
  }).eq('id', accountId);
}

async function updateTokens(
  accountId: number,
  accessToken: string,
  refreshToken: string | undefined,
  expiresInSec: number,
): Promise<void> {
  const sb = supabaseAdmin();
  const update: Record<string, unknown> = {
    youtube_access_token: encrypt(accessToken),
    youtube_access_token_expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
  };
  if (refreshToken) {
    update.youtube_refresh_token = encrypt(refreshToken);
  }
  await sb.from('ads_accounts').update(update).eq('id', accountId);
}

export async function getYouTubeAccessToken(accountId: number): Promise<string> {
  const row = await loadAccount(accountId);

  // 1. Cached access token still valid? Skip refresh.
  if (row.youtube_access_token && row.youtube_access_token_expires_at) {
    const exp = new Date(row.youtube_access_token_expires_at);
    if (exp.getTime() > Date.now() + 60_000) {
      try { return decrypt(row.youtube_access_token); } catch { /* fall through to refresh */ }
    }
  }

  if (!row.youtube_refresh_token) throw new YouTubeAuthError('no_token');

  // 2. Refresh.
  const refresh = unwrapStoredRefreshToken(row.youtube_refresh_token);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };

  if (json.error === 'invalid_grant' || !json.access_token) {
    await clearDeadToken(accountId);
    throw new YouTubeAuthError('refresh_failed');
  }

  await updateTokens(accountId, json.access_token, json.refresh_token, json.expires_in ?? 3600);
  return json.access_token;
}
