import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredSnapshots } from '@/lib/beithady-daily-report/run';

// Hourly cleanup: clears pdf_bytes + payload from snapshots past their
// 48-hour expiry. Tokens become invalid (the [token] route checks
// expires_at on read), and the heavy bytes free up so we don't grow
// unbounded.

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const r = await cleanupExpiredSnapshots();
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export const maxDuration = 30;
export const dynamic = 'force-dynamic';
