// src/lib/beithady/hr/hr-leave-ot-queries.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type {
  LeaveRequestRow, LeaveBalanceRow, OvertimeRecordRow,
  LeaveType, ReviewStatus,
} from './hr-leave-ot-types';

type EmpRow = { id: string; company_id: string; first_name: string; last_name: string | null };

function empName(e: EmpRow): string {
  return `${e.first_name} ${e.last_name ?? ''}`.trim();
}

// ── Leave requests ────────────────────────────────────────────────────────────

export async function listLeaveRequests(filters: {
  status?: ReviewStatus;
  year?: number;
  employee_id?: string;
} = {}): Promise<LeaveRequestRow[]> {
  const sb = supabaseAdmin();

  type RawReq = {
    id: string; employee_id: string; leave_type: string;
    start_date: string; end_date: string; days_count: number;
    reason: string | null; status: string;
    reviewed_by: string | null; reviewed_at: string | null;
    submitted_by: string | null; submitted_at: string;
    hr_employees: { company_id: string; first_name: string; last_name: string | null } | null;
  };

  let q = sb
    .from('hr_leave_requests')
    .select('*, hr_employees(company_id, first_name, last_name)')
    .order('submitted_at', { ascending: false });

  if (filters.status)      q = q.eq('status', filters.status);
  if (filters.employee_id) q = q.eq('employee_id', filters.employee_id);
  if (filters.year) {
    q = q
      .gte('start_date', `${filters.year}-01-01`)
      .lte('start_date', `${filters.year}-12-31`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return ((data ?? []) as RawReq[]).map(r => ({
    id:            r.id,
    employee_id:   r.employee_id,
    leave_type:    r.leave_type as LeaveType,
    start_date:    r.start_date,
    end_date:      r.end_date,
    days_count:    r.days_count,
    reason:        r.reason,
    status:        r.status as ReviewStatus,
    reviewed_by:   r.reviewed_by,
    reviewed_at:   r.reviewed_at,
    submitted_by:  r.submitted_by,
    submitted_at:  r.submitted_at,
    employee_name: r.hr_employees
      ? `${r.hr_employees.first_name} ${r.hr_employees.last_name ?? ''}`.trim()
      : '—',
    company_id:    r.hr_employees?.company_id ?? '—',
  }));
}

// ── Leave balances ────────────────────────────────────────────────────────────

export async function listLeaveBalances(year: number): Promise<LeaveBalanceRow[]> {
  const sb = supabaseAdmin();

  const { data: emps, error: eErr } = await sb
    .from('hr_employees')
    .select('id, company_id, first_name, last_name')
    .neq('status', 'terminated')
    .order('first_name');
  if (eErr) throw new Error(eErr.message);

  const empIds = ((emps ?? []) as EmpRow[]).map(e => e.id);
  if (!empIds.length) return [];

  const { data: bals, error: bErr } = await sb
    .from('hr_leave_balances')
    .select('employee_id, leave_type, total_days, used_days')
    .eq('year', year)
    .in('employee_id', empIds);
  if (bErr) throw new Error(bErr.message);

  type BalRow = { employee_id: string; leave_type: string; total_days: number; used_days: number };

  const balMap = new Map<string, BalRow[]>();
  for (const b of (bals ?? []) as BalRow[]) {
    const arr = balMap.get(b.employee_id) ?? [];
    arr.push(b);
    balMap.set(b.employee_id, arr);
  }

  return ((emps ?? []) as EmpRow[]).map(e => {
    const rows   = balMap.get(e.id) ?? [];
    const annual = rows.find(r => r.leave_type === 'annual');
    const sick   = rows.find(r => r.leave_type === 'sick');
    return {
      employee_id:   e.id,
      employee_name: empName(e),
      company_id:    e.company_id,
      annual_total:  annual?.total_days ?? 0,
      annual_used:   annual?.used_days ?? 0,
      sick_total:    sick?.total_days ?? 0,
      sick_used:     sick?.used_days ?? 0,
    };
  });
}

// ── Overtime records ──────────────────────────────────────────────────────────

export async function listOvertimeRecords(filters: {
  status?: ReviewStatus;
  month?: string;
  employee_id?: string;
} = {}): Promise<OvertimeRecordRow[]> {
  const sb = supabaseAdmin();

  type RawOt = {
    id: string; employee_id: string; date: string; hours: number;
    reason: string | null; status: string;
    reviewed_by: string | null; reviewed_at: string | null;
    submitted_by: string | null; submitted_at: string;
    hr_employees: { company_id: string; first_name: string; last_name: string | null } | null;
  };

  let q = sb
    .from('hr_overtime_records')
    .select('*, hr_employees(company_id, first_name, last_name)')
    .order('date', { ascending: false });

  if (filters.status)      q = q.eq('status', filters.status);
  if (filters.employee_id) q = q.eq('employee_id', filters.employee_id);
  if (filters.month) {
    q = q
      .gte('date', `${filters.month}-01`)
      .lte('date', `${filters.month}-31`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return ((data ?? []) as RawOt[]).map(r => ({
    id:            r.id,
    employee_id:   r.employee_id,
    date:          r.date,
    hours:         r.hours,
    reason:        r.reason,
    status:        r.status as ReviewStatus,
    reviewed_by:   r.reviewed_by,
    reviewed_at:   r.reviewed_at,
    submitted_by:  r.submitted_by,
    submitted_at:  r.submitted_at,
    employee_name: r.hr_employees
      ? `${r.hr_employees.first_name} ${r.hr_employees.last_name ?? ''}`.trim()
      : '—',
    company_id:    r.hr_employees?.company_id ?? '—',
  }));
}

// ── Active employees (for dialog selectors) ───────────────────────────────────

export async function listActiveEmployeesSimple(): Promise<
  { id: string; company_id: string; display_name: string }[]
> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('hr_employees')
    .select('id, company_id, first_name, last_name')
    .neq('status', 'terminated')
    .order('first_name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as EmpRow[]).map(e => ({
    id:           e.id,
    company_id:   e.company_id,
    display_name: empName(e),
  }));
}
