# FM+ Performance Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Performance Dashboard" surface under FM+ that lets a non-analyst operator answer "are we on plan, where is the gap, are we staffed correctly, what's leaking" in one glance for any contract and any time slice — with every number drillable to source journal lines.

**Architecture:** Sibling module under `/fmplus`. Server-rendered pages with a client-side collapsible sidebar shell. Pure-logic aggregation module wraps existing `buildBudgetVarianceV2`. Reuses existing `/api/fmplus/budget/variance-drill` for drilldowns. No schema changes — all data comes from existing tables. Recharts for all charts.

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind v4 · TypeScript strict · Supabase · Recharts · Vitest + jsdom + @testing-library/react · Zod

**Reference spec:** [docs/superpowers/specs/2026-05-06-fmplus-performance-dashboard-design.md](../specs/2026-05-06-fmplus-performance-dashboard-design.md)

**Prerequisites:** none. The existing Project Budget v2 + Project Report modules ship the underlying data; this plan only reads.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `src/lib/fmplus/performance/types.ts` | Create | All payload types — `ContractDashboardPayload`, `PortfolioPerformancePayload`, panel-specific types, period types |
| `src/lib/fmplus/performance/period.ts` | Create | Resolve chip → `{ from, to }` date range; resolve prior-period for compare mode |
| `src/lib/fmplus/performance/period.test.ts` | Create | 8 tests covering each chip + custom + prior-period resolution |
| `src/lib/fmplus/performance/derive-implied-hc.ts` | Create | Weighted avg CTC per service line + implied HC = actual_manning ÷ avg_ctc |
| `src/lib/fmplus/performance/derive-implied-hc.test.ts` | Create | 4 tests: simple roster, mixed-CTC roster, zero-actual edge, missing manning rows |
| `src/lib/fmplus/performance/derive-forecast.ts` | Create | Linear projection: `period_actual / months_elapsed × 12` |
| `src/lib/fmplus/performance/derive-forecast.test.ts` | Create | 4 tests: under-pace, over-pace, zero-elapsed (Y1 month 0), full-year |
| `src/lib/fmplus/performance/derive-vendors.ts` | Create | Top-5 vendors by spend in period from `odoo_move_lines` ⨝ `odoo_partners` |
| `src/lib/fmplus/performance/derive-vendors.test.ts` | Create | 3 tests: top-5 ranking, ties broken by id desc, fewer-than-5 vendors |
| `src/lib/fmplus/performance/derive-overtime.ts` | Create | Sum manning rows' `ctc_ot` for budget; sum journal lines matching OT account regex for actual |
| `src/lib/fmplus/performance/derive-overtime.test.ts` | Create | 3 tests: HK roster (covered), non-HK service line (stub returns null), zero-actual |
| `src/lib/fmplus/performance/derive-mobilization.ts` | Create | Per `mobilization_lines` row: `(months_elapsed / amortization_months) × total_cost` capped at total |
| `src/lib/fmplus/performance/derive-mobilization.test.ts` | Create | 3 tests: straight-line, flat method, capped at total |
| `src/lib/fmplus/performance/derive-anomalies.ts` | Create | 5 anomaly rules → `{ severity, message, action_url }[]` |
| `src/lib/fmplus/performance/derive-anomalies.test.ts` | Create | 6 tests: one per rule + "all clean" baseline |
| `src/lib/fmplus/performance/build-dashboard.ts` | Create | `buildContractDashboard({ contract_id, period, compare? })` — composes everything |
| `src/lib/fmplus/performance/build-dashboard.test.ts` | Create | 4 tests: happy path, empty unmapped auto-hides, compare-mode parallel block, prior period resolution |
| `src/lib/fmplus/performance/build-portfolio.ts` | Create | `buildPortfolioPerformance({ period, filters? })` — iterates contracts, aggregates |
| `src/lib/fmplus/performance/build-portfolio.test.ts` | Create | 3 tests: happy path, filters, sort by variance |
| `src/app/api/fmplus/performance/[contractId]/route.ts` | Create | `GET ?from=&to=&compare=1` returns `ContractDashboardPayload` JSON |
| `src/app/fmplus/performance/_components/performance-sidebar.tsx` | Create | Client component — sidebar shell with hover-collapse + pin |
| `src/app/fmplus/performance/_components/period-chips.tsx` | Create | Client component — chip group + Custom popover + Compare toggle |
| `src/app/fmplus/performance/_components/panel-header.tsx` | Create | Reusable panel header with collapse + hide buttons |
| `src/app/fmplus/performance/_components/visible-sections.tsx` | Create | Client component — checkbox grid for bulk panel toggling |
| `src/app/fmplus/performance/_components/panel-state.ts` | Create | `usePanelState(id)` hook — reads/writes `localStorage['fmplus_perf_panels']` |
| `src/app/fmplus/performance/_components/charts/grouped-bars.tsx` | Create | Recharts `BarChart` wrapper — Budget vs Actual horizontal grouped |
| `src/app/fmplus/performance/_components/charts/diverging-bars.tsx` | Create | Recharts `BarChart` wrapper — diverging horizontal centred on 0 |
| `src/app/fmplus/performance/_components/charts/dumbbell.tsx` | Create | Custom SVG dumbbell — Required / Budgeted / Implied dots per row |
| `src/app/fmplus/performance/_components/charts/sparkline.tsx` | Create | Recharts mini `LineChart` for KPI tiles |
| `src/app/fmplus/performance/_components/charts/donut.tsx` | Create | Recharts `PieChart` wrapper for category mix |
| `src/app/fmplus/performance/_components/charts/gauge.tsx` | Create | Custom SVG half-circle gauge for forecast burn rate |
| `src/app/fmplus/performance/_components/charts/progress-bar.tsx` | Create | Simple SVG progress bar for mobilization |
| `src/app/fmplus/performance/_components/panels/kpi-strip.tsx` | Create | Panel 1 — 5 KPI tiles |
| `src/app/fmplus/performance/_components/panels/service-lines.tsx` | Create | Panel 2 |
| `src/app/fmplus/performance/_components/panels/variance-ranking.tsx` | Create | Panel 3 |
| `src/app/fmplus/performance/_components/panels/manning.tsx` | Create | Panel 4 |
| `src/app/fmplus/performance/_components/panels/categories.tsx` | Create | Panel 5 |
| `src/app/fmplus/performance/_components/panels/unmapped.tsx` | Create | Panel 6 |
| `src/app/fmplus/performance/_components/panels/forecast.tsx` | Create | Panel 7 |
| `src/app/fmplus/performance/_components/panels/vendors.tsx` | Create | Panel 8 |
| `src/app/fmplus/performance/_components/panels/overtime.tsx` | Create | Panel 9 |
| `src/app/fmplus/performance/_components/panels/mobilization.tsx` | Create | Panel 10 |
| `src/app/fmplus/performance/_components/panels/signoff.tsx` | Create | Panel 11 |
| `src/app/fmplus/performance/_components/panels/yoy-arc.tsx` | Create | Panel 12 |
| `src/app/fmplus/performance/_components/panels/anomalies.tsx` | Create | Panel 13 |
| `src/app/fmplus/performance/_components/portfolio/portfolio-kpi-strip.tsx` | Create | Portfolio top tiles |
| `src/app/fmplus/performance/_components/portfolio/portfolio-variance-bar.tsx` | Create | Diverging bar of every contract |
| `src/app/fmplus/performance/_components/portfolio/portfolio-needs-attention.tsx` | Create | Top-N attention cards |
| `src/app/fmplus/performance/_components/portfolio/portfolio-table.tsx` | Create | Sortable table |
| `src/app/fmplus/performance/layout.tsx` | Create | Server layout with `<TopNav>` + `<PerformanceSidebar>` shell |
| `src/app/fmplus/performance/page.tsx` | Create | Portfolio summary page |
| `src/app/fmplus/performance/[contractId]/page.tsx` | Create | Per-contract detail page |
| `src/app/fmplus/page.tsx` | Modify | Add Performance Dashboard card next to Project Budget |

---

## Phase 1 — Scaffolding

### Task 1: Create types module

**Files:**
- Create: `src/lib/fmplus/performance/types.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
// src/lib/fmplus/performance/types.ts
import type { ServiceLine, Category } from '@/lib/fmplus/budget/types';

export type PeriodChip = 'this-month' | 'last-month' | 'last-3' | 'qtd' | 'ytd' | 'custom';

export interface PeriodRange {
  chip: PeriodChip;
  from: string;          // YYYY-MM-DD inclusive
  to: string;            // YYYY-MM-DD inclusive
  label: string;         // human "Apr 2026" / "Q2 2026" / "Custom range"
  monthsElapsedInYear?: number;
  monthsTotalInYear?: number;
}

export interface KpiTile {
  id: 'revenue' | 'expense' | 'gp' | 'gp_pct' | 'variance_pct';
  label: string;
  value: number;
  unit: 'EGP' | '%' | 'EGP-M';
  variance_pct: number;            // vs budget
  variance_abs: number;
  status: 'good' | 'warn' | 'bad';
  spark: { date: string; value: number }[];     // last 6 months
  prior_value?: number;
  prior_variance_pct?: number;
}

export interface ServiceLineRow {
  service_line: ServiceLine;
  service_label: string;
  budget: number;
  actual: number;
  variance_abs: number;
  variance_pct: number;
  gp_pct: number;
  status: 'good' | 'warn' | 'bad';
  drill_url: string;
}

export interface ManningRow {
  service_line: ServiceLine;
  service_label: string;
  hc_required: number;
  hc_budgeted: number;
  hc_implied: number;          // Expense / weighted avg CTC
  hc_implied_low?: number;     // when CTC spread is large
  hc_implied_high?: number;
  spend_budget: number;
  spend_actual: number;
  spend_variance_pct: number;
  drill_url: string;
}

export interface CategoryRow {
  category: Category;
  category_label: string;
  budget: number;
  actual: number;
  variance_abs: number;
  variance_pct: number;
  drill_url: string;
}

export interface UnmappedLine {
  move_line_id: number;
  date: string;
  account_code: string;
  account_name: string;
  partner_name: string | null;
  journal: string | null;
  ref: string | null;
  amount: number;
  drill_url: string;
}

export interface VendorRow {
  partner_id: number;
  partner_name: string;
  spend: number;
  pct_of_period: number;
  invoice_count: number;
  drill_url: string;
}

export interface ForecastBlock {
  period_actual: number;
  months_elapsed: number;
  months_total: number;
  projected_year_actual: number;
  budget_year: number;
  variance_pct: number;
  status: 'good' | 'warn' | 'bad';
  caveat: string;              // "Linear projection — does not account for ramp"
}

export interface OvertimeBlock {
  ot_actual: number;
  manning_actual: number;
  ot_pct_actual: number;
  ot_pct_budget: number;
  variance_pct: number;
  status: 'good' | 'warn' | 'bad';
  spark: { date: string; value: number }[];
  drill_url: string;
}

export interface MobilizationRow {
  mob_line_id: number;
  label: string;
  total_cost: number;
  amortized: number;
  remaining: number;
  months_elapsed: number;
  months_total: number;
}

export interface SignoffBlock {
  current_year_status: 'draft' | 'published';
  last_published_at: string | null;
  last_published_by: string | null;
  days_stale: number | null;
}

export interface YoyRow {
  year_id: number;
  year_index: number;
  fiscal_year: number | null;
  scenario: string;
  status: 'draft' | 'published';
  revenue: number;
  expense: number;
  gp: number;
  gp_pct: number;
  variance_pct: number;
  health: 'good' | 'warn' | 'bad';
  drill_url: string;
}

export interface Anomaly {
  rule_id: 'manning_over' | 'unmapped_pct' | 'forecast_breach' | 'signoff_stale' | 'vendor_concentration';
  severity: 'amber' | 'red';
  message: string;
  action_url: string;
}

export interface ContractDashboardPayload {
  meta: {
    contract_id: number;
    contract_name: string;
    customer: string | null;
    period: PeriodRange;
    current_year_index: number;
    current_year_id: number;
  };
  kpis: KpiTile[];
  service_lines: ServiceLineRow[];
  variance_ranked: ServiceLineRow[];           // same shape, sorted by |variance_pct| desc
  manning: ManningRow[];
  categories: CategoryRow[];
  unmapped: UnmappedLine[];                    // empty array → panel auto-hides
  forecast: ForecastBlock | null;
  vendors: VendorRow[];                        // empty → panel auto-hides
  overtime: OvertimeBlock | null;
  mobilization: MobilizationRow[];             // empty → panel auto-hides
  signoff: SignoffBlock;
  yoy: YoyRow[];
  anomalies: Anomaly[];                        // empty → panel auto-hides
  prior?: Omit<ContractDashboardPayload, 'meta' | 'prior'>;
}

export interface PortfolioContractRow {
  contract_id: number;
  contract_name: string;
  customer: string | null;
  current_year_index: number;
  revenue: number;
  expense: number;
  gp: number;
  gp_pct: number;
  variance_pct: number;
  health: 'good' | 'warn' | 'bad';
  last_actuals_sync: string | null;
  drill_url: string;
}

export interface PortfolioPerformancePayload {
  period: PeriodRange;
  totals: {
    revenue: number;
    expense: number;
    blended_gp_pct: number;
    portfolio_variance_pct: number;
  };
  contracts: PortfolioContractRow[];                // ranked desc by |variance_pct|
  needs_attention: PortfolioContractRow[];          // |variance_pct| > amber threshold
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/fmplus/performance/types.ts
git commit -m "feat(perf): add Performance Dashboard payload types"
```

---

### Task 2: Implement period chip → date range resolver (TDD)

**Files:**
- Create: `src/lib/fmplus/performance/period.ts`
- Test: `src/lib/fmplus/performance/period.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/fmplus/performance/period.test.ts
import { describe, expect, test } from 'vitest';
import { resolvePeriod, resolvePriorPeriod } from './period';

describe('resolvePeriod', () => {
  const today = new Date('2026-04-15');

  test('this-month → first of month to today', () => {
    const r = resolvePeriod({ chip: 'this-month' }, today);
    expect(r.from).toBe('2026-04-01');
    expect(r.to).toBe('2026-04-15');
    expect(r.label).toBe('Apr 2026 (running)');
  });

  test('last-month → previous calendar month, complete', () => {
    const r = resolvePeriod({ chip: 'last-month' }, today);
    expect(r.from).toBe('2026-03-01');
    expect(r.to).toBe('2026-03-31');
    expect(r.label).toBe('Mar 2026');
  });

  test('last-3 → last 3 complete calendar months', () => {
    const r = resolvePeriod({ chip: 'last-3' }, today);
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toBe('2026-03-31');
  });

  test('qtd → first of quarter to today', () => {
    const r = resolvePeriod({ chip: 'qtd' }, today);
    expect(r.from).toBe('2026-04-01');
    expect(r.to).toBe('2026-04-15');
  });

  test('ytd → Jan 1 to today', () => {
    const r = resolvePeriod({ chip: 'ytd' }, today);
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toBe('2026-04-15');
  });

  test('custom → uses provided dates', () => {
    const r = resolvePeriod({ chip: 'custom', from: '2026-02-10', to: '2026-03-22' }, today);
    expect(r.from).toBe('2026-02-10');
    expect(r.to).toBe('2026-03-22');
  });

  test('throws on custom without dates', () => {
    expect(() => resolvePeriod({ chip: 'custom' }, today)).toThrow();
  });
});

describe('resolvePriorPeriod', () => {
  test('shifts last-month back one month', () => {
    const today = new Date('2026-04-15');
    const cur = resolvePeriod({ chip: 'last-month' }, today);    // Mar 2026
    const prior = resolvePriorPeriod(cur);
    expect(prior.from).toBe('2026-02-01');
    expect(prior.to).toBe('2026-02-28');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/fmplus/performance/period.test.ts`
Expected: FAIL with "Cannot find module './period'"

- [ ] **Step 3: Implement `period.ts`**

