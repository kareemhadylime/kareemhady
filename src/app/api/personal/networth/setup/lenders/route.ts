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
    .from('personal_networth_lenders')
    .select('*')
    .eq('app_user_id', user.id)
    .order('name');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lenders: data });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_networth_lenders')
    .insert({
      app_user_id: user.id,
      name: body.name,
      kind: body.kind,
      contact: body.contact ?? null,
      notes: body.notes ?? null,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('personal_networth_lenders')
    .delete()
    .eq('id', id)
    .eq('app_user_id', user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
