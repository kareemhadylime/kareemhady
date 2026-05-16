import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Partial update — only fields the client actually sent get written.
// Each is optional so omitted fields are not touched (avoids NOT NULL violations
// on as_of_date if the caller only updates balance/notes).
const PatchAssetBody = z.object({
  balance: z.number().finite().optional(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const { id } = await params;

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  const parsed = PatchAssetBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  // Build update payload from only the fields the client actually sent.
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.balance !== undefined) update.balance = body.balance;
  if (body.asOfDate !== undefined) update.as_of_date = body.asOfDate;
  if (body.notes !== undefined) update.notes = body.notes;

  const sb = supabaseAdmin();
  const { error } = await sb
    .from('personal_networth_assets')
    .update(update)
    .eq('id', id)
    .eq('app_user_id', user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('personal_networth_assets')
    .update({ active: false })
    .eq('id', id)
    .eq('app_user_id', user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
