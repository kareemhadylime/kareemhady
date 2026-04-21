import { supabaseAdmin } from './supabase';

// Consolidated P&L for Beithady Egypt (5) + Beithady Dubai (10). A1HOSPITALITY
// is excluded per the Feb 2026 xlsx Filters sheet. Intercompany eliminations
// are already handled upstream (user confirmed: "Re Read this - it already
// eliminates the intercompany").
export const PNL_COMPANY_IDS = [5, 10];

// Egyptian CoA prefix convention — stable taxonomy from the Feb 2026 xlsx.
// Each top-level section has sub-sections keyed by 3-digit code prefixes.
// Accounts whose code doesn't start with any of these prefixes fall into
// the synthetic "Unclassified" bucket (shouldn't happen for posted moves
// on the Beithady CoA — we still surface it so no data is silently dropped).

export type PnlLeaf = {
  code: string;
  name: string;
  balance: number;       // signed so revenue is positive, costs positive
};

export type PnlSubgroup = {
  key: string;
  label: string;
  total: number;
  accounts: PnlLeaf[];
};

export type PnlSection = {
  key: string;
  label: string;
  total: number;
  subgroups: PnlSubgroup[];
};

export type PnlReport = {
  period: {
    from: string;
    to: string;
    label: string;
  };
  company_ids: number[];
  sections: {
    revenue: PnlSection;
    cost_of_revenue: PnlSection;
    home_owner_cut: PnlSection;
    general_expenses: PnlSection;
    interest_tax_dep: PnlSection;
  };
  totals: {
    revenue: number;
    cost_of_revenue: number;
    sub_gross_profit: number;
    home_owner_cut: number;
    gross_profit: number;
    general_expenses: number;
    ebitda: number;
    interest_tax_dep: number;
    net_profit: number;
  };
  line_count: number;
  unclassified: PnlLeaf[];
};

// Each section lists its subgroup definitions (3-digit prefix → label).
// Ordering matches the Feb 2026 xlsx presentation.
const SECTION_DEFS = {
  revenue: {
    label: 'Revenue',
    subgroups: [
      { key: '400', label: 'Activity revenues' },
      { key: '401', label: 'Other Revenues' },
    ],
    // Income accounts in Odoo carry a credit normal balance — debit minus
    // credit is negative. We flip the sign so display values are positive.
    flip: true,
  },
  cost_of_revenue: {
    label: 'Cost Of Revenue',
    subgroups: [
      { key: '500', label: 'Agents Cost' },
      { key: '501', label: 'Direct cost for reservations' },
      { key: '502', label: 'Operating Cost' },
    ],
    flip: false,
  },
  home_owner_cut: {
    label: 'Home Owner Cut',
    subgroups: [{ key: '504', label: 'Home Owner Cut' }],
    flip: false,
  },
  general_expenses: {
    label: 'General Expenses',
    subgroups: [
      { key: '600', label: 'Back Office Salaries, Benefits' },
      { key: '601', label: 'Office/Stores Rent & Utilities' },
      { key: '602', label: 'Transportation Expenses' },
      { key: '603', label: 'Legal & Financial Expenses' },
      { key: '604', label: 'Marketing & Tender expenses' },
      { key: '605', label: 'Other Expenses' },
    ],
    flip: false,
  },
  interest_tax_dep: {
    label: 'INT - TAXES - DEP',
    subgroups: [
      { key: '606', label: 'Interest' },
      { key: '607', label: 'Depreciation' },
      { key: '608', label: 'Taxes' },
    ],
    flip: false,
  },
} as const;

type SectionKey = keyof typeof SECTION_DEFS;

type RawAggregateRow = {
  code: string | null;
  name: string;
  sum_balance: number;
  line_count: number;
};

