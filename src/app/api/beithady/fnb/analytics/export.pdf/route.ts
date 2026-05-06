import 'server-only';
import { NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AnalyticsDoc } from '@/lib/beithady/fnb/analytics-pdf';

export async function GET(req: NextRequest) {
  await requireBeithadyPermission('fnb', 'read');
  const url = new URL(req.url);
  const days = Math.min(180, Math.max(1, parseInt(url.searchParams.get('days') ?? '30', 10)));
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const sb = supabaseAdmin();

  // Reuse the summary endpoint's logic by fetching same data inline (avoid HTTP self-call)
  const sinceYesterday = new Date(Date.now() - days * 2 * 86400_000).toISOString();
  const [todayRes, yRes, ordersRes, itemsRes] = await Promise.all([
    sb.from('fnb_orders')
      .select('total_usd, submitted_at, ready_at')
      .gte('submitted_at', since).neq('status', 'cancelled'),
    sb.from('fnb_orders')
      .select('total_usd')
      .gte('submitted_at', sinceYesterday).lt('submitted_at', since)
      .neq('status', 'cancelled'),
    sb.from('fnb_orders')
      .select('order_number, building_code, unit_code, status, submitted_at, total_usd')
      .gte('submitted_at', since).order('submitted_at', { ascending: false }).limit(500),
    sb.from('fnb_order_items')
      .select('item_name_snapshot, quantity, line_total_usd, fnb_orders!inner(submitted_at)')
      .gte('fnb_orders.submitted_at', since),
  ]);

  type T = { total_usd: number | string; submitted_at: string; ready_at: string | null };
  const today = (todayRes.data ?? []) as T[];
  const todayRev = today.reduce((s, o) => s + Number(o.total_usd), 0);
  const y = (yRes.data ?? []) as Array<{ total_usd: number | string }>;
  const yRev = y.reduce((s, o) => s + Number(o.total_usd), 0);
  const prepTimes = today.filter(o => o.ready_at).map(o => (new Date(o.ready_at!).getTime() - new Date(o.submitted_at).getTime()) / 60000);
  const avgPrep = prepTimes.length ? Math.round(prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length) : null;
  const itemAgg = new Map<string, { count: number; rev: number }>();
  for (const li of (itemsRes.data ?? []) as Array<{ item_name_snapshot: string; quantity: number; line_total_usd: number | string }>) {
    const cur = itemAgg.get(li.item_name_snapshot) ?? { count: 0, rev: 0 };
    cur.count += li.quantity;
    cur.rev += Number(li.line_total_usd);
    itemAgg.set(li.item_name_snapshot, cur);
  }
  const top = [...itemAgg.entries()].sort((a, b) => b[1].rev - a[1].rev)[0];

  const buffer = await renderToBuffer(
    AnalyticsDoc({
      generatedAt: new Date().toLocaleString(),
      windowDays: days,
      summary: {
        today: {
          revenue_usd: Math.round(todayRev * 100) / 100,
          orders: today.length,
          avg_ticket_usd: today.length ? Math.round((todayRev / today.length) * 100) / 100 : 0,
        },
        yesterday: {
          revenue_usd: Math.round(yRev * 100) / 100,
          orders: y.length,
        },
        avg_prep_minutes: avgPrep,
        top_item: top ? { name: top[0], count: top[1].count, revenue_usd: top[1].rev } : null,
      },
      orders: (ordersRes.data ?? []) as never,
    }),
  );

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="fnb-analytics-${new Date().toISOString().slice(0,10)}.pdf"`,
    },
  });
}
