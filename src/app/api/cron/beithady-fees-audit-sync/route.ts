// Daily fee-audit data sync — pulls forward calendar from PriceLabs and
// per-listing terms from Guesty. Runs after the existing pricelabs/guesty
// crons so dependencies (pricelabs_listings, guesty_listings) are fresh.

import { NextRequest, NextResponse } from 'next/server';
import { syncPricelabsDailyRates } from '@/lib/beithady/fees-audit/sync-pricelabs-daily';
import { syncGuestyListingTerms } from '@/lib/beithady/fees-audit/sync-guesty-terms';
// Note: refreshHistoricalCommissionAverages is intentionally NOT imported.
// Per real OTA invoice review (2026-05-07), commission rates are now manually
// curated in beithady_channel_fees_config (15.5% + VAT on Airbnb, 15% on
// Booking/Other) and the historical-average derivation would clobber the
// Airbnb VAT split with a single effective rate (~17.67%). The function
// remains in channel-fees.ts as dormant code in case the model changes.

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
  // Historical commission-average refresh disabled (2026-05-07): rates are
  // now manually curated to match real OTA invoices. See import comment.
  results.commission_avg = { skipped: 'manually_curated' };

  return NextResponse.json({ ok: true, ...results });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
