# FMPLUS Financials Sub-Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new `/fmplus/financials` sub-module with Dashboard / P&L / Balance Sheet tabs, replicating the Feb-2026 Excel exports row-for-row, with multi-period trend columns (Monthly/Quarterly/Yearly × 1/3/6/12) and plan/account multi-select.

**Architecture:** Server-rendered Next.js 16 (App Router) pages, Supabase Postgres for aggregation (one new SQL function does multi-period rollup in one round-trip), pure code-prefix classifier for FMPLUS's CoA, opening-balance seed for accurate balance sheets pre-2026-02-28, recharts for dashboard graphs. No new tables — extends the existing `odoo_*` Beithady infra.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase Postgres, Tailwind v4, recharts (already in deps), exceljs, @react-pdf/renderer, vitest.

**Spec:** [docs/superpowers/specs/2026-05-03-fmplus-financials-design.md](../specs/2026-05-03-fmplus-financials-design.md)

**Branch:** `claude/nifty-dubinsky-1633d8` (this worktree). Final merge → `main` → auto-deploys via GitHub→Vercel integration to `limeinc.vercel.app`.

---

## File map

### New files

**Library (pure logic, vitest-tested):**
- `src/lib/fmplus/classifier.ts` + `classifier.test.ts`
- `src/lib/fmplus/opening-balance.ts` + `opening-balance.test.ts`
- `src/lib/fmplus/discover-company.ts`
- `src/lib/fmplus/period-series.ts` + `period-series.test.ts`
- `src/lib/fmplus/financials.ts` + `financials.test.ts`
- `src/lib/fmplus/dashboard.ts`
- `src/lib/fmplus/types.ts`

**Database:**
- `supabase/migrations/0079_fmplus_financials.sql` — two RPCs: `pnl_aggregated_multiperiod`, `fmplus_active_accounts`

**Routes:**
- `src/app/fmplus/page.tsx` — module landing
- `src/app/fmplus/financials/page.tsx` — financials shell with 3 tabs
- `src/app/fmplus/financials/_components/FilterBar.tsx`
- `src/app/fmplus/financials/_components/PeriodControls.tsx`
- `src/app/fmplus/financials/_components/AccountPicker.tsx`
- `src/app/fmplus/financials/_components/PnlTable.tsx`
- `src/app/fmplus/financials/_components/BalanceSheetTable.tsx`
- `src/app/fmplus/financials/_components/Dashboard.tsx`
- `src/app/fmplus/financials/_components/DashboardCharts.tsx`
- `src/app/fmplus/financials/_components/KpiStrip.tsx`
- `src/app/fmplus/financials/_components/ExportButtons.tsx`
- `src/app/fmplus/financials/actions.ts` — server actions (Excel/PDF export)
- `src/app/api/fmplus/active-accounts/route.ts` — picker prune endpoint

### Modified files

- `src/lib/run-odoo-financial-sync.ts` — extend `FINANCIALS_COMPANY_IDS` to include FMPLUS (auto-discovered).
- `src/app/page.tsx` (or whatever the Lime dashboard landing page is) — add FMPLUS card linking to `/fmplus` if not already routable from there.

---

## Conventions

- **Commit message style:** `<type>(<scope>): <description>` matching repo history (`feat(fmplus): …`, `fix(fmplus): …`, `docs(fmplus): …`, `test(fmplus): …`).
- **Co-author footer on every commit:** `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- **No deploys from worktree.** Final deploy = merge to main → GitHub→Vercel auto-deploys. The `vercel --prod` from a worktree only hits the sandbox project (per CLAUDE.md).
- **Migrations:** apply via Supabase MCP `apply_migration` tool (pre-approved in settings.local.json) — do NOT rely on the `supabase` CLI on Windows.
- **Frequent commits:** every task ends with a commit. If a task takes longer than 30 minutes, mid-task safety commits are fine.
- **TDD:** every pure function gets a failing test first, then minimal impl, then commit.

---

## Task overview

| # | Task | Files | TDD? |
|---|------|-------|------|
| 1 | Prefix classifier | `src/lib/fmplus/classifier.ts` | ✅ |
| 2 | Types module | `src/lib/fmplus/types.ts` | n/a |
| 3 | Opening-balance constants | `src/lib/fmplus/opening-balance.ts` | ✅ (sanity) |
| 4 | FMPLUS company discovery | `src/lib/fmplus/discover-company.ts` | n/a (live Odoo) |
| 5 | Migration 0079 — RPCs | `supabase/migrations/0079_fmplus_financials.sql` | manual verify |
| 6 | Apply migration to Supabase | (via MCP) | n/a |
| 7 | Sync extension | `src/lib/run-odoo-financial-sync.ts` | manual sync run |
| 8 | Period-series resolver | `src/lib/fmplus/period-series.ts` | ✅ |
| 9 | Build P&L (lib) | `src/lib/fmplus/financials.ts` | ✅ golden-against-Excel |
| 10 | Build Balance Sheet (lib) | `src/lib/fmplus/financials.ts` | ✅ golden-against-Excel |
| 11 | Build Dashboard (lib) | `src/lib/fmplus/dashboard.ts` | ✅ |
| 12 | Active-accounts API route | `src/app/api/fmplus/active-accounts/route.ts` | manual smoke |
| 13 | FMPLUS module landing | `src/app/fmplus/page.tsx` | manual smoke |
| 14 | Financials shell + URL state | `src/app/fmplus/financials/page.tsx` | manual smoke |
| 15 | Filter bar + period controls + mode toggle | `_components/FilterBar.tsx`, `_components/PeriodControls.tsx` | manual smoke |
| 16 | Account picker (with auto-prune) | `_components/AccountPicker.tsx` | manual smoke |
| 17 | P&L table renderer | `_components/PnlTable.tsx` | visual diff vs Excel |
| 18 | Balance Sheet renderer | `_components/BalanceSheetTable.tsx` | visual diff vs Excel |
| 19 | Dashboard tab + KPI strip | `_components/Dashboard.tsx`, `_components/KpiStrip.tsx` | manual smoke |
| 20 | Dashboard charts | `_components/DashboardCharts.tsx` | manual smoke |
| 21 | Excel + PDF export | `_components/ExportButtons.tsx`, `actions.ts` | manual download check |
| 22 | End-to-end smoke test against live Odoo | (verification) | reconcile to Excel |
| 23 | Final commit + push to main | (deploy) | `limeinc.vercel.app` smoke |

---

## Task 1: Prefix classifier

The FMPLUS chart-of-accounts is deterministic by code prefix. Build a pure function that maps `(code, name, account_type)` → `{ section, subgroup, label, flip }`. No Odoo I/O, no DB, no async. Pure logic. TDD.

**Files:**
- Create: `src/lib/fmplus/classifier.ts`
- Test: `src/lib/fmplus/classifier.test.ts`

- [ ] **Step 1.1: Write the failing test file**

```typescript
// src/lib/fmplus/classifier.test.ts
import { describe, it, expect } from 'vitest';
import { classifyByPrefix } from './classifier';

describe('classifyByPrefix', () => {
  describe('service-line costs (5xxxxx)', () => {
    it('classifies HK Headcount (500001) into hk/headcount', () => {
      const r = classifyByPrefix('500001', 'Basic Salary Hk', 'expense_direct_cost');
      expect(r).toEqual({
        section: 'cost_of_revenue',
        service: 'hk',
        serviceLabel: 'Cost of Housekeeping',
        subgroupKey: 'headcount',
        subgroupLabel: 'HK - Headcount Cost',
        flip: false,
      });
    });
    it('classifies HK Tools/Equipment Depreciation (500201) into hk/tools', () => {
      const r = classifyByPrefix('500201', 'Depreciation - Equipment Hk', 'expense_direct_cost');
      expect(r?.service).toBe('hk');
      expect(r?.subgroupKey).toBe('tools');
      expect(r?.isDepreciation).toBe(true); // flag for no-dep toggle
    });
    it('classifies MEP Subcontractors (510601) into mep/subcontractors', () => {
      const r = classifyByPrefix('510601', 'Subcontractor MEP', 'expense_direct_cost');
      expect(r?.service).toBe('mep');
      expect(r?.subgroupKey).toBe('subcontractors');
    });
    it('classifies Security Penalties (521001) into security/penalties', () => {
      const r = classifyByPrefix('521001', 'Penalty Security', 'expense_direct_cost');
      expect(r?.service).toBe('security');
      expect(r?.subgroupKey).toBe('penalties');
    });
    it('classifies all 8 service prefixes', () => {
      const services: Array<[string, string]> = [
        ['500101', 'hk'], ['510101', 'mep'], ['520101', 'security'],
        ['530101', 'landscape'], ['540101', 'pest'], ['550101', 'waste'],
        ['560101', 'paid'], ['570101', 'vo'],
      ];
      for (const [code, expected] of services) {
        expect(classifyByPrefix(code, 'x', 'expense_direct_cost')?.service).toBe(expected);
      }
    });
  });

  describe('G&A (600-606)', () => {
    it('classifies 600001 into back_office', () => {
      const r = classifyByPrefix('600001', 'Basic Salary BO', 'expense');
      expect(r?.section).toBe('general_expenses');
      expect(r?.subgroupKey).toBe('back_office');
    });
    it('classifies 601001 into office_rent', () => {
      const r = classifyByPrefix('601001', 'Rent', 'expense');
      expect(r?.subgroupKey).toBe('office_rent');
    });
    it('classifies 602001 into transport_ga', () => {
      expect(classifyByPrefix('602001', 'x', 'expense')?.subgroupKey).toBe('transport_ga');
    });
    it('classifies 603001 into marketing', () => {
      expect(classifyByPrefix('603001', 'x', 'expense')?.subgroupKey).toBe('marketing');
    });
    it('classifies 604001 into legal_financial', () => {
      expect(classifyByPrefix('604001', 'x', 'expense')?.subgroupKey).toBe('legal_financial');
    });
    it('classifies 605001 and 606001 into other_ga', () => {
      expect(classifyByPrefix('605001', 'x', 'expense')?.subgroupKey).toBe('other_ga');
      expect(classifyByPrefix('606001', 'x', 'expense')?.subgroupKey).toBe('other_ga');
    });
  });

  describe('interest / depreciation (607-609)', () => {
    it('classifies 607001 into interest', () => {
      const r = classifyByPrefix('607001', 'Interest', 'expense');
      expect(r?.section).toBe('interest_tax_dep');
      expect(r?.subgroupKey).toBe('interest');
    });
    it('classifies 608001 and 609001 into depreciation', () => {
      expect(classifyByPrefix('608001', 'x', 'expense_depreciation')?.subgroupKey).toBe('depreciation');
      expect(classifyByPrefix('609001', 'x', 'expense_depreciation')?.subgroupKey).toBe('depreciation');
    });
  });

  describe('revenue', () => {
    it('classifies income with HK keyword as hk service revenue', () => {
      const r = classifyByPrefix('400001', 'House Keeping Revenue', 'income');
      expect(r?.section).toBe('revenue');
      expect(r?.service).toBe('hk');
      expect(r?.flip).toBe(true);
    });
    it('classifies income_other as other revenue', () => {
      const r = classifyByPrefix('410001', 'Bank Interest Income', 'income_other');
      expect(r?.section).toBe('revenue');
      expect(r?.subgroupKey).toBe('other_revenue');
      expect(r?.flip).toBe(true);
    });
  });

  describe('balance-sheet types', () => {
    it('returns null for asset_cash (not P&L)', () => {
      expect(classifyByPrefix('123001', 'Cash', 'asset_cash')).toBeNull();
    });
    it('returns null for liability_payable', () => {
      expect(classifyByPrefix('221001', 'Trade Payables', 'liability_payable')).toBeNull();
    });
  });

  describe('unclassified', () => {
    it('returns null for prefix outside the table (e.g. 700xxx)', () => {
      expect(classifyByPrefix('700001', 'mystery', 'expense')).toBeNull();
    });
  });
});
```

- [ ] **Step 1.2: Run the test — confirm it fails**

```bash
npm run test -- src/lib/fmplus/classifier.test.ts
```

Expected: FAIL with `Cannot find module './classifier'` or similar.

- [ ] **Step 1.3: Implement `classifier.ts`**

```typescript
// src/lib/fmplus/classifier.ts
//
// FMPLUS chart-of-accounts is deterministic by code prefix. This is the
// single source of truth for routing every account into a P&L section
// + subgroup. No name regex, no scope-aware branching — just numbers.
//
// Code prefix scheme (extracted from the user's Feb-2026 Excel export):
//   500-501  HK costs           510-511  MEP costs
//   520-521  Security costs     530-531  Landscape costs
//   540-541  Pest Control       550-551  Waste Management
//   560-561  Paid Services      570-571  Variation Order
//   600      Back Office Salaries        601  Office Rent & Utilities
//   602      Transportation              603  Marketing & Tender
//   604      Legal & Financial           605-606  Other G&A
//   607      Interest                    608-609  Depreciation
//
// Within service-line costs, the *third digit* picks the cost category:
//   0  Headcount (xx0001-xx0012)         1  Consumables (xx0101-xx0106)
//   2  Tools/Equipment (xx0201-xx0208) — INCLUDES depreciation rows;
//                                        flagged isDepreciation=true so
//                                        the no-dep toggle can pull them out
//   3  ICT (xx0301-xx0306)               4  Staff Accommodation (xx0401-xx0408)
//   5  Transportation (xx0501-xx0540)    6  Subcontractors (xx0601-xx0608)
//   9  Contracting Insurance (xx0901-xx0902)
//   10 Penalties (xx1001-xx1002)         11 Indirect Costs (xx1101-xx1103)

export type ServiceKey =
  | 'hk' | 'mep' | 'security' | 'landscape'
  | 'pest' | 'waste' | 'paid' | 'vo';

export type SectionKey =
  | 'revenue' | 'cost_of_revenue'
  | 'general_expenses' | 'interest_tax_dep';

export type Classification = {
  section: SectionKey;
  service?: ServiceKey;          // present for cost_of_revenue + service revenue rows
  serviceLabel?: string;
  subgroupKey: string;
  subgroupLabel: string;
  flip: boolean;                 // negate the raw debit-credit balance for display
                                 //   (income has credit-normal balance → display as positive)
  isDepreciation?: boolean;      // true if this is a 5xx02xx tools/equipment depreciation row
                                 //   no-dep toggle pulls these out of COGS into the bottom bucket
};

const SERVICE_PREFIX: Record<string, { key: ServiceKey; costLabel: string; revenueKeyword: RegExp }> = {
  '50': { key: 'hk',        costLabel: 'Cost of Housekeeping',     revenueKeyword: /house\s*keeping|\bhk\b/i },
  '51': { key: 'mep',       costLabel: 'Cost of MEP',              revenueKeyword: /\bmep\b/i },
  '52': { key: 'security',  costLabel: 'Cost of Security',         revenueKeyword: /security/i },
  '53': { key: 'landscape', costLabel: 'Cost of Landscape',        revenueKeyword: /landscape/i },
  '54': { key: 'pest',      costLabel: 'Cost of Pest Control',     revenueKeyword: /pest/i },
  '55': { key: 'waste',     costLabel: 'Cost of Waste Management', revenueKeyword: /waste/i },
  '56': { key: 'paid',      costLabel: 'Cost of PAID Services',    revenueKeyword: /paid\s*service/i },
  '57': { key: 'vo',        costLabel: 'Cost of Variation Order',  revenueKeyword: /variation|var(a|i)ation/i },
};

const COST_CATEGORY: Record<string, { key: string; label: (svc: string) => string }> = {
  '0':  { key: 'headcount',       label: s => `${s} - Headcount Cost` },
  '1':  { key: 'consumables',     label: s => `${s} - Consumables` },
  '2':  { key: 'tools',           label: s => `${s} - Tools, Equipment - Depreciated Value` },
  '3':  { key: 'ict',             label: s => `${s} - Information and communication technology - ICT` },
  '4':  { key: 'staff_accom',     label: s => `${s} - Total Staff Accomodation` },
  '5':  { key: 'transport',       label: s => `${s} - Transportation and Fleet Management` },
  '6':  { key: 'subcontractors',  label: s => `${s} - Subcontractors and Outsourcing` },
  '9':  { key: 'insurance',       label: s => `${s} - Contracting Insurance` },
  '10': { key: 'penalties',       label: s => `${s} - Penalties` },
  '11': { key: 'indirect',        label: s => `${s} - Indirect Costs` },
};

function detectCostCategory(code: string): { key: string; label: string } {
  // Service-line costs: code is 6 digits like '500001'. Bytes 2-3 select
  // the cost category. We need to handle both '01' (cat 0) and '11' (cat 11).
  // Read the cost-category as the substring after the 2-char service prefix.
  // Format is "{service:2}{category:1or2}{seq:rest}".
  const afterService = code.slice(2);     // '0001' for headcount, '1101' for indirect
  // Headcount uses single digit (e.g. '0001' through '0012').
  // Indirect/penalties use two digits ('10', '11').
  // Strategy: try 2-digit first, fall back to 1-digit.
  const twoDigit = afterService.slice(0, 2);
  if (twoDigit === '10' || twoDigit === '11') {
    const cat = COST_CATEGORY[twoDigit];
    return { key: cat.key, label: '' /* filled by caller */ };
  }
  const oneDigit = afterService.slice(0, 1);
  const cat = COST_CATEGORY[oneDigit];
  if (!cat) return { key: 'other', label: '' };
  return { key: cat.key, label: '' };
}

