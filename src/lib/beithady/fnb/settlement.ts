import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';

export interface ReservationCharges {
  reservation_id: string;
  orders: Array<{
    id: string;
    order_number: number;
    status: string;
    total_usd: number;
    delivered_at: string | null;
    closed_at: string | null;
    guesty_charge_id: string | null;
  }>;
  unsettled_count: number;
  unsettled_total_usd: number;
  total_usd: number;
}

export async function getReservationCharges(
  reservation_id: string,
): Promise<ReservationCharges> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('fnb_orders')
    .select('id, order_number, status, total_usd, delivered_at, closed_at, guesty_charge_id')
    .eq('reservation_id', reservation_id)
    .neq('status', 'cancelled')
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  const orders = ((data ?? []) as Array<{
    id: string; order_number: number; status: string;
    total_usd: number | string;
    delivered_at: string | null; closed_at: string | null;
    guesty_charge_id: string | null;
  }>).map(o => ({
    ...o,
    total_usd: Number(o.total_usd),
  }));
  const unsettled = orders.filter(
    o => (o.status === 'delivered' || o.status === 'closed') && !o.guesty_charge_id,
  );
  return {
    reservation_id,
    orders,
    unsettled_count: unsettled.length,
    unsettled_total_usd: unsettled.reduce((s, o) => s + o.total_usd, 0),
    total_usd: orders.reduce((s, o) => s + o.total_usd, 0),
  };
}

export async function markOrderSettled(
  orderId: string,
  ctx: { actor_user_id: string | null; guesty_charge_id?: string | null; note?: string | null },
): Promise<void> {
  const sb = supabaseAdmin();
  const { data: before, error: beforeErr } = await sb.from('fnb_orders')
    .select('*').eq('id', orderId).single();
  if (beforeErr || !before) throw new Error('order_not_found');
  const b = before as { status: string; guesty_charge_id: string | null };
  if (!['delivered', 'closed'].includes(b.status)) {
    throw new Error('order_not_settleable');
  }
  await sb.from('fnb_orders').update({
    status: 'closed',
    closed_at: new Date().toISOString(),
    guesty_charge_id: ctx.guesty_charge_id ?? b.guesty_charge_id ?? null,
    guesty_charge_settled_at: new Date().toISOString(),
    guesty_charge_settled_by: ctx.actor_user_id,
  } as never).eq('id', orderId);

  await sb.from('fnb_status_events').insert({
    order_id: orderId,
    from_status: b.status,
    to_status: 'closed',
    changed_by_user_id: ctx.actor_user_id,
    changed_via: 'dashboard',
    notes: ctx.note ?? null,
  } as never);

  await recordAudit({
    module: 'fnb',
    actor_user_id: ctx.actor_user_id,
    action: 'order.mark_settled',
    target_type: 'order',
    target_id: orderId,
    after: { guesty_charge_id: ctx.guesty_charge_id ?? null, note: ctx.note ?? null },
  });
}
