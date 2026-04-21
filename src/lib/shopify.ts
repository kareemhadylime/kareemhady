// Shopify Admin API client for the shopfromkika storefront.
// Docs: https://shopify.dev/docs/api/admin-rest (REST) and admin-graphql.
// Auth: custom app access token via X-Shopify-Access-Token header.
//
// Env:
//   SHOPIFY_STORE_DOMAIN   — e.g. "shopfromkika.myshopify.com"
//   SHOPIFY_ADMIN_ACCESS_TOKEN — "shpat_..." from the custom app
//
// We use REST 2024-10 as the stable default; bump `API_VERSION` when needed.

const API_VERSION = '2024-10';

type ShopifyFetchOpts = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  retries?: number;
};

function baseUrl(): string {
  const domain = (process.env.SHOPIFY_STORE_DOMAIN || '').trim();
  if (!domain) {
    throw new Error('SHOPIFY_STORE_DOMAIN must be set in env');
  }
  // Accept "shopfromkika" or "shopfromkika.myshopify.com" or full URL.
  let host = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!host.includes('.')) host = `${host}.myshopify.com`;
  return `https://${host}/admin/api/${API_VERSION}`;
}

// Cache resolved token per cold-start process for the store we're serving.
let cachedToken: { value: string; shopHandle: string } | null = null;

async function resolveAdminToken(): Promise<string> {
  // Env override (legacy custom-app path) wins when set.
  const envToken = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '').trim();
  if (envToken) return envToken;

  // Fall back to OAuth-granted token persisted by /api/shopify/auth/callback.
  const domain = (process.env.SHOPIFY_STORE_DOMAIN || '').trim();
  const shopHandle = domain.includes('.')
    ? domain.replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/\.myshopify\.com$/i, '')
    : domain;
  if (cachedToken && cachedToken.shopHandle === shopHandle) {
    return cachedToken.value;
  }

  const { supabaseAdmin } = await import('./supabase');
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('integration_tokens')
    .select('access_token')
    .eq('provider', `shopify:${shopHandle}`)
    .maybeSingle();
  const token = (data as { access_token: string } | null)?.access_token;
  if (!token) {
    throw new Error(
      `Shopify token missing. Set SHOPIFY_ADMIN_ACCESS_TOKEN in env, OR run the OAuth flow at /api/shopify/auth/start after setting SHOPIFY_APP_CLIENT_ID + SHOPIFY_APP_CLIENT_SECRET.`
    );
  }
  cachedToken = { value: token, shopHandle };
  return token;
}

