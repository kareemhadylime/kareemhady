// One-shot probe for Guesty `/listings` field-projection behaviour.
//
// Background (2026-05-11): sync-guesty-terms.ts requests
// `fields=_id,nickname,bedrooms,prices,terms,taxes,...` but the response
// only contains `_id, accountId, tags`, so `prices.cleaningFee` etc. come
// back null and the upsert wipes our bootstrap. This route tries a handful
// of fields-syntax variants on a known listing and reports which one
// actually returns the price block.
//
// Auth: requires `?secret=$CRON_SECRET`. Safe-by-default; remove the route
// once the sync is fixed.
//
// Usage: GET /api/beithady/fees-audit/_probe-guesty-fields?secret=...&listingId=<optional>

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TERMS_FIELDS = [
  '_id',
  'nickname',
  'bedrooms',
  'bathrooms',
  'accommodates',
  'prices',
  'terms',
  'taxes',
  'extraGuests',
  'extraGuestFee',
  'pets',
  'security',
];

type ProbeResult = {
  variant: string;
  describe: string;
  ok: boolean;
  http_status?: number;
  http_status_text?: string;
  top_keys?: string[];
  has_prices?: boolean;
  cleaning_fee?: number | null;
  error?: string;
  raw_first_300?: string;
};

async function fetchGuesty(
  url: string,
  token: string
): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  body: unknown;
  text: string;
}> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, statusText: res.statusText, body, text };
}

function summarize(payload: unknown): {
  top_keys: string[];
  has_prices: boolean;
  cleaning_fee: number | null;
} {
  if (!payload || typeof payload !== 'object') {
    return { top_keys: [], has_prices: false, cleaning_fee: null };
  }
  const obj = payload as Record<string, unknown>;
  const top_keys = Object.keys(obj).sort();
  const prices = obj.prices as Record<string, unknown> | undefined;
  const cleaningFee =
    prices && typeof prices.cleaningFee !== 'undefined'
      ? Number(prices.cleaningFee)
      : null;
  return {
    top_keys,
    has_prices: !!prices,
    cleaning_fee: Number.isFinite(cleaningFee as number) ? (cleaningFee as number) : null,
  };
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET || '';
  if (!expected || req.nextUrl.searchParams.get('secret') !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Resolve listingId — explicit or pick one we know is broken.
  let listingId = req.nextUrl.searchParams.get('listingId') || '';
  const sb = supabaseAdmin();
  if (!listingId) {
    const { data } = await sb
      .from('guesty_listings')
      .select('id, nickname')
      .eq('nickname', 'BH-101-55')
      .maybeSingle();
    listingId = (data as { id?: string } | null)?.id || '';
  }
  if (!listingId) {
    return NextResponse.json({ error: 'no_listing_id_resolved' }, { status: 400 });
  }

  // Prime the Guesty token cache via a benign list call (the getter is
  // private; this is the simplest way to ensure integration_tokens.guesty
  // is fresh), then read the bearer out of Supabase.
  const { listGuestyListings } = await import('@/lib/guesty');
  await listGuestyListings({ limit: 1 });
  const { data: tokenRow } = await sb
    .from('integration_tokens')
    .select('access_token, expires_at')
    .eq('provider', 'guesty')
    .maybeSingle();
  const token = (tokenRow as { access_token?: string } | null)?.access_token;
  if (!token) {
    return NextResponse.json({ error: 'no_guesty_token' }, { status: 500 });
  }

  const BASE = 'https://open-api.guesty.com/v1';
  const variants: Array<{ name: string; describe: string; url: string }> = [
    {
      name: 'list_comma',
      describe: 'GET /listings?fields=<comma-sep> (current sync)',
      url: `${BASE}/listings?limit=100&fields=${encodeURIComponent(TERMS_FIELDS.join(','))}`,
    },
    {
      name: 'list_space',
      describe: 'GET /listings?fields=<space-sep>',
      url: `${BASE}/listings?limit=100&fields=${encodeURIComponent(TERMS_FIELDS.join(' '))}`,
    },
    {
      name: 'list_no_fields',
      describe: 'GET /listings (no fields param, full default payload)',
      url: `${BASE}/listings?limit=100`,
    },
    {
      name: 'getById_no_fields',
      describe: 'GET /listings/:id (per-listing detail, no fields param)',
      url: `${BASE}/listings/${listingId}`,
    },
    {
      name: 'getById_comma',
      describe: 'GET /listings/:id?fields=<comma-sep>',
      url: `${BASE}/listings/${listingId}?fields=${encodeURIComponent(TERMS_FIELDS.join(','))}`,
    },
    {
      name: 'getById_space',
      describe: 'GET /listings/:id?fields=<space-sep>',
      url: `${BASE}/listings/${listingId}?fields=${encodeURIComponent(TERMS_FIELDS.join(' '))}`,
    },
  ];

  const results: ProbeResult[] = [];
  for (const v of variants) {
    try {
      const res = await fetchGuesty(v.url, token);
      if (!res.ok) {
        results.push({
          variant: v.name,
          describe: v.describe,
          ok: false,
          http_status: res.status,
          http_status_text: res.statusText,
          raw_first_300: res.text.slice(0, 300),
        });
        continue;
      }
      const body = res.body as
        | { results?: unknown[]; data?: { results?: unknown[] } }
        | Record<string, unknown>;
      // Detect list vs detail shape, find the listing we care about.
      let payload: unknown = body;
      const list =
        (body as { results?: unknown[] }).results ||
        (body as { data?: { results?: unknown[] } }).data?.results;
      if (Array.isArray(list)) {
        const hit = list.find(
          x => (x as Record<string, unknown>)._id === listingId
        );
        payload = hit ?? list[0] ?? body;
      }
      const summary = summarize(payload);
      results.push({
        variant: v.name,
        describe: v.describe,
        ok: true,
        http_status: res.status,
        top_keys: summary.top_keys,
        has_prices: summary.has_prices,
        cleaning_fee: summary.cleaning_fee,
      });
    } catch (e) {
      results.push({
        variant: v.name,
        describe: v.describe,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    listing_id: listingId,
    fields_requested: TERMS_FIELDS,
    results,
  });
}
