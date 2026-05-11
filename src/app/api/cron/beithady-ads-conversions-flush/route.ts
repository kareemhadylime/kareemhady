import { NextRequest, NextResponse } from 'next/server';
import { flushPendingConversions } from '@/lib/beithady/ads/conversions';
import { supabaseAdmin } from '@/lib/supabase';

// Conversion-event flush — drains the pending queue in ads_conversion_events_log
// every 10 minutes. Each row fires a Meta CAPI request (and once Google +
// TikTok pixel IDs land, those platforms too).

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    const r = await flushPendingConversions();
    const sb = supabaseAdmin();
    await sb.from('ads_sync_log').insert({
      job_name: 'beithady-ads-conversions-flush',
      platform: 'meta',
      started_at: new Date(Date.now() - r.duration_ms).toISOString(),
      finished_at: new Date().toISOString(),
      status: r.errored > 0 ? 'partial' : 'success',
      rows_upserted: r.sent,
      details: r as object,
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
