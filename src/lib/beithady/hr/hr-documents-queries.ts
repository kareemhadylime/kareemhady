import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type {
  HrDocument, HrDocumentRow, EmployeeDocSummary,
} from './hr-documents-types';

type EmpRow = {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string | null;
  building_code: string | null;
  phone: string | null;
};

// ── Expiring documents (for banner + cron) ────────────────────────────────────

export async function getExpiringDocuments(withinDays: number): Promise<HrDocumentRow[]> {
  const sb = supabaseAdmin();
  const limit = new Date();
  limit.setDate(limit.getDate() + withinDays);
  const limitDate = limit.toISOString().slice(0, 10);

  type RawDoc = HrDocument & {
    hr_employees: { company_id: string; first_name: string; last_name: string | null; phone: string | null } | null;
  };

  const { data, error } = await sb
    .from('hr_employee_documents')
    .select('*, hr_employees(company_id, first_name, last_name, phone)')
    .lte('expiry_date', limitDate)
    .order('expiry_date', { ascending: true });
  if (error) throw new Error(error.message);

  return ((data ?? []) as RawDoc[]).map(r => ({
    ...r,
    employee_name: r.hr_employees
      ? `${r.hr_employees.first_name} ${r.hr_employees.last_name ?? ''}`.trim()
      : '—',
    company_id:     r.hr_employees?.company_id ?? '—',
    employee_phone: r.hr_employees?.phone ?? null,
  }));
}

// ── Documents for one employee ────────────────────────────────────────────────

export async function getEmployeeDocuments(employeeId: string): Promise<HrDocument[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('hr_employee_documents')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as HrDocument[];
}

// ── All active employees + their documents (for the list page) ────────────────

export async function getAllEmployeeDocSummary(): Promise<EmployeeDocSummary[]> {
  const sb = supabaseAdmin();

  const { data: emps, error: eErr } = await sb
    .from('hr_employees')
    .select('id, company_id, first_name, last_name, building_code, phone')
    .neq('status', 'terminated')
    .order('first_name');
  if (eErr) throw new Error(eErr.message);

  const { data: docs, error: dErr } = await sb
    .from('hr_employee_documents')
    .select('*')
    .order('created_at', { ascending: false });
  if (dErr) throw new Error(dErr.message);

  const docsByEmp = new Map<string, HrDocument[]>();
  for (const d of (docs ?? []) as HrDocument[]) {
    const arr = docsByEmp.get(d.employee_id) ?? [];
    arr.push(d);
    docsByEmp.set(d.employee_id, arr);
  }

  return ((emps ?? []) as EmpRow[]).map(e => ({
    employee_id:   e.id,
    employee_name: `${e.first_name} ${e.last_name ?? ''}`.trim(),
    company_id:    e.company_id,
    building_code: e.building_code,
    documents:     docsByEmp.get(e.id) ?? [],
  }));
}
