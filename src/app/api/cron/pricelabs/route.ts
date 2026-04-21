import { NextRequest, NextResponse } from 'next/server';
import { runPricelabsSync } from '@/lib/run-pricelabs-sync';

// Daily PriceLabs sync. Schedule: 04:35 UTC (after PL's ~03:00 UTC nightly
// recalc; after Odoo's 04:00 + financial-sync window). 69 listings × ~400ms
// throttle = ~28s + overhead; well within the 300s function cap.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runPricelabsSync('cron');
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
