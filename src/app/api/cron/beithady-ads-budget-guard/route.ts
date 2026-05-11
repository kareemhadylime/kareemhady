import { NextRequest, NextResponse } from 'next/server';
import { runBudgetGuard } from '@/lib/beithady/ads/status';

// Auto-pause-on-budget-cap guard. Runs every 30min between Cairo 06:00–22:00
// (vercel.json schedule). Pauses any ACTIVE campaign whose MTD spend has
// crossed its monthly_budget_cap_usd. Cheap to run — one query for the
// campaigns + one aggregate for MTD spend, then per-campaign mutate calls
// only for the ones that need to be paused.

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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
    const r = await runBudgetGuard();
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
