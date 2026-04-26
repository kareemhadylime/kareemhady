import { NextRequest, NextResponse } from 'next/server';
import { runDailyReport } from '@/lib/beithady-daily-report/run';

// Vercel cron entrypoint for the Beithady Daily Report.
// Schedule (vercel.json): every 30 min between 06:00 and 21:30 UTC.
// Handler gates on Cairo hour ≥ 9 unless `?force=1`. Each tick is
// idempotent: if today's snapshot is already delivered, returns
// `already_complete` and exits cheaply.

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
    const result = await runDailyReport({
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

export const maxDuration = 120;
export const dynamic = 'force-dynamic';
