import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function authed(req: NextRequest) {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
}

function inSilentWindow(): boolean {
  const cairoHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false }).format(new Date()),
    10,
  );
  return cairoHour >= 23 || cairoHour < 7;
}

export async function GET(req: NextRequest) {
  if (!authed(req) && !req.nextUrl.searchParams.get('force')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (inSilentWindow() && !req.nextUrl.searchParams.get('force')) {
    return NextResponse.json({ skipped: 'cairo_overnight' });
  }
  const sb = supabaseAdmin();
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const fortyFiveMinAgo = new Date(Date.now() - 45 * 60_000).toISOString();
  const stale = await sb.from('fnb_orders')
    .select('id, order_number, building_code, unit_code, status, submitted_at, preparing_at')
    .or(`and(status.eq.submitted,submitted_at.lt.${tenMinAgo}),and(status.eq.preparing,preparing_at.lt.${fortyFiveMinAgo})`);

  for (const o of ((stale.data ?? []) as Array<{ id: string; status: string; preparing_at: string | null; submitted_at: string }>)) {
    await sb.from('beithady_audit_log').insert({
      module: 'fnb',
      actor_kind: 'system',
      action: 'order.stale',
      target_type: 'order',
      target_id: o.id,
      after: { status: o.status, since: o.preparing_at ?? o.submitted_at },
    } as never);
  }
  return NextResponse.json({ flagged: stale.data?.length ?? 0 });
}