// Fetches aggregated line balances by account code for the given period and
// company scope. Returns one row per account with sum(balance).
async function fetchAccountTotals(params: {
  fromDate: string;
  toDate: string;
  companyIds: number[];
}): Promise<{ rows: RawAggregateRow[]; totalLineCount: number }> {
  const sb = supabaseAdmin();
  // Pull all move lines in the period + JOIN accounts for code/name. This is
  // fine while data is ~20-30k lines; if it grows we'll push the GROUP BY
  // into Postgres via an RPC.
  //
  // We explicitly NOT select reconciled / analytic here — just what we need.
  const { data, error } = await sb
    .from('odoo_move_lines')
    .select('balance, account_id, odoo_accounts!inner(code, name)')
    .gte('date', params.fromDate)
    .lte('date', params.toDate)
    .in('company_id', params.companyIds)
    .in('parent_state', ['draft', 'posted']);
  if (error) throw new Error(`fetchAccountTotals: ${error.message}`);

  type Row = {
    balance: number;
    account_id: number | null;
    odoo_accounts: { code: string | null; name: string } | null;
  };
  const lines = (data as unknown as Row[]) || [];
  const byAccount = new Map<string, RawAggregateRow>();
  for (const l of lines) {
    if (!l.odoo_accounts) continue;
    const code = l.odoo_accounts.code || '';
    const name = l.odoo_accounts.name || '';
    const key = `${code}::${name}`;
    const existing = byAccount.get(key);
    const bal = Number(l.balance) || 0;
    if (existing) {
      existing.sum_balance += bal;
      existing.line_count += 1;
    } else {
      byAccount.set(key, {
        code,
        name,
        sum_balance: bal,
        line_count: 1,
      });
    }
  }
  const rows = Array.from(byAccount.values()).sort((a, b) =>
    (a.code || '').localeCompare(b.code || '')
  );
  return { rows, totalLineCount: lines.length };
}

function sectionOf(code: string): { section: SectionKey; prefix: string } | null {
  for (const [sec, def] of Object.entries(SECTION_DEFS) as Array<
    [SectionKey, (typeof SECTION_DEFS)[SectionKey]]
  >) {
    for (const sg of def.subgroups) {
      if (code.startsWith(sg.key)) return { section: sec, prefix: sg.key };
    }
  }
  return null;
}

export async function buildPnlReport(params: {
  fromDate: string;       // YYYY-MM-DD inclusive
  toDate: string;         // YYYY-MM-DD inclusive
  label: string;
  companyIds?: number[];
}): Promise<PnlReport> {
  const companyIds = params.companyIds || PNL_COMPANY_IDS;
  const { rows, totalLineCount } = await fetchAccountTotals({
    fromDate: params.fromDate,
    toDate: params.toDate,
    companyIds,
  });

  // Seed empty section structures.
  const sections: PnlReport['sections'] = {
    revenue: emptySection('revenue'),
    cost_of_revenue: emptySection('cost_of_revenue'),
    home_owner_cut: emptySection('home_owner_cut'),
    general_expenses: emptySection('general_expenses'),
    interest_tax_dep: emptySection('interest_tax_dep'),
  };

  const unclassified: PnlLeaf[] = [];

  for (const r of rows) {
    const code = r.code || '';
    const found = sectionOf(code);
    const def = found ? SECTION_DEFS[found.section] : null;
    const display = def?.flip ? -r.sum_balance : r.sum_balance;
    if (!found || Math.abs(display) < 0.005) {
      // Skip zero-balance noise. Zero lines appear when a journal entry
      // splits debit+credit equally on the same account within period.
      if (!found && Math.abs(display) >= 0.005) {
        unclassified.push({
          code,
          name: r.name,
          balance: display,
        });
      }
      continue;
    }
    const section = sections[found.section];
    let sg = section.subgroups.find(s => s.key === found.prefix);
    if (!sg) {
      const lbl = def!.subgroups.find(s => s.key === found.prefix)?.label || found.prefix;
      sg = { key: found.prefix, label: lbl, total: 0, accounts: [] };
      section.subgroups.push(sg);
    }
    sg.accounts.push({ code, name: r.name, balance: display });
    sg.total += display;
    section.total += display;
  }

  // Sort subgroups to match SECTION_DEFS order.
  for (const [secKey, def] of Object.entries(SECTION_DEFS) as Array<
    [SectionKey, (typeof SECTION_DEFS)[SectionKey]]
  >) {
    const orderMap = new Map<string, number>(
      def.subgroups.map((s, i) => [s.key as string, i])
    );
    sections[secKey].subgroups.sort(
      (a, b) => (orderMap.get(a.key) ?? 99) - (orderMap.get(b.key) ?? 99)
    );
    for (const sg of sections[secKey].subgroups) {
      sg.accounts.sort((a, b) => a.code.localeCompare(b.code));
    }
  }

  const totals = {
    revenue: sections.revenue.total,
    cost_of_revenue: sections.cost_of_revenue.total,
    sub_gross_profit:
      sections.revenue.total - sections.cost_of_revenue.total,
    home_owner_cut: sections.home_owner_cut.total,
    gross_profit:
      sections.revenue.total -
      sections.cost_of_revenue.total -
      sections.home_owner_cut.total,
    general_expenses: sections.general_expenses.total,
    ebitda:
      sections.revenue.total -
      sections.cost_of_revenue.total -
      sections.home_owner_cut.total -
      sections.general_expenses.total,
    interest_tax_dep: sections.interest_tax_dep.total,
    net_profit:
      sections.revenue.total -
      sections.cost_of_revenue.total -
      sections.home_owner_cut.total -
      sections.general_expenses.total -
      sections.interest_tax_dep.total,
  };

  return {
    period: { from: params.fromDate, to: params.toDate, label: params.label },
    company_ids: companyIds,
    sections,
    totals,
    line_count: totalLineCount,
    unclassified: unclassified.sort((a, b) => a.code.localeCompare(b.code)),
  };
}

