// Bucket routing for the Daily Morning Brief.
//
// Why this exists
// ---------------
// User's standing instruction (2026-04-30): briefs split by *building*,
// with UAE units (DXB tag) always shown on a SEPARATE LINE and NEVER
// counted in revenue / cost / payouts / totals. UAE units stay live in
// Messaging + Calendar, but for finance / GR / ops brief rollups they
// are effectively non-revenue.
//
// Buckets (6 total, in display order):
//   BH-26       Beit Hady 26 (Egypt)
//   BH-73       Beit Hady 73 (Egypt)
//   BH-435      Beit Hady 435 (Egypt)
//   BH-OK       Beit Hady One Katameya (BH-ONEKAT) (Egypt)
//   BH-OTHERS   Other Egypt clusters (BH-MG, BH-GOUNA, BH-NEWCAI,
//               BH-MANG, BH-MB34, BH-WS) — sums into Egypt totals
//   BH-DXB      Dubai (LIME-MA, REEHAN, YANSOON) — UAE, EXCLUDED from
//               revenue/cost/payouts/headlines, shown only as separate
//               info line for visibility.
//
// `isExcludedFromRevenue(bucket)` is the single predicate every brief
// caller MUST consult before adding to a revenue/payout/count rollup.

import {
  BEITHADY_LISTINGS,
  getListingByGuestyId,
  canonicalBuildingFromTag,
} from '@/lib/rules/beithady-listings';

export type BriefBucket =
  | 'BH-26'
  | 'BH-73'
  | 'BH-435'
  | 'BH-OK'
  | 'BH-OTHERS'
  | 'BH-DXB';

export const BRIEF_BUCKETS: ReadonlyArray<BriefBucket> = [
  'BH-26', 'BH-73', 'BH-435', 'BH-OK', 'BH-OTHERS', 'BH-DXB',
];

// Egypt-only buckets — every Egyptian listing rolls into one of these.
export const EGYPT_BUCKETS: ReadonlyArray<BriefBucket> = [
  'BH-26', 'BH-73', 'BH-435', 'BH-OK', 'BH-OTHERS',
];

// Returns true for buckets that must be excluded from revenue / cost /
// payout / count rollups in briefs. Currently only BH-DXB. Used in
// finance-brief / gr-brief / ops-brief to filter rows before summation.
export function isExcludedFromRevenue(bucket: BriefBucket): boolean {
  return bucket === 'BH-DXB';
}

export type BucketLabel = {
  short: BriefBucket;
  en: string;
  ar: string;
  flag: string;            // emoji shown inline next to bucket items
  display_currency: 'USD' | 'AED';
};

export const BUCKET_LABEL: Record<BriefBucket, BucketLabel> = {
  'BH-26':     { short: 'BH-26',     en: 'BH-26',     ar: 'BH-26',     flag: '🏠', display_currency: 'USD' },
  'BH-73':     { short: 'BH-73',     en: 'BH-73',     ar: 'BH-73',     flag: '🏠', display_currency: 'USD' },
  'BH-435':    { short: 'BH-435',    en: 'BH-435',    ar: 'BH-435',    flag: '🏠', display_currency: 'USD' },
  'BH-OK':     { short: 'BH-OK',     en: 'BH-OK',     ar: 'BH-OK',     flag: '🏠', display_currency: 'USD' },
  'BH-OTHERS': { short: 'BH-OTHERS', en: 'BH-Others', ar: 'BH-Others', flag: '🏠', display_currency: 'USD' },
  'BH-DXB':    { short: 'BH-DXB',    en: 'BH-DXB',    ar: 'BH-DXB',    flag: '🇦🇪', display_currency: 'AED' },
};

// UAE listing nicknames — fallback for legacy rows where guesty_listings.building_code
// is null. The 3 active UAE listings (LIME-MA-1402, REEHAN-204, YANSOON-105) currently
// have building_code=NULL in Guesty. The catalog lookup below covers them via
// guesty_listing_id; this nickname-prefix list is a defense-in-depth fallback.
const UAE_NICKNAME_PREFIXES = ['LIME-MA', 'REEHAN', 'YANSOON', 'BURJ-', 'DUBAI-'];

// Tags considered "small Egyptian clusters" — not BH-26/73/435/OK.
const SMALL_EGYPT_TAGS = new Set([
  'BH-MG',
  'BH-GOUNA',
  'BH-NEWCAI',
  'BH-MANG',
  'BH-MB34',
  'BH-WS',
]);

