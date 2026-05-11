import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Web Vitals beacon receiver. Public endpoint (no auth) because the
// browser sends sendBeacon on page unload — operator credentials aren't
// available. Throttled at the client side by next/web-vitals (one event
// per metric per page load).

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

type WebVitalPayload = {
  metric: string;
  value: number;
  rating?: string;
  path: string;
  building_code?: string;
  navigation_type?: string;
};

export async function POST(req: NextRequest) {
  let body: WebVitalPayload;
  try {
    body = (await req.json()) as WebVitalPayload;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  if (!body.metric || typeof body.value !== 'number' || !body.path) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
  }
  const validMetrics = ['CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB'];
  if (!validMetrics.includes(body.metric)) {
    return NextResponse.json({ ok: false, error: 'invalid_metric' }, { status: 400 });
  }
  // Cap the value to prevent garbage from poisoning aggregates
  if (!Number.isFinite(body.value) || body.value < 0 || body.value > 600_000) {
    return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
  }

  const ua = req.headers.get('user-agent') || null;
  const region = req.headers.get('x-vercel-ip-country') || null;

  const sb = supabaseAdmin();
  await sb.from('web_vitals').insert({
    metric: body.metric,
    value: body.value,
    rating: body.rating || null,
    path: body.path.slice(0, 200),
    building_code: body.building_code || null,
    user_agent: ua?.slice(0, 200) || null,
    navigation_type: body.navigation_type || null,
    region,
  });

  return NextResponse.json({ ok: true });
}
