import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// External-input validation. All fields optional — only those present are written.
// Schema uses `due_day` (not `payment_day`); accept the alias for back-compat.
const PatchLiabilityBody = z.object({
  monthly_payment: z.number().finite().positive().nullable().optional(),
  min_payment_pct: z.number().finite().nonnegative().nullable().optional(),
  statement_day: z.number().int().min(1).max(28).nullable().optional(),
  due_day: z.number().int().min(1).max(28).nullable().optional(),
  payment_day: z.number().int().min(1).max(28).nullable().optional(),
  credit_limit: z.number().finite().nonnegative().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  apr_pct: z.number().finite().nonnegative().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const { id } = await params;

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  const parsed = PatchLiabilityBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  // Build update payload from only the fields the client actually sent.
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.monthly_payment !== undefined) update.monthly_payment = body.monthly_payment;
  if (body.min_payment_pct !== undefined) update.min_payment_pct = body.min_payment_pct;
  if (body.statement_day !== undefined) update.statement_day = body.statement_day;
  if (body.due_day !== undefined) update.due_day = body.due_day;
  if (body.credit_limit !== undefined) update.credit_limit = body.credit_limit;
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.apr_pct !== undefined) update.apr_pct = body.apr_pct;
  // Back-compat alias: payment_day → due_day when due_day not sent.
  if (body.payment_day !== undefined && body.due_day === undefined) {
    update.due_day = body.payment_day;
  }

  const sb = supabaseAdmin();
  const { error } = await sb
    .from('personal_networth_liabilities')
    .update(update)
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
