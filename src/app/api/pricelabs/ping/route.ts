import { NextRequest, NextResponse } from 'next/server';
import {
  listPricelabsListings,
  getPricelabsListingPrices,
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
  const started = Date.now();
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
      const priced = await getPricelabsListingPrices(listings[0].id, {
        dateFrom,
        dateTo,
      });
      priceSample = {
        listing_id: listings[0].id,
        listing_name: listings[0].name,
        range: `${dateFrom} → ${dateTo}`,
        rows: (priced?.data || []).slice(0, 7).map(p => ({
          date: p.date,
          current_price: p.price ?? null,
          recommended_rate: p.recommended_rate ?? null,
          min_stay: p.min_stay ?? null,
          booking_prob: p.booking_prob ?? null,
          reason: p.reason || null,
        })),
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
