// src/lib/beithady/hr/hr-training-queries.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type {
  HrTrainingRecord, HrTrainingRecordRow, EmployeeTrainingSummary,
} from './hr-training-types';

type EmpRow = {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string | null;
  building_code: string | null;
  phone: string | null;
};

// ── Expiring records (for banner + cron) ──────────────────────────────────────

export async function getExpiringTrainingRecords(
  withinDays: number
): Promise<HrTrainingRecordRow[]> {
  const sb = supabaseAdmin();
  const limit = new Date();
  limit.setDate(limit.getDate() + withinDays);
  const limitDate = limit.toISOString().slice(0, 10);

  type RawRow = HrTrainingRecord & {
    hr_employees: {
      company_id: string;
      first_name: string;
      last_name: string | null;
      phone: string | null;
    } | null;
  };

  const { data, error } = await sb
    .from('hr_training_records')
    .select('*, hr_employees(company_id, first_name, last_name, phone)')
    .lte('expiry_date', limitDate)
    .order('expiry_date', { ascending: true });
  if (error) throw new Error(error.message);

  return ((data ?? []) as RawRow[]).map(r => ({
    ...r,
    employee_name: r.hr_employees
      ? `${r.hr_employees.first_name} ${r.hr_employees.last_name ?? ''}`.trim()
      : '—',
    company_id:     r.hr_employees?.company_id ?? '—',
    employee_phone: r.hr_employees?.phone ?? null,
  }));
}

// ── All active employees + their records (for the list page) ──────────────────

export async function getAllEmployeeTrainingSummary(): Promise<EmployeeTrainingSummary[]> {
  const sb = supabaseAdmin();

  const { data: emps, error: eErr } = await sb
    .from('hr_employees')
    .select('id, company_id, first_name, last_name, building_code, phone')
    .neq('status', 'terminated')
    .order('first_name');
  if (eErr) throw new Error(eErr.message);

  const { data: recs, error: rErr } = await sb
    .from('hr_training_records')
    .select('*')
    .order('created_at', { ascending: false });
  if (rErr) throw new Error(rErr.message);

  const recsByEmp = new Map<string, HrTrainingRecord[]>();
  for (const r of (recs ?? []) as HrTrainingRecord[]) {
    const arr = recsByEmp.get(r.employee_id) ?? [];
    arr.push(r);
    recsByEmp.set(r.employee_id, arr);
  }

  return ((emps ?? []) as EmpRow[]).map(e => ({
    employee_id:   e.id,
    employee_name: `${e.first_name} ${e.last_name ?? ''}`.trim(),
    company_id:    e.company_id,
    building_code: e.building_code,
    records:       recsByEmp.get(e.id) ?? [],
  }));
}

// ── Records for one employee (team drawer tab) ────────────────────────────────

export async function getEmployeeTrainingRecords(
  employeeId: string
): Promise<HrTrainingRecord[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('hr_training_records')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as HrTrainingRecord[];
}