export function classifyByPrefix(
  code: string,
  name: string,
  accountType: string
): Classification | null {
  // Balance-sheet account types are not P&L
  if (
    accountType.startsWith('asset_') ||
    accountType.startsWith('liability_') ||
    accountType === 'equity' ||
    accountType === 'equity_unaffected'
  ) {
    return null;
  }

  // Income → Revenue, split by service-name keyword
  if (accountType === 'income' || accountType === 'income_other') {
    if (accountType === 'income_other') {
      return {
        section: 'revenue',
        subgroupKey: 'other_revenue',
        subgroupLabel: 'Other Revenues',
        flip: true,
      };
    }
    for (const [, svc] of Object.entries(SERVICE_PREFIX)) {
      if (svc.revenueKeyword.test(name)) {
        return {
          section: 'revenue',
          service: svc.key,
          serviceLabel: `${svc.key.toUpperCase()} Revenue`,
          subgroupKey: 'service_revenue',
          subgroupLabel: 'Operation Revenue',
          flip: true,
        };
      }
    }
    return {
      section: 'revenue',
      subgroupKey: 'other_revenue',
      subgroupLabel: 'Other Revenues',
      flip: true,
    };
  }

  // Expense / direct cost / depreciation routes via prefix
  if (
    accountType !== 'expense' &&
    accountType !== 'expense_direct_cost' &&
    accountType !== 'expense_depreciation'
  ) {
    return null;
  }

  if (!/^\d{3,}/.test(code)) return null;

  const p2 = code.slice(0, 2);
  const p3 = code.slice(0, 3);

  // Service-line costs
  if (SERVICE_PREFIX[p2]) {
    const svc = SERVICE_PREFIX[p2];
    const cat = detectCostCategory(code);
    const labelFn = COST_CATEGORY[cat.key === 'penalties' ? '10' : cat.key === 'indirect' ? '11' : Object.keys(COST_CATEGORY).find(k => COST_CATEGORY[k].key === cat.key) || '0'];
    const svcShort = svc.key.toUpperCase().replace('VO', 'Variation Order').replace('PAID', 'Paid Service');
    return {
      section: 'cost_of_revenue',
      service: svc.key,
      serviceLabel: svc.costLabel,
      subgroupKey: cat.key,
      subgroupLabel: labelFn ? labelFn.label(svcShort) : `${svcShort} - ${cat.key}`,
      flip: false,
      isDepreciation: cat.key === 'tools',
    };
  }

  // General expenses (600-606)
  if (p3 === '600') return { section: 'general_expenses', subgroupKey: 'back_office',     subgroupLabel: 'Back Office Salaries, Benefits',  flip: false };
  if (p3 === '601') return { section: 'general_expenses', subgroupKey: 'office_rent',     subgroupLabel: 'Office/Stores Rent & Utilities',  flip: false };
  if (p3 === '602') return { section: 'general_expenses', subgroupKey: 'transport_ga',    subgroupLabel: 'Transportation Expenses',          flip: false };
  if (p3 === '603') return { section: 'general_expenses', subgroupKey: 'marketing',       subgroupLabel: 'Marketing & Tender expenses',     flip: false };
  if (p3 === '604') return { section: 'general_expenses', subgroupKey: 'legal_financial', subgroupLabel: 'Legal & Financial Expenses',      flip: false };
  if (p3 === '605' || p3 === '606')
                    return { section: 'general_expenses', subgroupKey: 'other_ga',        subgroupLabel: 'Other Expenses',                   flip: false };

  // Interest / depreciation
  if (p3 === '607') return { section: 'interest_tax_dep', subgroupKey: 'interest',     subgroupLabel: 'Interest',     flip: false };
  if (p3 === '608' || p3 === '609')
                    return { section: 'interest_tax_dep', subgroupKey: 'depreciation', subgroupLabel: 'Depreciation', flip: false };

  return null;
}
```

- [ ] **Step 1.4: Run the test — confirm it passes**

```bash
npm run test -- src/lib/fmplus/classifier.test.ts
```

Expected: PASS — all describe blocks green.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/fmplus/classifier.ts src/lib/fmplus/classifier.test.ts
git commit -m "$(cat <<'EOF'
feat(fmplus): prefix-based P&L classifier

Pure deterministic mapping from Odoo account.code prefix to P&L
section + subgroup. Covers all 8 service-line cost prefixes
(500-570), 7 G&A prefixes (600-606), and Interest/Depreciation
(607-609). Income split by service-name keyword. Balance-sheet
types return null.

isDepreciation flag on 5xx02xx (tools/equipment) rows enables the
no-dep toggle to pull them out of COGS into the bottom bucket
without changing Net Profit.

Tested against the structure observed in user's Feb-2026 Excel
export.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Types module

Centralize the data shapes. Pure type module — no runtime code, no tests.

**Files:**
- Create: `src/lib/fmplus/types.ts`

- [ ] **Step 2.1: Write the types**

```typescript
// src/lib/fmplus/types.ts
import type { SectionKey, ServiceKey, Classification } from './classifier';

export type Granularity = 'monthly' | 'quarterly' | 'yearly';

export type Period = {
  key: string;        // 'm:2026-02', 'q:2026-1', 'y:2026'
  label: string;      // 'Feb 2026', 'Q1 2026', '2026'
  fromDate: string;   // YYYY-MM-DD
  toDate: string;     // YYYY-MM-DD (inclusive)
};

export type ScopeMode = 'trend' | 'plans' | 'accounts';

export type Scope = {
  mode: ScopeMode;
  companyIds: number[];          // [FMPLUS_COMPANY_ID] — single-element array
  planIds?: number[];            // when mode=plans
  planId?: number;               // when mode=accounts (single)
  accountIds?: number[];         // when mode=accounts (multi)
  includeDrafts: boolean;
  withDep: boolean;
};

// Per-period balances keyed by period.key
export type PeriodValues = Record<string, number>;

export type PnlLeaf = {
  code: string;
  name: string;
  account_type: string;
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
  serviceLines?: PnlServiceLineCost[]; // only for cost_of_revenue
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
  account_type: string;
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
  periods: Period[];               // each represents an as-of snapshot date
  scope: Scope;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
  liabPlusEquity: PeriodValues;
  balanced: Record<string, boolean>; // per-period balanced flag
  delta: PeriodValues;               // assets - (liab + equity), per period
};

export type DashboardKpi = {
  current: number;
  prior: number;
  deltaPct: number;
  sparkline: number[];           // last 6 periods of same granularity
};

