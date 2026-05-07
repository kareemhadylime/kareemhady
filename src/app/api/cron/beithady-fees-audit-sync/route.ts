// Daily fee-audit data sync — pulls forward calendar from PriceLabs and
// per-listing terms from Guesty. Runs after the existing pricelabs/guesty
// crons so dependencies (pricelabs_listings, guesty_listings) are fresh.

import { NextRequest, NextResponse } from 'next/server';
import { syncPricelabsDailyRates } from '@/lib/beithady/fees-audit/sync-pricelabs-daily';
import { syncGuestyListingTerms } from '@/lib/beithady/fees-audit/sync-guesty-terms';
import { refreshHistoricalCommissionAverages } from '@/lib/beithady/fees-audit/channel-fees';

export const runtime = 'nodejs';
export const maxDuration = 300;

function ok(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return true;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (
    req.nextUrl.searchParams.get('force') === '1' &&
    req.nextUrl.searchParams.get('secret') === expected
  ) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const results: Record<string, unknown> = {};
  try {
    results.pricelabs = await syncPricelabsDailyRates({ daysAhead: 30 });
  } catch (e) {
    results.pricelabs = { error: e instanceof Error ? e.message : String(e) };
  }
  try {
    results.guesty_terms = await syncGuestyListingTerms();
  } catch (e) {
    results.guesty_terms = { error: e instanceof Error ? e.message : String(e) };
  }
  // Refresh historical commission averages weekly (runs every day, but cheap)
  try {
    results.commission_avg = await refreshHistoricalCommissionAverages();
  } catch (e) {
    results.commission_avg = { error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json({ ok: true, ...results });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