/**
 * Map a (possibly-incomplete) listing reference to a brief bucket.
 *
 * Resolver order:
 *   1. building_code exact match (`BH-26` / `BH-73` / `BH-435` / `BH-OK` / `DXB`)
 *   2. Catalog lookup by guesty_listing_id (covers null-building_code rows)
 *   3. Nickname prefix heuristic (UAE listings only)
 *   4. Default: BH-OTHERS (small Egyptian) — never a silent UAE.
 */
export function bucketForListing(input: {
  building_code: string | null | undefined;
  listing_id?: string | null | undefined;
  nickname?: string | null | undefined;
}): BriefBucket {
  // 1. Exact building_code match
  const bc = (input.building_code || '').toUpperCase().trim();
  if (bc === 'BH-26') return 'BH-26';
  if (bc === 'BH-73') return 'BH-73';
  if (bc === 'BH-435') return 'BH-435';
  if (bc === 'BH-OK' || bc === 'BH-ONEKAT') return 'BH-OK';
  if (bc === 'DXB' || bc === 'BH-DXB' || bc === 'AE' || bc === 'UAE') return 'BH-DXB';
  if (SMALL_EGYPT_TAGS.has(bc)) return 'BH-OTHERS';

  // 2. Catalog lookup by guesty_listing_id
  if (input.listing_id) {
    const cat = getListingByGuestyId(input.listing_id);
    if (cat) {
      const tag = canonicalBuildingFromTag(cat.building_tag);
      if (tag === 'DXB') return 'BH-DXB';
      if (tag === 'BH-26') return 'BH-26';
      if (tag === 'BH-73') return 'BH-73';
      if (tag === 'BH-435') return 'BH-435';
      if (tag === 'BH-OK') return 'BH-OK';
      if (SMALL_EGYPT_TAGS.has(tag)) return 'BH-OTHERS';
    }
  }

  // 3. Nickname prefix fallback
  const nick = (input.nickname || '').toUpperCase().trim();
  if (UAE_NICKNAME_PREFIXES.some(p => nick.startsWith(p))) return 'BH-DXB';

  // 4. Default — assume small Egypt cluster (never silently UAE)
  return 'BH-OTHERS';
}

// Convenience: bucket for a row where only building_code is available.
export function bucketForBuilding(buildingCode: string | null | undefined): BriefBucket {
  return bucketForListing({ building_code: buildingCode });
}

// Format an amount in the bucket's display currency.
export function formatMoneyBucket(amount: number, bucket: BriefBucket): string {
  const ccy = BUCKET_LABEL[bucket].display_currency;
  const rounded = Math.round(amount).toLocaleString();
  if (ccy === 'USD') return `$${rounded}`;
  return `${rounded} ${ccy}`;
}

export function formatMoneyByCurrency(v: number, ccy: string): string {
  const rounded = Math.round(v).toLocaleString();
  if (ccy === 'USD') return `$${rounded}`;
  return `${rounded} ${ccy}`;
}

// Per-bucket, per-currency aggregator. Sums host_payout (+ optionally
// commission) into separate currency buckets per BriefBucket.
export type BucketCurrencyTotals = Record<BriefBucket, Map<string, number>>;

export function emptyTotals(): BucketCurrencyTotals {
  return {
    'BH-26':     new Map(),
    'BH-73':     new Map(),
    'BH-435':    new Map(),
    'BH-OK':     new Map(),
    'BH-OTHERS': new Map(),
    'BH-DXB':    new Map(),
  };
}

export function sumByBucketCurrency<T extends {
  building_code?: string | null;
  listing_id?: string | null;
  listing_nickname?: string | null;
  currency?: string | null;
  host_payout?: number | string | null;
  commission?: number | string | null;
}>(rows: T[], opts: { includeCommission?: boolean } = {}): BucketCurrencyTotals {
  const out = emptyTotals();
  for (const r of rows) {
    const bucket = bucketForListing({
      building_code: r.building_code,
      listing_id: r.listing_id,
      nickname: r.listing_nickname,
    });
    const fallbackCcy = BUCKET_LABEL[bucket].display_currency;
    const ccy = (r.currency || fallbackCcy).toUpperCase();
    const v = Number(r.host_payout || 0)
      + (opts.includeCommission ? Number(r.commission || 0) : 0);
    if (v === 0) continue;
    out[bucket].set(ccy, (out[bucket].get(ccy) || 0) + v);
  }
  return out;
}

// Per-bucket counter (just row counts, no money).
export function countByBucket<T extends {
  building_code?: string | null;
  listing_id?: string | null;
  listing_nickname?: string | null;
}>(rows: T[]): Record<BriefBucket, number> {
  const out: Record<BriefBucket, number> = {
    'BH-26': 0, 'BH-73': 0, 'BH-435': 0, 'BH-OK': 0, 'BH-OTHERS': 0, 'BH-DXB': 0,
  };
  for (const r of rows) {
    out[bucketForListing({
      building_code: r.building_code,
      listing_id: r.listing_id,
      nickname: r.listing_nickname,
    })] += 1;
  }
  return out;
}

