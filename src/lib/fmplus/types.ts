// src/lib/fmplus/types.ts
//
// Central data shapes for the FMPLUS Financials sub-module. Imported by
// financials.ts (Task 9), dashboard.ts (Task 11), the page server
// components (Tasks 13-14), and the renderer components (Tasks 17-20).
//
// Period.key encodes granularity + period: 'm:2026-02', 'q:2026-1', 'y:2026'.
// PeriodValues = Record<period.key, number> so multi-period trends pivot
// naturally from one row per leaf account.

import type { SectionKey, ServiceKey, Classification, AccountType } from './classifier';

export type Granularity = 'monthly' | 'quarterly' | 'yearly';

export type Period = {
  key: string;        // 'm:2026-02' | 'q:2026-1' | 'y:2026'
  label: string;      // 'Feb 2026' | 'Q1 2026' | '2026'
  fromDate: string;   // 'YYYY-MM-DD' (inclusive)
  toDate: string;     // 'YYYY-MM-DD' (inclusive)
};

export type ScopeMode = 'trend' | 'plans' | 'accounts';

export type Scope = {
  mode: ScopeMode;
  companyIds: number[];          // single-element [FMPLUS_COMPANY_ID] for v1
  planIds?: number[];            // when mode = 'plans'
  planId?: number;               // when mode = 'accounts' (single)
  accountIds?: number[];         // when mode = 'accounts' (multi)
  includeDrafts: boolean;
  withDep: boolean;
};

// Per-period balances keyed by Period.key.
export type PeriodValues = Record<string, number>;

export type PnlLeaf = {
  code: string;
  name: string;
  account_type: AccountType;
  values: PeriodValues;
  isDepreciation?: boolean;
};

export type PnlSubgroup = {
  key: string;
  label: string;
  totals: PeriodValues;
  leaves: PnlLeaf[];
};

export type PnlServiceLineCost = {
  service: ServiceKey;
  label: string;
  totals: PeriodValues;
  subgroups: PnlSubgroup[];
  grossMarginPct: PeriodValues;   // computed at render time from service revenue
};

export type PnlSection = {
  key: SectionKey;
  label: string;
  totals: PeriodValues;
  subgroups: PnlSubgroup[];           // for revenue / general_expenses / interest_tax_dep
  serviceLines?: PnlServiceLineCost[]; // only populated for cost_of_revenue
};

export type PnlReport = {
  periods: Period[];
  scope: Scope;
  sections: {
    revenue: PnlSection;
    cost_of_revenue: PnlSection;
    general_expenses: PnlSection;
    interest_tax_dep: PnlSection;
  };
  subtotals: {
    gross_profit: PeriodValues;
    ebitda: PeriodValues;
    net_profit: PeriodValues;
  };
  unclassified: PnlLeaf[];
};

export type BalanceSheetLeaf = {
  code: string;
  name: string;
  account_type: AccountType | 'derived'; // 'derived' for synthetic Retained Earnings rows
  values: PeriodValues;
};

export type BalanceSheetGroup = {
  key: string;
  label: string;
  totals: PeriodValues;
  accounts: BalanceSheetLeaf[];
  synthetic?: boolean;
};

export type BalanceSheetSection = {
  key: 'assets' | 'liabilities' | 'equity';
  label: string;
  totals: PeriodValues;
  groups: BalanceSheetGroup[];
};

export type BalanceSheetReport = {
  periods: Period[];               // each represents an as-of snapshot
  scope: Scope;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
  liabPlusEquity: PeriodValues;
  balanced: Record<string, boolean>;  // per-period balanced flag
  delta: PeriodValues;                // assets - (liab + equity), per period
};

export type DashboardKpi = {
  current: number;
  prior: number;
  deltaPct: number;
  sparkline: number[];           // last 6 periods of same granularity, oldest -> newest
};

export type DashboardReport = {
  periods: Period[];             // current + 11 historical for trend chart
  scope: Scope;
  kpis: {
    revenue: DashboardKpi;
    grossProfit: DashboardKpi;
    ebitda: DashboardKpi;
    netProfit: DashboardKpi;
  };
  revenueMix: Array<{ service: ServiceKey | 'other'; label: string; value: number; pct: number }>;
  costMix:    Array<{ service: ServiceKey;          label: string; value: number; pct: number }>;
  marginByService: Array<{ service: ServiceKey; label: string; pct: number; revenue: number; cost: number }>;
  trend: Array<{ period: Period; revenue: number; grossProfit: number; ebitda: number; netProfit: number }>;
  topProjects: Array<{ accountId: number; name: string; planName: string; absBalance: number }>;
};

// Re-export classifier types for downstream callers (so they don't need to
// import from both files).
export type { SectionKey, ServiceKey, Classification, AccountType };
