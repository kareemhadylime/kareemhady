import { budgetDb, TABLES } from '../db';
import { ProjectContractSchema } from '../schema';
import type { ServiceLine } from '../types';

/**
 * Update contract metadata (name/customer/dates/value/VAT/year_tracking/zones/notes/customer_logo_url/customer_contacts/payment_terms_days/scope_summary).
 * project_id and reimbursables are NOT editable via this path — they're set at create-time.
 *
 * payment_terms_days replaced the free-text payment_terms field in migration 0095.
 * The text column is preserved on the row for historical reference but is no
 * longer written by this action.
 */
export async function updateContractMetadata(input: {
  contract_id: number;
  name: string;
  customer: string | null;
  start_date: string;
  end_date: string;
  contract_value: number;
  vat_pct: number;
  year_tracking: 'contract' | 'fiscal';
  zones: string[];
  notes: string | null;
  customer_logo_url?: string | null;
  customer_contacts?: Array<{name: string; role: string; email: string; phone: string; primary: boolean}>;
  payment_terms_days?: number | null;
  scope_summary?: string | null;
}) {
  const sb = budgetDb();
  // Verify contract exists
  const { data: existing } = await sb.from(TABLES.contracts)
    .select('id, project_id')
    .eq('id', input.contract_id)
    .single();
  if (!existing) throw new Error('Contract not found');

  // Validate via Zod (re-using ProjectContractSchema as base, with project_id pulled forward)
  ProjectContractSchema.parse({
    project_id: existing.project_id,
    name: input.name,
    customer: input.customer,
    start_date: input.start_date,
    end_date: input.end_date,
    contract_value: input.contract_value,
    vat_pct: input.vat_pct,
    year_tracking: input.year_tracking,
    reimbursables: [],
    zones: input.zones,
    notes: input.notes,
  });

  const { error } = await sb.from(TABLES.contracts).update({
    name: input.name,
    customer: input.customer,
    start_date: input.start_date,
    end_date: input.end_date,
    contract_value: input.contract_value,
    vat_pct: input.vat_pct,
    year_tracking: input.year_tracking,
    zones: input.zones,
    notes: input.notes,
    customer_logo_url: input.customer_logo_url ?? null,
    customer_contacts: input.customer_contacts ?? [],
    payment_terms_days: input.payment_terms_days ?? null,
    scope_summary: input.scope_summary ?? null,
  }).eq('id', input.contract_id);
  if (error) throw error;
}

/**
 * Add a new service line to an existing contract. Creates the project_services
 * row + project_year_services rows for every existing year on the contract
 * (so the new service shows up in every year's Editor with monthly_revenue=0).
 */
export async function addServiceLine(input: {
  contract_id: number;
  service_line: ServiceLine;
}): Promise<{ added: boolean; reason?: string }> {
  const sb = budgetDb();

  // Check contract exists + service not already there
  const { data: existing } = await sb.from(TABLES.services)
    .select('id')
    .eq('contract_id', input.contract_id)
    .eq('service_line', input.service_line)
    .maybeSingle();
  if (existing) {
    return { added: false, reason: 'Service line already on this contract' };
  }

  const { data: contract } = await sb.from(TABLES.contracts)
    .select('vat_pct')
    .eq('id', input.contract_id)
    .single();
  if (!contract) throw new Error('Contract not found');

  // Insert project_services row
  const { error: sErr } = await sb.from(TABLES.services).insert({
    contract_id: input.contract_id,
    service_line: input.service_line,
    template_version: 1,
  });
  if (sErr) throw sErr;

  // Insert project_year_services for every year on the contract
  const { data: years } = await sb.from(TABLES.years)
    .select('id')
    .eq('contract_id', input.contract_id)
    .eq('scenario', 'initial');
  if (years && years.length > 0) {
    await sb.from(TABLES.year_services).insert(
      years.map(y => ({
        year_id: y.id,
        service_line: input.service_line,
        monthly_revenue: 0,
        vat_pct: (contract as any).vat_pct ?? 14,
      }))
    );
  }

  return { added: true };
}

/**
 * Delete a contract and all its dependents (years, services, lines, mob,
 * audit, year_services, catalog overrides). FK cascades handle most of it.
 *
 * Project_catalog_overrides cascade on contract_id ON DELETE CASCADE.
 * Mobilization_lines cascade on contract_id ON DELETE CASCADE.
 * Project_services cascade on contract_id ON DELETE CASCADE.
 * Project_years cascade on contract_id ON DELETE CASCADE.
 * Project_year_services cascade on year_id ON DELETE CASCADE (via years).
 * Budget_lines cascade on year_id ON DELETE CASCADE (via years).
 * Budget_audit cascade on year_id ON DELETE CASCADE (via years).
 *
 * So a single DELETE on project_contracts removes everything.
 */
export async function deleteContract(contractId: number): Promise<void> {
  const sb = budgetDb();
  const { error } = await sb.from(TABLES.contracts).delete().eq('id', contractId);
  if (error) throw error;
}
