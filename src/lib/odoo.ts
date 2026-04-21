// Odoo 18 JSON-RPC client with API-key auth.
// Docs: https://www.odoo.com/documentation/18.0/developer/reference/external_api.html
// Auth: user email + API key (Odoo 14+). Create via: Profile → Account
// Security → New API Key. Prefer a dedicated "API Bot" user with scoped
// read-only permissions over a personal admin login.
//
// JSON-RPC flow:
//   1. POST /jsonrpc { service: "common", method: "authenticate", args: [db, user, key, {}] }
//      → returns uid (int) or false
//   2. POST /jsonrpc { service: "object", method: "execute_kw", args: [db, uid, key, model, method, args, kwargs] }
//      → returns the call result
//
// We cache the uid in-memory per cold start (Vercel reuses warm instances).

type OdooCreds = {
  url: string;
  db: string;
  user: string;
  apiKey: string;
};

function getCreds(): OdooCreds {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const user = process.env.ODOO_USER;
  const apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !user || !apiKey) {
    throw new Error(
      'ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY must all be set in env'
    );
  }
  // Strip trailing /odoo web-client path if present — JSON-RPC lives at /jsonrpc
  // on the root URL. Also drop any trailing slash.
  const base = url.replace(/\/+$/, '').replace(/\/odoo$/, '');
  return { url: base, db, user, apiKey };
}

// Module-scoped uid cache. Authenticate is cheap but not free — skip it on
// warm instances. API key itself is sent on every execute_kw call.
let cachedUid: { uid: number; userKey: string } | null = null;

type JsonRpcResponse<T> =
  | { jsonrpc: '2.0'; id: number; result: T }
  | {
      jsonrpc: '2.0';
      id: number;
      error: {
        code: number;
        message: string;
        data?: { name?: string; message?: string; debug?: string };
      };
    };

async function jsonRpc<T>(
  url: string,
  service: 'common' | 'object' | 'db',
  method: string,
  args: unknown[]
): Promise<T> {
  const res = await fetch(`${url}/jsonrpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { service, method, args },
      id: Math.floor(Math.random() * 1_000_000),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `odoo_http_${res.status}: ${service}.${method} — ${text.slice(0, 300)}`
    );
  }

  const json = (await res.json()) as JsonRpcResponse<T>;
  if ('error' in json) {
    const inner = json.error.data?.message || json.error.message;
    throw new Error(
      `odoo_rpc_error: ${service}.${method} — ${inner.slice(0, 500)}`
    );
  }
  return json.result;
}

async function authenticate(): Promise<number> {
  const { url, db, user, apiKey } = getCreds();
  // Cache key includes user+key so a credential rotation invalidates cleanly.
  const userKey = `${user}:${apiKey}`;
  if (cachedUid && cachedUid.userKey === userKey) {
    return cachedUid.uid;
  }
  const uid = await jsonRpc<number | false>(url, 'common', 'authenticate', [
    db,
    user,
    apiKey,
    {},
  ]);
  if (!uid || typeof uid !== 'number') {
    throw new Error(
      'odoo_auth_failed: authenticate returned false — check ODOO_USER and ODOO_API_KEY'
    );
  }
  cachedUid = { uid, userKey };
  return uid;
}

// Low-level escape hatch — call any model method Odoo exposes.
export async function odooExecute<T = unknown>(
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  const { url, db, apiKey } = getCreds();
  const uid = await authenticate();
  return jsonRpc<T>(url, 'object', 'execute_kw', [
    db,
    uid,
    apiKey,
    model,
    method,
    args,
    kwargs,
  ]);
}

// search_read is the workhorse for reading records — combines search+read
// in one RPC, returns records with the requested fields. Optional `context`
// (e.g. `{ allowed_company_ids: [1, 2] }`) is critical for multi-company
// tenants — without it, Odoo scopes to the API user's default company only.
export async function odooSearchRead<T = Record<string, unknown>>(
  model: string,
  domain: unknown[] = [],
  options: {
    fields?: string[];
    limit?: number;
    offset?: number;
    order?: string;
    context?: Record<string, unknown>;
  } = {}
): Promise<T[]> {
  const kwargs: Record<string, unknown> = {
    fields: options.fields,
    limit: options.limit ?? 80,
    offset: options.offset ?? 0,
    order: options.order,
  };
  if (options.context) kwargs.context = options.context;
  return odooExecute<T[]>(model, 'search_read', [domain], kwargs);
}

export async function odooSearchCount(
  model: string,
  domain: unknown[] = [],
  options: { context?: Record<string, unknown> } = {}
): Promise<number> {
  const kwargs: Record<string, unknown> = {};
  if (options.context) kwargs.context = options.context;
  return odooExecute<number>(model, 'search_count', [domain], kwargs);
}

// ---- Server-version probe (no auth required — hits /common.version)

export async function odooVersion(): Promise<{
  server_version: string;
  server_version_info: unknown[];
  server_serie: string;
  protocol_version: number;
}> {
  const { url } = getCreds();
  return jsonRpc(url, 'common', 'version', []);
}

// ---- Typed shapes for common hospitality-ops models. Loose — Odoo fields
// vary per install/module set, so optional everything.

export type OdooInvoice = {
  id: number;
  name?: string; // e.g. "INV/2026/00042"
  move_type?:
    | 'out_invoice'
    | 'in_invoice'
    | 'out_refund'
    | 'in_refund'
    | 'entry';
  state?: 'draft' | 'posted' | 'cancel';
  partner_id?: [number, string] | false;
  invoice_date?: string | false;
  amount_total?: number;
  amount_total_signed?: number;
  currency_id?: [number, string] | false;
};

export type OdooPartner = {
  id: number;
  name?: string;
  email?: string | false;
  phone?: string | false;
  is_company?: boolean;
  supplier_rank?: number;
  customer_rank?: number;
};

export type OdooAnalyticAccount = {
  id: number;
  name?: string;
  code?: string | false;
  balance?: number;
};

export type OdooCompany = {
  id: number;
  name?: string;
  country_id?: [number, string] | false;
  currency_id?: [number, string] | false;
  partner_id?: [number, string] | false;
};
