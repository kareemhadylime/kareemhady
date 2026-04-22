import 'server-only';
import { supabaseAdmin } from './supabase';

// Dynamic credential resolver. All integrations should call getCredential()
// instead of reading process.env directly. Reads from
// integration_credentials.config first, then falls back to env vars for
// backward-compat during the migration.
//
// Per-cold-start cache — the admin UI calls invalidateCredentials() after
// a save so the next read picks up changes within the same warm instance.

export type ProviderId =
  | 'odoo'
  | 'pricelabs'
  | 'guesty'
  | 'shopify'
  | 'green'
  | 'airbnb';

export type CredentialSpec = {
  provider: ProviderId;
  label: string;
  description: string;
  helpUrl?: string;
  fields: Array<{
    key: string;
    label: string;
    envVar: string;          // legacy env var name for fallback
    type?: 'text' | 'password' | 'url';
    required?: boolean;
    placeholder?: string;
    hint?: string;
  }>;
  // Optional summary of 'live' state shown on the admin card.
  ping_path?: string;        // e.g. '/api/odoo/ping' — bearer-protected smoke test
};

export const CREDENTIAL_SPECS: Record<ProviderId, CredentialSpec> = {
  odoo: {
    provider: 'odoo',
    label: 'Odoo',
    description:
      'JSON-RPC access to fmplus.odoo.com for financial data (invoices, partners, accounts, move lines).',
    helpUrl:
      'https://www.odoo.com/documentation/18.0/developer/reference/external_api.html',
    fields: [
      {
        key: 'url',
        label: 'Base URL',
        envVar: 'ODOO_URL',
        type: 'url',
        required: true,
        placeholder: 'https://fmplus.odoo.com',
      },
      {
        key: 'db',
        label: 'Database',
        envVar: 'ODOO_DB',
        required: true,
        placeholder: 'fmplus-live-17577886',
        hint: 'Visible at {url}/web/database/list',
      },
      {
        key: 'user',
        label: 'Login email',
        envVar: 'ODOO_USER',
        required: true,
        placeholder: 'api-bot@fmplusme.com',
      },
      {
        key: 'api_key',
        label: 'API key',
        envVar: 'ODOO_API_KEY',
        type: 'password',
        required: true,
        hint: 'Profile → Account Security → New API Key',
      },
    ],
    ping_path: '/api/odoo/ping',
  },
  pricelabs: {
    provider: 'pricelabs',
    label: 'PriceLabs',
    description:
      'Dynamic pricing recommendations, occupancy forecasts, and channel-level metadata.',
    helpUrl: 'https://api.pricelabs.co',
    fields: [
      {
        key: 'api_key',
        label: 'API Key',
        envVar: 'PRICELABS_API_KEY',
        type: 'password',
        required: true,
        hint: 'Account → Profile → API',
      },
    ],
    ping_path: '/api/pricelabs/ping',
  },
  guesty: {
    provider: 'guesty',
    label: 'Guesty Open API',
    description:
      'OAuth2 client_credentials flow. Powers the Guesty mirror (listings + reservations) and enrichment overlay on Beithady email rules.',
    helpUrl: 'https://open-api-docs.guesty.com',
    fields: [
      {
        key: 'client_id',
        label: 'Client ID',
        envVar: 'GUESTY_CLIENT_ID',
        required: true,
      },
      {
        key: 'client_secret',
        label: 'Client Secret',
        envVar: 'GUESTY_CLIENT_SECRET',
        type: 'password',
        required: true,
      },
      {
        key: 'account_id',
        label: 'Account ID',
        envVar: 'GUESTY_ACCOUNT_ID',
        hint: 'Optional — auto-detected from API response on first call.',
      },
      {
        key: 'webhook_secret',
        label: 'Webhook Secret',
        envVar: 'GUESTY_WEBHOOK_SECRET',
        type: 'password',
        hint: 'HMAC-SHA256 key for /api/webhooks/guesty if configured.',
      },
    ],
    ping_path: '/api/guesty/ping',
  },
  shopify: {
    provider: 'shopify',
    label: 'Shopify (kika-swim-wear)',
    description:
      'OAuth install populates access_token in integration_tokens; OAuth app credentials live here. Optional legacy admin token overrides.',
    helpUrl: 'https://shopify.dev/docs/api/admin-rest',
    fields: [
      {
        key: 'store_domain',
        label: 'Store handle',
        envVar: 'SHOPIFY_STORE_DOMAIN',
        required: true,
        placeholder: 'kika-swim-wear',
        hint: 'Short handle; .myshopify.com appended automatically.',
      },
      {
        key: 'app_client_id',
        label: 'Dev Dashboard Client ID',
        envVar: 'SHOPIFY_APP_CLIENT_ID',
      },
      {
        key: 'app_client_secret',
        label: 'Dev Dashboard Client Secret',
        envVar: 'SHOPIFY_APP_CLIENT_SECRET',
        type: 'password',
        hint: 'Also used for webhook HMAC verification.',
      },
      {
        key: 'admin_access_token',
        label: 'Legacy Admin Token',
        envVar: 'SHOPIFY_ADMIN_ACCESS_TOKEN',
        type: 'password',
        hint: 'Optional. Only used when OAuth has not been completed.',
      },
    ],
    ping_path: '/api/shopify/ping',
  },
  green: {
    provider: 'green',
    label: 'Green-API (WhatsApp)',
    description:
      'WhatsApp gateway for Beithady guest messaging. Integration planned for Phase 12+; credentials stored for when it ships.',
    helpUrl: 'https://green-api.com',
    fields: [
      {
        key: 'id_instance',
        label: 'idInstance',
        envVar: 'GREENAPI_ID_INSTANCE',
        required: true,
      },
      {
        key: 'api_token_instance',
        label: 'apiTokenInstance',
        envVar: 'GREENAPI_API_TOKEN',
        type: 'password',
        required: true,
      },
      {
        key: 'webhook_secret_path',
        label: 'Webhook path slug',
        envVar: 'GREENAPI_WEBHOOK_SECRET_PATH',
        hint: 'Random slug appended to /api/webhooks/green/ (Green-API does NOT sign payloads — obscure path + IP allowlist are the defense).',
      },
    ],
  },
  airbnb: {
    provider: 'airbnb',
    label: 'Airbnb',
    description:
      'Airbnb has no open API — data flows via Guesty (bookings, guests, payouts). This form is a placeholder for Airbnb partner API credentials if Beithady ever receives Airbnb Partner API access.',
    fields: [
      {
        key: 'client_id',
        label: 'Partner API Client ID',
        envVar: 'AIRBNB_CLIENT_ID',
      },
      {
        key: 'client_secret',
        label: 'Partner API Client Secret',
        envVar: 'AIRBNB_CLIENT_SECRET',
        type: 'password',
      },
      {
        key: 'note',
        label: 'Note',
        envVar: 'AIRBNB_NOTE',
        hint: 'Airbnb reservations are sourced from Guesty today — no direct Airbnb API call is made anywhere in the app.',
      },
    ],
  },
};

