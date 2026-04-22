import { NextRequest, NextResponse } from 'next/server';
import { shopifyFetch } from '@/lib/shopify';

// One-shot admin endpoint — POSTs webhook subscriptions to Shopify so our
// /api/webhooks/shopify endpoint starts receiving real-time events.
// Call once after the OAuth install. Idempotent: re-hitting is safe —
// Shopify dedupes by (topic, address) and returns 422 with an "already
// exists" error we swallow.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" -X POST \
//     https://limeinc.vercel.app/api/shopify/register-webhooks

const TOPICS = [
  'orders/create',
  'orders/updated',
  'orders/fulfilled',
  'orders/partially_fulfilled',
  'orders/cancelled',
  'orders/paid',
  'refunds/create',
];

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || 'https://limeinc.vercel.app';
  const address = `${appUrl.replace(/\/+$/, '')}/api/webhooks/shopify`;

  // 1. List existing webhooks so we can report which ones we updated vs
  // created. Also lets us skip identical registrations.
  let existing: Array<{ id: number; topic: string; address: string }> = [];
  try {
    const res = await shopifyFetch<{
      webhooks: Array<{ id: number; topic: string; address: string }>;
    }>('/webhooks.json');
    existing = res?.webhooks || [];
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: `list webhooks failed: ${e instanceof Error ? e.message : e}`,
      },
      { status: 500 }
    );
  }

  const results: Array<{
    topic: string;
    status: 'created' | 'exists' | 'updated' | 'error';
    detail?: string;
  }> = [];

  for (const topic of TOPICS) {
    const hit = existing.find(
      w => w.topic === topic && w.address === address
    );
    if (hit) {
      results.push({ topic, status: 'exists', detail: `id=${hit.id}` });
      continue;
    }
    try {
      await shopifyFetch('/webhooks.json', {
        method: 'POST',
        body: {
          webhook: {
            topic,
            address,
            format: 'json',
          },
        },
      });
      results.push({ topic, status: 'created' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 422 + "has already been taken" = race / existing registration
      if (/already.*been.*taken|has already/i.test(msg)) {
        results.push({ topic, status: 'exists', detail: 'raced' });
      } else {
        results.push({ topic, status: 'error', detail: msg.slice(0, 200) });
      }
    }
  }

  const created = results.filter(r => r.status === 'created').length;
  const exists = results.filter(r => r.status === 'exists').length;
  const errors = results.filter(r => r.status === 'error').length;

  return NextResponse.json({
    ok: errors === 0,
    address,
    created,
    exists,
    errors,
    results,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
