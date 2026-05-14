import 'server-only';
import { getCredential, getProviderEnabled } from '@/lib/credentials';

// Google Ads API v24 client — OAuth refresh + GAQL search + mutate.
// Ports C:\Voltauto-pricing\supabase\functions\ads-google-sync + ads-google-publish
// into a single Next.js server module. Credentials come from
// integration_credentials.google_ads (or env fallback).
//
// Notes:
// - Bump GADS_API_VERSION roughly once a year; older versions return
//   404 HTML when retired (not a JSON error).
// - Search uses :searchStream which returns an array of chunks containing
//   .results[]. Mutate is a synchronous {operations: []} POST.
// - login_customer_id (MCC) is a separate header; required when the
//   token is bound to an MCC account.

const GADS_API_VERSION = 'v24';
const GADS_BASE = `https://googleads.googleapis.com/${GADS_API_VERSION}`;
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type GoogleAdsCredentials = {
  developer_token: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  login_customer_id: string;        // MCC, may be empty
};

// accountRefreshToken: per-account OAuth token from ads_accounts.google_refresh_token.
// Used as a fallback when integration_credentials doesn't carry the refresh_token
// (our accounts table is the authoritative store for per-account OAuth tokens).
export async function loadGoogleAdsCredentials(accountRefreshToken?: string | null): Promise<
  | { ok: true; creds: GoogleAdsCredentials }
  | { ok: false; error: string; missing: string[] }
> {
  const enabled = await getProviderEnabled('google_ads');
  if (!enabled) return { ok: false, error: 'google_ads_disabled', missing: [] };
  const [developer_token, client_id, client_secret, refresh_token_db, login_customer_id] = await Promise.all([
    getCredential('google_ads', 'developer_token'),
    getCredential('google_ads', 'client_id'),
    getCredential('google_ads', 'client_secret'),
    getCredential('google_ads', 'refresh_token'),
    getCredential('google_ads', 'login_customer_id'),
  ]);
  const refresh_token = refresh_token_db || accountRefreshToken || '';
  const missing = [
    !developer_token && 'developer_token',
    !client_id && 'client_id',
    !client_secret && 'client_secret',
    !refresh_token && 'refresh_token',
  ].filter((x): x is string => !!x);
  if (missing.length) return { ok: false, error: 'missing_credentials', missing };
  return { ok: true, creds: { developer_token, client_id, client_secret, refresh_token, login_customer_id } };
}

export async function getGoogleAccessToken(creds: GoogleAdsCredentials): Promise<
  | { ok: true; access_token: string }
  | { ok: false; error: string; raw?: unknown }
> {
  const body = new URLSearchParams();
  body.append('grant_type', 'refresh_token');
  body.append('client_id', creds.client_id);
  body.append('client_secret', creds.client_secret);
  body.append('refresh_token', creds.refresh_token);
  try {
    const r = await fetch(OAUTH_TOKEN_URL, { method: 'POST', body, signal: AbortSignal.timeout(30_000) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    const access = (j.access_token as string | undefined) || '';
    if (!r.ok || !access) return { ok: false, error: 'oauth_failed', raw: j };
    return { ok: true, access_token: access };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function gadsHeaders(creds: GoogleAdsCredentials, accessToken: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': creds.developer_token,
    'Content-Type': 'application/json',
  };
  if (creds.login_customer_id) h['login-customer-id'] = creds.login_customer_id.replace(/[^\d]/g, '');
  return h;
}

export type GaqlResult<T = Record<string, unknown>> =
  | { ok: true; rows: T[]; status: number }
  | { ok: false; status: number; error: unknown };

export async function gaqlSearch<T = Record<string, unknown>>(
  customerId: string,
  query: string,
  creds: GoogleAdsCredentials,
  accessToken: string
): Promise<GaqlResult<T>> {
  const cid = String(customerId).replace(/[^\d]/g, '');
  const url = `${GADS_BASE}/customers/${cid}/googleAds:searchStream`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: gadsHeaders(creds, accessToken),
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await r.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return { ok: false, status: r.status, error: { raw: text.slice(0, 500) } }; }
    if (!r.ok) return { ok: false, status: r.status, error: parsed };
    const chunks = Array.isArray(parsed) ? parsed : [parsed];
    const rows: T[] = [];
    for (const c of chunks as Array<{ results?: T[] }>) {
      if (c && Array.isArray(c.results)) rows.push(...c.results);
    }
    return { ok: true, rows, status: r.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export type MutateBody = { results?: Array<{ resourceName: string }> } & Record<string, unknown>;
export type MutateResult =
  | { ok: true; status: number; body: MutateBody }
  | { ok: false; status: number; body: unknown };

export async function gadsMutate(
  customerId: string,
  resource: string,
  operations: Array<Record<string, unknown>>,
  creds: GoogleAdsCredentials,
  accessToken: string
): Promise<MutateResult> {
  const cid = String(customerId).replace(/[^\d]/g, '');
  const url = `${GADS_BASE}/customers/${cid}/${resource}:mutate`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: gadsHeaders(creds, accessToken),
      body: JSON.stringify({ operations, partialFailure: false, validateOnly: false }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await r.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return { ok: false, status: r.status, body: { raw: text.slice(0, 1000) } }; }
    if (!r.ok) return { ok: false, status: r.status, body: parsed };
    return { ok: true, status: r.status, body: parsed as MutateBody };
  } catch (e) {
    return { ok: false, status: 0, body: { error: e instanceof Error ? e.message : String(e) } };
  }
}

// Ping — used by /admin/integrations to verify credentials work.
export async function pingGoogleAds(): Promise<
  | { ok: true; customer_descriptive_name: string | null; currency_code: string | null }
  | { ok: false; error: string }
> {
  const c = await loadGoogleAdsCredentials();
  if (!c.ok) return { ok: false, error: c.error };
  const tok = await getGoogleAccessToken(c.creds);
  if (!tok.ok) return { ok: false, error: tok.error };
  const customerId = c.creds.login_customer_id || '';
  if (!customerId) return { ok: false, error: 'no_login_customer_id_to_probe' };
  const q = 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1';
  const r = await gaqlSearch<{ customer: { id?: string; descriptiveName?: string; currencyCode?: string; timeZone?: string } }>(
    customerId, q, c.creds, tok.access_token
  );
  if (!r.ok) return { ok: false, error: 'gaql_failed' };
  const first = (r.rows[0] || { customer: {} }).customer || {};
  return {
    ok: true,
    customer_descriptive_name: first.descriptiveName || null,
    currency_code: first.currencyCode || null,
  };
}
