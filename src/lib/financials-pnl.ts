import { supabaseAdmin } from './supabase';
import {
  BEITHADY_OPENING_BALANCES_2026,
  OPENING_BALANCE_DATE,
  ACCOUNT_TYPE_OVERRIDES,
} from './beithady-opening-balance-2026';

// Default scope = Consolidated Beithady (Egypt 5 + Dubai 10).
// Callers can override via opts.companyIds for per-company views:
//   [4]        → A1HOSPITALITY standalone
//   [5]        → Beithady Egypt standalone
//   [10]       → Beithady FZCO Dubai standalone
//   [5, 10]    → Consolidated Beithady (xlsx default, intercompany eliminated)
//   [4, 5, 10] → Full portfolio (rarely useful — A1 is owner-side, different LOB)
export const PNL_COMPANY_IDS = [5, 10];
export const ALL_FINANCIALS_COMPANY_IDS = [4, 5, 10];

export const COMPANY_LABELS: Record<number, string> = {
  4: 'A1HOSPITALITY',
  5: 'Beithady Hospitality - (EGYPT)',
  10: 'Beithady Hospitality FZCO - (Dubai)',
};

export type CompanyScope = 'consolidated' | 'egypt' | 'dubai' | 'a1' | 'custom';

export function scopeCompanyIds(scope: CompanyScope, custom?: number[]): number[] {
  switch (scope) {
    case 'consolidated':
      return [5, 10];
    case 'egypt':
      return [5];
    case 'dubai':
      return [10];
    case 'a1':
      return [4];
    case 'custom':
      return custom && custom.length > 0 ? custom : [5, 10];
  }
}