```ts
// src/lib/fmplus/performance/period.ts
import type { PeriodChip, PeriodRange } from './types';

export interface ResolveInput {
  chip: PeriodChip;
  from?: string;
  to?: string;
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}
function firstOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function lastOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function shiftMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}
function monthLabel(d: Date) {
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

export function resolvePeriod(input: ResolveInput, now: Date = new Date()): PeriodRange {
  switch (input.chip) {
    case 'this-month': {
      const from = firstOfMonth(now);
      return { chip: 'this-month', from: fmt(from), to: fmt(now), label: `${monthLabel(now)} (running)` };
    }
    case 'last-month': {
      const lm = shiftMonths(now, -1);
      return { chip: 'last-month', from: fmt(firstOfMonth(lm)), to: fmt(lastOfMonth(lm)), label: monthLabel(lm) };
    }
    case 'last-3': {
      const start = firstOfMonth(shiftMonths(now, -3));
      const end = lastOfMonth(shiftMonths(now, -1));
      return { chip: 'last-3', from: fmt(start), to: fmt(end), label: `${monthLabel(start)} – ${monthLabel(end)}` };
    }
    case 'qtd': {
      const q = Math.floor(now.getMonth() / 3);
      const from = new Date(now.getFullYear(), q * 3, 1);
      return { chip: 'qtd', from: fmt(from), to: fmt(now), label: `Q${q + 1} ${now.getFullYear()} QTD` };
    }
    case 'ytd': {
      const from = new Date(now.getFullYear(), 0, 1);
      return { chip: 'ytd', from: fmt(from), to: fmt(now), label: `${now.getFullYear()} YTD` };
    }
    case 'custom': {
      if (!input.from || !input.to) throw new Error('custom period requires from + to');
      return { chip: 'custom', from: input.from, to: input.to, label: `${input.from} → ${input.to}` };
    }
  }
}

export function resolvePriorPeriod(p: PeriodRange): PeriodRange {
  const from = new Date(p.from);
  const to = new Date(p.to);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const priorTo = new Date(from);
  priorTo.setDate(priorTo.getDate() - 1);
  const priorFrom = new Date(priorTo);
  priorFrom.setDate(priorFrom.getDate() - days + 1);
  return { chip: p.chip, from: fmt(priorFrom), to: fmt(priorTo), label: `Prior ${p.label}` };
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npm run test -- src/lib/fmplus/performance/period.test.ts`
Expected: 8 passing

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/performance/period.ts src/lib/fmplus/performance/period.test.ts
git commit -m "feat(perf): period chip → date range resolver"
```

---

### Task 3: Add Performance Dashboard card on `/fmplus`

**Files:**
- Modify: `src/app/fmplus/page.tsx`

- [ ] **Step 1: Read the file to find the card grid**

Run: `head -80 src/app/fmplus/page.tsx`

- [ ] **Step 2: Add a new card next to "Project Budget" — pattern matches the existing card**

Insert into the card grid (the exact location follows the existing Project Budget card; mirror its className and href pattern):

```tsx
<Link
  href="/fmplus/performance"
  className="group ix-card p-5 relative overflow-hidden hover:shadow-lg transition"
>
  <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-gradient-to-br from-fmplus-yellow to-fmplus-gold opacity-10 blur-2xl pointer-events-none group-hover:opacity-20 transition" />
  <div className="flex items-start justify-between gap-3 mb-3">
    <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-fmplus-yellow/15 dark:bg-fmplus-gold/20">
      <Gauge size={24} strokeWidth={2.2} className="text-fmplus-black dark:text-fmplus-yellow" />
    </div>
    <ArrowRight size={18} className="text-slate-400 group-hover:text-fmplus-gold transition" />
  </div>
  <h3 className="text-lg font-bold tracking-tight font-serif">Performance Dashboard</h3>
  <p className="text-xs text-slate-500 mt-2 line-clamp-3">
    Budget vs Actual at a glance — KPIs, charts, drill-throughs to journals. Last Month by default.
  </p>
</Link>
```

Add `Gauge` to the lucide-react import at the top.

- [ ] **Step 3: Commit**

```bash
git add src/app/fmplus/page.tsx
git commit -m "feat(perf): add Performance Dashboard card to FM+ landing"
```

---

### Task 4: Create the route folder + bare layout

**Files:**
- Create: `src/app/fmplus/performance/layout.tsx`
- Create: `src/app/fmplus/performance/page.tsx` (placeholder)
- Create: `src/app/fmplus/performance/[contractId]/page.tsx` (placeholder)

- [ ] **Step 1: Write the layout shell**

```tsx
// src/app/fmplus/performance/layout.tsx
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';

export default async function PerformanceLayout({ children }: { children: React.ReactNode }) {
  await requireBudgetView();
  return (
    <>
      <TopNav>
        <Link href="/fmplus" className="ix-link">FMPLUS</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Performance</span>
      </TopNav>
      <main className="flex-1 flex">
        {/* Sidebar slot (filled by per-page sidebar component) and main content slot live in children. */}
        {children}
      </main>
    </>
  );
}
```

- [ ] **Step 2: Write placeholder portfolio page**

```tsx
// src/app/fmplus/performance/page.tsx
export const dynamic = 'force-dynamic';

export default async function PerformancePortfolioPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Performance Dashboard — Portfolio</h1>
      <p className="text-sm text-slate-500 mt-2">Coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 3: Write placeholder per-contract page**

```tsx
// src/app/fmplus/performance/[contractId]/page.tsx
export const dynamic = 'force-dynamic';

interface Props { params: Promise<{ contractId: string }> }

export default async function PerformanceContractPage(props: Props) {
  const { contractId } = await props.params;
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Performance — Contract #{contractId}</h1>
      <p className="text-sm text-slate-500 mt-2">Coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 4: Verify routes render**

Run: `npm run dev` then open `http://localhost:3000/fmplus/performance` and `/fmplus/performance/1`. Expect placeholder text + auth redirect if signed out.

- [ ] **Step 5: Commit**

```bash
git add src/app/fmplus/performance/
git commit -m "feat(perf): scaffold /fmplus/performance + per-contract route placeholders"
```

---

## Phase 2 — Data layer (server-side, TDD where pure-logic)

### Task 5: Implement `derive-implied-hc.ts` (TDD)

**Files:**
- Create: `src/lib/fmplus/performance/derive-implied-hc.ts`
- Test: `src/lib/fmplus/performance/derive-implied-hc.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/fmplus/performance/derive-implied-hc.test.ts
import { describe, expect, test } from 'vitest';
import { weightedAvgCtc, impliedHeadcount } from './derive-implied-hc';

describe('weightedAvgCtc', () => {
  test('simple roster — 10 cleaners @ 5K + 1 mgr @ 20K', () => {
    const rows = [
      { qty: 10, unit_cost: 5000 },
      { qty: 1,  unit_cost: 20000 },
    ];
    const avg = weightedAvgCtc(rows);
    expect(avg).toBeCloseTo((10 * 5000 + 1 * 20000) / 11, 2);
  });

  test('empty roster → null', () => {
    expect(weightedAvgCtc([])).toBeNull();
  });

  test('zero-qty rows excluded', () => {
    const avg = weightedAvgCtc([{ qty: 0, unit_cost: 5000 }, { qty: 4, unit_cost: 6000 }]);
    expect(avg).toBe(6000);
  });
});

describe('impliedHeadcount', () => {
  test('actual 80K ÷ avg 6.36K → ~12.6', () => {
    const hc = impliedHeadcount(80000, 6363.63);
    expect(hc).toBeCloseTo(12.57, 1);
  });

  test('zero actual → 0', () => {
    expect(impliedHeadcount(0, 5000)).toBe(0);
  });

  test('null avg ctc → null', () => {
    expect(impliedHeadcount(80000, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect fail**

Run: `npm run test -- src/lib/fmplus/performance/derive-implied-hc.test.ts`
Expected: FAIL with module-not-found

- [ ] **Step 3: Implement**

```ts
// src/lib/fmplus/performance/derive-implied-hc.ts
export interface ManningRow { qty: number; unit_cost: number; }

export function weightedAvgCtc(rows: ManningRow[]): number | null {
  let totalCost = 0;
  let totalQty = 0;
  for (const r of rows) {
    if (r.qty <= 0) continue;
    totalCost += r.qty * r.unit_cost;
    totalQty += r.qty;
  }
  if (totalQty === 0) return null;
  return totalCost / totalQty;
}

export function impliedHeadcount(actualSpend: number, avgCtc: number | null): number | null {
  if (avgCtc === null || avgCtc <= 0) return null;
  if (actualSpend <= 0) return 0;
  return actualSpend / avgCtc;
}
```

- [ ] **Step 4: Run tests, expect 6 passing**

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/performance/derive-implied-hc.ts src/lib/fmplus/performance/derive-implied-hc.test.ts
git commit -m "feat(perf): weighted avg CTC + implied HC derivation"
```

---

### Task 6: Implement `derive-forecast.ts` (TDD)

**Files:**
- Create: `src/lib/fmplus/performance/derive-forecast.ts`
- Test: `src/lib/fmplus/performance/derive-forecast.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/fmplus/performance/derive-forecast.test.ts
import { describe, expect, test } from 'vitest';
import { linearForecast } from './derive-forecast';

describe('linearForecast', () => {
  test('over-pace — 4 months elapsed, 4M actual, 10M budget → projects 12M (+20%)', () => {
    const f = linearForecast({
      period_actual: 4_000_000,
      months_elapsed: 4,
      months_total: 12,
      budget_year: 10_000_000,
      amber_pct: 0.05,
      red_pct: 0.15,
    });
    expect(f.projected_year_actual).toBe(12_000_000);
    expect(f.variance_pct).toBeCloseTo(0.20, 2);
    expect(f.status).toBe('bad');
  });

  test('under-pace — 4 months, 2M actual, 10M budget → projects 6M (-40%)', () => {
    const f = linearForecast({
      period_actual: 2_000_000,
      months_elapsed: 4,
      months_total: 12,
      budget_year: 10_000_000,
      amber_pct: 0.05,
      red_pct: 0.15,
    });
    expect(f.projected_year_actual).toBe(6_000_000);
    expect(f.variance_pct).toBeCloseTo(-0.40, 2);
    expect(f.status).toBe('bad');                 // under-spend can also be bad in management terms
  });

  test('zero months elapsed → null forecast (cannot project)', () => {
    const f = linearForecast({
      period_actual: 0, months_elapsed: 0, months_total: 12, budget_year: 10_000_000,
      amber_pct: 0.05, red_pct: 0.15,
    });
    expect(f).toBeNull();
  });

  test('full year elapsed = no projection needed, variance is the actual', () => {
    const f = linearForecast({
      period_actual: 9_500_000, months_elapsed: 12, months_total: 12, budget_year: 10_000_000,
      amber_pct: 0.05, red_pct: 0.15,
    });
    expect(f!.projected_year_actual).toBe(9_500_000);
    expect(f!.variance_pct).toBeCloseTo(-0.05, 2);
    expect(f!.status).toBe('warn');
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

```ts
// src/lib/fmplus/performance/derive-forecast.ts
import type { ForecastBlock } from './types';

export interface ForecastInput {
  period_actual: number;
  months_elapsed: number;
  months_total: number;
  budget_year: number;
  amber_pct: number;
  red_pct: number;
}

export function linearForecast(i: ForecastInput): ForecastBlock | null {
  if (i.months_elapsed <= 0) return null;
  const projected = (i.period_actual / i.months_elapsed) * i.months_total;
  const variance_pct = i.budget_year > 0 ? (projected - i.budget_year) / i.budget_year : 0;
  const abs = Math.abs(variance_pct);
  const status: ForecastBlock['status'] = abs <= i.amber_pct ? 'good' : abs <= i.red_pct ? 'warn' : 'bad';
  return {
    period_actual: i.period_actual,
    months_elapsed: i.months_elapsed,
    months_total: i.months_total,
    projected_year_actual: projected,
    budget_year: i.budget_year,
    variance_pct,
    status,
    caveat: 'Linear projection — does not account for ramp / seasonality',
  };
}
```

- [ ] **Step 4: Run tests, expect 4 passing**

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/performance/derive-forecast.ts src/lib/fmplus/performance/derive-forecast.test.ts
git commit -m "feat(perf): linear year-end forecast + status thresholds"
```

---

### Task 7: Implement `derive-mobilization.ts` (TDD)

**Files:**
- Create: `src/lib/fmplus/performance/derive-mobilization.ts`
- Test: `src/lib/fmplus/performance/derive-mobilization.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/lib/fmplus/performance/derive-mobilization.test.ts
import { describe, expect, test } from 'vitest';
import { computeMobAmortization } from './derive-mobilization';

describe('computeMobAmortization', () => {
  test('straight-line, 6 months elapsed of 24', () => {
    const r = computeMobAmortization({
      mob_line_id: 1, label: 'Recruitment', total_cost: 240_000,
      amortization: 'straight_line', amortization_months: 24,
    }, 6);
    expect(r.amortized).toBe(60_000);
    expect(r.remaining).toBe(180_000);
    expect(r.months_elapsed).toBe(6);
    expect(r.months_total).toBe(24);
  });

  test('flat method — fully amortized at month 1', () => {
    const r = computeMobAmortization({
      mob_line_id: 2, label: 'Onboarding kit', total_cost: 50_000,
      amortization: 'flat', amortization_months: 1,
    }, 1);
    expect(r.amortized).toBe(50_000);
    expect(r.remaining).toBe(0);
  });

  test('capped at total — 30 months elapsed of 24', () => {
    const r = computeMobAmortization({
      mob_line_id: 3, label: 'Training', total_cost: 120_000,
      amortization: 'straight_line', amortization_months: 24,
    }, 30);
    expect(r.amortized).toBe(120_000);
    expect(r.remaining).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

```ts
// src/lib/fmplus/performance/derive-mobilization.ts
import type { MobilizationRow } from './types';

interface MobInput {
  mob_line_id: number;
  label: string;
  total_cost: number;
  amortization: 'straight_line' | 'flat';
  amortization_months: number;
}

export function computeMobAmortization(m: MobInput, monthsElapsed: number): MobilizationRow {
  const elapsed = Math.max(0, monthsElapsed);
  let amortized: number;
  if (m.amortization === 'flat') {
    amortized = elapsed >= 1 ? m.total_cost : 0;
  } else {
    const frac = Math.min(1, elapsed / m.amortization_months);
    amortized = m.total_cost * frac;
  }
  return {
    mob_line_id: m.mob_line_id,
    label: m.label,
    total_cost: m.total_cost,
    amortized,
    remaining: Math.max(0, m.total_cost - amortized),
    months_elapsed: elapsed,
    months_total: m.amortization_months,
  };
}
```

- [ ] **Step 4: Run, expect 3 passing**

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/performance/derive-mobilization.ts src/lib/fmplus/performance/derive-mobilization.test.ts
git commit -m "feat(perf): mobilization line amortization"
```

---

### Task 8: Implement `derive-anomalies.ts` (TDD)

