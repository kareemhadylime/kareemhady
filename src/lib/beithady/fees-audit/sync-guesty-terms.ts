// Beithady · Fee Audit · per-listing terms + taxes + fees sync.
//
// Two-phase fetch (self-healing — 2026-05-11):
//   1. List `/listings` with NO `fields` param. The `fields` projection on
//      our auth scope silently drops `prices`/`terms`/`taxes` (probed: it
//      returns only `_id, accountId, tags`). Default payload is the wider
//      shape; we trade a small bandwidth bump for a complete projection.
//   2. For any listing whose page payload STILL lacks `prices`, fall back
//      to `/listings/:id` (detail endpoint, full payload). The detail
//      endpoint is the canonical source of truth and ignores scope
//      projection quirks.
//
// Upsert is defensive — sparse Guesty responses can never wipe an existing
// non-null bootstrap value. See preferGuesty() below.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { listGuestyListings, getGuestyListing } from '@/lib/guesty';
import { getBookableListingIds } from '@/lib/beithady/bookable-listings';

type RawListing = Record<string, unknown>;

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function readPrices(raw: RawListing): {
  cleaning_fee: number | null;
  cleaning_currency: string | null;
  security_deposit: number | null;
  weekly_discount: number | null;
  monthly_discount: number | null;
} {
  const prices = (raw.prices as Record<string, unknown>) || {};
  return {
    cleaning_fee: num(prices.cleaningFee),
    cleaning_currency: str(prices.currency) || str(prices.priceCurrency),
    security_deposit: num(prices.securityDepositFee),
    weekly_discount: num(prices.weeklyPriceFactor),
    monthly_discount: num(prices.monthlyPriceFactor),
  };
}

function readTerms(raw: RawListing): {
  min_nights: number | null;
  max_nights: number | null;
} {
  const terms = (raw.terms as Record<string, unknown>) || {};
  return {
    min_nights: num(terms.minNights),
    max_nights: num(terms.maxNights),
  };
}

function readTaxes(raw: RawListing): unknown[] {
  const taxes = raw.taxes;
  if (!Array.isArray(taxes)) return [];
  return taxes.map((t: Record<string, unknown>) => ({
    type: str(t.type) || 'tax',
    rate_pct: t.units === 'PERCENTAGE' ? num(t.amount) : undefined,
    amount: t.units === 'FIXED' ? num(t.amount) : undefined,
    amount_currency: str(t.currency),
    applies_to:
      t.appliedToAllFees ? 'all' :
      t.appliedOnFees && Array.isArray(t.appliedOnFees) && (t.appliedOnFees as unknown[]).includes('cleaning')
        ? 'cleaning'
        : 'accommodation',
  }));
}

