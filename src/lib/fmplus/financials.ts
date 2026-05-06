import { supabaseAdmin } from '../supabase';
import { classifyByPrefix, type AccountType } from './classifier';
import type {
  Period, Scope, PnlReport, PnlSection, PnlSubgroup, PnlServiceLineCost, PnlLeaf,
  ServiceKey, SectionKey, PeriodValues,
} from './types';

const SECTION_LABEL: Record<SectionKey, string> = {
  revenue:           'Revenue',
  cost_of_revenue:   'Cost of Revenue',
  general_expenses:  'General Expenses',
  interest_tax_dep:  'INT - TAXES - DEP',
};

const SUBGROUP_ORDER: Partial<Record<SectionKey, string[]>> = {
  revenue:          ['service_revenue', 'other_revenue'],
  general_expenses: ['back_office', 'office_rent', 'transport_ga', 'marketing', 'legal_financial', 'other_ga'],
  interest_tax_dep: ['interest', 'depreciation'],
};

const SERVICE_ORDER: ServiceKey[] = ['hk', 'mep', 'security', 'landscape', 'pest', 'waste', 'paid', 'vo'];

const COST_CATEGORY_ORDER = [
  'headcount', 'consumables', 'tools', 'ict', 'staff_accom',
  'transport', 'subcontractors', 'insurance', 'penalties', 'indirect',
];

// Account types that BELONG on the P&L. Anything else (asset_*, liability_*,
// equity, equity_unaffected) is balance-sheet-only and must NOT surface in
// the P&L unclassified panel even if the source RPC accidentally returns it.
const PNL_RELEVANT_TYPES = new Set<string>([
  'income', 'income_other', 'expense', 'expense_direct_cost', 'expense_depreciation',
]);

type RpcRow = {
  period_key: string;
  code: string;
  name: string;
  account_type: string;
  sum_balance: number | string;
  line_count: number | string;
};

function emptySection(key: SectionKey, isCogs = false): PnlSection {
  return {
    key,
    label: SECTION_LABEL[key],
    totals: {},
    subgroups: [],
    ...(isCogs ? { serviceLines: [] } : {}),
  };
}

function addToValues(target: PeriodValues, key: string, amount: number): void {
  target[key] = (target[key] || 0) + amount;
}

