import { NextRequest, NextResponse } from 'next/server';
import { runDaily, isCairo9AM } from '@/lib/run-daily';

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get('force') === '1';
  if (!force && !isCairo9AM()) {
    return NextResponse.json({ skipped: true, reason: 'not 9AM Cairo' });
  }

  const result = await runDaily('cron');
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export const maxDuration = 60;
