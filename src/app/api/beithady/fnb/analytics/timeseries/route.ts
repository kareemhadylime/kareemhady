import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  await requireBeithadyPermission('fnb', 'read');
  const url = new URL(req.url);
  const days = Math.min(180, Math.max(1, parseInt(url.searchParams.get('days') ?? '30', 10)));
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const sb = supabaseAdmin();

  const { data, error } = await sb.from('fnb_orders')
    .select('submitted_at, building_code, total_usd, status')
    .gte('submitted_at', since)
    .neq('status', 'cancelled');
  if (error) {
    console.error('[fnb/analytics/timeseries] db error:', error);
    return NextResponse.json({ error: 'database_error' }, { status: 500 });
  }

  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' });
  const byDay = new Map<string, { revenue_usd: number; orders: number }>();
  for (const o of (data ?? []) as Array<{ submitted_at: string; total_usd: number | string }>) {
    const k = fmt.format(new Date(o.submitted_at));
    const cur = byDay.get(k) ?? { revenue_usd: 0, orders: 0 };
    cur.revenue_usd += Number(o.total_usd);
    cur.orders += 1;
    byDay.set(k, cur);
  }
  const series = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date, revenue_usd: Math.round(v.revenue_usd * 100) / 100, orders: v.orders,
    }));

  const byHour = Array.from({ length: 24 }, () => 0);
  const todayKey = fmt.format(new Date());
  for (const o of (data ?? []) as Array<{ submitted_at: string }>) {
    if (fmt.format(new Date(o.submitted_at)) !== todayKey) continue;
    const h = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false }).format(new Date(o.submitted_at)), 10);
    byHour[h] += 1;
  }

  return NextResponse.json({ daily: series, hourly_today: byHour });
}
