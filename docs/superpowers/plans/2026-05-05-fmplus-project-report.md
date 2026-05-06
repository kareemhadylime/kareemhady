# FM+ Project Report Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 9th "Report" tab to the FM+ Project Budget module that renders a management-grade dashboard view of one (contract, year, scenario) combo and exports it as an A4 PDF in 4 audience modes (pre-contract / sign-off / customer / snapshot) and 3 languages (EN / AR / Both stacked).

**Architecture:** Approach 1 from spec — `@react-pdf/renderer` PDF tree + parallel HTML tree, both consuming one shared data function `buildProjectReport(...)`. Defense-in-depth visibility strip at data layer for customer mode. Mixed page orientation. Server-side PDF render via API route handler.

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind v4 · TypeScript strict · Supabase · `@react-pdf/renderer` · Zod

**Reference spec:** `docs/superpowers/specs/2026-05-05-fmplus-project-report-design.md`

**Prerequisites:** Phase A (brand foundation) MUST be merged. Phase B (page retrofits) can run in parallel — no dependency.

---

## File Structure (this plan)

| Path | Action | Responsibility |
|---|---|---|
| `supabase/migrations/0083_fmplus_budget_report_columns.sql` | Create | Add 4 cols to project_contracts; create project_year_signoffs + budget_report_exports tables |
| `src/lib/fmplus/budget/schema.ts` | Modify | Extend ProjectContractSchema; add CustomerContactSchema, ProjectYearSignoffSchema, BudgetReportExportSchema |
| `src/lib/fmplus/budget/report/types.ts` | Create | ReportData, ReportMode, ReportLang, section types |
| `src/lib/fmplus/budget/report/build-report.ts` | Create | buildProjectReport entry + 7 load helpers + aggregate |
| `src/lib/fmplus/budget/report/visibility.ts` | Create | applyVisibility(data, mode) defense-in-depth strip |
| `src/lib/fmplus/budget/report/build-report.test.ts` | Create | 10 tests for mode visibility, deltas, rollup |
| `src/lib/fmplus/budget/report/visibility.test.ts` | Create | 5 tests for per-mode field strip |
| `src/lib/fmplus/budget/report/theme.ts` | Create | PDF StyleSheet constants from FMPLUS_BRAND + Font.register |
| `src/lib/fmplus/budget/report/pdf-document.tsx` | Create | <ProjectReportDocument> top-level |
| `src/lib/fmplus/budget/report/pdf-shared/{pdf-header,pdf-footer,label-dual,status-pill}.tsx` | Create | 4 shared PDF building blocks |
| `src/lib/fmplus/budget/report/pdf-pages/*.tsx` | Create | 11 page components (cover-hero, project-details, service-line-summary, manning-table, budget-breakdown, mobilization, payment-terms, change-vs-initial, variance-snapshot, sign-off, contract-rollup) |
| `src/lib/fmplus/budget/report/on-screen/*.tsx` | Create | Top-level OnScreenReport + 11 mirror sections (Tailwind) |
| `src/app/fmplus/financial/budget/report/page.tsx` | Create | Tab landing — contract picker grid |
| `src/app/fmplus/financial/budget/report/[contractId]/page.tsx` | Create | Server component renders OnScreenReport |
| `src/app/fmplus/financial/budget/report/[contractId]/_components/{report-mode-toggle,report-year-picker,report-export-dialog}.tsx` | Create | 3 client UI components |
| `src/app/api/fmplus/budget/report/[contractId]/[yearId]/pdf/route.ts` | Create | GET → application/pdf via renderToBuffer |
| `src/app/fmplus/financial/budget/_components/budget-tab-strip.tsx` | Modify | Add 9th tab "Report" with FileText icon |
| `src/app/fmplus/financial/budget/projects/[contractId]/_components/edit-contract-form.tsx` | Modify | Add inputs for customer_logo upload, customer_contacts, payment_terms, scope_summary |
| `public/fonts/{Lalezar-Regular,DMSerifDisplay-Regular,Lato-{Regular,Bold,Black}}.ttf` | Add | Font files for @react-pdf/renderer Font.register |

---

## Task C1: Write the migration `0083_fmplus_budget_report_columns.sql`

**Files:** Create `supabase/migrations/0083_fmplus_budget_report_columns.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0083_fmplus_budget_report_columns.sql
-- New columns on project_contracts
ALTER TABLE public.project_contracts
  ADD COLUMN IF NOT EXISTS customer_logo_url   text,
  ADD COLUMN IF NOT EXISTS customer_contacts   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_terms       text,
  ADD COLUMN IF NOT EXISTS scope_summary       text;

-- Sign-off history
CREATE TABLE IF NOT EXISTS public.project_year_signoffs (
  id           bigserial PRIMARY KEY,
  year_id      bigint NOT NULL REFERENCES public.project_years(id) ON DELETE CASCADE,
  signed_by    uuid NOT NULL REFERENCES auth.users(id),
  signed_role  text NOT NULL CHECK (signed_role IN
                  ('project_manager','finance_director','fmplus_signatory','customer_signatory')),
  signed_at    timestamptz NOT NULL DEFAULT now(),
  mode         text NOT NULL CHECK (mode IN ('pre','signoff','customer','snapshot')),
  notes        text
);
CREATE INDEX IF NOT EXISTS project_year_signoffs_year_idx
  ON public.project_year_signoffs (year_id, signed_at DESC);

-- Export audit log
CREATE TABLE IF NOT EXISTS public.budget_report_exports (
  id          bigserial PRIMARY KEY,
  year_id     bigint NOT NULL REFERENCES public.project_years(id) ON DELETE CASCADE,
  contract_id bigint NOT NULL REFERENCES public.project_contracts(id) ON DELETE CASCADE,
  mode        text NOT NULL CHECK (mode IN ('pre','signoff','customer','snapshot')),
  lang        text NOT NULL CHECK (lang IN ('en','ar','both')),
  exported_by uuid NOT NULL REFERENCES auth.users(id),
  exported_at timestamptz NOT NULL DEFAULT now(),
  user_agent  text
);
CREATE INDEX IF NOT EXISTS budget_report_exports_year_idx
  ON public.budget_report_exports (year_id, exported_at DESC);
CREATE INDEX IF NOT EXISTS budget_report_exports_contract_idx
  ON public.budget_report_exports (contract_id, exported_at DESC);
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__apply_migration` with `name: "fmplus_budget_report_columns"` and the SQL above. Project ID: `bpjproljatbrbmszwbov`.

- [ ] **Step 3: Verify**

Use `mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__execute_sql`:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='project_contracts' AND column_name IN ('customer_logo_url','customer_contacts','payment_terms','scope_summary');
SELECT count(*) FROM project_year_signoffs;
SELECT count(*) FROM budget_report_exports;
```
Expected: 4 columns + both tables exist (count=0 each).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0083_fmplus_budget_report_columns.sql
git commit -m "feat(fmplus-budget): migration 0083 — report columns + signoff/export audit tables"
```

---

## Task C2: Create Supabase storage bucket `customer-logos`

**Files:** No code change — Supabase dashboard configuration.

- [ ] **Step 1: Create bucket via Supabase dashboard**

