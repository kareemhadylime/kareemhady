// Country routing for the Daily Morning Brief.
//
// Why this exists
// ---------------
// Beit Hady runs across two countries with different functional currencies.
// The user's standing rule (2026-04-30): every revenue / payout / activity
// number in any brief MUST segregate Egypt vs UAE — Egypt amounts in USD,
// UAE amounts in AED. We never FX-convert across the line.
//
// Mapping (authoritative until a listings catalog row says otherwise):
//   Egypt  → BH-26, BH-73, BH-435, BH-OK (BH-ONEKAT), BH-MG, BH-GOUNA,
//            BH-NEWCAI, BH-OKAT, BH-MANG, BH-MB34, BH-WS, plus any other
//            BH-* tag that isn't explicitly UAE.
//   UAE    → DXB (LIME-MA, REEHAN, YANSOON catalog rows).
//
// `OTHER` is preserved as a third bucket so we never silently misroute
// a new country / unknown listing into Egypt — it'll surface in the
// brief as "Other" until someone adds the mapping here.

export type CountryCode = 'EG' | 'AE' | 'OTHER';

export type CountryLabel = {
  short: 'EG' | 'AE' | 'OTHER';
  en: string;             // "Egypt" / "UAE" / "Other"
  ar: string;             // "مصر" / "الإمارات" / "أخرى"
  display_currency: 'USD' | 'AED' | 'USD'; // Egypt = USD, UAE = AED
};

export const COUNTRY_LABEL: Record<CountryCode, CountryLabel> = {
  EG: { short: 'EG', en: 'Egypt', ar: 'مصر', display_currency: 'USD' },
  AE: { short: 'AE', en: 'UAE', ar: 'الإمارات', display_currency: 'AED' },
  OTHER: { short: 'OTHER', en: 'Other', ar: 'أخرى', display_currency: 'USD' },
};

const UAE_TAGS = new Set(['DXB', 'AE', 'UAE']);
const UAE_NICKNAME_PREFIXES = ['LIME-MA', 'REEHAN', 'YANSOON'];

// Anything explicitly Egyptian. We list the BH-* primary tags here so a
// listing without `building_code` set in Guesty still routes correctly
// when its catalog tag is known.
const EGYPT_TAGS = new Set([
  'BH-26',
  'BH-73',
  'BH-435',
  'BH-OK',
  'BH-ONEKAT',
  'BH-MG',
  'BH-GOUNA',
  'BH-NEWCAI',
  'BH-OKAT',
  'BH-MANG',
  'BH-MB34',
  'BH-WS',
]);

// Map a building_code (or raw tag) to a country bucket. Falls through
// gracefully: unknown BH-* still routes to Egypt (they're virtually
// always Egyptian properties); unknown non-BH tags fall to OTHER.
export function countryForBuilding(buildingCode: string | null | undefined): CountryCode {
  if (!buildingCode) return 'OTHER';
  const b = buildingCode.toUpperCase().trim();
  if (UAE_TAGS.has(b)) return 'AE';
  if (EGYPT_TAGS.has(b)) return 'EG';
  // Heuristic: any BH-* tag we don't know about defaults to Egypt
  // (every BH-* listing in the current catalog is Egyptian — the
  // single UAE building cluster is tagged DXB instead).
  if (b.startsWith('BH-') || b.startsWith('BH73') || b.startsWith('BH-')) return 'EG';
  return 'OTHER';
}

// Listings in `guesty_listings` may have null `building_code` for legacy
// rows. Use the listing nickname as a fallback signal — the catalog
// nicknames carry the country implicitly.
export function countryForListing(input: {
  building_code: string | null | undefined;
  nickname?: string | null | undefined;
}): CountryCode {
  const fromBc = countryForBuilding(input.building_code);
  if (fromBc !== 'OTHER') return fromBc;
  const nick = (input.nickname || '').toUpperCase().trim();
  if (UAE_NICKNAME_PREFIXES.some(p => nick.startsWith(p))) return 'AE';
  if (nick.startsWith('BH')) return 'EG';
  return 'OTHER';
}

