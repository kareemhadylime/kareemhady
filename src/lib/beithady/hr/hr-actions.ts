'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import type {
  PersonalInfoInput, ContractInput,
  Department, JobRole, BuildingCode, ContractType, PaymentMethod, EmployeeStatus,
} from './hr-types';

type ActionResult = { id?: string; error?: string };

// ── Guards ────────────────────────────────────────────────────────────────

async function requireHrAccess() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return user;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function parseNum(s: string): number {
  const n = parseFloat(String(s).replace(/,/g, ''));
  return isNaN(n) || n < 0 ? 0 : n;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function generateCompanyId(): Promise<string> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('generate_hr_company_id');
  if (error) throw new Error(error.message);
  return data as string;
}

async function logEvent(
  employeeId: string,
  eventType: string,
  description: string,
  createdBy: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from('hr_employee_events').insert({
    employee_id: employeeId,
    event_type: eventType,
    event_date: today(),
    description,
    metadata: metadata ?? null,
    created_by: createdBy,
  });
}

// ── addEmployeeAction ──────────────────────────────────────────────────────

export async function addEmployeeAction(
  personal: PersonalInfoInput,
  contract: ContractInput
): Promise<ActionResult> {
  try {
    const user = await requireHrAccess();
    const sb = supabaseAdmin();
    const companyId = await generateCompanyId();

    // Track which required fields are missing (for warning badge in roster)
    const incompleteFields: string[] = [];
    if (!personal.national_id) incompleteFields.push('national_id');
    if (!personal.phone)       incompleteFields.push('phone');
    if (!personal.date_of_birth) incompleteFields.push('date_of_birth');
    if (!personal.date_joined) incompleteFields.push('date_joined');

    const { data: emp, error: empErr } = await sb
      .from('hr_employees')
      .insert({
        company_id:         companyId,
        first_name:         personal.first_name.trim(),
        last_name:          personal.last_name.trim() || null,
        arabic_name:        personal.arabic_name.trim() || null,
        national_id:        personal.national_id.trim() || null,
        date_of_birth:      personal.date_of_birth || null,
        gender:             personal.gender || null,
        department:         personal.department as Department,
        position:           personal.position.trim(),
        job_role:           personal.job_role as JobRole,
        status:             personal.status as EmployeeStatus,
        date_joined:        personal.date_joined || null,
        date_terminated:    personal.status === 'terminated' ? (personal.date_terminated || null) : null,
        termination_reason: personal.status === 'terminated' ? (personal.termination_reason || null) : null,
        phone:              personal.phone.trim() || null,
        email:              personal.email.trim() || null,
        portrait_url:       personal.portrait_url || null,
        incomplete_fields:  incompleteFields,
        created_by:         user.id,
      })
      .select('id')
      .single();

    if (empErr) return { error: empErr.message };

    const employeeId = emp.id as string;
    const contractStart = contract.contract_start || today();

    const { error: conErr } = await sb.from('hr_employee_contracts').insert({
      employee_id:         employeeId,
      contract_type:       contract.contract_type as ContractType,
      contract_start:      contractStart,
      contract_end:        contract.contract_type === 'fixed_term' ? (contract.contract_end || null) : null,
      building_code:       contract.building_code as BuildingCode,
      salary_package:      parseNum(contract.salary_package),
      transport_allowance: parseNum(contract.transport_allowance),
      travel_allowance:    parseNum(contract.travel_allowance),
      fixed_bonus:         parseNum(contract.fixed_bonus),
      bank_name:           contract.bank_name.trim() || null,
      bank_account:        contract.bank_account.trim() || null,
      bank_iban:           contract.bank_iban.trim() || null,
      payment_method:      contract.payment_method as PaymentMethod,
      effective_from:      contractStart,
      effective_to:        null,
      created_by:          user.id,
    });

    if (conErr) return { error: conErr.message };

    await logEvent(
      employeeId,
      'hired',
      `Joined as ${personal.position} at ${contract.building_code}`,
      user.id
    );

    revalidatePath('/beithady/hr/team');
    return { id: employeeId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── editEmployeeAction ─────────────────────────────────────────────────────

export async function editEmployeeAction(
  id: string,
  personal: PersonalInfoInput,
  contract: ContractInput,
  previousContract: { salary_package: number; building_code: string } | null
): Promise<ActionResult> {
  try {
    const user = await requireHrAccess();
    const sb = supabaseAdmin();

    const incompleteFields: string[] = [];
    if (!personal.national_id) incompleteFields.push('national_id');
    if (!personal.phone)       incompleteFields.push('phone');
    if (!personal.date_of_birth) incompleteFields.push('date_of_birth');
    if (!personal.date_joined) incompleteFields.push('date_joined');

    const { error: empErr } = await sb
      .from('hr_employees')
      .update({
        first_name:         personal.first_name.trim(),
        last_name:          personal.last_name.trim() || null,
        arabic_name:        personal.arabic_name.trim() || null,
        national_id:        personal.national_id.trim() || null,
        date_of_birth:      personal.date_of_birth || null,
        gender:             personal.gender || null,
        department:         personal.department as Department,
        position:           personal.position.trim(),
        job_role:           personal.job_role as JobRole,
        status:             personal.status as EmployeeStatus,
        date_joined:        personal.date_joined || null,
        date_terminated:    personal.status === 'terminated' ? (personal.date_terminated || null) : null,
        termination_reason: personal.status === 'terminated' ? (personal.termination_reason || null) : null,
        phone:              personal.phone.trim() || null,
        email:              personal.email.trim() || null,
        portrait_url:       personal.portrait_url || null,
        incomplete_fields:  incompleteFields,
        // updated_at is auto-managed by trigger (0124 migration)
      })
      .eq('id', id);

    if (empErr) return { error: empErr.message };

    const newSalary = parseNum(contract.salary_package);
    const salaryChanged = previousContract !== null && previousContract.salary_package !== newSalary;
    const buildingChanged = previousContract !== null && previousContract.building_code !== contract.building_code;

    if (salaryChanged || buildingChanged) {
      // Close old contract version
      await sb
        .from('hr_employee_contracts')
        .update({ effective_to: today() })
        .eq('employee_id', id)
        .is('effective_to', null);

      // Open new contract version
      const contractStart = contract.contract_start || today();
      await sb.from('hr_employee_contracts').insert({
        employee_id:         id,
        contract_type:       contract.contract_type as ContractType,
        contract_start:      contractStart,
        contract_end:        contract.contract_type === 'fixed_term' ? (contract.contract_end || null) : null,
        building_code:       contract.building_code as BuildingCode,
        salary_package:      newSalary,
        transport_allowance: parseNum(contract.transport_allowance),
        travel_allowance:    parseNum(contract.travel_allowance),
        fixed_bonus:         parseNum(contract.fixed_bonus),
        bank_name:           contract.bank_name.trim() || null,
        bank_account:        contract.bank_account.trim() || null,
        bank_iban:           contract.bank_iban.trim() || null,
        payment_method:      contract.payment_method as PaymentMethod,
        effective_from:      today(),
        effective_to:        null,
        created_by:          user.id,
      });

      if (salaryChanged && previousContract) {
        await logEvent(id, 'salary_change',
          `Salary updated from EGP ${previousContract.salary_package.toLocaleString()} to EGP ${newSalary.toLocaleString()}`,
          user.id,
          { old: previousContract.salary_package, new: newSalary }
        );
      }
      if (buildingChanged && previousContract) {
        await logEvent(id, 'building_transfer',
          `Transferred from ${previousContract.building_code} to ${contract.building_code}`,
          user.id,
          { old: previousContract.building_code, new: contract.building_code }
        );
      }
    } else {
      // No salary/building change — patch non-key contract fields in-place
      await sb
        .from('hr_employee_contracts')
        .update({
          contract_type:       contract.contract_type as ContractType,
          contract_end:        contract.contract_type === 'fixed_term' ? (contract.contract_end || null) : null,
          transport_allowance: parseNum(contract.transport_allowance),
          travel_allowance:    parseNum(contract.travel_allowance),
          fixed_bonus:         parseNum(contract.fixed_bonus),
          bank_name:           contract.bank_name.trim() || null,
          bank_account:        contract.bank_account.trim() || null,
          bank_iban:           contract.bank_iban.trim() || null,
          payment_method:      contract.payment_method as PaymentMethod,
        })
        .eq('employee_id', id)
        .is('effective_to', null);
    }

    revalidatePath('/beithady/hr/team');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── terminateEmployeeAction ────────────────────────────────────────────────

export async function terminateEmployeeAction(
  id: string,
  dateTerminated: string,
  reason: string
): Promise<ActionResult> {
  try {
    const user = await requireHrAccess();
    const sb = supabaseAdmin();

    const { error } = await sb
      .from('hr_employees')
      .update({
        status:             'terminated',
        date_terminated:    dateTerminated || today(),
        termination_reason: reason.trim() || null,
        // updated_at auto-managed by trigger
      })
      .eq('id', id);

    if (error) return { error: error.message };

    await logEvent(
      id,
      'terminated',
      `Employment terminated${reason ? ': ' + reason : ''}`,
      user.id,
      { date: dateTerminated, reason }
    );

    revalidatePath('/beithady/hr/team');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
