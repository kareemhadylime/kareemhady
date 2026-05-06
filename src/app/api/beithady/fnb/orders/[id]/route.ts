import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { canTransition } from '@/lib/beithady/fnb/order-status';
import { notifyGuestStatus } from '@/lib/beithady/fnb/wa-notifier';
import { StatusUpdatePayloadSchema } from '@/lib/beithady/fnb/types';
import { sendDeliveredReceipt } from '@/lib/beithady/fnb/receipt-send';

interface Ctx { params: Promise<{ id: string }> }

// T35 — GET order detail (order + lines + status events)
export async function GET(_req: NextRequest, ctx: Ctx) {
  await requireBeithadyPermission('fnb', 'read');
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const [order, lines, events] = await Promise.all([
    sb.from('fnb_orders').select('*').eq('id', id).maybeSingle(),
    sb.from('fnb_order_items').select('*').eq('order_id', id)
      .order('created_at', { ascending: true }),
    sb.from('fnb_status_events').select('*').eq('order_id', id)
      .order('at', { ascending: true }),
  ]);
  if (!order.data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({
    order: order.data,
    lines: lines.data ?? [],
    events: events.data ?? [],
  });
}

// T36 — PATCH status update
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { user, roles } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const parsed = StatusUpdatePayloadSchema.parse(await req.json());

  const sb = supabaseAdmin();
  const { data: order, error } = await sb.from('fnb_orders')
    .select('*').eq('id', id).single();
  if (error || !order) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const o = order as { status: 'submitted' | 'preparing' | 'ready' | 'delivered' | 'closed' | 'cancelled' };

  // Highest role determines what transitions are allowed
  const actor: 'admin' | 'manager' | 'fnb_manager' | 'ops' =
    roles.includes('admin') ? 'admin'
    : roles.includes('manager') ? 'manager'
    : roles.includes('fnb_manager') ? 'fnb_manager' : 'ops';

  if (!canTransition(o.status, parsed.to_status, { actor })) {
    return NextResponse.json({
      error: 'invalid_transition', from: o.status, to: parsed.to_status,
    }, { status: 409 });
  }

  const ts = new Date().toISOString();
  const stamp: Record<string, string> = {
    preparing: 'preparing_at',
    ready: 'ready_at',
    delivered: 'delivered_at',
    closed: 'closed_at',
    cancelled: 'cancelled_at',
  };
  const update: Record<string, unknown> = { status: parsed.to_status };
  const stampCol = stamp[parsed.to_status];
  if (stampCol) update[stampCol] = ts;
  if (parsed.to_status === 'cancelled' && parsed.notes) {
    update.cancellation_reason = parsed.notes;
  }
  const { data: updated, error: upErr } = await sb.from('fnb_orders')
    .update(update as never).eq('id', id).select().single();
  if (upErr) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  await sb.from('fnb_status_events').insert({
    order_id: id,
    from_status: o.status,
    to_status: parsed.to_status,
    changed_by_user_id: user.id,
    changed_via: 'dashboard',
    notes: parsed.notes ?? null,
  } as never);

  // Audit
  await sb.from('beithady_audit_log').insert({
    actor_user_id: user.id,
    module: 'fnb',
    action: 'order.status_change',
    target_type: 'order',
    target_id: id,
    before: { status: o.status },
    after: { status: parsed.to_status, notes: parsed.notes ?? null },
  } as never);

  // Push status to guest (fire-and-forget) for the 3 user-facing transitions
  if (parsed.to_status === 'preparing' || parsed.to_status === 'ready' || parsed.to_status === 'delivered') {
    notifyGuestStatus(id, parsed.to_status).catch(err =>
      console.error('[fnb] notifyGuestStatus failed', err));
  }
  // T49 — auto-send receipt PDF when order is delivered
  if (parsed.to_status === 'delivered') {
    sendDeliveredReceipt(id).catch(err =>
      console.error('[fnb] sendDeliveredReceipt failed', err));
  }

  return NextResponse.json({ order: updated });
}
