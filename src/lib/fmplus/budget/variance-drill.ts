import { supabaseAdmin } from '@/lib/supabase';
import type { AccountMapJsonT } from './schema';
import { matchAccountToCategory } from './variance';

export function matchesCellFilter(
  ml: { date: string; account_code: string },
  cell: { category: string; month: number; year: number },
  map: AccountMapJsonT,
): boolean {
  const d = new Date(ml.date);
  if (d.getUTCFullYear() !== cell.year) return false;
  if (d.getUTCMonth() + 1 !== cell.month) return false;
  return matchAccountToCategory(ml.account_code, map) === cell.category;
}

export type DrillResult = {
  move_line_id: number;
  date: string;
  amount: number;
  account_code: string;
  account_name: string;
  partner_name: string | null;
  // odoo_move_lines.name — the line description text. Closest analog to a
  // journal "ref" available in the local mirror; the synced schema does not
  // carry an `account_move`/`account_journal` table, so we surface this
  // line-level label instead. UI can render as "Description" or omit.
  description: string | null;
};

export async function cellToMoveLines(opts: {
  projectId: number;
  category: string;
  month: number;
  year: number;
  accountMap: AccountMapJsonT;
}): Promise<DrillResult[]> {
  const sb = supabaseAdmin();
  const fromDate = `${opts.year}-${String(opts.month).padStart(2, '0')}-01`;
  const toDate   = monthEnd(opts.year, opts.month);
  const { data: links } = await sb
    .from('odoo_move_line_analytics')
    .select('move_line_id')
    .eq('analytic_account_id', opts.projectId);
  const ids = ((links ?? []) as Array<{ move_line_id: number }>).map(x => x.move_line_id);
  if (ids.length === 0) return [];
  const { data: rows } = await sb
    .from('odoo_move_lines')
    .select(`
      id, date, balance, name,
      odoo_accounts!inner(code, name),
      odoo_partners(name)
    `)
    .in('id', ids)
    .gte('date', fromDate)
    .lte('date', toDate);
  type Row = {
    id: number; date: string; balance: number; name: string | null;
    odoo_accounts: { code: string; name: string };
    odoo_partners: { name: string } | null;
  };
  const all = (rows ?? []) as unknown as Row[];
  return all
    .filter(r => matchesCellFilter(
      { date: r.date, account_code: r.odoo_accounts.code },
      { category: opts.category, month: opts.month, year: opts.year },
      opts.accountMap,
    ))
    .map(r => ({
      move_line_id: r.id,
      date: r.date,
      amount: Number(r.balance),
      account_code: r.odoo_accounts.code,
      account_name: r.odoo_accounts.name,
      partner_name: r.odoo_partners?.name ?? null,
      description: r.name,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function monthEnd(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}
