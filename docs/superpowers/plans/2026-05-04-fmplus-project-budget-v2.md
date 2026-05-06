# FM+ Project Budget v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/fmplus/financial/budget` v2 — full rewrite supporting multi-year contracts, multi-service projects, all 7 service-line templates, an admin-curated Catalog with per-project overrides, mobilization as a project-level entity amortized into variance, bilingual (en/ar) labels, richer manning CTC breakdown, per-line variance threshold overrides, and a "Copy Y1 → Y2" inflation dialog. Big-bang migration drops v1.

**Architecture:** New normalized data model in Supabase (10 tables, migration `0081` drops v1's 7 tables and creates v2 fresh). Templates code-defined per service line. Catalog rows are admin-managed DB rows; `project_catalog_overrides` layer per contract. Variance computed at request time by joining `budget_lines` with existing `odoo_move_line_analytics` via per-category regex on `odoo_accounts.code`, plus `mobilization_lines` amortized over contract duration. UI = 8 sub-tabs under `/fmplus/financial/budget` (Overview · Project Hub · Editor · Catalog · Import · Variance · Compare · Settings). Server actions for mutations; `force-dynamic` server components for reads.

**Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript strict, Tailwind v4, Supabase Postgres + JS service-role client, Zod, Vitest (colocated `*.test.ts`), `exceljs` for XLSX I/O, `@react-pdf/renderer` for PDF export. Per CLAUDE.md, every commit auto-deploys via `git push origin <branch>:main` (Vercel GitHub integration).

**Spec:** [docs/superpowers/specs/2026-05-04-fmplus-project-budget-v2-design.md](../specs/2026-05-04-fmplus-project-budget-v2-design.md)

**Branch:** `claude/eager-williamson-5787df` (worktree). Push pattern: `git push origin claude/eager-williamson-5787df:main`.

**Reference v1 plan** (for boilerplate patterns — variance shape, server-action shape, exceljs use): [docs/superpowers/plans/2026-05-03-fmplus-project-budget.md](2026-05-03-fmplus-project-budget.md). Some tasks below say "follow v1 Task N pattern" to avoid restating identical code; the executing agent is expected to read the referenced v1 task and apply the deltas spelled out in the v2 task.

---

## File structure

**New files (~58):**

Library `src/lib/fmplus/budget/`:
- `schema.ts` — Zod schemas for all 10 v2 tables + Catalog item shape + JSON blobs
- `types.ts` — TS types
- `db.ts` — typed `supabaseAdmin()` re-exports for v2 tables
- `permissions.ts` — `requireBudgetAdmin()` server action gate
- `templates/hk.ts` — HK template (richer than v1, includes CTC breakdown)
- `templates/mep.ts` — MEP template (full)
- `templates/landscape.ts` — Landscape template (full)
- `templates/security.ts` — Security template (full)
- `templates/pest-ctrl.ts` — Pest Control template (full)
- `templates/waste-mgmt.ts` — Waste Management template (full)
- `templates/back-office.ts` — Back Office template (full, NEW in v2)
- `templates/governmental.ts` — Governmental category seed (post-merge into every service template)
- `templates/index.ts` — `getTemplate(serviceLine, version)` + post-merge of Governmental
- `catalog/search.ts` — server-side catalog search
- `catalog/upsert.ts` — admin CRUD on `fmplus_catalog`
- `catalog/overrides.ts` — `resolveCatalogPrice(contractId, itemId)` resolver
- `catalog/seed-from-pricelist.ts` — XLSX → catalog rows (Emaar Pricelist parser)
- `contracts/create.ts` — `createContract()` server action (new-contract wizard commit)
- `contracts/duplicate.ts` — `copyYear()` with inflation knobs + per-line tweaks
- `contracts/rollover.ts` — FY-end auto-rollover (skeleton; cron in v2.1)
- `inflation-calc.ts` — pure inflation math + projection helpers used by Copy-year dialog
- `variance.ts` — `buildBudgetVarianceV2()` main read API
- `variance-drill.ts` — `cellToMoveLines()` for side drawer (carried over)
- `mobilization.ts` — `amortizeMobilization(contractId)` returns `Map<(year,month,category),amount>`
- `parsers/auto-detect.ts` — sniffer that picks the parser
- `parsers/rich-auc-style.ts` — AUC parser ported from v1, expanded to v2 schema
- `parsers/trio-style.ts` — TRIO multi-service parser
- `parsers/city-gate-multi-year.ts` — City Gate Y1/Y2 parser
- `parsers/emaar-zone-style.ts` — Emaar Uptown zone parser (collapses zones)
- `parsers/flat-template.ts` — v2 flat template parser (replaces v1's flat parser)
- `parsers/flat-template-export.ts` — Editor → flat XLSX writer
- `commit.ts` — atomic write transaction (contract+years+services+lines+mob)
- `audit.ts` — `writeAuditOnPublishedEdit()`
- `portfolio.ts` — `buildPortfolio()` returning contract cards for Project Hub
- `exports/variance-pdf.tsx` — `<react-pdf>` document for variance export
- `exports/variance-xlsx.ts` — exceljs writer for variance export

Tests (colocated):
- `schema.test.ts`, `templates/index.test.ts`, `catalog/search.test.ts`, `catalog/seed-from-pricelist.test.ts`, `contracts/duplicate.test.ts`, `inflation-calc.test.ts`, `variance.test.ts`, `mobilization.test.ts`, `parsers/{rich-auc-style,trio-style,city-gate-multi-year,emaar-zone-style,flat-template,auto-detect}.test.ts`, `commit.test.ts`, `portfolio.test.ts`

Test fixtures:
- `__fixtures__/auc-budget.xlsx` (port from v1)
- `__fixtures__/trio-budget.xlsx`
- `__fixtures__/city-gate-budget.xlsx`
- `__fixtures__/emaar-uptown-budget.xlsx`
- `__fixtures__/emaar-pricelist-seed.xlsx`

Routes `src/app/fmplus/financial/budget/`:
- `layout.tsx` — section layout + 8-tab strip + permission shell (rewritten)
- `page.tsx` — Overview (rewritten for v2 schema)
- `_components/anomaly-banner.tsx`
- `_components/health-dot.tsx`
- `_components/period-control.tsx`
- `_components/bilingual-toggle.tsx` — NEW: en/ar session toggle
- `projects/page.tsx` — Project Hub (NEW)
- `projects/_components/contract-card.tsx`
- `projects/_components/new-contract-wizard.tsx`
- `projects/actions.ts` — `createContract`, `archiveContract`
- `edit/page.tsx` — Editor (rewritten)
- `edit/actions.ts` — Save Draft / Publish / Delete year / Copy year
- `edit/_components/year-tabs.tsx`
- `edit/_components/service-tabs.tsx`
- `edit/_components/section-accordion.tsx`
- `edit/_components/budget-line-row.tsx`
- `edit/_components/ctc-expand.tsx`
- `edit/_components/add-line-picker.tsx` — Catalog modal
- `edit/_components/copy-year-dialog.tsx`
- `edit/_components/revenue-tab.tsx`
- `edit/_components/mobilization-tab.tsx`
- `catalog/page.tsx` — Catalog (NEW)
- `catalog/actions.ts` — `upsertItem`, `archiveItem`, `bulkImport`
- `catalog/_components/catalog-table.tsx`
- `catalog/_components/override-side-panel.tsx`
- `catalog/_components/bulk-import-modal.tsx`
- `import/page.tsx` — Import (rewritten — auto-detects 5 parser paths)
- `import/actions.ts`
- `import/_components/import-uploader.tsx`
- `import/_components/preview-grid.tsx`
- `variance/page.tsx` — Variance (rewritten for v2 — contract+year)
- `variance/_components/variance-grid.tsx`
- `variance/_components/drill-drawer.tsx`
- `variance/actions.ts`
- `compare/page.tsx` — Compare (rewritten — adds Year-vs-Year mode)
- `compare/_components/compare-grid.tsx`
- `compare/_components/yoy-mode-toggle.tsx`
- `settings/page.tsx` — Settings (rewritten — adds bilingual + inflation defaults + mob amort)
- `settings/actions.ts`

API:
- `src/app/api/fmplus/budget/flat-template-download/route.ts` — kept, regenerates v2 flat XLSX
- `src/app/api/fmplus/budget/variance-xlsx/route.ts` — kept, signature updated for contract+year
- `src/app/api/fmplus/budget/variance-pdf/route.ts` — same

Migrations:
- `supabase/migrations/0081_fmplus_project_budget_v2.sql` — drops v1 tables, creates v2 schema
- `supabase/migrations/0082_fmplus_catalog_seed.sql` — inserts ~80–100 catalog items (generated by seed script in Task 12)

**Modified files:**
- `package.json` — verify exceljs, @react-pdf/renderer, zod still installed (no install expected)

---

## Phase 1 — Foundation (Tasks 1-3)

### Task 1: Migration 0081 — drop v1 + create v2 schema

**Files:**
- Create: `supabase/migrations/0081_fmplus_project_budget_v2.sql`

- [ ] **Step 1: Confirm v1 inventory**

Run via Supabase MCP `execute_sql` against project `bpjproljatbrbmszwbov`:

```sql
select count(*) from public.project_budgets;
select count(*) from public.budget_lines;
```

Expected: `1` and `~30` (one AUC budget). User has accepted loss of this data per spec § 4 Q1.

- [ ] **Step 2: Write the migration SQL**

Create `supabase/migrations/0081_fmplus_project_budget_v2.sql` with the full DDL from spec § 6:

```sql
-- Phase: FM+ Project Budget v2 (big-bang migration)
-- Drops v1's 7 tables, creates v2's 10 tables.
-- See docs/superpowers/specs/2026-05-04-fmplus-project-budget-v2-design.md
-- service_line:    'hk' | 'mep' | 'landscape' | 'security' | 'pest_ctrl' | 'waste_mgmt' | 'back_office'
-- year_tracking:   'contract' | 'fiscal'
-- scenario:        'initial' | 'revised' | 'reforecast'
-- status:          'draft' | 'published'
-- mob amort:       'straight_line' | 'flat'
-- catalog_unit:    'each' | 'monthly' | 'annual' | 'per_head' | 'liter' | 'kg' | 'm2' | 'pct_revenue'

-- 1. DROP v1 tables (dependency order)
drop table if exists public.budget_audit         cascade;
drop table if exists public.budget_revenue_lines cascade;
drop table if exists public.budget_lines         cascade;
drop table if exists public.project_budget_segments cascade;
drop table if exists public.project_budgets     cascade;
drop table if exists public.budget_settings     cascade;
drop table if exists public.budget_templates    cascade;

-- 2. CREATE v2 tables
create table public.project_contracts (
  id              bigserial primary key,
  project_id      bigint not null references public.odoo_analytic_accounts(id),
  name            text not null,
  customer        text,
  start_date      date not null,
  end_date        date not null,
  duration_months int  generated always as
                    ((extract(year  from age(end_date, start_date)) * 12 +
                      extract(month from age(end_date, start_date)))::int) stored,
  contract_value  numeric(16,2) not null default 0,
  vat_pct         numeric(5,2)  not null default 14,
  year_tracking   text not null default 'contract'
                    check (year_tracking in ('contract','fiscal')),
  reimbursables   jsonb not null default '[]'::jsonb,
  zones           jsonb not null default '[]'::jsonb,
  notes           text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, name)
);
create index if not exists ix_project_contracts_project_id on public.project_contracts (project_id);

create table public.project_services (
  id              bigserial primary key,
  contract_id     bigint not null references public.project_contracts(id) on delete cascade,
  service_line    text not null check (service_line in
                    ('hk','mep','landscape','security','pest_ctrl','waste_mgmt','back_office')),
  template_version int not null,
  unique (contract_id, service_line)
);

create table public.project_years (
  id              bigserial primary key,
  contract_id     bigint not null references public.project_contracts(id) on delete cascade,
  year_index      int  not null check (year_index >= 1),
  fiscal_year     int,
  start_month     int  not null check (start_month between 1 and 12),
  scenario        text not null default 'initial'
                    check (scenario in ('initial','revised','reforecast')),
  status          text not null default 'draft'
                    check (status in ('draft','published')),
  published_at    timestamptz,
  published_by    uuid references auth.users(id),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (contract_id, year_index, scenario)
);
create index if not exists ix_project_years_contract on public.project_years (contract_id);

create table public.project_year_services (
  id              bigserial primary key,
  year_id         bigint not null references public.project_years(id) on delete cascade,
  service_line    text not null,
  monthly_revenue numeric(14,2) not null default 0,
  vat_pct         numeric(5,2)  not null default 14,
  manpower_ramp   jsonb not null default '{}'::jsonb,
  unique (year_id, service_line)
);

create table public.fmplus_catalog (
  id              bigserial primary key,
  code            text unique not null,
  name_en         text not null,
  name_ar         text,
  unit            text not null check (unit in
                    ('each','monthly','annual','per_head','liter','kg','m2','pct_revenue')),
  default_price   numeric(14,4) not null,
  service_lines   text[] not null default '{}',
  category        text not null,
  tags            text[] not null default '{}',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists ix_fmplus_catalog_tags on public.fmplus_catalog using gin (tags);
create index if not exists ix_fmplus_catalog_services on public.fmplus_catalog using gin (service_lines);

create table public.project_catalog_overrides (
  id              bigserial primary key,
  contract_id     bigint not null references public.project_contracts(id) on delete cascade,
  catalog_item_id bigint not null references public.fmplus_catalog(id) on delete cascade,
  unit_cost       numeric(14,2),
  notes           text,
  unique (contract_id, catalog_item_id)
);

create table public.budget_lines (
  id              bigserial primary key,
  year_id         bigint not null references public.project_years(id) on delete cascade,
  service_line    text not null,
  category        text not null,
  line_code       text not null,
  catalog_item_id bigint references public.fmplus_catalog(id),
  label_en        text not null,
  label_ar        text,
  season          text not null default 'high'
                    check (season in ('high','low')),
  qty             numeric(12,4) not null default 0,
  unit_cost       numeric(14,4) not null default 0,
  monthly_cost    numeric(16,4) generated always as (qty * unit_cost) stored,
  ctc_net         numeric(14,2),
  ctc_relievers   numeric(14,2),
  ctc_ot          numeric(14,2),
  ctc_training    numeric(14,2),
  ctc_insurance   numeric(14,2),
  ctc_medical     numeric(14,2),
  threshold_green numeric(5,2),
  threshold_amber numeric(5,2),
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists ix_budget_lines_year_service_cat on public.budget_lines (year_id, service_line, category);
create index if not exists ix_budget_lines_catalog on public.budget_lines (catalog_item_id);

create table public.mobilization_lines (
  id              bigserial primary key,
  contract_id     bigint not null references public.project_contracts(id) on delete cascade,
  category        text not null,
  label_en        text not null,
  label_ar        text,
  qty             numeric(12,4) not null default 1,
  unit_cost       numeric(14,2) not null default 0,
  total_cost      numeric(16,2) generated always as (qty * unit_cost) stored,
  amortization    text not null default 'straight_line'
                    check (amortization in ('straight_line','flat')),
  amortization_months int not null default 24,
  notes           text
);
create index if not exists ix_mobilization_lines_contract on public.mobilization_lines (contract_id);

create table public.budget_audit (
  id              bigserial primary key,
  year_id         bigint not null references public.project_years(id) on delete cascade,
  changed_at      timestamptz not null default now(),
  changed_by      uuid references auth.users(id),
  diff_json       jsonb not null
);

create table public.budget_settings (
  id              int primary key default 1,
  green_pct       numeric(5,2) not null default 5,
  amber_pct       numeric(5,2) not null default 15,
  default_scenario text not null default 'initial',
  default_inflation_revenue   numeric(5,2) not null default 7.0,
  default_inflation_manpower  numeric(5,2) not null default 10.0,
  default_inflation_other     numeric(5,2) not null default 5.0,
  default_mob_amortization_months int not null default 24,
  bilingual_default text not null default 'en' check (bilingual_default in ('en','ar')),
  updated_at      timestamptz not null default now()
);
insert into public.budget_settings (id) values (1) on conflict do nothing;

-- 3. Touch triggers on updated_at
create or replace function public.touch_updated_at() returns trigger as $$
  begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_touch_project_contracts on public.project_contracts;
create trigger trg_touch_project_contracts before update on public.project_contracts
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_project_years on public.project_years;
create trigger trg_touch_project_years before update on public.project_years
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_fmplus_catalog on public.fmplus_catalog;
create trigger trg_touch_fmplus_catalog before update on public.fmplus_catalog
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_budget_settings on public.budget_settings;
create trigger trg_touch_budget_settings before update on public.budget_settings
  for each row execute function public.touch_updated_at();
```

- [ ] **Step 3: Apply migration via Supabase MCP**

Run `mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__apply_migration`:
- name: `0081_fmplus_project_budget_v2`
- query: contents of the SQL file

- [ ] **Step 4: Verify schema**

```sql
select table_name from information_schema.tables
where table_schema='public' and table_name in (
  'project_contracts','project_services','project_years','project_year_services',
  'fmplus_catalog','project_catalog_overrides','budget_lines','mobilization_lines',
  'budget_audit','budget_settings')
order by table_name;
```

Expected: 10 rows. Also confirm v1 tables gone:

```sql
select table_name from information_schema.tables
where table_schema='public' and table_name in (
  'budget_templates','project_budget_segments','budget_revenue_lines');
```

Expected: 0 rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0081_fmplus_project_budget_v2.sql
git commit -m "feat(fmplus-budget): migration 0081 — drop v1, create v2 schema (10 tables)"
```

---

### Task 2: Zod schemas + TypeScript types

**Files:**
- Create: `src/lib/fmplus/budget/schema.ts`
- Create: `src/lib/fmplus/budget/types.ts`
- Create: `src/lib/fmplus/budget/schema.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/fmplus/budget/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ProjectContractSchema, ProjectYearSchema, ProjectServiceSchema,
  BudgetLineSchema, MobilizationLineSchema, FmplusCatalogItemSchema,
  ServiceLineEnum, YearTrackingEnum, ScenarioEnum, StatusEnum, CatalogUnitEnum,
} from './schema';

describe('schema', () => {
  it('parses valid contract', () => {
    const c = ProjectContractSchema.parse({
      id: 1, project_id: 100, name: 'AUC',
      customer: 'AUC', start_date: '2026-01-01', end_date: '2026-12-31',
      contract_value: 42_600_000, vat_pct: 14,
      year_tracking: 'contract', reimbursables: [], zones: [],
    });
    expect(c.name).toBe('AUC');
  });

  it('rejects bad service_line', () => {
    expect(() => ProjectServiceSchema.parse({
      contract_id: 1, service_line: 'bogus', template_version: 1,
    })).toThrow();
  });

  it('parses budget line with CTC breakdown', () => {
    const l = BudgetLineSchema.parse({
      year_id: 1, service_line: 'hk', category: 'manning',
      line_code: 'hk_mf_8h', label_en: 'HK M/F 8H',
      season: 'high', qty: 120, unit_cost: 12840,
      ctc_net: 7500, ctc_relievers: 1250, ctc_ot: 1800,
      ctc_training: 240, ctc_insurance: 1250, ctc_medical: 800,
    });
    expect(l.ctc_net).toBe(7500);
  });

  it('parses pct_revenue catalog unit', () => {
    const c = FmplusCatalogItemSchema.parse({
      code: 'gov_taminat', name_en: 'Contractor Insurance',
      unit: 'pct_revenue', default_price: 1.4,
      service_lines: ['hk'], category: 'governmental', tags: [],
    });
    expect(c.unit).toBe('pct_revenue');
  });

  it('enforces enums', () => {
    expect(ServiceLineEnum.options).toContain('back_office');
    expect(YearTrackingEnum.options).toEqual(['contract', 'fiscal']);
    expect(CatalogUnitEnum.options).toContain('pct_revenue');
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npm run test -- src/lib/fmplus/budget/schema.test.ts
```

Expected: fails — module not found.

- [ ] **Step 3: Implement schema.ts**

`src/lib/fmplus/budget/schema.ts`:

```ts
import { z } from 'zod';

// ---------- Enums ----------
export const ServiceLineEnum  = z.enum(['hk','mep','landscape','security','pest_ctrl','waste_mgmt','back_office']);
export const YearTrackingEnum = z.enum(['contract','fiscal']);
export const ScenarioEnum     = z.enum(['initial','revised','reforecast']);
export const StatusEnum       = z.enum(['draft','published']);
export const SeasonEnum       = z.enum(['high','low']);
export const CategoryEnum     = z.enum(['manning','ppe','tools','consumables','transport','it','governmental','other']);
export const CatalogUnitEnum  = z.enum(['each','monthly','annual','per_head','liter','kg','m2','pct_revenue']);
export const MobAmortEnum     = z.enum(['straight_line','flat']);

// ---------- Tables ----------
export const ProjectContractSchema = z.object({
  id: z.number().optional(),
  project_id: z.number(),
  name: z.string().min(1),
  customer: z.string().nullable().optional(),
  start_date: z.string(), // ISO date
  end_date: z.string(),
  contract_value: z.number().nonnegative().default(0),
  vat_pct: z.number().nonnegative().default(14),
  year_tracking: YearTrackingEnum.default('contract'),
  reimbursables: z.array(z.any()).default([]),
  zones: z.array(z.any()).default([]),
  notes: z.string().nullable().optional(),
});
export type ProjectContract = z.infer<typeof ProjectContractSchema>;

export const ProjectServiceSchema = z.object({
  id: z.number().optional(),
  contract_id: z.number(),
  service_line: ServiceLineEnum,
  template_version: z.number().int().nonnegative(),
});
export type ProjectService = z.infer<typeof ProjectServiceSchema>;

export const ProjectYearSchema = z.object({
  id: z.number().optional(),
  contract_id: z.number(),
  year_index: z.number().int().min(1),
  fiscal_year: z.number().int().nullable().optional(),
  start_month: z.number().int().min(1).max(12).default(1),
  scenario: ScenarioEnum.default('initial'),
  status: StatusEnum.default('draft'),
  notes: z.string().nullable().optional(),
});
export type ProjectYear = z.infer<typeof ProjectYearSchema>;

export const ProjectYearServiceSchema = z.object({
  id: z.number().optional(),
  year_id: z.number(),
  service_line: ServiceLineEnum,
  monthly_revenue: z.number().nonnegative().default(0),
  vat_pct: z.number().nonnegative().default(14),
  manpower_ramp: z.record(z.number()).default({}),
});
export type ProjectYearService = z.infer<typeof ProjectYearServiceSchema>;

export const FmplusCatalogItemSchema = z.object({
  id: z.number().optional(),
  code: z.string().min(1),
  name_en: z.string().min(1),
  name_ar: z.string().nullable().optional(),
  unit: CatalogUnitEnum,
  default_price: z.number().nonnegative(),
  service_lines: z.array(ServiceLineEnum).default([]),
  category: CategoryEnum,
  tags: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
});
export type FmplusCatalogItem = z.infer<typeof FmplusCatalogItemSchema>;

export const ProjectCatalogOverrideSchema = z.object({
  id: z.number().optional(),
  contract_id: z.number(),
  catalog_item_id: z.number(),
  unit_cost: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type ProjectCatalogOverride = z.infer<typeof ProjectCatalogOverrideSchema>;

export const BudgetLineSchema = z.object({
  id: z.number().optional(),
  year_id: z.number(),
  service_line: ServiceLineEnum,
  category: CategoryEnum,
  line_code: z.string().min(1),
  catalog_item_id: z.number().nullable().optional(),
  label_en: z.string().min(1),
  label_ar: z.string().nullable().optional(),
  season: SeasonEnum.default('high'),
  qty: z.number().nonnegative().default(0),
  unit_cost: z.number().nonnegative().default(0),
  ctc_net: z.number().nullable().optional(),
  ctc_relievers: z.number().nullable().optional(),
  ctc_ot: z.number().nullable().optional(),
  ctc_training: z.number().nullable().optional(),
  ctc_insurance: z.number().nullable().optional(),
  ctc_medical: z.number().nullable().optional(),
  threshold_green: z.number().nullable().optional(),
  threshold_amber: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type BudgetLine = z.infer<typeof BudgetLineSchema>;

export const MobilizationLineSchema = z.object({
  id: z.number().optional(),
  contract_id: z.number(),
  category: z.enum(['capex','opex_one_time','training','recruitment']),
  label_en: z.string().min(1),
  label_ar: z.string().nullable().optional(),
  qty: z.number().nonnegative().default(1),
  unit_cost: z.number().nonnegative().default(0),
  amortization: MobAmortEnum.default('straight_line'),
  amortization_months: z.number().int().positive().default(24),
  notes: z.string().nullable().optional(),
});
export type MobilizationLine = z.infer<typeof MobilizationLineSchema>;

export const BudgetSettingsSchema = z.object({
  id: z.literal(1).default(1),
  green_pct: z.number().default(5),
  amber_pct: z.number().default(15),
  default_scenario: ScenarioEnum.default('initial'),
  default_inflation_revenue: z.number().default(7.0),
  default_inflation_manpower: z.number().default(10.0),
  default_inflation_other: z.number().default(5.0),
  default_mob_amortization_months: z.number().int().positive().default(24),
  bilingual_default: z.enum(['en','ar']).default('en'),
});
export type BudgetSettings = z.infer<typeof BudgetSettingsSchema>;

// Template JSON shape (code-defined, not in DB)
export const TemplateLineSchema = z.object({
  code: z.string(),
  label_en: z.string(),
  label_ar: z.string().optional(),
  default_qty: z.number().optional(),
  default_unit_cost: z.number().optional(),
});
export const TemplateCategorySchema = z.object({
  code: CategoryEnum,
  label_en: z.string(),
  label_ar: z.string().optional(),
  lines: z.array(TemplateLineSchema).default([]),
});
export const TemplateSchema = z.object({
  service_line: ServiceLineEnum,
  version: z.number().int().nonnegative(),
  vat_pct: z.number().default(14),
  default_seasons: z.object({
    high: z.array(z.number()),
    low: z.array(z.number()),
  }),
  categories: z.array(TemplateCategorySchema),
  account_map_json: z.array(z.object({
    category: CategoryEnum,
    code_patterns: z.array(z.string()),
  })),
});
export type Template = z.infer<typeof TemplateSchema>;
```

- [ ] **Step 4: Implement types.ts**

`src/lib/fmplus/budget/types.ts`:

```ts
export type {
  ProjectContract, ProjectService, ProjectYear, ProjectYearService,
  FmplusCatalogItem, ProjectCatalogOverride, BudgetLine, MobilizationLine,
  BudgetSettings, Template,
} from './schema';

export type ServiceLine =
  'hk' | 'mep' | 'landscape' | 'security' | 'pest_ctrl' | 'waste_mgmt' | 'back_office';
export type Category =
  'manning' | 'ppe' | 'tools' | 'consumables' | 'transport' | 'it' | 'governmental' | 'other';
export type Bilingual = 'en' | 'ar';

export interface VarianceCell {
  budget: number;
  actual: number;
  mob_amortized: number;
  variance: number;
  variance_pct: number | null;
  color: 'green' | 'amber' | 'red';
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test -- src/lib/fmplus/budget/schema.test.ts
```

Expected: PASS — all 5 cases.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fmplus/budget/schema.ts src/lib/fmplus/budget/types.ts src/lib/fmplus/budget/schema.test.ts
git commit -m "feat(fmplus-budget): zod schemas + TS types for v2 (10 tables + template + variance)"
```

---

### Task 3: Permissions + DB helper

**Files:**
- Create: `src/lib/fmplus/budget/permissions.ts`
- Create: `src/lib/fmplus/budget/db.ts`

- [ ] **Step 1: Implement permissions.ts**

`src/lib/fmplus/budget/permissions.ts`:

```ts
import { requireAdmin, getCurrentUser } from '@/lib/auth';
import { canAccessDomain } from '@/lib/auth-constants';

export async function requireBudgetView() {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  if (!canAccessDomain(user, 'fmplus')) throw new Error('forbidden');
  return user;
}

export async function requireBudgetAdmin() {
  await requireBudgetView();
  return await requireAdmin();
}
```

- [ ] **Step 2: Implement db.ts**

`src/lib/fmplus/budget/db.ts`:

```ts
import { supabaseAdmin } from '@/lib/supabase';

export function budgetDb() {
  return supabaseAdmin();
}

export const TABLES = {
  contracts: 'project_contracts',
  services:  'project_services',
  years:     'project_years',
  year_services: 'project_year_services',
  catalog:   'fmplus_catalog',
  overrides: 'project_catalog_overrides',
  lines:     'budget_lines',
  mob:       'mobilization_lines',
  audit:     'budget_audit',
  settings:  'budget_settings',
} as const;
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/fmplus/budget/permissions.ts src/lib/fmplus/budget/db.ts
git commit -m "feat(fmplus-budget): permission gates + db helper for v2"
```

---

## Phase 2 — Templates + Catalog seed (Tasks 4-12)

### Task 4: HK template (canonical, with CTC breakdown)

**Files:**
- Create: `src/lib/fmplus/budget/templates/hk.ts`

- [ ] **Step 1: Define HK template**

`src/lib/fmplus/budget/templates/hk.ts`:

```ts
import type { Template } from '../schema';

export const hkTemplate: Template = {
  service_line: 'hk',
  version: 1,
  vat_pct: 14,
  default_seasons: { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] },
  categories: [
    {
      code: 'manning',
      label_en: 'Manning',
      label_ar: 'العمالة',
      lines: [
        { code: 'hk_manager',    label_en: 'HK Manager',          label_ar: 'مدير النظافة',  default_qty: 1 },
        { code: 'asst_manager',  label_en: 'Assistant Manager',   label_ar: 'مدير مساعد',     default_qty: 1 },
        { code: 'sr_supervisor', label_en: 'Senior Supervisor',   label_ar: 'مشرف أول',       default_qty: 2 },
        { code: 'sup_8h',        label_en: 'Supervisor 8H',       label_ar: 'مشرف 8 ساعات',   default_qty: 4 },
        { code: 'hk_mf_8h',      label_en: 'HK Male & Female 8H', label_ar: 'عامل/ة نظافة',   default_qty: 60 },
        { code: 'facades_sup',   label_en: 'Facades Supervisor',  label_ar: 'مشرف واجهات',    default_qty: 1 },
        { code: 'facades_lab',   label_en: 'Facades Labor',       label_ar: 'عامل واجهات',    default_qty: 8 },
        { code: 'waste_sup',     label_en: 'Waste Supervisor',    label_ar: 'مشرف نفايات',    default_qty: 1 },
        { code: 'waste_lab',     label_en: 'Waste Labor',         label_ar: 'عامل نفايات',    default_qty: 6 },
        { code: 'admin',         label_en: 'Admin',               label_ar: 'إداري',           default_qty: 1 },
        { code: 'storekeeper',   label_en: 'Storekeeper',         label_ar: 'أمين مخزن',       default_qty: 1 },
        { code: 'driver',        label_en: 'Driver',              label_ar: 'سائق',            default_qty: 2 },
        { code: 'trainer',       label_en: 'Trainer',             label_ar: 'مدرب',            default_qty: 1 },
        { code: 'sup_8h_r',      label_en: 'Supervisor 8H (R)',   label_ar: 'مشرف بديل',       default_qty: 1 },
        { code: 'hk_f_8h_r',     label_en: 'HK Female 8H (R)',    label_ar: 'بديلة',           default_qty: 4 },
      ],
    },
    {
      code: 'ppe',
      label_en: 'Uniform & PPE',
      label_ar: 'الزي والمعدات الواقية',
      lines: [
        { code: 'uniform_polo',  label_en: 'Polo Uniform',  label_ar: 'بولو',     default_unit_cost: 240 },
        { code: 'uniform_pants', label_en: 'Pants',          label_ar: 'بنطال',     default_unit_cost: 180 },
        { code: 'safety_shoes',  label_en: 'Safety Shoes',   label_ar: 'حذاء أمان', default_unit_cost: 320 },
        { code: 'gloves_pack',   label_en: 'Gloves (pack)',  label_ar: 'قفازات',    default_unit_cost: 65 },
      ],
    },
    {
      code: 'tools',
      label_en: 'Tools, Machinery & Consumables',
      label_ar: 'الأدوات والآلات والمستهلكات',
      lines: [
        { code: 'machinery_scrubber',  label_en: 'Auto Scrubber',  label_ar: 'مكنسة آلية', default_unit_cost: 18000 },
        { code: 'tool_broom_soft',     label_en: 'Soft Broom',     label_ar: 'مكنسة ناعمة', default_unit_cost: 85 },
        { code: 'cons_floor_clean_5l', label_en: 'Floor Cleaner 5L', label_ar: 'منظف أرضيات', default_unit_cost: 42 },
      ],
    },
    {
      code: 'transport',
      label_en: 'Transportation & Vehicles',
      label_ar: 'النقل والمركبات',
      lines: [
        { code: 'veh_microbus', label_en: 'Microbus 14-seater', label_ar: 'ميكروباص', default_unit_cost: 28400 },
        { code: 'veh_pickup',   label_en: 'Pickup',             label_ar: 'بيك أب',     default_unit_cost: 18200 },
        { code: 'fuel',         label_en: 'Fuel',               label_ar: 'وقود',        default_unit_cost: 12500 },
      ],
    },
    {
      code: 'it',
      label_en: 'IT & Communication',
      label_ar: 'تقنية المعلومات والاتصال',
      lines: [
        { code: 'it_per_head', label_en: 'Laptop / Mobile / SIM (per head)', label_ar: 'لابتوب / موبايل / شريحة', default_unit_cost: 250 },
      ],
    },
    // governmental category injected post-merge in templates/index.ts
  ],
  account_map_json: [
    { category: 'manning',      code_patterns: ['^5000(0[1-9]|1[0-4])$'] },
    { category: 'ppe',          code_patterns: ['^500011$'] },
    { category: 'tools',        code_patterns: ['^5002(0[1-9]|1[0-9])$', '^5001(0[1-9]|1[0-9])$'] },
    { category: 'consumables',  code_patterns: ['^5001(0[1-9]|1[0-9])$'] },
    { category: 'transport',    code_patterns: ['^5005[0-9]{2}$'] },
    { category: 'it',           code_patterns: ['^5003(0[1-9]|1[0-9])$'] },
    { category: 'governmental', code_patterns: ['^5006[0-9]{2}$'] },
  ],
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/fmplus/budget/templates/hk.ts
git commit -m "feat(fmplus-budget): HK template (15 manning + 4 PPE + 3 tools + 3 transport + 1 IT)"
```

---

### Task 5-10: Service-line templates (MEP, Landscape, Security, Pest Ctrl, Waste Mgmt, Back Office)

**Pattern:** Same shape as Task 4. Each gets its own `templates/<service>.ts` file. Source data: read the matching service columns in `FMPLUS/TRIO Budget .xlsx` and `FMPLUS/City Gate Budget.xlsx`. Categories follow the spec § 6.1.

For each task below, replicate Task 4 structure with the data summary provided. Each commits separately.

### Task 5: MEP template

**Source:** TRIO Budget MEP service tab + City Gate Y1 MEP sheet.

**Categories:** `manning`, `tools`, `consumables` (chemicals, filters), `transport`, `it`. No PPE category (uniforms covered in tools).

**Manning lines:** `mep_engineer`, `mep_technician_hvac`, `mep_technician_plumbing`, `mep_technician_electric`, `mep_helper`, `mep_supervisor`. Account-map regex: `^5010[0-9]{2}$` for manning, `^5011[0-9]{2}$` for tools/consumables, `^5012[0-9]{2}$` for transport.

Commit: `feat(fmplus-budget): MEP template (6 manning + tools + consumables + transport + IT)`

### Task 6: Landscape template

**Source:** TRIO Budget Landscape tab.

**Categories:** `manning`, `tools` (mowers, clippers), `consumables` (fertilizer, seeds, plants), `transport`, `it`.

**Manning:** `landscape_supervisor`, `gardener`, `gardener_helper`, `irrigation_tech`. Account-map: `^5020[0-9]{2}$` for manning, `^5021[0-9]{2}$` for tools.

Commit: `feat(fmplus-budget): Landscape template (4 manning + tools + consumables + transport + IT)`

### Task 7: Security template

**Source:** City Gate Y1 Security sheet.

**Categories:** `manning` (heavy weight), `ppe` (uniforms+badges), `tools` (radios, metal detectors), `it`.

**Manning:** `sec_manager`, `sec_supervisor`, `sec_guard_8h`, `sec_guard_12h`, `sec_dog_handler`, `sec_cctv_operator`. Account-map: `^5030[0-9]{2}$`.

Commit: `feat(fmplus-budget): Security template (6 manning + PPE + tools + IT)`

### Task 8: Pest Ctrl template

**Source:** TRIO Budget Pest tab.

**Categories:** `manning` (small), `tools` (sprayers, traps), `consumables` (chemicals — major), `transport`.

**Manning:** `pest_supervisor`, `pest_technician`, `pest_helper`. Account-map: `^5040[0-9]{2}$`.

Commit: `feat(fmplus-budget): Pest Ctrl template (3 manning + tools + chemicals + transport)`

### Task 9: Waste Mgmt template

**Source:** AUC Budget Waste sub-section + TRIO Waste tab.

**Categories:** `manning`, `transport` (compactors, trucks — major), `tools`, `consumables` (bags).

**Manning:** `waste_supervisor`, `waste_collector`, `waste_driver`. Account-map: `^5050[0-9]{2}$`.

Commit: `feat(fmplus-budget): Waste Mgmt template (3 manning + transport + tools + bags)`

### Task 10: Back Office template

**Source:** TRIO Budget Back Office tab + City Gate FM Fees Summary.

**Categories:** `manning` (HR, accountant, ops manager), `it` (subscriptions, accounting software), `tools` (office supplies). No transport.

**Manning:** `bo_director`, `bo_ops_manager`, `bo_hr`, `bo_accountant`, `bo_admin`. Account-map: `^5060[0-9]{2}$`.

Commit: `feat(fmplus-budget): Back Office template (5 manning + IT + supplies)`

---

### Task 11: Governmental category seed + templates/index.ts post-merge

**Files:**
- Create: `src/lib/fmplus/budget/templates/governmental.ts`
- Create: `src/lib/fmplus/budget/templates/index.ts`
- Create: `src/lib/fmplus/budget/templates/index.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/fmplus/budget/templates/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getTemplate, ALL_SERVICE_LINES } from './index';
import { TemplateSchema } from '../schema';

describe('getTemplate', () => {
  it('returns HK with governmental section appended', () => {
    const t = getTemplate('hk', 1);
    expect(t.service_line).toBe('hk');
    const govCat = t.categories.find(c => c.code === 'governmental');
    expect(govCat).toBeDefined();
    expect(govCat!.lines.length).toBe(3);
    expect(govCat!.lines[0].code).toBe('gov_taminat');
  });

  it('every service line resolves and validates', () => {
    for (const sl of ALL_SERVICE_LINES) {
      const t = getTemplate(sl, 1);
      expect(() => TemplateSchema.parse(t)).not.toThrow();
      expect(t.categories.find(c => c.code === 'governmental')).toBeDefined();
    }
  });

  it('accepts version 1 only (v1 of v2)', () => {
    expect(() => getTemplate('hk', 99)).toThrow(/version/);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

- [ ] **Step 3: Implement governmental.ts**

`src/lib/fmplus/budget/templates/governmental.ts`:

```ts
import type { TemplateCategorySchema } from '../schema';
import type { z } from 'zod';

export const governmentalCategory: z.infer<typeof TemplateCategorySchema> = {
  code: 'governmental',
  label_en: 'Governmental Expenses',
  label_ar: 'المصروفات الحكومية',
  lines: [
    { code: 'gov_taminat',     label_en: 'Contractor Insurance (1.4% of revenue)', label_ar: 'تامينات مقاولات' },
    { code: 'gov_tax_stamps',  label_en: 'Tax Stamps',          label_ar: 'دمغات وضرائب' },
    { code: 'gov_work_permit', label_en: 'Work Permits',        label_ar: 'تصاريح عمل' },
  ],
};
```

- [ ] **Step 4: Implement index.ts**

`src/lib/fmplus/budget/templates/index.ts`:

```ts
import type { Template, ServiceLine } from '../schema';
import { hkTemplate } from './hk';
import { mepTemplate } from './mep';
import { landscapeTemplate } from './landscape';
import { securityTemplate } from './security';
import { pestCtrlTemplate } from './pest-ctrl';
import { wasteMgmtTemplate } from './waste-mgmt';
import { backOfficeTemplate } from './back-office';
import { governmentalCategory } from './governmental';

export const ALL_SERVICE_LINES: ServiceLine[] = [
  'hk','mep','landscape','security','pest_ctrl','waste_mgmt','back_office',
];

const TEMPLATES_BY_SERVICE: Record<ServiceLine, Template> = {
  hk: hkTemplate, mep: mepTemplate, landscape: landscapeTemplate,
  security: securityTemplate, pest_ctrl: pestCtrlTemplate,
  waste_mgmt: wasteMgmtTemplate, back_office: backOfficeTemplate,
};

export function getTemplate(serviceLine: ServiceLine, version: number): Template {
  if (version !== 1) throw new Error(`Unknown template version ${version} for ${serviceLine}`);
  const base = TEMPLATES_BY_SERVICE[serviceLine];
  if (!base) throw new Error(`No template for service line ${serviceLine}`);
  // Post-merge: append governmental category to every service template
  return {
    ...base,
    categories: [...base.categories, governmentalCategory],
  };
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test -- src/lib/fmplus/budget/templates/index.test.ts
```

Expected: PASS — 3 cases.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fmplus/budget/templates/governmental.ts src/lib/fmplus/budget/templates/index.ts src/lib/fmplus/budget/templates/index.test.ts
git commit -m "feat(fmplus-budget): governmental category + getTemplate post-merge for all 7 services"
```

---

### Task 12: Catalog seed from Emaar Pricelist

**Files:**
- Create: `src/lib/fmplus/budget/catalog/seed-from-pricelist.ts`
- Create: `src/lib/fmplus/budget/catalog/seed-from-pricelist.test.ts`
- Create: `src/lib/fmplus/budget/__fixtures__/emaar-pricelist-seed.xlsx` (extracted from `FMPLUS/Emaar Uptown HK Budget.xlsx → Items Pricelist`)
- Create: `supabase/migrations/0082_fmplus_catalog_seed.sql`

- [ ] **Step 1: Extract Items Pricelist sheet**

```bash
node -e "
const ExcelJS = require('exceljs');
(async () => {
  const src = new ExcelJS.Workbook();
  await src.xlsx.readFile('FMPLUS/Emaar Uptown HK Budget.xlsx');
  const sheet = src.getWorksheet('Items Pricelist');
  if (!sheet) throw new Error('Items Pricelist sheet not found');
  const dst = new ExcelJS.Workbook();
  const out = dst.addWorksheet('Items Pricelist');
  sheet.eachRow((row, i) => out.addRow(row.values).commit());
  await dst.xlsx.writeFile('src/lib/fmplus/budget/__fixtures__/emaar-pricelist-seed.xlsx');
})();
"
```

- [ ] **Step 2: Write the failing test**

`src/lib/fmplus/budget/catalog/seed-from-pricelist.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { parsePricelist } from './seed-from-pricelist';

const FIXTURE = path.join(__dirname, '..', '__fixtures__', 'emaar-pricelist-seed.xlsx');

describe('parsePricelist', () => {
  it('extracts ≥80 catalog rows', async () => {
    const rows = await parsePricelist(FIXTURE);
    expect(rows.length).toBeGreaterThanOrEqual(80);
  });

  it('includes manning and tools categories', async () => {
    const rows = await parsePricelist(FIXTURE);
    const cats = new Set(rows.map(r => r.category));
    expect(cats.has('manning')).toBe(true);
    expect(cats.has('tools')).toBe(true);
  });

  it('every row passes Zod', async () => {
    const { FmplusCatalogItemSchema } = await import('../schema');
    const rows = await parsePricelist(FIXTURE);
    for (const r of rows) {
      expect(() => FmplusCatalogItemSchema.parse(r)).not.toThrow();
    }
  });
});
```

- [ ] **Step 3: Implement parser**

`src/lib/fmplus/budget/catalog/seed-from-pricelist.ts`:

```ts
import ExcelJS from 'exceljs';
import { FmplusCatalogItemSchema, type FmplusCatalogItem } from '../schema';

// Column layout from Emaar Uptown HK → Items Pricelist:
// A: Code (or blank, generated from name)
// B: Item name (en) | optionally "(ar)" suffix
// C: Unit
// D: Default price (EGP)
// E: Service (HK / MEP / Both / All)
// F: Category
// G: Tags (comma-separated)
const COL = { code:1, name:2, unit:3, price:4, service:5, category:6, tags:7 };

function normalizeUnit(s: string): FmplusCatalogItem['unit'] {
  const u = s.toLowerCase().trim();
  if (['ea','each','pc','pcs'].includes(u))    return 'each';
  if (['mo','month','monthly','/mo'].includes(u)) return 'monthly';
  if (['yr','annual','/yr'].includes(u))        return 'annual';
  if (['/head','per head','head'].includes(u))  return 'per_head';
  if (['l','liter','ltr'].includes(u))          return 'liter';
  if (['kg'].includes(u))                       return 'kg';
  if (['m2','sqm','m²'].includes(u))            return 'm2';
  if (u.includes('%') || u.includes('rev'))     return 'pct_revenue';
  return 'each';
}

function normalizeServices(s: string): FmplusCatalogItem['service_lines'] {
  const v = s.toLowerCase();
  if (v.includes('all'))      return ['hk','mep','landscape','security','pest_ctrl','waste_mgmt','back_office'];
  const out: FmplusCatalogItem['service_lines'] = [];
  if (v.includes('hk'))       out.push('hk');
  if (v.includes('mep'))      out.push('mep');
  if (v.includes('landsc'))   out.push('landscape');
  if (v.includes('sec'))      out.push('security');
  if (v.includes('pest'))     out.push('pest_ctrl');
  if (v.includes('waste'))    out.push('waste_mgmt');
  if (v.includes('back'))     out.push('back_office');
  return out.length ? out : ['hk'];
}

function deriveCode(nameEn: string): string {
  return nameEn.toLowerCase()
    .replace(/[^a-z0-9 ]/g,'').trim()
    .replace(/\s+/g,'_')
    .slice(0, 40);
}

export async function parsePricelist(filePath: string): Promise<FmplusCatalogItem[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = wb.getWorksheet('Items Pricelist') ?? wb.worksheets[0];
  if (!sheet) throw new Error('No worksheet found');

  const rows: FmplusCatalogItem[] = [];
  let started = false;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const name = String(row.getCell(COL.name).value ?? '').trim();
    const price = Number(row.getCell(COL.price).value);
    if (!name || !Number.isFinite(price)) return;

    started = true;
    const codeRaw = String(row.getCell(COL.code).value ?? '').trim();
    const code = codeRaw || deriveCode(name);
    const unit = normalizeUnit(String(row.getCell(COL.unit).value ?? 'each'));
    const services = normalizeServices(String(row.getCell(COL.service).value ?? 'HK'));
    const category = String(row.getCell(COL.category).value ?? 'tools').toLowerCase().trim() as FmplusCatalogItem['category'];
    const tags = String(row.getCell(COL.tags).value ?? '').split(',').map(s => s.trim()).filter(Boolean);

    // Bilingual: split "name_en | name_ar" if pipe present
    const [name_en, name_ar] = name.includes('|')
      ? name.split('|').map(s => s.trim())
      : [name, undefined];

    const parsed = FmplusCatalogItemSchema.parse({
      code, name_en, name_ar, unit, default_price: price,
      service_lines: services, category, tags,
    });
    rows.push(parsed);
  });
  if (!started) throw new Error('No data rows in Items Pricelist sheet');
  return rows;
}

export function buildSeedSql(rows: FmplusCatalogItem[]): string {
  const values = rows.map(r => `(
    ${JSON.stringify(r.code)},
    ${JSON.stringify(r.name_en)},
    ${r.name_ar ? JSON.stringify(r.name_ar) : 'null'},
    '${r.unit}'::text,
    ${r.default_price},
    array[${r.service_lines.map(s => `'${s}'`).join(',')}]::text[],
    '${r.category}'::text,
    array[${r.tags.map(t => `'${t.replace(/'/g,"''")}'`).join(',')}]::text[]
  )`).join(',\n  ');
  return `insert into public.fmplus_catalog
    (code, name_en, name_ar, unit, default_price, service_lines, category, tags)
  values
  ${values}
  on conflict (code) do update set
    name_en = excluded.name_en,
    name_ar = excluded.name_ar,
    unit = excluded.unit,
    default_price = excluded.default_price,
    service_lines = excluded.service_lines,
    category = excluded.category,
    tags = excluded.tags;`;
}
```

- [ ] **Step 4: Run parser test**

```bash
npm run test -- src/lib/fmplus/budget/catalog/seed-from-pricelist.test.ts
```

Expected: PASS.

- [ ] **Step 5: Generate the seed SQL and write migration 0082**

```bash
node -e "
const path = require('node:path');
const { parsePricelist, buildSeedSql } = require('./src/lib/fmplus/budget/catalog/seed-from-pricelist');
(async () => {
  const rows = await parsePricelist('src/lib/fmplus/budget/__fixtures__/emaar-pricelist-seed.xlsx');
  const sql = buildSeedSql(rows);
  require('node:fs').writeFileSync('supabase/migrations/0082_fmplus_catalog_seed.sql',
    '-- Auto-generated from Items Pricelist sheet\\n' + sql + '\\n');
  console.log('Wrote', rows.length, 'rows');
})();
"
```

(If the script can't be run via require directly because of TS, replace with a one-off `tsx` script: `npx tsx scripts/gen-catalog-seed.ts`. Add a tsx dev-dep if missing.)

- [ ] **Step 6: Apply migration 0082 via Supabase MCP**

`apply_migration` with name `0082_fmplus_catalog_seed` and the generated SQL.

- [ ] **Step 7: Verify**

```sql
select count(*) from public.fmplus_catalog;
select unit, count(*) from public.fmplus_catalog group by unit order by 2 desc;
```

Expected: ≥80 rows.

- [ ] **Step 8: Commit**

```bash
git add src/lib/fmplus/budget/catalog/seed-from-pricelist.ts \
        src/lib/fmplus/budget/catalog/seed-from-pricelist.test.ts \
        src/lib/fmplus/budget/__fixtures__/emaar-pricelist-seed.xlsx \
        supabase/migrations/0082_fmplus_catalog_seed.sql
git commit -m "feat(fmplus-budget): catalog seed parser + 0082 seed migration (~85 items from Emaar Pricelist)"
```

---

## Phase 3 — Catalog tab + admin CRUD (Tasks 13-15)

### Task 13: catalog/search.ts + upsert.ts + overrides.ts

**Files:**
- Create: `src/lib/fmplus/budget/catalog/search.ts`
- Create: `src/lib/fmplus/budget/catalog/upsert.ts`
- Create: `src/lib/fmplus/budget/catalog/overrides.ts`
- Create: `src/lib/fmplus/budget/catalog/search.test.ts`

- [ ] **Step 1: Implement search.ts**

```ts
import { budgetDb, TABLES } from '../db';
import type { ServiceLine, Category } from '../types';
import type { FmplusCatalogItem } from '../schema';

export interface CatalogSearchOpts {
  q?: string;
  service_line?: ServiceLine;
  category?: Category;
  is_active?: boolean;
  limit?: number;
}

export async function searchCatalog(opts: CatalogSearchOpts = {}): Promise<FmplusCatalogItem[]> {
  const sb = budgetDb();
  let q = sb.from(TABLES.catalog).select('*').limit(opts.limit ?? 200);
  if (opts.is_active !== false) q = q.eq('is_active', true);
  if (opts.service_line) q = q.contains('service_lines', [opts.service_line]);
  if (opts.category)     q = q.eq('category', opts.category);
  if (opts.q && opts.q.trim()) {
    const term = opts.q.trim();
    q = q.or(`name_en.ilike.%${term}%,name_ar.ilike.%${term}%,code.ilike.%${term}%,tags.cs.{${term}}`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FmplusCatalogItem[];
}
```

- [ ] **Step 2: Implement upsert.ts**

```ts
import { budgetDb, TABLES } from '../db';
import { FmplusCatalogItemSchema, type FmplusCatalogItem } from '../schema';

export async function upsertCatalogItem(input: unknown): Promise<FmplusCatalogItem> {
  const parsed = FmplusCatalogItemSchema.parse(input);
  const sb = budgetDb();
  const { data, error } = await sb.from(TABLES.catalog)
    .upsert(parsed, { onConflict: 'code' }).select().single();
  if (error) throw error;
  return data as FmplusCatalogItem;
}

export async function archiveCatalogItem(id: number): Promise<void> {
  const sb = budgetDb();
  const { error } = await sb.from(TABLES.catalog).update({ is_active: false }).eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 3: Implement overrides.ts**

```ts
import { budgetDb, TABLES } from '../db';

export async function resolveCatalogPrice(opts: {
  contractId: number; catalogItemId: number;
}): Promise<{ unit_cost: number; source: 'override' | 'default' }> {
  const sb = budgetDb();
  const [override, item] = await Promise.all([
    sb.from(TABLES.overrides)
      .select('unit_cost')
      .eq('contract_id', opts.contractId)
      .eq('catalog_item_id', opts.catalogItemId)
      .maybeSingle(),
    sb.from(TABLES.catalog).select('default_price').eq('id', opts.catalogItemId).single(),
  ]);
  if (override.data?.unit_cost != null) return { unit_cost: Number(override.data.unit_cost), source: 'override' };
  if (item.data) return { unit_cost: Number(item.data.default_price), source: 'default' };
  throw new Error(`Catalog item ${opts.catalogItemId} not found`);
}

export async function listOverridesForContract(contractId: number) {
  const sb = budgetDb();
  const { data, error } = await sb.from(TABLES.overrides).select('*, fmplus_catalog(name_en, default_price, unit)').eq('contract_id', contractId);
  if (error) throw error;
  return data ?? [];
}

export async function listOverridesForItem(catalogItemId: number) {
  const sb = budgetDb();
  const { data, error } = await sb.from(TABLES.overrides).select('*, project_contracts(name)').eq('catalog_item_id', catalogItemId);
  if (error) throw error;
  return data ?? [];
}

export async function upsertOverride(input: {
  contract_id: number; catalog_item_id: number; unit_cost: number; notes?: string | null;
}) {
  const sb = budgetDb();
  const { error } = await sb.from(TABLES.overrides).upsert(input, { onConflict: 'contract_id,catalog_item_id' });
  if (error) throw error;
}

export async function removeOverride(contractId: number, catalogItemId: number) {
  const sb = budgetDb();
  const { error } = await sb.from(TABLES.overrides).delete()
    .eq('contract_id', contractId).eq('catalog_item_id', catalogItemId);
  if (error) throw error;
}
```

- [ ] **Step 4: Write search.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { searchCatalog } from './search';

// Integration test (gated). Run with FMPLUS_BUDGET_INTEGRATION=1
describe.skipIf(!process.env.FMPLUS_BUDGET_INTEGRATION)('searchCatalog (integration)', () => {
  it('returns at least one row', async () => {
    const rows = await searchCatalog({ limit: 5 });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('filters by service_line', async () => {
    const rows = await searchCatalog({ service_line: 'hk', limit: 5 });
    expect(rows.every(r => r.service_lines.includes('hk'))).toBe(true);
  });
});
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/budget/catalog/
git commit -m "feat(fmplus-budget): catalog search + upsert + per-project overrides resolver"
```

---

### Task 14: Catalog page UI (table + override side panel)

**Files:**
- Create: `src/app/fmplus/financial/budget/catalog/page.tsx`
- Create: `src/app/fmplus/financial/budget/catalog/actions.ts`
- Create: `src/app/fmplus/financial/budget/catalog/_components/catalog-table.tsx`
- Create: `src/app/fmplus/financial/budget/catalog/_components/override-side-panel.tsx`

- [ ] **Step 1: Implement actions.ts**

```ts
'use server';
import { upsertCatalogItem, archiveCatalogItem } from '@/lib/fmplus/budget/catalog/upsert';
import { upsertOverride, removeOverride } from '@/lib/fmplus/budget/catalog/overrides';
import { requireBudgetAdmin } from '@/lib/fmplus/budget/permissions';
import { revalidatePath } from 'next/cache';

export async function saveItemAction(input: unknown) {
  await requireBudgetAdmin();
  const out = await upsertCatalogItem(input);
  revalidatePath('/fmplus/financial/budget/catalog');
  return out;
}

export async function archiveItemAction(id: number) {
  await requireBudgetAdmin();
  await archiveCatalogItem(id);
  revalidatePath('/fmplus/financial/budget/catalog');
}

export async function saveOverrideAction(input: {
  contract_id: number; catalog_item_id: number; unit_cost: number; notes?: string | null;
}) {
  await requireBudgetAdmin();
  await upsertOverride(input);
  revalidatePath('/fmplus/financial/budget/catalog');
}

export async function removeOverrideAction(contractId: number, catalogItemId: number) {
  await requireBudgetAdmin();
  await removeOverride(contractId, catalogItemId);
  revalidatePath('/fmplus/financial/budget/catalog');
}
```

- [ ] **Step 2: Implement page.tsx**

Server component. Renders the toolbar, the `<CatalogTable>` with rows from `searchCatalog()`, and the right-side `<OverrideSidePanel>` (initially empty until a row is selected via URL `?selected=<id>`). Mirrors the visual mockup `03-catalog.html` from the brainstorm session.

```tsx
import { searchCatalog } from '@/lib/fmplus/budget/catalog/search';
import { listOverridesForItem } from '@/lib/fmplus/budget/catalog/overrides';
import { budgetDb, TABLES } from '@/lib/fmplus/budget/db';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { CatalogTable } from './_components/catalog-table';
import { OverrideSidePanel } from './_components/override-side-panel';

export const dynamic = 'force-dynamic';

export default async function CatalogPage(props: { searchParams: Promise<{ q?: string; service?: string; category?: string; selected?: string }> }) {
  const sp = await props.searchParams;
  const user = await requireBudgetView();
  const items = await searchCatalog({
    q: sp.q,
    service_line: sp.service as any,
    category: sp.category as any,
    limit: 250,
  });

  let selectedItem = null, otherOverrides: any[] = [], contracts: any[] = [];
  if (sp.selected) {
    const sb = budgetDb();
    const { data: it } = await sb.from(TABLES.catalog).select('*').eq('id', Number(sp.selected)).single();
    selectedItem = it;
    otherOverrides = await listOverridesForItem(Number(sp.selected));
    const { data: cs } = await sb.from(TABLES.contracts).select('id, name').order('name');
    contracts = cs ?? [];
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-0 h-full">
      <CatalogTable items={items} selectedId={sp.selected ? Number(sp.selected) : null} canEdit={user.is_admin} />
      <OverrideSidePanel item={selectedItem} otherOverrides={otherOverrides} contracts={contracts} canEdit={user.is_admin} />
    </div>
  );
}
```

- [ ] **Step 3: Implement catalog-table.tsx**

Client component matching the mockup: search input, service/category/active filters, table with code, bilingual name, unit, default price, services, tags, edit/archive actions. Selected row gets `bg-blue-500/10 ring-1 ring-blue-500`. Clicking a row sets `?selected=<id>` via `router.replace`.

(Full TSX: ~120 lines. See visual mockup `03-catalog.html` for layout. Use Tailwind utility classes; no custom CSS.)

- [ ] **Step 4: Implement override-side-panel.tsx**

Client component: shows selected-item summary, contract picker dropdown, override-price input + delta indicator + notes textarea, Save/Delete buttons. Below: "Other overrides for this item" list. Calls `saveOverrideAction` and `removeOverrideAction`.

(Full TSX: ~140 lines.)

- [ ] **Step 5: Run type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/fmplus/financial/budget/catalog/
git commit -m "feat(fmplus-budget): catalog page — searchable table + per-project override side panel"
```

---

### Task 15: Catalog bulk import (XLSX)

**Files:**
- Create: `src/app/fmplus/financial/budget/catalog/_components/bulk-import-modal.tsx`
- Modify: `src/app/fmplus/financial/budget/catalog/actions.ts` — add `bulkImportAction`

- [ ] **Step 1: Add bulkImportAction**

```ts
export async function bulkImportAction(formData: FormData) {
  await requireBudgetAdmin();
  const file = formData.get('file') as File;
  if (!file) throw new Error('no_file');
  const buf = Buffer.from(await file.arrayBuffer());
  const tmp = `/tmp/catalog-import-${Date.now()}.xlsx`;
  await import('node:fs/promises').then(fs => fs.writeFile(tmp, buf));
  const { parsePricelist } = await import('@/lib/fmplus/budget/catalog/seed-from-pricelist');
  const rows = await parsePricelist(tmp);
  // Diff against current catalog
  const sb = budgetDb();
  const { data: existing } = await sb.from(TABLES.catalog).select('code, default_price, is_active');
  const byCode = new Map(existing?.map(e => [e.code, e]));
  const summary = { added: 0, updated: 0, archived: 0, total: rows.length };
  for (const r of rows) {
    const cur = byCode.get(r.code);
    if (!cur) summary.added++;
    else if (Number(cur.default_price) !== r.default_price) summary.updated++;
  }
  await sb.from(TABLES.catalog).upsert(rows, { onConflict: 'code' });
  // Codes in DB but not in import → archive
  const incomingCodes = new Set(rows.map(r => r.code));
  const toArchive = (existing ?? []).filter(e => e.is_active && !incomingCodes.has(e.code));
  if (toArchive.length) {
    await sb.from(TABLES.catalog).update({ is_active: false }).in('code', toArchive.map(t => t.code));
    summary.archived = toArchive.length;
  }
  revalidatePath('/fmplus/financial/budget/catalog');
  return summary;
}
```

- [ ] **Step 2: Implement bulk-import-modal.tsx**

Client modal: file input, "Preview" button (calls `bulkImportAction` and shows `summary` returned), Confirm/Cancel.

- [ ] **Step 3: Commit**

```bash
git add src/app/fmplus/financial/budget/catalog/
git commit -m "feat(fmplus-budget): catalog bulk import (XLSX) with diff summary"
```

---

## Phase 4 — Project Hub + new-contract wizard (Tasks 16-19)

### Task 16: portfolio.ts — buildPortfolio aggregator

**Files:**
- Create: `src/lib/fmplus/budget/portfolio.ts`
- Create: `src/lib/fmplus/budget/portfolio.test.ts`

- [ ] **Step 1: Implement portfolio.ts**

```ts
import { budgetDb, TABLES } from './db';
import type { ServiceLine } from './types';

export interface PortfolioCard {
  contract_id: number;
  project_id: number;
  project_name: string;
  customer: string | null;
  year_tracking: 'contract' | 'fiscal';
  duration_months: number;
  contract_value: number;
  current_year_index: number;
  total_years: number;
  current_year_label: string;
  service_lines: ServiceLine[];
  has_back_office: boolean;
  gm_pct: number | null;          // current year
  yoy_revenue_change: number | null; // null when only Y1
  mob_total: number;
  mob_roi_pct: number | null;
  health: 'green' | 'amber' | 'red';
  status: 'draft' | 'published';
}

export async function buildPortfolio(filter?: {
  service_line?: ServiceLine;
  q?: string;
}): Promise<PortfolioCard[]> {
  const sb = budgetDb();
  // Pull contracts + nested years + services in one round trip
  let q = sb.from(TABLES.contracts).select(`
    id, project_id, name, customer, year_tracking, duration_months, contract_value,
    project_services ( service_line ),
    project_years ( id, year_index, fiscal_year, scenario, status, project_year_services ( service_line, monthly_revenue ) ),
    mobilization_lines ( total_cost )
  `);
  if (filter?.q) q = q.ilike('name', `%${filter.q}%`);
  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).flatMap((c: any): PortfolioCard | [] => {
    const services: ServiceLine[] = (c.project_services ?? []).map((s: any) => s.service_line);
    if (filter?.service_line && !services.includes(filter.service_line)) return [];
    const years = (c.project_years ?? []).filter((y: any) => y.scenario === 'initial');
    const sortedYears = years.sort((a: any, b: any) => a.year_index - b.year_index);
    const currentYear = sortedYears[sortedYears.length - 1] ?? null;
    const prevYear = sortedYears[sortedYears.length - 2] ?? null;
    const currentRevenue = (currentYear?.project_year_services ?? []).reduce((a: number, s: any) => a + Number(s.monthly_revenue) * 12, 0);
    const prevRevenue = (prevYear?.project_year_services ?? []).reduce((a: number, s: any) => a + Number(s.monthly_revenue) * 12, 0);
    const yoy = (prevYear && prevRevenue > 0) ? (currentRevenue - prevRevenue) / prevRevenue : null;
    const mobTotal = (c.mobilization_lines ?? []).reduce((a: number, m: any) => a + Number(m.total_cost), 0);
    const cv = Number(c.contract_value);
    const mobRoi = cv > 0 ? mobTotal / cv : null;
    return {
      contract_id: c.id,
      project_id: c.project_id,
      project_name: c.name,
      customer: c.customer,
      year_tracking: c.year_tracking,
      duration_months: c.duration_months,
      contract_value: cv,
      current_year_index: currentYear?.year_index ?? 0,
      total_years: Math.max(...sortedYears.map((y: any) => y.year_index), 0),
      current_year_label: currentYear ? (c.year_tracking === 'fiscal' ? `FY ${currentYear.fiscal_year}` : `Y${currentYear.year_index} of ${Math.max(...sortedYears.map((y: any) => y.year_index))}`) : '—',
      service_lines: services,
      has_back_office: services.includes('back_office'),
      gm_pct: null, // computed by variance.ts later
      yoy_revenue_change: yoy,
      mob_total: mobTotal,
      mob_roi_pct: mobRoi,
      health: 'green', // overridden after variance pull
      status: currentYear?.status ?? 'draft',
    } as PortfolioCard;
  });
}
```

- [ ] **Step 2: Test (integration-gated)**

```ts
import { describe, it, expect } from 'vitest';
import { buildPortfolio } from './portfolio';

describe.skipIf(!process.env.FMPLUS_BUDGET_INTEGRATION)('buildPortfolio (integration)', () => {
  it('returns array', async () => {
    const cards = await buildPortfolio();
    expect(Array.isArray(cards)).toBe(true);
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/fmplus/budget/portfolio.ts src/lib/fmplus/budget/portfolio.test.ts
git commit -m "feat(fmplus-budget): portfolio aggregator (contract cards for Project Hub)"
```

---

### Task 17: Project Hub page

**Files:**
- Create: `src/app/fmplus/financial/budget/projects/page.tsx`
- Create: `src/app/fmplus/financial/budget/projects/_components/contract-card.tsx`

- [ ] **Step 1: Implement page.tsx**

Server component: calls `buildPortfolio()`, renders the toolbar (search, service filter, EN/ع, "+ New Contract" CTA), and a `<div className="grid grid-cols-1 md:grid-cols-2 gap-4">` of `<ContractCard>`s. Below: "Action needed" banner that lists contracts with Odoo actuals but no published years (or year status mismatches).

(Reference visual mockup `01-project-hub.html`. ~80 lines.)

- [ ] **Step 2: Implement contract-card.tsx**

Pure server component. Header row (project name + customer + year-tracking badge + health dot), service-line chips (back_office in muted style), 3-KPI grid (year, contract, GM%), footer (sparkline placeholder + Mob ROI badge + YoY indicator). Clickable → `/fmplus/financial/budget/edit?contract=<id>&year=<currentYearIndex>`.

(Reference mockup. ~70 lines.)

- [ ] **Step 3: Commit**

```bash
git add src/app/fmplus/financial/budget/projects/
git commit -m "feat(fmplus-budget): Project Hub — contract-card grid (matches mockup 01)"
```

---

### Task 18: + New Contract wizard

**Files:**
- Create: `src/app/fmplus/financial/budget/projects/_components/new-contract-wizard.tsx`
- Create: `src/lib/fmplus/budget/contracts/create.ts`
- Create: `src/app/fmplus/financial/budget/projects/actions.ts`

- [ ] **Step 1: Implement contracts/create.ts**

```ts
import { budgetDb, TABLES } from '../db';
import { ProjectContractSchema, ProjectServiceSchema, ProjectYearSchema } from '../schema';
import type { ServiceLine } from '../types';

export async function createContract(input: {
  contract: unknown;
  service_lines: ServiceLine[];
  initial_year_start_month?: number;
}) {
  const c = ProjectContractSchema.parse(input.contract);
  const sb = budgetDb();
  const { data: cRow, error: cErr } = await sb.from(TABLES.contracts).insert(c).select().single();
  if (cErr) throw cErr;
  const services = input.service_lines.map(sl => ({
    contract_id: cRow.id, service_line: sl, template_version: 1,
  }));
  const { error: sErr } = await sb.from(TABLES.services).insert(services);
  if (sErr) throw sErr;
  // Auto-create Y1 draft
  const { data: yRow, error: yErr } = await sb.from(TABLES.years).insert({
    contract_id: cRow.id,
    year_index: 1,
    fiscal_year: c.year_tracking === 'fiscal' ? new Date(c.start_date).getFullYear() : null,
    start_month: input.initial_year_start_month ?? new Date(c.start_date).getMonth() + 1,
    scenario: 'initial',
    status: 'draft',
  }).select().single();
  if (yErr) throw yErr;
  // Auto-create year-service rows
  await sb.from(TABLES.year_services).insert(
    input.service_lines.map(sl => ({ year_id: yRow.id, service_line: sl, monthly_revenue: 0 }))
  );
  return { contract: cRow, year: yRow };
}
```

- [ ] **Step 2: Implement actions.ts**

```ts
'use server';
import { createContract } from '@/lib/fmplus/budget/contracts/create';
import { requireBudgetAdmin } from '@/lib/fmplus/budget/permissions';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createContractAction(input: any) {
  await requireBudgetAdmin();
  const { contract, year } = await createContract(input);
  revalidatePath('/fmplus/financial/budget/projects');
  redirect(`/fmplus/financial/budget/edit?contract=${contract.id}&year=${year.year_index}`);
}
```

- [ ] **Step 3: Implement new-contract-wizard.tsx**

5-step wizard modal/drawer. Steps:
1. Pick Odoo analytic account (combobox from `odoo_analytic_accounts` filtered by FMPLUS plans)
2. Customer + dates + contract value + VAT + year_tracking choice (radio: contract / fiscal)
3. Zones (jsonb editor — comma-separated tags)
4. Pick service lines (checkboxes for the 7)
5. Review + Submit → calls `createContractAction`

(~200 lines TSX. Use react-hook-form pattern from existing project. Clear back/next navigation.)

- [ ] **Step 4: Commit**

```bash
git add src/app/fmplus/financial/budget/projects/ src/lib/fmplus/budget/contracts/create.ts
git commit -m "feat(fmplus-budget): new-contract wizard (5 steps) + auto-creates Y1 draft"
```

---

### Task 19: Layout + 8-tab strip

**Files:**
- Modify: `src/app/fmplus/financial/budget/layout.tsx` — rewrite for v2 8 tabs

- [ ] **Step 1: Update layout**

```tsx
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import Link from 'next/link';
import { BilingualToggle } from './_components/bilingual-toggle';

export default async function BudgetLayout({ children }: { children: React.ReactNode }) {
  const user = await requireBudgetView();
  return (
    <div>
      <header className="border-b border-border bg-bg-tertiary px-6 py-3 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">FM+ Project Budget</h1>
          <div className="text-xs text-text-secondary">v2 · multi-year · multi-service</div>
        </div>
        <BilingualToggle />
      </header>
      <nav className="border-b border-border bg-bg-secondary px-6 flex gap-1 overflow-x-auto">
        {[
          ['Overview', '/fmplus/financial/budget'],
          ['Project Hub', '/fmplus/financial/budget/projects'],
          ['Editor', '/fmplus/financial/budget/edit'],
          ['Catalog', '/fmplus/financial/budget/catalog'],
          ['Import', '/fmplus/financial/budget/import'],
          ['Variance', '/fmplus/financial/budget/variance'],
          ['Compare', '/fmplus/financial/budget/compare'],
          ['Settings', '/fmplus/financial/budget/settings'],
        ].map(([label, href]) => (
          <Link key={href} href={href}
            className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-t-md whitespace-nowrap">
            {label}
          </Link>
        ))}
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Add bilingual toggle component**

`src/app/fmplus/financial/budget/_components/bilingual-toggle.tsx` — client component, reads/writes `localStorage.fmplus_budget_lang` ('en'|'ar'), wraps body with `dir="rtl"` when 'ar'. Re-renders pages on toggle (or set as a server action that updates a cookie).

- [ ] **Step 3: Commit**

```bash
git add src/app/fmplus/financial/budget/layout.tsx src/app/fmplus/financial/budget/_components/
git commit -m "feat(fmplus-budget): rewrite layout for 8-tab v2 + bilingual toggle"
```

---

## Phase 5 — Editor (Tasks 20-27)

### Task 20: Editor page scaffold + year/service tab strips

**Files:**
- Create: `src/app/fmplus/financial/budget/edit/page.tsx`
- Create: `src/app/fmplus/financial/budget/edit/_components/year-tabs.tsx`
- Create: `src/app/fmplus/financial/budget/edit/_components/service-tabs.tsx`

- [ ] **Step 1: Implement page.tsx**

Server component. Reads `?contract=<id>&year=<index>&service=<sl>` query params, loads contract + years + services + budget_lines for the selected (year, service), renders:
- Page header (title, status, save/publish buttons)
- `<YearTabs>` strip (years + Add year + Copy year button)
- `<ServiceTabs>` strip (active service + Revenue + Mobilization tabs)
- KPI summary strip (Y1 service revenue/cost/GM%/HC/lines)
- `<SectionAccordion>` per category in the active service template

(Reference mockup `02-editor.html`. ~150 lines.)

- [ ] **Step 2: Implement year-tabs.tsx**

Client component. Renders Y1, Y2, ... + "Add year" + "Copy Y1 → Y2" button. Active year = bold. Click → `router.push` with new `?year=<index>`.

- [ ] **Step 3: Implement service-tabs.tsx**

Client component. Renders pills for each `project_services` row + Revenue + Mobilization tabs. Active = filled.

- [ ] **Step 4: Commit**

```bash
git add src/app/fmplus/financial/budget/edit/
git commit -m "feat(fmplus-budget): Editor scaffold + year tabs + service tabs"
```

---

### Task 21: Section accordion + budget-line rows

**Files:**
- Create: `src/app/fmplus/financial/budget/edit/_components/section-accordion.tsx`
- Create: `src/app/fmplus/financial/budget/edit/_components/budget-line-row.tsx`

- [ ] **Step 1: Implement section-accordion.tsx**

Client component. Accepts a category template + the budget_lines for that (year, service, category) and renders:
- Header row: ▼/▶ toggle + label_en/ar + line count + summed monthly cost + "+ Add line" CTA
- When expanded: `<table>` with line rows
- Governmental category gets the special amber-bordered "NEW in v2" treatment (shown until user dismisses via Settings flag)

- [ ] **Step 2: Implement budget-line-row.tsx**

Client component. Renders one `<tr>` with: role label (en/ar inline if bilingual=ar), qty input, unit_cost input, monthly_cost calculated, threshold cell, expand/edit icons. Inputs debounce-write to a `<form>` with hidden state; outer Save Draft action persists.

- [ ] **Step 3: Commit**

```bash
git add src/app/fmplus/financial/budget/edit/_components/
git commit -m "feat(fmplus-budget): section accordion + budget-line row component"
```

---

### Task 22: + Add line catalog picker modal

**Files:**
- Create: `src/app/fmplus/financial/budget/edit/_components/add-line-picker.tsx`

- [ ] **Step 1: Implement add-line-picker.tsx**

Client modal triggered by `<SectionAccordion>`'s "+ Add line" button. Has two tabs: **Catalog picker** and **Free-text line**.

- Catalog tab: search input + 3 filter chips (service preset to current, category preset to current, tag any), table of `searchCatalog()` results (server action). Click row → adds a `budget_line` with `catalog_item_id`, `line_code = item.code`, `label_en/ar`, `unit_cost = resolveCatalogPrice()` result.
- Free-text tab: line_code input, label_en, label_ar, unit_cost, qty defaults. Click Add → adds a `budget_line` with `catalog_item_id = null`.

After Add, the modal closes and the `<SectionAccordion>` re-renders with the new row.

(Reference mockup `02-editor.html` — the dashed-bordered catalog picker preview shown inline.)

- [ ] **Step 2: Commit**

```bash
git add src/app/fmplus/financial/budget/edit/_components/add-line-picker.tsx
git commit -m "feat(fmplus-budget): add-line picker modal (catalog + free-text)"
```

---

### Task 23: CTC expand panel for manning lines

**Files:**
- Create: `src/app/fmplus/financial/budget/edit/_components/ctc-expand.tsx`
- Modify: `src/app/fmplus/financial/budget/edit/_components/budget-line-row.tsx` — wire expand toggle

- [ ] **Step 1: Implement ctc-expand.tsx**

Client component. Renders inside the expand row. Layout: 6-column grid of CTC component inputs (Net / Relievers / OT / Training / Insurance / Medical) + a per-line variance threshold override row. Auto-sums to set the parent row's `unit_cost`.

```tsx
'use client';
import { useState, useEffect } from 'react';

export function CtcExpand(props: {
  initial: { ctc_net?: number | null; ctc_relievers?: number | null; ctc_ot?: number | null; ctc_training?: number | null; ctc_insurance?: number | null; ctc_medical?: number | null; threshold_green?: number | null; threshold_amber?: number | null; };
  onChange: (next: { unit_cost: number; ctc: typeof props.initial; thresholds: { green: number | null; amber: number | null } }) => void;
}) {
  const [ctc, setCtc] = useState({
    ctc_net: props.initial.ctc_net ?? 0,
    ctc_relievers: props.initial.ctc_relievers ?? 0,
    ctc_ot: props.initial.ctc_ot ?? 0,
    ctc_training: props.initial.ctc_training ?? 0,
    ctc_insurance: props.initial.ctc_insurance ?? 0,
    ctc_medical: props.initial.ctc_medical ?? 0,
  });
  const [green, setGreen] = useState(props.initial.threshold_green ?? null);
  const [amber, setAmber] = useState(props.initial.threshold_amber ?? null);
  const sum = Object.values(ctc).reduce((a, b) => a + Number(b || 0), 0);
  useEffect(() => {
    props.onChange({ unit_cost: sum, ctc, thresholds: { green, amber } });
  }, [sum, ctc, green, amber, props]);

  return (
    <div className="bg-blue-500/5 p-3 border-l-2 border-blue-500">
      <div className="text-[10px] text-text-secondary uppercase mb-2">CTC breakdown (sums to {sum.toLocaleString()} EGP/mo)</div>
      <div className="grid grid-cols-6 gap-2">
        {(['ctc_net','ctc_relievers','ctc_ot','ctc_training','ctc_insurance','ctc_medical'] as const).map(k => (
          <div key={k}>
            <div className="text-[10px] text-text-secondary uppercase">{k.replace('ctc_','')}</div>
            <input type="number" className="w-full px-1 py-1 text-right text-xs bg-bg-secondary border border-border rounded"
              value={ctc[k]} onChange={e => setCtc(c => ({ ...c, [k]: Number(e.target.value) }))} />
          </div>
        ))}
      </div>
      <div className="text-[11px] text-text-secondary mt-2">
        Per-line variance threshold (override): green ≤ <input type="number" className="w-12 px-1 text-right" value={green ?? ''} onChange={e => setGreen(e.target.value === '' ? null : Number(e.target.value))} />% ·
        amber ≤ <input type="number" className="w-12 px-1 text-right" value={amber ?? ''} onChange={e => setAmber(e.target.value === '' ? null : Number(e.target.value))} />%
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into budget-line-row.tsx**

Add an expand-toggle column. When expanded AND category is `manning`, render `<CtcExpand>` inside a colspan-full row below.

- [ ] **Step 3: Commit**

```bash
git add src/app/fmplus/financial/budget/edit/_components/
git commit -m "feat(fmplus-budget): CTC expand panel (Net+Relievers+OT+Training+Insurance+Medical) + per-line threshold override"
```

---

### Task 24: Save Draft / Publish actions

**Files:**
- Create: `src/app/fmplus/financial/budget/edit/actions.ts`

- [ ] **Step 1: Implement actions.ts**

```ts
'use server';
import { budgetDb, TABLES } from '@/lib/fmplus/budget/db';
import { BudgetLineSchema } from '@/lib/fmplus/budget/schema';
import { requireBudgetAdmin } from '@/lib/fmplus/budget/permissions';
import { writeAuditOnPublishedEdit } from '@/lib/fmplus/budget/audit';
import { revalidatePath } from 'next/cache';

export async function saveDraftAction(input: {
  year_id: number;
  service_line: string;
  lines: unknown[];
}) {
  await requireBudgetAdmin();
  const sb = budgetDb();
  // Replace lines for this (year_id, service_line)
  await sb.from(TABLES.lines).delete().eq('year_id', input.year_id).eq('service_line', input.service_line);
  const parsed = input.lines.map(l => BudgetLineSchema.parse(l));
  await sb.from(TABLES.lines).insert(parsed);
  revalidatePath('/fmplus/financial/budget/edit');
}

export async function publishYearAction(yearId: number) {
  const user = await requireBudgetAdmin();
  const sb = budgetDb();
  const { data: cur } = await sb.from(TABLES.years).select('status').eq('id', yearId).single();
  await sb.from(TABLES.years).update({
    status: 'published',
    published_at: new Date().toISOString(),
    published_by: user.id,
  }).eq('id', yearId);
  if (cur?.status === 'published') {
    await writeAuditOnPublishedEdit(yearId, { trigger: 'republish_after_edit', by: user.id });
  }
  revalidatePath('/fmplus/financial/budget/edit');
}

export async function deleteYearAction(yearId: number) {
  await requireBudgetAdmin();
  const sb = budgetDb();
  await sb.from(TABLES.years).delete().eq('id', yearId);
  revalidatePath('/fmplus/financial/budget/edit');
}

export async function addYearAction(input: { contract_id: number; copy_from_year_id?: number }) {
  await requireBudgetAdmin();
  // If copy_from_year_id set, defer to copyYearAction (Task 27)
  // else: create blank Y(N+1)
  const sb = budgetDb();
  const { data: years } = await sb.from(TABLES.years).select('year_index, fiscal_year').eq('contract_id', input.contract_id).order('year_index', { ascending: false });
  const nextIndex = (years?.[0]?.year_index ?? 0) + 1;
  const { data: contract } = await sb.from(TABLES.contracts).select('year_tracking').eq('id', input.contract_id).single();
  const { data: y } = await sb.from(TABLES.years).insert({
    contract_id: input.contract_id,
    year_index: nextIndex,
    fiscal_year: contract?.year_tracking === 'fiscal' ? (years?.[0]?.fiscal_year ? years[0].fiscal_year + 1 : new Date().getFullYear() + 1) : null,
    start_month: 1, scenario: 'initial', status: 'draft',
  }).select().single();
  revalidatePath('/fmplus/financial/budget/edit');
  return y;
}
```

- [ ] **Step 2: Implement audit.ts**

```ts
import { budgetDb, TABLES } from './db';

export async function writeAuditOnPublishedEdit(yearId: number, diff: any) {
  const sb = budgetDb();
  await sb.from(TABLES.audit).insert({ year_id: yearId, diff_json: diff });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/fmplus/financial/budget/edit/actions.ts src/lib/fmplus/budget/audit.ts
git commit -m "feat(fmplus-budget): editor server actions (save draft / publish / add year / delete year)"
```

---

### Task 25: Revenue tab + Mobilization tab

**Files:**
- Create: `src/app/fmplus/financial/budget/edit/_components/revenue-tab.tsx`
- Create: `src/app/fmplus/financial/budget/edit/_components/mobilization-tab.tsx`
- Modify: `src/app/fmplus/financial/budget/edit/actions.ts` — add `saveRevenueAction`, `saveMobilizationAction`

- [ ] **Step 1: Implement revenue-tab.tsx**

Client component. Edits `project_year_services` rows for the active year. One row per service line: `monthly_revenue` input + `vat_pct` input + `manpower_ramp` JSON editor (collapsed by default). Save → `saveRevenueAction`.

- [ ] **Step 2: Implement mobilization-tab.tsx**

Client component. Edits `mobilization_lines` for the active **contract** (not year — mobilization is contract-level). Renders rows with: category select (capex/opex_one_time/training/recruitment), label_en, label_ar, qty, unit_cost, total auto-computed, amortization (straight_line / flat), amortization_months. "+ Add line" button.

- [ ] **Step 3: Implement actions**

```ts
export async function saveRevenueAction(input: { year_id: number; rows: unknown[] }) {
  await requireBudgetAdmin();
  const sb = budgetDb();
  await sb.from(TABLES.year_services).delete().eq('year_id', input.year_id);
  await sb.from(TABLES.year_services).insert(input.rows);
  revalidatePath('/fmplus/financial/budget/edit');
}

export async function saveMobilizationAction(input: { contract_id: number; rows: unknown[] }) {
  await requireBudgetAdmin();
  const sb = budgetDb();
  await sb.from(TABLES.mob).delete().eq('contract_id', input.contract_id);
  await sb.from(TABLES.mob).insert(input.rows);
  revalidatePath('/fmplus/financial/budget/edit');
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/fmplus/financial/budget/edit/
git commit -m "feat(fmplus-budget): Revenue tab + Mobilization tab in Editor"
```

---

### Task 26: inflation-calc.ts (pure math)

**Files:**
- Create: `src/lib/fmplus/budget/inflation-calc.ts`
- Create: `src/lib/fmplus/budget/inflation-calc.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { applyInflation, projectYear, classifyLine } from './inflation-calc';

describe('inflation-calc', () => {
  it('applies uniform manpower inflation to a manning line', () => {
    const line = { line_code: 'hk_mf_8h', service_line: 'hk' as const, category: 'manning' as const, qty: 120, unit_cost: 12840 };
    const out = applyInflation(line, { revenue: 7, manpower: 10, other: 5 }, {});
    expect(out.unit_cost).toBeCloseTo(12840 * 1.1, 2);
  });

  it('applies non-manpower inflation to a tools line', () => {
    const line = { line_code: 'tool_broom_soft', service_line: 'hk' as const, category: 'tools' as const, qty: 10, unit_cost: 85 };
    const out = applyInflation(line, { revenue: 7, manpower: 10, other: 5 }, {});
    expect(out.unit_cost).toBeCloseTo(85 * 1.05, 2);
  });

  it('per-line override wins over uniform', () => {
    const line = { line_code: 'veh_microbus', service_line: 'hk' as const, category: 'transport' as const, qty: 2, unit_cost: 28400 };
    const out = applyInflation(line, { revenue: 7, manpower: 10, other: 5 }, { veh_microbus: 15 });
    expect(out.unit_cost).toBeCloseTo(28400 * 1.15, 2);
  });

  it('% of revenue items track revenue inflation', () => {
    expect(classifyLine({ line_code: 'gov_taminat', category: 'governmental', service_line: 'hk' })).toBe('revenue_pct');
  });

  it('projectYear sums all line projections', () => {
    const lines = [
      { line_code: 'a', service_line: 'hk' as const, category: 'manning' as const, qty: 1, unit_cost: 1000 },
      { line_code: 'b', service_line: 'hk' as const, category: 'tools' as const, qty: 10, unit_cost: 100 },
    ];
    const out = projectYear(lines, { revenue: 0, manpower: 10, other: 5 }, {}, 0);
    expect(out.totalCost).toBeCloseTo(1000 * 1.1 + 1000 * 1.05, 2);
  });
});
```

- [ ] **Step 2: Implement inflation-calc.ts**

```ts
import type { Category, ServiceLine } from './types';

export type InflationKnobs = { revenue: number; manpower: number; other: number };
export type LineKind = 'manpower' | 'other' | 'revenue_pct';

interface LineLike {
  line_code: string;
  service_line: ServiceLine;
  category: Category;
  qty: number;
  unit_cost: number;
}

export function classifyLine(l: { line_code: string; category: Category; service_line: ServiceLine }): LineKind {
  if (l.category === 'manning') return 'manpower';
  // % of revenue items: anything starting with 'gov_taminat' OR explicitly tagged
  if (l.category === 'governmental' && l.line_code.includes('taminat')) return 'revenue_pct';
  return 'other';
}

export function applyInflation(
  line: LineLike,
  knobs: InflationKnobs,
  perLineOverridePct: Record<string, number>,
): LineLike {
  const kind = classifyLine(line);
  const override = perLineOverridePct[line.line_code];
  let pct: number;
  if (override !== undefined) pct = override;
  else if (kind === 'manpower')    pct = knobs.manpower;
  else if (kind === 'revenue_pct') pct = knobs.revenue;
  else                             pct = knobs.other;
  return { ...line, unit_cost: round2(line.unit_cost * (1 + pct / 100)) };
}

export function projectYear(
  lines: LineLike[],
  knobs: InflationKnobs,
  perLineOverridePct: Record<string, number>,
  currentRevenue: number,
): { lines: LineLike[]; totalCost: number; projectedRevenue: number } {
  const projected = lines.map(l => applyInflation(l, knobs, perLineOverridePct));
  const totalCost = projected.reduce((a, l) => a + l.qty * l.unit_cost, 0);
  const projectedRevenue = round2(currentRevenue * (1 + knobs.revenue / 100));
  return { lines: projected, totalCost: round2(totalCost), projectedRevenue };
}

function round2(n: number) { return Math.round(n * 100) / 100; }
```

- [ ] **Step 3: Run tests**

```bash
npm run test -- src/lib/fmplus/budget/inflation-calc.test.ts
```

Expected: PASS — 5 cases.

- [ ] **Step 4: Commit**

```bash
git add src/lib/fmplus/budget/inflation-calc.ts src/lib/fmplus/budget/inflation-calc.test.ts
git commit -m "feat(fmplus-budget): inflation calc (uniform knobs + per-line override + revenue-pct items)"
```

---

### Task 27: Copy Y1 → Y2 dialog + duplicate.ts

**Files:**
- Create: `src/lib/fmplus/budget/contracts/duplicate.ts`
- Create: `src/lib/fmplus/budget/contracts/duplicate.test.ts`
- Create: `src/app/fmplus/financial/budget/edit/_components/copy-year-dialog.tsx`
- Modify: `src/app/fmplus/financial/budget/edit/actions.ts` — add `copyYearAction`

- [ ] **Step 1: Implement duplicate.ts**

```ts
import { budgetDb, TABLES } from '../db';
import { applyInflation, type InflationKnobs } from '../inflation-calc';

export async function copyYear(opts: {
  source_year_id: number;
  target_year_index: number;
  knobs: InflationKnobs;
  per_line_override_pct: Record<string, number>;
  reasons?: Record<string, string>;
}) {
  const sb = budgetDb();
  const { data: srcYear } = await sb.from(TABLES.years).select('*').eq('id', opts.source_year_id).single();
  if (!srcYear) throw new Error('source_year_not_found');
  // Make sure target year doesn't exist yet
  const { data: existing } = await sb.from(TABLES.years).select('id').eq('contract_id', srcYear.contract_id).eq('year_index', opts.target_year_index).eq('scenario', 'initial').maybeSingle();
  if (existing) throw new Error('target_year_exists');

  // Create target year
  const { data: tgtYear, error: tErr } = await sb.from(TABLES.years).insert({
    contract_id: srcYear.contract_id,
    year_index: opts.target_year_index,
    fiscal_year: srcYear.fiscal_year ? srcYear.fiscal_year + 1 : null,
    start_month: srcYear.start_month,
    scenario: 'initial', status: 'draft',
  }).select().single();
  if (tErr) throw tErr;

  // Copy year_services with revenue inflation
  const { data: srcRev } = await sb.from(TABLES.year_services).select('*').eq('year_id', opts.source_year_id);
  if (srcRev?.length) {
    await sb.from(TABLES.year_services).insert(srcRev.map((r: any) => ({
      year_id: tgtYear.id,
      service_line: r.service_line,
      monthly_revenue: r.monthly_revenue * (1 + opts.knobs.revenue / 100),
      vat_pct: r.vat_pct,
      manpower_ramp: r.manpower_ramp,
    })));
  }

  // Copy budget_lines with category-aware inflation
  const { data: srcLines } = await sb.from(TABLES.lines).select('*').eq('year_id', opts.source_year_id);
  if (srcLines?.length) {
    const projected = srcLines.map((l: any) => {
      const inflated = applyInflation(
        { line_code: l.line_code, service_line: l.service_line, category: l.category, qty: l.qty, unit_cost: l.unit_cost },
        opts.knobs,
        opts.per_line_override_pct,
      );
      return {
        year_id: tgtYear.id,
        service_line: l.service_line,
        category: l.category,
        line_code: l.line_code,
        catalog_item_id: l.catalog_item_id,
        label_en: l.label_en,
        label_ar: l.label_ar,
        season: l.season,
        qty: l.qty,
        unit_cost: inflated.unit_cost,
        ctc_net: l.ctc_net, ctc_relievers: l.ctc_relievers, ctc_ot: l.ctc_ot,
        ctc_training: l.ctc_training, ctc_insurance: l.ctc_insurance, ctc_medical: l.ctc_medical,
        threshold_green: l.threshold_green, threshold_amber: l.threshold_amber,
        notes: l.notes,
      };
    });
    await sb.from(TABLES.lines).insert(projected);
  }

  // Audit log for the copy itself
  await sb.from(TABLES.audit).insert({
    year_id: tgtYear.id,
    diff_json: {
      action: 'copy_year',
      source_year_id: opts.source_year_id,
      knobs: opts.knobs,
      per_line_overrides: opts.per_line_override_pct,
      reasons: opts.reasons ?? {},
    },
  });

  return tgtYear;
}
```

- [ ] **Step 2: Add test (integration-gated)**

```ts
import { describe, it, expect } from 'vitest';
import { copyYear } from './duplicate';

describe.skipIf(!process.env.FMPLUS_BUDGET_INTEGRATION)('copyYear (integration)', () => {
  it('rejects when target year already exists', async () => {
    // Pre-seeded fixture — see scripts/seed-test-contract.ts
    await expect(copyYear({
      source_year_id: 999, target_year_index: 1,
      knobs: { revenue: 0, manpower: 0, other: 0 }, per_line_override_pct: {},
    })).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Implement copyYearAction**

```ts
export async function copyYearAction(input: any) {
  await requireBudgetAdmin();
  const { copyYear } = await import('@/lib/fmplus/budget/contracts/duplicate');
  const out = await copyYear(input);
  revalidatePath('/fmplus/financial/budget/edit');
  return out;
}
```

- [ ] **Step 4: Implement copy-year-dialog.tsx**

Client modal matching mockup `04-inflation-copy.html`. Layout:

- Header: source/target row with live projection
- 3 inflation knob cards (Revenue / Manpower CTC / Non-manpower) with numeric input + range slider + computed projection
- "▼ Tweak per line" expand panel with table of all source lines, per-line `% override` input + reason textarea, special % of revenue items shown with "auto" tag and disabled override
- Footer: audit-log reminder + Cancel + dynamic-label commit button

The dialog uses `inflation-calc.ts` to compute the live projection client-side (no round-trip per slider tick). On Commit, calls `copyYearAction`.

(~280 lines TSX. Reference mockup 04 closely.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/budget/contracts/duplicate.ts src/lib/fmplus/budget/contracts/duplicate.test.ts src/app/fmplus/financial/budget/edit/_components/copy-year-dialog.tsx src/app/fmplus/financial/budget/edit/actions.ts
git commit -m "feat(fmplus-budget): Copy Y1 → Y2 dialog + duplicate logic (3 knobs + per-line tweaks + audit log)"
```

---

## Phase 6 — Excel parsers + Import (Tasks 28-33)

### Task 28: parsers/auto-detect.ts (dispatcher)

**Files:**
- Create: `src/lib/fmplus/budget/parsers/auto-detect.ts`
- Create: `src/lib/fmplus/budget/parsers/auto-detect.test.ts`

- [ ] **Step 1: Implement auto-detect.ts**

```ts
import ExcelJS from 'exceljs';

export type ParserId =
  | 'rich-auc-style' | 'trio-style' | 'city-gate-multi-year'
  | 'emaar-zone-style' | 'flat-template' | 'unknown';

export async function detectParser(filePath: string): Promise<{ parser: ParserId; reason: string; sheetNames: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const names = wb.worksheets.map(s => s.name);
  const lower = names.map(n => n.toLowerCase());

  // City Gate: Y1/Y2 sheets + FM Fees Summary
  if (lower.some(n => n.startsWith('y1 -')) && lower.some(n => n.startsWith('y2 -')) && lower.some(n => n.includes('fm fees'))) {
    return { parser: 'city-gate-multi-year', reason: 'multiple Y1/Y2 sheets + FM Fees Summary', sheetNames: names };
  }
  // Emaar zone: Items Pricelist + zone column header
  if (lower.includes('items pricelist')) {
    const sheet = wb.worksheets.find(s => s.name.toLowerCase() === 'items pricelist')!;
    const hasZoneHeader = sheet?.getRow(1).values?.toString().toLowerCase().includes('zone');
    if (hasZoneHeader) return { parser: 'emaar-zone-style', reason: 'Items Pricelist + Zone header', sheetNames: names };
  }
  // TRIO: Back Office + BOQ Summary
  if (lower.includes('back office') || lower.includes('boq summary')) {
    return { parser: 'trio-style', reason: 'TRIO multi-service layout', sheetNames: names };
  }
  // AUC: per-category detail sheets
  if (lower.some(n => n.includes('total manning')) && lower.some(n => n.includes('total consumables'))) {
    return { parser: 'rich-auc-style', reason: 'per-category detail sheets', sheetNames: names };
  }
  // Flat template: project / service_line / category headers in row 1 of first sheet
  const firstRow = wb.worksheets[0].getRow(1).values;
  const headers = (Array.isArray(firstRow) ? firstRow.map(v => String(v ?? '').toLowerCase()) : []);
  if (headers.includes('project') && headers.includes('service_line') && headers.includes('line_code')) {
    return { parser: 'flat-template', reason: 'flat template column headers detected', sheetNames: names };
  }
  return { parser: 'unknown', reason: `no parser matched`, sheetNames: names };
}
```

- [ ] **Step 2: Test against all 4 fixtures**

```ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { detectParser } from './auto-detect';

const FIX = (name: string) => path.join(__dirname, '..', '__fixtures__', name);

describe('detectParser', () => {
  it('AUC sheet → rich-auc-style', async () => {
    expect((await detectParser(FIX('auc-budget.xlsx'))).parser).toBe('rich-auc-style');
  });
  it('TRIO sheet → trio-style', async () => {
    expect((await detectParser(FIX('trio-budget.xlsx'))).parser).toBe('trio-style');
  });
  it('City Gate sheet → city-gate-multi-year', async () => {
    expect((await detectParser(FIX('city-gate-budget.xlsx'))).parser).toBe('city-gate-multi-year');
  });
  it('Emaar Uptown sheet → emaar-zone-style', async () => {
    expect((await detectParser(FIX('emaar-uptown-budget.xlsx'))).parser).toBe('emaar-zone-style');
  });
});
```

- [ ] **Step 3: Copy fixture files**

```bash
cp 'FMPLUS/AUC Budget.xlsx'              src/lib/fmplus/budget/__fixtures__/auc-budget.xlsx
cp 'FMPLUS/TRIO Budget .xlsx'            src/lib/fmplus/budget/__fixtures__/trio-budget.xlsx
cp 'FMPLUS/City Gate Budget.xlsx'        src/lib/fmplus/budget/__fixtures__/city-gate-budget.xlsx
cp 'FMPLUS/Emaar Uptown HK Budget.xlsx'  src/lib/fmplus/budget/__fixtures__/emaar-uptown-budget.xlsx
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- src/lib/fmplus/budget/parsers/auto-detect.test.ts
```

Expected: PASS — 4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/budget/parsers/auto-detect.ts src/lib/fmplus/budget/parsers/auto-detect.test.ts src/lib/fmplus/budget/__fixtures__/
git commit -m "feat(fmplus-budget): parser auto-detect dispatcher (5 paths)"
```

---

### Task 29: parsers/rich-auc-style.ts

**Files:**
- Create: `src/lib/fmplus/budget/parsers/rich-auc-style.ts`
- Create: `src/lib/fmplus/budget/parsers/rich-auc-style.test.ts`

Port the v1 plan's Task 10 parser to v2 schema. Differences:
- Output a `ParsedBudget` shape (contract metadata + 1 year + lines + zero mob)
- `service_line: 'hk'` hardcoded (AUC is HK-only)
- `season` per row from sheet column
- Validate parsed totals against the workbook's Grand Total sheet within 0.5%

```ts
export interface ParsedBudget {
  contract: {
    project_name: string;
    customer: string | null;
    start_date: string;
    end_date: string;
    contract_value: number;
    vat_pct: number;
    year_tracking: 'contract' | 'fiscal';
    zones: any[];
  };
  services: ('hk'|'mep'|'landscape'|'security'|'pest_ctrl'|'waste_mgmt'|'back_office')[];
  years: Array<{
    year_index: number;
    fiscal_year: number | null;
    start_month: number;
    services: Array<{ service_line: string; monthly_revenue: number; vat_pct: number; manpower_ramp: any }>;
    lines: Array<Omit<import('../schema').BudgetLine, 'id' | 'year_id'>>;
  }>;
  mobilization: Array<Omit<import('../schema').MobilizationLine, 'id' | 'contract_id'>>;
  warnings: string[];
}

export async function parseAucStyle(filePath: string): Promise<ParsedBudget> { /* ... */ }
```

(Full implementation: ~280 lines, follows v1 Task 10 with shape adjustment. Tests: ~80 lines, asserts < 0.5% drift on category subtotals.)

- [ ] Commit: `feat(fmplus-budget): rich AUC-style parser (v2 schema)`

---

### Task 30: parsers/trio-style.ts

**Files:**
- Create: `src/lib/fmplus/budget/parsers/trio-style.ts`
- Create: `src/lib/fmplus/budget/parsers/trio-style.test.ts`

TRIO has separate sheets per service (HK / Landscape / Pest / Waste / Back Office), each with its own line list. BOQ Summary aggregates. Strategy:

1. Iterate each service sheet matching `[A-Z]+ Service` pattern
2. Extract line rows (col layout: line label / qty / unit / monthly cost)
3. Map service name → `service_line` enum
4. Aggregate to `ParsedBudget` with multiple `services` and one year
5. Validate against BOQ Summary's totals within 0.5%

(~250 lines. Test: assert all 4 services present + drift check.)

- [ ] Commit: `feat(fmplus-budget): TRIO-style parser (multi-service single-year)`

---

### Task 31: parsers/city-gate-multi-year.ts

**Files:**
- Create: `src/lib/fmplus/budget/parsers/city-gate-multi-year.ts`
- Create: `src/lib/fmplus/budget/parsers/city-gate-multi-year.test.ts`

City Gate has Y1 and Y2 sheets per service (e.g. `Y1 - HK`, `Y2 - HK`, `Y1 - MEP`, `Y2 - MEP`...) plus a separate Mobilization sheet and FM Fees Summary.

1. Group sheets by service line: `Y1 - <S>` and `Y2 - <S>`
2. Parse each as a `year` block with the service's line rows
3. Parse the Mobilization sheet → `mobilization` array
4. Parse the FM Fees Summary → contract-level revenue per year
5. Output a `ParsedBudget` with 2 years, multiple services, mobilization

(~300 lines. Test: 2 years detected, mobilization items > 0, drift < 0.5%.)

- [ ] Commit: `feat(fmplus-budget): City Gate multi-year parser (2 years × N services + mobilization)`

---

### Task 32: parsers/emaar-zone-style.ts

**Files:**
- Create: `src/lib/fmplus/budget/parsers/emaar-zone-style.ts`
- Create: `src/lib/fmplus/budget/parsers/emaar-zone-style.test.ts`

Emaar Uptown has zone columns (Zone A, Zone B). Per spec § 4 Q5, zones collapse to project totals in v2.

1. Parse manning sheet — sum Zone A + Zone B columns into `qty`
2. Capture richer CTC breakdown columns (Net + Relievers + OT + Training + Insurance + Medical) into `ctc_*` fields
3. Output a `ParsedBudget` with 1 year, 1 service (HK), zone reference stored in `contract.zones jsonb`

(~250 lines. Test: ctc_* columns populated, zones array length === 2, drift < 0.5%.)

- [ ] Commit: `feat(fmplus-budget): Emaar zone-style parser (zone collapse + richer CTC)`

---

### Task 33: parsers/flat-template.ts (v2)

**Files:**
- Create: `src/lib/fmplus/budget/parsers/flat-template.ts`
- Create: `src/lib/fmplus/budget/parsers/flat-template.test.ts`
- Create: `src/lib/fmplus/budget/parsers/flat-template-export.ts`
- Modify: `src/app/api/fmplus/budget/flat-template-download/route.ts` — generate v2 template

V2 flat template adds: `year_index`, `contract_name`, `customer`. Header row:

```
contract_name | customer | year_index | service_line | category | line_code | label_en | label_ar | season | qty | unit_cost | ctc_net | ctc_relievers | ctc_ot | ctc_training | ctc_insurance | ctc_medical | threshold_green | threshold_amber | notes
```

Parser: iterates rows, validates each via `BudgetLineSchema`, groups by (contract_name, year_index), produces `ParsedBudget`. Old v1 flat headers (without `year_index`) → fail with "v1 flat template no longer supported, re-export from Editor."

Export: from Editor's current state, generate XLSX matching the above header.

(Parser: ~150 lines. Export: ~80 lines. Test: round-trip — write fixture from a parsed budget, re-parse, expect equality.)

- [ ] Commit: `feat(fmplus-budget): v2 flat template parser + writer (round-trip-tested)`

---

## Phase 7 — Variance v2 + Mobilization + Settings (Tasks 34-37)

### Task 34: mobilization.ts — amortization

**Files:**
- Create: `src/lib/fmplus/budget/mobilization.ts`
- Create: `src/lib/fmplus/budget/mobilization.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { amortizeMobilization, type MobLineLite } from './mobilization';

describe('amortizeMobilization', () => {
  it('straight-line spreads cost equally', () => {
    const lines: MobLineLite[] = [{ category: 'capex', total_cost: 240_000, amortization: 'straight_line', amortization_months: 24 }];
    const map = amortizeMobilization(lines, '2026-01-01', '2027-12-31');
    expect(map.size).toBe(24);
    expect([...map.values()][0]).toBeCloseTo(10_000, 2);
  });

  it('flat puts entire cost in month 1', () => {
    const lines: MobLineLite[] = [{ category: 'opex_one_time', total_cost: 50_000, amortization: 'flat', amortization_months: 12 }];
    const map = amortizeMobilization(lines, '2026-01-01', '2026-12-31');
    expect(map.get('2026-01')).toBe(50_000);
    expect(map.get('2026-02') ?? 0).toBe(0);
  });

  it('truncates at contract end_date', () => {
    const lines: MobLineLite[] = [{ category: 'capex', total_cost: 240_000, amortization: 'straight_line', amortization_months: 24 }];
    const map = amortizeMobilization(lines, '2026-01-01', '2026-06-30');
    expect(map.size).toBe(6);
    expect([...map.values()][0]).toBeCloseTo(10_000, 2);
  });
});
```

- [ ] **Step 2: Implement mobilization.ts**

```ts
export interface MobLineLite {
  category: string;
  total_cost: number;
  amortization: 'straight_line' | 'flat';
  amortization_months: number;
}

export function amortizeMobilization(
  lines: MobLineLite[],
  contractStart: string,
  contractEnd: string,
): Map<string, number> {
  const map = new Map<string, number>();
  const start = new Date(contractStart);
  const end = new Date(contractEnd);
  for (const line of lines) {
    if (line.amortization === 'flat') {
      const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, (map.get(key) ?? 0) + line.total_cost);
      continue;
    }
    const monthly = line.total_cost / line.amortization_months;
    const cursor = new Date(start);
    for (let i = 0; i < line.amortization_months; i++) {
      if (cursor > end) break;
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, (map.get(key) ?? 0) + monthly);
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return map;
}
```

- [ ] **Step 3: Run tests**

```bash
npm run test -- src/lib/fmplus/budget/mobilization.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/fmplus/budget/mobilization.ts src/lib/fmplus/budget/mobilization.test.ts
git commit -m "feat(fmplus-budget): mobilization amortization (straight_line + flat) with end_date truncation"
```

---

### Task 35: variance.ts v2

**Files:**
- Create: `src/lib/fmplus/budget/variance.ts`
- Create: `src/lib/fmplus/budget/variance.test.ts`
- Create: `src/lib/fmplus/budget/variance-drill.ts` — port from v1

Build on v1 Task 6 (`buildBudgetVariance`). Differences for v2:

1. Signature is `buildBudgetVarianceV2({ contractId, yearIndex, scenario?, serviceLine?, ... })`
2. Loads from v2 schema (project_years → budget_lines)
3. Calls `amortizeMobilization()` and adds the result into the budget side per (year, month, category)
4. Honors per-line `threshold_green`/`threshold_amber` overrides in `colorVariance()`
5. Supports bilingual labels (returns both label_en + label_ar)

```ts
export async function buildBudgetVarianceV2(opts: {
  contractId: number;
  yearIndex: number;
  scenario?: 'initial' | 'revised' | 'reforecast';
  serviceLine?: ServiceLine;
  month?: number;
  ytdThrough?: number;
  bilingual?: 'en' | 'ar';
}): Promise<BudgetVarianceReportV2>;
```

(Main file ~400 lines. Reference v1 plan Task 6 line-by-line for the join pattern; the only material change is line 4 above. Tests cover: phased start, multi-year rollup, mobilization amortization, asymmetric thresholds, per-line override.)

- [ ] Commit: `feat(fmplus-budget): variance v2 (multi-year, multi-service, mobilization, per-line override, bilingual)`

---

### Task 36: Variance page + drill drawer

**Files:**
- Create: `src/app/fmplus/financial/budget/variance/page.tsx`
- Create: `src/app/fmplus/financial/budget/variance/_components/variance-grid.tsx`
- Create: `src/app/fmplus/financial/budget/variance/_components/drill-drawer.tsx`
- Create: `src/app/fmplus/financial/budget/variance/actions.ts`

Mirrors v1 plan Task 16-17 with v2 query params (`?contract=&year=`). Cell tooltip shows "of which X EGP is mobilization amortization" when mob is non-zero. Bilingual flow: page reads cookie/localStorage, passes `bilingual` to `buildBudgetVarianceV2`.

- [ ] Commit: `feat(fmplus-budget): Variance page + drill drawer (v2 schema, mob amortization shown)`

---

### Task 37: Settings page v2

**Files:**
- Create: `src/app/fmplus/financial/budget/settings/page.tsx`
- Create: `src/app/fmplus/financial/budget/settings/actions.ts`

Reads `budget_settings` row 1, exposes:
- Variance thresholds (green_pct + amber_pct)
- Default scenario
- **NEW**: 3 default inflation knobs (revenue / manpower / non-manpower)
- **NEW**: default mobilization amortization months
- **NEW**: bilingual default toggle (en/ar)
- Service-line template list with status (`active` for all 7 in v2)
- Account-mapping editor per service line (regex patterns) — same as v1
- Unmapped-accounts panel — surfaces Odoo P&L accounts not in any `account_map_json`

Admin-gated.

- [ ] Commit: `feat(fmplus-budget): Settings page v2 (thresholds + 3 inflation defaults + mob amort + bilingual)`

---

## Phase 8 — Compare YoY + Exports + Acceptance (Tasks 38-40)

### Task 38: Compare tab + Year-vs-Year mode

**Files:**
- Create: `src/app/fmplus/financial/budget/compare/page.tsx`
- Create: `src/app/fmplus/financial/budget/compare/_components/compare-grid.tsx`
- Create: `src/app/fmplus/financial/budget/compare/_components/yoy-mode-toggle.tsx`

Two modes:
1. **Cross-project** (default): rows = projects of selected service_line, cols = template categories, cells = variance %, sortable
2. **Year-vs-Year**: pick a contract → rows = categories, cols = Y1/Y2/Y3 — only available when contract has ≥2 years

Toggle pivots view client-side; both modes call `buildBudgetVarianceV2` server-side.

- [ ] Commit: `feat(fmplus-budget): Compare tab v2 (cross-project + Year-vs-Year mode)`

---

### Task 39: Variance exports v2 (PDF + XLSX)

**Files:**
- Modify: `src/lib/fmplus/budget/exports/variance-pdf.tsx` — port from v1, swap to v2 input shape
- Modify: `src/lib/fmplus/budget/exports/variance-xlsx.ts` — same
- Modify: `src/app/api/fmplus/budget/variance-xlsx/route.ts` — accept `?contract=&year=` instead of `?project=&year=&scenario=`
- Modify: `src/app/api/fmplus/budget/variance-pdf/route.ts` — same
- Add a "Mobilization Amortization" line under Total Cost on both exports

Reference v1 plan Tasks 24-25 directly. Only the input shape changes.

- [ ] Commit: `feat(fmplus-budget): variance exports v2 (PDF + XLSX with mob row)`

---

### Task 40: End-to-end acceptance walk-through

**Files:**
- Create: `scripts/v2-acceptance.md` (checklist)

Manually run all spec § 16 acceptance criteria:

- [ ] Migration `0081` applied; 10 v2 tables present; 7 v1 tables dropped; HK template resolvable.
- [ ] `/fmplus/financial/budget/projects` empty state on fresh DB; "+ New Contract" wizard creates a contract end-to-end; card appears.
- [ ] Import `AUC Budget.xlsx` → published Y1 — totals within 0.5%.
- [ ] Import `City Gate Budget.xlsx` → 2 years published.
- [ ] Import `TRIO Budget .xlsx` → all services in Y1.
- [ ] Import `Emaar Uptown HK Budget.xlsx` → zones collapsed, CTC populated.
- [ ] Editor `?contract=&year=1` renders year + service tabs + add-line picker fed from catalog.
- [ ] Copy Y1 → Y2 dialog: 3 knobs apply correctly; per-line overrides work; commits to audit.
- [ ] `/catalog` lists seeded items; admin edit works; non-admin read-only.
- [ ] Variance grid renders mob amortization in cell tooltip.
- [ ] Per-line threshold override wins over global.
- [ ] Bilingual toggle flips labels en↔ar.
- [ ] Compare YoY toggle pivots correctly.
- [ ] Settings edit persists.
- [ ] All 6+ parser tests + variance + mob + duplicate + inflation tests pass.
- [ ] Type-check clean.
- [ ] No regressions on FMPLUS Financials page.

If anything fails, file a follow-up task. Otherwise:

- [ ] Commit (docs only): `docs(fmplus-budget): v2 acceptance walk-through complete`

---

## Self-review notes

**Spec coverage** (§ → Task):
- § 5 Architecture (8 tabs, lib structure) → Tasks 19, 20+
- § 6 Data model (10 tables) → Task 1
- § 6.1 Templates → Tasks 4-11
- § 6.2 Catalog seed → Task 12
- § 7 Excel ingest (5 parsers) → Tasks 28-33
- § 8 Variance v2 → Tasks 34-36
- § 9.1 Project Hub → Tasks 16-18
- § 9.2 Editor → Tasks 19-27
- § 9.3 Catalog tab → Tasks 13-15
- § 9.4 Variance/Compare/Settings → Tasks 36-39
- § 10 Edge cases → covered in tasks where they apply (Editor, Variance, Catalog)
- § 11 Phasing → Tasks 1-40 = v2.0; v2.1 deferred
- § 12 Permissions → Task 3 (`requireBudgetAdmin`) reused throughout
- § 13 FM+ shell interface → unchanged from v1 (Task 19 layout)
- § 14 Risks/mitigations → tests + parser fixtures
- § 15 Open questions → noted; non-blocking
- § 16 Acceptance → Task 40
- § 17 Improvement suggestions absorbed → CTC (Task 23), per-service margins (variance + portfolio), contract-level revenue (Task 25), YoY (Task 38), mob ROI (Task 16), bilingual (Task 19), per-line threshold (Tasks 23, 35), CTC inflation calc (Task 26+27), Year-vs-Year (Task 38)
- § 18 Migration plan → Phase 1-8

**Placeholder scan**: All steps have either code or specific instructions. Tasks 5–10 reference Task 4 pattern — the executing agent reads Task 4 and applies the data deltas listed in each.

**Type consistency**: Function signatures (`getTemplate`, `searchCatalog`, `resolveCatalogPrice`, `buildPortfolio`, `applyInflation`, `copyYear`, `amortizeMobilization`, `buildBudgetVarianceV2`, `parseAucStyle`, etc.) are consistent across plan tasks. Schema enums (`ServiceLine`, `Category`, `CatalogUnit`) are defined once in Task 2 and re-used.

**Estimated total commits**: ~40 (Tasks 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40 = 40 commits, with templates 5–10 each separate). Within the 30–40 estimate.
