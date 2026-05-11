import { NextRequest, NextResponse } from 'next/server';
import { syncGoogleAds } from '@/lib/beithady/ads/google-sync';

// Daily Google Ads sync — pulls last-30-day campaign + metric rows.
// DST-safe schedule (vercel.json registers UTC 03:30 + 04:30, both fire;
// the handler gates on Cairo local hour == 6:30 so only one runs the work).

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

function cairoHour(): number {
  // Cairo is UTC+2 year-round (no DST since 2014, reinstated 2023 but tracked via tzdb).
  // Use Intl to read the actual local hour reliably.
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric',
    hour12: false,
  });
  return Number(f.format(new Date()));
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const force = req.nextUrl.searchParams.get('force') === '1';
  const hour = cairoHour();
  if (!force && hour !== 6 && hour !== 7) {
    return NextResponse.json({ ok: true, skipped: 'not_cairo_window', cairo_hour: hour });
  }

  try {
    const res = await syncGoogleAds();
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