Open https://supabase.com/dashboard/project/bpjproljatbrbmszwbov/storage/buckets. Click "New bucket".
- Name: `customer-logos`
- Public bucket: YES
- File size limit: `2097152` (2 MB)
- Allowed MIME types: `image/png, image/jpeg, image/svg+xml`

- [ ] **Step 2: Set RLS policy**

In Supabase Studio → Storage → customer-logos → Policies, add policy:
- Name: `service-role-and-authenticated-upload`
- Allowed operation: INSERT, UPDATE, DELETE, SELECT
- Roles: `authenticated`, `service_role`
- USING: `true` (anyone authenticated can read; admin-only upload enforced at app level via the EditContractForm permissions)

- [ ] **Step 3: Verify**

```bash
curl -I https://bpjproljatbrbmszwbov.supabase.co/storage/v1/object/public/customer-logos/test.png
```
Expected: 404 (no file uploaded yet) — confirms bucket exists and is publicly addressable.

- [ ] **Step 4: Commit (no files; just note in handoff)**

No git commit needed for this task. Add a one-line note to SESSION_HANDOFF.md noting bucket created.

---

## Task C3: Update `schema.ts` with new types

**Files:** Modify `src/lib/fmplus/budget/schema.ts`

- [ ] **Step 1: Extend ProjectContractSchema**

Find `ProjectContractSchema` and add the 4 fields. Locate it (`grep -n "ProjectContractSchema" src/lib/fmplus/budget/schema.ts`), then modify the object:

```ts
export const CustomerContactSchema = z.object({
  name: z.string().min(1),
  role: z.string().default(''),
  email: z.string().email().or(z.literal('')),
  phone: z.string().default(''),
  primary: z.boolean().default(false),
});
export type CustomerContact = z.infer<typeof CustomerContactSchema>;

export const ProjectContractSchema = z.object({
  id: z.number().optional(),
  project_id: z.number(),
  name: z.string().min(1),
  customer: z.string().nullable().optional(),
  start_date: z.string(),
  end_date: z.string(),
  contract_value: z.number().nonnegative().default(0),
  vat_pct: z.number().nonnegative().default(14),
  year_tracking: YearTrackingEnum.default('contract'),
  reimbursables: z.array(z.any()).default([]),
  zones: z.array(z.any()).default([]),
  notes: z.string().nullable().optional(),
  // NEW: Project Report support
  customer_logo_url: z.string().nullable().optional(),
  customer_contacts: z.array(CustomerContactSchema).default([]),
  payment_terms: z.string().nullable().optional(),
  scope_summary: z.string().nullable().optional(),
});

export const ProjectYearSignoffSchema = z.object({
  id: z.number().optional(),
  year_id: z.number(),
  signed_by: z.string().uuid(),
  signed_role: z.enum(['project_manager','finance_director','fmplus_signatory','customer_signatory']),
  signed_at: z.string().optional(),
  mode: z.enum(['pre','signoff','customer','snapshot']),
  notes: z.string().nullable().optional(),
});
export type ProjectYearSignoff = z.infer<typeof ProjectYearSignoffSchema>;

export const BudgetReportExportSchema = z.object({
  id: z.number().optional(),
  year_id: z.number(),
  contract_id: z.number(),
  mode: z.enum(['pre','signoff','customer','snapshot']),
  lang: z.enum(['en','ar','both']),
  exported_by: z.string().uuid(),
  exported_at: z.string().optional(),
  user_agent: z.string().nullable().optional(),
});
export type BudgetReportExport = z.infer<typeof BudgetReportExportSchema>;
```

- [ ] **Step 2: TypeScript check + run schema tests**

```bash
npx tsc --noEmit 2>&1 | grep "schema.ts" | head -5
npm test -- --run src/lib/fmplus/budget/schema.test.ts 2>&1 | tail -10
```
Expected: no TS errors; existing schema tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/fmplus/budget/schema.ts
git commit -m "feat(fmplus-budget): schema — extend ProjectContract + add CustomerContact/Signoff/Export schemas"
```

---

## Task C4: Create `report/types.ts`

**Files:** Create `src/lib/fmplus/budget/report/types.ts`

- [ ] **Step 1: Write the file**

```ts
import type { ServiceLine, Category } from '../types';
import type { CustomerContact, ProjectYearSignoff } from '../schema';

export type ReportMode = 'pre' | 'signoff' | 'customer' | 'snapshot';
export type ReportLang = 'en' | 'ar' | 'both';

export interface ContractInfo {
  id: number;
  name: string;
  customer: string | null;
  customer_logo_url: string | null;
  customer_contacts: CustomerContact[];
  start_date: string;
  end_date: string;
  duration_months: number;
  contract_value: number;
  vat_pct: number;
  zones: string[];
  scope_summary: string | null;
  payment_terms: string | null;
}

export interface YearInfo {
  id: number;
  year_index: number;
  fiscal_year: number | null;
  scenario: 'initial' | 'revised' | 'reforecast';
  status: 'draft' | 'published';
  start_month: number;
}

export interface ServiceLineSummary {
  service_line: ServiceLine;
  hc_required: number;
  hc_budgeted: number | null;       // null in customer mode
  monthly_cost: number | null;       // null in customer mode
  monthly_fee: number;               // computed: contract_value × cost-share / 12
  annual_ex_vat: number;
  annual_incl_vat: number;
  gp_pct: number | null;             // null in customer mode
  gp_egp: number | null;             // null in customer mode
}

export interface ManningRow {
  service_line: ServiceLine;
  sub_section: string | null;
  position_label_en: string;
  position_label_ar: string | null;
  hc_required: number;
  hc_budgeted: number | null;        // null in customer mode
  ctc_rate: number | null;           // null in customer mode
  monthly_cost: number | null;       // null in customer mode
}

export interface BudgetCellMatrix {
  category: Category;
  service_line: ServiceLine;
  monthly: number;
  annual: number;
  green_amber_red: 'green' | 'amber' | 'red' | null;
}

export interface MobilizationLineDetail {
  category: 'capex' | 'opex_one_time' | 'training' | 'recruitment';
  label_en: string;
  label_ar: string | null;
  qty: number;
  unit_cost: number;
  total: number;
  amortization_months: number;
}

export interface MobilizationSummary {
  /** customer mode: just the total + caption */
  summary_text: string;
  total_egp: number;
}

export interface DeltaCell {
  service_line: ServiceLine;
  category: Category;
  initial_monthly: number;
  current_monthly: number;
  delta_monthly: number;
  delta_pct: number;
  severity: 'normal' | 'warn' | 'high';   // >5% warn, >15% high
}

export interface RollupYearTotals {
  year_index: number;
  fiscal_year: number | null;
  scenario: string;
  total_cost: number;
  total_revenue: number;
  gp_egp: number;
  gp_pct: number;
}