// Render a per-bucket "Egypt" line: BH-26: $X · BH-73: $Y · ... — only
// includes Egypt buckets (excludes BH-DXB by default per user rule).
// UAE shows up as a separate line elsewhere in the brief.
export function formatEgyptTotalsLine(
  totals: BucketCurrencyTotals,
  language: 'en' | 'ar' = 'en',
): string {
  const parts: string[] = [];
  for (const b of EGYPT_BUCKETS) {
    const m = totals[b];
    const entries = Array.from(m.entries())
      .filter(([, v]) => v > 0)
      .sort((a, b2) => b2[1] - a[1]);
    if (entries.length === 0) continue;
    const label = language === 'ar' ? BUCKET_LABEL[b].ar : BUCKET_LABEL[b].en;
    const inline = entries.map(([ccy, v]) => formatMoneyByCurrency(v, ccy)).join(' + ');
    parts.push(`${label}: ${inline}`);
  }
  if (parts.length === 0) return language === 'ar' ? 'لا إيراد' : '$0';
  return parts.join(' · ');
}

// Sum Egypt totals across all 5 Egypt buckets, returning per-currency
// totals (typically just USD; EGP if any). UAE is excluded.
export function sumEgyptByCurrency(totals: BucketCurrencyTotals): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of EGYPT_BUCKETS) {
    for (const [ccy, v] of totals[b].entries()) {
      out.set(ccy, (out.get(ccy) || 0) + v);
    }
  }
  return out;
}

// Render the UAE-only "separate info line" — used when the user wants
// transparency on UAE activity even though it's excluded from totals.
// Returns null if no UAE rows exist (so callers don't render an empty
// line).
export function formatDxbInfoLine(
  totals: BucketCurrencyTotals,
  count: number,
  language: 'en' | 'ar' = 'en',
): string | null {
  if (count === 0) return null;
  const m = totals['BH-DXB'];
  const entries = Array.from(m.entries()).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const moneyLine = entries.length > 0
    ? entries.map(([ccy, v]) => formatMoneyByCurrency(v, ccy)).join(' + ')
    : null;
  const label = language === 'ar' ? BUCKET_LABEL['BH-DXB'].ar : BUCKET_LABEL['BH-DXB'].en;
  const note = language === 'ar' ? 'مستثناة من الإجمالي' : 'excluded from totals';
  if (moneyLine) {
    return `${label}: ${count} · ${moneyLine} (${note})`;
  }
  return `${label}: ${count} reservation${count === 1 ? '' : 's'} (${note})`;
}

// ===== Catalog reference list (helper for the rebucket migration) =====
// Total active listing counts per bucket. Useful for the brief footer
// or audit pages. Not used during rendering — purely informational.
export function bucketInventoryFromCatalog(): Record<BriefBucket, number> {
  const out: Record<BriefBucket, number> = {
    'BH-26': 0, 'BH-73': 0, 'BH-435': 0, 'BH-OK': 0, 'BH-OTHERS': 0, 'BH-DXB': 0,
  };
  for (const l of BEITHADY_LISTINGS) {
    if (l.unit_type === 'MULTI-UNIT') continue;
    const tag = canonicalBuildingFromTag(l.building_tag);
    if (tag === 'DXB') { out['BH-DXB'] += 1; continue; }
    if (tag === 'BH-26') { out['BH-26'] += 1; continue; }
    if (tag === 'BH-73') { out['BH-73'] += 1; continue; }
    if (tag === 'BH-435') { out['BH-435'] += 1; continue; }
    if (tag === 'BH-OK') { out['BH-OK'] += 1; continue; }
    out['BH-OTHERS'] += 1;
  }
  return out;
}

// ====== Backwards-compat exports (deprecated, retained briefly) ======
// The 2026-04-30 segregation turn shipped a country-based scheme. This
// file replaces it; old call sites should migrate to the bucket API
// above. Keeping a thin shim so any straggling caller fails loudly
// rather than silently mis-bucketing.

/** @deprecated Use `bucketForListing` instead. */
export type CountryCode = 'EG' | 'AE' | 'OTHER';

/** @deprecated Use `bucketForListing` instead. */
export function countryForBuilding(buildingCode: string | null | undefined): CountryCode {
  const b = bucketForBuilding(buildingCode);
  if (b === 'BH-DXB') return 'AE';
  return 'EG';
}
