import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  await requireBeithadyPermission('fnb', 'read');
  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') ?? '1', 10)));
  const sb = supabaseAdmin();

  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const sinceYesterday = new Date(Date.now() - days * 2 * 86400_000).toISOString();

  const [today, yesterday, items] = await Promise.all([
    sb.from('fnb_orders')
      .select('total_usd, reservation_id, submitted_at, ready_at, preparing_at')
      .gte('submitted_at', since).neq('status', 'cancelled'),
    sb.from('fnb_orders')
      .select('total_usd')
      .gte('submitted_at', sinceYesterday).lt('submitted_at', since)
      .neq('status', 'cancelled'),
    sb.from('fnb_order_items')
      .select('item_name_snapshot, quantity, line_total_usd, fnb_orders!inner(submitted_at)')
      .gte('fnb_orders.submitted_at', since),
  ]);

  type TodayRow = { total_usd: number | string; reservation_id: string; submitted_at: string; ready_at: string | null; preparing_at: string | null };
  const todayOrders = (today.data ?? []) as TodayRow[];
  const yOrders = (yesterday.data ?? []) as Array<{ total_usd: number | string }>;
  const todayRev = todayOrders.reduce((s, o) => s + Number(o.total_usd), 0);
  const yRev = yOrders.reduce((s, o) => s + Number(o.total_usd), 0);

  const prepTimes = todayOrders
    .filter(o => o.ready_at)
    .map(o => (new Date(o.ready_at!).getTime() - new Date(o.submitted_at).getTime()) / 60000);
  const avgPrep = prepTimes.length ? prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length : null;

  const itemAgg = new Map<string, { count: number; rev: number }>();
  for (const li of (items.data ?? []) as Array<{ item_name_snapshot: string; quantity: number; line_total_usd: number | string }>) {
    const cur = itemAgg.get(li.item_name_snapshot) ?? { count: 0, rev: 0 };
    cur.count += li.quantity;
    cur.rev += Number(li.line_total_usd);
    itemAgg.set(li.item_name_snapshot, cur);
  }
  const top = [...itemAgg.entries()].sort((a, b) => b[1].rev - a[1].rev)[0];

  return NextResponse.json({
    today: {
      revenue_usd: Math.round(todayRev * 100) / 100,
      orders: todayOrders.length,
      avg_ticket_usd: todayOrders.length ? Math.round((todayRev / todayOrders.length) * 100) / 100 : 0,
    },
    yesterday: {
      revenue_usd: Math.round(yRev * 100) / 100,
      orders: yOrders.length,
    },
    avg_prep_minutes: avgPrep ? Math.round(avgPrep) : null,
    attach_rate_pct: null,                // requires Guesty in-house count; v1.5
    top_item: top ? { name: top[0], count: top[1].count, revenue_usd: top[1].rev } : null,
  });
}
