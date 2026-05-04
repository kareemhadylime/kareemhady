import { budgetDb, TABLES } from './db';
import { getTemplate } from './templates';
import type { ServiceLine, Category } from './types';

export interface DrillRow {
  move_id: number;
  date: string;
  amount: number;
  account_code: string | null;
  account_name: string | null;
  partner_name: string | null;
  journal_name: string | null;
  ref: string | null;
}

/**
 * Load the underlying odoo_move_lines for a single (contract, year, service, category, month)
 * cell of the variance grid. Used by the drill-drawer in the Variance page.
 */
export async function cellToMoveLines(opts: {
  contractId: number;
  yearIndex: number;
  scenario?: 'initial' | 'revised' | 'reforecast';
  serviceLine: ServiceLine;
  category: Category;
  month: number; // 1-12
}): Promise<DrillRow[]> {
  const sb = budgetDb();

  // Load contract + year + service to derive scope
  const { data: contract } = await sb.from(TABLES.contracts)
    .select('id, project_id, start_date, end_date')
    .eq('id', opts.contractId)
    .single();
  if (!contract) return [];

  const { data: year } = await sb.from(TABLES.years)
    .select('id, year_index, fiscal_year, start_month')
    .eq('contract_id', opts.contractId)
    .eq('year_index', opts.yearIndex)
    .eq('scenario', opts.scenario ?? 'initial')
    .single();
  if (!year) return [];

  // Load service template_version to get account_map_json
  const { data: svcRow } = await sb.from(TABLES.services)
    .select('template_version')
    .eq('contract_id', opts.contractId)
    .eq('service_line', opts.serviceLine)
    .single();
  if (!svcRow) return [];
  const tpl = getTemplate(opts.serviceLine, svcRow.template_version);
  const patterns = (tpl.account_map_json ?? [])
    .filter(m => m.category === opts.category)
    .flatMap(m => (m.code_patterns ?? []).map(p => new RegExp(p)));

  // Determine month start/end ISO
  const yearNum = year.fiscal_year ?? new Date(contract.start_date).getFullYear() + (opts.yearIndex - 1);
  const monthEnd = new Date(yearNum, opts.month, 0);
  const startIso = `${yearNum}-${String(opts.month).padStart(2,'0')}-01`;
  const endIso = `${yearNum}-${String(opts.month).padStart(2,'0')}-${String(monthEnd.getDate()).padStart(2,'0')}`;

  // Pull move lines for this month + scope
  const { data: rows } = await sb.from('odoo_move_lines')
    .select(`
      id, date, debit, credit, ref,
      account:odoo_accounts(code, name),
      partner:odoo_partners(name),
      journal:odoo_journals(name),
      analytics:odoo_move_line_analytics!inner(analytic_account_id)
    `)
    .gte('date', startIso)
    .lte('date', endIso)
    .eq('analytics.analytic_account_id', contract.project_id);

  return ((rows ?? []) as any[])
    .filter(r => {
      const code = r.account?.code as string | undefined;
      if (!code || patterns.length === 0) return false;
      return patterns.some(p => p.test(code));
    })
    .map(r => ({
      move_id: r.id,
      date: r.date,
      amount: Number(r.debit ?? 0) - Number(r.credit ?? 0),
      account_code: r.account?.code ?? null,
      account_name: r.account?.name ?? null,
      partner_name: r.partner?.name ?? null,
      journal_name: r.journal?.name ?? null,
      ref: r.ref ?? null,
    }));
}
