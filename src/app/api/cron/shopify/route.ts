import { NextRequest, NextResponse } from 'next/server';
import { runShopifySync } from '@/lib/run-shopify-sync';

// Daily Kika Shopify order mirror refresh. Scheduled 04:45 UTC (after
// Odoo + PriceLabs + Guesty crons).

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runShopifySync('cron');
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
