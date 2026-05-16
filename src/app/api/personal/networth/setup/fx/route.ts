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
    .from('personal_networth_fx_rates')
    .select('*')
    .order('currency_code')
    .order('as_of_date', { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rates: data });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_networth_fx_rates')
    .insert({
      currency_code: body.currencyCode,
      rate_to_egp: body.rateToEgp,
      as_of_date: body.asOfDate,
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
  const { error } = await sb.from('personal_networth_fx_rates').delete().eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