// Format a money amount with the per-country display currency. We never
// FX-convert — Egypt rows display in USD because that's the functional
// reporting currency Airbnb/Booking pays in for Egypt; UAE rows display
// in AED because that's Booking.com's settlement currency for DXB.
export function formatMoneyCountry(amount: number, country: CountryCode): string {
  const cc = COUNTRY_LABEL[country].display_currency;
  const rounded = Math.round(amount).toLocaleString();
  if (cc === 'USD') return `$${rounded}`;
  return `${rounded} ${cc}`;
}

// Group rows by country and sum the chosen money field per country in
// the row's NATIVE currency. We deliberately do NOT cross sum across
// currencies — if an Egyptian listing settles in EGP we keep that
// separate from USD inside the same EG bucket.
export type CountryCurrencyTotals = {
  EG: Map<string, number>;
  AE: Map<string, number>;
  OTHER: Map<string, number>;
};

export function sumByCountryCurrency<T extends {
  building_code?: string | null;
  currency?: string | null;
  host_payout?: number | string | null;
  commission?: number | string | null;
}>(
  rows: T[],
  opts: { includeCommission?: boolean } = {},
): CountryCurrencyTotals {
  const out: CountryCurrencyTotals = {
    EG: new Map(), AE: new Map(), OTHER: new Map(),
  };
  for (const r of rows) {
    const country = countryForBuilding(r.building_code || null);
    const ccy = (r.currency || 'USD').toUpperCase();
    const v = Number(r.host_payout || 0)
      + (opts.includeCommission ? Number(r.commission || 0) : 0);
    if (v === 0) continue;
    const bucket = out[country];
    bucket.set(ccy, (bucket.get(ccy) || 0) + v);
  }
  return out;
}

// Render a per-country line "Egypt: $12,345 USD · UAE: 9,070 AED" using
// the country's display currency (preferred when a single currency
// dominates the bucket) plus any other currencies present.
export function formatCountryTotalsLine(
  totals: CountryCurrencyTotals,
  language: 'en' | 'ar' = 'en',
): string {
  const order: CountryCode[] = ['EG', 'AE', 'OTHER'];
  const parts: string[] = [];
  for (const c of order) {
    const m = totals[c];
    if (m.size === 0) continue;
    const entries = Array.from(m.entries()).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) continue;
    const label = language === 'ar' ? COUNTRY_LABEL[c].ar : COUNTRY_LABEL[c].en;
    const inline = entries
      .map(([ccy, v]) => formatMoneyByCurrency(v, ccy))
      .join(' + ');
    parts.push(`${label}: ${inline}`);
  }
  if (parts.length === 0) return language === 'ar' ? 'لا إيراد' : '$0';
  return parts.join(' · ');
}

function formatMoneyByCurrency(v: number, ccy: string): string {
  const rounded = Math.round(v).toLocaleString();
  if (ccy === 'USD') return `$${rounded}`;
  return `${rounded} ${ccy}`;
}

// Group reservation rows by country and return per-country counts. Used
// for arrivals / departures / currently-staying breakouts.
export function countByCountry<T extends { building_code?: string | null }>(
  rows: T[],
): Record<CountryCode, number> {
  const out: Record<CountryCode, number> = { EG: 0, AE: 0, OTHER: 0 };
  for (const r of rows) {
    out[countryForBuilding(r.building_code || null)] += 1;
  }
  return out;
}

export function formatCountByCountryLine(
  counts: Record<CountryCode, number>,
  language: 'en' | 'ar' = 'en',
): string {
  const order: CountryCode[] = ['EG', 'AE', 'OTHER'];
  const parts: string[] = [];
  for (const c of order) {
    if (counts[c] === 0) continue;
    const label = language === 'ar' ? COUNTRY_LABEL[c].ar : COUNTRY_LABEL[c].en;
    parts.push(`${label}: ${counts[c]}`);
  }
  return parts.length > 0 ? parts.join(' · ') : '';
}