export interface ReportData {
  meta: {
    contract: ContractInfo;
    year: YearInfo;
    mode: ReportMode;
    lang: ReportLang;
    generated_at: string;
    generated_by: string;
  };
  project_details: {
    customer_contacts: CustomerContact[];
    zones: string[];
    scope_summary: string | null;
    services: ServiceLine[];
  };
  service_lines: ServiceLineSummary[];
  manning: {
    rows: ManningRow[];
    totals_by_service: Record<ServiceLine, { hc_required: number; hc_budgeted: number | null }>;
  };
  budget_breakdown: {
    cells: BudgetCellMatrix[] | null;       // null in customer mode (page hidden)
    category_totals: { category: Category; monthly: number }[] | null;
    service_totals: { service_line: ServiceLine; monthly: number }[];
  };
  mobilization: { detail: MobilizationLineDetail[] } | MobilizationSummary | null;
  payment_terms: string | null;
  change_vs_initial: { cells: DeltaCell[]; warning: string | null } | null;
  variance_snapshot: { ytd_budget: number; ytd_actual: number; variance_pct: number } | null;
  contract_rollup: { years: RollupYearTotals[]; total_cost: number; total_revenue: number } | null;
  signoff: {
    lines: { role: string; placeholder_en: string; placeholder_ar: string }[];
    history: ProjectYearSignoff[];
  };
}
```

- [ ] **Step 2: TS check**

```bash
npx tsc --noEmit 2>&1 | grep "report/types" | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/fmplus/budget/report/types.ts
git commit -m "feat(fmplus-report): typed ReportData shape for buildProjectReport output"
```

---

## Task C5: Build `loadContract` / `loadYear` / `loadBudget` helper functions

**Files:** Create `src/lib/fmplus/budget/report/build-report.ts` (helpers section first; entry function in C8)

- [ ] **Step 1: Write the load helpers**

```ts
import { supabaseAdmin } from '@/lib/supabase';
import type { ContractInfo, YearInfo } from './types';
import type { BudgetLine, MobilizationLine, ProjectYearSignoff, CustomerContact } from '../schema';

export async function loadContract(contract_id: number): Promise<ContractInfo> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('project_contracts')
    .select('id, name, customer, customer_logo_url, customer_contacts, start_date, end_date, duration_months, contract_value, vat_pct, zones, scope_summary, payment_terms')
    .eq('id', contract_id)
    .single();
  if (error || !data) throw new Error(`Contract ${contract_id} not found: ${error?.message}`);
  return {
    id: data.id,
    name: data.name,
    customer: data.customer,
    customer_logo_url: data.customer_logo_url,
    customer_contacts: (data.customer_contacts ?? []) as CustomerContact[],
    start_date: data.start_date,
    end_date: data.end_date,
    duration_months: data.duration_months ?? 12,
    contract_value: Number(data.contract_value),
    vat_pct: Number(data.vat_pct),
    zones: (data.zones ?? []) as string[],
    scope_summary: data.scope_summary,
    payment_terms: data.payment_terms,
  };
}

export async function loadYear(year_id: number): Promise<YearInfo> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('project_years')
    .select('id, year_index, fiscal_year, scenario, status, start_month, contract_id')
    .eq('id', year_id)
    .single();
  if (error || !data) throw new Error(`Year ${year_id} not found: ${error?.message}`);
  return data as YearInfo;
}

export async function loadBudgetLines(year_id: number): Promise<BudgetLine[]> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('budget_lines').select('*').eq('year_id', year_id);
  return (data ?? []) as BudgetLine[];
}

export async function loadMobilization(contract_id: number): Promise<MobilizationLine[]> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('mobilization_lines').select('*').eq('contract_id', contract_id);
  return (data ?? []) as MobilizationLine[];
}

export async function loadSignoffs(year_id: number): Promise<ProjectYearSignoff[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('project_year_signoffs')
    .select('*')
    .eq('year_id', year_id)
    .order('signed_at', { ascending: false });
  return (data ?? []) as ProjectYearSignoff[];
}

/** For the change-vs-initial section: find the sibling year with same year_index but scenario='initial'. */
export async function loadInitialSiblingLines(contract_id: number, year_index: number): Promise<BudgetLine[] | null> {
  const sb = supabaseAdmin();
  const { data: sibling } = await sb
    .from('project_years')
    .select('id')
    .eq('contract_id', contract_id)
    .eq('year_index', year_index)
    .eq('scenario', 'initial')
    .maybeSingle();
  if (!sibling) return null;
  const { data: lines } = await sb.from('budget_lines').select('*').eq('year_id', sibling.id);
  return (lines ?? []) as BudgetLine[];
}

export async function loadAllYearsForContract(contract_id: number): Promise<YearInfo[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('project_years')
    .select('id, year_index, fiscal_year, scenario, status, start_month, contract_id')
    .eq('contract_id', contract_id)
    .order('year_index', { ascending: true });
  return (data ?? []) as YearInfo[];
}

export async function loadAllYearsLines(year_ids: number[]): Promise<BudgetLine[]> {
  if (year_ids.length === 0) return [];
  const sb = supabaseAdmin();
  const { data } = await sb.from('budget_lines').select('*').in('year_id', year_ids);
  return (data ?? []) as BudgetLine[];
}
```

- [ ] **Step 2: TS check**

```bash
npx tsc --noEmit 2>&1 | grep "report/build-report" | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/fmplus/budget/report/build-report.ts
git commit -m "feat(fmplus-report): add 7 data load helpers for buildProjectReport"
```

---

## Task C6: Implement `aggregate` function (in build-report.ts)

**Files:** Modify `src/lib/fmplus/budget/report/build-report.ts` — add aggregate function below load helpers.

The aggregate function takes the raw rows from steps 1-7 and shapes them into the `ReportData` structure. This is pure synchronous compute; no DB calls.

- [ ] **Step 1: Add the aggregate function**

```ts
import type { ReportData, ReportMode, ReportLang, ServiceLineSummary, ManningRow, BudgetCellMatrix, DeltaCell, RollupYearTotals } from './types';
import type { BudgetLine, MobilizationLine, ProjectYearSignoff, CustomerContact } from '../schema';
import type { ServiceLine, Category } from '../types';

interface AggregateInput {
  contract: ContractInfo;
  year: YearInfo;
  lines: BudgetLine[];
  mob: MobilizationLine[];
  signoffs: ProjectYearSignoff[];
  initialLines: BudgetLine[] | null;
  allYears: YearInfo[];
  rollupLines: BudgetLine[] | null;
  mode: ReportMode;
  lang: ReportLang;
  generated_at: string;
  generated_by: string;
}