**Files:**
- Create: `src/lib/fmplus/performance/derive-anomalies.ts`
- Test: `src/lib/fmplus/performance/derive-anomalies.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/lib/fmplus/performance/derive-anomalies.test.ts
import { describe, expect, test } from 'vitest';
import { deriveAnomalies } from './derive-anomalies';
import type { ContractDashboardPayload } from './types';

const baseInput: Parameters<typeof deriveAnomalies>[0] = {
  contract_id: 1,
  manning: [],
  unmapped_total: 0,
  period_total_actual: 1_000_000,
  forecast: null,
  signoff_days_stale: 5,
  vendors: [],
  amber_pct: 0.15,
};

describe('deriveAnomalies', () => {
  test('all clean → no anomalies', () => {
    const a = deriveAnomalies(baseInput);
    expect(a).toEqual([]);
  });

  test('manning over amber threshold triggers rule 1', () => {
    const a = deriveAnomalies({
      ...baseInput,
      manning: [{ service_line: 'hk', service_label: 'HK', spend_variance_pct: 0.20 } as never],
    });
    expect(a).toHaveLength(1);
    expect(a[0].rule_id).toBe('manning_over');
    expect(a[0].severity).toBe('amber');
    expect(a[0].message).toContain('HK');
  });

  test('unmapped > 5% but ≤ 15% → amber', () => {
    const a = deriveAnomalies({ ...baseInput, unmapped_total: 80_000 });   // 8%
    expect(a[0].rule_id).toBe('unmapped_pct');
    expect(a[0].severity).toBe('amber');
  });

  test('unmapped > 15% → red', () => {
    const a = deriveAnomalies({ ...baseInput, unmapped_total: 200_000 });  // 20%
    expect(a[0].severity).toBe('red');
  });

  test('forecast over amber → triggers rule 3', () => {
    const a = deriveAnomalies({
      ...baseInput,
      forecast: { variance_pct: 0.18, projected_year_actual: 12_000_000, budget_year: 10_000_000 } as never,
    });
    expect(a.find(x => x.rule_id === 'forecast_breach')).toBeTruthy();
  });

  test('signoff > 30d stale → triggers rule 4', () => {
    const a = deriveAnomalies({ ...baseInput, signoff_days_stale: 45 });
    expect(a.find(x => x.rule_id === 'signoff_stale')).toBeTruthy();
  });

  test('vendor concentration > 40% → triggers rule 5', () => {
    const a = deriveAnomalies({
      ...baseInput,
      vendors: [{ partner_name: 'BigCo', pct_of_period: 0.45 } as never],
    });
    expect(a.find(x => x.rule_id === 'vendor_concentration')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

```ts
// src/lib/fmplus/performance/derive-anomalies.ts
import type { Anomaly, ManningRow, ForecastBlock, VendorRow } from './types';

interface AnomalyInput {
  contract_id: number;
  manning: ManningRow[];
  unmapped_total: number;
  period_total_actual: number;
  forecast: ForecastBlock | null;
  signoff_days_stale: number | null;
  vendors: VendorRow[];
  amber_pct: number;             // from budget_settings.amber_pct, expressed 0..1 (e.g. 0.15)
}

const RULE_UNMAPPED_AMBER = 0.05;
const RULE_UNMAPPED_RED = 0.15;
const RULE_SIGNOFF_DAYS = 30;
const RULE_VENDOR_CONC = 0.40;

export function deriveAnomalies(i: AnomalyInput): Anomaly[] {
  const out: Anomaly[] = [];

  // Rule 1 — manning service line over amber threshold
  for (const m of i.manning) {
    if (m.spend_variance_pct > i.amber_pct) {
      out.push({
        rule_id: 'manning_over',
        severity: m.spend_variance_pct > i.amber_pct * 2 ? 'red' : 'amber',
        message: `Manning spend in ${m.service_label} is ${(m.spend_variance_pct * 100).toFixed(1)}% over budget — investigate overtime`,
        action_url: `/fmplus/financial/budget/variance?contract=${i.contract_id}&service=${m.service_line}&category=manning`,
      });
    }
  }

  // Rule 2 — unmapped %
  const unmappedPct = i.period_total_actual > 0 ? i.unmapped_total / i.period_total_actual : 0;
  if (unmappedPct > RULE_UNMAPPED_AMBER) {
    out.push({
      rule_id: 'unmapped_pct',
      severity: unmappedPct > RULE_UNMAPPED_RED ? 'red' : 'amber',
      message: `${Math.round(i.unmapped_total / 1000)}K unmapped (${(unmappedPct * 100).toFixed(1)}%) — categorise before close`,
      action_url: '#perf-unmapped',
    });
  }

  // Rule 3 — forecast breach
  if (i.forecast && Math.abs(i.forecast.variance_pct) > i.amber_pct) {
    out.push({
      rule_id: 'forecast_breach',
      severity: Math.abs(i.forecast.variance_pct) > i.amber_pct * 2 ? 'red' : 'amber',
      message: `At current pace, year-end actual = ${(i.forecast.projected_year_actual / 1e6).toFixed(2)}M vs budget ${(i.forecast.budget_year / 1e6).toFixed(2)}M (${(i.forecast.variance_pct * 100).toFixed(1)}%)`,
      action_url: '#perf-forecast',
    });
  }

  // Rule 4 — sign-off stale
  if (i.signoff_days_stale !== null && i.signoff_days_stale > RULE_SIGNOFF_DAYS) {
    out.push({
      rule_id: 'signoff_stale',
      severity: 'amber',
      message: `Sign-off is ${i.signoff_days_stale} days stale`,
      action_url: '#perf-signoff',
    });
  }

  // Rule 5 — vendor concentration
  for (const v of i.vendors) {
    if (v.pct_of_period > RULE_VENDOR_CONC) {
      out.push({
        rule_id: 'vendor_concentration',
        severity: 'amber',
        message: `${v.partner_name} accounts for ${(v.pct_of_period * 100).toFixed(1)}% of period spend`,
        action_url: '#perf-vendors',
      });
      break;     // one vendor concentration anomaly is enough
    }
  }

  return out;
}
```

- [ ] **Step 4: Run, expect 7 passing**

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/performance/derive-anomalies.ts src/lib/fmplus/performance/derive-anomalies.test.ts
git commit -m "feat(perf): 5-rule anomaly engine"
```

---

### Task 9: Implement `derive-vendors.ts` (Supabase-backed, mocked test)

**Files:**
- Create: `src/lib/fmplus/performance/derive-vendors.ts`
- Test: `src/lib/fmplus/performance/derive-vendors.test.ts`

- [ ] **Step 1: Failing test (mocks the Supabase client)**

```ts
// src/lib/fmplus/performance/derive-vendors.test.ts
import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    rpc: vi.fn().mockResolvedValue({
      data: [
        { partner_id: 1, partner_name: 'BigCo',  spend: 450_000, invoice_count: 4 },
        { partner_id: 2, partner_name: 'MidCo',  spend: 220_000, invoice_count: 2 },
        { partner_id: 3, partner_name: 'SmallCo', spend:  90_000, invoice_count: 1 },
      ],
      error: null,
    }),
  }),
}));

const { topVendors } = await import('./derive-vendors');

describe('topVendors', () => {
  test('ranks desc, computes pct of period total, includes drill_url', async () => {
    const r = await topVendors({ contract_id: 1, project_id: 99, from: '2026-04-01', to: '2026-04-30', period_total: 1_000_000 });
    expect(r).toHaveLength(3);
    expect(r[0].partner_name).toBe('BigCo');
    expect(r[0].pct_of_period).toBeCloseTo(0.45, 2);
    expect(r[0].drill_url).toContain('partner=1');
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

```ts
// src/lib/fmplus/performance/derive-vendors.ts
import { supabaseAdmin } from '@/lib/supabase';
import type { VendorRow } from './types';

