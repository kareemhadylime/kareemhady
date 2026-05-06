// src/lib/fmplus/performance/derive-unmapped.ts
import { supabaseAdmin } from '@/lib/supabase';
import { getTemplate } from '@/lib/fmplus/budget/templates';
import type { ServiceLine } from '@/lib/fmplus/budget/types';
import type { UnmappedLine } from './types';

interface ServiceTplKey {
  service_line: ServiceLine;
  template_version?: number | null;
}

const MAX_LINES = 200; // cap so we don't blow up the payload

/**
 * Fetch GL move lines that hit the contract's analytic account in the period
 * but whose account code does NOT match any pattern in any of the contract's
 * active service-line templates. Returns top-N by amount desc.
 *
 * Filters applied:
 *  - account_type starts with 'expense' (skip revenue + balance-sheet lines)
 *  - non-zero (debit - credit)
 *  - account.code matches NONE of the union of code_patterns across all of
 *    the contract's service templates
 */
export async function unmappedLines(args: {
  contract_id: number;
  project_id: number; // odoo_analytic_account.id
  period_from: string;
  period_to: string;
  services: ServiceTplKey[];
}): Promise<UnmappedLine[]> {
  if (args.services.length === 0) return [];

  // Build the union of regex patterns across all of the contract's templates.
  // Patterns live on tpl.account_map_json[].code_patterns (NOT on the
  // categories array — that has only labels + lines).
  const patterns: RegExp[] = [];
  for (const svc of args.services) {
    let tpl;
    try {
      tpl = getTemplate(svc.service_line, svc.template_version ?? 1);
    } catch {
      continue; // unknown service / unsupported version — skip
    }
    for (const m of tpl.account_map_json ?? []) {
      for (const p of m.code_patterns ?? []) {
        try {
          patterns.push(new RegExp(p));
        } catch {
          /* ignore malformed pattern */
        }
      }
    }
  }
  if (patterns.length === 0) return [];

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('odoo_move_lines')
    .select(
      `id, move_id, date, name, debit, credit, partner_id,
       account:odoo_accounts!inner(code, name, account_type),
       analytics:odoo_move_line_analytics!inner(analytic_account_id),
       partner:odoo_partners(name)`,
    )
    .eq('parent_state', 'posted')
    .eq('analytics.analytic_account_id', args.project_id)
    .gte('date', args.period_from)
    .lte('date', args.period_to);

  if (error) throw error;

  type Row = {
    id: number;
    move_id: number;
    date: string;
    name: string | null;
    debit: number | string | null;
    credit: number | string | null;
    partner_id: number | null;
    account:
      | { code: string | null; name: string | null; account_type: string | null }
      | Array<{ code: string | null; name: string | null; account_type: string | null }>
      | null;
    partner: { name: string | null } | Array<{ name: string | null }> | null;
  };
  const rows = (data ?? []) as Row[];

  const unmapped: UnmappedLine[] = [];
  for (const r of rows) {
    // Supabase's typed `select` may return the joined relation as an array
    // (when the FK could-be-many) or as a single object. Normalize.
    const account = Array.isArray(r.account) ? r.account[0] : r.account;
    const partner = Array.isArray(r.partner) ? r.partner[0] : r.partner;
    const code = account?.code;
    const accountType = account?.account_type ?? '';
    if (!code) continue;
    if (!accountType.startsWith('expense')) continue; // skip revenue + balance-sheet lines

    const debit =
      typeof r.debit === 'string' ? Number.parseFloat(r.debit) : r.debit ?? 0;
    const credit =
      typeof r.credit === 'string' ? Number.parseFloat(r.credit) : r.credit ?? 0;
    const amount = (debit ?? 0) - (credit ?? 0);
    if (amount === 0) continue;

    const matched = patterns.some(re => re.test(code));
    if (matched) continue;

    unmapped.push({
      move_line_id: r.id,
      date: r.date,
      account_code: code,
      account_name: account?.name ?? '',
      partner_name: partner?.name ?? null,
      journal: null,
      ref: r.name,
      amount,
      drill_url: `/fmplus/financial/budget/variance?contract=${args.contract_id}&move_line=${r.id}`,
    });
  }

  // Sort by amount desc, cap to top MAX_LINES
  unmapped.sort((a, b) => b.amount - a.amount);
  return unmapped.slice(0, MAX_LINES);
}
