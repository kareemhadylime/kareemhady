import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { canTransition } from '@/lib/beithady/fnb/order-status';

const Body = z.object({ reason: z.string().min(3).max(500) });

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { user, roles } = await requireBeithadyPermission('fnb', 'full');
  if (!roles.some(r => ['admin', 'manager', 'fnb_manager'].includes(r))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const { reason } = Body.parse(await req.json());

  const sb = supabaseAdmin();
  const { data: order } = await sb.from('fnb_orders').select('*').eq('id', id).single();
  if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const o = order as { status: 'submitted' | 'preparing' | 'ready' | 'delivered' | 'closed' | 'cancelled' };

  const actor = roles.includes('admin') ? 'admin'
              : roles.includes('manager') ? 'manager' : 'fnb_manager';
  if (!canTransition(o.status, 'cancelled', { actor })) {
    return NextResponse.json({ error: 'invalid_transition' }, { status: 409 });
  }

  await sb.from('fnb_orders').update({
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancellation_reason: reason,
  } as never).eq('id', id);

  await sb.from('fnb_status_events').insert({
    order_id: id,
    from_status: o.status,
    to_status: 'cancelled',
    changed_by_user_id: user.id,
    changed_via: 'dashboard',
    notes: reason,
  } as never);

  await sb.from('beithady_audit_log').insert({
    actor_user_id: user.id,
    module: 'fnb',
    action: 'order.cancel',
    target_type: 'order',
    target_id: id,
    before: { status: o.status },
    after: { status: 'cancelled', reason },
  } as never);

  return NextResponse.json({ ok: true });
}
