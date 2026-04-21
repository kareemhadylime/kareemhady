import { NextRequest, NextResponse } from 'next/server';
import { runOdooSync } from '@/lib/run-odoo-sync';

// Scheduled Odoo sync. Fires daily at 04:00 UTC (07:00 Cairo summer / 06:00
// winter) — staggered before the Gmail cron at 06:00/07:00 UTC so the two
// workloads don't compete for Vercel function time.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runOdooSync('cron');
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
