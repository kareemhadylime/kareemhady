import 'server-only';
import { NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  await requireBeithadyPermission('fnb', 'read');
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('fnb_buildings')
    .select('*').order('building_code');
  if (error) {
    console.error('[fnb/buildings] db error:', error);
    return NextResponse.json({ error: 'database_error' }, { status: 500 });
  }
  return NextResponse.json({ buildings: data ?? [] });
}