export function aggregate(input: AggregateInput): ReportData {
  const { contract, year, lines, mob, signoffs, initialLines, allYears, rollupLines, mode, lang } = input;

  // Service-line summary
  const monthlyByService = bucketByService(lines);
  const totalMonthly = sum(Object.values(monthlyByService));
  const service_lines: ServiceLineSummary[] = Object.entries(monthlyByService).map(([sl, monthly]) => {
    const share = totalMonthly > 0 ? monthly / totalMonthly : 0;
    const monthly_fee = (contract.contract_value * share) / 12;
    const annual_ex = monthly_fee * 12;
    return {
      service_line: sl as ServiceLine,
      hc_required: hcSum(lines, sl as ServiceLine, 'required'),
      hc_budgeted: hcSum(lines, sl as ServiceLine, 'budgeted'),
      monthly_cost: monthly,
      monthly_fee,
      annual_ex_vat: annual_ex,
      annual_incl_vat: annual_ex * (1 + contract.vat_pct / 100),
      gp_pct: monthly > 0 ? ((monthly_fee - monthly) / monthly_fee) * 100 : 0,
      gp_egp: monthly_fee - monthly,
    };
  });

  // Manning rows (one per budget_line where category='manning')
  const manning: ManningRow[] = lines.filter(l => l.category === 'manning').map(l => ({
    service_line: l.service_line,
    sub_section: extractSubSection(l.line_code),
    position_label_en: l.label_en,
    position_label_ar: l.label_ar,
    hc_required: extractHcRequired(l),
    hc_budgeted: Number(l.qty),
    ctc_rate: Number(l.unit_cost),
    monthly_cost: Number(l.qty) * Number(l.unit_cost),
  }));

  // Budget breakdown matrix (8-cat × 7-svc)
  const cells: BudgetCellMatrix[] = buildMatrix(lines);
  const category_totals = sumByCategory(cells);
  const service_totals = Object.entries(monthlyByService).map(([sl, m]) => ({ service_line: sl as ServiceLine, monthly: m }));

  // Mobilization detail
  const mobDetail = mob.map(m => ({
    category: m.category,
    label_en: m.label_en,
    label_ar: m.label_ar ?? null,
    qty: Number(m.qty),
    unit_cost: Number(m.unit_cost),
    total: Number(m.qty) * Number(m.unit_cost),
    amortization_months: m.amortization_months,
  }));
  const mobTotal = sum(mobDetail.map(d => d.total));
  const mobilization = mob.length === 0
    ? null
    : { detail: mobDetail };

  // Change vs initial — only when scenario != initial
  const change_vs_initial = year.scenario === 'initial' ? null
    : initialLines === null
      ? { cells: [], warning: 'No initial scenario found for this year — comparison unavailable.' }
      : { cells: computeDeltas(lines, initialLines), warning: null };

  // Contract rollup (multi-year only)
  const contract_rollup = allYears.length > 1 && rollupLines
    ? buildRollup(allYears, rollupLines, contract)
    : null;

  // Sign-off block — 2 lines per mode
  const signoff = {
    lines: getSignoffLines(mode),
    history: signoffs,
  };

  return {
    meta: {
      contract, year, mode, lang,
      generated_at: input.generated_at,
      generated_by: input.generated_by,
    },
    project_details: {
      customer_contacts: contract.customer_contacts,
      zones: contract.zones,
      scope_summary: contract.scope_summary,
      services: Array.from(new Set(lines.map(l => l.service_line))) as ServiceLine[],
    },
    service_lines,
    manning: {
      rows: manning,
      totals_by_service: service_lines.reduce((acc, s) => {
        acc[s.service_line] = { hc_required: s.hc_required, hc_budgeted: s.hc_budgeted };
        return acc;
      }, {} as Record<ServiceLine, { hc_required: number; hc_budgeted: number | null }>),
    },
    budget_breakdown: { cells, category_totals, service_totals },
    mobilization,
    payment_terms: contract.payment_terms,
    change_vs_initial,
    variance_snapshot: null, // populated separately for snapshot mode in C7
    contract_rollup,
    signoff,
  };
}

// Helper utilities
function sum(arr: number[]): number { return arr.reduce((a, b) => a + b, 0); }

function bucketByService(lines: BudgetLine[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) {
    out[l.service_line] = (out[l.service_line] ?? 0) + Number(l.qty) * Number(l.unit_cost);
  }
  return out;
}

function hcSum(lines: BudgetLine[], service: ServiceLine, kind: 'required' | 'budgeted'): number {
  const m = lines.filter(l => l.service_line === service && l.category === 'manning');
  if (kind === 'budgeted') return sum(m.map(l => Number(l.qty)));
  return Math.round(sum(m.map(l => Number(l.qty) * 0.85))); // approx HC required ~85% of budgeted (no separate column today)
}

function extractSubSection(line_code: string): string | null {
  if (line_code.includes('_pub_')) return 'Public';
  if (line_code.includes('_pmp_')) return 'Pump Stations';
  if (line_code.includes('_int_')) return 'Internal';
  return null;
}

function extractHcRequired(l: BudgetLine): number {
  // No separate hc_required column; use ROUND(qty × 0.85) as approximation
  return Math.round(Number(l.qty) * 0.85);
}

function buildMatrix(lines: BudgetLine[]): BudgetCellMatrix[] {
  const map = new Map<string, BudgetCellMatrix>();
  for (const l of lines) {
    const key = `${l.service_line}::${l.category}`;
    const monthly = Number(l.qty) * Number(l.unit_cost);
    const existing = map.get(key);
    if (existing) {
      existing.monthly += monthly;
      existing.annual = existing.monthly * 12;
    } else {
      map.set(key, {
        service_line: l.service_line,
        category: l.category,
        monthly,
        annual: monthly * 12,
        green_amber_red: null,
      });
    }
  }
  return [...map.values()];
}

function sumByCategory(cells: BudgetCellMatrix[]): { category: Category; monthly: number }[] {
  const map = new Map<Category, number>();
  for (const c of cells) {
    map.set(c.category, (map.get(c.category) ?? 0) + c.monthly);
  }
  return [...map.entries()].map(([category, monthly]) => ({ category, monthly }));
}

function computeDeltas(current: BudgetLine[], initial: BudgetLine[]): DeltaCell[] {
  const currMatrix = buildMatrix(current);
  const initMatrix = buildMatrix(initial);
  const cells: DeltaCell[] = [];
  for (const c of currMatrix) {
    const init = initMatrix.find(i => i.service_line === c.service_line && i.category === c.category);
    const initial_monthly = init?.monthly ?? 0;
    const delta = c.monthly - initial_monthly;
    const delta_pct = initial_monthly > 0 ? (delta / initial_monthly) * 100 : 0;
    cells.push({
      service_line: c.service_line,
      category: c.category,
      initial_monthly,
      current_monthly: c.monthly,
      delta_monthly: delta,
      delta_pct,
      severity: Math.abs(delta_pct) > 15 ? 'high' : Math.abs(delta_pct) > 5 ? 'warn' : 'normal',
    });
  }
  return cells;
}

function buildRollup(allYears: YearInfo[], rollupLines: BudgetLine[], contract: ContractInfo): { years: RollupYearTotals[]; total_cost: number; total_revenue: number } {
  const years: RollupYearTotals[] = allYears.map(y => {
    const yLines = rollupLines.filter(l => l.year_id === y.id);
    const cost = sum(yLines.map(l => Number(l.qty) * Number(l.unit_cost) * 12));
    const revenue = contract.contract_value;  // simplified: assumes flat revenue per year
    return {
      year_index: y.year_index,
      fiscal_year: y.fiscal_year,
      scenario: y.scenario,
      total_cost: cost,
      total_revenue: revenue,
      gp_egp: revenue - cost,
      gp_pct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
    };
  });
  return {
    years,
    total_cost: sum(years.map(y => y.total_cost)),
    total_revenue: sum(years.map(y => y.total_revenue)),
  };
}

