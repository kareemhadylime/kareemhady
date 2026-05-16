import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { computeNextRunDate, type RecurringFrequency } from '@/lib/recurring';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// External-input validation per CLAUDE.md. Mirrors the
// personal_networth_recurring_templates schema (migration 0139) — 12
// categories, 5 currencies, 3 frequencies, day_of_period 1–28, optional
// month_of_year (1–12) for yearly cadence.
const CreateRecurringBody = z.object({
  name: z.string().min(1).max(120),
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
  amount: z.number().finite().positive(),
  currency: z.enum(['EGP', 'USD', 'EUR', 'SAR', 'AED']),
  frequency: z.enum(['monthly', 'quarterly', 'yearly']),
  dayOfPeriod: z.number().int().min(1).max(28),
  monthOfYear: z.number().int().min(1).max(12).optional(),
  liabilityId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).optional(),
  startFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function cairoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(
    new Date(),
  );
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_networth_recurring_templates')
    .select('*, personal_networth_liabilities(name)')
    .eq('app_user_id', user.id)
    .order('next_run_date');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, templates: data });
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
  const parsed = CreateRecurringBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // yearly cadence requires monthOfYear; computeNextRunDate enforces this
  // but we surface a clean 400 instead of a 500.
  if (body.frequency === 'yearly' && (body.monthOfYear === undefined || body.monthOfYear === null)) {
    return NextResponse.json(
      { ok: false, error: 'monthOfYear required for yearly frequency' },
      { status: 400 },
    );
  }

  const startFrom = body.startFrom ?? cairoToday();
  let nextRun: string;
  try {
    nextRun = computeNextRunDate(
      body.frequency as RecurringFrequency,
      body.dayOfPeriod,
      body.monthOfYear ?? null,
      startFrom,
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_networth_recurring_templates')
    .insert({
      app_user_id: user.id,
      name: body.name,
      category: body.category,
      amount: body.amount,
      currency: body.currency,
      frequency: body.frequency,
      day_of_period: body.dayOfPeriod,
      month_of_year: body.monthOfYear ?? null,
      liability_id: body.liabilityId ?? null,
      notes: body.notes ?? null,
      next_run_date: nextRun,
      active: true,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id });
}
