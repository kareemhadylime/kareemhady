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
  // ?rebuild=1 also passes forceRebuild=true, overriding the already_complete
  // short-circuit. Useful when a new payload field (e.g. revenue_mtd_gross_usd
  // added 2026-05-16) is shipped after the morning snapshot already ran —
  // without this you'd have to wait until the next morning for the field
  // to populate. Authorized callers only (same Bearer check above).
  const rebuild = req.nextUrl.searchParams.get('rebuild') === '1';
  // ?date=YYYY-MM-DD forces the run to build a snapshot for a past date.
  // Used for backfilling historical days (e.g. to populate the MoM sub-line
  // on the dashboard, which needs same-day-last-month snapshots to exist).
  // Combined with rebuild=1 + skip_dist=1 it's a no-op idempotent backfill.
  const dateParam = req.nextUrl.searchParams.get('date');
  const skipDist = req.nextUrl.searchParams.get('skip_dist') === '1';
  const dateOverride = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;

  try {
    const result = await runDailyReport({
      trigger: dateOverride ? 'backfill' : force ? 'force' : 'cron',
      forceTimeGate: force || !!dateOverride,
      forceRebuild: rebuild || !!dateOverride,
      skipDistribution: skipDist || !!dateOverride,
      dateOverride,
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

// v2 added 5+ new builders (conversations + payment-checkin + blocks +
// no-show + weekly-digest + paired channels). Bumped from 120s → 180s
// to absorb the worst-case cold start of @react-pdf/renderer + the
// extra Postgres aggregations.
export const maxDuration = 180;
export const dynamic = 'force-dynamic';
