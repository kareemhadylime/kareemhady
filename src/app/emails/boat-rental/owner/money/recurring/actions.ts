'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import {
  requireBoatRoleOrThrow,
  s,
  sOrNull,
  logAudit,
} from '@/lib/boat-rental/server-helpers';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { computeNextRunDate, type RecurringFrequency } from '@/lib/recurring';

const VALID_CATEGORIES = [
  'amenities',
  'part_time_skipper',
  'marina_docking',
  'fuel',
  'repair',
  'insurance',
  'boat_license',
  'full_time_skipper_salary',
  'maintenance_contract',
  'other',
] as const;

const VALID_FREQUENCIES = ['monthly', 'quarterly', 'yearly'] as const;

export async function createRecurringTemplateAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('owner');
  const boatId = s(formData.get('boat_id'));
  const category = s(formData.get('category'));
  const vendorName = sOrNull(formData.get('vendor_name'));
  const amount = Number(s(formData.get('amount_egp')));
  const frequency = s(formData.get('frequency')) as RecurringFrequency;
  const dayOfPeriod = Number(s(formData.get('day_of_period')));
  const monthOfYearRaw = formData.get('month_of_year');
  const monthOfYear = monthOfYearRaw != null && String(monthOfYearRaw).trim() !== ''
    ? Number(s(monthOfYearRaw))
    : null;
  const description = sOrNull(formData.get('description'));

  if (!boatId || !category || !frequency) throw new Error('invalid_input');
  if (!(VALID_CATEGORIES as readonly string[]).includes(category)) throw new Error('invalid_category');
  if (!(VALID_FREQUENCIES as readonly string[]).includes(frequency)) throw new Error('invalid_frequency');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('invalid_amount');
  if (!Number.isFinite(dayOfPeriod) || dayOfPeriod < 1 || dayOfPeriod > 28) {
    throw new Error('day_of_period must be 1-28');
  }
  if (frequency === 'yearly' && (monthOfYear === null || !Number.isFinite(monthOfYear) || monthOfYear < 1 || monthOfYear > 12)) {
    throw new Error('yearly requires month_of_year 1-12');
  }

  const ownerIds = await getOwnedOwnerIds(me);
  const sb = supabaseAdmin();
  const { data: boat } = await sb
    .from('boat_rental_boats')
    .select('owner_id')
    .eq('id', boatId)
    .maybeSingle();
  const boatRow = boat as { owner_id: string } | null;
  if (!boatRow || !ownerIds.includes(boatRow.owner_id)) throw new Error('forbidden');
  const ownerId = boatRow.owner_id;

  // Initial next_run_date: this month's day_of_period if in future, else next period.
  // For yearly: same logic but anchored to month_of_year.
  const today = new Date().toISOString().slice(0, 10);
  const [yearStr, monthStr] = today.split('-');
  const y = Number(yearStr);
  const m = Number(monthStr);
  const monthForFirst = frequency === 'yearly' && monthOfYear ? monthOfYear : m;
  let nextRun = `${y}-${String(monthForFirst).padStart(2, '0')}-${String(dayOfPeriod).padStart(2, '0')}`;
  if (nextRun <= today) {
    nextRun = computeNextRunDate(frequency, dayOfPeriod, monthOfYear, today);
  }

  await sb.from('boat_rental_recurring_expense_templates').insert({
    boat_id: boatId,
    owner_id: ownerId,
    category,
    vendor_name: vendorName,
    amount_egp: amount,
    frequency,
    day_of_period: dayOfPeriod,
    month_of_year: monthOfYear,
    description,
    active: true,
    next_run_date: nextRun,
    created_by: me.id,
  });

  await logAudit({
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'recurring_template_create',
    payload: { boat_id: boatId, category, frequency, amount, next_run: nextRun },
  });

  revalidatePath('/emails/boat-rental/owner/money/recurring');
}

export async function pauseRecurringTemplateAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('owner');
  const id = s(formData.get('id'));
  if (!id) throw new Error('invalid_input');
  const ownerIds = await getOwnedOwnerIds(me);
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_recurring_expense_templates')
    .select('owner_id')
    .eq('id', id)
    .maybeSingle();
  const row = data as { owner_id: string } | null;
  if (!row || !ownerIds.includes(row.owner_id)) throw new Error('forbidden');
  await sb
    .from('boat_rental_recurring_expense_templates')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  await logAudit({
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'recurring_template_pause',
    payload: { template_id: id },
  });

  revalidatePath('/emails/boat-rental/owner/money/recurring');
}

export async function resumeRecurringTemplateAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('owner');
  const id = s(formData.get('id'));
  if (!id) throw new Error('invalid_input');
  const ownerIds = await getOwnedOwnerIds(me);
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_recurring_expense_templates')
    .select('owner_id, frequency, day_of_period, month_of_year, next_run_date')
    .eq('id', id)
    .maybeSingle();
  const row = data as
    | {
        owner_id: string;
        frequency: RecurringFrequency;
        day_of_period: number;
        month_of_year: number | null;
        next_run_date: string;
      }
    | null;
  if (!row || !ownerIds.includes(row.owner_id)) throw new Error('forbidden');

  // If next_run_date is in the past (paused for a while), recompute forward
  // so we don't backfill missed periods.
  const today = new Date().toISOString().slice(0, 10);
  let nextRun = row.next_run_date;
  while (nextRun <= today) {
    nextRun = computeNextRunDate(row.frequency, row.day_of_period, row.month_of_year, nextRun);
  }

  await sb
    .from('boat_rental_recurring_expense_templates')
    .update({ active: true, next_run_date: nextRun, updated_at: new Date().toISOString() })
    .eq('id', id);

  await logAudit({
    actorUserId: me.id,
    actorRole: 'owner',
    action: 'recurring_template_resume',
    payload: { template_id: id, next_run: nextRun },
  });

  revalidatePath('/emails/boat-rental/owner/money/recurring');
}
