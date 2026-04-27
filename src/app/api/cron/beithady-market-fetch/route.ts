import { NextRequest, NextResponse } from 'next/server';
import { recomputeSignals, runCountryBackfill } from '@/lib/beithady/market/signals';
import { recordAudit } from '@/lib/beithady/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Monthly market refresh — runs `0 3 1 * *` UTC (05:00 Cairo on the 1st).
// 1. Re-runs the country backfill so any new guests added since the last
//    cron get their residence_country.
// 2. Recomputes market signals (under/over/aligned/unique).
//
// Future enhancement: scrape CAPMAS + UN Tourism + Google Trends to
// refresh beithady_market_inbound with current monthly data instead of
// the seeded 2024 baseline.

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return true;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    const backfill = await runCountryBackfill();
    const signalsCount = await recomputeSignals();
    await recordAudit({
      module: 'communication',
      action: 'market_fetch_run',
      metadata: { backfill, signals_count: signalsCount, source: 'cron' },
    });
    return NextResponse.json({ ok: true, backfill, signals_count: signalsCount });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
