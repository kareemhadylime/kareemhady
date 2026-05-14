// src/lib/beithady/hr/hr-payroll-queries.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { BUILDING_LABELS } from './hr-types';
import type { PayrollMonth, PayrollEntryRow, PayslipBatchFilter, PayslipData } from './hr-payroll-types';
import type { BuildingCode } from './hr-types';

export async function listPayrollMonths(): Promise<PayrollMonth[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('hr_payroll_months')
    .select('*')
    .order('month_key', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PayrollMonth[];
}

export async function getPayrollMonth(monthId: string): Promise<PayrollMonth | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('hr_payroll_months')
    .select('*')
    .eq('id', monthId)
    .single();
  if (error || !data) return null;
  return data as PayrollMonth;
}

export async function getMonthEntries(
  monthId: string,
  filters: PayslipBatchFilter = {}
): Promise<PayrollEntryRow[]> {
  const sb = supabaseAdmin();

  type RawEntry = {
    id: string;
    month_id: string;
    employee_id: string | null;
    sheet_name: string;
    job_title: string | null;
    working_days: number;
    salary_package: number;
    ot: number;
    transport_allowance: number;
    bonus: number;
    travel_allowance: number;
    salary_in_advance: number;
    deduction: number;
    net_salary: number;
    building_code: string | null;
    analytic_raw: string | null;
    is_terminated: boolean;
    created_at: string;
    hr_employees: {
      first_name: string;
      last_name: string | null;
      arabic_name: string | null;
      company_id: string;
      payslip_language: string;
      portrait_url: string | null;
      department: string | null;
    } | null;
  };

  const { data, error } = await sb
    .from('hr_payroll_entries')
    .select('*, hr_employees(first_name, last_name, arabic_name, company_id, payslip_language, portrait_url, department)')
    .eq('month_id', monthId)
    .order('sheet_name');

  if (error) throw new Error(error.message);

  let rows = ((data ?? []) as RawEntry[]).map(e => {
    const emp = e.hr_employees;
    const { hr_employees: _, ...entry } = e;
    return {
      ...entry,
      employee_name: emp ? `${emp.first_name} ${emp.last_name ?? ''}`.trim() : null,
      arabic_name:   emp?.arabic_name ?? null,
      bh_id:         emp?.company_id ?? null,
      payslip_language: (emp?.payslip_language ?? 'arabic') as 'arabic' | 'english',
      portrait_url:  emp?.portrait_url ?? null,
      department:    emp?.department ?? null,
    } as PayrollEntryRow & { department: string | null };
  });

  if (filters.building_codes?.length) {
    rows = rows.filter(r => filters.building_codes!.includes(r.building_code ?? ''));
  }
  if (filters.departments?.length) {
    rows = rows.filter(r => filters.departments!.includes((r as PayrollEntryRow & { department: string | null }).department ?? ''));
  }
  if (filters.exclude_terminated ?? false) {
    rows = rows.filter(r => !r.is_terminated);
  }

  return rows;
}

/** Build PayslipData for a single entry (used by payslip PDF templates). */
export function entryToPayslipData(entry: PayrollEntryRow, monthLabel: string): PayslipData {
  const buildingLabel = entry.building_code
    ? (BUILDING_LABELS[entry.building_code as BuildingCode] ?? entry.building_code)
    : '—';

  return {
    month_label:         monthLabel,
    employee_name:       entry.employee_name ?? entry.sheet_name,
    arabic_name:         entry.arabic_name,
    bh_id:               entry.bh_id,
    job_title:           entry.job_title ?? '—',
    building_label:      buildingLabel,
    working_days:        entry.working_days,
    salary_package:      entry.salary_package,
    ot:                  entry.ot,
    transport_allowance: entry.transport_allowance,
    travel_allowance:    entry.travel_allowance,
    bonus:               entry.bonus,
    salary_in_advance:   entry.salary_in_advance,
    deduction:           entry.deduction,
    net_salary:          entry.net_salary,
  };
}
