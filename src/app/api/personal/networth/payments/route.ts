import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// External-input validation per CLAUDE.md. Mirrors the
// personal_networth_payments schema (migration 0139) — 12 categories,
// 5 currencies. liabilityId is optional (manual entries can be
// uncategorized to a specific liability).
const CreatePaymentBody = z.object({
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().finite().positive(),
  currency: z.enum(['EGP', 'USD', 'EUR', 'SAR', 'AED']),
  category: z.enum([
    'loan_payment',
    'card_payment',
    'overdraft_payment',
    'bnpl_payment',
    'charity',
    'rent',
    'utility',
    'phone',
    'subscription',
    'insurance',
    'school_fee',
    'other',
  ]),
  liabilityId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const category = url.searchParams.get('category');
  const liabilityId = url.searchParams.get('liabilityId');

  const sb = supabaseAdmin();
  let q = sb
    .from('personal_networth_payments')
    .select('*, personal_networth_liabilities(name)')
    .eq('app_user_id', user.id)
    .order('occurred_on', { ascending: false });

  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte('occurred_on', from);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lte('occurred_on', to);
  if (category) q = q.eq('category', category);
  if (liabilityId) q = q.eq('liability_id', liabilityId);

  const { data, error } = await q.limit(500);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, payments: data });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const parsed = CreatePaymentBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_networth_payments')
    .insert({
      app_user_id: user.id,
      occurred_on: body.occurredOn,
      amount: body.amount,
      currency: body.currency,
      category: body.category,
      liability_id: body.liabilityId ?? null,
      notes: body.notes ?? null,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id });
}