export function scopeLabel(scope: CompanyScope): string {
  switch (scope) {
    case 'consolidated':
      return 'Beithady Consolidated (Egypt + Dubai)';
    case 'egypt':
      return 'Beithady Hospitality Egypt';
    case 'dubai':
      return 'Beithady Hospitality FZCO (Dubai)';
    case 'a1':
      return 'A1HOSPITALITY';
    case 'custom':
      return 'Custom scope';
  }
}

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
//
// Scope-aware: "Rent Costs" means different things depending on the company.
// For Beithady (arbitrage operator), rent paid to head-lease holders rolls
// up into "Home Owner Cut" (as the xlsx presents it). For A1 (owner), rent
// is its own operational cost — not money-out-to-owner. So when the
// aggregator is scoped to A1 only, we don't route "Rent Costs" into
// home_owner_cut.
function classifyAccount(
  code: string,
  name: string,
  accountType: string,
  isA1OnlyScope: boolean
): { section: SectionKey; subgroupKey: string; subgroupLabel: string; flip: boolean } | null {
  const n = (name || '').toLowerCase();
  const isHomeOwnerName = /home\s*owner/i.test(n);
  const isRentCost = /rent\s*cost/i.test(n);
  const isHomeOwner = isHomeOwnerName || (isRentCost && !isA1OnlyScope);
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

// Intercompany elimination. The tenant books monthly Turnkey Fee invoices
// between Beithady Egypt (5) and FZCO Dubai (10) — see memory
// beithady_intercompany_model.md for the full structure. On the consolidated
// P&L those lines must be eliminated or revenue + cost both inflate by the
// same amount. Partners representing the other Beithady entity carry names
// like "Beithady Hospitality - Egypt" / "053. BeitHady Hospitality- UAE";
// we match by that pattern. Customer "Beit Hady Website" partners are NOT
// intercompany (it's the booking-website flow) — the 'hospitality' keyword
// excludes them.
async function getIntercompanyPartnerIds(): Promise<number[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('odoo_partners')
    .select('id, name')
    .or(
      'name.ilike.%beithady hospitality%,name.ilike.%beit hady hospitality%'
    );
  return (data || []).map(r => Number((r as { id: number }).id));
}

async function fetchAccountTotals(params: {
  fromDate: string;
  toDate: string;
  companyIds: number[];
  excludePartnerIds: number[];
  buildingCode?: string;
  lobLabel?: string;
}): Promise<{ rows: RawAggregateRow[]; totalLineCount: number; excluded: number }> {
  const sb = supabaseAdmin();
  // Delegate aggregation to the pnl_aggregated Postgres function so we can
  // efficiently filter by building_code / lob_label via the analytic link
  // table without hauling 60k+ rows through supabase-js.
  const { data, error } = await sb.rpc('pnl_aggregated', {
    p_from: params.fromDate,
    p_to: params.toDate,
    p_company_ids: params.companyIds,
    p_building_code: params.buildingCode || null,
    p_lob_label: params.lobLabel || null,
    p_exclude_partner_ids:
      params.excludePartnerIds.length > 0 ? params.excludePartnerIds : null,
  });
  if (error) throw new Error(`fetchAccountTotals: ${error.message}`);
  const rawRows = (data as Array<{
    code: string;
    name: string;
    account_type: string;
    sum_balance: number | string;
    line_count: number | string;
  }>) || [];

  let totalLineCount = 0;
  const rows: RawAggregateRow[] = rawRows.map(r => {
    const lc = Number(r.line_count) || 0;
    totalLineCount += lc;
    return {
      code: r.code || '',
      name: r.name || '',
      account_type: r.account_type || '',
      sum_balance: Number(r.sum_balance) || 0,
    };
  });
  rows.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  // The RPC handles both exclusion and filtering internally; `excluded` is
  // no longer individually counted — surface whether any filter/exclusion
  // was active so the UI can label the report correctly.
  return { rows, totalLineCount, excluded: 0 };
}

export async function buildPnlReport(params: {
  fromDate: string;
  toDate: string;
  label: string;
  companyIds?: number[];
  buildingCode?: string;
  lobLabel?: string;
}): Promise<PnlReport & { intercompany_excluded_lines: number }> {
  const companyIds = params.companyIds || PNL_COMPANY_IDS;
  const eliminateIntercompany =
    companyIds.includes(5) && companyIds.includes(10);
  const excludePartnerIds = eliminateIntercompany
    ? await getIntercompanyPartnerIds()
    : [];
  const isA1OnlyScope =
    companyIds.length === 1 && companyIds[0] === 4;
  const { rows, totalLineCount, excluded } = await fetchAccountTotals({
    fromDate: params.fromDate,
    toDate: params.toDate,
    companyIds,
    excludePartnerIds,
    buildingCode: params.buildingCode,
    lobLabel: params.lobLabel,
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
    const cls = classifyAccount(r.code, r.name, r.account_type, isA1OnlyScope);
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
    intercompany_excluded_lines: excluded,
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
  const eliminateIntercompany =
    companyIds.includes(5) && companyIds.includes(10);
  const excludeSet = new Set(
    eliminateIntercompany ? await getIntercompanyPartnerIds() : []
  );

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
    if (excludeSet.has(Number(l.partner_id))) continue; // intercompany
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

// -------- Balance Sheet ----------
//
// Structure mirrors the Feb-2026 Beithady xlsx template:
//   ASSETS
//     Bank and Cash Accounts
//     Receivables
//     Current Assets
//     Prepayments
//     Fixed Assets
//   LIABILITIES
//     Current Liabilities
//     Payables
//     Non-current Liabilities
//   EQUITY
//     Capital
//     Retained Earnings
//       Current Year Unallocated Earnings   (derived from current-FY P&L)
//       Previous Years Unallocated Earnings (equity_unaffected balance)
//
// Each group keeps its leaf accounts so the UI can expand/collapse them.

export type BalanceSheetLeaf = {
  code: string;
  name: string;
  account_type: string;
  balance: number;
};

export type BalanceSheetGroup = {
  key: string;
  label: string;
  total: number;
  accounts: BalanceSheetLeaf[];
  synthetic?: boolean;        // true for derived groups (e.g. Retained Earnings rollup)
};

export type BalanceSheetReport = {
  as_of: string;
  company_ids: number[];
  assets: {
    total: number;
    groups: BalanceSheetGroup[];     // in xlsx order
  };
  liabilities: {
    total: number;
    groups: BalanceSheetGroup[];
  };
  equity: {
    total: number;
    groups: BalanceSheetGroup[];
  };
  liabilities_plus_equity: number;
  balanced: boolean;
};

function classifyBalanceSheet(
  accountType: string,
  name: string
): { section: 'assets' | 'liabilities' | 'equity'; group: string; label: string } | null {
  const n = (name || '').toLowerCase();
  switch (accountType) {
    case 'asset_cash':
      return { section: 'assets', group: 'bank_and_cash', label: 'Bank and Cash Accounts' };
    case 'asset_receivable':
      return { section: 'assets', group: 'receivables', label: 'Receivables' };
    case 'asset_prepayments':
      return { section: 'assets', group: 'prepayments', label: 'Prepayments' };
    case 'asset_current':
      return { section: 'assets', group: 'current_assets', label: 'Current Assets' };
    case 'asset_fixed':
      return { section: 'assets', group: 'fixed_assets', label: 'Fixed Assets' };
    case 'asset_non_current':
      return { section: 'assets', group: 'non_current_assets', label: 'Non-current Assets' };
    case 'liability_payable':
      return { section: 'liabilities', group: 'payables', label: 'Payables' };
    case 'liability_current':
      return { section: 'liabilities', group: 'current_liabilities', label: 'Current Liabilities' };
    case 'liability_non_current':
      return {
        section: 'liabilities',
        group: 'non_current_liabilities',
        label: 'Non-current Liabilities',
      };
    case 'equity':
      // Real equity accounts. Anything that looks like capital goes to the
      // Capital group; everything else (owner contributions, drawings, etc.)
      // stacks under a generic "Other Equity" group. Retained-earnings is a
      // separate synthetic group populated from P&L + equity_unaffected.
      if (/capital|share\s*capital/i.test(n)) {
        return { section: 'equity', group: 'capital', label: 'Capital' };
      }
      return { section: 'equity', group: 'other_equity', label: 'Other Equity' };
    case 'equity_unaffected':
      // Prior-year carry-forward. We sweep this into the synthetic
      // "Previous Years Unallocated Earnings" row during build, so here we
      // just mark it for that handling (group='retained_prev').
      return { section: 'equity', group: 'retained_prev', label: 'Previous Years Unallocated Earnings' };
    default:
      return null;
  }
}

export async function buildBalanceSheet(params: {
  asOf: string;
  companyIds?: number[];
}): Promise<BalanceSheetReport> {
  const companyIds = params.companyIds || PNL_COMPANY_IDS;
  const sb = supabaseAdmin();

  // --- Opening-balance mode ---
  // When building a 2026+ consolidated Beithady balance sheet, the raw
  // odoo_move_lines table only has the last ~365 days synced — not the
  // full cumulative history an accurate balance sheet requires. To avoid
  // half-height numbers, we seed from the 31-Dec-2025 consolidated xlsx
  // (with 2025 year-end close applied) and sum ONLY the 2026+ movements
  // on top. For per-company scopes (Egypt / Dubai / A1 alone) or older
  // asOf dates we fall back to the raw-sum approach.
  const useOpeningBalance =
    params.asOf > OPENING_BALANCE_DATE &&
    companyIds.length === 2 &&
    companyIds.includes(5) &&
    companyIds.includes(10);
  // Move-line query window. With the seed in place we only need deltas
  // after 2025-12-31; otherwise cumulative from the earliest synced date.
  const movesFromDate = useOpeningBalance ? OPENING_BALANCE_DATE : null;

  const PAGE = 1000;
  let offset = 0;
  type Row = {
    balance: number;
    odoo_accounts: {
      code: string | null;
      name: string;
      account_type: string | null;
    } | null;
  };

  const byAccount = new Map<
    string,
    { code: string; name: string; account_type: string; sum: number }
  >();

  // Seed opening balances first so later Odoo deltas stack on top of them.
  if (useOpeningBalance) {
    for (const op of BEITHADY_OPENING_BALANCES_2026) {
      const key = `${op.code}||${op.name}||${op.account_type}`;
      byAccount.set(key, {
        code: op.code,
        name: op.name,
        account_type: op.account_type,
        sum: op.opening_raw,
      });
    }
  }

  while (true) {
    const q = sb
      .from('odoo_move_lines')
      .select('balance, odoo_accounts!inner(code, name, account_type)')
      .lte('date', params.asOf)
      .in('company_id', companyIds)
      .eq('parent_state', 'posted')
      .range(offset, offset + PAGE - 1);
    if (movesFromDate) q.gt('date', movesFromDate);
    const { data, error } = await q;
    if (error) throw new Error(`buildBalanceSheet: ${error.message}`);
    const rows = (data as unknown as Row[]) || [];
    if (rows.length === 0) break;

    for (const r of rows) {
      if (!r.odoo_accounts) continue;
      const code = r.odoo_accounts.code || '';
      const name = r.odoo_accounts.name || '';
      const rawAccountType = r.odoo_accounts.account_type || '';
      // Apply consolidated-view overrides (e.g. 222008 Total Lime Loan is
      // tagged `liability_current` in Odoo but the xlsx classifies it as
      // Non-current). Only overrides when we're in opening-balance mode so
      // per-company views keep the raw Odoo classification.
      const accountType =
        useOpeningBalance && ACCOUNT_TYPE_OVERRIDES[code]
          ? ACCOUNT_TYPE_OVERRIDES[code]
          : rawAccountType;
      const key = `${code}||${name}||${accountType}`;
      const existing = byAccount.get(key);
      const bal = Number(r.balance) || 0;
      if (existing) existing.sum += bal;
      else byAccount.set(key, { code, name, account_type: accountType, sum: bal });
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  // Also pull current-fiscal-year P&L activity so we can populate the
  // synthetic "Current Year Unallocated Earnings" row. Fiscal year runs
  // from Jan 1 of the asOf year through asOf.
  const fyStart = `${params.asOf.slice(0, 4)}-01-01`;
  let currentYearNet = 0; // debit - credit of all P&L accounts this FY
  {
    const PAGE2 = 1000;
    let offset2 = 0;
    type RowFy = {
      balance: number;
      odoo_accounts: { account_type: string | null } | null;
    };
    const pnlTypes = new Set([
      'income',
      'income_other',
      'expense',
      'expense_direct_cost',
      'expense_depreciation',
    ]);
    while (true) {
      const { data, error } = await sb
        .from('odoo_move_lines')
        .select('balance, odoo_accounts!inner(account_type)')
        .gte('date', fyStart)
        .lte('date', params.asOf)
        .in('company_id', companyIds)
        .eq('parent_state', 'posted')
        .range(offset2, offset2 + PAGE2 - 1);
      if (error) throw new Error(`buildBalanceSheet fy: ${error.message}`);
      const rows = (data as unknown as RowFy[]) || [];
      if (rows.length === 0) break;
      for (const r of rows) {
        const at = r.odoo_accounts?.account_type || '';
        if (!pnlTypes.has(at)) continue;
        currentYearNet += Number(r.balance) || 0;
      }
      if (rows.length < PAGE2) break;
      offset2 += PAGE2;
    }
  }

  // Seed empty groups in xlsx display order.
  const mkGroup = (
    key: string,
    label: string,
    synthetic = false
  ): BalanceSheetGroup => ({ key, label, total: 0, accounts: [], synthetic });

  const assetGroups: Record<string, BalanceSheetGroup> = {
    bank_and_cash: mkGroup('bank_and_cash', 'Bank and Cash Accounts'),
    receivables: mkGroup('receivables', 'Receivables'),
    current_assets: mkGroup('current_assets', 'Current Assets'),
    prepayments: mkGroup('prepayments', 'Prepayments'),
    fixed_assets: mkGroup('fixed_assets', 'Fixed Assets'),
    non_current_assets: mkGroup('non_current_assets', 'Non-current Assets'),
  };
  const liabilityGroups: Record<string, BalanceSheetGroup> = {
    current_liabilities: mkGroup('current_liabilities', 'Current Liabilities'),
    payables: mkGroup('payables', 'Payables'),
    non_current_liabilities: mkGroup(
      'non_current_liabilities',
      'Non-current Liabilities'
    ),
  };
  const capitalGroup = mkGroup('capital', 'Capital');
  const otherEquityGroup = mkGroup('other_equity', 'Other Equity');
  // Collect equity_unaffected balance for the Previous-Years synthetic row.
  let previousYearsRaw = 0;

  for (const acc of byAccount.values()) {
    if (Math.abs(acc.sum) < 0.005) continue;
    const cls = classifyBalanceSheet(acc.account_type, acc.name);
    if (!cls) continue;
    const leaf: BalanceSheetLeaf = {
      code: acc.code,
      name: acc.name,
      account_type: acc.account_type,
      balance: acc.sum,
    };
    if (cls.section === 'assets') {
      const g = assetGroups[cls.group];
      if (g) {
        g.accounts.push(leaf);
        g.total += leaf.balance;
      }
    } else if (cls.section === 'liabilities') {
      const g = liabilityGroups[cls.group];
      if (g) {
        g.accounts.push(leaf);
        g.total += leaf.balance;
      }
    } else if (cls.section === 'equity') {
      if (cls.group === 'capital') {
        capitalGroup.accounts.push(leaf);
        capitalGroup.total += leaf.balance;
      } else if (cls.group === 'retained_prev') {
        previousYearsRaw += leaf.balance;
      } else {
        otherEquityGroup.accounts.push(leaf);
        otherEquityGroup.total += leaf.balance;
      }
    }
  }

  // Build synthetic Retained Earnings group.
  // Sign convention: assets are debit-normal (positive), liabilities + equity
  // are credit-normal so raw balance is negative. The xlsx surfaces L+E as
  // negative totals when they net against positive assets — we FLIP equity
  // (and liabilities below) so the displayed totals read positive.
  //   current_year display  = -currentYearNet  (debit_sum - credit_sum flipped)
  //   previous_years display = -previousYearsRaw
  const currentYearDisplay = -currentYearNet;
  const previousYearsDisplay = -previousYearsRaw;
  const retainedEarningsGroup = mkGroup(
    'retained_earnings',
    'Retained Earnings',
    true
  );
  retainedEarningsGroup.accounts = [
    {
      code: '',
      name: 'Current Year Unallocated Earnings',
      account_type: 'derived',
      balance: currentYearDisplay,
    },
    {
      code: '',
      name: 'Previous Years Unallocated Earnings',
      account_type: 'derived',
      balance: previousYearsDisplay,
    },
  ];
  retainedEarningsGroup.total = currentYearDisplay + previousYearsDisplay;

  // Flip liabilities so group totals read positive.
  for (const g of Object.values(liabilityGroups)) {
    g.total = -g.total;
    g.accounts = g.accounts.map(a => ({ ...a, balance: -a.balance }));
  }
  // Flip real-equity groups too (retained earnings already built in display space).
  capitalGroup.total = -capitalGroup.total;
  capitalGroup.accounts = capitalGroup.accounts.map(a => ({
    ...a,
    balance: -a.balance,
  }));
  otherEquityGroup.total = -otherEquityGroup.total;
  otherEquityGroup.accounts = otherEquityGroup.accounts.map(a => ({
    ...a,
    balance: -a.balance,
  }));

  // Sort leaf rows inside each group by magnitude desc (the xlsx is by code,
  // but magnitude-desc reads better in an interactive UI — still matches the
  // xlsx top-to-bottom feel because top-magnitude accounts dominate).
  const sortGroup = (g: BalanceSheetGroup) => {
    g.accounts.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  };
  Object.values(assetGroups).forEach(sortGroup);
  Object.values(liabilityGroups).forEach(sortGroup);
  sortGroup(capitalGroup);
  sortGroup(otherEquityGroup);
  // Don't sort retainedEarningsGroup — fixed order: Current Year then Previous.

  // Assemble in xlsx display order. Empty groups are kept so the header
  // remains but collapses naturally (0 total, no leaves).
  const assetsOrdered = [
    assetGroups.bank_and_cash,
    assetGroups.receivables,
    assetGroups.current_assets,
    assetGroups.prepayments,
    assetGroups.fixed_assets,
    assetGroups.non_current_assets,
  ].filter(g => g.accounts.length > 0 || Math.abs(g.total) > 0.005);
  const liabilitiesOrdered = [
    liabilityGroups.current_liabilities,
    liabilityGroups.payables,
    liabilityGroups.non_current_liabilities,
  ].filter(g => g.accounts.length > 0 || Math.abs(g.total) > 0.005);
  const equityOrdered = [
    capitalGroup,
    retainedEarningsGroup,
    otherEquityGroup,
  ].filter(g => g.accounts.length > 0 || Math.abs(g.total) > 0.005);

  const assetsTotal = assetsOrdered.reduce((s, g) => s + g.total, 0);
  const liabilitiesTotal = liabilitiesOrdered.reduce((s, g) => s + g.total, 0);
  const equityTotal = equityOrdered.reduce((s, g) => s + g.total, 0);

  const report: BalanceSheetReport = {
    as_of: params.asOf,
    company_ids: companyIds,
    assets: { total: assetsTotal, groups: assetsOrdered },
    liabilities: { total: liabilitiesTotal, groups: liabilitiesOrdered },
    equity: { total: equityTotal, groups: equityOrdered },
    liabilities_plus_equity: liabilitiesTotal + equityTotal,
    balanced:
      Math.abs(assetsTotal - (liabilitiesTotal + equityTotal)) < 1,
  };

  return report;
}

// -------- Analytic filter options ----------

export async function listAvailableBuildings(): Promise<
  Array<{ code: string; sample_name: string; account_count: number }>
> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('odoo_analytic_accounts')
    .select('building_code, name')
    .not('building_code', 'is', null);
  const groups = new Map<string, { sample_name: string; account_count: number }>();
  for (const r of (data || []) as Array<{
    building_code: string | null;
    name: string;
  }>) {
    if (!r.building_code) continue;
    const g = groups.get(r.building_code);
    if (g) g.account_count += 1;
    else groups.set(r.building_code, { sample_name: r.name, account_count: 1 });
  }
  return Array.from(groups.entries())
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export async function listAvailableLobs(): Promise<
  Array<{ label: string; account_count: number }>
> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('odoo_analytic_accounts')
    .select('lob_label')
    .not('lob_label', 'is', null);
  const counts = new Map<string, number>();
  for (const r of (data || []) as Array<{ lob_label: string | null }>) {
    if (!r.lob_label) continue;
    counts.set(r.lob_label, (counts.get(r.lob_label) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, account_count]) => ({ label, account_count }))
    .sort((a, b) => a.label.localeCompare(b.label));
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
