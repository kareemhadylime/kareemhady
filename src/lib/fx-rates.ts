import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// Cross-currency conversion to USD via the fx_rates_usd table.
// Falls back to a hardcoded sane-default if a currency isn't in the table
// (e.g. an exotic booking that arrived before the weekly cron picked up
// the new currency). Failures never block ROAS or revenue math.

// In-memory cache per warm instance — 1 hour TTL. The cron updates the
// table weekly, so an hour-stale rate at request time is fine.
type Cache = {
  loadedAt: number;
  rates: Record<string, number>;
};
const CACHE_TTL_MS = 60 * 60 * 1000;
let _cache: Cache | null = null;

// Sane fallback rates (matches the seed in 0105_fx_rates_usd.sql)
const FALLBACK_RATES: Record<string, number> = {
  USD: 1.0,
  EGP: 0.0203,
  AED: 0.2723,
  EUR: 1.08,
  GBP: 1.27,
  SAR: 0.2666,
  KWD: 3.25,
  QAR: 0.2747,
  JOD: 1.41,
  RUB: 0.0098,
  PLN: 0.25,
  CZK: 0.043,
};

async function loadRates(): Promise<Record<string, number>> {
  if (_cache && Date.now() - _cache.loadedAt < CACHE_TTL_MS) return _cache.rates;
  const sb = supabaseAdmin();
  const { data } = await sb.from('fx_rates_usd').select('currency, rate_to_usd');
  const rates: Record<string, number> = { ...FALLBACK_RATES };
  for (const r of (data as Array<{ currency: string; rate_to_usd: number }> | null) || []) {
    rates[r.currency.toUpperCase()] = Number(r.rate_to_usd);
  }
  _cache = { loadedAt: Date.now(), rates };
  return rates;
}

export function invalidateFxRatesCache(): void {
  _cache = null;
}

export async function getFxToUsd(currency: string | null | undefined): Promise<number> {
  if (!currency) return 1; // assume USD if currency missing — better than 0
  const code = currency.toUpperCase();
  if (code === 'USD') return 1;
  const rates = await loadRates();
  return rates[code] ?? FALLBACK_RATES[code] ?? 1;
}

export async function convertToUsd(
  amount: number | string | null | undefined,
  currency: string | null | undefined
): Promise<number> {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return 0;
  const rate = await getFxToUsd(currency);
  return n * rate;
}

// Batch helper — preloads all rates once then converts an array of
// (amount, currency) tuples. Cheaper than per-row awaits in a hot path.
export async function convertManyToUsd(
  rows: Array<{ amount: number | null | undefined; currency: string | null | undefined }>
): Promise<number[]> {
  const rates = await loadRates();
  return rows.map(r => {
    const n = Number(r.amount);
    if (!Number.isFinite(n) || n === 0) return 0;
    const code = (r.currency || 'USD').toUpperCase();
    const rate = rates[code] ?? FALLBACK_RATES[code] ?? 1;
    return n * rate;
  });
}

// EGP conversion = go via USD using the rates table (rate_to_usd), then
// divide by the EGP→USD rate. Math: amount * rate_to_usd[src] / rate_to_usd['EGP']
// 1 USD ≈ 49.26 EGP at the fallback rate of EGP=0.0203. The rates table is the
// source of truth — recomputed weekly by a cron.
export async function getFxToEgp(currency: string | null | undefined): Promise<number> {
  const rates = await loadRates();
  const egpToUsd = rates['EGP'] ?? FALLBACK_RATES.EGP;
  if (egpToUsd === 0) return 1;     // defensive; shouldn't happen
  if (!currency) return 1 / egpToUsd;          // assume USD source if missing
  const code = currency.toUpperCase();
  if (code === 'EGP') return 1;
  const srcToUsd = rates[code] ?? FALLBACK_RATES[code] ?? 1;
  return srcToUsd / egpToUsd;
}

export async function convertToEgp(
  amount: number | string | null | undefined,
  currency: string | null | undefined
): Promise<number> {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return 0;
  const rate = await getFxToEgp(currency);
  return n * rate;
}

// Batch helper for EGP conversion — same shape as convertManyToUsd.
export async function convertManyToEgp(
  rows: Array<{ amount: number | null | undefined; currency: string | null | undefined }>
): Promise<number[]> {
  const rates = await loadRates();
  const egpToUsd = rates['EGP'] ?? FALLBACK_RATES.EGP;
  const usdToEgp = egpToUsd === 0 ? 1 : 1 / egpToUsd;
  return rows.map(r => {
    const n = Number(r.amount);
    if (!Number.isFinite(n) || n === 0) return 0;
    const code = (r.currency || 'USD').toUpperCase();
    if (code === 'EGP') return n;
    const srcToUsd = rates[code] ?? FALLBACK_RATES[code] ?? 1;
    return n * srcToUsd * usdToEgp;
  });
}
