/**
 * Reads /tmp/budget-import.json (output of bulk-import-budgets.ts) and emits
 * SQL inserts ready to pipe through Supabase `execute_sql`. Uses CTEs so
 * each contract's inserts share the contract_id + year_id without round-trips.
 *
 * Run via:
 *   npx tsx scripts/bulk-import-emit-sql.ts > /tmp/budget-import.sql
 */
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const inPath = join(tmpdir(), 'budget-import.json');
const data = JSON.parse(readFileSync(inPath, 'utf8'));

const sqlEscape = (s: string | null | undefined) =>
  s == null ? 'null' : "'" + String(s).replace(/'/g, "''") + "'";

function n(v: unknown): string {
  if (v == null) return 'null';
  const num = Number(v);
  return Number.isFinite(num) ? String(num) : 'null';
}

const blocks: string[] = [];

for (const c of data.contracts) {
  const zonesJson = JSON.stringify(c.zones);

  const lines: string[] = [];
  lines.push(`-- Contract: ${c.name} (project_id=${c.project_id})`);
  lines.push(`do $$
declare
  v_contract_id bigint;
  v_year_id bigint;
begin
  insert into public.project_contracts
    (project_id, name, customer, start_date, end_date, contract_value, vat_pct, year_tracking, reimbursables, zones)
  values
    (${c.project_id}, ${sqlEscape(c.name)}, ${sqlEscape(c.customer)}, ${sqlEscape(c.start_date)}, ${sqlEscape(c.end_date)}, ${c.contract_value}, 14, ${sqlEscape(c.year_tracking)}, '[]'::jsonb, ${sqlEscape(zonesJson)}::jsonb)
  returning id into v_contract_id;`);

  // services
  for (const sl of c.services) {
    lines.push(`  insert into public.project_services (contract_id, service_line, template_version) values (v_contract_id, ${sqlEscape(sl)}, 1);`);
  }

  // years
  for (const y of c.years) {
    lines.push(`  insert into public.project_years
    (contract_id, year_index, fiscal_year, start_month, scenario, status)
  values
    (v_contract_id, ${y.year_index}, null, 1, 'initial', 'draft')
  returning id into v_year_id;`);

    // year_services with monthly_revenue=0
    for (const sl of c.services) {
      lines.push(`  insert into public.project_year_services (year_id, service_line, monthly_revenue, vat_pct) values (v_year_id, ${sqlEscape(sl)}, 0, 14);`);
    }

    // budget_lines — use bulk insert for performance
    if (y.lines.length > 0) {
      const valuesList = y.lines.map((l: any) => `(v_year_id, ${sqlEscape(l.service_line)}, ${sqlEscape(l.category)}, ${sqlEscape(l.line_code)}, ${sqlEscape(l.label_en)}, ${sqlEscape(l.label_ar)}, 'high', ${n(l.qty)}, ${n(l.unit_cost)}, ${n(l.ctc_net)}, ${n(l.ctc_relievers)}, ${n(l.ctc_ot)}, ${n(l.ctc_training)}, ${n(l.ctc_insurance)}, ${n(l.ctc_medical)})`).join(',\n    ');
      lines.push(`  insert into public.budget_lines
    (year_id, service_line, category, line_code, label_en, label_ar, season, qty, unit_cost, ctc_net, ctc_relievers, ctc_ot, ctc_training, ctc_insurance, ctc_medical)
  values
    ${valuesList};`);
    }
  }

  lines.push(`end $$;`);
  blocks.push(lines.join('\n'));
}

console.log(blocks.join('\n\n'));
