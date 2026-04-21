import { NextRequest, NextResponse } from 'next/server';
import {
  listPricelabsListings,
  getPricelabsListing,
} from '@/lib/pricelabs';

// Smoke-test endpoint for the PriceLabs integration. Returns:
//   - total listings + by-PMS breakdown
//   - first-5 catalog sample
//   - rich detail for the first listing (ADR, occupancy vs market, STLY
//     revenue comparison, channel cross-references, building tags)
//
// Protected by CRON_SECRET:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://kareemhady.vercel.app/api/pricelabs/ping

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

  if (!process.env.PRICELABS_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'PriceLabs credentials missing — set PRICELABS_API_KEY (Account → Profile → API).',
      },
      { status: 400 }
    );
  }

  const started = Date.now();
  try {
    const listings = await listPricelabsListings();

    // By-PMS breakdown
    const byPms = new Map<string, number>();
    for (const l of listings) {
      const key = l.pms || 'unknown';
      byPms.set(key, (byPms.get(key) || 0) + 1);
    }

    // Building-tag breakdown (PriceLabs-side, parsed from `tags`).
    const byBuildingTag = new Map<string, number>();
    for (const l of listings) {
      const tag = String(l.tags || '')
        .split(',')
        .map(s => s.trim().toUpperCase())
        .find(s => /^BH[-\s]*(26|34|73|435|OK|OKAT|\d{2,3})$/i.test(s));
      const building = normalizeBuildingTag(tag || null);
      byBuildingTag.set(building, (byBuildingTag.get(building) || 0) + 1);
    }

    const sample = listings.slice(0, 5).map(l => ({
      id: l.id,
      name: l.name,
      pms: l.pms || null,
      bedrooms: l.no_of_bedrooms ?? null,
      push_enabled: l.push_enabled ?? null,
    }));

    // Rich detail for one listing so we can inspect the per-listing payload.
    let detail: unknown = null;
    if (listings.length > 0) {
      const d = await getPricelabsListing(listings[0].id);
      if (d) {
        detail = {
          id: d.id,
          name: d.name,
          pms: d.pms,
          city: d.city_name,
          base: d.base ?? d.base_price ?? null,
          min: d.min ?? d.min_price ?? null,
          max: d.max ?? d.max_price ?? null,
          push_enabled: d.push_enabled,
          last_date_pushed: d.last_date_pushed,
          group: d.group,
          tags: d.tags,
          revenue_intel: {
            adr_past_30: d.adr_past_30,
            stly_adr_past_30: d.stly_adr_past_30,
            revenue_past_30: d.revenue_past_30,
            stly_revenue_past_30: d.stly_revenue_past_30,
            booking_pickup_past_30: d.booking_pickup_past_30,
            occupancy_next_7: d.occupancy_next_7,
            market_occupancy_next_7: d.market_occupancy_next_7,
            occupancy_next_30: d.occupancy_next_30,
            market_occupancy_next_30: d.market_occupancy_next_30,
            occupancy_next_60: d.occupancy_next_60,
            market_occupancy_next_60: d.market_occupancy_next_60,
            recommended_base_price: d.recommended_base_price,
            last_refreshed_at: d.last_refreshed_at,
          },
          channel_listing_details: d.channel_listing_details || [],
        };
      }
    }

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - started,
      total_listings: listings.length,
      by_pms: Array.from(byPms.entries())
        .map(([pms, count]) => ({ pms, count }))
        .sort((a, b) => b.count - a.count),
      by_building_tag: Array.from(byBuildingTag.entries())
        .map(([building, count]) => ({ building, count }))
        .sort((a, b) => b.count - a.count),
      sample,
      detail,
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

// Normalize building tags to the canonical 5 used across the Odoo/Guesty
// integrations: BH-26, BH-34, BH-73, BH-435, BH-OK.
function normalizeBuildingTag(tag: string | null): string {
  if (!tag) return 'untagged';
  const up = tag.toUpperCase();
  if (/^BH[-\s]*(26|34|73|435)$/.test(up)) return up.replace(/[\s-]+/, '-');
  if (/^BH[-\s]*(OK|OKAT)/.test(up)) return 'BH-OK';
  if (/^BH[-\s]*\d/.test(up)) return 'BH-OK';
  return 'untagged';
}
