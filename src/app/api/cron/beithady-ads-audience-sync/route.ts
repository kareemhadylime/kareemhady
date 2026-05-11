import { NextRequest, NextResponse } from 'next/server';
import { syncAllCustomAudiences } from '@/lib/beithady/ads/custom-audiences';
import { supabaseAdmin } from '@/lib/supabase';

// Weekly Meta Customer Match sync — pushes hashed beithady_guests PII
// into the bh_past_guests + bh_vip saved audiences.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
  const startedAt = new Date().toISOString();
  try {
    const results = await syncAllCustomAudiences();
    const sb = supabaseAdmin();
    const totalPushed = results.reduce((s, r) => s + r.rows_pushed, 0);
    const anyError = results.some(r => !r.ok);
    await sb.from('ads_sync_log').insert({
      job_name: 'beithady-ads-audience-sync',
      platform: 'meta',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: anyError ? 'partial' : 'success',
      rows_upserted: totalPushed,
      details: { per_segment: results },
    });
    return NextResponse.json({ ok: !anyError, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
