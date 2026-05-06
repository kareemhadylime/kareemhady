import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';
import { isCancellable, canTransition } from '@/lib/beithady/fnb/order-status';

interface Ctx { params: Promise<{ token: string; orderId: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { token, orderId } = await ctx.params;
  const c = await validateDineToken(token);
  if (!c.ok) return NextResponse.json({ error: c.reason }, { status: 403 });

  const sb = supabaseAdmin();
  const { data: order, error } = await sb.from('fnb_orders')
    .select('*').eq('id', orderId).single();
  if (error || !order) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const o = order as {
    reservation_id: string;
    status: 'submitted' | 'preparing' | 'ready' | 'delivered' | 'closed' | 'cancelled';
    submitted_at: string;
  };

  if (o.reservation_id !== c.reservation_id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data: bld } = await sb.from('fnb_buildings')
    .select('cancellation_grace_seconds').eq('building_code', c.building_code).single();
  const grace = (bld as { cancellation_grace_seconds?: number } | null)?.cancellation_grace_seconds ?? 120;

  if (!isCancellable({ status: o.status, submitted_at: o.submitted_at, grace_seconds: grace })) {
    return NextResponse.json({ error: 'grace_expired' }, { status: 409 });
  }
  if (!canTransition(o.status, 'cancelled')) {
    return NextResponse.json({ error: 'cannot_cancel' }, { status: 409 });
  }

  const { error: upErr } = await sb.from('fnb_orders').update({
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancellation_reason: 'guest_cancelled_within_grace',
  } as any).eq('id', orderId);
  if (upErr) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  await sb.from('fnb_status_events').insert({
    order_id: orderId,
    from_status: o.status,
    to_status: 'cancelled',
    changed_via: 'guest',
    notes: 'Guest cancelled within grace window',
  } as any);

  return NextResponse.json({ ok: true });
}
