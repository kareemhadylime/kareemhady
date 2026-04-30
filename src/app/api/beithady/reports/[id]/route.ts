// GET / PUT / DELETE a saved report.

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBeithadyPermission(user, 'analytics', 'read'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('beithady_saved_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ report: data });
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBeithadyPermission(user, 'analytics', 'full'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as {
    config?: unknown;
    commentary?: unknown;
    last_run_data?: unknown;
  };
  const sb = supabaseAdmin();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.config) update.config = body.config;
  if (body.commentary !== undefined) update.commentary = body.commentary;
  if (body.last_run_data !== undefined) {
    update.last_run_data = body.last_run_data;
    update.last_run_at = new Date().toISOString();
  }
  const { error } = await sb.from('beithady_saved_reports').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBeithadyPermission(user, 'analytics', 'full'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { error } = await sb.from('beithady_saved_reports').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
