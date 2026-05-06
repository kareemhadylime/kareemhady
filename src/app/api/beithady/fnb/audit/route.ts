import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  await requireBeithadyPermission('fnb', 'read');
  const url = new URL(req.url);
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') ?? '100', 10));
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('beithady_audit_log')
    .select('*').eq('module', 'fnb')
    .order('at', { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