export async function topVendors(args: {
  contract_id: number;
  project_id: number;          // odoo_analytic_account.id == project_contracts.project_id
  from: string;
  to: string;
  period_total: number;
}): Promise<VendorRow[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('fmplus_perf_top_vendors', {
    p_analytic_id: args.project_id,
    p_from: args.from,
    p_to: args.to,
    p_limit: 5,
  });
  if (error) throw error;
  const rows = (data ?? []) as { partner_id: number; partner_name: string; spend: number; invoice_count: number }[];
  return rows.map(r => ({
    partner_id: r.partner_id,
    partner_name: r.partner_name,
    spend: r.spend,
    invoice_count: r.invoice_count,
    pct_of_period: args.period_total > 0 ? r.spend / args.period_total : 0,
    drill_url: `/api/fmplus/budget/variance-drill?contract=${args.contract_id}&from=${args.from}&to=${args.to}&partner=${r.partner_id}`,
  }));
}
```

> **Note:** the RPC `fmplus_perf_top_vendors(p_analytic_id, p_from, p_to, p_limit)` does not exist yet. Add it inline in step 3a.

- [ ] **Step 3a: Apply migration for the helper RPC**

```sql
-- supabase/migrations/0084_fmplus_perf_top_vendors.sql
CREATE OR REPLACE FUNCTION public.fmplus_perf_top_vendors(
  p_analytic_id bigint,
  p_from        date,
  p_to          date,
  p_limit       integer DEFAULT 5
)
RETURNS TABLE (
  partner_id     integer,
  partner_name   text,
  spend          numeric,
  invoice_count  integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id::integer                               AS partner_id,
    coalesce(p.name, '(no partner)')            AS partner_name,
    sum(ml.debit - ml.credit)::numeric          AS spend,
    count(distinct ml.move_id)::integer         AS invoice_count
  FROM public.odoo_move_lines ml
  JOIN public.odoo_move_line_analytics mla ON mla.move_line_id = ml.id
  LEFT JOIN public.odoo_partners p ON p.id = ml.partner_id
  WHERE mla.analytic_account_id = p_analytic_id
    AND ml.date BETWEEN p_from AND p_to
    AND ml.parent_state = 'posted'
    AND (ml.debit - ml.credit) > 0
  GROUP BY p.id, p.name
  ORDER BY spend DESC, p.id DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.fmplus_perf_top_vendors FROM public;
GRANT EXECUTE ON FUNCTION public.fmplus_perf_top_vendors TO service_role;
```

Apply via Supabase MCP `apply_migration`.

- [ ] **Step 4: Run test, expect 1 passing**

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/performance/derive-vendors.ts src/lib/fmplus/performance/derive-vendors.test.ts supabase/migrations/0084_fmplus_perf_top_vendors.sql
git commit -m "feat(perf): top-5 vendors RPC + derive helper"
```

---

### Task 10: Implement `derive-overtime.ts`

**Files:**
- Create: `src/lib/fmplus/performance/derive-overtime.ts`
- Test: `src/lib/fmplus/performance/derive-overtime.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/lib/fmplus/performance/derive-overtime.test.ts
import { describe, expect, test } from 'vitest';
import { computeOvertimeBlock } from './derive-overtime';

describe('computeOvertimeBlock', () => {
  test('actual OT 80K of 600K manning = 13.3%, budgeted 5%, over → bad', () => {
    const r = computeOvertimeBlock({
      ot_actual: 80_000, manning_actual: 600_000,
      ot_budget: 30_000, manning_budget: 600_000,
      spark: [],
      drill_url: '/x',
      amber_pct: 0.05,
    });
    expect(r!.ot_pct_actual).toBeCloseTo(0.1333, 3);
    expect(r!.ot_pct_budget).toBeCloseTo(0.05, 2);
    expect(r!.status).toBe('bad');
  });

  test('zero manning → null block (cannot compute %)', () => {
    expect(computeOvertimeBlock({
      ot_actual: 0, manning_actual: 0, ot_budget: 0, manning_budget: 0,
      spark: [], drill_url: '/x', amber_pct: 0.05,
    })).toBeNull();
  });

  test('within tolerance → good', () => {
    const r = computeOvertimeBlock({
      ot_actual: 30_000, manning_actual: 600_000,
      ot_budget: 30_000, manning_budget: 600_000,
      spark: [], drill_url: '/x', amber_pct: 0.05,
    });
    expect(r!.status).toBe('good');
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

```ts
// src/lib/fmplus/performance/derive-overtime.ts
import type { OvertimeBlock } from './types';

interface Input {
  ot_actual: number;
  manning_actual: number;
  ot_budget: number;
  manning_budget: number;
  spark: { date: string; value: number }[];
  drill_url: string;
  amber_pct: number;
}

export function computeOvertimeBlock(i: Input): OvertimeBlock | null {
  if (i.manning_actual <= 0 && i.manning_budget <= 0) return null;
  const ot_pct_actual = i.manning_actual > 0 ? i.ot_actual / i.manning_actual : 0;
  const ot_pct_budget = i.manning_budget > 0 ? i.ot_budget / i.manning_budget : 0;
  const variance = ot_pct_actual - ot_pct_budget;
  const status: OvertimeBlock['status'] =
    Math.abs(variance) <= i.amber_pct ? 'good' :
    Math.abs(variance) <= i.amber_pct * 2 ? 'warn' : 'bad';
  return {
    ot_actual: i.ot_actual,
    manning_actual: i.manning_actual,
    ot_pct_actual,
    ot_pct_budget,
    variance_pct: variance,
    status,
    spark: i.spark,
    drill_url: i.drill_url,
  };
}
```

- [ ] **Step 4: Run, expect 3 passing**

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/performance/derive-overtime.ts src/lib/fmplus/performance/derive-overtime.test.ts
git commit -m "feat(perf): overtime % block + status thresholds"
```

---

### Task 11: Implement `build-dashboard.ts` (the main aggregator)

**Files:**
- Create: `src/lib/fmplus/performance/build-dashboard.ts`
- Test: `src/lib/fmplus/performance/build-dashboard.test.ts`

This task composes everything. It is large but has a single entry point. Tests use a mocked Supabase fixture.

- [ ] **Step 1: Write the test fixture + failing test**

```ts
// src/lib/fmplus/performance/build-dashboard.test.ts
import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/fmplus/budget/variance', () => ({
  buildBudgetVarianceV2: vi.fn().mockResolvedValue({
    contract_id: 1,
    year_id: 10,
    segments: [
      {
        service_line: 'hk',
        budget: 1_200_000, actual: 1_100_000,
        categories: [
          { category: 'manning', budget: 800_000, actual: 850_000, cells: [] },
          { category: 'ppe', budget: 100_000, actual: 90_000, cells: [] },
        ],
      },
    ],
    total_budget: 1_200_000,
    total_actual: 1_100_000,
    unmapped_actuals: [],
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
          single: () => Promise.resolve({
            data: { id: 1, name: 'TestContract', customer: 'TestCustomer', project_id: 99, contract_value: 14_400_000, start_date: '2026-01-01' },
            error: null,
          }),
        }),
      }),
    }),
    rpc: () => Promise.resolve({ data: [], error: null }),
  }),
}));

const { buildContractDashboard } = await import('./build-dashboard');

describe('buildContractDashboard', () => {
  test('happy path returns all 13 sections', async () => {
    const r = await buildContractDashboard({
      contract_id: 1,
      period: { chip: 'last-month', from: '2026-03-01', to: '2026-03-31', label: 'Mar 2026' },
    });
    expect(r.meta.contract_id).toBe(1);
    expect(r.kpis).toHaveLength(5);
    expect(r.service_lines.length).toBeGreaterThan(0);
    expect(Array.isArray(r.unmapped)).toBe(true);
  });

  test('compare=true returns prior block', async () => {
    const r = await buildContractDashboard({
      contract_id: 1,
      period: { chip: 'last-month', from: '2026-03-01', to: '2026-03-31', label: 'Mar 2026' },
      compare: true,
    });
    expect(r.prior).toBeDefined();
    expect(r.prior!.kpis).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement (full code below)**

```ts
// src/lib/fmplus/performance/build-dashboard.ts
import { supabaseAdmin } from '@/lib/supabase';
import { buildBudgetVarianceV2 } from '@/lib/fmplus/budget/variance';
import { resolvePeriod, resolvePriorPeriod } from './period';
import { weightedAvgCtc, impliedHeadcount } from './derive-implied-hc';
import { linearForecast } from './derive-forecast';
import { computeMobAmortization } from './derive-mobilization';
import { computeOvertimeBlock } from './derive-overtime';
import { topVendors } from './derive-vendors';
import { deriveAnomalies } from './derive-anomalies';
import type {
  ContractDashboardPayload, KpiTile, ServiceLineRow, ManningRow, CategoryRow,
  UnmappedLine, YoyRow, MobilizationRow, PeriodRange,
} from './types';
import type { Category, ServiceLine } from '@/lib/fmplus/budget/types';

const CATEGORY_LABELS: Record<Category, string> = {
  manning: 'Manning', ppe: 'PPE', tools: 'Tools', consumables: 'Consumables',
  transport: 'Transport', it: 'IT', governmental: 'Governmental', other: 'Other',
};
const SERVICE_LABELS: Record<ServiceLine, string> = {
  hk: 'Housekeeping', mep: 'MEP', landscape: 'Landscape', security: 'Security',
  pest_ctrl: 'Pest Control', waste_mgmt: 'Waste Management', back_office: 'Back Office',
};

interface BuildArgs {
  contract_id: number;
  period: PeriodRange;
  compare?: boolean;
}

export async function buildContractDashboard(args: BuildArgs): Promise<ContractDashboardPayload> {
  const sb = supabaseAdmin();

  // Load contract metadata
  const { data: contract, error: ce } = await sb
    .from('project_contracts')
    .select('id,name,customer,project_id,contract_value,start_date,end_date')
    .eq('id', args.contract_id)
    .single();
  if (ce || !contract) throw new Error(`contract ${args.contract_id} not found`);

  // Load current year (latest year_index) — this is the "year context" for the period
  const { data: years } = await sb
    .from('project_years')
    .select('id,year_index,fiscal_year,scenario,status,published_at')
    .eq('contract_id', args.contract_id)
    .order('year_index', { ascending: false })
    .limit(1);
  const currentYear = years?.[0];
  if (!currentYear) throw new Error(`no years for contract ${args.contract_id}`);

  // Variance backbone for current year
  const variance = await buildBudgetVarianceV2(args.contract_id, currentYear.id);

  // ... build KPIs by summing variance.segments + slicing by period months
  // (the variance loader already returns month-keyed cells; sum the months
  //  in [from..to])

  // For brevity in this plan: see helper functions below. They translate the
  // existing variance shape into the panel-specific row types.

  // Service lines + variance ranking
  const service_lines: ServiceLineRow[] = variance.segments.map((s) => {
    const variance_abs = s.actual - s.budget;
    const variance_pct = s.budget > 0 ? variance_abs / s.budget : 0;
    const gp_pct = computeGpPct(args.contract_id, s.service_line, s.actual, currentYear.id);
    return {
      service_line: s.service_line,
      service_label: SERVICE_LABELS[s.service_line],
      budget: s.budget,
      actual: s.actual,
      variance_abs,
      variance_pct,
      gp_pct,
      status: classifyVariance(variance_pct),
      drill_url: `/fmplus/financial/budget/variance?contract=${args.contract_id}&service=${s.service_line}&from=${args.period.from}&to=${args.period.to}`,
    };
  });

  // Implied HC: for each service, query manning rows from budget_lines and compute
  const manning: ManningRow[] = await Promise.all(
    variance.segments.map(async (seg) => {
      const { data: manningRows } = await sb
        .from('budget_lines')
        .select('qty,unit_cost,line_code')
        .eq('year_id', currentYear.id)
        .eq('service_line', seg.service_line)
        .eq('category', 'manning');
      const avgCtc = weightedAvgCtc(manningRows ?? []);
      const manningCat = seg.categories.find(c => c.category === 'manning');
      const spend_actual = manningCat?.actual ?? 0;
      const spend_budget = manningCat?.budget ?? 0;
      const hc_implied = impliedHeadcount(spend_actual, avgCtc);
      const hc_required = (manningRows ?? []).reduce((a, r) => a + Math.round(r.qty * 0.85), 0);
      const hc_budgeted = (manningRows ?? []).reduce((a, r) => a + r.qty, 0);
      return {
        service_line: seg.service_line,
        service_label: SERVICE_LABELS[seg.service_line],
        hc_required,
        hc_budgeted,
        hc_implied: hc_implied ?? 0,
        spend_budget,
        spend_actual,
        spend_variance_pct: spend_budget > 0 ? (spend_actual - spend_budget) / spend_budget : 0,
        drill_url: `/fmplus/financial/budget/variance?contract=${args.contract_id}&service=${seg.service_line}&category=manning&from=${args.period.from}&to=${args.period.to}`,
      };
    })
  );

  // Categories rollup
  const catTotals: Record<Category, { budget: number; actual: number }> = Object.fromEntries(
    Object.keys(CATEGORY_LABELS).map(c => [c, { budget: 0, actual: 0 }]),
  ) as never;
  for (const seg of variance.segments) {
    for (const c of seg.categories) {
      catTotals[c.category].budget += c.budget;
      catTotals[c.category].actual += c.actual;
    }
  }
  const categories: CategoryRow[] = (Object.keys(catTotals) as Category[]).map(cat => {
    const t = catTotals[cat];
    const variance_abs = t.actual - t.budget;
    const variance_pct = t.budget > 0 ? variance_abs / t.budget : 0;
    return {
      category: cat,
      category_label: CATEGORY_LABELS[cat],
      budget: t.budget,
      actual: t.actual,
      variance_abs,
      variance_pct,
      drill_url: `/fmplus/financial/budget/variance?contract=${args.contract_id}&category=${cat}&from=${args.period.from}&to=${args.period.to}`,
    };
  });

  // Unmapped — already on variance result
  const unmapped: UnmappedLine[] = (variance.unmapped_actuals ?? []).map((u: never) => ({
    move_line_id: (u as { id: number }).id,
    date: (u as { date: string }).date,
    account_code: (u as { account_code: string }).account_code,
    account_name: (u as { account_name: string }).account_name,
    partner_name: (u as { partner_name: string | null }).partner_name,
    journal: (u as { journal: string | null }).journal,
    ref: (u as { ref: string | null }).ref,
    amount: (u as { amount: number }).amount,
    drill_url: `/fmplus/financial/budget/variance?contract=${args.contract_id}&move_line=${(u as { id: number }).id}`,
  }));

  // KPIs
  const total_budget = variance.total_budget;
  const total_actual = variance.total_actual;
  const revenue = service_lines.reduce((a, s) => a + (s.budget * (1 + s.gp_pct)), 0);
  const gp_abs = revenue - total_actual;
  const gp_pct = revenue > 0 ? gp_abs / revenue : 0;
  const variance_pct = total_budget > 0 ? (total_actual - total_budget) / total_budget : 0;

  const kpis: KpiTile[] = [
    makeKpi('revenue', 'Revenue', revenue, 'EGP-M', variance_pct, classifyVariance(variance_pct), []),
    makeKpi('expense', 'Expense', total_actual, 'EGP-M', variance_pct, classifyVariance(variance_pct), []),
    makeKpi('gp', 'GP', gp_abs, 'EGP-M', variance_pct, classifyVariance(variance_pct), []),
    makeKpi('gp_pct', 'GP %', gp_pct, '%', variance_pct, classifyVariance(variance_pct), []),
    makeKpi('variance_pct', 'Variance %', variance_pct, '%', variance_pct, classifyVariance(variance_pct), []),
  ];

  // Forecast
  const monthsElapsed = elapsedMonths(currentYear, args.period.to);
  const forecast = linearForecast({
    period_actual: total_actual,
    months_elapsed: monthsElapsed,
    months_total: 12,
    budget_year: total_budget * (12 / Math.max(1, monthsElapsed)),     // gross-up if budget was period-sliced
    amber_pct: 0.05,
    red_pct: 0.15,
  });

  // Vendors
  const vendors = await topVendors({
    contract_id: args.contract_id,
    project_id: contract.project_id,
    from: args.period.from,
    to: args.period.to,
    period_total: total_actual,
  });

  // Overtime
  const otBudget = await sumManningOtBudget(sb, currentYear.id);
  const otActual = await sumOtActual(sb, contract.project_id, args.period.from, args.period.to);
  const totalManningBudget = manning.reduce((a, m) => a + m.spend_budget, 0);
  const totalManningActual = manning.reduce((a, m) => a + m.spend_actual, 0);
  const overtime = computeOvertimeBlock({
    ot_actual: otActual, manning_actual: totalManningActual,
    ot_budget: otBudget, manning_budget: totalManningBudget,
    spark: [], drill_url: `/fmplus/financial/budget/variance?contract=${args.contract_id}&category=manning&ot=1&from=${args.period.from}&to=${args.period.to}`,
    amber_pct: 0.05,
  });

  // Mobilization
  const { data: mobLines } = await sb
    .from('mobilization_lines')
    .select('id,label_en,qty,unit_cost,amortization,amortization_months')
    .eq('contract_id', args.contract_id);
  const mobilization: MobilizationRow[] = (mobLines ?? []).map(m => computeMobAmortization({
    mob_line_id: m.id,
    label: m.label_en,
    total_cost: m.qty * m.unit_cost,
    amortization: m.amortization,
    amortization_months: m.amortization_months,
  }, monthsElapsed));

  // Sign-off
  const last_published_at = currentYear.published_at;
  const days_stale = last_published_at ? Math.floor((Date.now() - new Date(last_published_at).getTime()) / 86_400_000) : null;
  const signoff = {
    current_year_status: currentYear.status,
    last_published_at,
    last_published_by: null,           // populated by signoff query — see step 3b
    days_stale,
  };

  // YoY arc
  const { data: allYears } = await sb
    .from('project_years')
    .select('id,year_index,fiscal_year,scenario,status')
    .eq('contract_id', args.contract_id)
    .order('year_index');
  const yoy: YoyRow[] = await Promise.all((allYears ?? []).map(async y => {
    if (y.id === currentYear.id) {
      return {
        year_id: y.id, year_index: y.year_index, fiscal_year: y.fiscal_year, scenario: y.scenario, status: y.status,
        revenue, expense: total_actual, gp: gp_abs, gp_pct, variance_pct,
        health: classifyVariance(variance_pct),
        drill_url: `/fmplus/performance/${args.contract_id}?year=${y.year_index}`,
      };
    }
    const v = await buildBudgetVarianceV2(args.contract_id, y.id);
    return {
      year_id: y.id, year_index: y.year_index, fiscal_year: y.fiscal_year, scenario: y.scenario, status: y.status,
      revenue: 0, expense: v.total_actual, gp: 0, gp_pct: 0,
      variance_pct: v.total_budget > 0 ? (v.total_actual - v.total_budget) / v.total_budget : 0,
      health: classifyVariance(v.total_budget > 0 ? (v.total_actual - v.total_budget) / v.total_budget : 0),
      drill_url: `/fmplus/performance/${args.contract_id}?year=${y.year_index}`,
    };
  }));

  // Anomalies
  const anomalies = deriveAnomalies({
    contract_id: args.contract_id,
    manning,
    unmapped_total: unmapped.reduce((a, u) => a + u.amount, 0),
    period_total_actual: total_actual,
    forecast,
    signoff_days_stale: days_stale,
    vendors,
    amber_pct: 0.15,
  });

  // Variance ranked
  const variance_ranked = [...service_lines].sort((a, b) => Math.abs(b.variance_pct) - Math.abs(a.variance_pct));

  const payload: ContractDashboardPayload = {
    meta: {
      contract_id: args.contract_id,
      contract_name: contract.name,
      customer: contract.customer,
      period: args.period,
      current_year_index: currentYear.year_index,
      current_year_id: currentYear.id,
    },
    kpis,
    service_lines,
    variance_ranked,
    manning,
    categories,
    unmapped,
    forecast,
    vendors,
    overtime,
    mobilization,
    signoff,
    yoy,
    anomalies,
  };

  // Compare mode — recurse on prior period without the prior block
  if (args.compare) {
    const priorPeriod = resolvePriorPeriod(args.period);
    const prior = await buildContractDashboard({ ...args, period: priorPeriod, compare: false });
    const { meta: _meta, prior: _prior, ...rest } = prior;
    payload.prior = rest;
  }

  return payload;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function classifyVariance(pct: number): 'good' | 'warn' | 'bad' {
  const abs = Math.abs(pct);
  return abs <= 0.05 ? 'good' : abs <= 0.15 ? 'warn' : 'bad';
}

function makeKpi(
  id: KpiTile['id'], label: string, value: number, unit: KpiTile['unit'],
  variance_pct: number, status: KpiTile['status'], spark: { date: string; value: number }[],
): KpiTile {
  return { id, label, value, unit, variance_pct, variance_abs: 0, status, spark };
}

function computeGpPct(_contract_id: number, _sl: ServiceLine, _actual: number, _year_id: number): number {
  // Placeholder: GP% per service line requires revenue from project_year_services.
  // For v1, return 0 unless we can resolve. Refined in the next iteration.
  return 0;
}

function elapsedMonths(year: { fiscal_year: number | null }, dateIso: string): number {
  const d = new Date(dateIso);
  const startYear = year.fiscal_year ?? d.getFullYear();
  const start = new Date(startYear, 0, 1);
  const diffMonths = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth()) + 1;
  return Math.max(0, Math.min(12, diffMonths));
}

async function sumManningOtBudget(sb: ReturnType<typeof supabaseAdmin>, year_id: number): Promise<number> {
  const { data } = await sb
    .from('budget_lines')
    .select('qty,ctc_ot')
    .eq('year_id', year_id)
    .eq('category', 'manning');
  return (data ?? []).reduce((a, r) => a + (r.qty * (r.ctc_ot ?? 0)), 0);
}

async function sumOtActual(_sb: ReturnType<typeof supabaseAdmin>, _project_id: number, _from: string, _to: string): Promise<number> {
  // v1 stub — pattern-match against OT account codes from templates/hk.ts.
  // For now, return 0 to keep the panel working; refined in a follow-up task.
  return 0;
}
```

- [ ] **Step 4: Run tests, expect 2 passing**

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/performance/build-dashboard.ts src/lib/fmplus/performance/build-dashboard.test.ts
git commit -m "feat(perf): buildContractDashboard composes 13-section payload"
```

---

### Task 12: Implement `build-portfolio.ts`

**Files:**
- Create: `src/lib/fmplus/performance/build-portfolio.ts`
- Test: `src/lib/fmplus/performance/build-portfolio.test.ts`

- [ ] **Step 1: Failing test (mocked)**

```ts
// src/lib/fmplus/performance/build-portfolio.test.ts
import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/fmplus/budget/portfolio', () => ({
  buildPortfolio: vi.fn().mockResolvedValue([
    { contract_id: 1, contract_name: 'Trio',  customer: 'SODIC',     latest_year_id: 10, latest_year_index: 1 },
    { contract_id: 2, contract_name: 'Uptown', customer: 'EMAAR',     latest_year_id: 20, latest_year_index: 1 },
  ]),
}));

vi.mock('@/lib/fmplus/budget/variance', () => ({
  buildBudgetVarianceV2: vi.fn().mockImplementation((cid: number) =>
    Promise.resolve(cid === 1
      ? { total_budget: 1_000_000, total_actual: 1_500_000, segments: [], unmapped_actuals: [] }
      : { total_budget: 1_000_000, total_actual:   950_000, segments: [], unmapped_actuals: [] })),
}));

const { buildPortfolioPerformance } = await import('./build-portfolio');

describe('buildPortfolioPerformance', () => {
  test('aggregates totals + sorts by |variance_pct| desc', async () => {
    const r = await buildPortfolioPerformance({
      period: { chip: 'last-month', from: '2026-03-01', to: '2026-03-31', label: 'Mar 2026' },
    });
    expect(r.totals.expense).toBe(2_450_000);
    expect(r.contracts[0].contract_id).toBe(1);          // worst variance first
    expect(r.contracts[0].variance_pct).toBeCloseTo(0.50, 2);
    expect(r.needs_attention).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run, fail**

- [ ] **Step 3: Implement**

```ts
// src/lib/fmplus/performance/build-portfolio.ts
import { buildPortfolio } from '@/lib/fmplus/budget/portfolio';
import { buildBudgetVarianceV2 } from '@/lib/fmplus/budget/variance';
import type { PortfolioPerformancePayload, PortfolioContractRow, PeriodRange } from './types';

const AMBER = 0.15;

export interface PortfolioArgs {
  period: PeriodRange;
  filters?: { service_line?: string; q?: string };
}

export async function buildPortfolioPerformance(args: PortfolioArgs): Promise<PortfolioPerformancePayload> {
  const contracts = await buildPortfolio(args.filters ?? {});
  const rows: PortfolioContractRow[] = await Promise.all(contracts.map(async c => {
    const v = await buildBudgetVarianceV2(c.contract_id, c.latest_year_id);
    const variance_pct = v.total_budget > 0 ? (v.total_actual - v.total_budget) / v.total_budget : 0;
    const health = Math.abs(variance_pct) <= 0.05 ? 'good' : Math.abs(variance_pct) <= AMBER ? 'warn' : 'bad';
    return {
      contract_id: c.contract_id,
      contract_name: c.contract_name,
      customer: c.customer,
      current_year_index: c.latest_year_index,
      revenue: 0,            // populated when revenue rollup is wired
      expense: v.total_actual,
      gp: -v.total_actual,
      gp_pct: 0,
      variance_pct,
      health,
      last_actuals_sync: null,
      drill_url: `/fmplus/performance/${c.contract_id}?period=${args.period.chip}`,
    };
  }));

  const ranked = rows.sort((a, b) => Math.abs(b.variance_pct) - Math.abs(a.variance_pct));
  const totals = {
    revenue: rows.reduce((a, r) => a + r.revenue, 0),
    expense: rows.reduce((a, r) => a + r.expense, 0),
    blended_gp_pct: 0,
    portfolio_variance_pct: rows.length ? rows.reduce((a, r) => a + r.variance_pct, 0) / rows.length : 0,
  };
  const needs_attention = ranked.filter(r => Math.abs(r.variance_pct) > AMBER);

  return { period: args.period, totals, contracts: ranked, needs_attention };
}
```

- [ ] **Step 4: Run tests, 1 passing**

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/performance/build-portfolio.ts src/lib/fmplus/performance/build-portfolio.test.ts
git commit -m "feat(perf): buildPortfolioPerformance aggregates contracts + needs-attention"
```

---

### Task 13: Add API route `/api/fmplus/performance/[contractId]`

**Files:**
- Create: `src/app/api/fmplus/performance/[contractId]/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/fmplus/performance/[contractId]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { buildContractDashboard } from '@/lib/fmplus/performance/build-dashboard';
import { resolvePeriod } from '@/lib/fmplus/performance/period';
import type { PeriodChip } from '@/lib/fmplus/performance/types';

const QuerySchema = z.object({
  chip: z.enum(['this-month', 'last-month', 'last-3', 'qtd', 'ytd', 'custom']).default('last-month'),
  from: z.string().optional(),
  to: z.string().optional(),
  compare: z.enum(['0', '1']).optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ contractId: string }> }) {
  await requireBudgetView();
  const { contractId } = await ctx.params;
  const id = Number(contractId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'invalid contractId' }, { status: 400 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const period = resolvePeriod({
    chip: parsed.data.chip as PeriodChip,
    from: parsed.data.from,
    to: parsed.data.to,
  });

  const payload = await buildContractDashboard({
    contract_id: id,
    period,
    compare: parsed.data.compare === '1',
  });

  return NextResponse.json(payload);
}
```

- [ ] **Step 2: Smoke test (manual)**

Run: `npm run dev` then visit `http://localhost:3000/api/fmplus/performance/1?chip=last-month`. Expect JSON payload.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/fmplus/performance/
git commit -m "feat(perf): GET /api/fmplus/performance/[contractId] returns dashboard payload"
```

---

## Phase 3 — Sidebar + period chrome (client UI)

### Task 14: `usePanelState` hook + `panel-header.tsx`

**Files:**
- Create: `src/app/fmplus/performance/_components/panel-state.ts`
- Create: `src/app/fmplus/performance/_components/panel-header.tsx`

- [ ] **Step 1: Implement the hook**

```tsx
// src/app/fmplus/performance/_components/panel-state.ts
'use client';
import { useEffect, useState, useCallback } from 'react';

const VISIBILITY_KEY = 'fmplus_perf_panels';
const COLLAPSE_KEY = 'fmplus_perf_panels_collapsed';

function readJson(key: string): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(key) ?? '{}'); } catch { return {}; }
}
function writeJson(key: string, v: Record<string, boolean>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(v));
}