export async function buildFmplusPnl(args: {
  periods: Period[];
  scope: Scope;
}): Promise<PnlReport> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('pnl_aggregated_multiperiod', {
    p_periods: args.periods.map(p => ({ key: p.key, from: p.fromDate, to: p.toDate })),
    p_company_ids: args.scope.companyIds,
    p_plan_ids: args.scope.planIds && args.scope.planIds.length > 0 ? args.scope.planIds
      : args.scope.planId ? [args.scope.planId]
      : null,
    p_account_ids: args.scope.accountIds && args.scope.accountIds.length > 0 ? args.scope.accountIds : null,
    p_include_drafts: args.scope.includeDrafts,
  });
  if (error) throw new Error(`buildFmplusPnl: ${error.message}`);
  const rows = (data as RpcRow[]) || [];

  const sections: PnlReport['sections'] = {
    revenue:          emptySection('revenue'),
    cost_of_revenue:  emptySection('cost_of_revenue', true),
    general_expenses: emptySection('general_expenses'),
    interest_tax_dep: emptySection('interest_tax_dep'),
  };

  const unclassified: PnlLeaf[] = [];
  // Aggregator: leaves keyed by code+section+subgroupKey so multi-period rows
  // for the same account merge into one leaf with values keyed per period.
  type LeafBucket = { leaf: PnlLeaf; cls: NonNullable<ReturnType<typeof classifyByPrefix>> };
  const leavesByCode = new Map<string, LeafBucket>();

  for (const r of rows) {
    const cls = classifyByPrefix(r.code, r.name, r.account_type as AccountType);
    const balance = Number(r.sum_balance) || 0;

    if (!cls) {
      // Only surface true P&L unclassifieds (P&L account_type with no prefix
      // match). Balance-sheet account types are not P&L data and must not
      // appear in the unclassified panel — they were leaking in because the
      // classifier returns null for them too.
      if (!PNL_RELEVANT_TYPES.has(r.account_type)) continue;
      let leaf = unclassified.find(l => l.code === r.code);
      if (!leaf) {
        leaf = { code: r.code, name: r.name, account_type: r.account_type as AccountType, values: {} };
        unclassified.push(leaf);
      }
      addToValues(leaf.values, r.period_key, balance);
      continue;
    }

    const display = cls.flip ? -balance : balance;
    const key = `${cls.section}|${cls.subgroupKey}|${r.code}`;
    let bucket = leavesByCode.get(key);
    if (!bucket) {
      bucket = {
        leaf: {
          code: r.code,
          name: r.name,
          account_type: r.account_type as AccountType,
          values: {},
          isDepreciation: cls.isDepreciation,
        },
        cls,
      };
      leavesByCode.set(key, bucket);
    }
    addToValues(bucket.leaf.values, r.period_key, display);
  }

  // No-dep toggle: re-route leaves with isDepreciation=true OUT of
  // cost_of_revenue service-line .tools subgroup INTO interest_tax_dep.depreciation.
  const moveDepToBottom = !args.scope.withDep;

  for (const { leaf, cls } of leavesByCode.values()) {
    let targetSection = cls.section;
    let targetSubgroupKey = cls.subgroupKey;
    let targetSubgroupLabel = cls.subgroupLabel;
    let targetService = cls.service;

    if (moveDepToBottom && leaf.isDepreciation && cls.section === 'cost_of_revenue') {
      targetSection = 'interest_tax_dep';
      targetSubgroupKey = 'depreciation';
      targetSubgroupLabel = 'Depreciation';
      targetService = undefined;
    }

    const section = sections[targetSection];

    if (targetSection === 'cost_of_revenue' && targetService) {
      // Route into the service line's subgroups
      let svc = section.serviceLines!.find(s => s.service === targetService);
      if (!svc) {
        svc = {
          service: targetService,
          label: cls.serviceLabel || `Cost of ${targetService}`,
          totals: {},
          subgroups: [],
          grossMarginPct: {},
        };
        section.serviceLines!.push(svc);
      }
      let sg = svc.subgroups.find(g => g.key === targetSubgroupKey);
      if (!sg) {
        sg = { key: targetSubgroupKey, label: targetSubgroupLabel, totals: {}, leaves: [] };
        svc.subgroups.push(sg);
      }
      sg.leaves.push(leaf);
      for (const [pk, v] of Object.entries(leaf.values)) {
        if (typeof v !== 'number') continue;
        addToValues(sg.totals, pk, v);
        addToValues(svc.totals, pk, v);
        addToValues(section.totals, pk, v);
      }
    } else {
      // Plain subgroup
      let sg = section.subgroups.find(g => g.key === targetSubgroupKey);
      if (!sg) {
        sg = { key: targetSubgroupKey, label: targetSubgroupLabel, totals: {}, leaves: [] };
        section.subgroups.push(sg);
      }
      sg.leaves.push(leaf);
      for (const [pk, v] of Object.entries(leaf.values)) {
        if (typeof v !== 'number') continue;
        addToValues(sg.totals, pk, v);
        addToValues(section.totals, pk, v);
      }
    }
  }

  // Sort subgroups in each non-cogs section
  for (const sec of [sections.revenue, sections.general_expenses, sections.interest_tax_dep]) {
    const order = SUBGROUP_ORDER[sec.key];
    if (order) {
      const idx = new Map(order.map((k, i) => [k, i]));
      sec.subgroups.sort((a, b) => (idx.get(a.key) ?? 99) - (idx.get(b.key) ?? 99));
    }
    for (const sg of sec.subgroups) sg.leaves.sort((a, b) => a.code.localeCompare(b.code));
  }
  // Sort cost_of_revenue service lines + their cost-category subgroups
  const svcIdx = new Map(SERVICE_ORDER.map((k, i) => [k, i]));
  sections.cost_of_revenue.serviceLines!.sort(
    (a, b) => (svcIdx.get(a.service) ?? 99) - (svcIdx.get(b.service) ?? 99)
  );
  const catIdx = new Map(COST_CATEGORY_ORDER.map((k, i) => [k, i]));
  for (const svc of sections.cost_of_revenue.serviceLines!) {
    svc.subgroups.sort((a, b) => (catIdx.get(a.key) ?? 99) - (catIdx.get(b.key) ?? 99));
    for (const sg of svc.subgroups) sg.leaves.sort((a, b) => a.code.localeCompare(b.code));
  }

  // Compute per-service gross margin per period.
  // Service-revenue per service is derived from revenue.subgroups[service_revenue]
  // leaves whose name keyword matches the service.
  const revenueByService: Record<string, PeriodValues> = {};
  const svcRevSubgroup = sections.revenue.subgroups.find(g => g.key === 'service_revenue');
  if (svcRevSubgroup) {
    for (const leaf of svcRevSubgroup.leaves) {
      const cls = classifyByPrefix(leaf.code, leaf.name, leaf.account_type);
      if (!cls?.service) continue;
      revenueByService[cls.service] = revenueByService[cls.service] || {};
      for (const [pk, v] of Object.entries(leaf.values)) {
        if (typeof v !== 'number') continue;
        addToValues(revenueByService[cls.service], pk, v);
      }
    }
  }
  for (const svc of sections.cost_of_revenue.serviceLines!) {
    const rev = revenueByService[svc.service] || {};
    for (const p of args.periods) {
      const r = rev[p.key] || 0;
      const c = svc.totals[p.key] || 0;
      svc.grossMarginPct[p.key] = r > 0 ? ((r - c) / r) * 100 : 0;
    }
  }

  // Subtotals per period
  const subtotals: PnlReport['subtotals'] = { gross_profit: {}, ebitda: {}, net_profit: {} };
  for (const p of args.periods) {
    const rev = sections.revenue.totals[p.key]          || 0;
    const cor = sections.cost_of_revenue.totals[p.key]  || 0;
    const ge  = sections.general_expenses.totals[p.key] || 0;
    const itd = sections.interest_tax_dep.totals[p.key] || 0;
    subtotals.gross_profit[p.key] = rev - cor;
    subtotals.ebitda[p.key]       = rev - cor - ge;
    subtotals.net_profit[p.key]   = rev - cor - ge - itd;
  }

  return {
    periods: args.periods,
    scope: args.scope,
    sections,
    subtotals,
    unclassified: unclassified.sort((a, b) => a.code.localeCompare(b.code)),
  };
}

