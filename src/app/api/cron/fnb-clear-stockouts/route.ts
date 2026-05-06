import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
      && !req.nextUrl.searchParams.get('force')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const cairoHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false }).format(new Date()),
    10,
  );
  if (cairoHour !== 0 && !req.nextUrl.searchParams.get('force')) {
    return NextResponse.json({ skipped: `cairo_hour_${cairoHour}` });
  }
  const sb = supabaseAdmin();
  const { data } = await sb.from('fnb_building_overrides')
    .update({ is_out_of_stock: false, out_of_stock_until: null } as never)
    .eq('is_out_of_stock', true)
    .select();
  return NextResponse.json({ cleared: data?.length ?? 0 });
}