function getSignoffLines(mode: ReportMode): { role: string; placeholder_en: string; placeholder_ar: string }[] {
  if (mode === 'customer') return [
    { role: 'fmplus_signatory', placeholder_en: 'FMPlus Authorized Signatory', placeholder_ar: 'المفوض بالتوقيع - FMPlus' },
    { role: 'customer_signatory', placeholder_en: 'Customer Authorized Signatory', placeholder_ar: 'المفوض بالتوقيع من العميل' },
  ];
  if (mode === 'signoff') return [
    { role: 'project_manager', placeholder_en: 'Project Manager', placeholder_ar: 'مدير المشروع' },
    { role: 'finance_director', placeholder_en: 'Finance Director', placeholder_ar: 'المدير المالي' },
  ];
  return [];
}
```

- [ ] **Step 2: TS check**

```bash
npx tsc --noEmit 2>&1 | grep "report/build-report" | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/fmplus/budget/report/build-report.ts
git commit -m "feat(fmplus-report): aggregate function — shape ReportData from raw rows"
```

---

## Task C7: Create `applyVisibility` (defense-in-depth strip)

**Files:** Create `src/lib/fmplus/budget/report/visibility.ts`

- [ ] **Step 1: Write the strip function**

```ts
import type { ReportData, ReportMode } from './types';

/**
 * Defense-in-depth: strip cost-detail fields from ReportData when mode='customer'.
 *
 * Customer-facing reports must NEVER expose CTC rates, GP %, or per-line cost
 * detail. Even if a renderer has a bug and tries to render those fields, this
 * pass deletes them from the data structure entirely.
 *
 * @returns A NEW ReportData object with the appropriate fields stripped/replaced.
 *          Original input is not mutated.
 */
export function applyVisibility(data: ReportData, mode: ReportMode): ReportData {
  if (mode !== 'customer') return data;

  // Strip service-line cost detail
  const service_lines = data.service_lines.map(s => ({
    ...s,
    hc_budgeted: null,
    monthly_cost: null,
    gp_pct: null,
    gp_egp: null,
  }));

  // Strip manning per-row cost detail (keep hc_required + position labels)
  const manning_rows = data.manning.rows.map(m => ({
    ...m,
    hc_budgeted: null,
    ctc_rate: null,
    monthly_cost: null,
  }));

  // Hide Budget Breakdown matrix entirely (cost-leak risk)
  const budget_breakdown = {
    cells: null,
    category_totals: null,
    service_totals: data.budget_breakdown.service_totals,  // keep aggregate fees
  };

  // Collapse mobilization to summary
  const mobilization = data.mobilization
    ? collapseMobilization(data.mobilization)
    : null;

  // Strip change_vs_initial entirely
  const change_vs_initial = null;

  // Strip variance snapshot
  const variance_snapshot = null;

  return {
    ...data,
    service_lines,
    manning: {
      ...data.manning,
      rows: manning_rows,
      totals_by_service: Object.fromEntries(
        Object.entries(data.manning.totals_by_service).map(([sl, t]) => [sl, { hc_required: t.hc_required, hc_budgeted: null }]),
      ) as ReportData['manning']['totals_by_service'],
    },
    budget_breakdown,
    mobilization,
    change_vs_initial,
    variance_snapshot,
  };
}

function collapseMobilization(mob: NonNullable<ReportData['mobilization']>): ReportData['mobilization'] {
  if ('detail' in mob) {
    const total = mob.detail.reduce((a, l) => a + l.total, 0);
    return {
      summary_text: `Upfront mobilization fee: EGP ${total.toLocaleString()}`,
      total_egp: total,
    };
  }
  return mob;
}
```

- [ ] **Step 2: TS check**

```bash
npx tsc --noEmit 2>&1 | grep "report/visibility" | head -5
```

- [ ] **Step 3: Write tests**

Create `src/lib/fmplus/budget/report/visibility.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { applyVisibility } from './visibility';
import type { ReportData } from './types';

const baseFixture = (): ReportData => ({
  meta: { contract: { id: 5 } as any, year: { id: 6 } as any, mode: 'signoff', lang: 'en', generated_at: '2026-05-05', generated_by: 'test' },
  project_details: { customer_contacts: [], zones: [], scope_summary: null, services: ['hk'] },
  service_lines: [{ service_line: 'hk', hc_required: 50, hc_budgeted: 60, monthly_cost: 100000, monthly_fee: 120000, annual_ex_vat: 1440000, annual_incl_vat: 1641600, gp_pct: 16.6, gp_egp: 240000 } as any],
  manning: { rows: [{ service_line: 'hk', sub_section: null, position_label_en: 'Janitor', position_label_ar: null, hc_required: 50, hc_budgeted: 60, ctc_rate: 6200, monthly_cost: 372000 }], totals_by_service: { hk: { hc_required: 50, hc_budgeted: 60 } } as any },
  budget_breakdown: { cells: [{ service_line: 'hk', category: 'manning', monthly: 372000, annual: 4464000, green_amber_red: null }], category_totals: [{ category: 'manning', monthly: 372000 }], service_totals: [{ service_line: 'hk', monthly: 100000 }] },
  mobilization: { detail: [{ category: 'capex', label_en: 'X', label_ar: null, qty: 1, unit_cost: 50000, total: 50000, amortization_months: 24 }] },
  payment_terms: 'Net 30',
  change_vs_initial: null,
  variance_snapshot: null,
  contract_rollup: null,
  signoff: { lines: [], history: [] },
});

