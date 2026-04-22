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
