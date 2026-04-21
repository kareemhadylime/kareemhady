import { NextRequest, NextResponse } from 'next/server';
import {
  listPricelabsListings,
  getPricelabsListingPrices,
  pricelabsFetch,
} from '@/lib/pricelabs';

// Smoke-test endpoint for the PriceLabs integration. Verifies auth + returns
// a listing sample (with `pms_reference_id` so we can see the join to
// Guesty listing ids) + optionally a recommended-rate sample for one
// listing so rate-card format is clear.
//
// Protected by CRON_SECRET (same bearer pattern as the other ping routes):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://kareemhady.vercel.app/api/pricelabs/ping
//   Add ?withPrices=1 to include a sample of listing_prices for the first
//   listing in the catalog.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured on server' },
      { status: 500 }
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  const env = {
    PRICELABS_API_KEY: !!process.env.PRICELABS_API_KEY,
  };
  if (!env.PRICELABS_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'PriceLabs credentials missing — set PRICELABS_API_KEY in the environment. Generate via Account → Profile → API in the PriceLabs portal.',
        env,
      },
      { status: 400 }
    );
  }

  const withPrices = req.nextUrl.searchParams.get('withPrices') === '1';
  const probe = req.nextUrl.searchParams.get('probe') === '1';
  const started = Date.now();

  // Endpoint probe: PriceLabs' v1 API paths for rate recommendations aren't
  // publicly indexed, so this mode tries a set of candidates and reports
  // which respond 200. Run once with ?probe=1 to discover the right path.
  if (probe) {
    const listings = await listPricelabsListings();
    const first = listings[0];
    if (!first) {
      return NextResponse.json(
        { ok: false, error: 'no listings to probe with' },
        { status: 500 }
      );
    }
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const candidates: Array<{ method: 'GET'; path: string; query?: Record<string, string> }> = [
      { method: 'GET', path: `/listings/${first.id}` },
      { method: 'GET', path: `/listings/${first.id}/prices` },
      { method: 'GET', path: `/listings/${first.id}/recommendations` },
      { method: 'GET', path: `/listing_prices`, query: { listing_id: first.id } },
      { method: 'GET', path: `/listing_prices`, query: { listing_id: first.id, date_from: today, date_to: end } },
      { method: 'GET', path: `/dailyrec_new`, query: { listing_id: first.id, date_from: today, date_to: end } },
      { method: 'GET', path: `/dnepricing`, query: { listing_id: first.id } },
      { method: 'GET', path: `/pricing`, query: { listing_id: first.id } },
      { method: 'GET', path: `/rates`, query: { listing_id: first.id } },
      { method: 'GET', path: `/calendar`, query: { listing_id: first.id } },
      { method: 'GET', path: `/listings/prices`, query: { id: first.id } },
      { method: 'GET', path: `/reservation_data`, query: { listing_id: first.id } },
      { method: 'GET', path: `/reservations`, query: { listing_id: first.id } },
      { method: 'GET', path: `/neighborhood_data`, query: { listing_id: first.id } },
    ];

    type ProbeResult = {
      path: string;
      query?: Record<string, string>;
      status: number | 'error';
      body_sample?: string;
      error?: string;
    };
    const results: ProbeResult[] = [];
    for (const c of candidates) {
      try {
        const data = await pricelabsFetch<unknown>(c.path, { query: c.query, retries: 0 });
        const sample = JSON.stringify(data).slice(0, 250);
        results.push({ path: c.path, query: c.query, status: 200, body_sample: sample });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const m = /pricelabs_(\d{3})/.exec(msg);
        results.push({
          path: c.path,
          query: c.query,
          status: m ? Number(m[1]) : 'error',
          error: msg.slice(0, 200),
        });
      }
      // Be polite to the 60/min rate limit.
      await new Promise(r => setTimeout(r, 200));
    }

    return NextResponse.json({
      ok: true,
      mode: 'probe',
      duration_ms: Date.now() - started,
      probed_with_listing: { id: first.id, name: first.name },
      results,
    });
  }

  try {
    const listings = await listPricelabsListings();

    // Count by PMS so we can spot how Beithady's Guesty listings surface.
    const byPms = new Map<string, number>();
    for (const l of listings) {
      const key = l.pms || 'unknown';
      byPms.set(key, (byPms.get(key) || 0) + 1);
    }

    const sample = listings.slice(0, 5).map(l => ({
      id: l.id,
      name: l.name,
      pms: l.pms || null,
      pms_reference_id: l.pms_reference_id || null,
      bedrooms: l.no_of_bedrooms ?? null,
      base_price: l.base_price ?? null,
      min_price: l.min_price ?? null,
      max_price: l.max_price ?? null,
      currency: l.currency || null,
      push_enabled: l.push_enabled ?? null,
      market: l.market || l.city || null,
    }));

    let priceSample: unknown = null;
    if (withPrices && listings.length > 0) {
      const today = new Date();
      const dateFrom = today.toISOString().slice(0, 10);
      const end = new Date(today.getTime() + 14 * 24 * 3600 * 1000);
      const dateTo = end.toISOString().slice(0, 10);
      const raw = await pricelabsFetch<Record<string, unknown>>(
        '/listings/prices',
        { query: { id: listings[0].id, date_from: dateFrom, date_to: dateTo } }
      );
      // Surface the raw shape so we can see how PL structures this response.
      priceSample = {
        listing_id: listings[0].id,
        listing_name: listings[0].name,
        range: `${dateFrom} → ${dateTo}`,
        raw_top_level_keys: raw ? Object.keys(raw) : [],
        raw_sample: JSON.stringify(raw).slice(0, 1200),
      };
    }

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - started,
      total_listings: listings.length,
      by_pms: Array.from(byPms.entries())
        .map(([pms, count]) => ({ pms, count }))
        .sort((a, b) => b.count - a.count),
      sample,
      price_sample: priceSample,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        duration_ms: Date.now() - started,
        error: msg,
      },
      { status: 500 }
    );
  }
}