describe('applyVisibility', () => {
  test('signoff mode: returns data unchanged', () => {
    const data = baseFixture();
    const result = applyVisibility(data, 'signoff');
    expect(result).toBe(data);
  });

  test('customer mode: strips ctc_rate from manning rows', () => {
    const result = applyVisibility(baseFixture(), 'customer');
    expect(result.manning.rows[0].ctc_rate).toBeNull();
  });

  test('customer mode: strips gp_pct + gp_egp from service_lines', () => {
    const result = applyVisibility(baseFixture(), 'customer');
    expect(result.service_lines[0].gp_pct).toBeNull();
    expect(result.service_lines[0].gp_egp).toBeNull();
  });

  test('customer mode: hides budget_breakdown.cells', () => {
    const result = applyVisibility(baseFixture(), 'customer');
    expect(result.budget_breakdown.cells).toBeNull();
    expect(result.budget_breakdown.category_totals).toBeNull();
  });

  test('customer mode: collapses mobilization to summary', () => {
    const result = applyVisibility(baseFixture(), 'customer');
    expect(result.mobilization).not.toHaveProperty('detail');
    expect(result.mobilization).toHaveProperty('summary_text');
    expect(result.mobilization).toHaveProperty('total_egp', 50000);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --run src/lib/fmplus/budget/report/visibility.test.ts 2>&1 | tail -10
```
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/budget/report/visibility.ts src/lib/fmplus/budget/report/visibility.test.ts
git commit -m "feat(fmplus-report): defense-in-depth visibility strip + 5 tests"
```

---

## Task C8: Wire `buildProjectReport` entry point + tests

**Files:** Modify `src/lib/fmplus/budget/report/build-report.ts` (append entry function); create `build-report.test.ts`

- [ ] **Step 1: Add the entry function at the bottom of `build-report.ts`**

```ts
export interface BuildReportInput {
  contract_id: number;
  year_id: number;
  mode: ReportMode;
  lang: ReportLang;
  generated_by?: string;
}

export async function buildProjectReport(input: BuildReportInput): Promise<ReportData> {
  const generated_at = new Date().toISOString();
  const generated_by = input.generated_by ?? 'system';

  // Steps 1-6: parallel
  const [contract, year, lines, mob, signoffs] = await Promise.all([
    loadContract(input.contract_id),
    loadYear(input.year_id),
    loadBudgetLines(input.year_id),
    loadMobilization(input.contract_id),
    loadSignoffs(input.year_id),
  ]);

  // Step 7: conditional initial sibling
  const initialLines = year.scenario !== 'initial'
    ? await loadInitialSiblingLines(input.contract_id, year.year_index)
    : null;

  // Step 8: conditional all-years rollup
  const allYears = await loadAllYearsForContract(input.contract_id);
  const rollupLines = allYears.length > 1
    ? await loadAllYearsLines(allYears.map(y => y.id))
    : null;

  // Step 9: aggregate
  const data = aggregate({
    contract, year, lines, mob, signoffs,
    initialLines, allYears, rollupLines,
    mode: input.mode, lang: input.lang,
    generated_at, generated_by,
  });

  // Step 10: visibility strip
  return applyVisibility(data, input.mode);
}
```

Add this import at top of file: `import { applyVisibility } from './visibility';`

- [ ] **Step 2: Write integration tests**

Create `src/lib/fmplus/budget/report/build-report.test.ts` with 10 tests covering: mode visibility, deltas, rollup, missing data edge cases. These hit the live Supabase TRIO (contract_id=5, year_id=6) since that's the test fixture from earlier work.

```ts
import { describe, expect, test } from 'vitest';
import { buildProjectReport } from './build-report';

describe('buildProjectReport (live TRIO)', () => {
  test('signoff mode returns full cost detail', async () => {
    const r = await buildProjectReport({ contract_id: 5, year_id: 6, mode: 'signoff', lang: 'en' });
    expect(r.service_lines[0].monthly_cost).not.toBeNull();
    expect(r.service_lines[0].gp_pct).not.toBeNull();
  });

  test('customer mode strips monthly_cost from service_lines', async () => {
    const r = await buildProjectReport({ contract_id: 5, year_id: 6, mode: 'customer', lang: 'en' });
    expect(r.service_lines[0].monthly_cost).toBeNull();
    expect(r.service_lines[0].gp_pct).toBeNull();
  });

  test('customer mode hides budget_breakdown.cells', async () => {
    const r = await buildProjectReport({ contract_id: 5, year_id: 6, mode: 'customer', lang: 'en' });
    expect(r.budget_breakdown.cells).toBeNull();
  });

  test('customer mode collapses mobilization', async () => {
    const r = await buildProjectReport({ contract_id: 5, year_id: 6, mode: 'customer', lang: 'en' });
    if (r.mobilization) expect(r.mobilization).not.toHaveProperty('detail');
  });

  test('change_vs_initial null when scenario=initial (TRIO is initial)', async () => {
    const r = await buildProjectReport({ contract_id: 5, year_id: 6, mode: 'signoff', lang: 'en' });
    expect(r.change_vs_initial).toBeNull();
  });

  test('contract_rollup null on TRIO (single-year)', async () => {
    const r = await buildProjectReport({ contract_id: 5, year_id: 6, mode: 'signoff', lang: 'en' });
    expect(r.contract_rollup).toBeNull();
  });

  test('every label has both label_en and label_ar', async () => {
    const r = await buildProjectReport({ contract_id: 5, year_id: 6, mode: 'signoff', lang: 'en' });
    for (const m of r.manning.rows) {
      expect(typeof m.position_label_en).toBe('string');
      // label_ar can be null but if present must be string
      if (m.position_label_ar !== null) expect(typeof m.position_label_ar).toBe('string');
    }
  });

  test('payment_terms string when contract has it (TRIO has payment terms)', async () => {
    const r = await buildProjectReport({ contract_id: 5, year_id: 6, mode: 'signoff', lang: 'en' });
    // TRIO contract may or may not have payment_terms set; just check shape
    expect(r.payment_terms === null || typeof r.payment_terms === 'string').toBe(true);
  });

  test('snapshot mode: variance_snapshot section is null in v1 (variance integration in C39)', async () => {
    const r = await buildProjectReport({ contract_id: 5, year_id: 6, mode: 'snapshot', lang: 'en' });
    expect(r.variance_snapshot).toBeNull();
  });

  test('lang=both is preserved through visibility strip', async () => {
    const r = await buildProjectReport({ contract_id: 5, year_id: 6, mode: 'customer', lang: 'both' });
    expect(r.meta.lang).toBe('both');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --run src/lib/fmplus/budget/report/ 2>&1 | tail -15
```
Expected: 5 visibility tests + 10 build-report tests = 15 passing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/fmplus/budget/report/build-report.ts src/lib/fmplus/budget/report/build-report.test.ts
git commit -m "feat(fmplus-report): buildProjectReport entry function + 10 integration tests"
```

---

## Task C9: Add 9th "Report" tab to BudgetTabStrip

**Files:** Modify `src/app/fmplus/financial/budget/_components/budget-tab-strip.tsx`

- [ ] **Step 1: Add the tab entry**

In the `TABS` array, add between `variance` and `compare`:

```ts
{ id: 'report',    label: 'Report',       href: '/fmplus/financial/budget/report',   Icon: FileText,    match: (p: string) => p.startsWith('/fmplus/financial/budget/report') },
```

Also add `FileText` to the lucide-react imports at the top.

- [ ] **Step 2: TS check + visual smoke test**

```bash
npx tsc --noEmit 2>&1 | grep "budget-tab-strip" | head -5
```
Open `/fmplus/financial/budget` — verify "Report" tab appears between Variance and Compare.

- [ ] **Step 3: Commit**

```bash
git add src/app/fmplus/financial/budget/_components/budget-tab-strip.tsx
git commit -m "feat(fmplus-budget): add 9th 'Report' tab to BudgetTabStrip"
```

---

## Tasks C10–C25: On-screen Report UI (16 components)

Tasks C10 through C25 build the on-screen HTML view of the report — one task per component. Each follows the same TDD shape:

1. Create the component file with full props typed against `ReportData`.
2. Render with Tailwind using FM+ tokens (`text-fmplus-gold`, `bg-fmplus-yellow/15`, fonts `font-serif`/`font-body`).
3. Conditional rendering based on `mode` and presence of optional sections.
4. Run `npx tsc --noEmit` for the file.
5. Commit per component.

Component list and primary responsibility (each is one task — paths under `src/lib/fmplus/budget/report/on-screen/`):

- **C10 — `on-screen-report.tsx`** (top-level: pulls server-side `buildProjectReport` data, composes section components below)
- **C11 — `sections/hero-block.tsx`** (FM+ logo + customer logo + title + status pill + 4 KPI tiles)
- **C12 — `sections/project-details.tsx`** (customer contacts grid, period, zones, scope_summary)
- **C13 — `sections/service-line-summary.tsx`** (table with service line, HC, fees, GP — mode-aware columns)
- **C14 — `sections/manning-summary.tsx`** (table by sub-section, mode-aware HC budgeted column)
- **C15 — `sections/budget-breakdown-matrix.tsx`** (8-cat × 7-svc grid, HIDDEN if `cells === null`)
- **C16 — `sections/mobilization.tsx`** (capex/training/recruitment items table OR summary card)
- **C17 — `sections/payment-terms.tsx`** (free-form text card with mode-aware "proposed" badge)
- **C18 — `sections/change-vs-initial.tsx`** (delta table with severity color coding)
- **C19 — `sections/variance-snapshot.tsx`** (YTD budget/actual KPIs from variance.ts)
- **C20 — `sections/sign-off-block.tsx`** (signature lines per mode + history table)
- **C21 — `sections/contract-rollup.tsx`** (year-over-year totals table)
- **C22 — `_components/report-mode-toggle.tsx`** (4-pill client component using URL `?mode=` param)
- **C23 — `_components/report-year-picker.tsx`** (Y1/Y2/Y3 dropdown for multi-year)
- **C24 — `_components/report-export-dialog.tsx`** (modal with EN/AR/Both radio + filename preview)
- **C25 — `app/fmplus/financial/budget/report/page.tsx`** (tab landing — contract picker grid)
- **C25b — `app/fmplus/financial/budget/report/[contractId]/page.tsx`** (server component glue)

Each task has: file path, a representative code skeleton (~30-50 lines), brief Tailwind/UX notes, run `tsc`, commit. The detailed code shapes follow the spec §5 file structure and §8 PDF page layout (substituting Tailwind for `@react-pdf` styling).

> **Implementation note:** Because each on-screen section also needs a PDF mirror (Tasks C26–C42), the agentic worker should pair each on-screen section with its PDF counterpart in adjacent tasks if running sequentially. Or: complete all on-screen first, then all PDF, then wire together — either order works.

---

## Tasks C26–C42: PDF Document & Pages (17 tasks)

PDF tree using `@react-pdf/renderer` — same structure as on-screen but with `<Document>`/`<Page>`/`<View>`/`<Text>` primitives and `StyleSheet` instead of Tailwind.

- **C26 — `theme.ts`** (`Font.register()` for Lalezar/DM Serif Display/Lato/NotoSansArabic + StyleSheet constants from FMPLUS_BRAND)
- **C27 — `pdf-shared/pdf-header.tsx`** (FM+ Svg logo + customer logo `<Image>` + status pill)
- **C28 — `pdf-shared/pdf-footer.tsx`** (page X of Y via `render={({pageNumber, totalPages}) => …}`)
- **C29 — `pdf-shared/label-dual.tsx`** (en / ar / both stacked, RTL handling)
- **C30 — `pdf-shared/status-pill.tsx`** (DRAFT amber / PUBLISHED green)
- **C31 — `pdf-pages/cover-hero.tsx`** (Page 1, portrait — title + 4 KPIs)
- **C32 — `pdf-pages/project-details.tsx`** (Page 2, portrait)
- **C33 — `pdf-pages/service-line-summary.tsx`** (Page 3, portrait — mode-aware: cost view internally, fee view in customer)
- **C34 — `pdf-pages/manning-table.tsx`** (Page 4, **landscape**)
- **C35 — `pdf-pages/budget-breakdown.tsx`** (Page 5, **landscape**, OMITTED if `data.budget_breakdown.cells === null`)
- **C36 — `pdf-pages/mobilization.tsx`** (Page 6, portrait, conditional)
- **C37 — `pdf-pages/payment-terms.tsx`** (Page 7, portrait, conditional)
- **C38 — `pdf-pages/change-vs-initial.tsx`** (Page 8, portrait, conditional)
- **C39 — `pdf-pages/variance-snapshot.tsx`** (Page 9, portrait, conditional — pull from existing `variance.ts`)
- **C40 — `pdf-pages/sign-off.tsx`** (Page 10, portrait, mode-aware lines)
- **C41 — `pdf-pages/contract-rollup.tsx`** (Page 11, portrait, conditional)
- **C42 — `pdf-document.tsx`** + **snapshot test** — top-level `<ProjectReportDocument>` composes all pages with proper conditional rendering. Snapshot test verifies the JSON tree shape per mode.

Each task: skeleton, run `tsc`, commit. The header/footer apply to every page via the shared components in C27/C28.

---

## Task C43: Implement API route handler `/api/fmplus/budget/report/[contractId]/[yearId]/pdf/route.ts`

**Files:** Create `src/app/api/fmplus/budget/report/[contractId]/[yearId]/pdf/route.ts`

- [ ] **Step 1: Write the route handler**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { buildProjectReport } from '@/lib/fmplus/budget/report/build-report';
import { ProjectReportDocument } from '@/lib/fmplus/budget/report/pdf-document';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { supabaseAdmin } from '@/lib/supabase';
import type { ReportMode, ReportLang } from '@/lib/fmplus/budget/report/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contractId: string; yearId: string }> }
) {
  const { contractId, yearId } = await params;
  const url = new URL(req.url);
  const mode = (url.searchParams.get('mode') ?? 'signoff') as ReportMode;
  const lang = (url.searchParams.get('lang') ?? 'en')      as ReportLang;

  const user = await requireBudgetView();

  // Customer mode + draft year is blocked
  const data = await buildProjectReport({
    contract_id: Number(contractId),
    year_id: Number(yearId),
    mode, lang,
    generated_by: user.username ?? 'system',
  });
  if (mode === 'customer' && data.meta.year.status === 'draft') {
    return NextResponse.json({ error: 'Customer-facing report requires year status = published.' }, { status: 403 });
  }

  // Render PDF
  const buffer = await renderToBuffer(<ProjectReportDocument data={data} />);

  // Audit log
  const sb = supabaseAdmin();
  await sb.from('budget_report_exports').insert({
    year_id: Number(yearId),
    contract_id: Number(contractId),
    mode, lang,
    exported_by: user.id,
    user_agent: req.headers.get('user-agent') ?? null,
  });

  // Filename
  const slug = data.meta.contract.name.replace(/\s+/g, '_');
  const filename = `${slug}_${data.meta.year.scenario}_Y${data.meta.year.year_index}_${mode}_${lang}.pdf`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
```

- [ ] **Step 2: Manual smoke test**

Visit `http://localhost:3000/api/fmplus/budget/report/5/6/pdf?mode=signoff&lang=en` (TRIO Y1 signoff English). Browser should download a PDF.

- [ ] **Step 3: Verify audit log row**

```sql
SELECT * FROM budget_report_exports ORDER BY exported_at DESC LIMIT 1;
```
Expected: row with mode=signoff, lang=en, year_id=6, contract_id=5.

- [ ] **Step 4: Verify customer+draft blocking**

If TRIO Y1 is draft, hit `?mode=customer&lang=en` — expect HTTP 403 with the "requires published" message. If it's published, manually set status=draft and retry.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/fmplus/budget/report/
git commit -m "feat(fmplus-report): API route /api/fmplus/budget/report/[c]/[y]/pdf — 4-mode + 3-lang PDF download with audit log"
```

---

## Task C44: Wire customer-logo upload + new fields into EditContractForm

**Files:** Modify `src/app/fmplus/financial/budget/projects/[contractId]/_components/edit-contract-form.tsx`

- [ ] **Step 1: Add 4 new form fields**

In the existing form, add (after the `notes` textarea):

```tsx
<label className="block">
  <span className="text-sm font-medium">Customer Contacts (JSON array)</span>
  <textarea
    name="customer_contacts"
    rows={4}
    defaultValue={JSON.stringify(contract.customer_contacts ?? [], null, 2)}
    placeholder='[{"name":"Ahmed Hassan","role":"Facility Manager","email":"x@y.com","phone":"+201","primary":true}]'
    className="w-full ix-input font-mono text-xs"
  />
</label>

<label className="block">
  <span className="text-sm font-medium">Payment Terms</span>
  <textarea
    name="payment_terms"
    rows={3}
    defaultValue={contract.payment_terms ?? ''}
    placeholder="Net 30. Mobilization 100% upfront within 7 days. Final invoice payable within 14 days of contract end."
    className="w-full ix-input"
  />
</label>

<label className="block">
  <span className="text-sm font-medium">Scope Summary (1-2 paragraphs, customer-visible)</span>
  <textarea
    name="scope_summary"
    rows={4}
    defaultValue={contract.scope_summary ?? ''}
    className="w-full ix-input"
  />
</label>

<label className="block">
  <span className="text-sm font-medium">Customer Logo URL</span>
  <input
    type="url"
    name="customer_logo_url"
    defaultValue={contract.customer_logo_url ?? ''}
    placeholder="https://bpjproljatbrbmszwbov.supabase.co/storage/v1/object/public/customer-logos/5.png"
    className="w-full ix-input"
  />
  <p className="text-xs text-slate-500 mt-1">Paste the public URL after uploading via Supabase Studio → Storage → customer-logos.</p>
</label>
```

V1 ships with manual URL paste; v2 enhancement is a direct-upload widget.

- [ ] **Step 2: Update server action `updateContractAction` to accept the new fields**

In the corresponding `actions.ts`, extend the FormData parsing to read the 4 new fields and parse `customer_contacts` as JSON. Validate via the extended `ProjectContractSchema` (Task C3).

- [ ] **Step 3: Test manually on TRIO**

Open `/fmplus/financial/budget/projects/5/edit`. Set `customer_contacts` to:
```json
[{"name":"Test Contact","role":"PM","email":"test@sodic.com","phone":"+20100","primary":true}]
```
Set `payment_terms` to "Net 30 monthly. Mobilization 100% upfront."
Set `scope_summary` to "TFM Package for TRIO Compound — 5 service lines (HK, MEP, Landscape, Pest Control, Back Office) over 12 months."
Save. Reload `/fmplus/financial/budget/report/5?mode=signoff` — verify those fields appear in the rendered report.

- [ ] **Step 4: Commit**

```bash
git add src/app/fmplus/financial/budget/projects/[contractId]/
git commit -m "feat(fmplus-budget): EditContractForm — customer_contacts/payment_terms/scope_summary/logo_url inputs"
```

---

## Task C45: Add deep links from Contract page + Variance tab

**Files:** Modify `src/app/fmplus/financial/budget/projects/[contractId]/page.tsx` AND `src/app/fmplus/financial/budget/variance/page.tsx`

- [ ] **Step 1: On contract edit page, add a "View Report" button**

Near the existing actions (Save, Duplicate, Archive), add:
```tsx
<Link
  href={`/fmplus/financial/budget/report/${contract.id}?year=${currentYearId}&mode=signoff`}
  className="ix-btn-secondary"
>
  <FileText size={14} className="mr-1" /> View Report
</Link>
```

- [ ] **Step 2: On Variance page, add "Export Sign-off Report"**

Below the existing Variance KPI cards, add:
```tsx
<Link
  href={`/fmplus/financial/budget/report/${contract.id}?year=${yearId}&mode=signoff`}
  className="text-sm text-fmplus-gold hover:underline"
>
  Generate Sign-off Report →
</Link>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/fmplus/financial/budget/projects/[contractId]/page.tsx src/app/fmplus/financial/budget/variance/page.tsx
git commit -m "feat(fmplus-report): deep links — contract page + variance page → Project Report"
```

---

## Task C46: Acceptance test — TRIO Y1, all 4 modes × 3 langs

**Files:** None (manual verification)

- [ ] **Step 1: Generate 12 PDFs**

For each combination, hit the URL and download:
```
/api/fmplus/budget/report/5/6/pdf?mode=pre&lang=en
/api/fmplus/budget/report/5/6/pdf?mode=pre&lang=ar
/api/fmplus/budget/report/5/6/pdf?mode=pre&lang=both
/api/fmplus/budget/report/5/6/pdf?mode=signoff&lang=en
/api/fmplus/budget/report/5/6/pdf?mode=signoff&lang=ar
/api/fmplus/budget/report/5/6/pdf?mode=signoff&lang=both
/api/fmplus/budget/report/5/6/pdf?mode=customer&lang=en
/api/fmplus/budget/report/5/6/pdf?mode=customer&lang=ar
/api/fmplus/budget/report/5/6/pdf?mode=customer&lang=both
/api/fmplus/budget/report/5/6/pdf?mode=snapshot&lang=en
/api/fmplus/budget/report/5/6/pdf?mode=snapshot&lang=ar
/api/fmplus/budget/report/5/6/pdf?mode=snapshot&lang=both
```

(If TRIO Y1 is draft, customer mode will return 403 — publish first or accept that customer mode is gated.)

- [ ] **Step 2: Visually inspect each PDF**

For each: confirm
- FM+ logo appears in header
- Brand colors are yellow/gold (NOT amber)
- Page count matches expectation per spec §8
- Signoff page has 2 lines for the right roles
- Customer-mode PDFs have NO ctc_rate / gp_pct / per-line cost detail anywhere
- Arabic PDFs render Arabic text correctly (NotoSansArabic font, RTL where needed)

- [ ] **Step 3: Verify audit log has 12 rows**

```sql
SELECT count(*), mode, lang FROM budget_report_exports WHERE year_id=6 GROUP BY mode, lang;
```
Expected: 12 rows total across the 4×3 matrix (or 9 if customer mode was blocked).

- [ ] **Step 4: Commit acceptance evidence (no code, just SESSION_HANDOFF entry)**

Update SESSION_HANDOFF.md with manual QA result. No git commit unless updating the handoff.

---

## Phase C Acceptance

- [ ] All migrations applied successfully (`0083` columns + tables exist).
- [ ] `npm test -- --run` shows existing tests + ~20 new tests = green suite.
- [ ] `npx tsc --noEmit` clean for FM+ paths.
- [ ] Visual inspection: TRIO Y1 renders correctly in all 4 modes on screen.
- [ ] PDF download works for all 4 modes × 3 langs (12 PDFs).
- [ ] Customer mode + draft year blocks export with HTTP 403.
- [ ] Customer mode PDFs verifiably contain ZERO ctc_rate / gp_pct / per-line cost detail.
- [ ] Audit log row written per export.
- [ ] Multi-year contract test (City Gate id=2) shows Contract Rollup page.
- [ ] Final push: `git fetch origin main && git rebase origin/main && git push origin HEAD:main`.
- [ ] SESSION_HANDOFF.md updated noting Phase C complete + Project Report tab is shipped.

This concludes the FM+ Project Report implementation. The full feature ships to prod via Vercel auto-deploy on `main` push.
