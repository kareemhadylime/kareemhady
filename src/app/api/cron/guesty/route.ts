import { NextRequest, NextResponse } from 'next/server';
import { runGuestySync } from '@/lib/run-guesty-sync';

// Daily Guesty mirror refresh. Scheduled 04:40 UTC (after Odoo + PriceLabs).
// Pulls ~100 listings + last 365d reservations. Typically <60s.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runGuestySync('cron');
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
