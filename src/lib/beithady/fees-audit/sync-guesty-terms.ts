// Beithady · Fee Audit · per-listing terms + taxes + fees sync.
// Calls Guesty `/listings` with the fee/tax/term fields explicitly requested
// (Guesty supports `fields` param to widen the default sparse projection).

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { listGuestyListings } from '@/lib/guesty';

const TERMS_FIELDS = [
  '_id',
  'nickname',
  'bedrooms',
  'bathrooms',
  'accommodates',
  'prices',                // base, cleaning, weekly/monthly discounts
  'terms',                 // minNights, maxNights
  'taxes',                 // [{type, amount, units, ...}]
  'extraGuests',
  'extraGuestFee',
  'pets',
  'security',
].join(',');

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
}> {
  const sb = supabaseAdmin();
  const errors: string[] = [];

  // Fetch all listings with the wide field projection
  let allListings: RawListing[] = [];
  let skip = 0;
  const limit = 100;
  while (true) {
    try {
      const resp = await listGuestyListings({
        limit,
        skip,
        fields: TERMS_FIELDS,
      });
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

  let upsertedCount = 0;
  for (const raw of allListings) {
    const id = str(raw._id);
    if (!id) continue;
    const prices = readPrices(raw);
    const terms = readTerms(raw);
    const taxes = readTaxes(raw);
    const extraGuestThreshold = num(raw.extraGuests);
    const extraGuestFee = num(raw.extraGuestFee);
    const bathrooms = num(raw.bathrooms);

    const { error } = await sb.from('beithady_listing_terms').upsert(
      {
        listing_id: id,
        cleaning_fee: prices.cleaning_fee,
        cleaning_fee_currency: prices.cleaning_currency,
        security_deposit: prices.security_deposit,
        pet_fee: null,
        extra_guest_fee: extraGuestFee,
        extra_guest_threshold: extraGuestThreshold,
        taxes,
        min_nights_default: terms.min_nights,
        min_nights_per_channel: {}, // Guesty doesn't expose per-channel here; populated via channel-specific endpoints later
        max_nights: terms.max_nights,
        prep_time_hours: null,
        advance_notice_hours: null,
        bathrooms,
        raw,
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'listing_id' }
    );
    if (error) errors.push(`${id}: ${error.message}`);
    else upsertedCount += 1;
  }

  return { listings: upsertedCount, errors };
}
