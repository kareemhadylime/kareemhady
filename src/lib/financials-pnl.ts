import { supabaseAdmin } from './supabase';

// Consolidated P&L for Beithady Egypt (5) + Beithady Dubai (10). A1HOSPITALITY
// is excluded per the Feb 2026 xlsx Filters sheet. Intercompany eliminations
// are already handled upstream (user confirmed).
export const PNL_COMPANY_IDS = [5, 10];

// The tenant's CoA diverges between companies — same code can mean different
// things (500103 = "Home Owner Cut" in some companies, "AGENTS COMMISION
// Hopper" in others). We therefore group by Odoo's native `account_type`
// taxonomy rather than by numeric code prefix, and pull out a synthetic
// "Home Owner Cut" subgroup by NAME since it's its own major P&L section
// in the xlsx.
//
// Accounts are classified via classifyAccount() below. The returned section
// + subgroup keys drive the hierarchical rollup.

export type PnlLeaf = {
  code: string;
  name: string;
  account_type: string;
  balance: number; // sign-normalized (revenue positive, costs positive)
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
  period: { from: string; to: string; label: string };
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

type SectionKey = keyof PnlReport['sections'];

// A single classify entry point. Returns the section + subgroup + label for
// a given account, using type + name heuristics.
function classifyAccount(
  code: string,
  name: string,
  accountType: string
): { section: SectionKey; subgroupKey: string; subgroupLabel: string; flip: boolean } | null {
  const n = (name || '').toLowerCase();
  const isHomeOwner = /home\s*owner|rent\s*cost/i.test(n);
  const isInterest = /\binterest\b|partners?\s*interest|loans?\s*interest/i.test(n);

  switch (accountType) {
    case 'income':
      return {
        section: 'revenue',
        subgroupKey: 'activity',
        subgroupLabel: 'Activity revenues',
        flip: true, // income has a credit normal balance → flip sign for display
      };
    case 'income_other':
      return {
        section: 'revenue',
        subgroupKey: 'other',
        subgroupLabel: 'Other Revenues',
        flip: true,
      };
    case 'expense_direct_cost': {
      if (isHomeOwner) {
        return {
          section: 'home_owner_cut',
          subgroupKey: 'home_owner_cut',
          subgroupLabel: 'Home Owner Cut & Rent',
          flip: false,
        };
      }
      // Agents commissions live at 500xxx in Odoo
      if (/(agents?|commis[s]?ion)/i.test(n)) {
        return {
          section: 'cost_of_revenue',
          subgroupKey: 'agents',
          subgroupLabel: 'Agents Cost',
          flip: false,
        };
      }
      // Operating-cost flavors: salaries, transport, electricity, platform
      // subscriptions, car/charging/toll, tax compensation
      if (
        /(salary|salaries|transport|electricity|water|gas|platform|car|charg|toll|tax\s*comp|overtime|bonus|subscribtion|subscription|vacation|purchases|subcontract|transfer)/i.test(
          n
        )
      ) {
        return {
          section: 'cost_of_revenue',
          subgroupKey: 'operating',
          subgroupLabel: 'Operating Cost',
          flip: false,
        };
      }
      // Everything else direct_cost goes into "Direct cost for reservations"
      return {
        section: 'cost_of_revenue',
        subgroupKey: 'direct',
        subgroupLabel: 'Direct cost for reservations',
        flip: false,
      };
    }
    case 'expense': {
      if (isInterest) {
        return {
          section: 'interest_tax_dep',
          subgroupKey: 'interest',
          subgroupLabel: 'Interest',
          flip: false,
        };
      }
      if (/tax/i.test(n) && !/compensat/i.test(n)) {
        return {
          section: 'interest_tax_dep',
          subgroupKey: 'taxes',
          subgroupLabel: 'Taxes',
          flip: false,
        };
      }
      // G&A subgroup by name pattern (matches the xlsx buckets)
      if (/(bonus|salary|salaries|basic\s*salar|outsourcing|social\s*insurance|stationary|medical|hr|bonuses)/i.test(n)) {
        return {
          section: 'general_expenses',
          subgroupKey: 'back_office',
          subgroupLabel: 'Back Office Salaries, Benefits',
          flip: false,
        };
      }
      if (/(rent.*g.*a|mobile|internet)/i.test(n)) {
        return {
          section: 'general_expenses',
          subgroupKey: 'office',
          subgroupLabel: 'Office/Stores Rent & Utilities',
          flip: false,
        };
      }
      if (/(solar|transportation|shiping|shipping)/i.test(n)) {
        return {
          section: 'general_expenses',
          subgroupKey: 'transport',
          subgroupLabel: 'Transportation Expenses',
          flip: false,
        };
      }
      if (/(bank|corporate|geidea|stripe|legal|financial)/i.test(n)) {
        return {
          section: 'general_expenses',
          subgroupKey: 'legal_fin',
          subgroupLabel: 'Legal & Financial Expenses',
          flip: false,
        };
      }
      if (/(advertis|marketing|tender)/i.test(n)) {
        return {
          section: 'general_expenses',
          subgroupKey: 'marketing',
          subgroupLabel: 'Marketing & Tender expenses',
          flip: false,
        };
      }
      // Anything else expense → Other Expenses bucket under G&A
      return {
        section: 'general_expenses',
        subgroupKey: 'other',
        subgroupLabel: 'Other Expenses',
        flip: false,
      };
    }
    case 'expense_depreciation':
      return {
        section: 'interest_tax_dep',
        subgroupKey: 'depreciation',
        subgroupLabel: 'Depreciation',
        flip: false,
      };
    default:
      return null; // balance-sheet types (asset_*, liability_*, equity_*) — skip
  }
}

const SECTION_LABEL: Record<SectionKey, string> = {
  revenue: 'Revenue',
  cost_of_revenue: 'Cost Of Revenue',
  home_owner_cut: 'Home Owner Cut & Rent',
  general_expenses: 'General Expenses',
  interest_tax_dep: 'INT - TAXES - DEP',
};

// Desired subgroup presentation order per section. Unknown keys fall at the end.
const SUBGROUP_ORDER: Record<SectionKey, string[]> = {
  revenue: ['activity', 'other'],
  cost_of_revenue: ['agents', 'direct', 'operating'],
  home_owner_cut: ['home_owner_cut'],
  general_expenses: [
    'back_office',
    'office',
    'transport',
    'legal_fin',
    'marketing',
    'other',
  ],
  interest_tax_dep: ['interest', 'depreciation', 'taxes'],
};

type RawAggregateRow = {
  code: string;
  name: string;
  account_type: string;
  sum_balance: number;
};

async function fetchAccountTotals(params: {
  fromDate: string;
  toDate: string;
  companyIds: number[];
}): Promise<{ rows: RawAggregateRow[]; totalLineCount: number }> {
  const sb = supabaseAdmin();
  // Pull all move lines in period + JOIN accounts. Supabase-js doesn't
  // support server-side GROUP BY on FK joins, so we aggregate in-memory.
  // Paginate to avoid the 1000-row default cap.
  const PAGE = 1000;
  let offset = 0;
  const byAccount = new Map<string, RawAggregateRow>();
  let totalLineCount = 0;

  while (true) {
    const { data, error } = await sb
      .from('odoo_move_lines')
      .select(
        'balance, odoo_accounts!inner(code, name, account_type)'
      )
      .gte('date', params.fromDate)
      .lte('date', params.toDate)
      .in('company_id', params.companyIds)
      .in('parent_state', ['draft', 'posted'])
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`fetchAccountTotals: ${error.message}`);
    const rows = (data as unknown as Array<{
      balance: number;
      odoo_accounts: { code: string | null; name: string; account_type: string | null } | null;
    }>) || [];
    if (rows.length === 0) break;
    totalLineCount += rows.length;

    for (const r of rows) {
      if (!r.odoo_accounts) continue;
      const code = r.odoo_accounts.code || '';
      const name = r.odoo_accounts.name || '';
      const accountType = r.odoo_accounts.account_type || '';
      // Composite key: (code|name|type) — account records share codes across
      // companies with DIFFERENT names (same code, different meaning), so
      // don't collapse by code alone.
      const key = `${code}||${name}||${accountType}`;
      const existing = byAccount.get(key);
      const bal = Number(r.balance) || 0;
      if (existing) {
        existing.sum_balance += bal;
      } else {
        byAccount.set(key, { code, name, account_type: accountType, sum_balance: bal });
      }
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  const rows = Array.from(byAccount.values()).sort((a, b) =>
    (a.code || '').localeCompare(b.code || '')
  );
  return { rows, totalLineCount };
}

export async function buildPnlReport(params: {
  fromDate: string;
  toDate: string;
  label: string;
  companyIds?: number[];
}): Promise<PnlReport> {
  const companyIds = params.companyIds || PNL_COMPANY_IDS;
  const { rows, totalLineCount } = await fetchAccountTotals({
    fromDate: params.fromDate,
    toDate: params.toDate,
    companyIds,
  });

  const sections: PnlReport['sections'] = {
    revenue: emptySection('revenue'),
    cost_of_revenue: emptySection('cost_of_revenue'),
    home_owner_cut: emptySection('home_owner_cut'),
    general_expenses: emptySection('general_expenses'),
    interest_tax_dep: emptySection('interest_tax_dep'),
  };

  const unclassified: PnlLeaf[] = [];

  for (const r of rows) {
    const cls = classifyAccount(r.code, r.name, r.account_type);
    if (!cls) continue; // balance-sheet accounts — not P&L
    const display = cls.flip ? -r.sum_balance : r.sum_balance;
    if (Math.abs(display) < 0.005) continue; // zero-balance noise

    const section = sections[cls.section];
    let sg = section.subgroups.find(s => s.key === cls.subgroupKey);
    if (!sg) {
      sg = {
        key: cls.subgroupKey,
        label: cls.subgroupLabel,
        total: 0,
        accounts: [],
      };
      section.subgroups.push(sg);
    }
    sg.accounts.push({
      code: r.code,
      name: r.name,
      account_type: r.account_type,
      balance: display,
    });
    sg.total += display;
    section.total += display;
  }

  // Sort subgroups per predefined order.
  for (const secKey of Object.keys(sections) as SectionKey[]) {
    const order = SUBGROUP_ORDER[secKey];
    const orderMap = new Map<string, number>(order.map((k, i) => [k, i]));
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
  return {
    key,
    label: SECTION_LABEL[key],
    total: 0,
    subgroups: [],
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

  // Pull open-AP lines (amount_residual != 0) within company scope. Matching
  // by name "Home Owner Cut" and "Rent Costs" is how we detect owner lines
  // since the tenant doesn't use 504xxx codes.
  const PAGE = 1000;
  let offset = 0;
  type Row = {
    partner_id: number | null;
    amount_residual: number;
    odoo_accounts: {
      code: string | null;
      name: string | null;
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
  const allRows: Row[] = [];
  while (true) {
    const { data, error } = await sb
      .from('odoo_move_lines')
      .select(
        'partner_id, amount_residual, odoo_accounts!inner(code, name, account_type), odoo_partners!inner(id, name, supplier_rank, is_employee, is_owner)'
      )
      .in('company_id', companyIds)
      .in('parent_state', ['draft', 'posted'])
      .lte('date', params.asOf)
      .not('amount_residual', 'eq', 0)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`buildPayablesReport: ${error.message}`);
    const page = (data as unknown as Row[]) || [];
    allRows.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  const byKindPartner = new Map<
    string,
    PayablePartnerRow & { kind: 'vendor' | 'employee' | 'owner' }
  >();

  for (const l of allRows) {
    if (!l.odoo_partners || l.partner_id == null) continue;
    const acctName = (l.odoo_accounts?.name || '').toLowerCase();
    const acctType = l.odoo_accounts?.account_type || '';

    const isOwnerLine =
      l.odoo_partners.is_owner || /home\s*owner|rent\s*cost/i.test(acctName);

    let kind: 'vendor' | 'employee' | 'owner' | null = null;
    if (isOwnerLine) {
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
  const m = now.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const firstOfMonth = (yy: number, mm: number) => `${yy}-${pad(mm + 1)}-01`;
  const lastOfMonth = (yy: number, mm: number) => {
    const d = new Date(Date.UTC(yy, mm + 1, 0));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
      d.getUTCDate()
    )}`;
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
