import { NextRequest, NextResponse } from 'next/server';
import { syncAllItemPrices } from '@/lib/beithady/inventory/amazon-eg-sourcer';
import { recordAudit } from '@/lib/beithady/audit';

export const dynamic = 'force-dynamic';
// Probing 70+ items via Claude web_fetch can take 5-8 min worst case
// (4 concurrent × ~10s each × ceil(N/4)). 300s is the Vercel max.
export const maxDuration = 300;

// Daily Amazon EG price refresh — `0 4 * * *` UTC = 06:00 Cairo (DST-aware
// like beithady-comm-sync). Fills the amazon_eg_price_egp column the
// estimator uses; until this runs, costs fall back to default_cost_egp
// (which is just the seed placeholder).
//
// Manual trigger: `?force=1&secret=$CRON_SECRET` to bypass the bearer-auth
// path during smoke tests.

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return true;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) {
    return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const limitParam = req.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Math.max(1, Math.min(500, Number(limitParam))) : undefined;

  try {
    const stats = await syncAllItemPrices({ limit });
    await recordAudit({
      module: 'inventory',
      action: 'amazon_eg.sourcer_run',
      metadata: { ...stats, source: 'cron', limit: limit || null },
    });
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
