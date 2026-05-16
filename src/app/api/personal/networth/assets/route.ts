import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// External-input validation per CLAUDE.md ("Validate any … form input with Zod").
const CreateAssetBody = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(['cash', 'real_estate', 'vehicle', 'gold_jewelry', 'other']),
  currency: z.enum(['EGP', 'USD', 'EUR', 'SAR', 'AED']),
  balance: z.number().finite(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).nullable().optional(),
});

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

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  const parsed = CreateAssetBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

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
