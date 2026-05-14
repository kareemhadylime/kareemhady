import 'server-only';
import { getCredential } from './credentials';
import type { ProviderId } from './credentials';

// Per-provider live connection tests. Each function does the smallest
// credentialed API call that would fail loudly if any required field is
// wrong, and returns a normalized { ok, detail?, error? } shape. Results
// are persisted into integration_credentials.last_test_* by the caller
// (testCredentialAction in the integrations admin actions).

export type TestResult = { ok: true; detail?: string } | { ok: false; error: string };

export async function testProvider(provider: ProviderId): Promise<TestResult> {
  try {
    switch (provider) {
      case 'odoo':
        return await testOdoo();
      case 'pricelabs':
        return await testPricelabs();
      case 'guesty':
        return await testGuesty();
      case 'shopify':
        return await testShopify();
      case 'green':
        return await testGreen();
      case 'airbnb':
        return {
          ok: true,
          detail:
            'No direct Airbnb API — reservation + payout data flows via Guesty. Nothing to test here.',
        };
      case 'scrapingbee':
        return await testScrapingBee();
      case 'tiktok_ads':
        return await testTikTokAds();
      case 'google_ads':
      case 'meta_marketing':
      case 'meta_waba':
        return { ok: true, detail: `${provider} credentials stored — no live ping implemented` };
      default:
        return { ok: false, error: `unknown_provider:${provider}` };
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// --- Individual implementations ---

async function testOdoo(): Promise<TestResult> {
  const { odooVersion, odooSearchCount } = await import('./odoo');
  const [version, posted] = await Promise.all([
    odooVersion(),
    odooSearchCount('account.move', [
      ['move_type', 'in', ['out_invoice', 'in_invoice']],
      ['state', '=', 'posted'],
    ]),
  ]);
  return {
    ok: true,
    detail: `Odoo ${version.server_serie || version.server_version} · ${posted} posted invoices`,
  };
}

async function testPricelabs(): Promise<TestResult> {
  const { pricelabsFetch } = await import('./pricelabs');
  const res = await pricelabsFetch<{ listings?: unknown[] } | unknown[]>(
    '/v1/listings',
    { retries: 0 }
  );
  const count = Array.isArray(res)
    ? res.length
    : Array.isArray((res as { listings?: unknown[] })?.listings)
      ? (res as { listings: unknown[] }).listings.length
      : null;
  return {
    ok: true,
    detail:
      count != null
        ? `Reached /v1/listings (${count} listing${count === 1 ? '' : 's'} visible)`
        : 'Reached /v1/listings',
  };
}

async function testGuesty(): Promise<TestResult> {
  const { getAccessToken } = await import('./guesty');
  const token = await getAccessToken();
  if (!token) return { ok: false, error: 'token exchange returned empty' };
  // Real authenticated call so we confirm the token works, not just that
  // credentials exchange succeeded.
  const res = await fetch('https://open-api.guesty.com/v1/listings?limit=1', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      ok: false,
      error: `GET /v1/listings → ${res.status} ${body.slice(0, 200)}`,
    };
  }
  const json = (await res.json().catch(() => null)) as {
    count?: number;
    results?: unknown[];
  } | null;
  const count = json?.count ?? json?.results?.length ?? null;
  return {
    ok: true,
    detail:
      count != null
        ? `Authenticated · ${count} listing${count === 1 ? '' : 's'} in scope`
        : 'Authenticated',
  };
}

async function testShopify(): Promise<TestResult> {
  const { getShopifyShop } = await import('./shopify');
  const shop = await getShopifyShop();
  if (!shop || !shop.domain) {
    return { ok: false, error: 'shop.json returned no domain' };
  }
  return {
    ok: true,
    detail: `${shop.name || shop.domain} · ${shop.currency || '?'} · ${shop.plan_name || 'unknown plan'}`,
  };
}

// Green-API: the canonical health probe is getStateInstance which returns
// { stateInstance: 'authorized' | 'notAuthorized' | 'blocked' | 'sleepMode' | 'starting' }.
// Anything other than 'authorized' means credentials are correct but the
// WhatsApp session is unhealthy — we surface that distinction.
async function testGreen(): Promise<TestResult> {
  const apiUrl = (await getCredential('green', 'apiUrl', { required: true })).replace(
    /\/+$/,
    ''
  );
  const idInstance = await getCredential('green', 'idInstance', { required: true });
  const apiTokenInstance = await getCredential('green', 'apiTokenInstance', {
    required: true,
  });

  const url = `${apiUrl}/waInstance${idInstance}/getStateInstance/${apiTokenInstance}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      ok: false,
      error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
    };
  }
  const json = (await res.json().catch(() => null)) as {
    stateInstance?: string;
  } | null;
  const state = json?.stateInstance || 'unknown';
  if (state === 'authorized') {
    return { ok: true, detail: `stateInstance=authorized` };
  }
  return {
    ok: false,
    error: `stateInstance=${state} — credentials reached Green-API but the WhatsApp session is not authorized. Re-link in the console.`,
  };
}

// --- TikTok Ads / Content Posting ---
// With only app_id + secret (no access token yet) we can't make a real API
// call. Verify credentials are loaded and surface what's missing.
async function testTikTokAds(): Promise<TestResult> {
  const { loadTikTokAppCredentials } = await import('./beithady/ads/tiktok-client');
  const credsRes = await loadTikTokAppCredentials();
  if (!credsRes.ok) return { ok: false, error: `${credsRes.error}${credsRes.missing?.length ? ` (missing: ${credsRes.missing.join(', ')})` : ''}` };
  const { creds } = credsRes;
  if (creds.marketing_access_token) {
    // Verify the marketing (Business API) token is valid
    const res = await fetch(`https://business-api.tiktok.com/open_api/v1.3/user/info/`, {
      headers: { 'Access-Token': creds.marketing_access_token, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const j = await res.json().catch(() => null) as { code?: number; message?: string; data?: { display_name?: string } } | null;
    if (j?.code === 0) return { ok: true, detail: `Authenticated · ${j.data?.display_name || 'app_id: ' + creds.app_id}` };
    return { ok: false, error: `Business API → code ${j?.code}: ${j?.message || 'unknown'}` };
  }
  return { ok: true, detail: `app_id set · no access token yet — complete OAuth to enable posting` };
}

// --- ScrapingBee ---
// Hits ScrapingBee's /usage endpoint to verify the API key works and surface
// remaining credits. Cheap (1 credit, may even be free depending on plan).
async function testScrapingBee(): Promise<TestResult> {
  const apiKey = await getCredential('scrapingbee', 'api_key', { required: true });
  const url = `https://app.scrapingbee.com/api/v1/usage?api_key=${encodeURIComponent(apiKey)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        error: `ScrapingBee returned HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`,
      };
    }
    const json = (await res.json().catch(() => null)) as
      | { max_api_credit?: number; used_api_credit?: number; concurrency_limit?: number }
      | null;
    if (!json) return { ok: false, error: 'ScrapingBee usage endpoint returned non-JSON' };
    const max = json.max_api_credit ?? 0;
    const used = json.used_api_credit ?? 0;
    const remaining = Math.max(0, max - used);
    const concurrencyPart = json.concurrency_limit
      ? ` · concurrency ${json.concurrency_limit}`
      : '';
    return {
      ok: true,
      detail: `${remaining.toLocaleString()} of ${max.toLocaleString()} credits remaining${concurrencyPart}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