export async function shopifyFetch<T = unknown>(
  path: string,
  opts: ShopifyFetchOpts = {}
): Promise<T> {
  const token = await resolveAdminToken();

  const url = new URL(path.startsWith('http') ? path : `${baseUrl()}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
  }

  const method = opts.method || 'GET';
  const headers: Record<string, string> = {
    'X-Shopify-Access-Token': token,
    Accept: 'application/json',
  };
  const init: RequestInit = { method, headers };
  if (opts.body != null) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }

  const retries = opts.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, init);
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after') || '2');
      await new Promise(r => setTimeout(r, Math.max(1, Math.min(30, retryAfter)) * 1000));
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      lastErr = new Error(
        `shopify_${res.status}: ${method} ${path} — ${text.slice(0, 300)}`
      );
      if (res.status >= 400 && res.status < 500) throw lastErr;
      if (attempt < retries) continue;
      throw lastErr;
    }
    const text = await res.text();
    if (!text) return null as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `shopify_invalid_json: ${method} ${path} — ${text.slice(0, 200)}`
      );
    }
  }
  throw lastErr || new Error('shopify_fetch_exhausted');
}

// ---- Thin typed helpers. Expand as needed. ----

export type ShopifyShop = {
  id: number;
  name?: string;
  email?: string;
  domain?: string;
  currency?: string;
  timezone?: string;
  plan_name?: string;
  shop_owner?: string;
};

export async function getShopifyShop(): Promise<ShopifyShop> {
  const res = await shopifyFetch<{ shop: ShopifyShop }>('/shop.json');
  return res?.shop;
}

export type ShopifyOrderLineItem = {
  id: number;
  product_id?: number | null;
  variant_id?: number | null;
  title: string;
  name?: string;
  sku?: string;
  vendor?: string;
  quantity: number;
  price: string;
  total_discount?: string;
};

export type ShopifyFulfillment = {
  id: number;
  created_at?: string;
  updated_at?: string;
  status?: string;            // 'success' | 'cancelled' | 'error' | ...
  shipment_status?: string | null; // 'delivered' | 'in_transit' | 'out_for_delivery' | ...
  tracking_number?: string | null;
};

export type ShopifyOrder = {
  id: number;
  name: string; // '#1234'
  email?: string;
  created_at: string;
  processed_at?: string;
  cancelled_at?: string | null;
  currency: string;
  total_price: string;
  subtotal_price?: string;
  total_discounts?: string;
  total_tax?: string;
  total_shipping_price_set?: { shop_money?: { amount?: string } };
  financial_status?: string; // 'paid' | 'pending' | 'refunded' | ...
  fulfillment_status?: string | null;
  tags?: string;
  customer?: {
    id: number;
    email: string;
    first_name?: string;
    last_name?: string;
  } | null;
  line_items?: ShopifyOrderLineItem[];
  fulfillments?: ShopifyFulfillment[];
  refunds?: Array<{ transactions?: Array<{ amount?: string; kind?: string }> }>;
};

export type ShopifyProduct = {
  id: number;
  title: string;
  product_type?: string;
  vendor?: string;
  status?: string;
  handle?: string;
  tags?: string;
  created_at?: string;
  updated_at?: string;
  variants?: Array<{
    id: number;
    inventory_quantity?: number;
    price?: string;
    sku?: string;
  }>;
};

export type ShopifyCustomer = {
  id: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  orders_count?: number;
  total_spent?: string;
  tags?: string;
  state?: string; // 'enabled' | 'disabled' | 'invited' | ...
  created_at?: string;
  updated_at?: string;
  last_order_id?: number | null;
};

export async function listShopifyOrders(params: {
  status?: 'any' | 'open' | 'closed' | 'cancelled';
  createdAtMin?: string;
  createdAtMax?: string;
  limit?: number;
} = {}): Promise<ShopifyOrder[]> {
  const res = await shopifyFetch<{ orders: ShopifyOrder[] }>('/orders.json', {
    query: {
      status: params.status || 'any',
      created_at_min: params.createdAtMin,
      created_at_max: params.createdAtMax,
      limit: params.limit || 50,
    },
  });
  return res?.orders || [];
}

// Paginated variant of listShopifyOrders using Shopify's Link header
// cursor pagination. Yields all orders matching the filter via an async
// generator — callers can break out early.
export async function* iterateShopifyOrders(params: {
  status?: 'any' | 'open' | 'closed' | 'cancelled';
  createdAtMin?: string;
  createdAtMax?: string;
  pageSize?: number;
} = {}): AsyncGenerator<ShopifyOrder[]> {
  const token = await resolveAdminToken();
  const url = new URL(`${baseUrl()}/orders.json`);
  url.searchParams.set('status', params.status || 'any');
  if (params.createdAtMin) url.searchParams.set('created_at_min', params.createdAtMin);
  if (params.createdAtMax) url.searchParams.set('created_at_max', params.createdAtMax);
  url.searchParams.set('limit', String(params.pageSize || 250));

  let next: string | null = url.toString();
  while (next) {
    const res = await fetch(next, {
      method: 'GET',
      headers: { 'X-Shopify-Access-Token': token, Accept: 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `shopify_${res.status}: GET orders — ${text.slice(0, 300)}`
      );
    }
    const json = (await res.json()) as { orders?: ShopifyOrder[] };
    yield json.orders || [];

    // Parse Link header for next cursor
    const link = res.headers.get('link') || '';
    const nextMatch = /<([^>]+)>;\s*rel="next"/.exec(link);
    next = nextMatch ? nextMatch[1] : null;

    // Respect the 2 req/sec base rate (bucket of 40).
    await new Promise(r => setTimeout(r, 500));
  }
}

// Paginated products via Link header
export async function* iterateShopifyProducts(params: {
  pageSize?: number;
} = {}): AsyncGenerator<ShopifyProduct[]> {
  const token = await resolveAdminToken();
  const url = new URL(`${baseUrl()}/products.json`);
  url.searchParams.set('limit', String(params.pageSize || 250));
  let next: string | null = url.toString();
  while (next) {
    const res = await fetch(next, {
      method: 'GET',
      headers: { 'X-Shopify-Access-Token': token, Accept: 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`shopify_${res.status}: GET products — ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as { products?: ShopifyProduct[] };
    yield json.products || [];
    const link = res.headers.get('link') || '';
    const nextMatch = /<([^>]+)>;\s*rel="next"/.exec(link);
    next = nextMatch ? nextMatch[1] : null;
    await new Promise(r => setTimeout(r, 500));
  }
}

// Paginated customers via Link header
export async function* iterateShopifyCustomers(params: {
  pageSize?: number;
} = {}): AsyncGenerator<ShopifyCustomer[]> {
  const token = await resolveAdminToken();
  const url = new URL(`${baseUrl()}/customers.json`);
  url.searchParams.set('limit', String(params.pageSize || 250));
  let next: string | null = url.toString();
  while (next) {
    const res = await fetch(next, {
      method: 'GET',
      headers: { 'X-Shopify-Access-Token': token, Accept: 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`shopify_${res.status}: GET customers — ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as { customers?: ShopifyCustomer[] };
    yield json.customers || [];
    const link = res.headers.get('link') || '';
    const nextMatch = /<([^>]+)>;\s*rel="next"/.exec(link);
    next = nextMatch ? nextMatch[1] : null;
    await new Promise(r => setTimeout(r, 500));
  }
}

export type ShopifyOrderCount = { count: number };

export async function countShopifyOrders(params: {
  status?: 'any' | 'open' | 'closed' | 'cancelled';
  createdAtMin?: string;
  createdAtMax?: string;
} = {}): Promise<number> {
  const res = await shopifyFetch<ShopifyOrderCount>('/orders/count.json', {
    query: {
      status: params.status || 'any',
      created_at_min: params.createdAtMin,
      created_at_max: params.createdAtMax,
    },
  });
  return res?.count ?? 0;
}
