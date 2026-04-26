import 'server-only';
import { pricelabsFetch } from './pricelabs';

// PriceLabs neighborhood / comp-set data per listing. Endpoint shape
// is documented inconsistently across PriceLabs versions; we probe at
// runtime and parse defensively. If 404, the sync writes a marker
// (neighborhood_endpoint_available = false) and skips the rest.
//
// Tried in order:
//   1. GET /neighborhood_data?id={listing_id}
//   2. GET /listings/{id}/neighborhood
//
// First success wins. Returns a normalized shape; null on failure.

export type NormalizedNeighborhood = {
  comp_set_size: number | null;
  comp_median_price: number | null;
  comp_mean_price: number | null;
  comp_p25_price: number | null;
  comp_p75_price: number | null;
  comp_median_weekday: number | null;
  comp_median_weekend: number | null;
  comp_occupancy_pct: number | null;
  comp_lead_time_days: number | null;
  comp_avg_rating: number | null;
  comp_rating_sample_size: number | null;
  currency: string | null;
  raw: unknown;
};

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

function normalizeNeighborhood(raw: unknown): NormalizedNeighborhood | null {
  if (!raw || typeof raw !== 'object') return null;
  // Endpoint sometimes wraps data in `{ data: {...} }`, sometimes flat.
  const r = raw as Record<string, unknown>;
  const inner = (r.data && typeof r.data === 'object' ? r.data : r) as Record<string, unknown>;

  // PriceLabs has used several field names over time. Accept any of them.
  const median =
    num(inner.median) ??
    num(inner.median_price) ??
    num(inner.market_median) ??
    num((inner.summary as Record<string, unknown> | undefined)?.median);
  const mean =
    num(inner.average) ??
    num(inner.mean) ??
    num(inner.avg) ??
    num(inner.market_avg);
  const p25 = num(inner.low_25) ?? num(inner.p25) ?? num(inner.percentile_25);
  const p75 = num(inner.high_75) ?? num(inner.p75) ?? num(inner.percentile_75);
  const weekday = num(inner.weekday_median) ?? num(inner.median_weekday);
  const weekend = num(inner.weekend_median) ?? num(inner.median_weekend);
  const occ =
    num(inner.occupancy_market) ??
    num(inner.market_occupancy) ??
    num(inner.occupancy_pct);
  const lead = num(inner.lead_time_days) ?? num(inner.lead_time);
  const rating =
    num(inner.avg_rating) ??
    num(inner.rating_avg) ??
    num((inner.ratings as Record<string, unknown> | undefined)?.avg);
  const ratingN =
    num(inner.rating_sample_size) ??
    num((inner.ratings as Record<string, unknown> | undefined)?.count);
  const compCount =
    num(inner.comp_count) ??
    num(inner.comp_set_size) ??
    num(inner.competitors) ??
    num((inner.summary as Record<string, unknown> | undefined)?.count);
  const currency =
    typeof inner.currency === 'string'
      ? (inner.currency as string).toUpperCase()
      : null;

  // If we got nothing usable, treat as a non-result.
  if (
    median == null &&
    mean == null &&
    compCount == null
  ) {
    return null;
  }

  return {
    comp_set_size: compCount,
    comp_median_price: median,
    comp_mean_price: mean,
    comp_p25_price: p25,
    comp_p75_price: p75,
    comp_median_weekday: weekday,
    comp_median_weekend: weekend,
    comp_occupancy_pct: occ,
    comp_lead_time_days: lead,
    comp_avg_rating: rating,
    comp_rating_sample_size: ratingN,
    currency,
    raw,
  };
}

export async function fetchNeighborhoodForListing(
  listingId: string
): Promise<{
  ok: boolean;
  endpoint_available: boolean;
  data: NormalizedNeighborhood | null;
  error: string | null;
}> {
  // Try the canonical endpoint first.
  try {
    const r = await pricelabsFetch<unknown>('/neighborhood_data', {
      query: { id: listingId },
    });
    const norm = normalizeNeighborhood(r);
    if (norm) {
      return { ok: true, endpoint_available: true, data: norm, error: null };
    }
    // Endpoint exists but returned empty/unparseable for this listing.
    return {
      ok: false,
      endpoint_available: true,
      data: null,
      error: 'unparseable_response',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 404 = endpoint not on tier; 401/403 = auth. Both are fatal-no-retry
    // for this build cycle.
    if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
      return {
        ok: false,
        endpoint_available: false,
        data: null,
        error: 'endpoint_404',
      };
    }
    // Try the alternate path before giving up.
    try {
      const r2 = await pricelabsFetch<unknown>(
        `/listings/${listingId}/neighborhood`
      );
      const norm2 = normalizeNeighborhood(r2);
      if (norm2) {
        return { ok: true, endpoint_available: true, data: norm2, error: null };
      }
    } catch {
      // fall through
    }
    return {
      ok: false,
      endpoint_available: false,
      data: null,
      error: msg.slice(0, 200),
    };
  }
}

export function classifyConfidence(
  compSetSize: number | null
): 'high' | 'medium' | 'low' | 'insufficient' {
  if (compSetSize == null || compSetSize < 5) return 'insufficient';
  if (compSetSize < 10) return 'low';
  if (compSetSize < 20) return 'medium';
  return 'high';
}

/**
 * Map a `pricelabs_listings.bedrooms` integer into the canonical bucket
 * label used across the report. Per P5: Studio / 1BR / 2BR / 3BR / 4+BR.
 */
export function bedroomBucket(bedrooms: number | null): string {
  if (bedrooms == null) return '1BR';
  if (bedrooms <= 0) return 'Studio';
  if (bedrooms === 1) return '1BR';
  if (bedrooms === 2) return '2BR';
  if (bedrooms === 3) return '3BR';
  return '4+BR';
}
