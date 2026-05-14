import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type {
  HrEmployee, HrContract, HrEvent, HrEmployeeRow,
} from './hr-types';

export type EmployeeFilters = {
  department?: string;
  building_code?: string;
  status?: string;
  search?: string;   // searches first_name, arabic_name, national_id, company_id
  page?: number;     // 1-based, default 1
  pageSize?: number; // default 50
};

/**
 * List employees with their current active contract joined.
 * building_code filter is applied post-fetch (contract lives on a separate table).
 */
export async function listEmployees(filters: EmployeeFilters = {}): Promise<{
  rows: HrEmployeeRow[];
  total: number;
}> {
  const sb = supabaseAdmin();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  type EmpWithContracts = HrEmployee & { hr_employee_contracts: HrContract[] };

  let query = sb
    .from('hr_employees')
    .select('*, hr_employee_contracts!hr_employee_contracts_employee_id_fkey(*)', {
      count: 'exact',
    })
    .order('first_name', { ascending: true })
    .range(from, to);

  if (filters.status)     query = query.eq('status', filters.status);
  if (filters.department) query = query.eq('department', filters.department);
  if (filters.search) {
    const s = `%${filters.search}%`;
    query = query.or(
      `first_name.ilike.${s},arabic_name.ilike.${s},national_id.ilike.${s},company_id.ilike.${s}`
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  let rows: HrEmployeeRow[] = (data ?? []).map((emp: EmpWithContracts) => {
    const allContracts: HrContract[] = emp.hr_employee_contracts ?? [];
    const current = allContracts.find(c => c.effective_to === null) ?? null;
    const history = allContracts
      .filter(c => c.effective_to !== null)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from));

    const { hr_employee_contracts: _, ...employee } = emp;
    return { ...employee, current_contract: current, contract_history: history };
  });

  // Post-filter by building_code if requested (contract table join)
  if (filters.building_code) {
    rows = rows.filter(r => r.current_contract?.building_code === filters.building_code);
  }

  return { rows, total: count ?? 0 };
}

/**
 * Fetch a single employee with full contract history.
 */
export async function getEmployee(id: string): Promise<HrEmployeeRow | null> {
  const sb = supabaseAdmin();
  type EmpWithContracts = HrEmployee & { hr_employee_contracts: HrContract[] };

  const { data: emp, error } = await sb
    .from('hr_employees')
    .select('*, hr_employee_contracts!hr_employee_contracts_employee_id_fkey(*)')
    .eq('id', id)
    .single();

  if (error || !emp) return null;

  const row = emp as EmpWithContracts;
  const allContracts: HrContract[] = row.hr_employee_contracts ?? [];
  const current = allContracts.find(c => c.effective_to === null) ?? null;
  const history = allContracts
    .filter(c => c.effective_to !== null)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));

  const { hr_employee_contracts: _, ...employee } = row;
  return { ...employee, current_contract: current, contract_history: history };
}

/**
 * Fetch timeline events for an employee, newest first.
 */
export async function getEmployeeEvents(employeeId: string): Promise<HrEvent[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('hr_employee_events')
    .select('*')
    .eq('employee_id', employeeId)
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as HrEvent[];
}
