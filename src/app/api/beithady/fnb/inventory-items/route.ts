import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  await requireBeithadyPermission('fnb', 'read');
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const sb = supabaseAdmin();
  let query = sb.from('beithady_inventory_items')
    .select('id, sku, name_en, name_ar, uom, default_cost_usd, active')
    .eq('active', true)
    .order('name_en', { ascending: true })
    .limit(200);
  if (q) {
    query = query.or(`name_en.ilike.%${q}%,sku.ilike.%${q}%,name_ar.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) {
    console.error('[fnb/inventory-items] db error:', error);
    return NextResponse.json({ error: 'database_error' }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}
