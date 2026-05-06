import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { listReservationsCheckingOutTodayWithUnsettled } from '@/lib/beithady/fnb/checkout-reminder';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
      && !req.nextUrl.searchParams.get('force')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const cairoHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false }).format(new Date()),
    10,
  );
  if (cairoHour !== 9 && !req.nextUrl.searchParams.get('force')) {
    return NextResponse.json({ skipped: `cairo_hour_${cairoHour}` });
  }
  const items = await listReservationsCheckingOutTodayWithUnsettled();
  // v1 stub: returns the JSON. F&B manager + ops can poll this manually.
  // Future: send via WhatsApp / Slack / email per ops preference.
  return NextResponse.json({ items });
}
