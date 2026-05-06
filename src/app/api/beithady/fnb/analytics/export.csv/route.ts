import 'server-only';
import { NextRequest } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  await requireBeithadyPermission('fnb', 'read');
  const url = new URL(req.url);
  const days = Math.min(180, Math.max(1, parseInt(url.searchParams.get('days') ?? '30', 10)));
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const sb = supabaseAdmin();
  const { data } = await sb.from('fnb_orders')
    .select('order_number, building_code, unit_code, status, submitted_at, delivered_at, total_usd, guesty_charge_id')
    .gte('submitted_at', since).order('submitted_at', { ascending: true });

  const header = 'order_number,building_code,unit_code,status,submitted_at,delivered_at,total_usd,guesty_charge_id\n';
  const rows = ((data ?? []) as Array<Record<string, unknown>>)
    .map(r => [
      r.order_number, r.building_code, r.unit_code, r.status,
      r.submitted_at, r.delivered_at ?? '',
      Number(r.total_usd ?? 0).toFixed(2),
      r.guesty_charge_id ?? '',
    ].map(x => `"${String(x).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  return new Response(header + rows, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="fnb-orders-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
}
