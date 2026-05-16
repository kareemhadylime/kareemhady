import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { createLiability } from '@/lib/personal/networth/liability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// External-input validation per CLAUDE.md. Field shapes match the
// CreateLiabilityInput type in @/lib/personal/networth/liability.
const CreateLiabilityBody = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(['amortizing_loan', 'bnpl', 'credit_card', 'overdraft', 'other']),
  currency: z.enum(['EGP', 'USD', 'EUR', 'SAR', 'AED']),
  lenderId: z.string().uuid().nullable().optional(),
  currentBalance: z.number().finite(),
  // Amortizing fields
  principal: z.number().finite().nonnegative().optional(),
  aprPct: z.number().finite().nonnegative().optional(),
  termMonths: z.number().int().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  monthlyPayment: z.number().finite().positive().optional(),
  // Revolving fields
  creditLimit: z.number().finite().nonnegative().optional(),
  statementDay: z.number().int().min(1).max(28).optional(),
  dueDay: z.number().int().min(1).max(28).optional(),
  minPaymentPct: z.number().finite().nonnegative().optional(),
  notes: z.string().max(500).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_networth_liabilities')
    .select('*, personal_networth_lenders(name)')
    .eq('app_user_id', user.id)
    .eq('active', true)
    .order('current_balance', { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, liabilities: data });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  const parsed = CreateLiabilityBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const id = await createLiability({ appUserId: user.id, ...parsed.data });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