// ---------------------------------------------------------------------------
// Balance Sheet
// ---------------------------------------------------------------------------

import {
  FMPLUS_OPENING_BALANCES_2026_02,
  OPENING_BALANCE_DATE,
} from './opening-balance';
import type {
  BalanceSheetReport, BalanceSheetSection, BalanceSheetGroup, BalanceSheetLeaf,
} from './types';

const BS_GROUP_BY_TYPE: Record<string, { section: 'assets' | 'liabilities' | 'equity'; group: string; label: string }> = {
  asset_cash:            { section: 'assets',      group: 'bank_cash',             label: 'Bank and Cash Accounts' },
  asset_receivable:      { section: 'assets',      group: 'receivables',           label: 'Receivables' },
  asset_current:         { section: 'assets',      group: 'current_assets',        label: 'Current Assets' },
  asset_prepayments:     { section: 'assets',      group: 'prepayments',           label: 'Prepayments' },
  asset_fixed:           { section: 'assets',      group: 'fixed_assets',          label: 'Plus Fixed Assets' },
  asset_non_current:     { section: 'assets',      group: 'non_current_assets',    label: 'Plus Non-current Assets' },
  liability_payable:     { section: 'liabilities', group: 'payables',              label: 'Payables' },
  liability_current:     { section: 'liabilities', group: 'current_liabilities',   label: 'Current Liabilities' },
  liability_non_current: { section: 'liabilities', group: 'non_current_liab',      label: 'Plus Non-current Liabilities' },
  equity:                { section: 'equity',      group: 'capital_other',         label: 'Equity' },
  equity_unaffected:     { section: 'equity',      group: 'retained_prev',         label: 'Previous Years Retained Earnings' },
};

const PNL_ACCOUNT_TYPES = new Set([
  'income', 'income_other', 'expense', 'expense_direct_cost', 'expense_depreciation',
]);

