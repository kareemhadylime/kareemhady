import { NextRequest, NextResponse } from 'next/server';
import { runSameDayAlerts } from '@/lib/beithady/same-day-alerts';

// Phase L — Same-day-booking WhatsApp alerts.
// Schedule (vercel.json): every 15 min. Handler gates on Cairo hour
// 9 ≤ h ≤ 21 — outside that window the function exits cheap. Manual
// trigger via `?force=1&secret=<CRON_SECRET>` for QA.
//
// Detects reservations created today after 09:00 Cairo with check_in_date =
// today and broadcasts a WhatsApp notification to GR + Ops + admin
// recipients so the unit can be prepped and a welcome message sent
// before the guest arrives. Fully idempotent via `beithady_same_day_alerts.reservation_id`.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  // SECURITY: fail closed when the secret isn't configured. Open by
  // default would silently let unauthenticated callers fire the alert
  // path on prod.
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (
    req.nextUrl.searchParams.get('force') === '1' &&
    req.nextUrl.searchParams.get('secret') === expected
  ) {
    return true;
  }
  return false;
}

function cairoNowParts(): { hour: number; iso: string } {
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

  // Gate: 9 ≤ Cairo hour ≤ 21. Same-day bookings late at night rarely
  // need a real-time alert (the property is closed for new arrivals
  // and ops/GR aren't on duty). Force flag bypasses for QA.
  if (!force && (hour < 9 || hour > 21)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'outside_active_window',
      cairo_hour: hour,
      cairo_date: iso,
    });
  }

  try {
    const result = await runSameDayAlerts({ cairoDate: iso });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg, phase: 'route' },
      { status: 500 },
    );
  }
}
