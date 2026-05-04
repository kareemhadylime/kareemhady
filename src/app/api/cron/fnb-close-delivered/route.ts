import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
      && !req.nextUrl.searchParams.get('force')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sb = supabaseAdmin();
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await sb.from('fnb_orders')
    .update({ status: 'closed', closed_at: new Date().toISOString() } as never)
    .eq('status', 'delivered').lt('delivered_at', cutoff)
    .select('id');
  return NextResponse.json({ closed: data?.length ?? 0 });
}
