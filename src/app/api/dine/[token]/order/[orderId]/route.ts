import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';

interface Ctx { params: Promise<{ token: string; orderId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token, orderId } = await ctx.params;
  const c = await validateDineToken(token);
  if (!c.ok) return NextResponse.json({ error: c.reason }, { status: 403 });

  const sb = supabaseAdmin();
  const [orderRes, linesRes] = await Promise.all([
    sb.from('fnb_orders').select('*').eq('id', orderId).maybeSingle(),
    sb.from('fnb_order_items').select('*').eq('order_id', orderId)
      .order('created_at', { ascending: true }),
  ]);
  if (!orderRes.data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  // Authorization check: order must belong to this guest's reservation.
  if ((orderRes.data as { reservation_id: string }).reservation_id !== c.reservation_id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json({
    order: orderRes.data,
    lines: linesRes.data ?? [],
  });
}
