'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { parsePayrollFile } from './hr-payroll-parser';
import type { PayrollPreviewResult, PayrollPreviewRow } from './hr-payroll-types';

type EmployeeStub = { id: string; first_name: string; last_name: string | null; company_id: string };

async function requireHrAccess() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return user;
}

// ── previewPayrollAction ──────────────────────────────────────────────────
// Parses Excel, runs name-matching. NO database writes.

export async function previewPayrollAction(
  formData: FormData
): Promise<{ result?: PayrollPreviewResult; error?: string }> {
  try {
    await requireHrAccess();
    const file = formData.get('file') as File | null;
    if (!file) return { error: 'No file provided' };

    const buffer = await file.arrayBuffer();

    // Fetch all employees for name-matching
    const sb = supabaseAdmin();
    const { data: empData, error: empErr } = await sb
      .from('hr_employees')
      .select('id, first_name, last_name, company_id');
    if (empErr) return { error: empErr.message };

    const result = await parsePayrollFile(buffer, (empData ?? []) as EmployeeStub[]);
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Parse error' };
  }
}

// ── confirmPayrollAction ──────────────────────────────────────────────────
// Upserts hr_payroll_months + overwrites hr_payroll_entries for the month.

export async function confirmPayrollAction(
  monthKey: string,
  label: string,
  rows: PayrollPreviewRow[]
): Promise<{ monthId?: string; error?: string }> {
  try {
    const user = await requireHrAccess();
    const sb = supabaseAdmin();

    // Upsert the month row (insert or update uploaded_at on conflict)
    const { data: month, error: monthErr } = await sb
      .from('hr_payroll_months')
      .upsert(
        { month_key: monthKey, label, uploaded_at: new Date().toISOString(), uploaded_by: user.id },
        { onConflict: 'month_key' }
      )
      .select('id')
      .single();

    if (monthErr || !month) return { error: monthErr?.message ?? 'Failed to create month' };

    const monthId = month.id as string;

    // Delete existing entries for this month (overwrite model)
    const { error: delErr } = await sb
      .from('hr_payroll_entries')
      .delete()
      .eq('month_id', monthId);
    if (delErr) return { error: delErr.message };

    // Insert new entries (skip rows with status 'error')
    const validRows = rows.filter(r => r.matchStatus !== 'error');
    if (validRows.length > 0) {
      const inserts = validRows.map(r => ({
        month_id:            monthId,
        employee_id:         r.matchedEmployeeId,
        sheet_name:          r.sheet_name,
        job_title:           r.job_title || null,
        working_days:        r.working_days,
        salary_package:      r.salary_package,
        ot:                  r.ot,
        transport_allowance: r.transport_allowance,
        bonus:               r.bonus,
        travel_allowance:    r.travel_allowance,
        salary_in_advance:   r.salary_in_advance,
        deduction:           r.deduction,
        net_salary:          r.net_salary,
        building_code:       r.building_code,
        analytic_raw:        r.analytic_raw,
        is_terminated:       r.is_terminated,
        created_by:          user.id,
      }));

      const { error: insErr } = await sb.from('hr_payroll_entries').insert(inserts);
      if (insErr) return { error: insErr.message };
    }

    revalidatePath('/beithady/hr/payroll');
    return { monthId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
