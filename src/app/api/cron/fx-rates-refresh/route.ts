import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { invalidateFxRatesCache } from '@/lib/fx-rates';

// Weekly FX-rate refresh from open.er-api.com (free, no API key).
// Pulls USD-base rates and inverts them so the table stores "1 unit of
// <currency> in USD" — matches Stripe + Guesty + Odoo convention.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SOURCE = 'open.er-api.com';
const CURRENCIES_OF_INTEREST = [
  'USD', 'EGP', 'AED', 'EUR', 'GBP', 'SAR', 'KWD', 'QAR', 'JOD',
  'RUB', 'PLN', 'CZK', 'TRY', 'INR', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK',
];

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  try {
    // API: https://open.er-api.com/v6/latest/USD
    // Returns { base_code: 'USD', rates: { EUR: 0.92, EGP: 49.5, ... } }
    const r = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, step: 'fetch', status: r.status }, { status: 500 });
    }
    const j = (await r.json()) as {
      result?: string;
      base_code?: string;
      rates?: Record<string, number>;
      time_last_update_utc?: string;
    };
    if (j.result !== 'success' || !j.rates) {
      return NextResponse.json({ ok: false, step: 'parse', body: j }, { status: 500 });
    }

    // The API returns 1 USD = X <currency>. Invert to rate_to_usd.
    const asOfDate = new Date().toISOString().slice(0, 10);
    const upserts: Array<{ currency: string; rate_to_usd: number; as_of_date: string; source: string }> = [];
    for (const code of CURRENCIES_OF_INTEREST) {
      const usdToCurrency = j.rates[code];
      if (typeof usdToCurrency !== 'number' || usdToCurrency === 0) continue;
      const currencyToUsd = code === 'USD' ? 1 : 1 / usdToCurrency;
      upserts.push({
        currency: code,
        rate_to_usd: Number(currencyToUsd.toFixed(8)),
        as_of_date: asOfDate,
        source: SOURCE,
      });
    }

    const sb = supabaseAdmin();
    const { error } = await sb.from('fx_rates_usd').upsert(upserts, { onConflict: 'currency' });
    if (error) {
      return NextResponse.json({ ok: false, step: 'upsert', error: error.message }, { status: 500 });
    }

    invalidateFxRatesCache();

    return NextResponse.json({
      ok: true,
      upserted: upserts.length,
      as_of_date: asOfDate,
      source: SOURCE,
      sample: upserts.slice(0, 5),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
