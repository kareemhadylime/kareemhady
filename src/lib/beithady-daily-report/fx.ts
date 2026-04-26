import 'server-only';
import { supabaseAdmin } from '../supabase';

// FX rate resolver. All report numbers are USD (Q2 decision).
// AED uses the UAE Central Bank peg (1 USD = 3.6725 AED) — matches the
// existing `beithady-payout-api.ts` constant.
// Other currencies pull from exchangerate.host's free no-key endpoint and
// cache one row per (rate_date, base, quote) in `fx_rates`.

const AED_PER_USD = 3.6725;

// Currencies we expect to see from Guesty/Stripe for Beithady.
type SupportedQuote = 'EGP' | 'AED' | 'USD' | string;

type FxRow = {
  rate_date: string;
  base: string;
  quote: string;
  rate: number;
  source: string;
};

function ymd(d: Date): string {
  // Use UTC date-key to avoid locale drift; fx rates are mid-rate daily.
  return d.toISOString().slice(0, 10);
}

async function readCached(
  date: string,
  quote: string
): Promise<number | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('fx_rates')
    .select('rate')
    .eq('rate_date', date)
    .eq('base', 'USD')
    .eq('quote', quote.toUpperCase())
    .maybeSingle();
  const r = data as { rate: number | string } | null;
  if (!r) return null;
  const n = typeof r.rate === 'string' ? Number(r.rate) : r.rate;
  return Number.isFinite(n) ? n : null;
}

async function writeCached(
  date: string,
  quote: string,
  rate: number,
  source: string
): Promise<void> {
  const sb = supabaseAdmin();
  await sb
    .from('fx_rates')
    .upsert(
      {
        rate_date: date,
        base: 'USD',
        quote: quote.toUpperCase(),
        rate,
        source,
        fetched_at: new Date().toISOString(),
      } satisfies FxRow & { fetched_at: string },
      { onConflict: 'rate_date,base,quote' }
    );
}

async function fetchFromExchangeRateHost(
  date: string,
  quote: string
): Promise<number | null> {
  // Free, no-key endpoint. Historical: GET /{date}?base=USD&symbols=EGP
  // Returns: { success, rates: { EGP: 50.123 }, ... }
  const url = `https://api.exchangerate.host/${date}?base=USD&symbols=${encodeURIComponent(quote.toUpperCase())}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as
      | { rates?: Record<string, number> }
      | null;
    const rate = json?.rates?.[quote.toUpperCase()];
    return typeof rate === 'number' && Number.isFinite(rate) ? rate : null;
  } catch {
    return null;
  }
}

/**
 * Resolve "1 USD = X {quote}" for a given date. Reads cache first, falls
 * back to the AED peg or the public exchangerate.host endpoint, then
 * caches. Returns null if the rate cannot be resolved (caller should
 * record a build warning).
 */
export async function usdRate(
  quote: SupportedQuote,
  date: Date = new Date()
): Promise<{ rate: number; source: string } | null> {
  const q = String(quote || '').toUpperCase();
  if (!q || q === 'USD') return { rate: 1, source: 'identity' };

  const dateKey = ymd(date);

  const cached = await readCached(dateKey, q);
  if (cached != null) return { rate: cached, source: 'cache' };

  if (q === 'AED') {
    await writeCached(dateKey, q, AED_PER_USD, 'aed_peg').catch(() => {});
    return { rate: AED_PER_USD, source: 'aed_peg' };
  }

  const fetched = await fetchFromExchangeRateHost(dateKey, q);
  if (fetched != null) {
    await writeCached(dateKey, q, fetched, 'exchangerate.host').catch(() => {});
    return { rate: fetched, source: 'exchangerate.host' };
  }

  // Last resort: yesterday's cache (handles weekend FX gaps).
  const y = new Date(date.getTime() - 86400_000);
  const yest = await readCached(ymd(y), q);
  if (yest != null) return { rate: yest, source: 'cache_stale_1d' };

  return null;
}

/**
 * Convert an amount in `currency` to USD. Returns null if the currency
 * is unknown and not resolvable via FX.
 */
export async function toUsd(
  amount: number | null | undefined,
  currency: string | null | undefined,
  date: Date = new Date()
): Promise<number | null> {
  if (amount == null || !Number.isFinite(amount)) return null;
  const c = String(currency || 'USD').toUpperCase();
  if (c === 'USD') return amount;
  const fx = await usdRate(c, date);
  if (!fx) return null;
  // 1 USD = fx.rate {c}; so {c} → USD = amount / fx.rate
  return Math.round((amount / fx.rate) * 100) / 100;
}
