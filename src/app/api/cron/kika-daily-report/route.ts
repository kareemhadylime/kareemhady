import { NextRequest, NextResponse } from 'next/server';
import { runKikaDailyReport } from '@/lib/kika-daily-report/run';

// Vercel cron entrypoint for the KIKA Daily Performance Report.
// Schedule (vercel.json): every 30 min between 06:00 and 21:30 UTC.
// Handler gates on Cairo hour ≥ 9 unless `?force=1`. Each tick is
// idempotent: if today's snapshot is already delivered, returns
// `already_complete` and exits cheaply.
//
// Snapshot expiry + cleanup is handled by the existing
// `beithady-daily-report-cleanup` route — its SQL filters by
// `expires_at` only, so KIKA rows are cleaned by the same hourly cron
// without needing a duplicate cleanup endpoint.

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get('force') === '1';

  try {
    const result = await runKikaDailyReport({
      trigger: force ? 'force' : 'cron',
      forceTimeGate: force,
    });
    return NextResponse.json(result, {
      status: result.ok ? 200 : 500,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg, phase: 'route' },
      { status: 500 }
    );
  }
}

// 60-day corpus load + 7 section builders + PDF render + WhatsApp + email.
// Mirrors Beithady's 180s budget — same workload class.
export const maxDuration = 180;
export const dynamic = 'force-dynamic';
