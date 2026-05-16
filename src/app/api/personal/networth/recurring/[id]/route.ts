import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { computeNextRunDate, type RecurringFrequency } from '@/lib/recurring';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// External-input validation. All fields optional — only those present
// are written. If cadence fields (frequency, dayOfPeriod, monthOfYear)
// change, we recompute next_run_date from cairo-today.
const PatchRecurringBody = z.object({
  name: z.string().min(1).max(120).optional(),
  category: z
    .enum([
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
    ])
    .optional(),
  amount: z.number().finite().positive().optional(),
  currency: z.enum(['EGP', 'USD', 'EUR', 'SAR', 'AED']).optional(),
  frequency: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
  dayOfPeriod: z.number().int().min(1).max(28).optional(),
  monthOfYear: z.number().int().min(1).max(12).nullable().optional(),
  liabilityId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

function cairoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(
    new Date(),
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const parsed = PatchRecurringBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const sb = supabaseAdmin();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) update.name = body.name;
  if (body.category !== undefined) update.category = body.category;
  if (body.amount !== undefined) update.amount = body.amount;
  if (body.currency !== undefined) update.currency = body.currency;
  if (body.frequency !== undefined) update.frequency = body.frequency;
  if (body.dayOfPeriod !== undefined) update.day_of_period = body.dayOfPeriod;
  if (body.monthOfYear !== undefined) update.month_of_year = body.monthOfYear;
  if (body.liabilityId !== undefined) update.liability_id = body.liabilityId;
  if (body.notes !== undefined) update.notes = body.notes;

  // Recompute next_run_date if any cadence input changed.
  if (
    body.frequency !== undefined ||
    body.dayOfPeriod !== undefined ||
    body.monthOfYear !== undefined
  ) {
    const { data: row, error: fetchErr } = await sb
      .from('personal_networth_recurring_templates')
      .select('frequency, day_of_period, month_of_year')
      .eq('id', id)
      .eq('app_user_id', user.id)
      .maybeSingle();
    if (fetchErr) {
      return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
    }
    const r = row as {
      frequency: string;
      day_of_period: number;
      month_of_year: number | null;
    };
    const effFreq = (body.frequency ?? r.frequency) as RecurringFrequency;
    const effDay = body.dayOfPeriod ?? r.day_of_period;
    const effMonth =
      body.monthOfYear !== undefined ? body.monthOfYear : r.month_of_year;
    try {
      update.next_run_date = computeNextRunDate(
        effFreq,
        effDay,
        effMonth,
        cairoToday(),
      );
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : String(e) },
        { status: 400 },
      );
    }
  }

  const { error } = await sb
    .from('personal_networth_recurring_templates')
    .update(update)
    .eq('id', id)
    .eq('app_user_id', user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Soft delete — payments.recurring_template_id FK has no cascade, so we
// keep the row and just flip active to false. Mirrors the liability
// close pattern.
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
    .from('personal_networth_recurring_templates')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('app_user_id', user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
