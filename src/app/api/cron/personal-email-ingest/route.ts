import { NextResponse } from 'next/server';
import { ingestPersonalEmails } from '@/lib/personal-email/ingest';

export const dynamic = 'force-dynamic';

const CAIRO_TZ = 'Africa/Cairo';

function cairoHour(now = new Date()): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TZ, hour: 'numeric', hour12: false,
  });
  return Number(fmt.format(now));
}

export async function GET(req: Request) {
  // Bearer auth (Vercel cron sends this; manual hits with /personal/email's
  // Refresh button POST to this path with the same header set server-side).
  const auth = req.headers.get('authorization') ?? '';
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  const trigger = url.searchParams.get('trigger') === 'manual' ? 'manual' : 'cron';

  // Ingest window: 6 AM – 11 PM Cairo. Outside the window, skip (unless force=1).
  if (!force) {
    const h = cairoHour();
    if (h < 6 || h > 23) {
      return NextResponse.json({ ok: true, skipped: 'outside_cairo_window', hour: h });
    }
  }

  try {
    const { runId } = await ingestPersonalEmails({ trigger });
    return NextResponse.json({ ok: true, run_id: runId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

// Manual refresh button posts here with the same secret server-side.
export const POST = GET;
