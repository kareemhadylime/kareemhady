import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_networth_assets')
    .select('*')
    .eq('app_user_id', user.id)
    .eq('active', true)
    .order('balance', { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, assets: data });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_networth_assets')
    .insert({
      app_user_id: user.id,
      name: body.name,
      kind: body.kind,
      currency: body.currency,
      balance: body.balance,
      as_of_date: body.asOfDate ?? new Date().toISOString().slice(0, 10),
      notes: body.notes ?? null,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id });
}
