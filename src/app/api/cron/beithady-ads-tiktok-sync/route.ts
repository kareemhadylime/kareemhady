import { NextRequest, NextResponse } from 'next/server';
import { syncTikTokAds } from '@/lib/beithady/ads/tiktok-sync';

// Daily TikTok paid-ads sync — pulls campaigns + ad groups + ads + last-30-day metrics.

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
  if (!force && hour !== 7 && hour !== 8) {
    return NextResponse.json({ ok: true, skipped: 'not_cairo_window', cairo_hour: hour });
  }

  try {
    const res = await syncTikTokAds();
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