function emptySection(key: SectionKey): PnlSection {
  const def = SECTION_DEFS[key];
  return {
    key,
    label: def.label,
    total: 0,
    subgroups: def.subgroups.map(sg => ({
      key: sg.key,
      label: sg.label,
      total: 0,
      accounts: [],
    })),
  };
}

// -------- Payables ----------

export type PayablePartnerRow = {
  partner_id: number;
  partner_name: string;
  amount: number;
  line_count: number;
};

export type PayablesReport = {
  as_of: string;
  company_ids: number[];
  vendors: { total: number; partners: PayablePartnerRow[] };
  employees: { total: number; partners: PayablePartnerRow[] };
  owners: { total: number; partners: PayablePartnerRow[] };
};

export async function buildPayablesReport(params: {
  asOf: string;
  companyIds?: number[];
}): Promise<PayablesReport> {
  const companyIds = params.companyIds || PNL_COMPANY_IDS;
  const sb = supabaseAdmin();

  // Pull open-AP lines (amount_residual != 0) within company scope.
  // account_type is 'liability_payable' for standard AP accounts in Odoo.
  // We also include any 504xxx (Home Owner Cut) lines with residual since
  // owners may book under a different account_type.
  const { data: payableLines, error } = await sb
    .from('odoo_move_lines')
    .select(
      'partner_id, amount_residual, odoo_accounts!inner(code, account_type), odoo_partners!inner(id, name, supplier_rank, is_employee, is_owner)'
    )
    .in('company_id', companyIds)
    .in('parent_state', ['draft', 'posted'])
    .lte('date', params.asOf)
    .not('amount_residual', 'eq', 0);
  if (error) throw new Error(`buildPayablesReport: ${error.message}`);

  type Row = {
    partner_id: number | null;
    amount_residual: number;
    odoo_accounts: {
      code: string | null;
      account_type: string | null;
    } | null;
    odoo_partners: {
      id: number;
      name: string;
      supplier_rank: number;
      is_employee: boolean;
      is_owner: boolean;
    } | null;
  };
  const lines = ((payableLines as unknown) as Row[]) || [];

  const byKindPartner = new Map<
    string,
    PayablePartnerRow & { kind: 'vendor' | 'employee' | 'owner' }
  >();

  for (const l of lines) {
    if (!l.odoo_partners || l.partner_id == null) continue;
    const code = l.odoo_accounts?.code || '';
    const acctType = l.odoo_accounts?.account_type || '';
    // Classify: owners take priority (any partner flagged as owner, or line
    // hitting 504xxx); then employees; then vendors (supplier_rank > 0 or
    // any remaining liability_payable line).
    let kind: 'vendor' | 'employee' | 'owner' | null = null;
    if (l.odoo_partners.is_owner || code.startsWith('504')) {
      kind = 'owner';
    } else if (l.odoo_partners.is_employee) {
      kind = 'employee';
    } else if (
      acctType === 'liability_payable' ||
      l.odoo_partners.supplier_rank > 0
    ) {
      kind = 'vendor';
    }
    if (!kind) continue;

    const key = `${kind}:${l.partner_id}`;
    const existing = byKindPartner.get(key);
    const amt = Number(l.amount_residual) || 0;
    if (existing) {
      existing.amount += amt;
      existing.line_count += 1;
    } else {
      byKindPartner.set(key, {
        kind,
        partner_id: l.partner_id,
        partner_name: l.odoo_partners.name || `Partner ${l.partner_id}`,
        amount: amt,
        line_count: 1,
      });
    }
  }

  const all = Array.from(byKindPartner.values());
  const reduce = (kind: 'vendor' | 'employee' | 'owner') => {
    const partners = all
      .filter(r => r.kind === kind && Math.abs(r.amount) >= 0.005)
      .map(({ kind: _k, ...rest }) => rest)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    const total = partners.reduce((s, p) => s + p.amount, 0);
    return { total, partners };
  };

  return {
    as_of: params.asOf,
    company_ids: companyIds,
    vendors: reduce('vendor'),
    employees: reduce('employee'),
    owners: reduce('owner'),
  };
}