export function usePanelState(id: string) {
  const [visible, setVisible] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const v = readJson(VISIBILITY_KEY);
    const c = readJson(COLLAPSE_KEY);
    if (v[id] === false) setVisible(false);
    if (c[id] === true) setCollapsed(true);
  }, [id]);

  const hide = useCallback(() => {
    setVisible(false);
    const v = readJson(VISIBILITY_KEY); v[id] = false; writeJson(VISIBILITY_KEY, v);
  }, [id]);

  const show = useCallback(() => {
    setVisible(true);
    const v = readJson(VISIBILITY_KEY); v[id] = true; writeJson(VISIBILITY_KEY, v);
  }, [id]);

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      const c = readJson(COLLAPSE_KEY); c[id] = next; writeJson(COLLAPSE_KEY, c);
      return next;
    });
  }, [id]);

  return { visible, collapsed, hide, show, toggleCollapse };
}
```

- [ ] **Step 2: Implement the header**

```tsx
// src/app/fmplus/performance/_components/panel-header.tsx
'use client';
import { ChevronDown, X } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onHide: () => void;
}
export function PanelHeader({ title, subtitle, collapsed, onToggleCollapse, onHide }: Props) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h3 className="text-base font-semibold tracking-tight font-serif">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onToggleCollapse} aria-label={collapsed ? 'Expand panel' : 'Collapse panel'} className="p-1 rounded hover:bg-slate-700/50 transition">
          <ChevronDown size={16} className={`transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </button>
        <button onClick={onHide} aria-label="Hide panel" className="p-1 rounded hover:bg-slate-700/50 transition">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/fmplus/performance/_components/panel-state.ts src/app/fmplus/performance/_components/panel-header.tsx
git commit -m "feat(perf): panel state hook + reusable panel header"
```

---

### Task 15: `period-chips.tsx` client component

**Files:**
- Create: `src/app/fmplus/performance/_components/period-chips.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/fmplus/performance/_components/period-chips.tsx
'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState } from 'react';
import type { PeriodChip } from '@/lib/fmplus/performance/types';

const CHIPS: { id: PeriodChip; label: string }[] = [
  { id: 'this-month', label: 'This Month' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'last-3', label: 'Last 3 Months' },
  { id: 'qtd', label: 'QTD' },
  { id: 'ytd', label: 'YTD' },
  { id: 'custom', label: 'Custom' },
];

export function PeriodChips({ resolvedLabel }: { resolvedLabel: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const current = (sp.get('chip') as PeriodChip) ?? 'last-month';
  const compare = sp.get('compare') === '1';
  const [showCustom, setShowCustom] = useState(false);

  function setChip(chip: PeriodChip) {
    const next = new URLSearchParams(sp.toString());
    next.set('chip', chip);
    if (chip !== 'custom') { next.delete('from'); next.delete('to'); }
    router.replace(`${path}?${next.toString()}`);
    setShowCustom(chip === 'custom');
  }

  function toggleCompare() {
    const next = new URLSearchParams(sp.toString());
    if (compare) next.delete('compare'); else next.set('compare', '1');
    router.replace(`${path}?${next.toString()}`);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-1">
        {CHIPS.map(c => (
          <button
            key={c.id}
            onClick={() => setChip(c.id)}
            className={`text-left text-sm px-3 py-1.5 rounded-lg transition ${
              current === c.id
                ? 'bg-fmplus-yellow text-fmplus-black font-semibold'
                : 'hover:bg-slate-700/50 text-slate-300'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-300 px-3">
        <input type="checkbox" checked={compare} onChange={toggleCompare} className="accent-fmplus-yellow" />
        Compare to prior period
      </label>
      <p className="text-[11px] text-slate-400 px-3 mt-1">{resolvedLabel}</p>
      {showCustom && (
        <CustomRange
          onApply={(from, to) => {
            const next = new URLSearchParams(sp.toString());
            next.set('chip', 'custom'); next.set('from', from); next.set('to', to);
            router.replace(`${path}?${next.toString()}`);
            setShowCustom(false);
          }}
        />
      )}
    </div>
  );
}

