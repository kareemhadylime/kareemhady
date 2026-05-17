import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredSnapshots } from '@/lib/beithady-daily-report/run';
import { cleanupExpiredAdsSnapshots } from '@/lib/beithady/ads/snapshot';

// Hourly cleanup: clears pdf_bytes + payload from snapshots past their
// 48-hour expiry. Tokens become invalid (the [token] route checks
// expires_at on read), and the heavy bytes free up so we don't grow
// unbounded.
// V4 (2026-05-17): also cleans ads_dashboard_snapshots from BH Ads
// V4 share links — same 48h expiry, same soft-delete pattern.

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const [daily, ads] = await Promise.all([
      cleanupExpiredSnapshots(),
      cleanupExpiredAdsSnapshots(),
    ]);
    return NextResponse.json({ daily, ads });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export const maxDuration = 30;
export const dynamic = 'force-dynamic';
