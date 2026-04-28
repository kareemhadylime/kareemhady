import { NextRequest, NextResponse } from 'next/server';
import { processGuestyWebhook } from '@/lib/guesty-webhook';
import { supabaseAdmin } from '@/lib/supabase';

// Phase O — Guesty webhook receiver (real-time inbox).
//
// Auth: shared secret via query param ?secret=<env GUESTY_WEBHOOK_SECRET>.
// Guesty webhook subscriptions support arbitrary URL params, so we
// configure the URL as:
//   https://limeinc.vercel.app/api/webhook/guesty/conversation?secret=<value>
//
// Guesty doesn't publicly document HMAC headers; if/when they do, swap
// to header-based validation in checkAuth() below. Until then, the
// secret in the URL path + the unique_key idempotency in the events
// table are our defenses.
//
// Always return 2xx fast — Guesty retries on non-2xx. Errors get logged
// to guesty_webhook_events.status='error' with the message; we still
// 200 back to Guesty so they don't pile up retries.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.GUESTY_WEBHOOK_SECRET || '';
  if (!expected) return false;
  const got = req.nextUrl.searchParams.get('secret') || '';
  if (got !== expected) return false;
  return true;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    // Log the attempt for forensics, but don't expose detail to caller.
    try {
      const body = await req.text();
      const sb = supabaseAdmin();
      await sb.from('guesty_webhook_events').insert({
        event_name: 'unauthorized',
        unique_key: null,
        payload: { _raw: body.slice(0, 2000) },
        status: 'unauthorized',
        source_ip: req.headers.get('x-forwarded-for') || null,
        http_headers: { user_agent: req.headers.get('user-agent') },
      });
    } catch {
      // best-effort; failing the audit must not block the 401
    }
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

  const result = await processGuestyWebhook(payload as Parameters<typeof processGuestyWebhook>[0], {
    userAgent: req.headers.get('user-agent'),
    sourceIp: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
    contentType: req.headers.get('content-type'),
  });

  // Always 2xx — even on error. We've logged the error in the events
  // table; making Guesty retry doesn't help. Caller can replay from the
  // events table via /api/webhook/guesty/conversation/replay (future).
  if (result.ok) {
    return NextResponse.json(result, { status: 200 });
  }
  // Internal error — return 200 to prevent retries but include error
  // for visibility in Guesty's webhook logs.
  return NextResponse.json(result, { status: 200 });
}

// Healthcheck — Guesty's webhook UI tests with a GET to verify the URL is alive.
export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    service: 'guesty-conversation-webhook',
    auth_configured: Boolean(process.env.GUESTY_WEBHOOK_SECRET),
    auth_passed: checkAuth(req),
  });
}