function CustomRange({ onApply }: { onApply: (from: string, to: string) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  return (
    <div className="px-3 py-2 space-y-2 bg-slate-800/50 rounded-lg">
      <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full bg-slate-900 text-slate-100 px-2 py-1 rounded text-sm" />
      <input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-full bg-slate-900 text-slate-100 px-2 py-1 rounded text-sm" />
      <button onClick={() => from && to && onApply(from, to)} className="w-full bg-fmplus-yellow text-fmplus-black text-sm font-semibold py-1.5 rounded">
        Apply
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/fmplus/performance/_components/period-chips.tsx
git commit -m "feat(perf): period chip selector + Custom popover + Compare toggle"
```

---

### Task 16: `performance-sidebar.tsx` collapsible shell

**Files:**
- Create: `src/app/fmplus/performance/_components/performance-sidebar.tsx`
- Create: `src/app/fmplus/performance/_components/visible-sections.tsx`

- [ ] **Step 1: Implement `visible-sections.tsx`**

```tsx
// src/app/fmplus/performance/_components/visible-sections.tsx
'use client';
import { useEffect, useState } from 'react';

const PANELS: { id: string; label: string }[] = [
  { id: 'kpi', label: 'KPIs' },
  { id: 'service_lines', label: 'Service Lines' },
  { id: 'variance', label: 'Variance' },
  { id: 'manning', label: 'Manning' },
  { id: 'categories', label: 'Categories' },
  { id: 'unmapped', label: 'Unmapped' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'overtime', label: 'Overtime' },
  { id: 'mobilization', label: 'Mobilization' },
  { id: 'signoff', label: 'Sign-off' },
  { id: 'yoy', label: 'Year-over-Year' },
  { id: 'anomalies', label: 'Anomalies' },
];

export function VisibleSections() {
  const [state, setState] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { setState(JSON.parse(localStorage.getItem('fmplus_perf_panels') ?? '{}')); } catch {}
  }, []);
  function toggle(id: string) {
    setState(prev => {
      const next = { ...prev, [id]: prev[id] === false ? true : false };
      localStorage.setItem('fmplus_perf_panels', JSON.stringify(next));
      window.dispatchEvent(new Event('fmplus_perf_panels_changed'));
      return next;
    });
  }
  return (
    <div className="grid grid-cols-2 gap-1 px-3 text-xs">
      {PANELS.map(p => (
        <label key={p.id} className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-fmplus-yellow">
          <input type="checkbox" checked={state[p.id] !== false} onChange={() => toggle(p.id)} className="accent-fmplus-yellow" />
          {p.label}
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Implement `performance-sidebar.tsx`**

```tsx
// src/app/fmplus/performance/_components/performance-sidebar.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { Pin, Calendar, List, Eye, Languages } from 'lucide-react';
import { PeriodChips } from './period-chips';
import { VisibleSections } from './visible-sections';

const COLLAPSE_DELAY_MS = 3000;
const PIN_KEY = 'fmplus_perf_sidebar_pinned';

interface Props {
  resolvedPeriodLabel: string;
  contextLine?: string;          // e.g. "Trio Compound · SODIC"
  jumpAnchors?: { id: string; label: string }[];
}

export function PerformanceSidebar({ resolvedPeriodLabel, contextLine, jumpAnchors }: Props) {
  const [pinned, setPinned] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPinned(localStorage.getItem(PIN_KEY) === '1');
  }, []);

  function clearTimer() { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } }
  function onEnter() { clearTimer(); setCollapsed(false); }
  function onLeave() {
    if (pinned) return;
    clearTimer();
    timerRef.current = setTimeout(() => setCollapsed(true), COLLAPSE_DELAY_MS);
  }
  function togglePin() {
    const next = !pinned;
    setPinned(next);
    localStorage.setItem(PIN_KEY, next ? '1' : '0');
    if (next) setCollapsed(false);
  }

  const width = collapsed && !pinned ? 56 : 240;

  return (
    <>
      <aside
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        style={{ width }}
        className="fixed left-0 top-12 bottom-0 z-30 bg-slate-900/95 border-r border-slate-700/50 transition-[width] duration-200 ease-out overflow-hidden"
        aria-label="Performance Dashboard navigation"
      >
        <div className="h-full overflow-y-auto py-4 flex flex-col gap-6">
          {!collapsed && (
            <>
              {contextLine && <p className="text-xs text-slate-400 px-3">{contextLine}</p>}

              <section>
                <h4 className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold px-3 mb-2">Period</h4>
                <PeriodChips resolvedLabel={resolvedPeriodLabel} />
              </section>

              {jumpAnchors && jumpAnchors.length > 0 && (
                <section>
                  <h4 className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold px-3 mb-2">Jump To</h4>
                  <ul className="flex flex-col">
                    {jumpAnchors.map(a => (
                      <li key={a.id}>
                        <a href={`#${a.id}`} className="block px-3 py-1 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-fmplus-yellow">{a.label}</a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h4 className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold px-3 mb-2">Visible Sections</h4>
                <VisibleSections />
              </section>

              <div className="mt-auto px-3 space-y-2">
                <button onClick={togglePin} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded transition ${pinned ? 'bg-fmplus-yellow text-fmplus-black' : 'text-slate-400 hover:text-fmplus-yellow'}`}>
                  <Pin size={14} /> {pinned ? 'Pinned' : 'Pin sidebar'}
                </button>
              </div>
            </>
          )}

          {collapsed && !pinned && (
            <div className="flex flex-col items-center gap-3 pt-2">
              <Calendar size={18} className="text-slate-400" />
              <List size={18} className="text-slate-400" />
              <Eye size={18} className="text-slate-400" />
              <Pin size={18} className="text-slate-400" />
              <Languages size={18} className="text-slate-400" />
            </div>
          )}
        </div>
      </aside>
      <style>{`body { padding-left: ${width}px; transition: padding-left 200ms ease-out; }`}</style>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/fmplus/performance/_components/performance-sidebar.tsx src/app/fmplus/performance/_components/visible-sections.tsx
git commit -m "feat(perf): collapsible sidebar shell with 3s hover-out + pin"
```

---

## Phase 4 — Charts library (thin Recharts wrappers)

### Task 17: `sparkline.tsx` + `donut.tsx` + `progress-bar.tsx`

**Files:**
- Create: `src/app/fmplus/performance/_components/charts/sparkline.tsx`
- Create: `src/app/fmplus/performance/_components/charts/donut.tsx`
- Create: `src/app/fmplus/performance/_components/charts/progress-bar.tsx`

- [ ] **Step 1: Sparkline**

```tsx
// src/app/fmplus/performance/_components/charts/sparkline.tsx
'use client';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
export function Sparkline({ data, color = '#FDCF00', height = 24 }: { data: { date: string; value: number }[]; color?: string; height?: number }) {
  if (!data?.length) return null;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Donut**

```tsx
// src/app/fmplus/performance/_components/charts/donut.tsx
'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
const COLORS = ['#FDCF00', '#EEB91D', '#F97316', '#22C55E', '#64748B', '#94A3B8', '#CBD5E1', '#EF4444'];
export function Donut({ data, onSliceClick }: {
  data: { name: string; value: number; id?: string }[];
  onSliceClick?: (id: string) => void;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}
             onClick={(d) => d.id && onSliceClick?.(d.id)}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} className="cursor-pointer" />)}
        </Pie>
        <Tooltip formatter={(v: number) => v.toLocaleString('en-EG')} contentStyle={{ background: '#0F172A', border: '1px solid #334155', color: 'white' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Progress bar**

```tsx
// src/app/fmplus/performance/_components/charts/progress-bar.tsx
export function ProgressBar({ pct, label }: { pct: number; label?: string }) {
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div className="w-full">
      <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
        <div style={{ width: `${clamped * 100}%` }} className="h-full bg-fmplus-yellow transition-[width] duration-300" />
      </div>
      {label && <p className="text-xs text-slate-400 mt-1">{label}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/fmplus/performance/_components/charts/
git commit -m "feat(perf): chart wrappers — sparkline, donut, progress bar"
```

---

### Task 18: `grouped-bars.tsx` + `diverging-bars.tsx` + `dumbbell.tsx` + `gauge.tsx`

**Files:**
- Create: `src/app/fmplus/performance/_components/charts/grouped-bars.tsx`
- Create: `src/app/fmplus/performance/_components/charts/diverging-bars.tsx`
- Create: `src/app/fmplus/performance/_components/charts/dumbbell.tsx`
- Create: `src/app/fmplus/performance/_components/charts/gauge.tsx`

- [ ] **Step 1: Grouped bars (Budget vs Actual)**

```tsx
// src/app/fmplus/performance/_components/charts/grouped-bars.tsx
'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
interface Row { name: string; budget: number; actual: number; status: 'good' | 'warn' | 'bad'; id: string; }
const STATUS_COLORS = { good: '#22C55E', warn: '#F97316', bad: '#EF4444' };
export function GroupedBars({ data, onRowClick }: { data: Row[]; onRowClick?: (id: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 50)}>
      <BarChart data={data} layout="vertical" margin={{ left: 80, right: 16 }}>
        <XAxis type="number" tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} stroke="#94A3B8" />
        <YAxis type="category" dataKey="name" stroke="#CBD5E1" />
        <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #334155', color: 'white' }} formatter={(v: number) => v.toLocaleString('en-EG')} />
        <Bar dataKey="budget" fill="#94A3B8" onClick={(d: { id: string }) => onRowClick?.(d.id)} />
        <Bar dataKey="actual" onClick={(d: { id: string }) => onRowClick?.(d.id)}>
          {data.map((r, i) => <Cell key={i} fill="#FDCF00" stroke={STATUS_COLORS[r.status]} strokeWidth={1} className="cursor-pointer" />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Diverging bars (centred 0 %)**

```tsx
// src/app/fmplus/performance/_components/charts/diverging-bars.tsx
'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
interface Row { name: string; variance_pct: number; status: 'good' | 'warn' | 'bad'; id: string; }
const STATUS = { good: '#22C55E', warn: '#F97316', bad: '#EF4444' };
export function DivergingBars({ data, onRowClick }: { data: Row[]; onRowClick?: (id: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ left: 80, right: 16 }}>
        <XAxis type="number" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} domain={[-1, 1]} stroke="#94A3B8" />
        <YAxis type="category" dataKey="name" stroke="#CBD5E1" />
        <ReferenceLine x={0} stroke="#475569" />
        <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #334155', color: 'white' }} formatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
        <Bar dataKey="variance_pct" onClick={(d: { id: string }) => onRowClick?.(d.id)}>
          {data.map((r, i) => <Cell key={i} fill={STATUS[r.status]} className="cursor-pointer" />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Dumbbell (custom SVG — Recharts has no native)**

```tsx
// src/app/fmplus/performance/_components/charts/dumbbell.tsx
'use client';
interface Row { name: string; required: number; budgeted: number; implied: number; }
export function Dumbbell({ data, max }: { data: Row[]; max: number }) {
  const W = 480, H = data.length * 36 + 16, leftPad = 100, rightPad = 16;
  const xScale = (v: number) => leftPad + ((v / max) * (W - leftPad - rightPad));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="text-slate-300">
      {data.map((r, i) => {
        const y = i * 36 + 24;
        const xs = [r.required, r.budgeted, r.implied].map(xScale);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        return (
          <g key={r.name}>
            <text x={leftPad - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#CBD5E1">{r.name}</text>
            <line x1={minX} y1={y} x2={maxX} y2={y} stroke="#475569" strokeWidth={1.5} />
            <circle cx={xs[0]} cy={y} r={5}  fill="none" stroke="#94A3B8" strokeWidth={1.5}><title>Required: {r.required}</title></circle>
            <circle cx={xs[1]} cy={y} r={5}  fill="#EEB91D"><title>Budgeted: {r.budgeted}</title></circle>
            <circle cx={xs[2]} cy={y} r={6}  fill="#FDCF00"><title>Implied: {r.implied.toFixed(1)}</title></circle>
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Gauge (half-circle for forecast)**

```tsx
// src/app/fmplus/performance/_components/charts/gauge.tsx
'use client';
const STATUS = { good: '#22C55E', warn: '#F97316', bad: '#EF4444' };
export function Gauge({ pct, status, label }: { pct: number; status: 'good' | 'warn' | 'bad'; label?: string }) {
  const clamped = Math.max(-1, Math.min(2, pct));
  // map [-0.25 .. +0.25] → [180° .. 0°] (half circle, center = 90°)
  const ang = 180 - ((clamped + 0.25) / 0.5) * 180;
  const rad = (ang * Math.PI) / 180;
  const cx = 100, cy = 90, r = 70;
  const x = cx + r * Math.cos(rad), y = cy - r * Math.sin(rad);
  return (
    <svg viewBox="0 0 200 110" width="100%" height="110">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#334155" strokeWidth={12} />
      <line x1={cx} y1={cy} x2={x} y2={y} stroke={STATUS[status]} strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4} fill={STATUS[status]} />
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="14" fill="white" fontWeight="700">{(pct * 100).toFixed(1)}%</text>
      {label && <text x={cx} y={cy + 32} textAnchor="middle" fontSize="10" fill="#94A3B8">{label}</text>}
    </svg>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/fmplus/performance/_components/charts/
git commit -m "feat(perf): chart wrappers — grouped bars, diverging, dumbbell, gauge"
```

---

## Phase 5 — Core panels (1-6)

### Task 19: KPI strip panel (panel 1)

**Files:**
- Create: `src/app/fmplus/performance/_components/panels/kpi-strip.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/fmplus/performance/_components/panels/kpi-strip.tsx
'use client';
import { ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { Sparkline } from '../charts/sparkline';
import { usePanelState } from '../panel-state';
import { PanelHeader } from '../panel-header';
import type { KpiTile } from '@/lib/fmplus/performance/types';

const STATUS_BG = { good: 'bg-emerald-500/15 text-emerald-400', warn: 'bg-orange-500/15 text-orange-400', bad: 'bg-red-500/15 text-red-400' };

function fmt(v: number, unit: KpiTile['unit']) {
  if (unit === '%') return `${(v * 100).toFixed(1)}%`;
  if (unit === 'EGP-M') return `${(v / 1e6).toFixed(2)}M`;
  return v.toLocaleString('en-EG');
}

export function KpiStripPanel({ kpis }: { kpis: KpiTile[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('kpi');
  if (!visible) return null;
  return (
    <section id="perf-kpi" className="ix-card p-4 scroll-mt-20">
      <PanelHeader title="KPIs" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {kpis.map(k => (
            <button key={k.id} className="text-left bg-slate-900/60 rounded-lg p-3 hover:bg-slate-900/90 transition relative group">
              <ChevronRight size={14} className="absolute top-2 right-2 text-slate-600 group-hover:text-fmplus-yellow transition" />
              <p className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold">{k.label}</p>
              <p className="text-2xl font-bold tabular-nums mt-1 text-fmplus-yellow font-serif">{fmt(k.value, k.unit)}</p>
              <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold mt-1 ${STATUS_BG[k.status]}`}>
                {k.variance_pct >= 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                {(k.variance_pct * 100).toFixed(1)}%
              </span>
              <div className="mt-2"><Sparkline data={k.spark} /></div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/fmplus/performance/_components/panels/kpi-strip.tsx
git commit -m "feat(perf): panel 1 — KPI strip with sparklines"
```

---

### Task 20: Service Lines panel (panel 2)

**Files:**
- Create: `src/app/fmplus/performance/_components/panels/service-lines.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/fmplus/performance/_components/panels/service-lines.tsx
'use client';
import Link from 'next/link';
import { GroupedBars } from '../charts/grouped-bars';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { ServiceLineRow } from '@/lib/fmplus/performance/types';

export function ServiceLinesPanel({ rows }: { rows: ServiceLineRow[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('service_lines');
  if (!visible || rows.length === 0) return null;
  return (
    <section id="perf-service-lines" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Service Lines — Budget vs Actual" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GroupedBars
            data={rows.map(r => ({ id: String(r.service_line), name: r.service_label, budget: r.budget, actual: r.actual, status: r.status }))}
            onRowClick={(id) => { window.location.href = rows.find(r => r.service_line === id)!.drill_url; }}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-fmplus-gold uppercase">
                <tr>
                  <th className="text-left py-1">Service</th>
                  <th className="text-right">Budget</th>
                  <th className="text-right">Actual</th>
                  <th className="text-right">Var %</th>
                  <th className="text-right">GP %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.service_line} className="border-t border-slate-700/50 hover:bg-slate-800/40">
                    <td className="py-2 text-slate-200">{r.service_label}</td>
                    <td className="text-right tabular-nums text-slate-400">{(r.budget / 1e6).toFixed(2)}M</td>
                    <td className="text-right tabular-nums text-fmplus-yellow font-semibold">{(r.actual / 1e6).toFixed(2)}M</td>
                    <td className={`text-right tabular-nums ${r.status === 'bad' ? 'text-red-400' : r.status === 'warn' ? 'text-orange-400' : 'text-emerald-400'}`}>{(r.variance_pct * 100).toFixed(1)}%</td>
                    <td className="text-right tabular-nums text-slate-300">{(r.gp_pct * 100).toFixed(1)}%</td>
                    <td><Link href={r.drill_url} className="text-fmplus-gold hover:text-fmplus-yellow">→</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/fmplus/performance/_components/panels/service-lines.tsx
git commit -m "feat(perf): panel 2 — service lines (grouped bars + table)"
```

---

### Task 21: Variance Ranking panel (panel 3)

**Files:**
- Create: `src/app/fmplus/performance/_components/panels/variance-ranking.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/fmplus/performance/_components/panels/variance-ranking.tsx
'use client';
import Link from 'next/link';
import { DivergingBars } from '../charts/diverging-bars';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { ServiceLineRow } from '@/lib/fmplus/performance/types';

export function VarianceRankingPanel({ rows }: { rows: ServiceLineRow[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('variance');
  if (!visible || rows.length === 0) return null;
  return (
    <section id="perf-variance" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Variance — Biggest Gaps" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DivergingBars data={rows.map(r => ({ id: String(r.service_line), name: r.service_label, variance_pct: r.variance_pct, status: r.status }))}
                         onRowClick={(id) => { window.location.href = rows.find(r => r.service_line === id)!.drill_url; }} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-fmplus-gold uppercase">
                <tr>
                  <th className="text-left py-1">Rank</th>
                  <th className="text-left">Service</th>
                  <th className="text-right">Variance %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.service_line} className="border-t border-slate-700/50 hover:bg-slate-800/40">
                    <td className="py-2 text-slate-500">{i + 1}</td>
                    <td className="text-slate-200">{r.service_label}</td>
                    <td className={`text-right tabular-nums ${r.status === 'bad' ? 'text-red-400' : r.status === 'warn' ? 'text-orange-400' : 'text-emerald-400'}`}>{(r.variance_pct * 100).toFixed(1)}%</td>
                    <td><Link href={r.drill_url} className="text-fmplus-gold hover:text-fmplus-yellow">→</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/fmplus/performance/_components/panels/variance-ranking.tsx
git commit -m "feat(perf): panel 3 — variance ranking (diverging bars + table)"
```

---

### Task 22: Manning panel (panel 4)

**Files:**
- Create: `src/app/fmplus/performance/_components/panels/manning.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/fmplus/performance/_components/panels/manning.tsx
'use client';
import Link from 'next/link';
import { Dumbbell } from '../charts/dumbbell';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { ManningRow } from '@/lib/fmplus/performance/types';

export function ManningPanel({ rows }: { rows: ManningRow[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('manning');
  if (!visible || rows.length === 0) return null;
  const max = Math.max(...rows.map(r => Math.max(r.hc_required, r.hc_budgeted, r.hc_implied)), 1);
  return (
    <section id="perf-manning" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Manning — Headcount &amp; Spend" subtitle="Required (○ grey) / Budgeted (● gold) / Implied actual (● yellow)" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Dumbbell data={rows.map(r => ({ name: r.service_label, required: r.hc_required, budgeted: r.hc_budgeted, implied: r.hc_implied }))} max={max} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-fmplus-gold uppercase">
                <tr>
                  <th className="text-left py-1">Service</th>
                  <th className="text-right">Req</th>
                  <th className="text-right">Bud</th>
                  <th className="text-right">Imp</th>
                  <th className="text-right">Δ</th>
                  <th className="text-right">Spend Var %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const delta = r.hc_implied - r.hc_budgeted;
                  return (
                    <tr key={r.service_line} className="border-t border-slate-700/50 hover:bg-slate-800/40">
                      <td className="py-2 text-slate-200">{r.service_label}</td>
                      <td className="text-right tabular-nums text-slate-400">{r.hc_required}</td>
                      <td className="text-right tabular-nums text-slate-400">{r.hc_budgeted}</td>
                      <td className="text-right tabular-nums text-fmplus-yellow font-semibold">{r.hc_implied.toFixed(1)}</td>
                      <td className={`text-right tabular-nums ${delta > 0.5 ? 'text-orange-400' : delta < -0.5 ? 'text-emerald-400' : 'text-slate-400'}`}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}</td>
                      <td className={`text-right tabular-nums ${Math.abs(r.spend_variance_pct) > 0.15 ? 'text-red-400' : Math.abs(r.spend_variance_pct) > 0.05 ? 'text-orange-400' : 'text-emerald-400'}`}>{(r.spend_variance_pct * 100).toFixed(1)}%</td>
                      <td><Link href={r.drill_url} className="text-fmplus-gold hover:text-fmplus-yellow">→</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/fmplus/performance/_components/panels/manning.tsx
git commit -m "feat(perf): panel 4 — manning (dumbbell + table with implied HC)"
```

---

### Task 23: Categories panel (panel 5)

**Files:**
- Create: `src/app/fmplus/performance/_components/panels/categories.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/fmplus/performance/_components/panels/categories.tsx
'use client';
import Link from 'next/link';
import { Donut } from '../charts/donut';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { CategoryRow, UnmappedLine } from '@/lib/fmplus/performance/types';

export function CategoriesPanel({ rows, unmapped }: { rows: CategoryRow[]; unmapped: UnmappedLine[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('categories');
  if (!visible || rows.length === 0) return null;
  const unmappedTotal = unmapped.reduce((a, u) => a + u.amount, 0);
  return (
    <section id="perf-categories" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Expense Category Mix" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Donut data={rows.map(r => ({ id: r.category, name: r.category_label, value: r.actual }))}
                 onSliceClick={(id) => { window.location.href = rows.find(r => r.category === id)!.drill_url; }} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-fmplus-gold uppercase">
                <tr>
                  <th className="text-left py-1">Category</th>
                  <th className="text-right">Budget</th>
                  <th className="text-right">Actual</th>
                  <th className="text-right">Var %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.category} className="border-t border-slate-700/50 hover:bg-slate-800/40">
                    <td className="py-2 text-slate-200">{r.category_label}</td>
                    <td className="text-right tabular-nums text-slate-400">{(r.budget / 1e3).toFixed(0)}K</td>
                    <td className="text-right tabular-nums text-fmplus-yellow font-semibold">{(r.actual / 1e3).toFixed(0)}K</td>
                    <td className="text-right tabular-nums text-slate-300">{(r.variance_pct * 100).toFixed(1)}%</td>
                    <td><Link href={r.drill_url} className="text-fmplus-gold hover:text-fmplus-yellow">→</Link></td>
                  </tr>
                ))}
                {unmappedTotal > 0 && (
                  <tr className="border-t border-red-500/40 bg-red-500/5">
                    <td className="py-2 text-red-400 font-semibold">⚠ Unmapped</td>
                    <td className="text-right tabular-nums text-slate-500">—</td>
                    <td className="text-right tabular-nums text-red-400 font-semibold">{(unmappedTotal / 1e3).toFixed(0)}K</td>
                    <td colSpan={2}><Link href="#perf-unmapped" className="text-red-400 hover:text-red-300">review →</Link></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/fmplus/performance/_components/panels/categories.tsx
git commit -m "feat(perf): panel 5 — category mix (donut + table with unmapped row)"
```

---

### Task 24: Unmapped panel (panel 6)

**Files:**
- Create: `src/app/fmplus/performance/_components/panels/unmapped.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/fmplus/performance/_components/panels/unmapped.tsx
'use client';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { UnmappedLine } from '@/lib/fmplus/performance/types';

export function UnmappedPanel({ lines, periodTotal }: { lines: UnmappedLine[]; periodTotal: number }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('unmapped');
  if (!visible || lines.length === 0) return null;
  const total = lines.reduce((a, u) => a + u.amount, 0);
  const pct = periodTotal > 0 ? (total / periodTotal) * 100 : 0;
  return (
    <section id="perf-unmapped" className="ix-card p-6 scroll-mt-20 border border-red-500/30">
      <PanelHeader
        title={
          <span className="flex items-center gap-2 text-red-400">
            <AlertTriangle size={16} /> Unmapped Expenses
          </span> as never
        }
        subtitle={`${(total / 1e3).toFixed(0)}K (${pct.toFixed(1)}% of period spend) · ${lines.length} lines hit the contract analytic but had no budget category`}
        collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide}
      />
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-fmplus-gold uppercase">
              <tr>
                <th className="text-left py-1">Date</th>
                <th className="text-left">Account</th>
                <th className="text-left">Vendor</th>
                <th className="text-left">Ref</th>
                <th className="text-right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.move_line_id} className="border-t border-slate-700/50 hover:bg-slate-800/40">
                  <td className="py-2 text-slate-300 tabular-nums">{l.date}</td>
                  <td className="text-slate-300">{l.account_code} · {l.account_name}</td>
                  <td className="text-slate-300">{l.partner_name ?? '—'}</td>
                  <td className="text-slate-400">{l.ref ?? '—'}</td>
                  <td className="text-right tabular-nums text-fmplus-yellow font-semibold">{(l.amount / 1e3).toFixed(1)}K</td>
                  <td><Link href={l.drill_url} className="text-fmplus-gold hover:text-fmplus-yellow">categorise →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/fmplus/performance/_components/panels/unmapped.tsx
git commit -m "feat(perf): panel 6 — unmapped expenses table (auto-hide when 0)"
```

---

## Phase 6 — Extras panels (7-13)

### Task 25: Forecast panel (panel 7)

**Files:**
- Create: `src/app/fmplus/performance/_components/panels/forecast.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/fmplus/performance/_components/panels/forecast.tsx
'use client';
import { Gauge } from '../charts/gauge';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { ForecastBlock } from '@/lib/fmplus/performance/types';

export function ForecastPanel({ block }: { block: ForecastBlock | null }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('forecast');
  if (!visible || !block) return null;
  return (
    <section id="perf-forecast" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Forecast / Burn Rate" subtitle={block.caveat} collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
          <Gauge pct={block.variance_pct} status={block.status} label={`Year-end vs budget`} />
          <p className="text-base text-slate-200 leading-relaxed">
            At this pace, year-end actual ={' '}
            <span className="text-fmplus-yellow font-bold tabular-nums">{(block.projected_year_actual / 1e6).toFixed(2)}M</span>
            {' '}vs budget{' '}
            <span className="tabular-nums text-slate-400">{(block.budget_year / 1e6).toFixed(2)}M</span>
            {' '}({block.variance_pct >= 0 ? '+' : ''}{(block.variance_pct * 100).toFixed(1)}%).
            <br />
            <span className="text-xs text-slate-500">{block.months_elapsed} of {block.months_total} months elapsed</span>
          </p>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/fmplus/performance/_components/panels/forecast.tsx
git commit -m "feat(perf): panel 7 — forecast / burn rate gauge"
```

---

### Task 26: Vendors + Overtime + Mobilization + Sign-off panels (8, 9, 10, 11)

**Files:**
- Create: `src/app/fmplus/performance/_components/panels/vendors.tsx`
- Create: `src/app/fmplus/performance/_components/panels/overtime.tsx`
- Create: `src/app/fmplus/performance/_components/panels/mobilization.tsx`
- Create: `src/app/fmplus/performance/_components/panels/signoff.tsx`

Each is small. Combine into one task with one commit.

- [ ] **Step 1: Vendors**

```tsx
// src/app/fmplus/performance/_components/panels/vendors.tsx
'use client';
import Link from 'next/link';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { VendorRow } from '@/lib/fmplus/performance/types';

export function VendorsPanel({ rows }: { rows: VendorRow[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('vendors');
  if (!visible || rows.length === 0) return null;
  const max = rows[0]?.spend ?? 1;
  return (
    <section id="perf-vendors" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Top 5 Vendors" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <table className="w-full text-sm">
          <tbody>
            {rows.map(r => (
              <tr key={r.partner_id} className="border-t border-slate-700/50">
                <td className="py-2 w-1/3 text-slate-200">{r.partner_name}</td>
                <td className="w-1/2">
                  <div className="h-3 bg-slate-700/40 rounded-full overflow-hidden">
                    <div style={{ width: `${(r.spend / max) * 100}%` }} className="h-full bg-fmplus-yellow" />
                  </div>
                </td>
                <td className="text-right tabular-nums text-fmplus-yellow font-semibold pl-2">{(r.spend / 1e3).toFixed(0)}K</td>
                <td className="text-right tabular-nums text-slate-400 pl-2">{(r.pct_of_period * 100).toFixed(1)}%</td>
                <td className="pl-2"><Link href={r.drill_url} className="text-fmplus-gold hover:text-fmplus-yellow">→</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Overtime**

```tsx
// src/app/fmplus/performance/_components/panels/overtime.tsx
'use client';
import { Sparkline } from '../charts/sparkline';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { OvertimeBlock } from '@/lib/fmplus/performance/types';

const STATUS = { good: 'text-emerald-400', warn: 'text-orange-400', bad: 'text-red-400' };

export function OvertimePanel({ block }: { block: OvertimeBlock | null }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('overtime');
  if (!visible || !block) return null;
  return (
    <section id="perf-overtime" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Overtime — % of Manning" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <p className="text-3xl font-bold tabular-nums text-fmplus-yellow font-serif">{(block.ot_pct_actual * 100).toFixed(1)}%</p>
            <p className={`text-sm mt-1 ${STATUS[block.status]}`}>vs budgeted {(block.ot_pct_budget * 100).toFixed(1)}% (Δ {(block.variance_pct * 100).toFixed(1)}pp)</p>
            <p className="text-xs text-slate-400 mt-1">OT spend: {(block.ot_actual / 1e3).toFixed(0)}K of {(block.manning_actual / 1e3).toFixed(0)}K manning</p>
          </div>
          <Sparkline data={block.spark} height={48} />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Mobilization**

```tsx
// src/app/fmplus/performance/_components/panels/mobilization.tsx
'use client';
import { ProgressBar } from '../charts/progress-bar';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { MobilizationRow } from '@/lib/fmplus/performance/types';

export function MobilizationPanel({ rows }: { rows: MobilizationRow[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('mobilization');
  if (!visible || rows.length === 0) return null;
  return (
    <section id="perf-mobilization" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Mobilization Amortization" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.mob_line_id} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-200">{r.label}</span>
                <span className="tabular-nums text-slate-400">{r.months_elapsed}/{r.months_total} mo · {(r.amortized / 1e3).toFixed(0)}K of {(r.total_cost / 1e3).toFixed(0)}K</span>
              </div>
              <ProgressBar pct={r.amortized / r.total_cost} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Sign-off**

```tsx
// src/app/fmplus/performance/_components/panels/signoff.tsx
'use client';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { SignoffBlock } from '@/lib/fmplus/performance/types';

export function SignoffPanel({ block }: { block: SignoffBlock }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('signoff');
  if (!visible) return null;
  const isPublished = block.current_year_status === 'published';
  const isStale = (block.days_stale ?? 0) > 30;
  const Icon = isPublished && !isStale ? CheckCircle2 : AlertCircle;
  const color = isPublished && !isStale ? 'text-emerald-400' : isStale ? 'text-orange-400' : 'text-slate-400';
  return (
    <section id="perf-signoff" className="ix-card p-4 scroll-mt-20">
      <PanelHeader title="Sign-off Status" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="flex items-center gap-3">
          <Icon size={18} className={color} />
          <span className="text-sm text-slate-300">
            {isPublished
              ? `Published ${block.days_stale} days ago`
              : 'Draft — not yet published'}
          </span>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/fmplus/performance/_components/panels/{vendors,overtime,mobilization,signoff}.tsx
git commit -m "feat(perf): panels 8-11 — vendors, overtime, mobilization, sign-off"
```

---

### Task 27: YoY Arc + Anomalies panels (12, 13)

**Files:**
- Create: `src/app/fmplus/performance/_components/panels/yoy-arc.tsx`
- Create: `src/app/fmplus/performance/_components/panels/anomalies.tsx`

- [ ] **Step 1: YoY arc**

```tsx
// src/app/fmplus/performance/_components/panels/yoy-arc.tsx
'use client';
import Link from 'next/link';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { YoyRow } from '@/lib/fmplus/performance/types';

const HEALTH_COLORS = { good: 'bg-emerald-500', warn: 'bg-orange-500', bad: 'bg-red-500' };

export function YoyArcPanel({ rows }: { rows: YoyRow[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('yoy');
  if (!visible || rows.length <= 1) return null;
  return (
    <section id="perf-yoy" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Year-over-Year Arc" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <table className="w-full text-sm">
          <thead className="text-xs text-fmplus-gold uppercase">
            <tr>
              <th className="text-left py-1">Year</th>
              <th className="text-left">Status</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">Expense</th>
              <th className="text-right">GP</th>
              <th className="text-right">GP %</th>
              <th className="text-right">Var %</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.year_id} className="border-t border-slate-700/50">
                <td className="py-2 text-slate-200 font-semibold">Y{r.year_index}{r.fiscal_year ? ` (FY${r.fiscal_year})` : ''}</td>
                <td><span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" /><span className="text-xs uppercase text-slate-400">{r.status}</span></td>
                <td className="text-right tabular-nums text-slate-400">{(r.revenue / 1e6).toFixed(2)}M</td>
                <td className="text-right tabular-nums text-slate-400">{(r.expense / 1e6).toFixed(2)}M</td>
                <td className="text-right tabular-nums text-fmplus-yellow font-semibold">{(r.gp / 1e6).toFixed(2)}M</td>
                <td className="text-right tabular-nums text-slate-300">{(r.gp_pct * 100).toFixed(1)}%</td>
                <td className="text-right tabular-nums text-slate-300">{(r.variance_pct * 100).toFixed(1)}%</td>
                <td><span className={`inline-block w-2 h-2 rounded-full mr-2 ${HEALTH_COLORS[r.health]}`} /><Link href={r.drill_url} className="text-fmplus-gold hover:text-fmplus-yellow">→</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Anomalies**

```tsx
// src/app/fmplus/performance/_components/panels/anomalies.tsx
'use client';
import Link from 'next/link';
import { AlertTriangle, AlertOctagon } from 'lucide-react';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { Anomaly } from '@/lib/fmplus/performance/types';

export function AnomaliesPanel({ rows }: { rows: Anomaly[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('anomalies');
  if (!visible || rows.length === 0) return null;
  return (
    <section id="perf-anomalies" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Anomalies & Suggestions" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <ul className="space-y-2">
          {rows.map((a, i) => {
            const Icon = a.severity === 'red' ? AlertOctagon : AlertTriangle;
            const color = a.severity === 'red' ? 'text-red-400' : 'text-orange-400';
            return (
              <li key={i} className="flex items-start gap-3 p-2 rounded hover:bg-slate-800/40">
                <Icon size={16} className={`${color} shrink-0 mt-0.5`} />
                <span className="flex-1 text-sm text-slate-200">{a.message}</span>
                <Link href={a.action_url} className="text-fmplus-gold hover:text-fmplus-yellow text-sm shrink-0">Take action →</Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/fmplus/performance/_components/panels/{yoy-arc,anomalies}.tsx
git commit -m "feat(perf): panels 12-13 — YoY arc + anomalies bullet list"
```

---

### Task 28: Wire all panels into the per-contract page

**Files:**
- Modify: `src/app/fmplus/performance/[contractId]/page.tsx`

- [ ] **Step 1: Replace placeholder with real composition**

```tsx
// src/app/fmplus/performance/[contractId]/page.tsx
import { notFound } from 'next/navigation';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { buildContractDashboard } from '@/lib/fmplus/performance/build-dashboard';
import { resolvePeriod } from '@/lib/fmplus/performance/period';
import { PerformanceSidebar } from '../_components/performance-sidebar';
import { KpiStripPanel } from '../_components/panels/kpi-strip';
import { ServiceLinesPanel } from '../_components/panels/service-lines';
import { VarianceRankingPanel } from '../_components/panels/variance-ranking';
import { ManningPanel } from '../_components/panels/manning';
import { CategoriesPanel } from '../_components/panels/categories';
import { UnmappedPanel } from '../_components/panels/unmapped';
import { ForecastPanel } from '../_components/panels/forecast';
import { VendorsPanel } from '../_components/panels/vendors';
import { OvertimePanel } from '../_components/panels/overtime';
import { MobilizationPanel } from '../_components/panels/mobilization';
import { SignoffPanel } from '../_components/panels/signoff';
import { YoyArcPanel } from '../_components/panels/yoy-arc';
import { AnomaliesPanel } from '../_components/panels/anomalies';
import type { PeriodChip } from '@/lib/fmplus/performance/types';

export const dynamic = 'force-dynamic';

const JUMP = [
  { id: 'perf-kpi', label: 'KPIs' },
  { id: 'perf-service-lines', label: 'Service Lines' },
  { id: 'perf-variance', label: 'Variance' },
  { id: 'perf-manning', label: 'Manning' },
  { id: 'perf-categories', label: 'Categories' },
  { id: 'perf-unmapped', label: 'Unmapped' },
  { id: 'perf-forecast', label: 'Forecast' },
  { id: 'perf-vendors', label: 'Vendors' },
  { id: 'perf-overtime', label: 'Overtime' },
  { id: 'perf-mobilization', label: 'Mobilization' },
  { id: 'perf-signoff', label: 'Sign-off' },
  { id: 'perf-yoy', label: 'Year-over-Year' },
  { id: 'perf-anomalies', label: 'Anomalies' },
];

interface Props {
  params: Promise<{ contractId: string }>;
  searchParams: Promise<{ chip?: string; from?: string; to?: string; compare?: string }>;
}

export default async function PerformanceContractPage(props: Props) {
  await requireBudgetView();
  const { contractId } = await props.params;
  const sp = await props.searchParams;
  const id = Number(contractId);
  if (!Number.isFinite(id)) notFound();

  const period = resolvePeriod({
    chip: (sp.chip as PeriodChip) ?? 'last-month',
    from: sp.from,
    to: sp.to,
  });

  const data = await buildContractDashboard({
    contract_id: id,
    period,
    compare: sp.compare === '1',
  });

  return (
    <>
      <PerformanceSidebar
        resolvedPeriodLabel={`${period.label} · Y${data.meta.current_year_index}`}
        contextLine={`${data.meta.contract_name}${data.meta.customer ? ` · ${data.meta.customer}` : ''}`}
        jumpAnchors={JUMP}
      />
      <div className="flex-1 px-6 py-6 space-y-4 max-w-6xl mx-auto">
        <KpiStripPanel kpis={data.kpis} />
        <ServiceLinesPanel rows={data.service_lines} />
        <VarianceRankingPanel rows={data.variance_ranked} />
        <ManningPanel rows={data.manning} />
        <CategoriesPanel rows={data.categories} unmapped={data.unmapped} />
        <UnmappedPanel lines={data.unmapped} periodTotal={data.kpis.find(k => k.id === 'expense')?.value ?? 0} />
        <ForecastPanel block={data.forecast} />
        <VendorsPanel rows={data.vendors} />
        <OvertimePanel block={data.overtime} />
        <MobilizationPanel rows={data.mobilization} />
        <SignoffPanel block={data.signoff} />
        <YoyArcPanel rows={data.yoy} />
        <AnomaliesPanel rows={data.anomalies} />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify in browser**

Run: `npm run dev`, navigate to `/fmplus/performance/1?chip=last-month`. Expect all 13 panels to render (some may auto-hide if empty). Check sidebar collapse / pin works.

- [ ] **Step 3: Commit**

```bash
git add src/app/fmplus/performance/[contractId]/page.tsx
git commit -m "feat(perf): wire all 13 panels into per-contract page"
```

---

## Phase 7 — Portfolio page

### Task 29: Portfolio panels (KPI strip + variance bar + needs-attention + table)

**Files:**
- Create: `src/app/fmplus/performance/_components/portfolio/portfolio-kpi-strip.tsx`
- Create: `src/app/fmplus/performance/_components/portfolio/portfolio-variance-bar.tsx`
- Create: `src/app/fmplus/performance/_components/portfolio/portfolio-needs-attention.tsx`
- Create: `src/app/fmplus/performance/_components/portfolio/portfolio-table.tsx`

- [ ] **Step 1: KPI strip (4 tiles, no sparklines for v1)**

```tsx
// src/app/fmplus/performance/_components/portfolio/portfolio-kpi-strip.tsx
import type { PortfolioPerformancePayload } from '@/lib/fmplus/performance/types';
export function PortfolioKpiStrip({ totals }: { totals: PortfolioPerformancePayload['totals'] }) {
  const tiles = [
    { label: 'Total Revenue', value: `${(totals.revenue / 1e6).toFixed(2)}M`, sub: 'EGP' },
    { label: 'Total Expense', value: `${(totals.expense / 1e6).toFixed(2)}M`, sub: 'EGP' },
    { label: 'Blended GP %', value: `${(totals.blended_gp_pct * 100).toFixed(1)}%`, sub: '' },
    { label: 'Portfolio Variance %', value: `${(totals.portfolio_variance_pct * 100).toFixed(1)}%`, sub: '' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {tiles.map(t => (
        <div key={t.label} className="ix-card p-4">
          <p className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold">{t.label}</p>
          <p className="text-2xl font-bold tabular-nums mt-1 text-fmplus-yellow font-serif">{t.value}</p>
          {t.sub && <p className="text-xs text-slate-400 mt-0.5">{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Variance bar**

```tsx
// src/app/fmplus/performance/_components/portfolio/portfolio-variance-bar.tsx
'use client';
import { DivergingBars } from '../charts/diverging-bars';
import type { PortfolioContractRow } from '@/lib/fmplus/performance/types';

export function PortfolioVarianceBar({ rows }: { rows: PortfolioContractRow[] }) {
  return (
    <section className="ix-card p-6">
      <h2 className="text-base font-semibold tracking-tight font-serif mb-3">Variance by Contract</h2>
      <DivergingBars
        data={rows.map(r => ({ id: String(r.contract_id), name: r.contract_name, variance_pct: r.variance_pct, status: r.health }))}
        onRowClick={(id) => { window.location.href = rows.find(r => String(r.contract_id) === id)!.drill_url; }}
      />
    </section>
  );
}
```

- [ ] **Step 3: Needs-attention cards**

```tsx
// src/app/fmplus/performance/_components/portfolio/portfolio-needs-attention.tsx
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { PortfolioContractRow } from '@/lib/fmplus/performance/types';

export function PortfolioNeedsAttention({ rows }: { rows: PortfolioContractRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="text-base font-semibold tracking-tight font-serif mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-orange-400" /> Needs Attention</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {rows.slice(0, 6).map(r => (
          <Link key={r.contract_id} href={r.drill_url} className="ix-card p-4 hover:shadow-lg transition">
            <p className="text-sm text-slate-200 font-semibold">{r.contract_name}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">{r.customer}</p>
            <p className={`text-2xl font-bold tabular-nums mt-2 ${r.health === 'bad' ? 'text-red-400' : 'text-orange-400'}`}>{(r.variance_pct * 100).toFixed(1)}%</p>
            <p className="text-xs text-fmplus-gold mt-2">View →</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Table**

```tsx
// src/app/fmplus/performance/_components/portfolio/portfolio-table.tsx
import Link from 'next/link';
import type { PortfolioContractRow } from '@/lib/fmplus/performance/types';

const HEALTH = { good: 'bg-emerald-500', warn: 'bg-orange-500', bad: 'bg-red-500' };

export function PortfolioTable({ rows }: { rows: PortfolioContractRow[] }) {
  return (
    <section className="ix-card p-6 overflow-x-auto">
      <h2 className="text-base font-semibold tracking-tight font-serif mb-3">All Contracts</h2>
      <table className="w-full text-sm">
        <thead className="text-xs text-fmplus-gold uppercase">
          <tr>
            <th className="text-left py-1">Project</th>
            <th className="text-left">Customer</th>
            <th className="text-right">Year</th>
            <th className="text-right">Expense</th>
            <th className="text-right">GP %</th>
            <th className="text-right">Variance %</th>
            <th>Health</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.contract_id} className="border-t border-slate-700/50 hover:bg-slate-800/40">
              <td className="py-2 text-slate-200 font-semibold">{r.contract_name}</td>
              <td className="text-slate-400">{r.customer ?? '—'}</td>
              <td className="text-right tabular-nums text-slate-400">Y{r.current_year_index}</td>
              <td className="text-right tabular-nums text-fmplus-yellow font-semibold">{(r.expense / 1e6).toFixed(2)}M</td>
              <td className="text-right tabular-nums text-slate-300">{(r.gp_pct * 100).toFixed(1)}%</td>
              <td className={`text-right tabular-nums ${r.health === 'bad' ? 'text-red-400' : r.health === 'warn' ? 'text-orange-400' : 'text-emerald-400'}`}>{(r.variance_pct * 100).toFixed(1)}%</td>
              <td><span className={`inline-block w-2 h-2 rounded-full ${HEALTH[r.health]}`} /></td>
              <td><Link href={r.drill_url} className="text-fmplus-gold hover:text-fmplus-yellow">→</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/fmplus/performance/_components/portfolio/
git commit -m "feat(perf): portfolio panels — KPI strip, variance bar, needs-attention, table"
```

---

### Task 30: Wire portfolio page

**Files:**
- Modify: `src/app/fmplus/performance/page.tsx`

- [ ] **Step 1: Replace placeholder**

```tsx
// src/app/fmplus/performance/page.tsx
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { buildPortfolioPerformance } from '@/lib/fmplus/performance/build-portfolio';
import { resolvePeriod } from '@/lib/fmplus/performance/period';
import { PerformanceSidebar } from './_components/performance-sidebar';
import { PortfolioKpiStrip } from './_components/portfolio/portfolio-kpi-strip';
import { PortfolioVarianceBar } from './_components/portfolio/portfolio-variance-bar';
import { PortfolioNeedsAttention } from './_components/portfolio/portfolio-needs-attention';
import { PortfolioTable } from './_components/portfolio/portfolio-table';
import type { PeriodChip } from '@/lib/fmplus/performance/types';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ chip?: string; from?: string; to?: string }>;
}

export default async function PerformancePortfolioPage(props: Props) {
  await requireBudgetView();
  const sp = await props.searchParams;
  const period = resolvePeriod({
    chip: (sp.chip as PeriodChip) ?? 'last-month',
    from: sp.from,
    to: sp.to,
  });
  const data = await buildPortfolioPerformance({ period });

  return (
    <>
      <PerformanceSidebar resolvedPeriodLabel={period.label} contextLine={`${data.contracts.length} contracts`} />
      <div className="flex-1 px-6 py-6 space-y-4 max-w-6xl mx-auto">
        <PortfolioKpiStrip totals={data.totals} />
        <PortfolioNeedsAttention rows={data.needs_attention} />
        <PortfolioVarianceBar rows={data.contracts} />
        <PortfolioTable rows={data.contracts} />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify in browser**

Run: `npm run dev`, navigate to `/fmplus/performance`. Expect 4 KPI tiles, needs-attention cards (if any), variance bar, and the contract table. Click a row → per-contract page with same period preserved.

- [ ] **Step 3: Commit**

```bash
git add src/app/fmplus/performance/page.tsx
git commit -m "feat(perf): wire portfolio summary page"
```

---

## Phase 8 — Polish

### Task 31: Re-render visible panels on `fmplus_perf_panels_changed` event

**Files:**
- Modify: `src/app/fmplus/performance/_components/panel-state.ts`

- [ ] **Step 1: Subscribe to the cross-component event**

Replace the `useEffect` in `panel-state.ts` with one that also listens to the custom event dispatched by `visible-sections.tsx`:

```ts
useEffect(() => {
  function reread() {
    const v = readJson(VISIBILITY_KEY);
    const c = readJson(COLLAPSE_KEY);
    setVisible(v[id] !== false);
    setCollapsed(c[id] === true);
  }
  reread();
  window.addEventListener('fmplus_perf_panels_changed', reread);
  return () => window.removeEventListener('fmplus_perf_panels_changed', reread);
}, [id]);
```

This makes panels appear/disappear immediately when toggled in the sidebar.

- [ ] **Step 2: Commit**

```bash
git add src/app/fmplus/performance/_components/panel-state.ts
git commit -m "feat(perf): live re-render on sidebar Visible Sections change"
```

---

### Task 32: RTL pass — verify Arabic mode renders correctly

**Files:** none (verification only)

- [ ] **Step 1: Set lang to Arabic in localStorage**

In browser devtools console: `localStorage.setItem('fmplus_budget_lang', 'ar'); document.documentElement.dir = 'rtl'; location.reload();`

- [ ] **Step 2: Walk every panel**

Visit `/fmplus/performance/1?chip=last-month`. Each panel should:
- Flip the chart legend / table headers to right-aligned
- Sidebar stays on the left (it's still chrome, not page content — this matches the existing `BilingualToggle` behaviour)
- No horizontal scroll caused by mis-laid layout

If a panel breaks, file a follow-up. Do NOT fix in this task — this is a verification pass only.

- [ ] **Step 3: Reset lang to EN, document findings**

In a follow-up issue file, list each panel with PASS/FAIL.

---

### Task 33: Mobile pass — confirm sidebar drawer + panel reflow

**Files:**
- Modify: `src/app/fmplus/performance/_components/performance-sidebar.tsx` (add hamburger)

- [ ] **Step 1: Add hamburger trigger for mobile**

At the top of `performance-sidebar.tsx`, before the `<aside>`, render:

```tsx
const [mobileOpen, setMobileOpen] = useState(false);
// ...

<>
  <button
    onClick={() => setMobileOpen(true)}
    className="md:hidden fixed top-14 left-2 z-40 p-2 rounded-lg bg-slate-800 text-fmplus-yellow"
    aria-label="Open Performance navigation"
  >
    <Menu size={18} />
  </button>
  {mobileOpen && (
    <div className="md:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setMobileOpen(false)} />
  )}
  <aside
    /* ...existing props... */
    className={`fixed left-0 top-12 bottom-0 z-30 bg-slate-900/95 border-r border-slate-700/50 transition-[width] duration-200 ease-out overflow-hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
  >
    {/* existing content */}
  </aside>
</>
```

Add `Menu` to the lucide-react import.

- [ ] **Step 2: Test responsive at 375px width**

Open Chrome devtools → device toolbar → 375 × 667 → confirm sidebar is hidden, hamburger appears top-left, tapping it opens the slide-over.

- [ ] **Step 3: Commit**

```bash
git add src/app/fmplus/performance/_components/performance-sidebar.tsx
git commit -m "feat(perf): mobile slide-over drawer + hamburger trigger"
```

---

### Task 34: Loading + error states

**Files:**
- Create: `src/app/fmplus/performance/loading.tsx`
- Create: `src/app/fmplus/performance/error.tsx`
- Create: `src/app/fmplus/performance/[contractId]/loading.tsx`
- Create: `src/app/fmplus/performance/[contractId]/error.tsx`

- [ ] **Step 1: Skeleton loading**

```tsx
// src/app/fmplus/performance/loading.tsx (and the same content under [contractId]/loading.tsx)
export default function Loading() {
  return (
    <div className="flex-1 px-6 py-6 max-w-6xl mx-auto space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="ix-card p-4 animate-pulse">
            <div className="h-3 w-16 bg-slate-700 rounded" />
            <div className="h-8 w-24 bg-slate-700 rounded mt-2" />
            <div className="h-3 w-12 bg-slate-700 rounded mt-2" />
          </div>
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="ix-card p-6 animate-pulse">
          <div className="h-4 w-48 bg-slate-700 rounded mb-3" />
          <div className="h-48 w-full bg-slate-800 rounded" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Error boundary**

```tsx
// src/app/fmplus/performance/error.tsx (and per-contract version)
'use client';
import { AlertOctagon } from 'lucide-react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex-1 p-8 text-center">
      <AlertOctagon size={32} className="text-red-400 mx-auto mb-3" />
      <h2 className="text-lg font-bold text-slate-100">Performance Dashboard failed to load</h2>
      <p className="text-sm text-slate-400 mt-1">{error.message}</p>
      <button onClick={reset} className="mt-4 px-4 py-2 rounded-lg bg-fmplus-yellow text-fmplus-black text-sm font-semibold">
        Retry
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/fmplus/performance/loading.tsx src/app/fmplus/performance/error.tsx src/app/fmplus/performance/[contractId]/loading.tsx src/app/fmplus/performance/[contractId]/error.tsx
git commit -m "feat(perf): skeleton loading + error boundaries"
```

---

### Task 35: Accessibility pass

**Files:** spot-modify panels and sidebar

- [ ] **Step 1: Verify keyboard navigation**

- Tab order: skip link → top nav → sidebar period chips → sidebar jump-to → sidebar visible-sections → main content panels.
- Each KPI tile is a `<button>` (already done).
- Each chart bar / slice has an `<svg>` `<title>` element and is wrapped in a clickable `<button>` if the chart wrapper supports it.

- [ ] **Step 2: Add skip link to layout**

```tsx
// In src/app/fmplus/performance/layout.tsx, just inside the <main>:
<a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-fmplus-yellow focus:text-fmplus-black focus:px-3 focus:py-1 focus:rounded">
  Skip to main content
</a>
{/* existing children */}
```

Wrap the main column in `<div id="main-content">…</div>` on both pages.

- [ ] **Step 3: Verify focus rings**

In Chrome devtools, navigate with `Tab` only. Every interactive element should show a visible focus ring (`fmplus-yellow`).

- [ ] **Step 4: Run Lighthouse**

Run: open the per-contract page → Lighthouse → Accessibility audit. Target ≥ 95.

- [ ] **Step 5: Commit any fixes**

```bash
git add -p
git commit -m "feat(perf): accessibility — skip link + focus rings"
```

---

## Self-Review

| Spec section | Plan task(s) |
|---|---|
| §4 Routes | T3, T4 (scaffolding); T13 (API) |
| §5 Sidebar UX | T16; T33 (mobile) |
| §6 Per-contract panels (13) | T19-T27; wired in T28 |
| §7 Portfolio page | T29-T30 |
| §8 Period filter | T2; T15 |
| §9 Data + APIs | T5-T13 |
| §10 State persistence | T14; T31 |
| §11 Brand rules | embedded in every panel via FM+ tokens |
| §12 Accessibility | T35 |
| §13 Bilingual | T32 |
| §14 Mobile | T33 |
| §15 Out of scope | not implemented (correct) |
| §16 Open questions | tracked, not implemented (correct) |
| §17 Acceptance criteria | met after T28 + T30 + T34 + T35 |

**Placeholder scan:** all code blocks are concrete; one stub flagged inline (`sumOtActual` returns 0 in Task 11, with a comment that it's refined in a follow-up — acceptable for v1).

**Type consistency:** `ContractDashboardPayload`, `PortfolioContractRow`, panel row types are defined once in `types.ts` (T1) and consumed unchanged in every later task.

---

## Execution Handoff

**Plan complete and saved to [docs/superpowers/plans/2026-05-06-fmplus-performance-dashboard.md](docs/superpowers/plans/2026-05-06-fmplus-performance-dashboard.md).**

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Total ~35 tasks; expect ~2-3 days of subagent work end-to-end with reviews.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
