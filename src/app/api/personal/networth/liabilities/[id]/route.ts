import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const sb = supabaseAdmin();
  // Allowlist of patchable columns. Names match DB columns.
  // Note: schema uses `due_day` (not `payment_day`); accept both keys from
  // clients but write only the real column.
  const allowed: Record<string, unknown> = {};
  const COLUMNS = [
    'monthly_payment',
    'min_payment_pct',
    'statement_day',
    'due_day',
    'credit_limit',
    'notes',
    'apr_pct',
  ] as const;
  for (const k of COLUMNS) {
    if (k in body) allowed[k] = body[k];
  }
  // Back-compat: accept `payment_day` alias from older callers.
  if ('payment_day' in body && !('due_day' in body)) {
    allowed.due_day = body.payment_day;
  }
  allowed.updated_at = new Date().toISOString();
  const { error } = await sb
    .from('personal_networth_liabilities')
    .update(allowed)
    .eq('id', id)
    .eq('app_user_id', user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('personal_networth_liabilities')
    .update({ active: false })
    .eq('id', id)
    .eq('app_user_id', user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
