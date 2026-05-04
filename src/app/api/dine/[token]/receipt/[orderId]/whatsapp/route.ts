import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';
import { supabaseAdmin } from '@/lib/supabase';
import { sendDeliveredReceipt } from '@/lib/beithady/fnb/receipt-send';

interface Ctx { params: Promise<{ token: string; orderId: string }> }

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 3;

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { token, orderId } = await ctx.params;
  const c = await validateDineToken(token);
  if (!c.ok) return NextResponse.json({ error: c.reason }, { status: 403 });

  const sb = supabaseAdmin();
  const { data: order } = await sb.from('fnb_orders')
    .select('reservation_id, status').eq('id', orderId).single();
  const o = order as { reservation_id: string; status: string } | null;
  if (!o || o.reservation_id !== c.reservation_id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Rate-limit via audit log: count receipt resends for this order in the last hour
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await sb.from('beithady_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('module', 'fnb')
    .eq('action', 'receipt.resend')
    .eq('target_id', orderId)
    .gte('at', since);
  if ((count ?? 0) >= MAX_PER_HOUR) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  await sendDeliveredReceipt(orderId);
  await sb.from('beithady_audit_log').insert({
    module: 'fnb',
    actor_kind: 'guest',
    action: 'receipt.resend',
    target_type: 'order',
    target_id: orderId,
  } as never);

  return NextResponse.json({ ok: true });
}
