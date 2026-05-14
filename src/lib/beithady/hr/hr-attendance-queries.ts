// src/lib/beithady/hr/hr-attendance-queries.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { AttendanceRow, AttendanceApprovalState, AttendanceStatus, AttendanceSource } from './hr-attendance-types';
import type { AttendanceEmployeeStub } from './hr-attendance-parser';

type ContractRow = { employee_id: string; building_code: string };
type EmpRow = { id: string; company_id: string; first_name: string; last_name: string | null; arabic_name: string | null; department: string };
type RecordRow = { id: string; employee_id: string; status: string; approval_state: string; source: string };

export async function getAttendanceDayView(
  date: string,
  filters: { building?: string; department?: string }
): Promise<AttendanceRow[]> {
  const sb = supabaseAdmin();

  const { data: contracts, error: cErr } = await sb
    .from('hr_employee_contracts')
    .select('employee_id, building_code')
    .is('effective_to', null);
  if (cErr) throw new Error(cErr.message);

  const filteredContracts = filters.building
    ? (contracts ?? []).filter((c: ContractRow) => c.building_code === filters.building)
    : (contracts ?? []) as ContractRow[];

  if (!filteredContracts.length) return [];
  const empIds = filteredContracts.map((c: ContractRow) => c.employee_id);

  let empQuery = sb
    .from('hr_employees')
    .select('id, company_id, first_name, last_name, arabic_name, department')
    .in('id', empIds)
    .neq('status', 'terminated')
    .order('first_name');
  if (filters.department) empQuery = empQuery.eq('department', filters.department);

  const { data: employees, error: eErr } = await empQuery;
  if (eErr) throw new Error(eErr.message);
  if (!employees?.length) return [];

  const activeIds = (employees as EmpRow[]).map(e => e.id);
  const { data: records, error: rErr } = await sb
    .from('hr_attendance_records')
    .select('id, employee_id, status, approval_state, source')
    .eq('date', date)
    .in('employee_id', activeIds);
  if (rErr) throw new Error(rErr.message);

  const contractByEmp = new Map<string, string>();
  for (const c of filteredContracts) contractByEmp.set(c.employee_id, c.building_code);

  const recordByEmp = new Map<string, RecordRow>();
  for (const r of (records ?? []) as RecordRow[]) recordByEmp.set(r.employee_id, r);

  return (employees as EmpRow[]).map(e => {
    const rec = recordByEmp.get(e.id);
    return {
      employee_id:    e.id,
      company_id:     e.company_id,
      first_name:     e.first_name,
      last_name:      e.last_name,
      arabic_name:    e.arabic_name,
      department:     e.department,
      building_code:  contractByEmp.get(e.id) ?? null,
      record_id:      rec?.id ?? null,
      status:         (rec?.status as AttendanceStatus) ?? null,
      approval_state: (rec?.approval_state as AttendanceApprovalState) ?? null,
      source:         (rec?.source as AttendanceSource) ?? null,
    };
  });
}

export async function getActiveEmployeesForFilter(
  filters: { building?: string; department?: string }
): Promise<AttendanceEmployeeStub[]> {
  const sb = supabaseAdmin();

  const { data: contracts, error: cErr } = await sb
    .from('hr_employee_contracts')
    .select('employee_id, building_code')
    .is('effective_to', null);
  if (cErr) throw new Error(cErr.message);

  const filtered = filters.building
    ? (contracts ?? []).filter((c: ContractRow) => c.building_code === filters.building)
    : (contracts ?? []) as ContractRow[];

  if (!filtered.length) return [];
  const empIds = filtered.map((c: ContractRow) => c.employee_id);

  let empQuery = sb
    .from('hr_employees')
    .select('id, company_id, first_name, last_name')
    .in('id', empIds)
    .neq('status', 'terminated')
    .order('first_name');
  if (filters.department) empQuery = empQuery.eq('department', filters.department);

  const { data: employees, error: eErr } = await empQuery;
  if (eErr) throw new Error(eErr.message);

  const contractByEmp = new Map<string, string>();
  for (const c of filtered) contractByEmp.set(c.employee_id, c.building_code);

  return ((employees ?? []) as EmpRow[]).map(e => ({
    id:            e.id,
    company_id:    e.company_id,
    first_name:    e.first_name,
    last_name:     e.last_name,
    building_code: contractByEmp.get(e.id) ?? null,
  }));
}

export async function getProtectedEmployeeIds(date: string): Promise<Set<string>> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('hr_attendance_records')
    .select('employee_id')
    .eq('date', date)
    .eq('approval_state', 'approved');
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { employee_id: string }[]).map(r => r.employee_id));
}