export async function syncGuestyListingTerms(): Promise<{
  listings: number;
  errors: string[];
  skipped_inactive: number;
  skipped_mtl_parents: number;
  /** How many listings needed the per-listing detail fallback because the
   *  list page payload lacked `prices`. */
  detail_fallbacks?: number;
}> {
  const sb = supabaseAdmin();
  const errors: string[] = [];

  // Bookable physical units = active + dedupe MTL parents. Anything outside
  // this set we don't waste API budget on (and don't write rows for).
  const bookableIds = new Set(await getBookableListingIds());
  let skippedInactive = 0;
  let skippedMtlParents = 0;
  let detailFallbacks = 0;

  // ---- Phase 1: list /listings with NO `fields` param ---------------------
  // The `fields` projection silently drops prices/terms/taxes on our scope.
  // The default payload is wider and includes them.
  let allListings: RawListing[] = [];
  let skip = 0;
  const limit = 100;
  while (true) {
    try {
      const resp = await listGuestyListings({ limit, skip });
      const results = (resp as { results?: RawListing[]; data?: RawListing[] }).results
        || (resp as { results?: RawListing[]; data?: RawListing[] }).data
        || [];
      if (!results.length) break;
      allListings = allListings.concat(results);
      if (results.length < limit) break;
      skip += limit;
    } catch (e) {
      errors.push(
        `listings.list skip=${skip}: ${e instanceof Error ? e.message : String(e)}`
      );
      break;
    }
  }

  // ---- Phase 2: per-listing detail fallback for missing prices ------------
  // Only the BOOKABLE listings — no point burning API budget on inactive /
  // MTL-parent rows we won't write anyway. Detail endpoint is authoritative
  // and ignores list-page projection quirks.
  for (let i = 0; i < allListings.length; i++) {
    const lst = allListings[i];
    const id = str(lst._id);
    if (!id || !bookableIds.has(id)) continue;
    const prices = (lst.prices as Record<string, unknown> | undefined);
    const hasPrices = prices && Object.keys(prices).length > 0;
    if (hasPrices) continue;
    try {
      const detail = await getGuestyListing(id);
      allListings[i] = detail as unknown as RawListing;
      detailFallbacks += 1;
    } catch (e) {
      errors.push(
        `listings.get ${id}: ${e instanceof Error ? e.message : String(e)}`
      );
      // Keep the sparse list-page payload; defensive upsert below preserves
      // existing DB values for missing fields, so we never regress.
    }
  }

  // Pre-load existing rows so we can preserve bootstrap values when Guesty's
  // response is sparse. (Guesty's `/listings` endpoint sometimes drops the
  // `prices` / `terms` / `taxes` blobs when the requested-fields projection
  // doesn't match what its auth scope can return — observed 2026-05-11:
  // every listing came back with only `_id, accountId, tags`. Without this
  // guard the broken sync silently NULLs out the PriceLabs-bootstrap fees.)
  const { data: existingRows } = await sb
    .from('beithady_listing_terms')
    .select('listing_id, cleaning_fee, cleaning_fee_currency, security_deposit, extra_guest_fee, extra_guest_threshold, taxes, min_nights_default, max_nights, bathrooms');
  type ExistingRow = {
    listing_id: string;
    cleaning_fee: number | null;
    cleaning_fee_currency: string | null;
    security_deposit: number | null;
    extra_guest_fee: number | null;
    extra_guest_threshold: number | null;
    taxes: unknown;
    min_nights_default: number | null;
    max_nights: number | null;
    bathrooms: number | null;
  };
  const existingByListingId = new Map<string, ExistingRow>(
    ((existingRows as ExistingRow[] | null) || []).map(r => [r.listing_id, r] as const)
  );

  /** Prefer Guesty's value when it's a non-null number; otherwise keep the
   *  existing DB value. Stops sparse Guesty responses from wiping bootstrap. */
  function preferGuesty<T>(fresh: T | null, existing: T | null | undefined): T | null {
    return fresh != null ? fresh : (existing ?? null);
  }

  let upsertedCount = 0;
  for (const raw of allListings) {
    const id = str(raw._id);
    if (!id) continue;
    // Skip listings that are inactive OR MTL parents (we sync the children
    // instead — they share calendar + share fees and are the bookable inventory).
    if (!bookableIds.has(id)) {
      if (raw.active === false) skippedInactive += 1;
      else skippedMtlParents += 1;
      continue;
    }
    const prices = readPrices(raw);
    const terms = readTerms(raw);
    const taxes = readTaxes(raw);
    const extraGuestThreshold = num(raw.extraGuests);
    const extraGuestFee = num(raw.extraGuestFee);
    const bathrooms = num(raw.bathrooms);
    const existing = existingByListingId.get(id);

    const { error } = await sb.from('beithady_listing_terms').upsert(
      {
        listing_id: id,
        cleaning_fee: preferGuesty(prices.cleaning_fee, existing?.cleaning_fee ?? null),
        cleaning_fee_currency: preferGuesty(prices.cleaning_currency, existing?.cleaning_fee_currency ?? null),
        security_deposit: preferGuesty(prices.security_deposit, existing?.security_deposit ?? null),
        pet_fee: null,
        extra_guest_fee: preferGuesty(extraGuestFee, existing?.extra_guest_fee ?? null),
        extra_guest_threshold: preferGuesty(extraGuestThreshold, existing?.extra_guest_threshold ?? null),
        // Taxes are an array — only overwrite when Guesty returned a non-empty
        // array. Empty / missing → keep existing (which may include the
        // operator-confirmed Egypt/UAE stacks).
        taxes: taxes.length > 0 ? taxes : (existing?.taxes ?? []),
        min_nights_default: preferGuesty(terms.min_nights, existing?.min_nights_default ?? null),
        min_nights_per_channel: {}, // Guesty doesn't expose per-channel here; populated via channel-specific endpoints later
        max_nights: preferGuesty(terms.max_nights, existing?.max_nights ?? null),
        prep_time_hours: null,
        advance_notice_hours: null,
        bathrooms: preferGuesty(bathrooms, existing?.bathrooms ?? null),
        raw,
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'listing_id' }
    );
    if (error) errors.push(`${id}: ${error.message}`);
    else upsertedCount += 1;
  }

  return {
    listings: upsertedCount,
    errors,
    skipped_inactive: skippedInactive,
    skipped_mtl_parents: skippedMtlParents,
    detail_fallbacks: detailFallbacks,
  };
}
