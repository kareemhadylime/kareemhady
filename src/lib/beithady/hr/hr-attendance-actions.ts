// src/lib/beithady/hr/hr-attendance-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { parseAttendanceFile } from './hr-attendance-parser';
import { getProtectedEmployeeIds } from './hr-attendance-queries';
import type { AttendancePreviewResult, AttendancePreviewRow, AttendanceFilter } from './hr-attendance-types';

type EmployeeStubForAction = {
  id: string; company_id: string; first_name: string; last_name: string | null; building_code: string | null;
};

export async function previewAttendanceAction(
  formData: FormData
): Promise<{ result?: AttendancePreviewResult; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    const file = formData.get('file') as File | null;
    const dateParam = (formData.get('date') as string | null) ?? new Date().toISOString().slice(0, 10);
    if (!file) return { error: 'No file provided' };

    const buffer = await file.arrayBuffer();
    const sb = supabaseAdmin();

    const { data: contracts } = await sb
      .from('hr_employee_contracts')
      .select('employee_id, building_code')
      .is('effective_to', null);

    const contractByEmp = new Map<string, string>();
    for (const c of (contracts ?? []) as { employee_id: string; building_code: string }[]) {
      contractByEmp.set(c.employee_id, c.building_code);
    }

    const { data: empData, error: empErr } = await sb
      .from('hr_employees')
      .select('id, company_id, first_name, last_name')
      .neq('status', 'terminated');
    if (empErr) return { error: empErr.message };

    const employees: EmployeeStubForAction[] = ((empData ?? []) as {
      id: string; company_id: string; first_name: string; last_name: string | null;
    }[]).map(e => ({
      ...e,
      building_code: contractByEmp.get(e.id) ?? null,
    }));

    const protectedIds = await getProtectedEmployeeIds(dateParam);
    const result = await parseAttendanceFile(buffer, employees, protectedIds);
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Parse error' };
  }
}

export async function confirmAttendanceAction(
  date: string,
  rows: AttendancePreviewRow[]
): Promise<{ saved: number; skipped: number; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { saved: 0, skipped: 0, error: 'Not authenticated' };

    const toInsert = rows.filter(r => r.matchStatus === 'matched' && r.status !== null);
    const skipped = rows.length - toInsert.length;

    if (!toInsert.length) return { saved: 0, skipped };

    const sb = supabaseAdmin();
    const { error } = await sb
      .from('hr_attendance_records')
      .upsert(
        toInsert.map(r => ({
          employee_id:    r.matchedEmployeeId!,
          date,
          status:         r.status!,
          building_code:  r.building_code,
          approval_state: 'pending',
          submitted_by:   user.id,
          submitted_at:   new Date().toISOString(),
        })),
        { onConflict: 'employee_id,date' }
      );

    if (error) return { saved: 0, skipped, error: error.message };

    revalidatePath('/beithady/hr/attendance');
    return { saved: toInsert.length, skipped };
  } catch (e) {
    return { saved: 0, skipped: 0, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function approveAttendanceAction(
  filters: AttendanceFilter
): Promise<{ approved: number; error?: string }> {
  try {
    const { user } = await requireBeithadyPermission('hr', 'full');
    const sb = supabaseAdmin();

    let empIds: string[] | null = null;
    if (filters.building || filters.department) {
      const { data: contracts } = await sb
        .from('hr_employee_contracts')
        .select('employee_id, building_code')
        .is('effective_to', null);

      let filtered = (contracts ?? []) as { employee_id: string; building_code: string }[];
      if (filters.building) filtered = filtered.filter(c => c.building_code === filters.building);

      let empQuery = sb
        .from('hr_employees')
        .select('id')
        .in('id', filtered.map(c => c.employee_id))
        .neq('status', 'terminated');
      if (filters.department) empQuery = empQuery.eq('department', filters.department);
      const { data: emps } = await empQuery;
      empIds = ((emps ?? []) as { id: string }[]).map(e => e.id);
      if (!empIds.length) return { approved: 0 };
    }

    let updateQuery = sb
      .from('hr_attendance_records')
      .update({ approval_state: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('date', filters.date)
      .eq('approval_state', 'pending');

    if (empIds) updateQuery = updateQuery.in('employee_id', empIds);

    const { data, error } = await updateQuery.select('id');
    if (error) return { approved: 0, error: error.message };

    revalidatePath('/beithady/hr/attendance');
    return { approved: (data ?? []).length };
  } catch (e) {
    return { approved: 0, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function approveAttendanceRowAction(
  recordId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { user } = await requireBeithadyPermission('hr', 'full');
    const sb = supabaseAdmin();

    const { error } = await sb
      .from('hr_attendance_records')
      .update({ approval_state: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('id', recordId)
      .eq('approval_state', 'pending');

    if (error) return { ok: false, error: error.message };

    revalidatePath('/beithady/hr/attendance');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
