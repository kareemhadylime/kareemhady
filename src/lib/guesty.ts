// Guesty Open API client for the PRO tier.
// Docs: https://open-api-docs.guesty.com
// Auth: OAuth 2.0 client_credentials. Token TTL 24h, no refresh token —
// re-hit /oauth2/token with the same client_id/secret on expiry.
// Rate limit on PRO: ~120 req/min per token (/listings + /calendar tighter
// at ~60/min). 429 responses include a Retry-After header.

const TOKEN_URL = 'https://open-api.guesty.com/oauth2/token';
const API_BASE = 'https://open-api.guesty.com/v1';

// Token cache — two-tier:
//   1. Module scope for warm-invocation reuse within a single Vercel
//      container.
//   2. Supabase `integration_tokens` table so cold starts don't keep
//      re-minting tokens on Guesty's tight OAuth rate limit.
// Guesty tokens live 24h; we refresh when < 5 min remaining.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const { getCredential } = await import('./credentials');
  const clientId = await getCredential('guesty', 'client_id', { required: true });
  const clientSecret = await getCredential('guesty', 'client_secret', { required: true });

  const now = Date.now();
  const FIVE_MIN = 5 * 60 * 1000;

  // 1. In-process cache
  if (cachedToken && cachedToken.expiresAt > now + FIVE_MIN) {
    return cachedToken.value;
  }

  // 2. Supabase cache — avoid per-cold-start OAuth hits. Lazy-imported
  //    so this module still works in contexts where supabase isn't set up.
  try {
    const { supabaseAdmin } = await import('./supabase');
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('integration_tokens')
      .select('access_token, expires_at')
      .eq('provider', 'guesty')
      .maybeSingle();
    if (data) {
      const expiresAtMs = new Date(
        (data as { expires_at: string }).expires_at
      ).getTime();
      if (expiresAtMs > now + FIVE_MIN) {
        cachedToken = {
          value: (data as { access_token: string }).access_token,
          expiresAt: expiresAtMs,
        };
        return cachedToken.value;
      }
    }
  } catch {
    // Supabase unreachable — fall through to fresh OAuth.
  }

  // 3. Fresh token
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'open-api',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `guesty_oauth_failed: ${res.status} ${res.statusText} — ${text.slice(0, 300)}`
    );
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };
  if (!json.access_token) {
    throw new Error('guesty_oauth_no_token');
  }

  const ttlSec = json.expires_in || 86400;
  const expiresAt = now + ttlSec * 1000;
  cachedToken = { value: json.access_token, expiresAt };

  // Persist for cold-start siblings
  try {
    const { supabaseAdmin } = await import('./supabase');
    const sb = supabaseAdmin();
    await sb.from('integration_tokens').upsert(
      {
        provider: 'guesty',
        access_token: json.access_token,
        expires_at: new Date(expiresAt).toISOString(),
        refreshed_at: new Date().toISOString(),
      },
      { onConflict: 'provider' }
    );
  } catch {
    // Not fatal — in-process cache still works.
  }

  return cachedToken.value;
}

type GuestyFetchOpts = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  /** Max 429 retries. Default 2. */
  retries?: number;
};

async function guestyFetch<T = unknown>(
  path: string,
  opts: GuestyFetchOpts = {}
): Promise<T> {
  const token = await getAccessToken();
  const method = opts.method || 'GET';

  const url = new URL(path.startsWith('http') ? path : `${API_BASE}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  const init: RequestInit = { method, headers };
  if (opts.body != null) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }

  const retries = opts.retries ?? 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, init);
    if (res.status === 429 && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after') || '2');
      await new Promise(r =>
        setTimeout(r, Math.max(1, Math.min(30, retryAfter)) * 1000)
      );
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      lastError = new Error(
        `guesty_${res.status}: ${method} ${path} — ${text.slice(0, 500)}`
      );
      // Don't retry 4xx (except 429 handled above).
      if (res.status >= 400 && res.status < 500) throw lastError;
      if (attempt < retries) continue;
      throw lastError;
    }
    return (await res.json()) as T;
  }
  throw lastError || new Error('guesty_fetch_exhausted');
}

// ---- Typed list helpers (thin; Guesty's schema is deep and varies per
// endpoint — return the raw JSON and let callers shape as needed for v1).

type GuestyListResponse<T> = {
  results: T[];
  count?: number;
  limit?: number;
  skip?: number;
  fields?: string;
};

export type GuestyListing = {
  _id: string;
  nickname?: string;
  title?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  accommodates?: number;
  active?: boolean;
  tags?: string[];
  listingType?: 'SINGLE' | 'MTL' | 'SLT' | string; // MTL = Multi-unit parent
  masterListingId?: string | null;
  address?: {
    full?: string;
    city?: string;
    country?: string;
  };
  customFields?: Array<{ fieldId: string; value: unknown }>;
  [k: string]: unknown;
};

export type GuestyReservation = {
  _id: string;
  confirmationCode?: string;
  source?: string; // "Airbnb" | "Booking.com" | "Direct" | ...
  status?: string; // "inquiry" | "reserved" | "confirmed" | "canceled" | ...
  listingId?: string;
  guest?: { fullName?: string; email?: string; phone?: string };
  checkInDateLocalized?: string; // property-tz wall date YYYY-MM-DD
  checkOutDateLocalized?: string;
  nightsCount?: number;
  guestsCount?: number;
  money?: {
    currency?: string;
    hostPayout?: number;
    guestPaid?: number;
    fareAccommodation?: number;
    cleaningFee?: number;
  };
  integration?: {
    platform?: string;
    confirmationCode?: string; // Airbnb HM-code
  };
  createdAt?: string; // UTC ISO
  updatedAt?: string;
  [k: string]: unknown;
};

export async function listGuestyReservations(params: {
  limit?: number;
  skip?: number;
  filters?: Record<string, unknown>;
  fields?: string;
  sort?: string;
} = {}): Promise<GuestyListResponse<GuestyReservation>> {
  const query: Record<string, string | number | undefined> = {
    limit: params.limit ?? 25,
    skip: params.skip ?? 0,
    sort: params.sort,
    fields: params.fields,
  };
  if (params.filters) {
    query.filters = JSON.stringify(params.filters);
  }
  return guestyFetch<GuestyListResponse<GuestyReservation>>('/reservations', {
    query,
  });
}

export async function listGuestyListings(params: {
  limit?: number;
  skip?: number;
  filters?: Record<string, unknown>;
  fields?: string;
} = {}): Promise<GuestyListResponse<GuestyListing>> {
  const query: Record<string, string | number | undefined> = {
    limit: params.limit ?? 25,
    skip: params.skip ?? 0,
    fields: params.fields,
  };
  if (params.filters) {
    query.filters = JSON.stringify(params.filters);
  }
  return guestyFetch<GuestyListResponse<GuestyListing>>('/listings', {
    query,
  });
}

export { guestyFetch, getAccessToken };
