import { budgetDb, TABLES } from '../db';
import { ProjectContractSchema } from '../schema';
import type { ServiceLine } from '../types';

export interface CreateContractInput {
  contract: unknown; // validated via ProjectContractSchema
  service_lines: ServiceLine[];
  initial_year_start_month?: number;
}

/**
 * Atomically create:
 *   1. project_contracts row
 *   2. project_services rows (one per selected service line)
 *   3. project_years row for Y1 (scenario=initial, status=draft)
 *   4. project_year_services rows (one per service, monthly_revenue=0 to start)
 *
 * Uses sequential inserts because Supabase JS client lacks transactions; rollback
 * on partial failure is best-effort (delete the contract row, cascading FKs clean up).
 */
export async function createContract(input: CreateContractInput): Promise<{
  contract_id: number;
  year_id: number;
  year_index: number;
}> {
  const c = ProjectContractSchema.parse(input.contract);
  if (input.service_lines.length === 0) {
    throw new Error('At least one service line is required');
  }
  const sb = budgetDb();

  // 1. Insert contract
  const { data: cRow, error: cErr } = await sb.from(TABLES.contracts).insert(c).select().single();
  if (cErr) throw cErr;
  const contractId = (cRow as Record<string, unknown>).id as number;

  try {
    // 2. Insert project_services
    const { error: sErr } = await sb.from(TABLES.services).insert(
      input.service_lines.map(sl => ({
        contract_id: contractId,
        service_line: sl,
        template_version: 1,
      }))
    );
    if (sErr) throw sErr;

    // 3. Auto-create Y1
    const startMonth = input.initial_year_start_month ?? (new Date(c.start_date).getMonth() + 1);
    const fiscalYear = c.year_tracking === 'fiscal'
      ? new Date(c.start_date).getFullYear()
      : null;
    const { data: yRow, error: yErr } = await sb.from(TABLES.years).insert({
      contract_id: contractId,
      year_index: 1,
      fiscal_year: fiscalYear,
      start_month: startMonth,
      scenario: 'initial',
      status: 'draft',
    }).select().single();
    if (yErr) throw yErr;
    const yearId = (yRow as Record<string, unknown>).id as number;
    const yearIndex = (yRow as Record<string, unknown>).year_index as number;

    // 4. project_year_services with monthly_revenue=0
    const { error: ysErr } = await sb.from(TABLES.year_services).insert(
      input.service_lines.map(sl => ({
        year_id: yearId,
        service_line: sl,
        monthly_revenue: 0,
        vat_pct: c.vat_pct ?? 14,
      }))
    );
    if (ysErr) throw ysErr;

    return { contract_id: contractId, year_id: yearId, year_index: yearIndex };
  } catch (err) {
    // Best-effort rollback
    await sb.from(TABLES.contracts).delete().eq('id', contractId);
    throw err;
  }
}
