// PriceLabs API client.
// Docs: https://api.pricelabs.co/v1 (REST, no official Node SDK).
// Auth: X-API-Key header. Generate in Account → Profile → API.
// Rate limit: ~60 req/min per key; /listing_prices is per-listing so
//   serialize with 1s spacing when looping across many listings.
// No webhooks as of 2026 — pull-only. Plan a daily cron after PriceLabs'
//   ~03:00 UTC internal nightly recalc (04:30+ UTC is a safe window).

const API_BASE = 'https://api.pricelabs.co/v1';

type PriceLabsFetchOpts = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  /** Max 429/5xx retries. Default 2. */
  retries?: number;
};

async function pricelabsFetch<T = unknown>(
  path: string,
  opts: PriceLabsFetchOpts = {}
): Promise<T> {
  const key = process.env.PRICELABS_API_KEY;
  if (!key) {
    throw new Error('PRICELABS_API_KEY must be set in env');
  }

  const url = new URL(path.startsWith('http') ? path : `${API_BASE}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
  }

  const method = opts.method || 'GET';
  const headers: Record<string, string> = {
    'X-API-Key': key,
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
    // 429 or 5xx — honor Retry-After if present (PriceLabs sends seconds).
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after') || '2');
      await new Promise(r =>
        setTimeout(r, Math.max(1, Math.min(30, retryAfter)) * 1000)
      );
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const reqId = res.headers.get('x-request-id') || '';
      lastError = new Error(
        `pricelabs_${res.status}: ${method} ${path} — ${text.slice(0, 300)}${
          reqId ? ` (request-id: ${reqId})` : ''
        }`
      );
      if (res.status >= 400 && res.status < 500) throw lastError; // 4xx — don't retry
      if (attempt < retries) continue;
      throw lastError;
    }
    // PriceLabs sometimes returns empty body on 200 when there's no data;
    // tolerate it rather than choke JSON.parse.
    const text = await res.text();
    if (!text) return null as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `pricelabs_invalid_json: ${method} ${path} — ${text.slice(0, 200)}`
      );
    }
  }
  throw lastError || new Error('pricelabs_fetch_exhausted');
}

// ---- Typed shapes (partial; PriceLabs responses vary per PMS). ----

export type PriceLabsListing = {
  id: string;
  name?: string;
  pms?: string;               // 'guesty' | 'airbnb' | ...
  pms_reference_id?: string;  // joins to the PMS's listing ID (e.g. Guesty _id)
  no_of_bedrooms?: number;
  currency?: string;
  min_stay?: number;
  push_enabled?: boolean;
  market?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  occupancy_based_rates?: boolean;
  base_price?: number;
  min_price?: number;
  max_price?: number;
  [k: string]: unknown;
};

export type PriceLabsListingPrice = {
  date: string;              // YYYY-MM-DD
  price?: number;            // current pushed price
  recommended_rate?: number; // PriceLabs' suggestion
  min_stay?: number;
  reason?: string;
  booking_prob?: number;     // late-2025 addition
  adjusted_price?: number;   // late-2025 addition
  [k: string]: unknown;
};

export type PriceLabsListingPricesResponse = {
  listing_id: string;
  data?: PriceLabsListingPrice[];
  [k: string]: unknown;
};

// ---- Thin helpers ----

/**
 * Fetch the full listing catalog. PriceLabs returns all listings in one
 * response under ~500 listings (no pagination needed at Beithady's 91-unit
 * scale).
 */
export async function listPricelabsListings(): Promise<PriceLabsListing[]> {
  const res = await pricelabsFetch<
    | PriceLabsListing[]
    | { listings?: PriceLabsListing[]; data?: PriceLabsListing[] }
  >('/listings');
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object') {
    if (Array.isArray(res.listings)) return res.listings;
    if (Array.isArray(res.data)) return res.data;
  }
  return [];
}

/**
 * Fetch daily prices + recommendations for a single listing. Date range is
 * inclusive. PriceLabs silently truncates > ~500 days. The canonical path
 * is `GET /listings/prices?id={listing_id}` (verified via probe 2026-04-21;
 * /listing_prices returns 404 despite older docs).
 */
export async function getPricelabsListingPrices(
  listingId: string,
  opts: { dateFrom?: string; dateTo?: string } = {}
): Promise<PriceLabsListingPricesResponse> {
  return pricelabsFetch<PriceLabsListingPricesResponse>('/listings/prices', {
    query: {
      id: listingId,
      date_from: opts.dateFrom,
      date_to: opts.dateTo,
    },
  });
}

/**
 * Fetch one listing's full detail. Includes fields that don't surface on
 * the `/listings` catalog call (base_price, min_price, max_price, etc.).
 */
export async function getPricelabsListing(
  listingId: string
): Promise<PriceLabsListing> {
  return pricelabsFetch<PriceLabsListing>(`/listings/${listingId}`);
}

export { pricelabsFetch };
