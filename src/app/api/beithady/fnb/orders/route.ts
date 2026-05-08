import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { OrderStatusEnum } from '@/lib/beithady/fnb/types';

const Q = z.object({
  building_codes: z.array(z.string()).optional(),
  statuses: z.array(OrderStatusEnum).optional(),
  date_from: z.string().datetime({ offset: true }).optional(),
  date_to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
});

export async function GET(req: NextRequest) {
  await requireBeithadyPermission('fnb', 'read');
  const url = new URL(req.url);
  const params: Record<string, unknown> = {};
  const buildings = url.searchParams.getAll('building_code');
  if (buildings.length) params.building_codes = buildings;
  const statuses = url.searchParams.getAll('status');
  if (statuses.length) params.statuses = statuses;
  if (url.searchParams.get('date_from')) params.date_from = url.searchParams.get('date_from')!;
  if (url.searchParams.get('date_to')) params.date_to = url.searchParams.get('date_to')!;
  if (url.searchParams.get('limit')) params.limit = url.searchParams.get('limit')!;

  const parsedResult = Q.safeParse(params);
  if (!parsedResult.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsedResult.error.issues }, { status: 400 });
  }
  const parsed = parsedResult.data;
  const sb = supabaseAdmin();
  let q = sb.from('fnb_orders')
    .select('*, fnb_order_items(item_name_snapshot, quantity, line_total_usd)')
    .order('submitted_at', { ascending: false })
    .limit(parsed.limit);
  if (parsed.building_codes) q = q.in('building_code', parsed.building_codes);
  if (parsed.statuses) q = q.in('status', parsed.statuses);
  if (parsed.date_from) q = q.gte('submitted_at', parsed.date_from);
  if (parsed.date_to) q = q.lte('submitted_at', parsed.date_to);

  const { data, error } = await q;
  if (error) {
    console.error('[fnb/orders] db error:', error);
    return NextResponse.json({ error: 'database_error' }, { status: 500 });
  }
  return NextResponse.json({ orders: data ?? [] });
}
