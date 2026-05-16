// /api/cron/personal-stock-prices — daily 5PM Cairo (Sun–Thu) job that scrapes
// the latest price from each held instrument's investing.com equities page and
// inserts one row per instrument into personal_stock_current_prices.
//
// Held = v_personal_stock_positions.qty_held > 0. Skips any instrument without
// an investing_url. Uses ?force=1 to bypass the Cairo-hour-17 + weekday gate
// when manually testing.
//
// Vercel cron registration (vercel.json): two DST-safe entries fire at 14:00
// and 15:00 UTC Sun–Thu so 5PM Cairo lands exactly once regardless of EEST/EET.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cairoTodayIso } from '@/lib/fmt-date';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
const PRICE_RE = /data-test="instrument-price-last">([0-9.,]+)/;

function cairoHour(): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      hour12: false,
    }).format(new Date())
  );
}

function cairoWeekday(): number {
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    weekday: 'short',
  }).format(new Date());
  return map[day] ?? -1;
}

async function fetchInvestingPrice(url: string): Promise<number> {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  const m = html.match(PRICE_RE);
  if (!m) throw new Error('instrument-price-last element not found');
  const price = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(price) || price <= 0) throw new Error(`bad price: ${m[1]}`);
  return price;
}

type Result =
  | { ticker: string; instrumentId: number; price: number }
  | { ticker: string; instrumentId: number; error: string };

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  if (!expected || !auth || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  if (!force) {
    if (cairoHour() !== 17) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'not 5pm Cairo' });
    }
    const wd = cairoWeekday();
    if (wd === 5 || wd === 6) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'EGX closed (Fri/Sat)' });
    }
  }

  const sb = supabaseAdmin();

  const positions = await sb
    .from('v_personal_stock_positions')
    .select('instrument_id, qty_held');
  if (positions.error) {
    return NextResponse.json({ ok: false, error: positions.error.message }, { status: 500 });
  }

  const heldIds = [
    ...new Set(
      (positions.data ?? [])
        .filter((p) => Number(p.qty_held) > 0)
        .map((p) => p.instrument_id)
    ),
  ];
  if (!heldIds.length) {
    return NextResponse.json({ ok: true, fetched: 0, inserted: 0, results: [] });
  }

  const instruments = await sb
    .from('personal_stock_instruments')
    .select('id, ticker, investing_url')
    .in('id', heldIds);
  if (instruments.error) {
    return NextResponse.json({ ok: false, error: instruments.error.message }, { status: 500 });
  }

  const today = cairoTodayIso();
  const inserts: Array<{
    instrument_id: number;
    price: number;
    as_of_date: string;
    entered_by: string;
    note: string;
  }> = [];
  const results: Result[] = [];

  for (const ins of instruments.data ?? []) {
    if (!ins.investing_url) {
      results.push({
        ticker: ins.ticker,
        instrumentId: ins.id,
        error: 'no investing_url set',
      });
      continue;
    }
    try {
      const price = await fetchInvestingPrice(ins.investing_url);
      inserts.push({
        instrument_id: ins.id,
        price,
        as_of_date: today,
        entered_by: 'cron',
        note: 'investing.com:auto',
      });
      results.push({ ticker: ins.ticker, instrumentId: ins.id, price });
    } catch (err) {
      results.push({
        ticker: ins.ticker,
        instrumentId: ins.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (inserts.length) {
    const ins = await sb.from('personal_stock_current_prices').insert(inserts);
    if (ins.error) {
      return NextResponse.json(
        { ok: false, error: ins.error.message, results },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    fetched: instruments.data?.length ?? 0,
    inserted: inserts.length,
    asOf: today,
    results,
  });
}
