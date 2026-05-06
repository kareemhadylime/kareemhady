'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createContract } from '@/lib/fmplus/budget/contracts/create';
import { updateContractMetadata, addServiceLine, deleteContract } from '@/lib/fmplus/budget/contracts/edit';
import { requireBudgetAdmin } from '@/lib/fmplus/budget/permissions';
import type { ServiceLine } from '@/lib/fmplus/budget/types';

function tryParseJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/**
 * Parse the payment_terms_days FormData value into a non-negative integer or
 * null. Empty/invalid input becomes null (defensive — no throw on bad UX).
 */
function parsePaymentTermsDays(raw: FormDataEntryValue | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.toString().trim();
  if (trimmed === '') return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export async function createContractAction(formData: FormData) {
  await requireBudgetAdmin();

  const project_id = Number(formData.get('project_id'));
  const name = String(formData.get('name') ?? '').trim();
  const customer = String(formData.get('customer') ?? '').trim() || null;
  const start_date = String(formData.get('start_date') ?? '');
  const end_date = String(formData.get('end_date') ?? '');
  const contract_value = Number(formData.get('contract_value') ?? 0);
  const vat_pct = Number(formData.get('vat_pct') ?? 14);
  const year_tracking = String(formData.get('year_tracking') ?? 'contract') as 'contract' | 'fiscal';
  const service_lines = formData.getAll('service_line').map(String) as ServiceLine[];
  const zones = String(formData.get('zones') ?? '').split(',').map(s => s.trim()).filter(Boolean);

  if (!Number.isFinite(project_id) || project_id <= 0) {
    throw new Error('Pick a valid Odoo analytic account');
  }
  if (!name || !start_date || !end_date) {
    throw new Error('Name, start date, and end date are required');
  }
  if (service_lines.length === 0) {
    throw new Error('Select at least one service line');
  }

  const { contract_id, year_index } = await createContract({
    contract: {
      project_id,
      name,
      customer,
      start_date,
      end_date,
      contract_value,
      vat_pct,
      year_tracking,
      reimbursables: [],
      zones: zones.length ? zones : [],
    },
    service_lines,
  });

  revalidatePath('/fmplus/financial/budget/projects');
  redirect(`/fmplus/financial/budget/edit?contract=${contract_id}&year=${year_index}`);
}

export async function updateContractAction(formData: FormData) {
  await requireBudgetAdmin();

  const contract_id = Number(formData.get('contract_id'));
  const name = String(formData.get('name') ?? '').trim();
  const customer = String(formData.get('customer') ?? '').trim() || null;
  const start_date = String(formData.get('start_date') ?? '');
  const end_date = String(formData.get('end_date') ?? '');
  const contract_value = Number(formData.get('contract_value') ?? 0);
  const vat_pct = Number(formData.get('vat_pct') ?? 14);
  const year_tracking = (String(formData.get('year_tracking') ?? 'contract')) as 'contract' | 'fiscal';
  const zones = String(formData.get('zones') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const notes = String(formData.get('notes') ?? '').trim() || null;
  const customer_logo_url = String(formData.get('customer_logo_url') ?? '').trim() || null;
  const customer_contacts = tryParseJson(formData.get('customer_contacts')?.toString() ?? '[]', []);
  const payment_terms_days = parsePaymentTermsDays(formData.get('payment_terms_days'));
  const scope_summary = String(formData.get('scope_summary') ?? '').trim() || null;

  if (!Number.isFinite(contract_id) || contract_id <= 0) throw new Error('Invalid contract_id');
  if (!name || !start_date || !end_date) throw new Error('Name, start, and end dates are required');

  await updateContractMetadata({
    contract_id, name, customer, start_date, end_date, contract_value, vat_pct, year_tracking, zones, notes,
    customer_logo_url, customer_contacts, payment_terms_days, scope_summary,
  });

  revalidatePath('/fmplus/financial/budget/projects');
  revalidatePath(`/fmplus/financial/budget/projects/${contract_id}`);
}

export async function addServiceLineAction(input: { contract_id: number; service_line: ServiceLine }) {
  await requireBudgetAdmin();
  const result = await addServiceLine(input);
  revalidatePath(`/fmplus/financial/budget/projects/${input.contract_id}`);
  revalidatePath('/fmplus/financial/budget/edit');
  return result;
}

export async function deleteContractAction(contractId: number) {
  await requireBudgetAdmin();
  if (!Number.isInteger(contractId) || contractId <= 0) throw new Error('Invalid contract_id');
  await deleteContract(contractId);
  revalidatePath('/fmplus/financial/budget/projects');
  revalidatePath('/fmplus/financial/budget');
  redirect('/fmplus/financial/budget/projects');
}