// Module-scope cache. Cleared by invalidateCredentials() after a save,
// or expires after 5 minutes automatically (defensive in case another
// instance updates the DB while we're warm).
type CacheEntry = {
  config: Record<string, string>;
  enabled: boolean;
  loadedAt: number;
};
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<ProviderId, CacheEntry>();

export function invalidateCredentials(provider?: ProviderId): void {
  if (provider) cache.delete(provider);
  else cache.clear();
}

async function loadProvider(provider: ProviderId): Promise<CacheEntry> {
  const existing = cache.get(provider);
  if (existing && Date.now() - existing.loadedAt < CACHE_TTL_MS) return existing;

  const sb = supabaseAdmin();
  const { data } = await sb
    .from('integration_credentials')
    .select('config, enabled')
    .eq('provider', provider)
    .maybeSingle();

  const row = data as {
    config: Record<string, string> | null;
    enabled: boolean;
  } | null;
  const entry: CacheEntry = {
    config: (row?.config as Record<string, string>) || {},
    enabled: row ? row.enabled : true,
    loadedAt: Date.now(),
  };
  cache.set(provider, entry);
  return entry;
}

// Resolve a single credential field. DB wins, env var is the fallback so
// the pre-Phase-12 env-based deployments keep working mid-migration. Use
// `required: true` to throw when neither source provides a value.
export async function getCredential(
  provider: ProviderId,
  key: string,
  opts: { required?: boolean } = {}
): Promise<string> {
  const spec = CREDENTIAL_SPECS[provider];
  const fieldSpec = spec?.fields.find(f => f.key === key);
  const envVar = fieldSpec?.envVar;

  const entry = await loadProvider(provider);
  const fromDb = entry.config?.[key];
  if (fromDb && String(fromDb).trim().length > 0) return String(fromDb);

  const fromEnv = envVar ? (process.env[envVar] || '').trim() : '';
  if (fromEnv) return fromEnv;

  if (opts.required) {
    throw new Error(
      `${provider}.${key} not configured — set via /admin/integrations or env ${envVar || '(none)'}`
    );
  }
  return '';
}

export async function getProviderEnabled(provider: ProviderId): Promise<boolean> {
  const entry = await loadProvider(provider);
  return entry.enabled;
}

// Admin view — never returns secret values, just presence info.
export async function getProviderStatus(provider: ProviderId): Promise<{
  config_keys_set: string[];
  enabled: boolean;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
  has_env_fallback: string[];    // field keys that would fall back to env if DB empty
}> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('integration_credentials')
    .select(
      'config, enabled, last_tested_at, last_test_status, last_test_error'
    )
    .eq('provider', provider)
    .maybeSingle();
  const row = (data as {
    config: Record<string, string> | null;
    enabled: boolean;
    last_tested_at: string | null;
    last_test_status: string | null;
    last_test_error: string | null;
  } | null) || null;

  const cfg = (row?.config as Record<string, string>) || {};
  const configKeysSet = Object.keys(cfg).filter(
    k => cfg[k] && String(cfg[k]).trim().length > 0
  );
  const spec = CREDENTIAL_SPECS[provider];
  const hasEnvFallback: string[] = [];
  for (const f of spec?.fields || []) {
    const dbHasIt = configKeysSet.includes(f.key);
    const envHasIt = !!(f.envVar && (process.env[f.envVar] || '').trim());
    if (!dbHasIt && envHasIt) hasEnvFallback.push(f.key);
  }
  return {
    config_keys_set: configKeysSet,
    enabled: row ? row.enabled : false,
    last_tested_at: row?.last_tested_at || null,
    last_test_status: row?.last_test_status || null,
    last_test_error: row?.last_test_error || null,
    has_env_fallback: hasEnvFallback,
  };
}