// -------- Period helpers ----------

export type FinancePeriod = {
  id: string;
  label: string;
  fromDate: string;
  toDate: string;
};

export function resolveFinancePeriod(
  preset: string | undefined,
  fromParam: string | undefined,
  toParam: string | undefined,
  now: Date = new Date()
): FinancePeriod {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed
  const pad = (n: number) => String(n).padStart(2, '0');

  const firstOfMonth = (yy: number, mm: number) => `${yy}-${pad(mm + 1)}-01`;
  const lastOfMonth = (yy: number, mm: number) => {
    // 0-th day of next month = last day of current month.
    const d = new Date(Date.UTC(yy, mm + 1, 0));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };

  const makeMonth = (yy: number, mm: number, label: string): FinancePeriod => ({
    id: `month-${yy}-${pad(mm + 1)}`,
    label,
    fromDate: firstOfMonth(yy, mm),
    toDate: lastOfMonth(yy, mm),
  });

  if (preset === 'custom' && fromParam && toParam) {
    return {
      id: 'custom',
      label: `${fromParam} → ${toParam}`,
      fromDate: fromParam,
      toDate: toParam,
    };
  }

  // Pattern: preset "month:2026-02" pins a specific month.
  if (preset && preset.startsWith('month:')) {
    const [yStr, mStr] = preset.slice('month:'.length).split('-');
    const yy = Number(yStr);
    const mm = Number(mStr) - 1;
    if (Number.isFinite(yy) && Number.isFinite(mm) && mm >= 0 && mm <= 11) {
      const d = new Date(Date.UTC(yy, mm, 1));
      const label = d.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
      return makeMonth(yy, mm, label);
    }
  }

  switch (preset) {
    case 'last_month': {
      const d = new Date(Date.UTC(y, m - 1, 1));
      return makeMonth(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })
      );
    }
    case 'this_year':
      return {
        id: 'this_year',
        label: `${y}`,
        fromDate: `${y}-01-01`,
        toDate: `${y}-12-31`,
      };
    case 'last_year':
      return {
        id: 'last_year',
        label: `${y - 1}`,
        fromDate: `${y - 1}-01-01`,
        toDate: `${y - 1}-12-31`,
      };
    case 'this_quarter': {
      const qStart = Math.floor(m / 3) * 3;
      return {
        id: 'this_quarter',
        label: `Q${qStart / 3 + 1} ${y}`,
        fromDate: firstOfMonth(y, qStart),
        toDate: lastOfMonth(y, qStart + 2),
      };
    }
    case 'last_quarter': {
      const lastQStart = Math.floor(m / 3) * 3 - 3;
      const qy = lastQStart < 0 ? y - 1 : y;
      const qm = (lastQStart + 12) % 12;
      return {
        id: 'last_quarter',
        label: `Q${Math.floor(qm / 3) + 1} ${qy}`,
        fromDate: firstOfMonth(qy, qm),
        toDate: lastOfMonth(qy, qm + 2),
      };
    }
    case 'this_month':
    default: {
      const d = new Date(Date.UTC(y, m, 1));
      return makeMonth(
        y,
        m,
        d.toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })
      );
    }
  }
}
