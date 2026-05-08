// GET / PUT / DELETE a saved report.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

const PutBody = z.object({
  config: z.unknown().optional(),
  commentary: z.unknown().optional(),
  last_run_data: z.unknown().optional(),
}).strict();

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
  if (error) {
    console.error('[reports/[id]] db error:', error);
    return NextResponse.json({ error: 'database_error' }, { status: 500 });
  }
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
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsedBody = PutBody.safeParse(raw);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsedBody.error.issues }, { status: 400 });
  }
  const body = parsedBody.data;
  const sb = supabaseAdmin();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.config) update.config = body.config;
  if (body.commentary !== undefined) update.commentary = body.commentary;
  if (body.last_run_data !== undefined) {
    update.last_run_data = body.last_run_data;
    update.last_run_at = new Date().toISOString();
  }
  const { error } = await sb.from('beithady_saved_reports').update(update).eq('id', id);
  if (error) {
    console.error('[reports/[id]] db error:', error);
    return NextResponse.json({ error: 'database_error' }, { status: 500 });
  }
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
  if (error) {
    console.error('[reports/[id]] db error:', error);
    return NextResponse.json({ error: 'database_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
