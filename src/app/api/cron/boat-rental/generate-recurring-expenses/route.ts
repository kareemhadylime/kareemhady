import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { computeNextRunDate, type RecurringFrequency } from '@/lib/boat-rental/recurring';
import { logAudit } from '@/lib/boat-rental/server-helpers';
import {
  enqueueNotification,
  flushPendingNonReservation,
} from '@/lib/boat-rental/notifications';

// Daily cron: generate open expense bills from active recurring templates
// whose next_run_date has arrived (or passed). Idempotent per-day:
// re-running the same day won't double-insert because we check for an
// existing expense with matching template_id + expense_date first.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const CATEGORY_LABELS: Record<string, string> = {
  amenities: 'Amenities',
  part_time_skipper: 'Part-time skipper',
  marina_docking: 'Marina docking',
  fuel: 'Fuel',
  repair: 'Repair',
  insurance: 'Insurance',
  boat_license: 'Boat license',
  full_time_skipper_salary: 'Full-time skipper salary',
  maintenance_contract: 'Maintenance contract',
  other: 'Other',
};

function appBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    'http://localhost:3000';
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`;
}

type TemplateRow = {
  id: string;
  boat_id: string;
  owner_id: string;
  category: string;
  vendor_name: string | null;
  amount_egp: string | number;
  frequency: string;
  day_of_period: number;
  month_of_year: number | null;
  description: string | null;
  created_by: string;
  boat: { name: string; status: string } | null;
  owner: { name: string; whatsapp: string | null } | null;
};

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { data: templatesRaw } = await sb
    .from('boat_rental_recurring_expense_templates')
    .select(
      `
      id, boat_id, owner_id, category, vendor_name, amount_egp,
      frequency, day_of_period, month_of_year, description, created_by,
      boat:boat_rental_boats ( name, status ),
      owner:boat_rental_owners ( name, whatsapp )
    `
    )
    .eq('active', true)
    .lte('next_run_date', today);

  const templates = ((templatesRaw as unknown) as TemplateRow[] | null) ?? [];
  const generated: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const baseUrl = appBaseUrl();

  for (const t of templates) {
    if (t.boat?.status !== 'active') {
      skipped.push({ id: t.id, reason: `boat_status_${t.boat?.status ?? 'unknown'}` });
      continue;
    }

    // Idempotency: skip if a row already exists for this template on this date.
    const { data: existing } = await sb
      .from('boat_rental_expenses')
      .select('id')
      .eq('recurring_template_id', t.id)
      .eq('expense_date', today)
      .maybeSingle();
    if (existing) {
      skipped.push({ id: t.id, reason: 'already_generated_today' });
      continue;
    }

    const { data: ins, error } = await sb
      .from('boat_rental_expenses')
      .insert({
        boat_id: t.boat_id,
        owner_id: t.owner_id,
        category: t.category,
        expense_date: today,
        amount_egp: t.amount_egp,
        vendor_name: t.vendor_name,
        description: t.description,
        recurring_template_id: t.id,
        status: 'open',
        created_by: t.created_by,
      })
      .select('id')
      .single();
    if (error) {
      skipped.push({ id: t.id, reason: `insert_error:${error.message}` });
      continue;
    }
    const expenseId = (ins as { id: string }).id;
    generated.push(expenseId);

    // Advance next_run_date.
    const nextRun = computeNextRunDate(
      t.frequency as RecurringFrequency,
      t.day_of_period,
      t.month_of_year,
      today
    );
    await sb
      .from('boat_rental_recurring_expense_templates')
      .update({
        last_run_date: today,
        next_run_date: nextRun,
        updated_at: new Date().toISOString(),
      })
      .eq('id', t.id);

    // Notify owner via WhatsApp (best-effort).
    if (t.owner?.whatsapp) {
      const categoryLabel = CATEGORY_LABELS[t.category] ?? t.category;
      const shortUrl = `${baseUrl}/emails/boat-rental/owner/money/expenses/${expenseId}`;
      await enqueueNotification({
        reservationId: null,
        to: { phone: t.owner.whatsapp, role: 'owner' },
        templateKey: 'recurring_expense_generated',
        language: 'en',
        context: {
          boatName: t.boat?.name ?? 'your boat',
          bookingDate: today,
          shortRef: t.id.replace(/-/g, '').slice(0, 8),
          amountEgp: Number(t.amount_egp),
          vendorName: t.vendor_name,
          categoryLabel,
          shortUrl,
        },
      });
    }

    await logAudit({
      actorUserId: null,
      actorRole: 'system',
      action: 'recurring_expense_generate',
      payload: { template_id: t.id, expense_id: expenseId, amount: Number(t.amount_egp) },
    });
  }

  // Best-effort flush so owners see WhatsApp messages without waiting for the
  // next reservation-bound flush.
  const flushed = await flushPendingNonReservation(50);

  return NextResponse.json({
    ok: true,
    today,
    generated_count: generated.length,
    skipped_count: skipped.length,
    flushed,
    generated,
    skipped,
  });
}
