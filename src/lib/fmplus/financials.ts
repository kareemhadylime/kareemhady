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
      // Unclassified — surface in UI panel
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
