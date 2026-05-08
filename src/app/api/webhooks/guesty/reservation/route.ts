import 'server-only';
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Guesty reservation webhook — fires on reservation.created / updated / cancelled.
// Upserts a single reservation row into guesty_reservations immediately,
// giving real-time data instead of waiting for the nightly (now every-4h) sync.
//
// Guesty webhook URL to configure:
//   https://limeinc.vercel.app/api/webhooks/guesty/reservation?secret=<GUESTY_WEBHOOK_SECRET>
//
// Auth: shared secret via ?secret= query param (Guesty doesn't support header auth yet).
// Always return 2xx — Guesty retries on non-2xx. DB errors return 503 so Guesty retries.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.GUESTY_WEBHOOK_SECRET || '';
  const got = req.nextUrl.searchParams.get('secret') || '';
  if (!expected || !got) return false;
  try {
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function toDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const slice = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Map a Guesty webhook data payload to our guesty_reservations schema. */
function mapReservation(data: Record<string, unknown>) {
  const guest = (data.guest as Record<string, unknown>) ?? {};
  const money = (data.money as Record<string, unknown>) ?? {};
  const integration = (data.integration as Record<string, unknown>) ?? {};

  return {
    id: String(data._id),
    confirmation_code:
      typeof data.confirmationCode === 'string' ? data.confirmationCode : null,
    platform_confirmation_code:
      typeof integration.confirmationCode === 'string'
        ? integration.confirmationCode
        : null,
    status: typeof data.status === 'string' ? data.status : null,
    source: typeof data.source === 'string' ? data.source : null,
    integration_platform:
      typeof integration.platform === 'string' ? integration.platform : null,
    listing_id: typeof data.listingId === 'string' ? data.listingId : null,
    guest_name: (guest.fullName as string) || null,
    guest_email: (guest.email as string) || null,
    guest_phone: (guest.phone as string) || null,
    check_in_date: toDate(data.checkInDateLocalized),
    check_out_date: toDate(data.checkOutDateLocalized),
    nights: typeof data.nightsCount === 'number' ? data.nightsCount : null,
    guests: typeof data.guestsCount === 'number' ? data.guestsCount : null,
    currency: typeof money.currency === 'string' ? money.currency : null,
    host_payout: toNumber(money.hostPayout),
    guest_paid: toNumber(money.guestPaid),
    fare_accommodation: toNumber(money.fareAccommodation),
    cleaning_fee: toNumber(money.cleaningFee),
    created_at: typeof data.createdAt === 'string' ? data.createdAt : null,
    updated_at: typeof data.updatedAt === 'string' ? data.updatedAt : null,
    cancelled_at: typeof data.cancelledAt === 'string' ? data.cancelledAt : null,
  };
}

export async function POST(req: NextRequest) {
  const sb = supabaseAdmin();

  if (!checkAuth(req)) {
    try {
      const body = await req.text();
      await sb.from('guesty_webhook_events').insert({
        event_name: 'unauthorized',
        unique_key: null,
        payload: { _raw: body.slice(0, 2000) },
        status: 'unauthorized',
        source_ip: req.headers.get('x-forwarded-for') || null,
        http_headers: { user_agent: req.headers.get('user-agent') },
      });
    } catch { /* log failure is non-critical */ }
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `invalid JSON: ${e instanceof Error ? e.message : 'unknown'}` },
      { status: 400 },
    );
  }

  const body = payload as Record<string, unknown>;
  const eventName = (body.eventName as string) || (body.event as string) || 'unknown';
  const uniqueKey = (body.uniqueKey as string) || null;
  const data = body.data as Record<string, unknown> | undefined;

  // Log every event first (idempotency + audit trail).
  try {
    await sb.from('guesty_webhook_events').insert({
      event_name: eventName,
      unique_key: uniqueKey,
      payload: body,
      status: 'received',
      source_ip: req.headers.get('x-forwarded-for') || null,
      http_headers: { user_agent: req.headers.get('user-agent') },
    });
  } catch { /* non-critical — continue processing */ }

  // Only process reservation events.
  const isReservationEvent =
    eventName.startsWith('reservation') ||
    eventName.includes('Reservation');

  if (!isReservationEvent || !data?._id) {
    return NextResponse.json({ ok: true, skipped: true, eventName });
  }

  try {
    const row = mapReservation(data);
    const { error } = await sb
      .from('guesty_reservations')
      .upsert(row, { onConflict: 'id' });

    if (error) throw new Error(error.message);

    // Update the event log to 'processed'.
    if (uniqueKey) {
      await sb
        .from('guesty_webhook_events')
        .update({ status: 'processed' })
        .eq('unique_key', uniqueKey);
    }

    return NextResponse.json({ ok: true, reservationId: row.id, eventName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[guesty-reservation-webhook] upsert error:', msg);

    // Mark event as errored.
    try {
      if (uniqueKey) {
        await sb
          .from('guesty_webhook_events')
          .update({ status: 'error', payload: { ...body, _error: msg } })
          .eq('unique_key', uniqueKey);
      }
    } catch { /* ignore secondary failure */ }

    // Return 503 for DB/network errors so Guesty retries.
    const isRecoverable = /database|timeout|connection|network|econnreset|etimedout/i.test(msg);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: isRecoverable ? 503 : 200 },
    );
  }
}

// Healthcheck — Guesty's webhook UI tests with a GET to verify the URL is alive.
export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    service: 'guesty-reservation-webhook',
    auth_configured: Boolean(process.env.GUESTY_WEBHOOK_SECRET),
    auth_passed: checkAuth(req),
  });
}