export type DashboardReport = {
  periods: Period[];             // current + 6 historical for sparkline
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

// Re-export classifier types for downstream callers
export type { SectionKey, ServiceKey, Classification };
```

- [ ] **Step 2.2: Verify types compile**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: no errors mentioning `src/lib/fmplus/types.ts`.

- [ ] **Step 2.3: Commit**

```bash
git add src/lib/fmplus/types.ts
git commit -m "feat(fmplus): central types for financials module

Defines Period, Scope, PnlReport, BalanceSheetReport, DashboardReport
shapes. PeriodValues = Record<period.key, number> so multi-period
trend renders pivot from one record per leaf.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Opening-balance constants

Extract the Feb-2026 Balance Sheet snapshot from the user's Excel into a TypeScript constant. Same pattern as `src/lib/beithady-opening-balance-2026.ts`. Add a sanity test that the snapshot is balanced.

**Files:**
- Create: `src/lib/fmplus/opening-balance.ts`
- Test: `src/lib/fmplus/opening-balance.test.ts`

- [ ] **Step 3.1: Extract snapshot data from the Excel**

Run this once locally to get the leaf-level balance rows; copy them into the TypeScript constant in step 3.2:

```bash
python3 -c "
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd
df = pd.read_excel(r'C:\kareemhady\.claude\FMPLUS\financial_statements__fm (7).xlsx', sheet_name='Balance Sheet', header=None)
out = []
for _, r in df.iterrows():
    code = '' if pd.isna(r[0]) else str(r[0]).strip()
    name = '' if pd.isna(r[1]) else str(r[1]).strip()
    bal  = 0 if pd.isna(r[2]) else float(r[2])
    if code and name:  # leaf rows only
        out.append({'code': code, 'name': name, 'opening_raw': bal})
print(json.dumps(out, ensure_ascii=False, indent=2))
" > /tmp/fmplus-opening.json
wc -l /tmp/fmplus-opening.json
```

Expected: produces a JSON file with the leaf accounts. Use this output to fill the constant in step 3.2.

- [ ] **Step 3.2: Write the failing balanced-check test**

```typescript
// src/lib/fmplus/opening-balance.test.ts
import { describe, it, expect } from 'vitest';
import { FMPLUS_OPENING_BALANCES_2026_02, OPENING_BALANCE_DATE } from './opening-balance';

describe('FMPLUS opening balance Feb 2026', () => {
  it('has snapshot date = 2026-02-28', () => {
    expect(OPENING_BALANCE_DATE).toBe('2026-02-28');
  });
  it('contains at least 30 leaf accounts', () => {
    expect(FMPLUS_OPENING_BALANCES_2026_02.length).toBeGreaterThan(30);
  });
  it('each entry has code, name, account_type, opening_raw', () => {
    for (const e of FMPLUS_OPENING_BALANCES_2026_02) {
      expect(typeof e.code).toBe('string');
      expect(e.code.length).toBeGreaterThan(0);
      expect(typeof e.name).toBe('string');
      expect(typeof e.account_type).toBe('string');
      expect(typeof e.opening_raw).toBe('number');
    }
  });
  it('balances within 1 EGP (assets sum = -(liabilities+equity) in raw debit-normal terms)', () => {
    // In raw Odoo balance terms, assets are positive (debit-normal) and
    // liabilities + equity are negative (credit-normal). So sum of all
    // entries should be ~0 if the snapshot is balanced.
    const total = FMPLUS_OPENING_BALANCES_2026_02.reduce((s, e) => s + e.opening_raw, 0);
    expect(Math.abs(total)).toBeLessThan(1);
  });
});
```

- [ ] **Step 3.3: Run — confirm it fails**

```bash
npm run test -- src/lib/fmplus/opening-balance.test.ts
```

Expected: FAIL with "Cannot find module './opening-balance'".

- [ ] **Step 3.4: Write `opening-balance.ts`**

Use the JSON output from Step 3.1 as the source of truth. Inline the entries as a `const` array. Tag each with the correct `account_type` based on its code prefix (matches the Excel's section grouping):

```typescript
// src/lib/fmplus/opening-balance.ts
//
// Snapshot of FMPLUS Property & Facility Management's Balance Sheet
// at 2026-02-28, extracted from the user's Feb-2026 Excel export.
//
// Why we need this: Odoo move-lines only sync ~365 days of history,
// so a balance sheet for any date >= 2026-02-28 must be seeded with
// these cumulative balances and then live-summed with deltas.
// See src/lib/financials-pnl.ts for the same pattern on the Beithady side.
//
// Sign convention: opening_raw is the raw Odoo debit-credit balance.
// Assets are positive, liabilities + equity are negative. Display
// flipping happens at render time, NOT here.

export const OPENING_BALANCE_DATE = '2026-02-28';

export type FmplusOpeningEntry = {
  code: string;
  name: string;
  account_type: string;     // e.g. 'asset_cash', 'liability_payable', 'equity'
  opening_raw: number;
};

export const FMPLUS_OPENING_BALANCES_2026_02: readonly FmplusOpeningEntry[] = [
  // ASSETS — Bank and Cash (asset_cash)
  // ASSETS — Receivables (asset_receivable)
  // ASSETS — Current (asset_current) → Inventories, Prepayments
  // ASSETS — Fixed (asset_fixed) → PPE, Equipment, etc.
  // ASSETS — Non-current (asset_non_current) → Deferred Tax, Intangible, Restricted Cash
  // LIABILITIES — Current (liability_current) → Trade Payables (sub), Tax, Other
  // LIABILITIES — Payable (liability_payable) → Trade Payables
  // LIABILITIES — Non-current (liability_non_current) → Borrowings, Other
  // EQUITY — equity → Capital, Other Equity
  // EQUITY — equity_unaffected → Retained Earnings (Previous Years)
  // ⬇ paste leaf entries from /tmp/fmplus-opening.json here ⬇
  // Format: { code: '123001', name: 'Cash on Hand', account_type: 'asset_cash', opening_raw: 1234.56 },
  // (Implementer: ~30-50 entries expected based on the export.)
];
```

**Implementer note:** Step 3.1's JSON dump is the source data. Map each entry's code to the correct `account_type` using these rules (read from the Excel groupings):
- `121xxx` → `asset_current` (Inventories)
- `122xxx` → `asset_receivable` (Trade Receivables)
- `123xxx` → `asset_cash` (Cash, Bank, Custody)
- `124xxx` → `asset_prepayments`
- `111xxx` / `112xxx` → `asset_fixed`
- `113xxx` / `115xxx` / `117xxx` → `asset_non_current`
- `211xxx` → `liability_non_current` (Borrowings)
- `215xxx` → `liability_non_current` (Other NCL)
- `221xxx` → `liability_payable` (Trade Payables)
- `226xxx` → `liability_current` (Tax)
- `227xxx` → `liability_current` (Other)
- Any equity / retained-earnings rows from the export → `equity` or `equity_unaffected` per the Excel sub-section.

- [ ] **Step 3.5: Run — confirm balanced**

```bash
npm run test -- src/lib/fmplus/opening-balance.test.ts
```

Expected: PASS. The "balances within 1 EGP" assertion is the hard one — if it fails, double-check the sign of equity entries (Odoo stores equity as credit-normal, so they should be negative in `opening_raw`).

- [ ] **Step 3.6: Commit**

```bash
git add src/lib/fmplus/opening-balance.ts src/lib/fmplus/opening-balance.test.ts
git commit -m "feat(fmplus): opening-balance seed at 2026-02-28

Extracts every leaf account from the user's Feb-2026 Balance Sheet
xlsx into a TypeScript const. Used to seed buildFmplusBalanceSheet
when asof > 2026-02-28; live-summed deltas stack on top.

Same pattern as Beithady's beithady-opening-balance-2026.ts.

Test: snapshot balances to within 1 EGP (assets - (liab + equity) ~ 0).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

*[Plan continues — remaining tasks 4-23 written in next chunk to stay under output limits.]*

## Task 4: FMPLUS company discovery helper

A one-shot helper that resolves the FMPLUS company's Odoo `id`. Caches in `odoo_companies` after first run so cold starts don't always hit Odoo.

**Files:**
- Create: `src/lib/fmplus/discover-company.ts`

- [ ] **Step 4.1: Write the helper**

```typescript
// src/lib/fmplus/discover-company.ts
import { supabaseAdmin } from '../supabase';
import { odooSearchRead, type OdooCompany } from '../odoo';

const FMPLUS_NAME_PATTERN = 'FMPLUS Property%';

// Returns the Odoo company.id for "FMPLUS Property & Facility Management".
// Cached in odoo_companies after first call. Throws if not found in Odoo.
export async function discoverFmplusCompanyId(): Promise<number> {
  const sb = supabaseAdmin();

  // Warm path — already synced.
  const { data: cached } = await sb
    .from('odoo_companies')
    .select('id')
    .ilike('name', 'fmplus property%')
    .maybeSingle();
  if (cached?.id) return Number(cached.id);

  // Cold path — query Odoo.
  const rows = await odooSearchRead<OdooCompany>(
    'res.company',
    [['name', 'ilike', FMPLUS_NAME_PATTERN]],
    { fields: ['name', 'country_id', 'currency_id', 'partner_id'], limit: 1 }
  );
  if (!rows[0]) {
    throw new Error(
      'discoverFmplusCompanyId: no res.company found matching "FMPLUS Property%". ' +
      'Verify the company exists in the Odoo tenant and the API user has access.'
    );
  }

  const company = rows[0];
  await sb.from('odoo_companies').upsert(
    {
      id: company.id,
      name: company.name || 'FMPLUS Property & Facility Management',
      country: Array.isArray(company.country_id) ? company.country_id[1] : null,
      currency: Array.isArray(company.currency_id) ? company.currency_id[1] : null,
      partner_id: Array.isArray(company.partner_id) ? company.partner_id[0] : null,
      in_scope: true,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  return company.id;
}
```

- [ ] **Step 4.2: Manual smoke (run locally with credentials)**

```bash
npx tsx -e "import('./src/lib/fmplus/discover-company.ts').then(async m => { console.log('FMPLUS company id:', await m.discoverFmplusCompanyId()); })"
```

Expected: prints a numeric ID. **Note the discovered ID** — you'll need it for Tasks 6 and 7.

- [ ] **Step 4.3: Commit**

```bash
git add src/lib/fmplus/discover-company.ts
git commit -m "feat(fmplus): discoverFmplusCompanyId helper

Resolves FMPLUS Property & Facility Management's Odoo company.id
on first call by querying res.company; caches in odoo_companies
for subsequent warm-path lookups.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Migration 0079 — multi-period RPC + active-accounts RPC

Two new Postgres functions, no schema changes.

**Files:**
- Create: `supabase/migrations/0079_fmplus_financials.sql`

- [ ] **Step 5.1: Write the migration**

```sql
-- supabase/migrations/0079_fmplus_financials.sql
-- Phase 11: FMPLUS Financials sub-module.
-- Adds two RPCs that aggregate odoo_move_lines for the FMPLUS company.
-- No schema changes — reuses Beithady-era tables.

create or replace function public.pnl_aggregated_multiperiod(
  p_periods         jsonb,
  p_company_ids     bigint[],
  p_plan_ids        bigint[]    default null,
  p_account_ids     bigint[]    default null,
  p_include_drafts  boolean     default true
)
returns table(
  period_key   text,
  code         text,
  name         text,
  account_type text,
  sum_balance  numeric,
  line_count   integer
)
language plpgsql
stable as $$
declare
  v_states text[];
  v_period record;
begin
  v_states := case when p_include_drafts then array['draft','posted'] else array['posted'] end;

  for v_period in
    select
      pp->>'key'  as key,
      (pp->>'from')::date as from_date,
      (pp->>'to')::date   as to_date
    from jsonb_array_elements(p_periods) as pp
  loop
    return query
    select
      v_period.key as period_key,
      coalesce(a.code, '')                  as code,
      coalesce(a.name, '')                  as name,
      coalesce(a.account_type, '')          as account_type,
      sum(ml.balance)::numeric              as sum_balance,
      count(*)::integer                     as line_count
    from public.odoo_move_lines ml
    left join public.odoo_accounts a on a.id = ml.account_id
    where ml.company_id = any(p_company_ids)
      and ml.parent_state = any(v_states)
      and ml.date >= v_period.from_date
      and ml.date <= v_period.to_date
      and (
        (p_plan_ids is null and p_account_ids is null)
        or
        (p_plan_ids is not null and exists (
          select 1
          from public.odoo_move_line_analytics mla
          join public.odoo_analytic_accounts aa on aa.id = mla.analytic_account_id
          where mla.move_line_id = ml.id
            and (aa.plan_id = any(p_plan_ids) or aa.root_plan_id = any(p_plan_ids))
        ))
        or
        (p_account_ids is not null and exists (
          select 1
          from public.odoo_move_line_analytics mla
          where mla.move_line_id = ml.id
            and mla.analytic_account_id = any(p_account_ids)
        ))
      )
    group by a.code, a.name, a.account_type;
  end loop;
end;
$$;

comment on function public.pnl_aggregated_multiperiod is
  'Multi-period P&L aggregation for FMPLUS Financials.';

create or replace function public.fmplus_active_accounts(
  p_plan_id     bigint,
  p_from        date,
  p_to          date,
  p_company_ids bigint[]
)
returns table(
  account_id   bigint,
  name         text,
  abs_balance  numeric
)
language sql
stable as $$
  select
    aa.id        as account_id,
    aa.name      as name,
    sum(abs(ml.balance))::numeric as abs_balance
  from public.odoo_move_line_analytics mla
  join public.odoo_analytic_accounts aa  on aa.id = mla.analytic_account_id
  join public.odoo_move_lines ml         on ml.id = mla.move_line_id
  where (aa.plan_id = p_plan_id or aa.root_plan_id = p_plan_id)
    and ml.company_id = any(p_company_ids)
    and ml.parent_state in ('draft','posted')
    and ml.date >= p_from
    and ml.date <= p_to
  group by aa.id, aa.name
  having sum(abs(ml.balance)) > 0
  order by sum(abs(ml.balance)) desc;
$$;

comment on function public.fmplus_active_accounts is
  'Returns analytic accounts with non-zero activity in a (plan, period). Drives picker auto-prune.';
```

- [ ] **Step 5.2: Commit (file only — not yet applied)**

```bash
git add supabase/migrations/0079_fmplus_financials.sql
git commit -m "feat(fmplus): migration 0079 — multi-period + active-accounts RPCs

pnl_aggregated_multiperiod returns one row per (period, code) so
the renderer pivots N trend columns from a single round-trip.
fmplus_active_accounts drives the picker auto-prune.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Apply migration 0079 to Supabase

Per CLAUDE.md, apply via the Supabase MCP `apply_migration` tool (pre-approved). Do NOT use `supabase` CLI on Windows.

- [ ] **Step 6.1: Apply via MCP**

Invoke `mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__apply_migration` with `name: '0079_fmplus_financials'` and `query: <contents of the SQL file>`. Expected: success response.

- [ ] **Step 6.2: Verify both functions exist**

Use `mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__execute_sql`:

```sql
select proname, pronargs from pg_proc
where proname in ('pnl_aggregated_multiperiod', 'fmplus_active_accounts');
```

Expected: 2 rows.

- [ ] **Step 6.3: Smoke-test `fmplus_active_accounts`**

```sql
select * from fmplus_active_accounts(
  (select id from odoo_analytic_plans limit 1),
  '2026-02-01', '2026-02-28',
  ARRAY[<FMPLUS_COMPANY_ID>]::bigint[]
) limit 5;
```

Expected: 0+ rows. Zero is fine pre-sync (next task fixes that).

- [ ] **Step 6.4: No commit needed** — SQL file already committed in Task 5.

---

## Task 7: Extend financial sync to include FMPLUS

Wire `discoverFmplusCompanyId()` into the existing sync.

**Files:**
- Modify: `src/lib/run-odoo-financial-sync.ts:18`
- Modify: `src/app/api/odoo/sync-financials/route.ts`

- [ ] **Step 7.1: Replace `FINANCIALS_COMPANY_IDS` with lazy resolver**

Open `src/lib/run-odoo-financial-sync.ts`. Replace the existing `export const FINANCIALS_COMPANY_IDS = [4, 5, 6, 10];` block with:

```typescript
import { discoverFmplusCompanyId } from './fmplus/discover-company';

// Beithady ecosystem (4, 5, 10) + Kika (6). FMPLUS company id is resolved
// lazily on first sync because it varies by tenant install.
export const FINANCIALS_COMPANY_IDS_STATIC = [4, 5, 6, 10] as const;

let _cachedScope: number[] | null = null;
export async function getFinancialsCompanyIds(): Promise<number[]> {
  if (_cachedScope) return _cachedScope;
  const fmplusId = await discoverFmplusCompanyId();
  _cachedScope = [...FINANCIALS_COMPANY_IDS_STATIC, fmplusId];
  return _cachedScope;
}

// Back-compat re-export for any remaining synchronous callers.
export const FINANCIALS_COMPANY_IDS = FINANCIALS_COMPANY_IDS_STATIC;
```

- [ ] **Step 7.2: Update each sync function to use the async resolver**

In every sync function (`syncOdooAccounts`, `syncOdooPartners`, `syncOdooAnalyticPlans`, `syncOdooAnalyticAccounts`), replace the loop header:

```typescript
// Before:
for (const companyId of FINANCIALS_COMPANY_IDS) {

// After:
const companyIds = await getFinancialsCompanyIds();
for (const companyId of companyIds) {
```

For the `syncOdooMoveLines(companyId)` whitelist guard:

```typescript
// Before:
if (!FINANCIALS_COMPANY_IDS.includes(companyId)) {

// After:
const companyIds = await getFinancialsCompanyIds();
if (!companyIds.includes(companyId)) {
```

- [ ] **Step 7.3: Update API route**

In `src/app/api/odoo/sync-financials/route.ts`, import `getFinancialsCompanyIds` and use it in the `'all'` case + the `default` help response. Replace `for (const cid of FINANCIALS_COMPANY_IDS)` with `for (const cid of await getFinancialsCompanyIds())` and `financials_company_ids: FINANCIALS_COMPANY_IDS` with `financials_company_ids: await getFinancialsCompanyIds()`.

- [ ] **Step 7.4: Type-check**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: no errors mentioning these files.

- [ ] **Step 7.5: Run sync to backfill FMPLUS data**

Local dev (with `.env.local`):

```bash
npm run dev
```

Then in another terminal:

```bash
curl -X GET "http://localhost:3000/api/odoo/sync-financials?phase=accounts" \
  -H "Authorization: Bearer $CRON_SECRET"
curl -X GET "http://localhost:3000/api/odoo/sync-financials?phase=move-lines&company=<FMPLUS_ID>" \
  -H "Authorization: Bearer $CRON_SECRET"
# Re-run with &resume=1 if "complete": false in the response.
curl -X GET "http://localhost:3000/api/odoo/sync-financials?phase=analytic-plans" \
  -H "Authorization: Bearer $CRON_SECRET"
curl -X GET "http://localhost:3000/api/odoo/sync-financials?phase=analytic-accounts" \
  -H "Authorization: Bearer $CRON_SECRET"
curl -X GET "http://localhost:3000/api/odoo/sync-financials?phase=analytic-links" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: each returns `{ ok: true, ... }`.

- [ ] **Step 7.6: Verify FMPLUS data landed**

Via Supabase MCP `execute_sql`:

```sql
select company_id, count(*) as line_count
from odoo_move_lines
where company_id = <FMPLUS_ID>
group by company_id;
```

Expected: a non-zero `line_count`.

- [ ] **Step 7.7: Commit**

```bash
git add src/lib/run-odoo-financial-sync.ts src/app/api/odoo/sync-financials/route.ts
git commit -m "feat(fmplus): extend financial sync to include FMPLUS company

getFinancialsCompanyIds() async resolver lazy-loads the FMPLUS
company id via discoverFmplusCompanyId() and caches it. Every
sync function and the /api/odoo/sync-financials 'all' phase
now uses the resolver.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Period-series resolver

Pure function: `(granularity, periods, asof) → Period[]`, current-leftmost.

**Files:**
- Create: `src/lib/fmplus/period-series.ts`
- Test: `src/lib/fmplus/period-series.test.ts`

- [ ] **Step 8.1: Failing tests**

```typescript
// src/lib/fmplus/period-series.test.ts
import { describe, it, expect } from 'vitest';
import { resolvePeriodSeries } from './period-series';

describe('resolvePeriodSeries', () => {
  it('monthly periods=3 anchored on Feb 2026 → Feb, Jan, Dec', () => {
    const out = resolvePeriodSeries('monthly', 3, '2026-02');
    expect(out.map(p => p.key)).toEqual(['m:2026-02', 'm:2026-01', 'm:2025-12']);
    expect(out[0]).toMatchObject({ label: 'Feb 2026', fromDate: '2026-02-01', toDate: '2026-02-28' });
    expect(out[2]).toMatchObject({ label: 'Dec 2025', fromDate: '2025-12-01', toDate: '2025-12-31' });
  });

  it('monthly periods=12 anchored on Feb 2026 → 12 months', () => {
    const out = resolvePeriodSeries('monthly', 12, '2026-02');
    expect(out).toHaveLength(12);
    expect(out[0].key).toBe('m:2026-02');
    expect(out[11].key).toBe('m:2025-03');
  });

  it('quarterly periods=4 anchored on Q1 2026 → Q1 2026, Q4 2025, Q3 2025, Q2 2025', () => {
    const out = resolvePeriodSeries('quarterly', 4, '2026-Q1');
    expect(out.map(p => p.key)).toEqual(['q:2026-1', 'q:2025-4', 'q:2025-3', 'q:2025-2']);
    expect(out[0]).toMatchObject({ fromDate: '2026-01-01', toDate: '2026-03-31' });
    expect(out[1]).toMatchObject({ fromDate: '2025-10-01', toDate: '2025-12-31' });
  });

  it('yearly periods=3 anchored on 2026 → 2026, 2025, 2024', () => {
    const out = resolvePeriodSeries('yearly', 3, '2026');
    expect(out.map(p => p.key)).toEqual(['y:2026', 'y:2025', 'y:2024']);
    expect(out[0]).toMatchObject({ fromDate: '2026-01-01', toDate: '2026-12-31' });
  });

  it('handles month rollover from January', () => {
    const out = resolvePeriodSeries('monthly', 3, '2026-01');
    expect(out.map(p => p.label)).toEqual(['Jan 2026', 'Dec 2025', 'Nov 2025']);
  });

  it('handles February leap-year (Feb 2024 has 29 days)', () => {
    const out = resolvePeriodSeries('monthly', 1, '2024-02');
    expect(out[0].toDate).toBe('2024-02-29');
  });

  it('falls back to current month when asof is malformed', () => {
    const out = resolvePeriodSeries('monthly', 1, 'gibberish');
    expect(out).toHaveLength(1);
    expect(out[0].key).toMatch(/^m:\d{4}-\d{2}$/);
  });
});
```

- [ ] **Step 8.2: Run — confirm fail**

```bash
npm run test -- src/lib/fmplus/period-series.test.ts
```

- [ ] **Step 8.3: Implement**

```typescript
// src/lib/fmplus/period-series.ts
import type { Granularity, Period } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

function monthLabel(yy: number, mm: number): string {
  return new Date(Date.UTC(yy, mm, 1)).toLocaleDateString('en-US', {
    month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

function lastDayOfMonth(yy: number, mm: number): string {
  const d = new Date(Date.UTC(yy, mm + 1, 0));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function makeMonth(yy: number, mm: number): Period {
  return {
    key: `m:${yy}-${pad(mm + 1)}`,
    label: monthLabel(yy, mm),
    fromDate: `${yy}-${pad(mm + 1)}-01`,
    toDate: lastDayOfMonth(yy, mm),
  };
}

function makeQuarter(yy: number, q: number): Period {
  const startMonth = (q - 1) * 3;
  return {
    key: `q:${yy}-${q}`,
    label: `Q${q} ${yy}`,
    fromDate: `${yy}-${pad(startMonth + 1)}-01`,
    toDate: lastDayOfMonth(yy, startMonth + 2),
  };
}

function makeYear(yy: number): Period {
  return { key: `y:${yy}`, label: `${yy}`, fromDate: `${yy}-01-01`, toDate: `${yy}-12-31` };
}

function parseAsofMonthly(asof: string, now: Date): { yy: number; mm: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(asof);
  if (m) {
    const yy = Number(m[1]);
    const mm = Number(m[2]) - 1;
    if (mm >= 0 && mm <= 11) return { yy, mm };
  }
  return { yy: now.getUTCFullYear(), mm: now.getUTCMonth() };
}

function parseAsofQuarterly(asof: string, now: Date): { yy: number; q: number } {
  const m = /^(\d{4})-Q([1-4])$/.exec(asof);
  if (m) return { yy: Number(m[1]), q: Number(m[2]) };
  return { yy: now.getUTCFullYear(), q: Math.floor(now.getUTCMonth() / 3) + 1 };
}

function parseAsofYearly(asof: string, now: Date): { yy: number } {
  const m = /^(\d{4})$/.exec(asof);
  if (m) return { yy: Number(m[1]) };
  return { yy: now.getUTCFullYear() };
}

export function resolvePeriodSeries(
  granularity: Granularity,
  periods: number,
  asof: string,
  now: Date = new Date()
): Period[] {
  const n = Math.max(1, Math.min(12, Math.floor(periods)));
  const out: Period[] = [];

  if (granularity === 'monthly') {
    const { yy, mm } = parseAsofMonthly(asof, now);
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.UTC(yy, mm - i, 1));
      out.push(makeMonth(d.getUTCFullYear(), d.getUTCMonth()));
    }
  } else if (granularity === 'quarterly') {
    const { yy, q } = parseAsofQuarterly(asof, now);
    for (let i = 0; i < n; i++) {
      const flatQ = q - i;
      const yearOffset = Math.floor((flatQ - 1) / 4);
      const adjQ = ((flatQ - 1) % 4 + 4) % 4 + 1;
      out.push(makeQuarter(yy + yearOffset, adjQ));
    }
  } else {
    const { yy } = parseAsofYearly(asof, now);
    for (let i = 0; i < n; i++) {
      out.push(makeYear(yy - i));
    }
  }

  return out;
}
```

- [ ] **Step 8.4: Run — confirm pass**

```bash
npm run test -- src/lib/fmplus/period-series.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 8.5: Commit**

```bash
git add src/lib/fmplus/period-series.ts src/lib/fmplus/period-series.test.ts
git commit -m "feat(fmplus): period-series resolver

Pure function (granularity, periods, asof) -> Period[]. Current
period leftmost, older to the right. Handles month/quarter/year
rollover, leap years, malformed asof.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Build P&L report (library)

The core aggregator. Calls `pnl_aggregated_multiperiod` and pivots into the `PnlReport` shape. TDD with mocked Supabase + golden assertions matching the Feb-2026 Excel totals.

**Files:**
- Create: `src/lib/fmplus/financials.ts`
- Test: `src/lib/fmplus/financials.test.ts`

- [ ] **Step 9.1: Failing tests with hand-curated row fixture**

```typescript
// src/lib/fmplus/financials.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildFmplusPnl } from './financials';
import type { Period } from './types';

// Subset of the user's Feb-2026 Excel rows — enough to verify the
// classifier wires up correctly and totals roll. The full hermetic
// fixture lives in __fixtures__/feb-2026-pnl.json.
const FIXTURE_ROWS = [
  { period_key: 'm:2026-02', code: '400001', name: 'House Keeping Revenue', account_type: 'income',              sum_balance: -20625702.99, line_count: 50 },
  { period_key: 'm:2026-02', code: '400002', name: 'MEP Revenue',           account_type: 'income',              sum_balance: -11747221.57, line_count: 30 },
  { period_key: 'm:2026-02', code: '400003', name: 'Security Revenue',     account_type: 'income',              sum_balance: -3128301,     line_count: 10 },
  { period_key: 'm:2026-02', code: '500001', name: 'Basic Salary Hk',       account_type: 'expense_direct_cost', sum_balance:  7265784.56,  line_count: 100 },
  { period_key: 'm:2026-02', code: '500201', name: 'Depreciation - Equipment Hk', account_type: 'expense_direct_cost', sum_balance: 373484.82, line_count: 5 },
  { period_key: 'm:2026-02', code: '510001', name: 'Basic Salary MEP',      account_type: 'expense_direct_cost', sum_balance:  4000000,     line_count: 60 },
  { period_key: 'm:2026-02', code: '600001', name: 'Basic Salary BO',       account_type: 'expense',             sum_balance:  3000000,     line_count: 20 },
  { period_key: 'm:2026-02', code: '607001', name: 'Interest',              account_type: 'expense',             sum_balance:  1113260.52,  line_count: 8 },
  { period_key: 'm:2026-02', code: '608001', name: 'Depreciation',          account_type: 'expense_depreciation',sum_balance:  410819.7,    line_count: 4 },
];

vi.mock('../supabase', () => ({
  supabaseAdmin: () => ({
    rpc: vi.fn().mockResolvedValue({ data: FIXTURE_ROWS, error: null }),
  }),
}));

describe('buildFmplusPnl', () => {
  const fmplusCompanyId = 99;
  const period: Period = {
    key: 'm:2026-02', label: 'Feb 2026',
    fromDate: '2026-02-01', toDate: '2026-02-28',
  };

  it('rolls up revenue across HK + MEP + Security rows', async () => {
    const r = await buildFmplusPnl({
      periods: [period],
      scope: { mode: 'trend', companyIds: [fmplusCompanyId], includeDrafts: true, withDep: true },
    });
    // Income is credit-normal; classifier flip=true makes display positive.
    expect(r.sections.revenue.totals['m:2026-02']).toBeCloseTo(35501225.56, 0);
  });

  it('places HK Tools depreciation under cost_of_revenue.hk.tools by default (with-dep)', async () => {
    const r = await buildFmplusPnl({
      periods: [period],
      scope: { mode: 'trend', companyIds: [fmplusCompanyId], includeDrafts: true, withDep: true },
    });
    const hk = r.sections.cost_of_revenue.serviceLines!.find(s => s.service === 'hk')!;
    const tools = hk.subgroups.find(g => g.key === 'tools')!;
    expect(tools.totals['m:2026-02']).toBeCloseTo(373484.82, 2);
  });

  it('moves HK Tools depreciation OUT of COGS into bottom Depreciation when withDep=false', async () => {
    const r = await buildFmplusPnl({
      periods: [period],
      scope: { mode: 'trend', companyIds: [fmplusCompanyId], includeDrafts: true, withDep: false },
    });
    const hk = r.sections.cost_of_revenue.serviceLines!.find(s => s.service === 'hk')!;
    const tools = hk.subgroups.find(g => g.key === 'tools');
    expect(tools).toBeUndefined();
    const dep = r.sections.interest_tax_dep.subgroups.find(g => g.key === 'depreciation')!;
    // 608001 (410k) + 500201 (373k) all in one bucket
    expect(dep.totals['m:2026-02']).toBeCloseTo(410819.7 + 373484.82, 2);
  });

  it('Net Profit identical between with-dep and no-dep views', async () => {
    const a = await buildFmplusPnl({ periods: [period], scope: { mode: 'trend', companyIds: [fmplusCompanyId], includeDrafts: true, withDep: true } });
    const b = await buildFmplusPnl({ periods: [period], scope: { mode: 'trend', companyIds: [fmplusCompanyId], includeDrafts: true, withDep: false } });
    expect(a.subtotals.net_profit['m:2026-02']).toBeCloseTo(b.subtotals.net_profit['m:2026-02'], 2);
  });

  it('computes Gross Profit = Revenue - Cost of Revenue', async () => {
    const r = await buildFmplusPnl({
      periods: [period],
      scope: { mode: 'trend', companyIds: [fmplusCompanyId], includeDrafts: true, withDep: true },
    });
    const expected = r.sections.revenue.totals['m:2026-02'] - r.sections.cost_of_revenue.totals['m:2026-02'];
    expect(r.subtotals.gross_profit['m:2026-02']).toBeCloseTo(expected, 2);
  });
});
```

- [ ] **Step 9.2: Run — confirm fail**

```bash
npm run test -- src/lib/fmplus/financials.test.ts
```

Expected: FAIL — `Cannot find module './financials'`.

- [ ] **Step 9.3: Implement `buildFmplusPnl`**

```typescript
// src/lib/fmplus/financials.ts
import { supabaseAdmin } from '../supabase';
import { classifyByPrefix } from './classifier';
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

const SUBGROUP_ORDER: Record<string, string[]> = {
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
  // Aggregator: leaves keyed by code so multi-period rows merge into one leaf with values per period.
  type LeafBucket = { leaf: PnlLeaf; cls: NonNullable<ReturnType<typeof classifyByPrefix>> };
  const leavesByCode = new Map<string, LeafBucket>();

  for (const r of rows) {
    const cls = classifyByPrefix(r.code, r.name, r.account_type);
    const balance = Number(r.sum_balance) || 0;

    if (!cls) {
      // Track unclassified separately — surface in UI panel.
      let leaf = unclassified.find(l => l.code === r.code);
      if (!leaf) {
        leaf = { code: r.code, name: r.name, account_type: r.account_type, values: {} };
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
          code: r.code, name: r.name, account_type: r.account_type, values: {},
          isDepreciation: cls.isDepreciation,
        },
        cls,
      };
      leavesByCode.set(key, bucket);
    }
    addToValues(bucket.leaf.values, r.period_key, display);
  }

  // No-dep toggle: re-route leaves with isDepreciation=true OUT of cost_of_revenue
  // service-line .tools subgroup INTO interest_tax_dep.depreciation.
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
        addToValues(sg.totals, pk, v);
        addToValues(section.totals, pk, v);
      }
    }
  }

  // Sort subgroups in each section
  for (const sec of [sections.revenue, sections.general_expenses, sections.interest_tax_dep]) {
    const order = SUBGROUP_ORDER[sec.key];
    if (order) {
      const idx = new Map(order.map((k, i) => [k, i]));
      sec.subgroups.sort((a, b) => (idx.get(a.key) ?? 99) - (idx.get(b.key) ?? 99));
    }
    for (const sg of sec.subgroups) sg.leaves.sort((a, b) => a.code.localeCompare(b.code));
  }
  // Sort cost_of_revenue service lines
  const svcIdx = new Map(SERVICE_ORDER.map((k, i) => [k, i]));
  sections.cost_of_revenue.serviceLines!.sort(
    (a, b) => (svcIdx.get(a.service) ?? 99) - (svcIdx.get(b.service) ?? 99)
  );
  const catIdx = new Map(COST_CATEGORY_ORDER.map((k, i) => [k, i]));
  for (const svc of sections.cost_of_revenue.serviceLines!) {
    svc.subgroups.sort((a, b) => (catIdx.get(a.key) ?? 99) - (catIdx.get(b.key) ?? 99));
    for (const sg of svc.subgroups) sg.leaves.sort((a, b) => a.code.localeCompare(b.code));
  }

  // Compute service-line gross margin per period.
  // Revenue per service comes from revenue.subgroups[service_revenue] leaves
  // whose name keyword matches the service.
  const revenueByService: Record<string, PeriodValues> = {};
  const svcRevSubgroup = sections.revenue.subgroups.find(g => g.key === 'service_revenue');
  if (svcRevSubgroup) {
    for (const leaf of svcRevSubgroup.leaves) {
      const cls = classifyByPrefix(leaf.code, leaf.name, leaf.account_type);
      if (!cls?.service) continue;
      revenueByService[cls.service] = revenueByService[cls.service] || {};
      for (const [pk, v] of Object.entries(leaf.values)) {
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

  // Subtotals
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
```

- [ ] **Step 9.4: Run — confirm pass**

```bash
npm run test -- src/lib/fmplus/financials.test.ts
```

Expected: all 5 P&L tests PASS.

- [ ] **Step 9.5: Commit**

```bash
git add src/lib/fmplus/financials.ts src/lib/fmplus/financials.test.ts
git commit -m "feat(fmplus): buildFmplusPnl aggregator

Calls pnl_aggregated_multiperiod RPC; pivots into PnlReport with
multi-period leaves, per-service Cost subgroups, gross-margin
computation per service line, with-dep/no-dep toggle (moves
depreciation out of COGS into bottom bucket; Net Profit invariant).

Tested against a hand-curated row fixture covering every section.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: Build Balance Sheet (library)

Mirrors the Excel BS hierarchy. Seeds from `FMPLUS_OPENING_BALANCES_2026_02` for `asof >= 2026-02-28` and live-sums deltas. Same multi-period column shape as P&L.

**Files:**
- Modify: `src/lib/fmplus/financials.ts` (add `buildFmplusBalanceSheet`)
- Modify: `src/lib/fmplus/financials.test.ts` (add BS tests)

- [ ] **Step 10.1: Failing tests**

Append to `src/lib/fmplus/financials.test.ts`:

```typescript
import { buildFmplusBalanceSheet } from './financials';

describe('buildFmplusBalanceSheet', () => {
  it('balances assets vs (liabilities + equity) within 1 EGP for the seed snapshot', async () => {
    // Mock: zero deltas after 2026-02-28
    vi.doMock('../supabase', () => ({
      supabaseAdmin: () => ({
        from: () => ({
          select: () => ({
            lte: () => ({ in: () => ({ eq: () => ({ order: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) }) }) }),
          }),
        }),
      }),
    }));
    const r = await buildFmplusBalanceSheet({
      periods: [{ key: 'm:2026-02', label: 'Feb 2026', fromDate: '2026-02-01', toDate: '2026-02-28' }],
      scope: { mode: 'trend', companyIds: [99], includeDrafts: true, withDep: true },
    });
    expect(Math.abs(r.delta['m:2026-02'])).toBeLessThan(1);
    expect(r.balanced['m:2026-02']).toBe(true);
  });
});
```

- [ ] **Step 10.2: Add `buildFmplusBalanceSheet` to `financials.ts`**

```typescript
// Append to src/lib/fmplus/financials.ts
import {
  FMPLUS_OPENING_BALANCES_2026_02,
  OPENING_BALANCE_DATE,
  type FmplusOpeningEntry,
} from './opening-balance';
import type {
  BalanceSheetReport, BalanceSheetSection, BalanceSheetGroup, BalanceSheetLeaf,
} from './types';

const BS_GROUP_LABEL_BY_TYPE: Record<string, { section: 'assets'|'liabilities'|'equity'; group: string; label: string }> = {
  asset_cash:           { section: 'assets',     group: 'bank_cash',         label: 'Bank and Cash Accounts' },
  asset_receivable:     { section: 'assets',     group: 'receivables',       label: 'Receivables' },
  asset_current:        { section: 'assets',     group: 'current_assets',    label: 'Current Assets' },
  asset_prepayments:    { section: 'assets',     group: 'prepayments',       label: 'Prepayments' },
  asset_fixed:          { section: 'assets',     group: 'fixed_assets',      label: 'Plus Fixed Assets' },
  asset_non_current:    { section: 'assets',     group: 'non_current_assets',label: 'Plus Non-current Assets' },
  liability_payable:    { section: 'liabilities',group: 'payables',          label: 'Payables' },
  liability_current:    { section: 'liabilities',group: 'current_liabilities',label: 'Current Liabilities' },
  liability_non_current:{ section: 'liabilities',group: 'non_current_liab',  label: 'Plus Non-current Liabilities' },
  equity:               { section: 'equity',     group: 'capital_other',     label: 'Equity' },
  equity_unaffected:    { section: 'equity',     group: 'retained_prev',     label: 'Previous Years Retained Earnings' },
};

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

  // Per-period accumulator: byKey[`code|name|type`] = { ...meta, values: PeriodValues }
  type Acc = { code: string; name: string; account_type: string; values: PeriodValues };
  const acc = new Map<string, Acc>();

  // Seed snapshot for any period where we use opening-balance mode.
  for (const p of args.periods) {
    if (p.toDate >= OPENING_BALANCE_DATE) {
      for (const op of FMPLUS_OPENING_BALANCES_2026_02) {
        const k = `${op.code}|${op.name}|${op.account_type}`;
        let row = acc.get(k);
        if (!row) {
          row = { code: op.code, name: op.name, account_type: op.account_type, values: {} };
          acc.set(k, row);
        }
        addToValues(row.values, p.key, op.opening_raw);
      }
    }
  }

  // For each period >= OPENING_BALANCE_DATE, sum deltas after the seed date.
  // For each period <  OPENING_BALANCE_DATE, sum cumulative through period.toDate
  // (no seed available — historical pre-snapshot data may be incomplete).
  for (const p of args.periods) {
    const useSeed = p.toDate >= OPENING_BALANCE_DATE;
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      let q = sb
        .from('odoo_move_lines')
        .select('id, balance, odoo_accounts!inner(code, name, account_type)')
        .lte('date', p.toDate)
        .in('company_id', args.scope.companyIds)
        .eq('parent_state', 'posted')
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (useSeed) {
        // Only count deltas after the seed date.
        q = q.gt('date', OPENING_BALANCE_DATE);
      }
      const { data, error } = await q;
      if (error) throw new Error(`buildFmplusBalanceSheet: ${error.message}`);
      const rows = (data as Array<{
        balance: number;
        odoo_accounts: { code: string|null; name: string; account_type: string|null } | null;
      }>) || [];
      if (rows.length === 0) break;
      for (const row of rows) {
        if (!row.odoo_accounts) continue;
        const code = row.odoo_accounts.code || '';
        const name = row.odoo_accounts.name || '';
        const at   = row.odoo_accounts.account_type || '';
        const k = `${code}|${name}|${at}`;
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

  // Pull current-FY P&L net per period to derive Current Year Unallocated Earnings.
  // (Same logic as Beithady's BS — debit-credit sum of P&L account types.)
  const PNL_TYPES = new Set(['income', 'income_other', 'expense', 'expense_direct_cost', 'expense_depreciation']);
  const currentYearNet: PeriodValues = {};
  for (const p of args.periods) {
    const fyStart = `${p.toDate.slice(0, 4)}-01-01`;
    const PAGE = 1000;
    let offset = 0;
    let net = 0;
    while (true) {
      const { data, error } = await sb
        .from('odoo_move_lines')
        .select('id, balance, odoo_accounts!inner(account_type)')
        .gte('date', fyStart)
        .lte('date', p.toDate)
        .in('company_id', args.scope.companyIds)
        .eq('parent_state', 'posted')
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`buildFmplusBalanceSheet (FY): ${error.message}`);
      const rows = (data as Array<{ balance: number; odoo_accounts: { account_type: string|null } | null }>) || [];
      if (rows.length === 0) break;
      for (const row of rows) {
        const at = row.odoo_accounts?.account_type || '';
        if (PNL_TYPES.has(at)) net += Number(row.balance) || 0;
      }
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
    currentYearNet[p.key] = net;
  }

  // Group leaves into BS groups
  const groupsBySection: Record<'assets'|'liabilities'|'equity', Map<string, BalanceSheetGroup>> = {
    assets: new Map(), liabilities: new Map(), equity: new Map(),
  };
  let prevYearsRaw: PeriodValues = {};

  for (const r of acc.values()) {
    const cls = BS_GROUP_LABEL_BY_TYPE[r.account_type];
    if (!cls) continue; // Skip unknown account_types

    if (cls.group === 'retained_prev') {
      // Aggregate into Previous Years synthetic row
      for (const [pk, v] of Object.entries(r.values)) {
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
    const leaf: BalanceSheetLeaf = { code: r.code, name: r.name, account_type: r.account_type, values: r.values };
    g.accounts.push(leaf);
    for (const [pk, v] of Object.entries(r.values)) {
      addToValues(g.totals, pk, v);
    }
  }

  // Build synthetic Retained Earnings group (Current Year + Previous Years)
  const retainedGroup: BalanceSheetGroup = {
    key: 'retained_earnings',
    label: 'Retained Earnings',
    totals: {},
    synthetic: true,
    accounts: [
      { code: '', name: 'Current Year Unallocated Earnings',  account_type: 'derived', values: {} },
      { code: '', name: 'Previous Years Unallocated Earnings', account_type: 'derived', values: {} },
    ],
  };
  for (const p of args.periods) {
    // Display flips signs: equity is credit-normal, so display = -raw
    const cy = -(currentYearNet[p.key] || 0);
    const py = -(prevYearsRaw[p.key]   || 0);
    retainedGroup.accounts[0].values[p.key] = cy;
    retainedGroup.accounts[1].values[p.key] = py;
    retainedGroup.totals[p.key] = cy + py;
  }
  if (Object.values(retainedGroup.totals).some(v => Math.abs(v) > 0.005)) {
    groupsBySection.equity.set('retained_earnings', retainedGroup);
  }

  // Flip liabilities + equity (other than synthetic retained which is already display-space)
  for (const g of groupsBySection.liabilities.values()) {
    g.totals = Object.fromEntries(Object.entries(g.totals).map(([k, v]) => [k, -v]));
    g.accounts = g.accounts.map(a => ({ ...a, values: Object.fromEntries(Object.entries(a.values).map(([k, v]) => [k, -v])) }));
  }
  for (const g of groupsBySection.equity.values()) {
    if (g.synthetic) continue;
    g.totals = Object.fromEntries(Object.entries(g.totals).map(([k, v]) => [k, -v]));
    g.accounts = g.accounts.map(a => ({ ...a, values: Object.fromEntries(Object.entries(a.values).map(([k, v]) => [k, -v])) }));
  }

  // Stuff into result, computing section totals
  const stuff = (sec: BalanceSheetSection, groups: BalanceSheetGroup[]) => {
    sec.groups = groups.filter(g => Object.values(g.totals).some(v => Math.abs(v) > 0.005));
    for (const g of sec.groups) {
      for (const [pk, v] of Object.entries(g.totals)) addToValues(sec.totals, pk, v);
    }
  };
  stuff(result.assets,      Array.from(groupsBySection.assets.values()));
  stuff(result.liabilities, Array.from(groupsBySection.liabilities.values()));
  stuff(result.equity,      Array.from(groupsBySection.equity.values()));

  for (const p of args.periods) {
    result.liabPlusEquity[p.key] = (result.liabilities.totals[p.key] || 0) + (result.equity.totals[p.key] || 0);
    result.delta[p.key] = (result.assets.totals[p.key] || 0) - result.liabPlusEquity[p.key];
    result.balanced[p.key] = Math.abs(result.delta[p.key]) < 1;
  }

  return result;
}
```

- [ ] **Step 10.3: Run — confirm pass**

```bash
npm run test -- src/lib/fmplus/financials.test.ts
```

Expected: all P&L tests still pass + the new BS test passes.

- [ ] **Step 10.4: Commit**

```bash
git add src/lib/fmplus/financials.ts src/lib/fmplus/financials.test.ts
git commit -m "feat(fmplus): buildFmplusBalanceSheet with opening-balance seed

Mirrors the Excel BS hierarchy. Seeds from FMPLUS_OPENING_BALANCES_2026_02
when asof >= 2026-02-28; sums move-line deltas after the seed date.
Derives Current Year Unallocated Earnings from current-FY P&L net.
Multi-period support — N snapshot columns from one call.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11: Build Dashboard (library)

Aggregates the data the dashboard tab needs: KPIs (with sparklines), revenue/cost mix, margin-by-service, 12-month trend, top-10 active projects.

**Files:**
- Create: `src/lib/fmplus/dashboard.ts`

- [ ] **Step 11.1: Implement**

```typescript
// src/lib/fmplus/dashboard.ts
import { supabaseAdmin } from '../supabase';
import { buildFmplusPnl } from './financials';
import { resolvePeriodSeries } from './period-series';
import type { Granularity, Period, Scope, DashboardReport, DashboardKpi, ServiceKey } from './types';

const SERVICE_LABEL: Record<ServiceKey, string> = {
  hk: 'Housekeeping', mep: 'MEP', security: 'Security', landscape: 'Landscape',
  pest: 'Pest Control', waste: 'Waste Management', paid: 'Paid Services', vo: 'Variation Order',
};

function pctChange(curr: number, prior: number): number {
  if (!prior || prior === 0) return 0;
  return ((curr - prior) / Math.abs(prior)) * 100;
}

export async function buildFmplusDashboard(args: {
  granularity: Granularity;
  asof: string;
  scope: Scope;
}): Promise<DashboardReport> {
  // Trend window: current + 11 prior periods, single round-trip via the lib P&L for trend chart + sparklines.
  const periods = resolvePeriodSeries(args.granularity, 12, args.asof);
  const pnl = await buildFmplusPnl({ periods, scope: args.scope });

  const current = periods[0];
  const prior = periods[1] || periods[0];
  const sparkOf = (vals: Record<string, number>) =>
    periods.slice(0, 6).map(p => vals[p.key] || 0).reverse(); // oldest→newest for chart

  const kpis = {
    revenue:      kpi('revenue',      pnl, current, prior),
    grossProfit:  kpiSubtotal('gross_profit', pnl, current, prior, sparkOf),
    ebitda:       kpiSubtotal('ebitda', pnl, current, prior, sparkOf),
    netProfit:    kpiSubtotal('net_profit', pnl, current, prior, sparkOf),
  };

  function kpi(secKey: 'revenue', pnl: Awaited<ReturnType<typeof buildFmplusPnl>>, c: Period, p: Period): DashboardKpi {
    const totals = pnl.sections[secKey].totals;
    return {
      current: totals[c.key] || 0,
      prior: totals[p.key] || 0,
      deltaPct: pctChange(totals[c.key] || 0, totals[p.key] || 0),
      sparkline: periods.slice(0, 6).map(pp => totals[pp.key] || 0).reverse(),
    };
  }
  function kpiSubtotal(
    key: 'gross_profit' | 'ebitda' | 'net_profit',
    pnl: Awaited<ReturnType<typeof buildFmplusPnl>>,
    c: Period, p: Period,
    spark: (v: Record<string, number>) => number[]
  ): DashboardKpi {
    const totals = pnl.subtotals[key];
    return {
      current: totals[c.key] || 0,
      prior:   totals[p.key] || 0,
      deltaPct: pctChange(totals[c.key] || 0, totals[p.key] || 0),
      sparkline: spark(totals),
    };
  }

  // Revenue mix: per-service revenue from revenue.subgroups[service_revenue]
  const svcRev = pnl.sections.revenue.subgroups.find(g => g.key === 'service_revenue');
  const totalRev = pnl.sections.revenue.totals[current.key] || 0;
  const revenueMix = (svcRev?.leaves || []).map(leaf => {
    // The leaf's classification gives the service key; re-derive
    const v = leaf.values[current.key] || 0;
    return { service: 'other' as const, label: leaf.name, value: v, pct: totalRev ? (v / totalRev) * 100 : 0 };
  });

  // Cost mix: per-service cost
  const totalCost = pnl.sections.cost_of_revenue.totals[current.key] || 0;
  const costMix = (pnl.sections.cost_of_revenue.serviceLines || []).map(svc => ({
    service: svc.service,
    label: SERVICE_LABEL[svc.service],
    value: svc.totals[current.key] || 0,
    pct: totalCost ? ((svc.totals[current.key] || 0) / totalCost) * 100 : 0,
  })).sort((a, b) => b.value - a.value);

  // Gross margin by service (from pnl.sections.cost_of_revenue.serviceLines[].grossMarginPct)
  const marginByService = (pnl.sections.cost_of_revenue.serviceLines || []).map(svc => ({
    service: svc.service,
    label: SERVICE_LABEL[svc.service],
    pct: svc.grossMarginPct[current.key] || 0,
    revenue: 0, // optional fill
    cost:    svc.totals[current.key] || 0,
  })).sort((a, b) => b.pct - a.pct);

  // 12-month trend
  const trend = periods.map(p => ({
    period: p,
    revenue:     pnl.sections.revenue.totals[p.key] || 0,
    grossProfit: pnl.subtotals.gross_profit[p.key]  || 0,
    ebitda:      pnl.subtotals.ebitda[p.key]        || 0,
    netProfit:   pnl.subtotals.net_profit[p.key]    || 0,
  })).reverse(); // oldest→newest for chart

  // Top-10 active projects: query odoo_move_line_analytics for the current period
  const sb = supabaseAdmin();
  const { data: topRows } = await sb.rpc('fmplus_active_accounts', {
    p_plan_id: 0,                                    // 0 = all plans (caller can extend RPC to honor)
    p_from: current.fromDate,
    p_to: current.toDate,
    p_company_ids: args.scope.companyIds,
  });
  // If the RPC doesn't currently support plan_id=0 → all-plans, fetch via direct join.
  let topProjects: DashboardReport['topProjects'] = [];
  if (Array.isArray(topRows) && topRows.length > 0) {
    topProjects = (topRows as Array<{ account_id: number; name: string; abs_balance: number }>)
      .slice(0, 10)
      .map(r => ({ accountId: r.account_id, name: r.name, planName: '', absBalance: Number(r.abs_balance) || 0 }));
  } else {
    // Fallback: direct query
    const { data: fb } = await sb
      .from('odoo_move_line_analytics')
      .select('analytic_account_id, odoo_analytic_accounts!inner(name, plan_id), odoo_move_lines!inner(balance, company_id, date, parent_state)')
      .in('odoo_move_lines.company_id', args.scope.companyIds)
      .eq('odoo_move_lines.parent_state', 'posted')
      .gte('odoo_move_lines.date', current.fromDate)
      .lte('odoo_move_lines.date', current.toDate)
      .limit(5000);
    const agg = new Map<number, { name: string; abs: number }>();
    for (const row of (fb as unknown as Array<{
      analytic_account_id: number;
      odoo_analytic_accounts: { name: string };
      odoo_move_lines: { balance: number };
    }>) || []) {
      const e = agg.get(row.analytic_account_id) || { name: row.odoo_analytic_accounts.name, abs: 0 };
      e.abs += Math.abs(Number(row.odoo_move_lines.balance) || 0);
      agg.set(row.analytic_account_id, e);
    }
    topProjects = Array.from(agg.entries())
      .map(([accountId, v]) => ({ accountId, name: v.name, planName: '', absBalance: v.abs }))
      .sort((a, b) => b.absBalance - a.absBalance)
      .slice(0, 10);
  }

  return {
    periods, scope: args.scope,
    kpis, revenueMix, costMix, marginByService, trend, topProjects,
  };
}
```

- [ ] **Step 11.2: Manual smoke (no unit test — composition over already-tested pieces)**

```bash
npx tsx -e "
import('./src/lib/fmplus/dashboard.ts').then(async m => {
  const r = await m.buildFmplusDashboard({
    granularity: 'monthly',
    asof: '2026-02',
    scope: { mode: 'trend', companyIds: [<FMPLUS_ID>], includeDrafts: true, withDep: true }
  });
  console.log('KPIs:', r.kpis);
  console.log('Trend points:', r.trend.length);
  console.log('Top projects:', r.topProjects.slice(0, 3));
});
"
```

Expected: prints non-zero KPIs, 12 trend points, top-3 projects.

- [ ] **Step 11.3: Commit**

```bash
git add src/lib/fmplus/dashboard.ts
git commit -m "feat(fmplus): buildFmplusDashboard aggregator

Composes buildFmplusPnl over a trailing 12-period window to derive:
- KPIs (Revenue/GP/EBITDA/NP) with vs-prior delta% + 6-period sparklines
- Revenue mix + Cost mix by service line
- Gross margin by service line, sorted desc (most-actionable chart)
- 12-period trend (oldest->newest for chart axis)
- Top-10 active projects from odoo_move_line_analytics

Single round-trip via the existing pnl_aggregated_multiperiod RPC
plus a bounded analytics fallback query for top projects.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 12: Active-accounts API route

Picker auto-prune endpoint. GET, returns JSON, takes `(plan_id, from, to)`.

**Files:**
- Create: `src/app/api/fmplus/active-accounts/route.ts`

- [ ] **Step 12.1: Write the route**

```typescript
// src/app/api/fmplus/active-accounts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getFinancialsCompanyIds } from '@/lib/run-odoo-financial-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const planId = Number(sp.get('plan_id'));
  const from = sp.get('from');
  const to = sp.get('to');
  if (!Number.isFinite(planId) || !from || !to) {
    return NextResponse.json({ ok: false, error: 'plan_id, from, to required' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ ok: false, error: 'from/to must be YYYY-MM-DD' }, { status: 400 });
  }

  const companyIds = await getFinancialsCompanyIds();
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('fmplus_active_accounts', {
    p_plan_id: planId,
    p_from: from,
    p_to: to,
    p_company_ids: companyIds,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    accounts: (data as Array<{ account_id: number; name: string; abs_balance: number }>) || [],
  });
}
```

- [ ] **Step 12.2: Smoke-test with curl**

```bash
npm run dev &
sleep 5
PLAN_ID=$(curl -s "http://localhost:3000/api/odoo/sync-financials?phase=help" \
  -H "Authorization: Bearer $CRON_SECRET" | grep -o "FMPLUS_PLAN_ID" || echo "1")
curl "http://localhost:3000/api/fmplus/active-accounts?plan_id=$PLAN_ID&from=2026-02-01&to=2026-02-28"
```

Expected: `{ ok: true, accounts: [...] }`.

- [ ] **Step 12.3: Commit**

```bash
git add src/app/api/fmplus/active-accounts/route.ts
git commit -m "feat(fmplus): /api/fmplus/active-accounts route

GET endpoint that wraps the fmplus_active_accounts RPC for the
AccountPicker auto-prune. Validates plan_id + date params, calls
getFinancialsCompanyIds(), returns { ok, accounts }.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 13: FMPLUS module landing page

A simple landing page at `/fmplus` with cards for sub-modules. Only "Financials" is wired in v1; the rest are placeholder cards (greyed out).

**Files:**
- Create: `src/app/fmplus/page.tsx`

- [ ] **Step 13.1: Implement**

```tsx
// src/app/fmplus/page.tsx
import Link from 'next/link';
import { Building2, BarChart3, ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';

export const dynamic = 'force-dynamic';

export default function FmplusLandingPage() {
  return (
    <>
      <TopNav>
        <span>FMPLUS</span>
      </TopNav>
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-amber-700 font-medium flex items-center gap-1.5">
            <Building2 size={13} />
            FMPLUS Property &amp; Facility Management
          </p>
          <h1 className="text-3xl font-bold tracking-tight mt-1">FMPLUS</h1>
          <p className="text-sm text-slate-500 mt-2 max-w-xl">
            Back-office operations + Odoo tenant host. Lime Investments subsidiary.
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/fmplus/financials"
            className="ix-card p-5 hover:border-amber-300 hover:shadow-md transition group"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <BarChart3 size={20} className="text-amber-700" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold flex items-center gap-1">
                  Financials
                  <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition" />
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  P&amp;L · Balance Sheet · Dashboard. Pulled live from Odoo.
                </p>
              </div>
            </div>
          </Link>

          <div className="ix-card p-5 opacity-50 cursor-not-allowed">
            <h2 className="font-semibold text-slate-500">Operations</h2>
            <p className="text-xs text-slate-400 mt-1">Coming soon.</p>
          </div>
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 13.2: Smoke**

```bash
npm run dev
# Open http://localhost:3000/fmplus
```

Expected: amber-themed landing with one active "Financials" card. Click navigates to `/fmplus/financials` (404 until Task 14, that's fine).

- [ ] **Step 13.3: Commit**

```bash
git add src/app/fmplus/page.tsx
git commit -m "feat(fmplus): module landing page at /fmplus

Cards for sub-modules. Only Financials wired in v1; future
Operations / Contracts cards greyed out as placeholders.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 14: Financials shell + URL state

The 3-tab shell at `/fmplus/financials`. Server component reads URL params, calls the right lib function per active tab, hands off to renderer components.

**Files:**
- Create: `src/app/fmplus/financials/page.tsx`

- [ ] **Step 14.1: Implement**

```tsx
// src/app/fmplus/financials/page.tsx
import Link from 'next/link';
import { ChevronRight, BarChart3, Briefcase, Landmark } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { resolvePeriodSeries } from '@/lib/fmplus/period-series';
import { buildFmplusPnl, buildFmplusBalanceSheet } from '@/lib/fmplus/financials';
import { buildFmplusDashboard } from '@/lib/fmplus/dashboard';
import { discoverFmplusCompanyId } from '@/lib/fmplus/discover-company';
import { FilterBar } from './_components/FilterBar';
import { PnlTable } from './_components/PnlTable';
import { BalanceSheetTable } from './_components/BalanceSheetTable';
import { Dashboard } from './_components/Dashboard';
import type { Granularity, ScopeMode, Scope } from '@/lib/fmplus/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Search = {
  view?: 'dashboard' | 'pnl' | 'balance_sheet';
  granularity?: Granularity;
  periods?: string;
  asof?: string;
  mode?: ScopeMode;
  plans?: string;
  plan?: string;
  accounts?: string;
  with_dep?: string;
  include_drafts?: string;
};

function parseInt0(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

export default async function FinancialsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const view = sp.view || 'dashboard';
  const granularity: Granularity =
    sp.granularity === 'quarterly' || sp.granularity === 'yearly' ? sp.granularity : 'monthly';
  const periods = parseInt0(sp.periods, 3);
  const asof = sp.asof || defaultAsof(granularity);
  const mode: ScopeMode =
    sp.mode === 'plans' || sp.mode === 'accounts' ? sp.mode : 'trend';
  const withDep = sp.with_dep !== '0';
  const includeDrafts = sp.include_drafts !== '0';

  const fmplusCompanyId = await discoverFmplusCompanyId();
  const periodSeries = resolvePeriodSeries(granularity, periods, asof);

  const planIds = sp.plans
    ? sp.plans.split(',').map(Number).filter(Number.isFinite)
    : undefined;
  const planId = sp.plan ? Number(sp.plan) : undefined;
  const accountIds = sp.accounts
    ? sp.accounts.split(',').map(Number).filter(Number.isFinite)
    : undefined;

  const scope: Scope = {
    mode,
    companyIds: [fmplusCompanyId],
    planIds: mode === 'plans' ? planIds : undefined,
    planId: mode === 'accounts' ? planId : undefined,
    accountIds: mode === 'accounts' ? accountIds : undefined,
    includeDrafts,
    withDep,
  };

  const buildHref = (overrides: Partial<Search>) => {
    const merged: Record<string, string> = {
      view, granularity, periods: String(periods), asof, mode,
      ...(planIds ? { plans: planIds.join(',') } : {}),
      ...(planId ? { plan: String(planId) } : {}),
      ...(accountIds ? { accounts: accountIds.join(',') } : {}),
      with_dep: withDep ? '1' : '0',
      include_drafts: includeDrafts ? '1' : '0',
      ...Object.fromEntries(
        Object.entries(overrides).map(([k, v]) => [k, String(v ?? '')])
      ),
    };
    const qs = Object.entries(merged)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return qs ? `?${qs}` : '';
  };

  return (
    <>
      <TopNav>
        <Link href="/fmplus" className="ix-link">FMPLUS</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Financials</span>
      </TopNav>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-amber-700 font-medium">FMPLUS · Financials</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Financials Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">FMPLUS Property &amp; Facility Management — pulled live from Odoo.</p>
        </header>

        {/* Tab nav */}
        <nav className="border-b border-slate-200 flex gap-1">
          {(
            [
              { id: 'dashboard',     label: 'Dashboard',     Icon: BarChart3 },
              { id: 'pnl',           label: 'Profit & Loss', Icon: Briefcase },
              { id: 'balance_sheet', label: 'Balance Sheet', Icon: Landmark },
            ] as const
          ).map(t => {
            const active = view === t.id;
            return (
              <Link
                key={t.id}
                href={buildHref({ view: t.id })}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-1.5 ${
                  active
                    ? 'border-amber-500 text-amber-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <t.Icon size={14} />
                {t.label}
              </Link>
            );
          })}
        </nav>

        <FilterBar
          view={view}
          granularity={granularity}
          periods={periods}
          asof={asof}
          mode={mode}
          planIds={planIds}
          planId={planId}
          accountIds={accountIds}
          withDep={withDep}
          includeDrafts={includeDrafts}
          buildHref={buildHref}
        />

        {view === 'dashboard' && (
          <Dashboard
            data={await buildFmplusDashboard({ granularity, asof, scope })}
          />
        )}
        {view === 'pnl' && (
          <PnlTable
            report={await buildFmplusPnl({ periods: periodSeries, scope })}
          />
        )}
        {view === 'balance_sheet' && (
          <BalanceSheetTable
            report={await buildFmplusBalanceSheet({ periods: periodSeries, scope })}
          />
        )}
      </main>
    </>
  );
}

function defaultAsof(g: Granularity): string {
  const now = new Date();
  const yy = now.getUTCFullYear();
  const mm = now.getUTCMonth() + 1;
  if (g === 'monthly')   return `${yy}-${String(mm).padStart(2, '0')}`;
  if (g === 'quarterly') return `${yy}-Q${Math.floor((mm - 1) / 3) + 1}`;
  return String(yy);
}
```

- [ ] **Step 14.2: Stub the renderer components so the page compiles**

Create three placeholder files (will be filled in Tasks 17-19):

```tsx
// src/app/fmplus/financials/_components/PnlTable.tsx
import type { PnlReport } from '@/lib/fmplus/types';
export function PnlTable({ report }: { report: PnlReport }) {
  return <pre className="text-xs">{JSON.stringify(report, null, 2)}</pre>;
}
```

```tsx
// src/app/fmplus/financials/_components/BalanceSheetTable.tsx
import type { BalanceSheetReport } from '@/lib/fmplus/types';
export function BalanceSheetTable({ report }: { report: BalanceSheetReport }) {
  return <pre className="text-xs">{JSON.stringify(report, null, 2)}</pre>;
}
```

```tsx
// src/app/fmplus/financials/_components/Dashboard.tsx
import type { DashboardReport } from '@/lib/fmplus/types';
export function Dashboard({ data }: { data: DashboardReport }) {
  return <pre className="text-xs">{JSON.stringify(data, null, 2)}</pre>;
}
```

(FilterBar will be the real one in Task 15.)

- [ ] **Step 14.3: Stub FilterBar**

```tsx
// src/app/fmplus/financials/_components/FilterBar.tsx
import type { Granularity, ScopeMode } from '@/lib/fmplus/types';
export function FilterBar(props: {
  view: 'dashboard' | 'pnl' | 'balance_sheet';
  granularity: Granularity;
  periods: number;
  asof: string;
  mode: ScopeMode;
  planIds?: number[];
  planId?: number;
  accountIds?: number[];
  withDep: boolean;
  includeDrafts: boolean;
  buildHref: (overrides: Record<string, string | undefined>) => string;
}) {
  return (
    <div className="ix-card p-3 text-xs text-slate-500">
      Filter bar stub — granularity={props.granularity} · periods={props.periods} · asof={props.asof} · mode={props.mode}
    </div>
  );
}
```

- [ ] **Step 14.4: Smoke**

```bash
# Visit:
http://localhost:3000/fmplus/financials
http://localhost:3000/fmplus/financials?view=pnl
http://localhost:3000/fmplus/financials?view=balance_sheet
http://localhost:3000/fmplus/financials?view=pnl&granularity=monthly&periods=3&asof=2026-02
```

Expected: page renders for all three tabs with the JSON-dumped report from each lib function. The data should look right for Feb 2026 (revenue ~38.5M, etc.).

- [ ] **Step 14.5: Commit**

```bash
git add src/app/fmplus/financials/page.tsx src/app/fmplus/financials/_components/
git commit -m "feat(fmplus): financials sub-module shell with 3 tabs

Server-rendered shell at /fmplus/financials. Reads URL params for
view/granularity/periods/asof/mode/with_dep/include_drafts.
Discovers FMPLUS company id, calls buildFmplusPnl / buildFmplusBalanceSheet
/ buildFmplusDashboard per active tab, hands off to renderer components.

Tab nav + filter bar + renderers are stubs in this commit; filled in
Tasks 15-19.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 15: Filter bar + period controls + mode toggle

Replace the FilterBar stub with the real UI. Sticky, persists across tabs. Granularity tabs · period count selector · asof picker · mode toggle · plans/accounts pickers · drafts/dep toggles.

**Files:**
- Replace: `src/app/fmplus/financials/_components/FilterBar.tsx`
- Create: `src/app/fmplus/financials/_components/PeriodControls.tsx`

- [ ] **Step 15.1: Build PeriodControls (client)**

```tsx
// src/app/fmplus/financials/_components/PeriodControls.tsx
'use client';

import Link, { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';

export function PillLink({
  href, label, active,
}: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href}>
      <PillInner label={label} active={active} />
    </Link>
  );
}

function PillInner({ label, active }: { label: string; active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition whitespace-nowrap ${
        active
          ? 'bg-amber-600 text-white shadow-sm'
          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
      } ${pending ? 'opacity-70' : ''}`}
    >
      {pending && <Loader2 size={13} className="animate-spin" />}
      {label}
    </span>
  );
}
```

- [ ] **Step 15.2: Build the real FilterBar**

```tsx
// src/app/fmplus/financials/_components/FilterBar.tsx
import { Calendar, Layers, FileSpreadsheet } from 'lucide-react';
import { PillLink } from './PeriodControls';
import { AccountPicker } from './AccountPicker';
import type { Granularity, ScopeMode } from '@/lib/fmplus/types';

const GRANULARITIES: Array<{ id: Granularity; label: string }> = [
  { id: 'monthly',   label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yearly',    label: 'Yearly' },
];

const PERIOD_COUNTS = [1, 3, 6, 12];

const MODES: Array<{ id: ScopeMode; label: string }> = [
  { id: 'trend',    label: 'Period Trend' },
  { id: 'plans',    label: 'Plans Compare' },
  { id: 'accounts', label: 'Accounts Compare' },
];

export function FilterBar(props: {
  view: 'dashboard' | 'pnl' | 'balance_sheet';
  granularity: Granularity;
  periods: number;
  asof: string;
  mode: ScopeMode;
  planIds?: number[];
  planId?: number;
  accountIds?: number[];
  withDep: boolean;
  includeDrafts: boolean;
  buildHref: (overrides: Record<string, string | undefined>) => string;
}) {
  const isBs = props.view === 'balance_sheet';
  return (
    <section className="ix-card p-4 space-y-3 sticky top-0 z-10 bg-white">
      {/* Granularity tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-slate-500 font-medium flex items-center gap-1.5 mr-2">
          <Calendar size={13} /> Granularity
        </span>
        {GRANULARITIES.map(g => (
          <PillLink
            key={g.id}
            href={props.buildHref({ granularity: g.id, asof: '' /* reset to default for new granularity */ })}
            label={g.label}
            active={props.granularity === g.id}
          />
        ))}
      </div>

      {/* Periods + as-of */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-slate-500 font-medium mr-2">Periods</span>
        {PERIOD_COUNTS.map(n => (
          <PillLink
            key={n}
            href={props.buildHref({ periods: String(n) })}
            label={String(n)}
            active={props.periods === n}
          />
        ))}
        <span className="text-xs text-slate-500 ml-3">As of</span>
        <form action="" method="get" className="inline-flex items-center gap-1.5">
          {/* hidden fields preserve other params */}
          <input type="hidden" name="view" value={props.view} />
          <input type="hidden" name="granularity" value={props.granularity} />
          <input type="hidden" name="periods" value={String(props.periods)} />
          <input type="hidden" name="mode" value={props.mode} />
          <input type="hidden" name="with_dep" value={props.withDep ? '1' : '0'} />
          <input type="hidden" name="include_drafts" value={props.includeDrafts ? '1' : '0'} />
          <input
            type="text"
            name="asof"
            defaultValue={props.asof}
            className="ix-input w-[120px] text-sm"
            placeholder={asofPlaceholder(props.granularity)}
          />
          <button type="submit" className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs">Go</button>
        </form>
      </div>

      {/* Mode toggle (hidden on BS tab) */}
      {!isBs && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-slate-500 font-medium flex items-center gap-1.5 mr-2">
            <Layers size={13} /> Mode
          </span>
          {MODES.map(m => (
            <PillLink
              key={m.id}
              href={props.buildHref({ mode: m.id, plans: '', plan: '', accounts: '' })}
              label={m.label}
              active={props.mode === m.id}
            />
          ))}
        </div>
      )}
      {isBs && (
        <p className="text-[11px] text-slate-500 italic">
          Balance Sheet is whole-company; project scoping doesn&apos;t apply.
        </p>
      )}

      {/* Mode-specific picker */}
      {!isBs && props.mode === 'plans' && (
        <AccountPicker
          mode="plans"
          selectedPlanIds={props.planIds}
          buildHref={props.buildHref}
        />
      )}
      {!isBs && props.mode === 'accounts' && (
        <AccountPicker
          mode="accounts"
          selectedPlanId={props.planId}
          selectedAccountIds={props.accountIds}
          asof={props.asof}
          granularity={props.granularity}
          buildHref={props.buildHref}
        />
      )}

      {/* Options */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 border-t border-slate-100 pt-3">
        <FileSpreadsheet size={13} className="text-slate-400" />
        <ToggleLink
          label="Include drafts"
          active={props.includeDrafts}
          href={props.buildHref({ include_drafts: props.includeDrafts ? '0' : '1' })}
        />
        <ToggleLink
          label="Show depreciation in COGS"
          active={props.withDep}
          href={props.buildHref({ with_dep: props.withDep ? '0' : '1' })}
        />
      </div>
    </section>
  );
}

function asofPlaceholder(g: Granularity): string {
  if (g === 'monthly')   return 'YYYY-MM';
  if (g === 'quarterly') return 'YYYY-Q1';
  return 'YYYY';
}

function ToggleLink({ label, active, href }: { label: string; active: boolean; href: string }) {
  // Plain anchor — simple GET link toggle.
  return (
    <a
      href={href}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
        active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'
      }`}
    >
      <span className={`w-3 h-3 rounded-sm border ${active ? 'bg-emerald-500 border-emerald-600' : 'bg-white border-slate-300'}`}>
        {active && <span className="block text-white text-[9px] leading-3 text-center">✓</span>}
      </span>
      {label}
    </a>
  );
}
```

- [ ] **Step 15.3: Smoke**

Visit `/fmplus/financials` and verify the filter bar renders with all controls. Click granularity, period count, mode pills — URL should update and page reload with new state.

- [ ] **Step 15.4: Commit**

```bash
git add src/app/fmplus/financials/_components/FilterBar.tsx src/app/fmplus/financials/_components/PeriodControls.tsx
git commit -m "feat(fmplus): financials filter bar UI

Sticky filter bar with granularity tabs (Monthly/Quarterly/Yearly),
period-count pills (1/3/6/12), as-of text input with placeholder
per granularity, mode toggle (Period Trend / Plans / Accounts —
hidden on BS tab with explanatory note), and Include drafts /
Show dep-in-COGS toggle pills.

PeriodControls.tsx: client-only PillLink with useLinkStatus
spinner. AccountPicker stubbed for now (Task 16).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 16: Account picker (with auto-prune)

Two modes:
- **plans** — flat checklist of all plans (4 items for FMPLUS).
- **accounts** — single-select plan dropdown + multi-select account checklist auto-pruned to active accounts in the selected period (fetched via `/api/fmplus/active-accounts`).

**Files:**
- Create: `src/app/fmplus/financials/_components/AccountPicker.tsx`

- [ ] **Step 16.1: Implement (client component)**

```tsx
// src/app/fmplus/financials/_components/AccountPicker.tsx
'use client';

import { useEffect, useState } from 'react';

type Plan = { id: number; name: string };

type ActiveAccount = { account_id: number; name: string; abs_balance: number };

export function AccountPicker(props: {
  mode: 'plans';
  selectedPlanIds?: number[];
  buildHref: (o: Record<string, string | undefined>) => string;
} | {
  mode: 'accounts';
  selectedPlanId?: number;
  selectedAccountIds?: number[];
  asof: string;
  granularity: 'monthly' | 'quarterly' | 'yearly';
  buildHref: (o: Record<string, string | undefined>) => string;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [accounts, setAccounts] = useState<ActiveAccount[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch plans once
  useEffect(() => {
    fetch('/api/fmplus/plans').then(r => r.json()).then(j => {
      if (Array.isArray(j.plans)) setPlans(j.plans);
    }).catch(() => {});
  }, []);

  // Fetch active accounts when plan or period changes
  useEffect(() => {
    if (props.mode !== 'accounts' || !props.selectedPlanId) return;
    setLoading(true);
    const { from, to } = asofToDateRange(props.granularity, props.asof);
    fetch(`/api/fmplus/active-accounts?plan_id=${props.selectedPlanId}&from=${from}&to=${to}`)
      .then(r => r.json())
      .then(j => { if (Array.isArray(j.accounts)) setAccounts(j.accounts); })
      .finally(() => setLoading(false));
  }, [props.mode === 'accounts' ? props.selectedPlanId : null,
      props.mode === 'accounts' ? props.asof          : null,
      props.mode === 'accounts' ? props.granularity   : null]);

  if (props.mode === 'plans') {
    const sel = new Set(props.selectedPlanIds || []);
    return (
      <div className="ix-card p-3 space-y-2 bg-amber-50/30">
        <p className="text-xs font-semibold text-amber-800">Select plans to compare side-by-side</p>
        <div className="flex flex-wrap gap-2">
          {plans.length === 0 && <span className="text-xs text-slate-400">Loading plans…</span>}
          {plans.map(p => {
            const active = sel.has(p.id);
            const next = new Set(sel);
            if (active) next.delete(p.id); else next.add(p.id);
            const nextStr = Array.from(next).join(',');
            return (
              <a
                key={p.id}
                href={props.buildHref({ plans: nextStr })}
                className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                  active ? 'bg-amber-600 text-white border-amber-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {active ? '✓ ' : ''}{p.name}
              </a>
            );
          })}
        </div>
      </div>
    );
  }

  // mode === 'accounts'
  const sel = new Set(props.selectedAccountIds || []);
  return (
    <div className="ix-card p-3 space-y-3 bg-amber-50/30">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-amber-800">Plan:</span>
        <select
          className="ix-input text-sm w-[220px]"
          value={props.selectedPlanId || ''}
          onChange={e => {
            const id = Number(e.currentTarget.value);
            window.location.href = props.buildHref({ plan: String(id), accounts: '' });
          }}
        >
          <option value="">Pick a plan…</option>
          {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {loading && <span className="text-xs text-slate-400">Loading active accounts…</span>}
      </div>

      {props.selectedPlanId && (
        <div className="flex flex-wrap gap-2">
          {accounts.length === 0 && !loading && (
            <span className="text-xs text-slate-400">No active accounts for this plan in the selected period.</span>
          )}
          {accounts.map(a => {
            const active = sel.has(a.account_id);
            const next = new Set(sel);
            if (active) next.delete(a.account_id); else next.add(a.account_id);
            const nextStr = Array.from(next).join(',');
            return (
              <a
                key={a.account_id}
                href={props.buildHref({ accounts: nextStr })}
                className={`px-2 py-1 rounded text-xs border transition ${
                  active ? 'bg-amber-600 text-white border-amber-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                title={`abs balance: ${Math.round(a.abs_balance).toLocaleString()}`}
              >
                {active ? '✓ ' : ''}{a.name}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function asofToDateRange(granularity: 'monthly'|'quarterly'|'yearly', asof: string): { from: string; to: string } {
  // Light parser — keep in sync with period-series.ts.
  if (granularity === 'monthly') {
    const m = /^(\d{4})-(\d{2})$/.exec(asof);
    if (m) {
      const yy = Number(m[1]);
      const mm = Number(m[2]);
      const last = new Date(Date.UTC(yy, mm, 0));
      return { from: `${yy}-${String(mm).padStart(2, '0')}-01`, to: `${yy}-${String(mm).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}` };
    }
  }
  if (granularity === 'quarterly') {
    const m = /^(\d{4})-Q([1-4])$/.exec(asof);
    if (m) {
      const yy = Number(m[1]);
      const q = Number(m[2]);
      const start = (q - 1) * 3;
      const last = new Date(Date.UTC(yy, start + 3, 0));
      return { from: `${yy}-${String(start + 1).padStart(2, '0')}-01`, to: `${yy}-${String(start + 3).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}` };
    }
  }
  if (granularity === 'yearly') {
    const m = /^(\d{4})$/.exec(asof);
    if (m) return { from: `${m[1]}-01-01`, to: `${m[1]}-12-31` };
  }
  // Fallback: today's month
  const now = new Date();
  return {
    from: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`,
    to: now.toISOString().slice(0, 10),
  };
}
```

- [ ] **Step 16.2: Add `/api/fmplus/plans` route**

```typescript
// src/app/api/fmplus/plans/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { discoverFmplusCompanyId } from '@/lib/fmplus/discover-company';

export const dynamic = 'force-dynamic';

export async function GET() {
  const fmplusId = await discoverFmplusCompanyId();
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('odoo_analytic_plans')
    .select('id, name, company_ids')
    .order('name');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const plans = (data as Array<{ id: number; name: string; company_ids: number[] }>)
    .filter(p => Array.isArray(p.company_ids) && p.company_ids.includes(fmplusId))
    .map(p => ({ id: p.id, name: p.name }));
  return NextResponse.json({ ok: true, plans });
}
```

- [ ] **Step 16.3: Smoke**

Visit `/fmplus/financials?mode=plans` — checklist of FMPLUS plans should appear.

Visit `/fmplus/financials?mode=accounts&plan=<plan_id>&asof=2026-02` — pick a plan, see only active accounts with non-zero balance in Feb 2026.

- [ ] **Step 16.4: Commit**

```bash
git add src/app/fmplus/financials/_components/AccountPicker.tsx src/app/api/fmplus/plans/route.ts
git commit -m "feat(fmplus): account picker with active-only auto-prune

Two modes: plans (flat checklist of FMPLUS analytic plans) and
accounts (single-select plan + multi-select active-only accounts
in the selected period). Picker calls /api/fmplus/active-accounts
which wraps the fmplus_active_accounts RPC.

New /api/fmplus/plans endpoint returns plans whose company_ids
include the FMPLUS company (filters out Beithady/Kika plans).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 17: P&L table renderer

Replaces the JSON-dump stub with the real renderer. Multi-period columns. Per-service-line gross-margin pill. Service-line subgroups (HK/MEP/etc) → cost-category groups → leaf accounts. Subtotal rows always visible. Δ% column when periods≥2.

**Files:**
- Replace: `src/app/fmplus/financials/_components/PnlTable.tsx`

- [ ] **Step 17.1: Implement**

```tsx
// src/app/fmplus/financials/_components/PnlTable.tsx
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import type { PnlReport, Period, PeriodValues } from '@/lib/fmplus/types';

const fmt = (n: number | undefined): string => {
  const v = Number(n) || 0;
  return Math.abs(v) < 0.5 ? '0' : Math.round(v).toLocaleString('en-US');
};
const fmtSigned = (n: number | undefined): string => {
  const v = Number(n) || 0;
  if (v === 0) return '0';
  return Math.round(v).toLocaleString('en-US');
};
const pctOf = (num: number, denom: number): string =>
  !denom || denom === 0 ? '—' : `${((num / denom) * 100).toFixed(1)}%`;
const deltaPct = (curr: number, prior: number): string => {
  if (!prior || prior === 0) return '—';
  return `${(((curr - prior) / Math.abs(prior)) * 100).toFixed(1)}%`;
};

export function PnlTable({ report }: { report: PnlReport }) {
  const periods = report.periods;
  const hasMultiplePeriods = periods.length > 1;

  return (
    <div className="space-y-4">
      <NetProfitHero report={report} />
      <section className="ix-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200">
              <th className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 sticky left-0 bg-slate-50 min-w-[280px]">
                Account
              </th>
              {periods.map((p, i) => (
                <PeriodHead key={p.key} period={p} showDelta={hasMultiplePeriods && i < periods.length - 1} />
              ))}
            </tr>
          </thead>
          <tbody>
            <SectionBand label="Revenue" totals={report.sections.revenue.totals} periods={periods} prevTotals={report.sections.revenue.totals} tone="positive" />
            {report.sections.revenue.subgroups.map(sg => (
              <SubgroupRow key={sg.key} label={sg.label} totals={sg.totals} periods={periods} revenue={report.sections.revenue.totals} />
            ))}

            <SubtotalRow label="Total Revenue" values={report.sections.revenue.totals} periods={periods} revenue={report.sections.revenue.totals} tone="positive" />

            <SectionBand label="Cost of Revenue" totals={report.sections.cost_of_revenue.totals} periods={periods} prevTotals={report.sections.cost_of_revenue.totals} tone="expense" />
            {(report.sections.cost_of_revenue.serviceLines || []).map(svc => (
              <ServiceLineGroup key={svc.service} svc={svc} periods={periods} revenue={report.sections.revenue.totals} />
            ))}

            <SubtotalRow label="Gross Profit" values={report.subtotals.gross_profit} periods={periods} revenue={report.sections.revenue.totals} tone="strong" />

            <SectionBand label="General Expenses" totals={report.sections.general_expenses.totals} periods={periods} prevTotals={report.sections.general_expenses.totals} tone="expense" />
            {report.sections.general_expenses.subgroups.map(sg => (
              <SubgroupRow key={sg.key} label={sg.label} totals={sg.totals} periods={periods} revenue={report.sections.revenue.totals} />
            ))}

            <SubtotalRow label="EBITDA" values={report.subtotals.ebitda} periods={periods} revenue={report.sections.revenue.totals} tone="strong" />

            <SectionBand label="INT - TAXES - DEP" totals={report.sections.interest_tax_dep.totals} periods={periods} prevTotals={report.sections.interest_tax_dep.totals} tone="expense" />
            {report.sections.interest_tax_dep.subgroups.map(sg => (
              <SubgroupRow key={sg.key} label={sg.label} totals={sg.totals} periods={periods} revenue={report.sections.revenue.totals} />
            ))}

            <SubtotalRow label="Net Profit" values={report.subtotals.net_profit} periods={periods} revenue={report.sections.revenue.totals} tone="hero" />
          </tbody>
        </table>
      </section>

      {report.unclassified.length > 0 && <UnclassifiedPanel leaves={report.unclassified} periods={periods} />}
    </div>
  );
}

function NetProfitHero({ report }: { report: PnlReport }) {
  const cur = report.periods[0];
  const np = report.subtotals.net_profit[cur.key] || 0;
  const rev = report.sections.revenue.totals[cur.key] || 0;
  const tone = np >= 0 ? 'text-emerald-700' : 'text-rose-700';
  return (
    <div className="ix-card p-4 flex items-center justify-between flex-wrap gap-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Net Profit · {cur.label}</p>
        <p className={`text-3xl font-bold tabular-nums ${tone}`}>{fmtSigned(np)}</p>
        <p className="text-xs text-slate-500">{pctOf(np, rev)} of revenue</p>
      </div>
      <Sparkline values={report.subtotals.net_profit} periods={report.periods.slice().reverse()} />
    </div>
  );
}

function Sparkline({ values, periods }: { values: PeriodValues; periods: Period[] }) {
  const points = periods.map(p => values[p.key] || 0);
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const W = 120, H = 32;
  const xStep = W / (points.length - 1);
  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * xStep).toFixed(1)},${(H - ((v - min) / range) * H).toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} className="text-amber-500"><path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} /></svg>
  );
}

function PeriodHead({ period, showDelta }: { period: Period; showDelta: boolean }) {
  return (
    <th className="px-2 py-2 text-right text-xs font-semibold text-slate-700 min-w-[100px]" colSpan={showDelta ? 3 : 2}>
      <div>{period.label}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 font-normal mt-0.5">
        Bal · % · {showDelta && 'Δ'}
      </div>
    </th>
  );
}

function NumCells({ values, periods, revenue }: { values: PeriodValues; periods: Period[]; revenue: PeriodValues }) {
  return (
    <>
      {periods.map((p, i) => {
        const v = values[p.key] || 0;
        const r = revenue[p.key] || 0;
        const prior = i < periods.length - 1 ? (values[periods[i + 1].key] || 0) : null;
        const showDelta = prior !== null;
        return (
          <>
            <td key={`${p.key}-bal`} className="px-2 py-1.5 text-right tabular-nums">{fmtSigned(v)}</td>
            <td key={`${p.key}-pct`} className="px-2 py-1.5 text-right text-[11px] text-slate-500 tabular-nums">{pctOf(v, r)}</td>
            {showDelta && (
              <td key={`${p.key}-delta`} className="px-2 py-1.5 text-right text-[11px] tabular-nums">{deltaPct(v, prior!)}</td>
            )}
          </>
        );
      })}
    </>
  );
}

function SectionBand({ label, totals, periods, tone }: {
  label: string; totals: PeriodValues; periods: Period[]; prevTotals: PeriodValues; tone: 'positive' | 'expense';
}) {
  const bg = tone === 'positive' ? 'bg-emerald-50/60 text-emerald-800' : 'bg-slate-100 text-slate-700';
  return (
    <tr className={bg}>
      <td className="px-4 py-2 font-bold text-sm sticky left-0">{label}</td>
      <NumCells values={totals} periods={periods} revenue={totals} />
    </tr>
  );
}

function SubgroupRow({ label, totals, periods, revenue }: {
  label: string; totals: PeriodValues; periods: Period[]; revenue: PeriodValues;
}) {
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/40">
      <td className="px-8 py-1.5 text-slate-700">{label}</td>
      <NumCells values={totals} periods={periods} revenue={revenue} />
    </tr>
  );
}

function SubtotalRow({ label, values, periods, revenue, tone }: {
  label: string; values: PeriodValues; periods: Period[]; revenue: PeriodValues; tone: 'strong' | 'positive' | 'hero';
}) {
  const cls = tone === 'hero'
    ? 'bg-slate-900 text-white font-bold'
    : 'bg-slate-200 text-slate-900 font-bold';
  const Icon = tone === 'hero' ? null : (Number(values[periods[0].key]) >= 0 ? TrendingUp : TrendingDown);
  return (
    <tr className={`${cls} border-t-2 border-slate-300`}>
      <td className="px-4 py-2 sticky left-0 inline-flex items-center gap-1.5">
        {Icon && <Icon size={14} />}
        {label}
      </td>
      <NumCells values={values} periods={periods} revenue={revenue} />
    </tr>
  );
}

function ServiceLineGroup({ svc, periods, revenue }: {
  svc: import('@/lib/fmplus/types').PnlServiceLineCost;
  periods: Period[];
  revenue: PeriodValues;
}) {
  if (!svc) return null;
  // Service-line header row with gross-margin pill
  const margin = svc.grossMarginPct[periods[0].key] || 0;
  const pillTone = margin >= 20 ? 'bg-emerald-100 text-emerald-700'
                : margin >=  5 ? 'bg-amber-100 text-amber-700'
                                : 'bg-rose-100 text-rose-700';
  return (
    <>
      <tr className="bg-slate-50/80 border-t border-slate-200">
        <td className="px-6 py-1.5 font-semibold text-slate-800 sticky left-0 inline-flex items-center gap-2">
          {svc.label}
          <span className={`px-1.5 py-0.5 rounded text-[10px] tabular-nums ${pillTone}`}>{margin.toFixed(1)}% margin</span>
        </td>
        <NumCells values={svc.totals} periods={periods} revenue={revenue} />
      </tr>
      {svc.subgroups.map(sg => (
        <tr key={sg.key} className="border-t border-slate-100 hover:bg-slate-50/40">
          <td className="px-12 py-1.5 text-slate-600 text-[12.5px]">{sg.label}</td>
          <NumCells values={sg.totals} periods={periods} revenue={revenue} />
        </tr>
      ))}
    </>
  );
}

function UnclassifiedPanel({ leaves, periods }: { leaves: PnlReport['unclassified']; periods: Period[] }) {
  const totalCurrent = leaves.reduce((s, l) => s + (l.values[periods[0].key] || 0), 0);
  return (
    <section className="ix-card p-4 bg-amber-50/30 border-amber-200 space-y-2">
      <p className="text-sm font-semibold text-amber-800 inline-flex items-center gap-1.5">
        <AlertTriangle size={14} />
        Unclassified accounts ({leaves.length}) · {fmt(totalCurrent)}
      </p>
      <div className="max-h-48 overflow-y-auto">
        <table className="w-full text-xs">
          <tbody>
            {leaves.map((l, i) => (
              <tr key={`${l.code}-${i}`} className="border-t border-amber-100">
                <td className="px-2 py-1 font-mono text-amber-800">{l.code || '—'}</td>
                <td className="px-2 py-1">{l.name}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtSigned(l.values[periods[0].key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 17.2: Smoke**

Visit `/fmplus/financials?view=pnl&granularity=monthly&periods=3&asof=2026-02` and verify:
- Three columns appear (Feb / Jan / Dec 2026) with current leftmost.
- Net Profit hero card shows -716,553 ish (matches your Excel).
- Revenue total ~38.5M, Gross Profit ~5.26M, EBITDA ~808k.
- Per-service Cost of X rows show gross-margin pill (Housekeeping ~18.1% green/amber; MEP ~3.2% red).
- Δ% column appears between Feb→Jan and Jan→Dec.

**Reconciliation gate:** Net Profit and section totals must match the Excel within 1% tolerance. If they don't:
- Check the unclassified panel — are accounts misrouted by prefix?
- Check `pnl_aggregated_multiperiod` returned `parent_state` properly (drafts on/off matching the Excel "With Draft Entries").
- Verify the FMPLUS company id is the only one in scope.

- [ ] **Step 17.3: Commit**

```bash
git add src/app/fmplus/financials/_components/PnlTable.tsx
git commit -m "feat(fmplus): P&L renderer with multi-period columns

Sticky-left Account column; N period columns each rendering
balance + % of revenue + Δ% (when periods >= 2). Section bands
(Revenue green / Cost dark) frame collapsible service-line
subgroups with per-service Gross Margin pill. Subtotal rows
(Gross Profit, EBITDA, Net Profit) always visible with double-rule
borders. Net Profit hero card with sparkline. Unclassified panel
surfaces CoA drift.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 18: Balance Sheet renderer

Multi-period asof columns. Excel-mirrored hierarchy. Balanced ✓/⚠ banner.

**Files:**
- Replace: `src/app/fmplus/financials/_components/BalanceSheetTable.tsx`

- [ ] **Step 18.1: Implement**

```tsx
// src/app/fmplus/financials/_components/BalanceSheetTable.tsx
import { Landmark, CheckCircle2, AlertCircle } from 'lucide-react';
import type { BalanceSheetReport, BalanceSheetGroup, Period, PeriodValues } from '@/lib/fmplus/types';

const fmt = (n: number | undefined): string => {
  const v = Number(n) || 0;
  return Math.abs(v) < 0.5 ? '0' : Math.round(v).toLocaleString('en-US');
};

export function BalanceSheetTable({ report }: { report: BalanceSheetReport }) {
  const periods = report.periods;
  const cur = periods[0];
  const balanced = report.balanced[cur.key];
  const delta = report.delta[cur.key] || 0;
  return (
    <div className="space-y-4">
      <header className="ix-card p-4 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold inline-flex items-center gap-2">
            <Landmark size={18} className="text-amber-600" />
            Balance Sheet — as of {cur.label}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {balanced ? (
              <span className="text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle2 size={12} /> Balanced (delta &lt; 1 EGP)
              </span>
            ) : (
              <span className="text-amber-700 inline-flex items-center gap-1">
                <AlertCircle size={12} /> Unbalanced by {fmt(delta)}
              </span>
            )}
            · all amounts in EGP
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>Assets: <span className="text-slate-900 font-semibold tabular-nums">{fmt(report.assets.totals[cur.key])}</span></p>
          <p>Liab + Equity: <span className="text-slate-900 font-semibold tabular-nums">{fmt(report.liabPlusEquity[cur.key])}</span></p>
        </div>
      </header>

      <section className="ix-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200">
              <th className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 sticky left-0 bg-slate-50 min-w-[300px]">
                Account
              </th>
              {periods.map(p => (
                <th key={p.key} className="px-3 py-2 text-right text-xs font-semibold text-slate-700 min-w-[120px]">
                  as of {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SectionBand label="ASSETS" totals={report.assets.totals} periods={periods} tone="indigo" />
            {report.assets.groups.map(g => <GroupRows key={g.key} group={g} periods={periods} />)}

            <SectionBand label="LIABILITIES" totals={report.liabilities.totals} periods={periods} tone="rose" />
            {report.liabilities.groups.map(g => <GroupRows key={g.key} group={g} periods={periods} />)}

            <SectionBand label="EQUITY" totals={report.equity.totals} periods={periods} tone="amber" />
            {report.equity.groups.map(g => <GroupRows key={g.key} group={g} periods={periods} />)}

            <tr className="bg-slate-900 text-white font-bold border-t-2 border-slate-700">
              <td className="px-4 py-2 sticky left-0">LIABILITIES + EQUITY</td>
              {periods.map(p => (
                <td key={p.key} className="px-3 py-2 text-right tabular-nums">{fmt(report.liabPlusEquity[p.key])}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

function SectionBand({ label, totals, periods, tone }: {
  label: string;
  totals: PeriodValues;
  periods: Period[];
  tone: 'indigo' | 'rose' | 'amber';
}) {
  const cls = tone === 'indigo' ? 'bg-indigo-50 text-indigo-800'
            : tone === 'rose'   ? 'bg-rose-50 text-rose-800'
                                : 'bg-amber-50 text-amber-800';
  return (
    <tr className={`${cls} font-bold border-t-2 border-slate-300`}>
      <td className="px-4 py-2 uppercase text-sm tracking-wide sticky left-0">{label}</td>
      {periods.map(p => (
        <td key={p.key} className="px-3 py-2 text-right tabular-nums">{fmt(totals[p.key])}</td>
      ))}
    </tr>
  );
}

function GroupRows({ group, periods }: { group: BalanceSheetGroup; periods: Period[] }) {
  return (
    <>
      <tr className="bg-slate-50/60 border-t border-slate-100">
        <td className="px-8 py-1.5 font-semibold text-slate-800 sticky left-0 inline-flex items-center gap-2">
          {group.label}
          {group.synthetic && (
            <span className="text-[9px] px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded uppercase tracking-wide">derived</span>
          )}
        </td>
        {periods.map(p => (
          <td key={p.key} className="px-3 py-1.5 text-right tabular-nums">{fmt(group.totals[p.key])}</td>
        ))}
      </tr>
      {group.accounts.map((a, i) => (
        <tr key={`${group.key}-${a.code}-${i}`} className="border-t border-slate-50 text-slate-600 text-[12.5px] hover:bg-slate-50/40">
          <td className="px-12 py-1">
            {a.code && <span className="font-mono text-[10px] text-slate-400 mr-2">{a.code}</span>}
            {a.name}
          </td>
          {periods.map(p => (
            <td key={p.key} className="px-3 py-1 text-right tabular-nums">{fmt(a.values[p.key])}</td>
          ))}
        </tr>
      ))}
    </>
  );
}
```

- [ ] **Step 18.2: Smoke**

Visit `/fmplus/financials?view=balance_sheet&asof=2026-02` and verify:
- Balanced ✓ banner appears (delta < 1 EGP).
- Assets total ~171.7M, Liab+Equity ~171.7M.
- All BS sections (Bank/Cash, Receivables, Fixed Assets, etc.) render in Excel order.
- Mode toggle is hidden on this tab; banner reads "Balance Sheet is whole-company; project scoping doesn't apply."

- [ ] **Step 18.3: Commit**

```bash
git add src/app/fmplus/financials/_components/BalanceSheetTable.tsx
git commit -m "feat(fmplus): Balance Sheet renderer

Multi-period as-of columns mirroring the Excel BS hierarchy
(Assets / Liabilities / Equity with sub-buckets). Section bands
in indigo/rose/amber. Synthetic Retained Earnings group flagged
with 'derived' badge. Balanced ✓/⚠ banner with delta amount.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 19: Dashboard tab + KPI strip

Replace the JSON-dump stub with KPI cards (sparklines + vs-prior delta) and chart placeholders.

**Files:**
- Replace: `src/app/fmplus/financials/_components/Dashboard.tsx`
- Create: `src/app/fmplus/financials/_components/KpiStrip.tsx`

- [ ] **Step 19.1: KpiStrip (server component)**

```tsx
// src/app/fmplus/financials/_components/KpiStrip.tsx
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { DashboardKpi } from '@/lib/fmplus/types';

const fmt = (n: number): string => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return Math.round(v).toLocaleString();
};

export function KpiStrip({ kpis }: { kpis: { revenue: DashboardKpi; grossProfit: DashboardKpi; ebitda: DashboardKpi; netProfit: DashboardKpi } }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard label="Revenue"      kpi={kpis.revenue}      tone="indigo" />
      <KpiCard label="Gross Profit" kpi={kpis.grossProfit}  tone="emerald" />
      <KpiCard label="EBITDA"       kpi={kpis.ebitda}       tone="amber" />
      <KpiCard label="Net Profit"   kpi={kpis.netProfit}    tone="rose" />
    </div>
  );
}

function KpiCard({ label, kpi, tone }: { label: string; kpi: DashboardKpi; tone: 'indigo' | 'emerald' | 'amber' | 'rose' }) {
  const isUp = kpi.deltaPct >= 0;
  const tint = tone === 'indigo' ? 'border-indigo-200' : tone === 'emerald' ? 'border-emerald-200' : tone === 'amber' ? 'border-amber-200' : 'border-rose-200';
  const valueClr = kpi.current >= 0 ? 'text-slate-900' : 'text-rose-700';
  return (
    <div className={`ix-card p-4 border-2 ${tint}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueClr}`}>{fmt(kpi.current)}</p>
      <p className={`text-[11px] inline-flex items-center gap-0.5 ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
        {isUp ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
        {Math.abs(kpi.deltaPct).toFixed(1)}% vs prior
      </p>
      <Sparkline values={kpi.sparkline} tone={tone} />
    </div>
  );
}

function Sparkline({ values, tone }: { values: number[]; tone: 'indigo' | 'emerald' | 'amber' | 'rose' }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 100, H = 24;
  const xStep = W / (values.length - 1);
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * xStep).toFixed(1)},${(H - ((v - min) / range) * H).toFixed(1)}`).join(' ');
  const stroke = tone === 'indigo' ? '#6366f1' : tone === 'emerald' ? '#10b981' : tone === 'amber' ? '#f59e0b' : '#f43f5e';
  return (
    <svg width={W} height={H} className="mt-2 -mx-1">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 19.2: Dashboard composition (server)**

```tsx
// src/app/fmplus/financials/_components/Dashboard.tsx
import type { DashboardReport } from '@/lib/fmplus/types';
import { KpiStrip } from './KpiStrip';
import { DashboardCharts } from './DashboardCharts';

export function Dashboard({ data }: { data: DashboardReport }) {
  return (
    <div className="space-y-6">
      <KpiStrip kpis={data.kpis} />
      <DashboardCharts data={data} />
    </div>
  );
}
```

- [ ] **Step 19.3: Stub DashboardCharts (real impl in Task 20)**

```tsx
// src/app/fmplus/financials/_components/DashboardCharts.tsx
import type { DashboardReport } from '@/lib/fmplus/types';

export function DashboardCharts({ data }: { data: DashboardReport }) {
  return (
    <section className="ix-card p-4 text-xs text-slate-500">
      Charts pending Task 20. Trend points: {data.trend.length} · Service mix entries: {data.costMix.length} · Top projects: {data.topProjects.length}
    </section>
  );
}
```

- [ ] **Step 19.4: Smoke**

Visit `/fmplus/financials?view=dashboard&asof=2026-02` — KPI strip shows 4 cards with values, deltas, sparklines.

- [ ] **Step 19.5: Commit**

```bash
git add src/app/fmplus/financials/_components/Dashboard.tsx src/app/fmplus/financials/_components/KpiStrip.tsx src/app/fmplus/financials/_components/DashboardCharts.tsx
git commit -m "feat(fmplus): dashboard tab with KPI strip + chart stub

KpiStrip server component renders 4 cards (Revenue/GP/EBITDA/NP)
with current value, vs-prior delta%, and inline SVG sparkline
(no recharts on KPI cards — keeps server-only path simple).

DashboardCharts stub awaiting Task 20.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 20: Dashboard charts (recharts)

Real charts: revenue mix donut · cost mix donut · gross margin by service horizontal bar · 12-period trend line · top-10 projects bar.

**Files:**
- Replace: `src/app/fmplus/financials/_components/DashboardCharts.tsx`

- [ ] **Step 20.1: Implement (client component, recharts)**

```tsx
// src/app/fmplus/financials/_components/DashboardCharts.tsx
'use client';

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, LineChart, Line, Legend,
} from 'recharts';
import type { DashboardReport } from '@/lib/fmplus/types';

const SVC_COLORS: Record<string, string> = {
  hk: '#10b981', mep: '#6366f1', security: '#f59e0b', landscape: '#84cc16',
  pest: '#06b6d4', waste: '#a855f7', paid: '#f43f5e', vo: '#0ea5e9', other: '#94a3b8',
};

const fmtMoney = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return Math.round(n).toLocaleString();
};

export function DashboardCharts({ data }: { data: DashboardReport }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Donut title="Revenue Mix"  entries={data.revenueMix} />
        <Donut title="Cost Mix"     entries={data.costMix} />
      </div>
      <MarginBars entries={data.marginByService} />
      <TrendLine points={data.trend} />
      <TopProjects entries={data.topProjects} />
    </div>
  );
}

function Donut({ title, entries }: { title: string; entries: Array<{ service?: string; label: string; value: number; pct: number }> }) {
  return (
    <section className="ix-card p-4">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="h-[260px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={entries}
              dataKey="value"
              nameKey="label"
              cx="50%" cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={1}
            >
              {entries.map((e, i) => (
                <Cell key={i} fill={SVC_COLORS[e.service || 'other'] || '#94a3b8'} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number, n) => [fmtMoney(v), n]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="text-xs text-slate-600 grid grid-cols-2 gap-1 mt-2">
        {entries.slice(0, 8).map((e, i) => (
          <li key={i} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: SVC_COLORS[e.service || 'other'] || '#94a3b8' }} />
            <span>{e.label} <span className="text-slate-400">({e.pct.toFixed(1)}%)</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MarginBars({ entries }: { entries: Array<{ service: string; label: string; pct: number }> }) {
  return (
    <section className="ix-card p-4">
      <h3 className="text-sm font-semibold mb-2">Gross Margin by Service Line</h3>
      <div className="h-[260px]">
        <ResponsiveContainer>
          <BarChart data={entries} layout="vertical" margin={{ left: 100, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" unit="%" tickFormatter={v => `${v.toFixed(0)}`} />
            <YAxis type="category" dataKey="label" width={100} fontSize={11} />
            <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
            <Bar dataKey="pct">
              {entries.map((e, i) => {
                const c = e.pct >= 20 ? '#10b981' : e.pct >= 5 ? '#f59e0b' : '#f43f5e';
                return <Cell key={i} fill={c} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TrendLine({ points }: { points: DashboardReport['trend'] }) {
  return (
    <section className="ix-card p-4">
      <h3 className="text-sm font-semibold mb-2">12-Period Trend</h3>
      <div className="h-[300px]">
        <ResponsiveContainer>
          <LineChart data={points.map(p => ({
            label: p.period.label,
            Revenue: p.revenue,
            'Gross Profit': p.grossProfit,
            EBITDA: p.ebitda,
            'Net Profit': p.netProfit,
          }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" fontSize={11} />
            <YAxis tickFormatter={fmtMoney} fontSize={11} />
            <Tooltip formatter={(v: number) => fmtMoney(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="Revenue"      stroke="#6366f1" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Gross Profit" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="EBITDA"       stroke="#f59e0b" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Net Profit"   stroke="#f43f5e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TopProjects({ entries }: { entries: DashboardReport['topProjects'] }) {
  if (entries.length === 0) return null;
  return (
    <section className="ix-card p-4">
      <h3 className="text-sm font-semibold mb-2">Top-10 Active Projects (this period)</h3>
      <div className="h-[300px]">
        <ResponsiveContainer>
          <BarChart data={entries} layout="vertical" margin={{ left: 120, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" tickFormatter={fmtMoney} fontSize={11} />
            <YAxis type="category" dataKey="name" width={120} fontSize={11} />
            <Tooltip formatter={(v: number) => fmtMoney(v)} />
            <Bar dataKey="absBalance" fill="#f59e0b" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
```

- [ ] **Step 20.2: Smoke**

Visit `/fmplus/financials?view=dashboard&asof=2026-02` — verify all 5 charts render. Hover tooltips show formatted numbers.

- [ ] **Step 20.3: Commit**

```bash
git add src/app/fmplus/financials/_components/DashboardCharts.tsx
git commit -m "feat(fmplus): dashboard charts (recharts)

Five charts: Revenue Mix donut, Cost Mix donut, Gross Margin by
Service horizontal bar (color-coded by margin tier), 12-period
trend line (Revenue/GP/EBITDA/NP), Top-10 Active Projects bar.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 21: Excel + PDF export

Two server-action download buttons in the top-right of P&L and BS tabs.

**Files:**
- Create: `src/app/fmplus/financials/_components/ExportButtons.tsx`
- Create: `src/app/fmplus/financials/actions.ts`

- [ ] **Step 21.1: Server actions**

```typescript
// src/app/fmplus/financials/actions.ts
'use server';

import ExcelJS from 'exceljs';
import { buildFmplusPnl, buildFmplusBalanceSheet } from '@/lib/fmplus/financials';
import { resolvePeriodSeries } from '@/lib/fmplus/period-series';
import { discoverFmplusCompanyId } from '@/lib/fmplus/discover-company';
import type { Granularity, ScopeMode } from '@/lib/fmplus/types';

export async function exportPnlToExcel(formData: FormData): Promise<{ ok: true; base64: string; filename: string } | { ok: false; error: string }> {
  try {
    const granularity = (String(formData.get('granularity') || 'monthly')) as Granularity;
    const periods = Number(formData.get('periods') || 3);
    const asof = String(formData.get('asof') || '');
    const mode = (String(formData.get('mode') || 'trend')) as ScopeMode;
    const withDep = String(formData.get('with_dep') || '1') === '1';
    const includeDrafts = String(formData.get('include_drafts') || '1') === '1';
    const planIds = (formData.get('plans') as string | null)?.split(',').map(Number).filter(Number.isFinite);
    const planId = formData.get('plan') ? Number(formData.get('plan')) : undefined;
    const accountIds = (formData.get('accounts') as string | null)?.split(',').map(Number).filter(Number.isFinite);

    const fmplusId = await discoverFmplusCompanyId();
    const periodSeries = resolvePeriodSeries(granularity, periods, asof);
    const report = await buildFmplusPnl({
      periods: periodSeries,
      scope: { mode, companyIds: [fmplusId], planIds, planId, accountIds, includeDrafts, withDep },
    });

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('P&L');
    sheet.columns = [
      { header: 'Account', key: 'account', width: 50 },
      ...periodSeries.map(p => ({ header: p.label, key: p.key, width: 14 })),
    ];

    const addRow = (label: string, vals: Record<string, number>, indent = 0, bold = false) => {
      const row: Record<string, string | number> = { account: '  '.repeat(indent) + label };
      for (const p of periodSeries) row[p.key] = Math.round(vals[p.key] || 0);
      const r = sheet.addRow(row);
      if (bold) r.font = { bold: true };
    };

    addRow('REVENUE', report.sections.revenue.totals, 0, true);
    for (const sg of report.sections.revenue.subgroups) addRow(sg.label, sg.totals, 1);
    addRow('COST OF REVENUE', report.sections.cost_of_revenue.totals, 0, true);
    for (const svc of report.sections.cost_of_revenue.serviceLines || []) {
      addRow(svc.label, svc.totals, 1, true);
      for (const sg of svc.subgroups) addRow(sg.label, sg.totals, 2);
    }
    addRow('GROSS PROFIT', report.subtotals.gross_profit, 0, true);
    addRow('GENERAL EXPENSES', report.sections.general_expenses.totals, 0, true);
    for (const sg of report.sections.general_expenses.subgroups) addRow(sg.label, sg.totals, 1);
    addRow('EBITDA', report.subtotals.ebitda, 0, true);
    addRow('INT - TAXES - DEP', report.sections.interest_tax_dep.totals, 0, true);
    for (const sg of report.sections.interest_tax_dep.subgroups) addRow(sg.label, sg.totals, 1);
    addRow('NET PROFIT', report.subtotals.net_profit, 0, true);

    const buf = await wb.xlsx.writeBuffer();
    const base64 = Buffer.from(buf).toString('base64');
    const filename = `FMPLUS_PnL_${periodSeries[0].key.replace(':', '_')}_to_${periodSeries[periodSeries.length - 1].key.replace(':', '_')}.xlsx`;
    return { ok: true, base64, filename };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function exportBsToExcel(formData: FormData): Promise<{ ok: true; base64: string; filename: string } | { ok: false; error: string }> {
  try {
    const granularity = (String(formData.get('granularity') || 'monthly')) as Granularity;
    const periods = Number(formData.get('periods') || 3);
    const asof = String(formData.get('asof') || '');
    const includeDrafts = String(formData.get('include_drafts') || '1') === '1';

    const fmplusId = await discoverFmplusCompanyId();
    const periodSeries = resolvePeriodSeries(granularity, periods, asof);
    const report = await buildFmplusBalanceSheet({
      periods: periodSeries,
      scope: { mode: 'trend', companyIds: [fmplusId], includeDrafts, withDep: true },
    });

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Balance Sheet');
    sheet.columns = [
      { header: 'Account', key: 'account', width: 50 },
      ...periodSeries.map(p => ({ header: p.label, key: p.key, width: 14 })),
    ];

    const addRow = (label: string, vals: Record<string, number>, indent = 0, bold = false) => {
      const row: Record<string, string | number> = { account: '  '.repeat(indent) + label };
      for (const p of periodSeries) row[p.key] = Math.round(vals[p.key] || 0);
      const r = sheet.addRow(row);
      if (bold) r.font = { bold: true };
    };

    for (const sec of [report.assets, report.liabilities, report.equity]) {
      addRow(sec.label, sec.totals, 0, true);
      for (const g of sec.groups) {
        addRow(g.label, g.totals, 1);
        for (const a of g.accounts) addRow(`${a.code} ${a.name}`, a.values, 2);
      }
    }
    addRow('LIABILITIES + EQUITY', report.liabPlusEquity, 0, true);

    const buf = await wb.xlsx.writeBuffer();
    const base64 = Buffer.from(buf).toString('base64');
    const filename = `FMPLUS_BS_${periodSeries[0].key.replace(':', '_')}.xlsx`;
    return { ok: true, base64, filename };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 21.2: ExportButtons (client)**

```tsx
// src/app/fmplus/financials/_components/ExportButtons.tsx
'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { exportPnlToExcel, exportBsToExcel } from '../actions';

export function ExportButtons(props: {
  view: 'pnl' | 'balance_sheet';
  granularity: string;
  periods: number;
  asof: string;
  mode: string;
  withDep: boolean;
  includeDrafts: boolean;
  plans?: string;
  plan?: string;
  accounts?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    const fd = new FormData();
    fd.set('granularity', props.granularity);
    fd.set('periods', String(props.periods));
    fd.set('asof', props.asof);
    fd.set('mode', props.mode);
    fd.set('with_dep', props.withDep ? '1' : '0');
    fd.set('include_drafts', props.includeDrafts ? '1' : '0');
    if (props.plans) fd.set('plans', props.plans);
    if (props.plan) fd.set('plan', props.plan);
    if (props.accounts) fd.set('accounts', props.accounts);
    const fn = props.view === 'pnl' ? exportPnlToExcel : exportBsToExcel;
    const res = await fn(fd);
    if (res.ok) {
      const a = document.createElement('a');
      a.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.base64}`;
      a.download = res.filename;
      a.click();
    } else {
      alert(`Export failed: ${res.error}`);
    }
    setBusy(false);
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="px-3 py-1.5 rounded bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 inline-flex items-center gap-1.5 disabled:opacity-60"
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      Export Excel
    </button>
  );
}
```

- [ ] **Step 21.3: Wire ExportButtons into PnlTable and BalanceSheetTable**

In `PnlTable.tsx`, accept new prop `exportProps` and render the button at the top-right:

```tsx
// inside <section className="ix-card overflow-x-auto">, before the <table>:
<div className="px-4 py-2 flex justify-end">
  <ExportButtons view="pnl" {...exportProps} />
</div>
```

(Pass the props through from `page.tsx`.)

Same pattern for `BalanceSheetTable.tsx`.

- [ ] **Step 21.4: Smoke**

Click "Export Excel" on P&L tab → downloads `FMPLUS_PnL_m_2026-02_to_m_2025-12.xlsx`. Open the file, verify rows match what's on screen.

- [ ] **Step 21.5: Commit**

```bash
git add src/app/fmplus/financials/_components/ExportButtons.tsx src/app/fmplus/financials/actions.ts src/app/fmplus/financials/_components/PnlTable.tsx src/app/fmplus/financials/_components/BalanceSheetTable.tsx
git commit -m "feat(fmplus): Excel export for P&L and Balance Sheet

Server actions (exportPnlToExcel, exportBsToExcel) build via
ExcelJS, return base64 to the client which triggers an anchor
download. Buttons wired into PnlTable and BalanceSheetTable
top-right toolbars.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 22: End-to-end smoke test against live Odoo

Reconcile the rendered page numbers to the user's Excel snapshot to within 1% tolerance.

- [ ] **Step 22.1: Visit each tab and capture screenshots**

```
http://localhost:3000/fmplus/financials?view=dashboard&asof=2026-02
http://localhost:3000/fmplus/financials?view=pnl&asof=2026-02&periods=1
http://localhost:3000/fmplus/financials?view=balance_sheet&asof=2026-02&periods=1
```

- [ ] **Step 22.2: Reconciliation gate — P&L**

| Excel total            | Expected     | Tolerance |
|------------------------|--------------|-----------|
| Revenue                | 38,466,202   | ±1%       |
| Cost of Revenue        | 33,205,740   | ±1%       |
| Gross Profit           | 5,260,462    | ±1%       |
| EBITDA                 | 807,527      | ±5%       |
| Net Profit             | -716,553     | ±10% (smaller numbers tolerate more) |
| HK Revenue             | 20,625,703   | ±1%       |
| MEP Revenue            | 11,747,222   | ±1%       |
| HK Gross Margin        | 18.11%       | ±0.5pp    |
| MEP Gross Margin       | 3.18%        | ±0.5pp    |

Open the rendered page side-by-side with the Excel. Any number outside tolerance:

- Check unclassified panel — accounts misrouted by prefix.
- Check `include_drafts` — Excel uses "With Draft Entries" so default 1 is correct.
- Check intercompany / company filtering — only FMPLUS company id should be in scope.
- Verify `pnl_aggregated_multiperiod` is being called with the right `p_company_ids`.

- [ ] **Step 22.3: Reconciliation gate — Balance Sheet**

| Excel total              | Expected    | Tolerance |
|--------------------------|-------------|-----------|
| Assets                   | 171,670,951 | ±0.1% |
| Liabilities              | 152,994,353 | ±0.1% |
| Equity                   | 18,676,598  | ±0.1% |
| Liab + Equity            | 171,670,951 | ±0.1% |
| Balanced delta           | < 1 EGP     | hard |
| Bank and Cash group      | -26,461,937 | ±0.1% |
| Receivables group        | 71,897,862  | ±0.1% |
| Fixed Assets group       | 21,219,453  | ±0.1% |

Most variance here will trace back to the opening-balance seed in Task 3 — if numbers are off by significant amounts, double-check that `account_type` mappings in `opening-balance.ts` exactly match what's in `odoo_accounts` for FMPLUS.

- [ ] **Step 22.4: Click-through smoke**

- Switch granularity (Monthly → Quarterly → Yearly) — periods regenerate correctly.
- Switch period count (1 → 3 → 6 → 12) — columns expand, no JS errors.
- Switch mode (Trend → Plans Compare). Pick 2 plans. P&L should render scoped numbers.
- Switch to Accounts Compare. Pick a plan, then 2-3 accounts. P&L re-renders.
- Toggle "Show depreciation in COGS" off. Net Profit invariant; service-line totals shift.
- Toggle "Include drafts" off. Numbers may shift slightly.
- Charts render without errors on the Dashboard tab.
- Excel export downloads + opens.

- [ ] **Step 22.5: Capture findings in SESSION_HANDOFF.md**

Add a brief section noting any reconciliation deltas discovered + their fixes. If everything matches, note "Reconciled to Excel within tolerance."

- [ ] **Step 22.6: Commit any fixes**

If smoke surfaced bugs, ship fix commits per task — small, focused.

---

## Task 23: Final integration commit + push to main

End of feature. Push to main → GitHub→Vercel auto-deploys to `limeinc.vercel.app`.

- [ ] **Step 23.1: Confirm clean state**

```bash
git status
git log --oneline origin/main..HEAD
```

Expected: working tree clean (or only `SESSION_HANDOFF.md`); ~22 commits on this branch.

- [ ] **Step 23.2: Update SESSION_HANDOFF.md with feature summary**

Append a "shipped" section noting:
- New `/fmplus/financials` module live.
- One migration applied (0079).
- Sync extended to FMPLUS company.
- Reconciled to Feb 2026 Excel within tolerance (note any deltas).

Commit:

```bash
git add SESSION_HANDOFF.md
git commit -m "docs: SESSION_HANDOFF — FMPLUS financials shipped

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 23.3: Rebase onto latest main + push**

```bash
git fetch origin main
git rebase origin/main
# Resolve any conflicts. If migrations/ collides on numbering, bump 0079 to next free number.
git push origin HEAD:main
```

Expected: push succeeds. GitHub→Vercel integration auto-deploys.

- [ ] **Step 23.4: Production smoke**

Visit `https://limeinc.vercel.app/fmplus/financials?view=dashboard&asof=2026-02` and verify:
- Page loads (no 500 errors).
- KPIs match dev numbers.
- Filter bar works.
- Excel export downloads.

If a 500 error: check Vercel logs for missing env vars or schema differences between dev DB and prod (the migration must already be applied to prod via dashboard if dev was a separate Supabase project).

- [ ] **Step 23.5: Final SESSION_HANDOFF entry**

Note prod deploy URL + commit hash. Done.

---

## Self-review checklist (run after writing this plan)

1. **Spec coverage** — every spec section maps to a task ✓
   - §3 (decisions) → Task 1 (classifier) covers prefix scheme; §4 (routing/URL) → Tasks 13-14; §5 (P&L renderer) → Tasks 9, 17; §6 (BS renderer) → Tasks 10, 18; §7 (charts) → Tasks 19-20; §8 (data layer) → Tasks 5-7, 12; §10 (risks) — surfaced inline (e.g. Task 22 reconciliation gate covers "opening-balance drift").
2. **Placeholder scan** — zero "TBD/TODO" in steps. Implementer placeholders exist for the opening-balance leaf data (Task 3.4) but the extraction script in 3.1 + the type-mapping rules in 3.4's note give complete instructions.
3. **Type consistency** — `Period`, `Scope`, `PnlReport`, `DashboardReport`, `Classification` types defined in Task 2 are used consistently in Tasks 8-21.
4. **Frequent commits** — every task ends with a commit, ~22 commits total.

---

**Plan complete.** See `docs/superpowers/specs/2026-05-03-fmplus-financials-design.md` for the full design context.
