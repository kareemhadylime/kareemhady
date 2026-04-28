import { NextRequest, NextResponse } from 'next/server';
import { guestyFetch } from '@/lib/guesty';

// Phase O — Programmatic webhook registration via Guesty Open API.
// Workaround for Guesty UI's "Operating in read-only mode" tooltip
// some plans/roles see on the Webhooks settings page.
//
// POST https://open-api.guesty.com/v1/webhooks
//   body: { url: string, events: string[] }
//
// Auth: Bearer CRON_SECRET via header or ?secret= query param.
//
// Behaviour:
//   1. List existing webhooks
//   2. If our target URL is already registered → return 'exists'
//   3. Else create one with the requested events → return 'created'
//
// Idempotent. Safe to re-run.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TARGET_PATH = '/api/webhook/guesty/conversation';
const DEFAULT_EVENTS = [
  'reservation.messageReceived',
  'reservation.messageSent',
];

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

type GuestyWebhook = {
  _id?: string;
  id?: string;
  url: string;
  events: string[];
  enabled?: boolean;
  createdAt?: string;
};

type GuestyWebhookListResponse =
  | { results: GuestyWebhook[] }
  | { data: GuestyWebhook[] }
  | GuestyWebhook[]
  | { fields: GuestyWebhook[] };

function extractList(raw: unknown): GuestyWebhook[] {
  if (Array.isArray(raw)) return raw as GuestyWebhook[];
  if (raw && typeof raw === 'object') {
    const r = raw as GuestyWebhookListResponse;
    if ('results' in r && Array.isArray(r.results)) return r.results;
    if ('data' in r && Array.isArray(r.data)) return r.data;
    if ('fields' in r && Array.isArray((r as { fields: GuestyWebhook[] }).fields)) {
      return (r as { fields: GuestyWebhook[] }).fields;
    }
  }
  return [];
}

async function handleRegister(req: NextRequest): Promise<NextResponse> {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const webhookSecret = process.env.GUESTY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { ok: false, error: 'GUESTY_WEBHOOK_SECRET not set in env — set that first then retry' },
      { status: 400 },
    );
  }

  // Build the full target URL using the request's host (works in Vercel preview + prod)
  const customUrl = req.nextUrl.searchParams.get('url');
  const targetUrl = customUrl
    || `https://${req.nextUrl.host}${TARGET_PATH}?secret=${encodeURIComponent(webhookSecret)}`;

  // Optional events override via ?events=a,b,c
  const customEvents = req.nextUrl.searchParams.get('events');
  const events = customEvents ? customEvents.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_EVENTS;

  // 1. List existing webhooks
  let existing: GuestyWebhook[] = [];
  try {
    const raw = await guestyFetch<unknown>('/webhooks', { method: 'GET' });
    existing = extractList(raw);
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: `Failed to list existing webhooks: ${e instanceof Error ? e.message : String(e)}`,
      hint: 'Check GUESTY_CLIENT_ID / GUESTY_CLIENT_SECRET / GUESTY_ACCOUNT_ID in env',
    }, { status: 500 });
  }

  // 2. Match by URL (compare path-only since the secret may vary)
  const targetUrlNoSecret = targetUrl.split('?')[0];
  const matched = existing.find(w => w.url && w.url.split('?')[0] === targetUrlNoSecret);

  if (matched) {
    // Already registered. Diff events for visibility.
    const currentEvents = matched.events || [];
    const missingEvents = events.filter(e => !currentEvents.includes(e));
    return NextResponse.json({
      ok: true,
      status: 'exists',
      webhook: matched,
      missing_events: missingEvents,
      note: missingEvents.length > 0
        ? `Webhook exists but is missing ${missingEvents.length} event(s). Use Guesty UI or pass &replace=1 to update.`
        : 'All requested events already subscribed.',
    });
  }

  // 3. Create new webhook
  try {
    const created = await guestyFetch<GuestyWebhook>('/webhooks', {
      method: 'POST',
      body: { url: targetUrl, events },
    });
    return NextResponse.json({
      ok: true,
      status: 'created',
      webhook: created,
      note: `Registered ${events.length} event(s) → ${targetUrl.replace(webhookSecret, '<redacted>')}`,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: `Failed to create webhook: ${e instanceof Error ? e.message : String(e)}`,
      payload_attempted: { url: targetUrl.replace(webhookSecret, '<redacted>'), events },
      existing_count: existing.length,
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) { return handleRegister(req); }
export async function GET(req: NextRequest) { return handleRegister(req); }
