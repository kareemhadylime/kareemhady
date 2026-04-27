import { NextRequest, NextResponse } from 'next/server';
import { getCredential } from '@/lib/credentials';
import { ingestGreenWebhookEvent } from '@/lib/beithady/communication/wa-casual-ingest';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Green-API inbound webhook receiver. Green-API does not sign payloads,
// so the defense-in-depth is:
//   1. Obscure path slug (configured via integration_credentials
//      provider 'green', key 'webhook_path_slug')
//   2. IP allowlist optional via env (GREEN_API_ALLOWED_IPS, comma-sep)
//   3. Idempotent ingest via (green_event_id) unique index
//
// URL pattern: POST /api/webhooks/green/{slug}
// Configure once on Green-API side via the configureGreenInboundWebhook
// helper in src/lib/whatsapp/green-api.ts.

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const expected = (await getCredential('green', 'webhook_path_slug')) || '';
  if (!expected || expected !== slug) {
    return NextResponse.json({ ok: false, error: 'invalid_slug' }, { status: 404 });
  }

  // Optional IP allowlist
  const allowed = (process.env.GREEN_API_ALLOWED_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length > 0) {
    const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || '';
    const ipFirst = ip.split(',')[0].trim();
    if (!allowed.includes(ipFirst)) {
      return NextResponse.json({ ok: false, error: 'ip_not_allowed' }, { status: 403 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'empty_body' }, { status: 400 });
  }

  const result = await ingestGreenWebhookEvent(body as Record<string, unknown>);
  if (!result.ok) {
    return NextResponse.json(result, { status: 200 }); // always 200 so Green-API doesn't retry storms
  }
  return NextResponse.json(result, { status: 200 });
}

// Health check — Green-API hits GET on the URL during webhook
// configuration to verify reachability.
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const expected = (await getCredential('green', 'webhook_path_slug')) || '';
  if (!expected || expected !== slug) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  return NextResponse.json({ ok: true, message: 'beithady green-api webhook ready' });
}
