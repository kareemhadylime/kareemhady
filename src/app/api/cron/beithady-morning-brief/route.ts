import { NextRequest, NextResponse } from 'next/server';
import { runMorningBriefAll } from '@/lib/beithady/morning-brief/run';

// Phase K.1 — Daily Morning Brief cron.
// Fires at 0 5 * * * + 0 6 * * * UTC and gates on current Cairo hour
// matching 8 (mirrors Phase C late-reply-digest DST handling).

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return true;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

function cairoNowParts(): { hour: number; iso: string } {
  // Convert UTC now → Cairo. Egypt observes DST, so check both UTC+2 and UTC+3.
  // We rely on the Intl API which respects the tz database.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(new Date()).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const iso = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = parseInt(parts.hour || '0', 10);
  return { hour, iso };
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { hour, iso } = cairoNowParts();
  const force = req.nextUrl.searchParams.get('force') === '1';

  // Only fire once per day at 8am Cairo (gate UTC dual-cron via DST).
  if (!force && hour !== 8) {
    return NextResponse.json({ ok: true, skipped: true, cairo_hour: hour, cairo_date: iso });
  }

  // Build the public base URL for "view on web" links.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || `https://${req.headers.get('host') || 'limeinc.vercel.app'}`;

  try {
    const results = await runMorningBriefAll({ dateIso: iso, baseUrl });
    return NextResponse.json({ ok: true, cairo_date: iso, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