export async function buildFmplusBalanceSheet(args: {
  periods: Period[];
  scope: Scope;
}): Promise<BalanceSheetReport> {
  const sb = supabaseAdmin();

  const result: BalanceSheetReport = {
    periods: args.periods,
    scope: args.scope,
    assets:      { key: 'assets',      label: 'ASSETS',      totals: {}, groups: [] },
    liabilities: { key: 'liabilities', label: 'LIABILITIES', totals: {}, groups: [] },
    equity:      { key: 'equity',      label: 'EQUITY',      totals: {}, groups: [] },
    liabPlusEquity: {},
    balanced: {},
    delta: {},
  };

  // Accumulator: byKey[`code||name||account_type`] = { ...meta, values: PeriodValues }
  type AccRow = { code: string; name: string; account_type: string; values: PeriodValues };
  const acc = new Map<string, AccRow>();

  // Seed snapshot: when asof >= OPENING_BALANCE_DATE AND the seed has actual
  // entries, prime the acc with the static opening balances. If the seed is
  // empty (the current state per opening-balance.ts header), there's nothing
  // to seed and we must fall back to summing the full sync window — otherwise
  // BS for asof >= seed-date renders as all zeros (no opening + filtered-out
  // pre-seed-date deltas).
  const seedActive = FMPLUS_OPENING_BALANCES_2026_02.length > 0;
  for (const p of args.periods) {
    if (seedActive && p.toDate >= OPENING_BALANCE_DATE) {
      for (const op of FMPLUS_OPENING_BALANCES_2026_02) {
        const k = `${op.code}||${op.name}||${op.account_type}`;
        let row = acc.get(k);
        if (!row) {
          row = { code: op.code, name: op.name, account_type: op.account_type, values: {} };
          acc.set(k, row);
        }
        addToValues(row.values, p.key, op.opening_raw);
      }
    }
  }

  // Fetch move-line balance deltas per period.
  // When using the seed, only pull lines AFTER the seed date (incremental).
  // Otherwise pull all lines up to asof (full historical; may be incomplete
  // pre-sync-window — flagged via report.opening_seed=false in the response).
  for (const p of args.periods) {
    const useSeed = seedActive && p.toDate >= OPENING_BALANCE_DATE;
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      // Build base query up to (but not including) .range()
      // so we can conditionally insert .gt() before the final paginate call.
      let q = sb
        .from('odoo_move_lines')
        .select('id, balance, odoo_accounts!inner(code, name, account_type)')
        .lte('date', p.toDate)
        .in('company_id', args.scope.companyIds)
        .eq('parent_state', 'posted')
        .order('id', { ascending: true });
      if (useSeed) {
        q = (q as any).gt('date', OPENING_BALANCE_DATE);
      }
      const { data, error } = await (q as any).range(offset, offset + PAGE - 1);
      if (error) throw new Error(`buildFmplusBalanceSheet: ${(error as { message: string }).message}`);
      const rows = (data as Array<{
        balance: number;
        odoo_accounts: { code: string | null; name: string; account_type: string | null } | null;
      }>) || [];
      if (rows.length === 0) break;
      for (const row of rows) {
        if (!row.odoo_accounts) continue;
        const code = row.odoo_accounts.code || '';
        const name = row.odoo_accounts.name || '';
        const at   = row.odoo_accounts.account_type || '';
        const k = `${code}||${name}||${at}`;
        let r = acc.get(k);
        if (!r) {
          r = { code, name, account_type: at, values: {} };
          acc.set(k, r);
        }
        addToValues(r.values, p.key, Number(row.balance) || 0);
      }
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
  }

  // Compute current-FY P&L net per period (Jan 1 of asof year → asof).
  // Used to derive Current Year Unallocated Earnings in the equity section.
  const currentYearNet: PeriodValues = {};
  for (const p of args.periods) {
    const fyStart = `${p.toDate.slice(0, 4)}-01-01`;
    const PAGE2 = 1000;
    let offset2 = 0;
    let net = 0;
    while (true) {
      const { data, error } = await (sb
        .from('odoo_move_lines')
        .select('id, balance, odoo_accounts!inner(account_type)')
        .gte('date', fyStart)
        .lte('date', p.toDate)
        .in('company_id', args.scope.companyIds)
        .eq('parent_state', 'posted')
        .order('id', { ascending: true }) as any).range(offset2, offset2 + PAGE2 - 1);
      if (error) throw new Error(`buildFmplusBalanceSheet (FY P&L): ${(error as { message: string }).message}`);
      const rows = (data as Array<{ balance: number; odoo_accounts: { account_type: string | null } | null }>) || [];
      if (rows.length === 0) break;
      for (const row of rows) {
        const at = row.odoo_accounts?.account_type || '';
        if (PNL_ACCOUNT_TYPES.has(at)) net += Number(row.balance) || 0;
      }
      if (rows.length < PAGE2) break;
      offset2 += PAGE2;
    }
    currentYearNet[p.key] = net;
  }

  // Group acc leaves into BS sections/groups.
  const groupsBySection: Record<'assets' | 'liabilities' | 'equity', Map<string, BalanceSheetGroup>> = {
    assets: new Map(), liabilities: new Map(), equity: new Map(),
  };
  const prevYearsRaw: PeriodValues = {};

  for (const r of acc.values()) {
    const cls = BS_GROUP_BY_TYPE[r.account_type];
    if (!cls) continue;

    if (cls.group === 'retained_prev') {
      // Accumulate equity_unaffected balances into the synthetic prev-years row.
      for (const [pk, v] of Object.entries(r.values)) {
        if (typeof v !== 'number') continue;
        addToValues(prevYearsRaw, pk, v);
      }
      continue;
    }

    const map = groupsBySection[cls.section];
    let g = map.get(cls.group);
    if (!g) {
      g = { key: cls.group, label: cls.label, totals: {}, accounts: [] };
      map.set(cls.group, g);
    }
    const leaf: BalanceSheetLeaf = {
      code: r.code, name: r.name,
      account_type: r.account_type as AccountType,
      values: r.values,
    };
    g.accounts.push(leaf);
    for (const [pk, v] of Object.entries(r.values)) {
      if (typeof v !== 'number') continue;
      addToValues(g.totals, pk, v);
    }
  }

  // Build synthetic Retained Earnings group (Current Year + Previous Years).
  const retainedGroup: BalanceSheetGroup = {
    key: 'retained_earnings',
    label: 'Retained Earnings',
    totals: {},
    synthetic: true,
    accounts: [
      { code: '', name: 'Current Year Unallocated Earnings',   account_type: 'derived', values: {} },
      { code: '', name: 'Previous Years Unallocated Earnings', account_type: 'derived', values: {} },
    ],
  };
  for (const p of args.periods) {
    // Display convention: equity is credit-normal (raw negative = display positive).
    const cy = -(currentYearNet[p.key] || 0);
    const py = -(prevYearsRaw[p.key]   || 0);
    retainedGroup.accounts[0].values[p.key] = cy;
    retainedGroup.accounts[1].values[p.key] = py;
    retainedGroup.totals[p.key] = cy + py;
  }
  if (Object.values(retainedGroup.totals).some(v => typeof v === 'number' && Math.abs(v) > 0.005)) {
    groupsBySection.equity.set('retained_earnings', retainedGroup);
  }

  // Flip liabilities and non-synthetic equity groups:
  // raw storage is credit-normal (negative), display is positive.
  const flipGroup = (g: BalanceSheetGroup) => {
    g.totals = Object.fromEntries(
      Object.entries(g.totals).map(([k, v]) => [k, typeof v === 'number' ? -v : v])
    );
    g.accounts = g.accounts.map(a => ({
      ...a,
      values: Object.fromEntries(
        Object.entries(a.values).map(([k, v]) => [k, typeof v === 'number' ? -v : v])
      ),
    }));
  };
  for (const g of groupsBySection.liabilities.values()) flipGroup(g);
  for (const g of groupsBySection.equity.values()) {
    if (!g.synthetic) flipGroup(g);
  }

  // Assemble section: filter out zero groups, total up.
  const stuffSection = (sec: BalanceSheetSection, groups: BalanceSheetGroup[]) => {
    sec.groups = groups.filter(g =>
      Object.values(g.totals).some(v => typeof v === 'number' && Math.abs(v) > 0.005)
    );
    for (const g of sec.groups) {
      for (const [pk, v] of Object.entries(g.totals)) {
        if (typeof v !== 'number') continue;
        addToValues(sec.totals, pk, v);
      }
    }
  };
  stuffSection(result.assets,      Array.from(groupsBySection.assets.values()));
  stuffSection(result.liabilities, Array.from(groupsBySection.liabilities.values()));
  stuffSection(result.equity,      Array.from(groupsBySection.equity.values()));

  // Compute per-period balance check.
  for (const p of args.periods) {
    const totalAssets = result.assets.totals[p.key] || 0;
    const totalLiab   = result.liabilities.totals[p.key] || 0;
    const totalEquity = result.equity.totals[p.key] || 0;
    result.liabPlusEquity[p.key] = totalLiab + totalEquity;
    result.delta[p.key]    = totalAssets - (totalLiab + totalEquity);
    result.balanced[p.key] = Math.abs(result.delta[p.key] || 0) < 1;
  }

  return result;
}
