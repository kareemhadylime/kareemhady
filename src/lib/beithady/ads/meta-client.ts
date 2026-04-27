import 'server-only';
import { getCredential, getProviderEnabled } from '@/lib/credentials';

// Thin Meta Graph API v21 wrapper for the Phase H ads module. Reads
// credentials from `meta_marketing` provider. Returns structured
// {ok, data, error} so callers can decide whether to fall back to
// "draft" mode when credentials aren't configured yet.

const API_VERSION = 'v21.0';
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

export type MetaCredentials = {
  token: string;
  businessId: string;
  adAccountId: string;     // act_<numeric>
  fbPageId: string;
};

export async function loadMetaCredentials(): Promise<
  | { ok: true; creds: MetaCredentials }
  | { ok: false; error: string; missing: string[] }
> {
  const enabled = await getProviderEnabled('meta_marketing');
  if (!enabled) return { ok: false, error: 'meta_marketing_disabled', missing: [] };
  const [token, businessId, adAccountIdRaw, fbPageId] = await Promise.all([
    getCredential('meta_marketing', 'system_user_token'),
    getCredential('meta_marketing', 'business_id'),
    getCredential('meta_marketing', 'ad_account_id'),
    getCredential('meta_marketing', 'fb_page_id'),
  ]);
  const missing = [
    !token && 'system_user_token',
    !businessId && 'business_id',
    !adAccountIdRaw && 'ad_account_id',
    !fbPageId && 'fb_page_id',
  ].filter((x): x is string => !!x);
  if (missing.length) return { ok: false, error: 'missing_credentials', missing };
  const adAccountId = adAccountIdRaw.startsWith('act_') ? adAccountIdRaw : `act_${adAccountIdRaw}`;
  return { ok: true, creds: { token, businessId, adAccountId, fbPageId } };
}

export type GraphResult<T = unknown> =
  | { ok: true; data: T; raw: unknown }
  | { ok: false; status: number; error: string; raw: unknown };

export async function metaPost<T = unknown>(
  path: string,
  params: Record<string, unknown>,
  token: string
): Promise<GraphResult<T>> {
  const url = `${GRAPH}/${path}`;
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  body.append('access_token', token);
  try {
    const r = await fetch(url, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.error) {
      const errMsg = (j.error as { message?: string } | undefined)?.message || `http_${r.status}`;
      return { ok: false, status: r.status, error: errMsg, raw: j };
    }
    return { ok: true, data: j as T, raw: j };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, error: msg, raw: null };
  }
}

export async function metaGet<T = unknown>(path: string, token: string): Promise<GraphResult<T>> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${GRAPH}/${path}${sep}access_token=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.error) {
      const errMsg = (j.error as { message?: string } | undefined)?.message || `http_${r.status}`;
      return { ok: false, status: r.status, error: errMsg, raw: j };
    }
    return { ok: true, data: j as T, raw: j };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, error: msg, raw: null };
  }
}

// Probe — used by /admin/integrations to verify the token works.
export async function pingMetaMarketing(): Promise<
  | { ok: true; ad_account_name: string; pages_count: number }
  | { ok: false; error: string }
> {
  const c = await loadMetaCredentials();
  if (!c.ok) return { ok: false, error: c.error };
  const ad = await metaGet<{ name: string }>(`${c.creds.adAccountId}?fields=name,currency,timezone_name`, c.creds.token);
  if (!ad.ok) return { ok: false, error: `ad_account: ${ad.error}` };
  const pages = await metaGet<{ data: Array<{ id: string }> }>('me/accounts?fields=id,name&limit=100', c.creds.token);
  return {
    ok: true,
    ad_account_name: (ad.data as { name?: string }).name || c.creds.adAccountId,
    pages_count: pages.ok ? ((pages.data as { data?: unknown[] })?.data || []).length : 0,
  };
}
