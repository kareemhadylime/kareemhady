# FM+ Project Budget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `/fmplus/financial/budget` Project Budget feature end-to-end for Housekeeping (HK) projects: input, Excel ingest (rich AUC + flat), variance vs Odoo actuals, multi-project comparison, and admin settings. 5 other service lines stub-selectable.

**Architecture:** New normalized data model in Supabase (7 tables, migration `0080`). Templates code-defined per service line, version-locked into segments on publish. Variance computed at request time by joining `budget_lines` with existing `odoo_move_line_analytics` via per-category regex on `odoo_accounts.code`. UI built as 6 sub-tabs under `/fmplus/financial/budget` mirroring the Beithady financials patterns (`force-dynamic` server components, server actions for mutations).

**Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript strict, Tailwind v4, Supabase Postgres + JS service-role client, Zod, Vitest (colocated `*.test.ts`), `exceljs` (already installed) for XLSX parse/write, `@react-pdf/renderer` (already installed) for PDF export, server actions for mutations. Per CLAUDE.md, every commit auto-deploys via `git push origin <branch>:main` (Vercel GitHub integration).

**Spec:** [docs/superpowers/specs/2026-05-03-fmplus-project-budget-design.md](../specs/2026-05-03-fmplus-project-budget-design.md)

**Branch:** `claude/quizzical-hoover-5cfcca` (worktree). Push pattern: `git push origin claude/quizzical-hoover-5cfcca:main`.

---

## File structure

**New files (28):**

Library (`src/lib/fmplus/budget/`):
- `schema.ts` — Zod schemas for all 7 tables + template JSON shape
- `types.ts` — TypeScript types re-exported from Zod
- `templates/hk.ts` — HK template (canonical, derived from AUC sheet)
- `templates/mep.ts` — stub
- `templates/landscape.ts` — stub
- `templates/security.ts` — stub
- `templates/pest-ctrl.ts` — stub
- `templates/waste-mgmt.ts` — stub
- `templates/index.ts` — `getTemplate(serviceLine, version)` helper + service-line catalog
- `variance.ts` — `buildBudgetVariance()` main read API
- `variance-drill.ts` — `cellToMoveLines()` for side drawer
- `parsers/flat-template.ts` — parse Path B XLSX → normalized rows
- `parsers/flat-template-export.ts` — write Editor state to flat XLSX
- `parsers/rich-auc-style.ts` — parse Path A AUC-style XLSX
- `commit.ts` — atomic budget write transaction
- `audit.ts` — `writeAuditOnPublishedEdit()` helper
- `permissions.ts` — `requireBudgetAdmin()` server action gate
- `variance.test.ts`, `parsers/flat-template.test.ts`, `parsers/rich-auc-style.test.ts`, `commit.test.ts` — Vitest

Routes (`src/app/fmplus/financial/budget/`):
- `layout.tsx` — section header + sub-tab strip + permission shell
- `page.tsx` — Overview
- `_components/anomaly-banner.tsx`
- `_components/health-dot.tsx`
- `_components/period-control.tsx`
- `edit/page.tsx` — Editor
- `edit/actions.ts` — server actions (save draft, publish, delete)
- `edit/_components/editor-form.tsx`
- `edit/_components/category-block.tsx`
- `import/page.tsx` — Import
- `import/actions.ts` — server actions (preview, commit)
- `import/_components/import-uploader.tsx`
- `import/_components/preview-grid.tsx`
- `variance/page.tsx` — Variance
- `variance/_components/variance-grid.tsx`
- `variance/_components/drill-drawer.tsx`
- `variance/actions.ts` — drill loader, export PDF/XLSX
- `compare/page.tsx` — Compare
- `compare/_components/compare-grid.tsx`
- `settings/page.tsx` — Settings
- `settings/actions.ts` — update thresholds, edit account_map_json

Migration (`supabase/migrations/`):
- `0080_fmplus_project_budget.sql` — DDL + HK + 5 stub seed inserts

PDF/XLSX export libs (`src/lib/fmplus/budget/exports/`):
- `variance-pdf.tsx` — `<react-pdf>` document
- `variance-xlsx.ts` — exceljs writer

Sample test fixtures: copies of `FMPLUS/AUC Budget.xlsx` and `FMPLUS/Emaar Uptown HK Budget.xlsx` placed at `src/lib/fmplus/budget/__fixtures__/auc-budget.xlsx` and `emaar-uptown-budget.xlsx`.

**Modified files (1):**
- `package.json` — no changes expected (exceljs, @react-pdf/renderer, zod already installed; verify before Task 1)

---

## Phase 1 — Foundation (Tasks 1-3)

### Task 1: Migration 0080 — schema + HK template seed

**Files:**
- Create: `supabase/migrations/0080_fmplus_project_budget.sql`

- [ ] **Step 1: Write migration SQL**

Create `supabase/migrations/0080_fmplus_project_budget.sql`:

```sql
-- Phase: FM+ Project Budget v1
-- Adds 7 tables for FMPLUS project-budget vs Odoo-actuals variance.
-- See docs/superpowers/specs/2026-05-03-fmplus-project-budget-design.md
-- Service lines: hk | mep | landscape | security | pest_ctrl | waste_mgmt
-- Scenarios:     initial | revised | reforecast
-- Statuses:      draft | published
-- Seasons:       high | low

create table public.budget_templates (
  id              bigserial primary key,
  service_line    text not null check (service_line in
                    ('hk','mep','landscape','security','pest_ctrl','waste_mgmt')),
  version         int  not null,
  is_stub         boolean not null default false,
  schema_json     jsonb not null,
  account_map_json jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  unique (service_line, version)
);

create table public.project_budgets (
  id              bigserial primary key,
  project_id      bigint not null references public.odoo_analytic_accounts(id),
  fiscal_year     int  not null,
  scenario        text not null check (scenario in ('initial','revised','reforecast')),
  status          text not null default 'draft' check (status in ('draft','published')),
  start_month     int  not null default 1   check (start_month between 1 and 12),
  notes           text,
  created_by      uuid,
  published_at    timestamptz,
  published_by    uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, fiscal_year, scenario)
);
create index on public.project_budgets (fiscal_year, scenario);
create index on public.project_budgets (project_id);

create table public.project_budget_segments (
  id              bigserial primary key,
  budget_id       bigint not null references public.project_budgets(id) on delete cascade,
  service_line    text not null check (service_line in
                    ('hk','mep','landscape','security','pest_ctrl','waste_mgmt')),
  template_version int not null,
  unique (budget_id, service_line)
);

create table public.budget_lines (
  id              bigserial primary key,
  segment_id      bigint not null references public.project_budget_segments(id) on delete cascade,
  sub_location    text,
  category        text not null,
  line_code       text not null,
  season          text not null check (season in ('high','low')),
  qty             numeric(12,4) not null default 0,
  unit_cost       numeric(14,2) not null default 0,
  monthly_cost    numeric(14,2) generated always as (qty * unit_cost) stored,
  notes           text,
  created_at      timestamptz not null default now()
);
create index on public.budget_lines (segment_id, category);
create index on public.budget_lines (segment_id, sub_location, season);

create table public.budget_revenue_lines (
  id              bigserial primary key,
  segment_id      bigint not null references public.project_budget_segments(id) on delete cascade,
  sub_location    text,
  season          text not null check (season in ('high','low')),
  monthly_revenue numeric(14,2) not null default 0,
  vat_pct         numeric(5,2) not null default 14
);

create table public.budget_audit (
  id              bigserial primary key,
  budget_id       bigint not null references public.project_budgets(id) on delete cascade,
  changed_at      timestamptz not null default now(),
  changed_by      uuid,
  diff_json       jsonb not null
);

create table public.budget_settings (
  id              int primary key default 1,
  green_pct       numeric(5,2) not null default 5,
  amber_pct       numeric(5,2) not null default 15,
  default_scenario text not null default 'initial',
  updated_at      timestamptz not null default now()
);
insert into public.budget_settings (id) values (1) on conflict do nothing;

-- Seed HK template v1 (full) + 5 stub templates
insert into public.budget_templates (service_line, version, is_stub, schema_json, account_map_json) values
('hk', 1, false,
 '{
   "sub_locations_enabled": true,
   "default_sub_locations": ["NC Inner Campus","Outer Campus","NC Off-Campus Housing","Maadi Buildings"],
   "season_months": {"high":[9,10,11,12,1,2,3,4],"low":[5,6,7,8]},
   "vat_pct": 14,
   "categories": [
     {"code":"manning","label":"Manning","calc":"qty_x_unitcost","lines":[
       {"code":"hk_manager","label":"HK Manager"},
       {"code":"asst_manager","label":"Assistant Manager"},
       {"code":"sr_supervisor","label":"Senior Supervisor"},
       {"code":"sup_8h","label":"Supervisor 8H"},
       {"code":"hk_mf_8h","label":"HK Male & Female 8H"},
       {"code":"facades_sup","label":"Facades Supervisor 8H"},
       {"code":"facades_lab","label":"Facades Labor 8H"},
       {"code":"waste_sup","label":"Waste Supervisor 8H"},
       {"code":"waste_lab","label":"Waste Labor 8H"},
       {"code":"admin","label":"Admin"},
       {"code":"storekeeper","label":"Storekeeper"},
       {"code":"driver","label":"Driver"},
       {"code":"trainer","label":"Trainer"},
       {"code":"sup_8h_r","label":"Supervisor 8H R"},
       {"code":"hk_f_8h_r","label":"HK Female 8H R"}
     ]},
     {"code":"ppe","label":"Uniform & PPE","calc":"total_headcount_x_unitcost","lines":[
       {"code":"uniform_ppe","label":"Uniform & PPE"}
     ]},
     {"code":"tools","label":"Tools & Consumables","calc":"qty_x_unitcost_div_depreciation","lines":[
       {"code":"machinery","label":"Machinery"},
       {"code":"tools","label":"Tools"},
       {"code":"consumables","label":"Consumables"}
     ]},
     {"code":"transport","label":"Transportation & Vehicles","calc":"qty_x_unitcost","lines":[
       {"code":"bus","label":"Bus"},
       {"code":"microbus","label":"Microbus"},
       {"code":"sedan","label":"Sedan Car"},
       {"code":"minivan","label":"Minivan"},
       {"code":"pickup","label":"Pickup Car"},
       {"code":"fuel","label":"Fuel"}
     ]},
     {"code":"it","label":"IT & Communication","calc":"qty_x_unitcost","lines":[
       {"code":"ict_per_head","label":"Laptop / Mobile / Printer / SIM (per head)"}
     ]},
     {"code":"overhead","label":"Mobilization & Overhead","calc":"flat","lines":[
       {"code":"mob_overhead","label":"Mobilization & Overhead"}
     ]}
   ]
 }'::jsonb,
 '[
   {"category":"manning","code_patterns":["^5000(0[1-9]|1[0-4])$"]},
   {"category":"ppe","code_patterns":["^500011$"]},
   {"category":"tools","code_patterns":["^5002(0[1-9]|1[0-9])$"]},
   {"category":"consumables","code_patterns":["^5001(0[1-9]|1[0-9])$"]},
   {"category":"transport","code_patterns":["^5005[0-9]{2}$"]},
   {"category":"it","code_patterns":["^5003(0[1-9]|1[0-9])$"]},
   {"category":"overhead","code_patterns":["^5004(0[1-9]|1[0-9])$"]}
 ]'::jsonb),
('mep', 1, true,
 '{"sub_locations_enabled":false,"default_sub_locations":[],"season_months":{"high":[9,10,11,12,1,2,3,4],"low":[5,6,7,8]},"vat_pct":14,"categories":[]}'::jsonb,
 '[]'::jsonb),
('landscape', 1, true,
 '{"sub_locations_enabled":false,"default_sub_locations":[],"season_months":{"high":[9,10,11,12,1,2,3,4],"low":[5,6,7,8]},"vat_pct":14,"categories":[]}'::jsonb,
 '[]'::jsonb),
('security', 1, true,
 '{"sub_locations_enabled":false,"default_sub_locations":[],"season_months":{"high":[9,10,11,12,1,2,3,4],"low":[5,6,7,8]},"vat_pct":14,"categories":[]}'::jsonb,
 '[]'::jsonb),
('pest_ctrl', 1, true,
 '{"sub_locations_enabled":false,"default_sub_locations":[],"season_months":{"high":[9,10,11,12,1,2,3,4],"low":[5,6,7,8]},"vat_pct":14,"categories":[]}'::jsonb,
 '[]'::jsonb),
('waste_mgmt', 1, true,
 '{"sub_locations_enabled":false,"default_sub_locations":[],"season_months":{"high":[9,10,11,12,1,2,3,4],"low":[5,6,7,8]},"vat_pct":14,"categories":[]}'::jsonb,
 '[]'::jsonb);
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__apply_migration` against project `bpjproljatbrbmszwbov` with `name=0080_fmplus_project_budget` and the SQL from Step 1. Confirm response has no error.

- [ ] **Step 3: Verify all 7 tables + 6 template rows exist**

Run via Supabase MCP `execute_sql`:

```sql
select table_name from information_schema.tables
where table_schema='public'
  and table_name in ('budget_templates','project_budgets','project_budget_segments',
                     'budget_lines','budget_revenue_lines','budget_audit','budget_settings')
order by table_name;
select service_line, version, is_stub from public.budget_templates order by service_line;
```

Expected: 7 rows from first query, 6 rows from second (`hk` is_stub=false, others is_stub=true).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0080_fmplus_project_budget.sql
git commit -m "feat(fmplus): migration 0080 — project budget tables + HK template seed"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 2: Zod schemas + types

**Files:**
- Create: `src/lib/fmplus/budget/schema.ts`
- Create: `src/lib/fmplus/budget/types.ts`
- Create: `src/lib/fmplus/budget/schema.test.ts`

- [ ] **Step 1: Write the failing schema test**

Create `src/lib/fmplus/budget/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  ServiceLineSchema,
  ScenarioSchema,
  StatusSchema,
  SeasonSchema,
  TemplateSchemaJson,
  AccountMapEntry,
  BudgetLineRow,
} from './schema';

describe('budget schemas', () => {
  it('accepts the 6 service lines', () => {
    for (const sl of ['hk','mep','landscape','security','pest_ctrl','waste_mgmt'] as const) {
      expect(ServiceLineSchema.parse(sl)).toBe(sl);
    }
    expect(() => ServiceLineSchema.parse('hr')).toThrow();
  });

  it('parses HK template schema_json shape', () => {
    const raw = {
      sub_locations_enabled: true,
      default_sub_locations: ['NC Inner Campus'],
      season_months: { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] },
      vat_pct: 14,
      categories: [
        { code: 'manning', label: 'Manning', calc: 'qty_x_unitcost',
          lines: [{ code: 'hk_manager', label: 'HK Manager' }] },
      ],
    };
    expect(TemplateSchemaJson.parse(raw)).toEqual(raw);
  });

  it('rejects an unknown calc rule', () => {
    expect(() => TemplateSchemaJson.parse({
      sub_locations_enabled: false, default_sub_locations: [],
      season_months: { high: [], low: [] }, vat_pct: 14,
      categories: [{ code: 'x', label: 'X', calc: 'magic', lines: [] }],
    })).toThrow();
  });

  it('parses an account-map entry with regex patterns', () => {
    expect(AccountMapEntry.parse({
      category: 'manning', code_patterns: ['^5000(0[1-9]|1[0-4])$'],
    })).toEqual({ category: 'manning', code_patterns: ['^5000(0[1-9]|1[0-4])$'] });
  });

  it('parses a budget_lines row', () => {
    expect(BudgetLineRow.parse({
      id: 1, segment_id: 1, sub_location: 'NC Inner Campus',
      category: 'manning', line_code: 'hk_manager', season: 'high',
      qty: 0.75, unit_cost: 32500, monthly_cost: 24375, notes: null,
      created_at: '2026-05-03T00:00:00Z',
    })).toMatchObject({ qty: 0.75, monthly_cost: 24375 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/fmplus/budget/schema.test.ts`
Expected: FAIL — module `./schema` not found.

- [ ] **Step 3: Write the schema module**

Create `src/lib/fmplus/budget/schema.ts`:

```typescript
import { z } from 'zod';

export const ServiceLineSchema = z.enum(['hk','mep','landscape','security','pest_ctrl','waste_mgmt']);
export type ServiceLine = z.infer<typeof ServiceLineSchema>;

export const ScenarioSchema = z.enum(['initial','revised','reforecast']);
export type Scenario = z.infer<typeof ScenarioSchema>;

export const StatusSchema = z.enum(['draft','published']);
export type BudgetStatus = z.infer<typeof StatusSchema>;

export const SeasonSchema = z.enum(['high','low']);
export type Season = z.infer<typeof SeasonSchema>;

export const CalcRuleSchema = z.enum([
  'qty_x_unitcost',
  'total_headcount_x_unitcost',
  'qty_x_unitcost_div_depreciation',
  'flat',
]);
export type CalcRule = z.infer<typeof CalcRuleSchema>;

export const TemplateLineSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
});

export const TemplateCategorySchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  calc: CalcRuleSchema,
  lines: z.array(TemplateLineSchema),
});

export const SeasonMonths = z.object({
  high: z.array(z.number().int().min(1).max(12)),
  low: z.array(z.number().int().min(1).max(12)),
});

export const TemplateSchemaJson = z.object({
  sub_locations_enabled: z.boolean(),
  default_sub_locations: z.array(z.string()),
  season_months: SeasonMonths,
  vat_pct: z.number().min(0).max(100),
  categories: z.array(TemplateCategorySchema),
});
export type TemplateSchemaJsonT = z.infer<typeof TemplateSchemaJson>;

export const AccountMapEntry = z.object({
  category: z.string().min(1),
  code_patterns: z.array(z.string().min(1)),
});
export const AccountMapJson = z.array(AccountMapEntry);
export type AccountMapJsonT = z.infer<typeof AccountMapJson>;

export const BudgetLineRow = z.object({
  id: z.number(),
  segment_id: z.number(),
  sub_location: z.string().nullable(),
  category: z.string(),
  line_code: z.string(),
  season: SeasonSchema,
  qty: z.number(),
  unit_cost: z.number(),
  monthly_cost: z.number(),
  notes: z.string().nullable(),
  created_at: z.string(),
});

export const ProjectBudgetRow = z.object({
  id: z.number(),
  project_id: z.number(),
  fiscal_year: z.number().int(),
  scenario: ScenarioSchema,
  status: StatusSchema,
  start_month: z.number().int().min(1).max(12),
  notes: z.string().nullable(),
  created_by: z.string().nullable(),
  published_at: z.string().nullable(),
  published_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const SegmentRow = z.object({
  id: z.number(),
  budget_id: z.number(),
  service_line: ServiceLineSchema,
  template_version: z.number().int(),
});

export const BudgetSettingsRow = z.object({
  id: z.literal(1),
  green_pct: z.number(),
  amber_pct: z.number(),
  default_scenario: ScenarioSchema,
  updated_at: z.string(),
});
```

Create `src/lib/fmplus/budget/types.ts`:

```typescript
export type {
  ServiceLine,
  Scenario,
  BudgetStatus,
  Season,
  CalcRule,
  TemplateSchemaJsonT,
  AccountMapJsonT,
} from './schema';

export type VarianceColor = 'green' | 'amber' | 'red';

export type VarianceCell = {
  month: number;          // 1-12
  budget: number;
  actual: number;
  variance: number;
  variance_pct: number | null;
  color: VarianceColor;
};

export type CategoryVariance = {
  category: string;
  cells: VarianceCell[];
  ytd: VarianceCell;
};

export type SegmentVariance = {
  segment_id: number;
  service_line: ServiceLine;
  template_version: number;
  is_stub: boolean;
  categories: CategoryVariance[];
  ytd: VarianceCell;
};

export type BudgetVarianceReport = {
  project_id: number;
  project_name: string;
  fiscal_year: number;
  scenario: Scenario;
  status: BudgetStatus;
  start_month: number;
  segments: SegmentVariance[];
  ytd: VarianceCell;
  health_score_pct: number;       // weighted-avg |variance_pct|
  unmapped_actuals_total: number; // sum of actuals that didn't match any category
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/fmplus/budget/schema.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/budget/schema.ts src/lib/fmplus/budget/types.ts src/lib/fmplus/budget/schema.test.ts
git commit -m "feat(fmplus): zod schemas + types for project budget"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 3: Templates module (HK + 5 stubs) + getTemplate helper

**Files:**
- Create: `src/lib/fmplus/budget/templates/hk.ts`
- Create: `src/lib/fmplus/budget/templates/mep.ts`
- Create: `src/lib/fmplus/budget/templates/landscape.ts`
- Create: `src/lib/fmplus/budget/templates/security.ts`
- Create: `src/lib/fmplus/budget/templates/pest-ctrl.ts`
- Create: `src/lib/fmplus/budget/templates/waste-mgmt.ts`
- Create: `src/lib/fmplus/budget/templates/index.ts`
- Create: `src/lib/fmplus/budget/templates/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/fmplus/budget/templates/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getTemplate, SERVICE_LINE_CATALOG } from './index';
import { TemplateSchemaJson, AccountMapJson } from '../schema';

describe('templates', () => {
  it('returns HK v1 fully baked', () => {
    const t = getTemplate('hk', 1);
    expect(t.is_stub).toBe(false);
    expect(t.schema_json.categories).toHaveLength(6);
    TemplateSchemaJson.parse(t.schema_json);
    AccountMapJson.parse(t.account_map_json);
    const manning = t.schema_json.categories.find(c => c.code === 'manning')!;
    expect(manning.lines).toHaveLength(15);
  });

  it('returns MEP v1 as a stub', () => {
    const t = getTemplate('mep', 1);
    expect(t.is_stub).toBe(true);
    expect(t.schema_json.categories).toHaveLength(0);
  });

  it('lists all 6 service lines in catalog', () => {
    expect(SERVICE_LINE_CATALOG.map(s => s.code).sort()).toEqual(
      ['hk','landscape','mep','pest_ctrl','security','waste_mgmt'],
    );
  });

  it('catalog marks HK as ready and others as stub', () => {
    const hk = SERVICE_LINE_CATALOG.find(s => s.code === 'hk')!;
    expect(hk.template_status).toBe('ready');
    for (const c of SERVICE_LINE_CATALOG.filter(s => s.code !== 'hk')) {
      expect(c.template_status).toBe('stub');
    }
  });

  it('throws on unknown service line / version', () => {
    // @ts-expect-error invalid service line
    expect(() => getTemplate('finance', 1)).toThrow();
    expect(() => getTemplate('hk', 99)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/fmplus/budget/templates/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the HK template**

Create `src/lib/fmplus/budget/templates/hk.ts`:

```typescript
import type { TemplateSchemaJsonT, AccountMapJsonT } from '../schema';

export const HK_V1_SCHEMA: TemplateSchemaJsonT = {
  sub_locations_enabled: true,
  default_sub_locations: [
    'NC Inner Campus',
    'Outer Campus',
    'NC Off-Campus Housing',
    'Maadi Buildings',
  ],
  season_months: { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] },
  vat_pct: 14,
  categories: [
    { code: 'manning', label: 'Manning', calc: 'qty_x_unitcost', lines: [
      { code: 'hk_manager',    label: 'HK Manager' },
      { code: 'asst_manager',  label: 'Assistant Manager' },
      { code: 'sr_supervisor', label: 'Senior Supervisor' },
      { code: 'sup_8h',        label: 'Supervisor 8H' },
      { code: 'hk_mf_8h',      label: 'HK Male & Female 8H' },
      { code: 'facades_sup',   label: 'Facades Supervisor 8H' },
      { code: 'facades_lab',   label: 'Facades Labor 8H' },
      { code: 'waste_sup',     label: 'Waste Supervisor 8H' },
      { code: 'waste_lab',     label: 'Waste Labor 8H' },
      { code: 'admin',         label: 'Admin' },
      { code: 'storekeeper',   label: 'Storekeeper' },
      { code: 'driver',        label: 'Driver' },
      { code: 'trainer',       label: 'Trainer' },
      { code: 'sup_8h_r',      label: 'Supervisor 8H R' },
      { code: 'hk_f_8h_r',     label: 'HK Female 8H R' },
    ] },
    { code: 'ppe', label: 'Uniform & PPE', calc: 'total_headcount_x_unitcost',
      lines: [{ code: 'uniform_ppe', label: 'Uniform & PPE' }] },
    { code: 'tools', label: 'Tools & Consumables', calc: 'qty_x_unitcost_div_depreciation', lines: [
      { code: 'machinery',   label: 'Machinery' },
      { code: 'tools',       label: 'Tools' },
      { code: 'consumables', label: 'Consumables' },
    ] },
    { code: 'transport', label: 'Transportation & Vehicles', calc: 'qty_x_unitcost', lines: [
      { code: 'bus',      label: 'Bus' },
      { code: 'microbus', label: 'Microbus' },
      { code: 'sedan',    label: 'Sedan Car' },
      { code: 'minivan',  label: 'Minivan' },
      { code: 'pickup',   label: 'Pickup Car' },
      { code: 'fuel',     label: 'Fuel' },
    ] },
    { code: 'it', label: 'IT & Communication', calc: 'qty_x_unitcost',
      lines: [{ code: 'ict_per_head', label: 'Laptop / Mobile / Printer / SIM (per head)' }] },
    { code: 'overhead', label: 'Mobilization & Overhead', calc: 'flat',
      lines: [{ code: 'mob_overhead', label: 'Mobilization & Overhead' }] },
  ],
};

export const HK_V1_ACCOUNT_MAP: AccountMapJsonT = [
  { category: 'manning',     code_patterns: ['^5000(0[1-9]|1[0-4])$'] },
  { category: 'ppe',         code_patterns: ['^500011$'] },
  { category: 'tools',       code_patterns: ['^5002(0[1-9]|1[0-9])$'] },
  { category: 'consumables', code_patterns: ['^5001(0[1-9]|1[0-9])$'] },
  { category: 'transport',   code_patterns: ['^5005[0-9]{2}$'] },
  { category: 'it',          code_patterns: ['^5003(0[1-9]|1[0-9])$'] },
  { category: 'overhead',    code_patterns: ['^5004(0[1-9]|1[0-9])$'] },
];
```

- [ ] **Step 4: Write the 5 stub templates**

Create five files with identical shape, only the export name differs:

`src/lib/fmplus/budget/templates/mep.ts`:
```typescript
import type { TemplateSchemaJsonT, AccountMapJsonT } from '../schema';
export const MEP_V1_SCHEMA: TemplateSchemaJsonT = {
  sub_locations_enabled: false,
  default_sub_locations: [],
  season_months: { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] },
  vat_pct: 14,
  categories: [],
};
export const MEP_V1_ACCOUNT_MAP: AccountMapJsonT = [];
```

Repeat for `landscape.ts`, `security.ts`, `pest-ctrl.ts`, `waste-mgmt.ts` — same content, rename `MEP` to `LANDSCAPE`, `SECURITY`, `PEST_CTRL`, `WASTE_MGMT` respectively.

- [ ] **Step 5: Write the index module**

Create `src/lib/fmplus/budget/templates/index.ts`:

```typescript
import type { ServiceLine, TemplateSchemaJsonT, AccountMapJsonT } from '../schema';
import { HK_V1_SCHEMA, HK_V1_ACCOUNT_MAP } from './hk';
import { MEP_V1_SCHEMA, MEP_V1_ACCOUNT_MAP } from './mep';
import { LANDSCAPE_V1_SCHEMA, LANDSCAPE_V1_ACCOUNT_MAP } from './landscape';
import { SECURITY_V1_SCHEMA, SECURITY_V1_ACCOUNT_MAP } from './security';
import { PEST_CTRL_V1_SCHEMA, PEST_CTRL_V1_ACCOUNT_MAP } from './pest-ctrl';
import { WASTE_MGMT_V1_SCHEMA, WASTE_MGMT_V1_ACCOUNT_MAP } from './waste-mgmt';

export type Template = {
  service_line: ServiceLine;
  version: number;
  is_stub: boolean;
  schema_json: TemplateSchemaJsonT;
  account_map_json: AccountMapJsonT;
};

const REGISTRY: Record<string, Template> = {
  'hk:1':         { service_line: 'hk',         version: 1, is_stub: false, schema_json: HK_V1_SCHEMA,         account_map_json: HK_V1_ACCOUNT_MAP },
  'mep:1':        { service_line: 'mep',        version: 1, is_stub: true,  schema_json: MEP_V1_SCHEMA,        account_map_json: MEP_V1_ACCOUNT_MAP },
  'landscape:1':  { service_line: 'landscape',  version: 1, is_stub: true,  schema_json: LANDSCAPE_V1_SCHEMA,  account_map_json: LANDSCAPE_V1_ACCOUNT_MAP },
  'security:1':   { service_line: 'security',   version: 1, is_stub: true,  schema_json: SECURITY_V1_SCHEMA,   account_map_json: SECURITY_V1_ACCOUNT_MAP },
  'pest_ctrl:1':  { service_line: 'pest_ctrl',  version: 1, is_stub: true,  schema_json: PEST_CTRL_V1_SCHEMA,  account_map_json: PEST_CTRL_V1_ACCOUNT_MAP },
  'waste_mgmt:1': { service_line: 'waste_mgmt', version: 1, is_stub: true,  schema_json: WASTE_MGMT_V1_SCHEMA, account_map_json: WASTE_MGMT_V1_ACCOUNT_MAP },
};

export function getTemplate(serviceLine: ServiceLine, version: number): Template {
  const key = `${serviceLine}:${version}`;
  const t = REGISTRY[key];
  if (!t) throw new Error(`Unknown template ${key}`);
  return t;
}

export function getLatestTemplate(serviceLine: ServiceLine): Template {
  // v1 is the only version today; widen this when v2 lands.
  return getTemplate(serviceLine, 1);
}

export const SERVICE_LINE_CATALOG: Array<{
  code: ServiceLine;
  label: string;
  odoo_plan_hint: string;
  template_status: 'ready' | 'stub';
}> = [
  { code: 'hk',         label: 'Housekeeping',        odoo_plan_hint: 'HK Projects',       template_status: 'ready' },
  { code: 'mep',        label: 'MEP',                 odoo_plan_hint: 'MEP Projects',      template_status: 'stub'  },
  { code: 'landscape',  label: 'Landscape',           odoo_plan_hint: '(in Mix Projects)', template_status: 'stub'  },
  { code: 'security',   label: 'Security',            odoo_plan_hint: 'Security Projects', template_status: 'stub'  },
  { code: 'pest_ctrl',  label: 'Pest Control',        odoo_plan_hint: '(in Mix Projects)', template_status: 'stub'  },
  { code: 'waste_mgmt', label: 'Waste Management',    odoo_plan_hint: '(in Mix Projects)', template_status: 'stub'  },
];
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/fmplus/budget/templates/index.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 7: Verify build still passes**

Run: `npm run build`
Expected: completes with no TypeScript errors. (Adds new files only; no existing files changed.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/fmplus/budget/templates/
git commit -m "feat(fmplus): HK template + 5 service-line stubs + getTemplate helper"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

> _Plan continues in subsequent sections — this file is built up incrementally to keep each chunk reviewable. Phases 2-7 follow below._

## Phase 2 — Variance read API (Tasks 4-7)

### Task 4: `aggregateBudgetByMonth()` — budget side of variance

**Files:**
- Create: `src/lib/fmplus/budget/variance.ts`
- Create: `src/lib/fmplus/budget/variance.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/fmplus/budget/variance.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { aggregateBudgetByMonth } from './variance';

describe('aggregateBudgetByMonth', () => {
  it('expands season totals into per-month using HK season_months', () => {
    const lines = [
      { segment_id: 1, sub_location: 'NC Inner Campus', category: 'manning',
        line_code: 'hk_manager', season: 'high' as const, monthly_cost: 1000 },
      { segment_id: 1, sub_location: 'NC Inner Campus', category: 'manning',
        line_code: 'hk_manager', season: 'low' as const,  monthly_cost: 800 },
    ];
    const seasonMonths = { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] };
    const out = aggregateBudgetByMonth(lines, seasonMonths, 1);
    const jan = out.find(x => x.segment_id===1 && x.category==='manning' && x.month===1);
    const may = out.find(x => x.segment_id===1 && x.category==='manning' && x.month===5);
    expect(jan!.budget).toBe(1000);
    expect(may!.budget).toBe(800);
  });

  it('zeros out months before start_month', () => {
    const lines = [
      { segment_id: 1, sub_location: null, category: 'overhead',
        line_code: 'mob_overhead', season: 'high' as const, monthly_cost: 5000 },
    ];
    const seasonMonths = { high: [1,2,3,4,5,6,7,8,9,10,11,12], low: [] };
    const out = aggregateBudgetByMonth(lines, seasonMonths, 5);
    const apr = out.find(x => x.month===4)!;
    const may = out.find(x => x.month===5)!;
    expect(apr.budget).toBe(0);
    expect(may.budget).toBe(5000);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `npx vitest run src/lib/fmplus/budget/variance.test.ts`
Expected: FAIL — `aggregateBudgetByMonth` not exported.

- [ ] **Step 3: Implement `aggregateBudgetByMonth`**

Create `src/lib/fmplus/budget/variance.ts`:

```typescript
import type { Season } from './schema';

export type AggregatedBudgetCell = {
  segment_id: number;
  category: string;
  month: number;
  budget: number;
};

export type BudgetLineForAgg = {
  segment_id: number;
  category: string;
  season: Season;
  monthly_cost: number;
};

export function aggregateBudgetByMonth(
  lines: BudgetLineForAgg[],
  seasonMonths: { high: number[]; low: number[] },
  startMonth: number,
): AggregatedBudgetCell[] {
  const seasonTotal = new Map<string, number>();
  for (const l of lines) {
    const k = `${l.segment_id}|${l.category}|${l.season}`;
    seasonTotal.set(k, (seasonTotal.get(k) ?? 0) + Number(l.monthly_cost));
  }
  const out: AggregatedBudgetCell[] = [];
  for (const [k, total] of seasonTotal.entries()) {
    const [segIdStr, category, season] = k.split('|');
    const months = season === 'high' ? seasonMonths.high : seasonMonths.low;
    for (const month of months) {
      out.push({
        segment_id: Number(segIdStr),
        category,
        month,
        budget: month >= startMonth ? total : 0,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the tests — verify they pass**

Run: `npx vitest run src/lib/fmplus/budget/variance.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/budget/variance.ts src/lib/fmplus/budget/variance.test.ts
git commit -m "feat(fmplus): aggregateBudgetByMonth — budget side of variance"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 5: `aggregateActualsByMonth()` — Odoo actuals matched via account_map regex

**Files:**
- Modify: `src/lib/fmplus/budget/variance.ts` (add functions)
- Modify: `src/lib/fmplus/budget/variance.test.ts` (add tests)

- [ ] **Step 1: Add the failing test**

Append to `src/lib/fmplus/budget/variance.test.ts`:

```typescript
import { matchAccountToCategory, aggregateActualsByMonth } from './variance';

describe('matchAccountToCategory', () => {
  const map = [
    { category: 'manning',     code_patterns: ['^5000(0[1-9]|1[0-4])$'] },
    { category: 'consumables', code_patterns: ['^5001(0[1-9]|1[0-9])$'] },
  ];
  it('matches manning code', () => {
    expect(matchAccountToCategory('500001', map)).toBe('manning');
    expect(matchAccountToCategory('500014', map)).toBe('manning');
  });
  it('matches consumables code', () => {
    expect(matchAccountToCategory('500101', map)).toBe('consumables');
  });
  it('returns null on no match', () => {
    expect(matchAccountToCategory('900000', map)).toBeNull();
  });
});

describe('aggregateActualsByMonth', () => {
  it('sums move-line balances grouped by (segment, category, month)', () => {
    const moveLines = [
      { date: '2026-01-15', balance: 100, account_code: '500001' },
      { date: '2026-01-25', balance: 50,  account_code: '500001' },
      { date: '2026-02-10', balance: 200, account_code: '500101' },
      { date: '2026-02-20', balance: 30,  account_code: '900000' },
    ];
    const map = [
      { category: 'manning',     code_patterns: ['^500001$'] },
      { category: 'consumables', code_patterns: ['^500101$'] },
    ];
    const { cells, unmappedTotal } = aggregateActualsByMonth(moveLines, map, 7);
    const jan = cells.find(c => c.month===1 && c.category==='manning')!;
    const feb = cells.find(c => c.month===2 && c.category==='consumables')!;
    expect(jan.actual).toBe(150);
    expect(feb.actual).toBe(200);
    expect(unmappedTotal).toBe(30);
  });
});
```

- [ ] **Step 2: Run tests — verify failure**

Run: `npx vitest run src/lib/fmplus/budget/variance.test.ts`
Expected: FAIL — new functions not exported.

- [ ] **Step 3: Implement the new functions**

Append to `src/lib/fmplus/budget/variance.ts`:

```typescript
import type { AccountMapJsonT } from './schema';

export function matchAccountToCategory(
  accountCode: string,
  map: AccountMapJsonT,
): string | null {
  for (const entry of map) {
    for (const pattern of entry.code_patterns) {
      if (new RegExp(pattern).test(accountCode)) return entry.category;
    }
  }
  return null;
}

export type MoveLineForAgg = {
  date: string;
  balance: number;
  account_code: string;
};

export type AggregatedActualCell = {
  segment_id: number;
  category: string;
  month: number;
  actual: number;
};

export function aggregateActualsByMonth(
  moveLines: MoveLineForAgg[],
  map: AccountMapJsonT,
  segmentId: number,
): { cells: AggregatedActualCell[]; unmappedTotal: number } {
  const buckets = new Map<string, number>();
  let unmappedTotal = 0;
  for (const ml of moveLines) {
    const month = new Date(ml.date).getUTCMonth() + 1;
    const cat = matchAccountToCategory(ml.account_code, map);
    if (!cat) {
      unmappedTotal += Number(ml.balance);
      continue;
    }
    const k = `${cat}|${month}`;
    buckets.set(k, (buckets.get(k) ?? 0) + Number(ml.balance));
  }
  const cells: AggregatedActualCell[] = [];
  for (const [k, actual] of buckets.entries()) {
    const [category, monthStr] = k.split('|');
    cells.push({ segment_id: segmentId, category, month: Number(monthStr), actual });
  }
  return { cells, unmappedTotal };
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `npx vitest run src/lib/fmplus/budget/variance.test.ts`
Expected: PASS — 5 tests now.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/budget/variance.ts src/lib/fmplus/budget/variance.test.ts
git commit -m "feat(fmplus): aggregateActualsByMonth + matchAccountToCategory"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 6: `colorVariance()` + `computeCellRollup()` + `buildBudgetVariance()` orchestrator

**Files:**
- Modify: `src/lib/fmplus/budget/variance.ts`
- Modify: `src/lib/fmplus/budget/variance.test.ts`

- [ ] **Step 1: Add failing tests for `colorVariance` + `computeCellRollup`**

Append to test file:

```typescript
import { colorVariance, computeCellRollup } from './variance';

describe('colorVariance — asymmetric (only large overspend → red)', () => {
  const thr = { green: 5, amber: 15 };
  it('green for small deviation either way', () => {
    expect(colorVariance(0,    thr)).toBe('green');
    expect(colorVariance(4.9,  thr)).toBe('green');
    expect(colorVariance(-4.9, thr)).toBe('green');
  });
  it('amber for moderate overspend', () => {
    expect(colorVariance(10, thr)).toBe('amber');
    expect(colorVariance(15, thr)).toBe('amber');
  });
  it('red for large overspend', () => {
    expect(colorVariance(15.1, thr)).toBe('red');
    expect(colorVariance(50,   thr)).toBe('red');
  });
  it('amber (NOT red) for large underspend — scope-delivery risk', () => {
    expect(colorVariance(-20, thr)).toBe('amber');
    expect(colorVariance(-99, thr)).toBe('amber');
  });
  it('null variance_pct returns "green"', () => {
    expect(colorVariance(null, thr)).toBe('green');
  });
});

describe('computeCellRollup', () => {
  it('joins budget+actual and computes variance + color', () => {
    const budget = [
      { segment_id: 1, category: 'manning', month: 1, budget: 1000 },
      { segment_id: 1, category: 'manning', month: 2, budget: 1000 },
    ];
    const actuals = [
      { segment_id: 1, category: 'manning', month: 1, actual: 950 },
      { segment_id: 1, category: 'manning', month: 2, actual: 1200 },
    ];
    const cells = computeCellRollup(budget, actuals, { green: 5, amber: 15 });
    const jan = cells.find(c => c.month===1)!;
    const feb = cells.find(c => c.month===2)!;
    expect(jan.variance).toBe(-50);
    expect(jan.color).toBe('green');
    expect(feb.variance).toBe(200);
    expect(feb.color).toBe('red');
  });

  it('returns null variance_pct when budget is 0', () => {
    const cells = computeCellRollup(
      [{ segment_id: 1, category: 'x', month: 1, budget: 0 }],
      [{ segment_id: 1, category: 'x', month: 1, actual: 100 }],
      { green: 5, amber: 15 },
    );
    expect(cells[0].variance_pct).toBeNull();
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `npx vitest run src/lib/fmplus/budget/variance.test.ts`
Expected: FAIL — `colorVariance` / `computeCellRollup` not exported.

- [ ] **Step 3: Implement coloring + rollup**

Append to `src/lib/fmplus/budget/variance.ts`:

```typescript
import type { VarianceColor } from './types';

export type ThresholdConfig = { green: number; amber: number };

export function colorVariance(variancePct: number | null, thr: ThresholdConfig): VarianceColor {
  if (variancePct == null) return 'green';
  if (Math.abs(variancePct) <= thr.green) return 'green';
  if (variancePct > thr.amber) return 'red';
  return 'amber';
}

export type RolledCell = {
  segment_id: number;
  category: string;
  month: number;
  budget: number;
  actual: number;
  variance: number;
  variance_pct: number | null;
  color: VarianceColor;
};

export function computeCellRollup(
  budget: AggregatedBudgetCell[],
  actuals: AggregatedActualCell[],
  thr: ThresholdConfig,
): RolledCell[] {
  const actMap = new Map<string, number>();
  for (const a of actuals) {
    actMap.set(`${a.segment_id}|${a.category}|${a.month}`, a.actual);
  }
  const out: RolledCell[] = [];
  const seen = new Set<string>();
  for (const b of budget) {
    const k = `${b.segment_id}|${b.category}|${b.month}`;
    seen.add(k);
    const actual = actMap.get(k) ?? 0;
    const variance = actual - b.budget;
    const variance_pct = b.budget === 0 ? null : (variance / b.budget) * 100;
    out.push({
      segment_id: b.segment_id, category: b.category, month: b.month,
      budget: b.budget, actual, variance, variance_pct,
      color: colorVariance(variance_pct, thr),
    });
  }
  for (const a of actuals) {
    const k = `${a.segment_id}|${a.category}|${a.month}`;
    if (seen.has(k)) continue;
    out.push({
      segment_id: a.segment_id, category: a.category, month: a.month,
      budget: 0, actual: a.actual, variance: a.actual, variance_pct: null,
      color: 'green',
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `npx vitest run src/lib/fmplus/budget/variance.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Implement `buildBudgetVariance()` orchestrator**

Append to `src/lib/fmplus/budget/variance.ts`:

```typescript
import { supabaseAdmin } from '@/lib/supabase';
import type { Scenario, ServiceLine } from './schema';
import type { BudgetVarianceReport, SegmentVariance, CategoryVariance, VarianceCell } from './types';
import { getTemplate } from './templates';

export async function buildBudgetVariance(opts: {
  projectId: number;
  fiscalYear: number;
  scenario: Scenario;
  ytdThrough?: number;
}): Promise<BudgetVarianceReport | null> {
  const sb = supabaseAdmin();
  const { projectId, fiscalYear, scenario } = opts;
  const ytdThrough = opts.ytdThrough ?? new Date().getUTCMonth() + 1;

  const { data: project } = await sb
    .from('odoo_analytic_accounts')
    .select('id, name')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return null;

  const { data: budget } = await sb
    .from('project_budgets')
    .select('id, status, start_month, scenario, fiscal_year')
    .eq('project_id', projectId)
    .eq('fiscal_year', fiscalYear)
    .eq('scenario', scenario)
    .maybeSingle();
  if (!budget) return null;
  const b = budget as { id: number; status: 'draft'|'published'; start_month: number; scenario: Scenario; fiscal_year: number };

  const { data: segs } = await sb
    .from('project_budget_segments')
    .select('id, service_line, template_version')
    .eq('budget_id', b.id);
  const segments = (segs ?? []) as Array<{ id: number; service_line: ServiceLine; template_version: number }>;

  const segmentIds = segments.map(s => s.id);
  const { data: linesData } = segmentIds.length === 0
    ? { data: [] }
    : await sb
        .from('budget_lines')
        .select('segment_id, category, season, monthly_cost')
        .in('segment_id', segmentIds);
  const lines = (linesData ?? []) as Array<{
    segment_id: number; category: string; season: 'high'|'low'; monthly_cost: number;
  }>;

  const { data: settings } = await sb.from('budget_settings').select('*').eq('id', 1).maybeSingle();
  const thr = {
    green: Number((settings as { green_pct?: number } | null)?.green_pct ?? 5),
    amber: Number((settings as { amber_pct?: number } | null)?.amber_pct ?? 15),
  };

  const fromDate = `${fiscalYear}-01-01`;
  const toDate   = `${fiscalYear}-12-31`;
  const { data: links } = await sb
    .from('odoo_move_line_analytics')
    .select('move_line_id')
    .eq('analytic_account_id', projectId);
  const moveLineIds = ((links ?? []) as Array<{ move_line_id: number }>).map(x => x.move_line_id);
  const { data: mlData } = moveLineIds.length === 0 ? { data: [] } : await sb
    .from('odoo_move_lines')
    .select('id, date, balance, odoo_accounts!inner(code)')
    .in('id', moveLineIds)
    .gte('date', fromDate)
    .lte('date', toDate);
  type MLRow = { id: number; date: string; balance: number; odoo_accounts: { code: string } };
  const moveLines = (mlData ?? []) as MLRow[];

  const segmentReports: SegmentVariance[] = [];
  let projUnmapped = 0;
  for (const seg of segments) {
    const tpl = getTemplate(seg.service_line, seg.template_version);
    const segLines = lines.filter(l => l.segment_id === seg.id);
    const budgetCells = aggregateBudgetByMonth(
      segLines, tpl.schema_json.season_months, b.start_month,
    );
    const segMoveLines = moveLines.map(ml => ({
      date: ml.date, balance: Number(ml.balance), account_code: ml.odoo_accounts.code,
    }));
    const { cells: actualCells, unmappedTotal } = aggregateActualsByMonth(
      segMoveLines, tpl.account_map_json, seg.id,
    );
    projUnmapped += unmappedTotal;
    const cells = computeCellRollup(budgetCells, actualCells, thr);

    const byCategory = new Map<string, VarianceCell[]>();
    for (const c of cells) {
      if (!byCategory.has(c.category)) byCategory.set(c.category, []);
      byCategory.get(c.category)!.push({
        month: c.month, budget: c.budget, actual: c.actual,
        variance: c.variance, variance_pct: c.variance_pct, color: c.color,
      });
    }
    const categories: CategoryVariance[] = [];
    for (const [cat, ccells] of byCategory.entries()) {
      categories.push({ category: cat, cells: ccells, ytd: sumCellsYtd(ccells, ytdThrough, thr) });
    }
    const segYtd = sumCellsYtd(cells.map(c => ({
      month: c.month, budget: c.budget, actual: c.actual,
      variance: c.variance, variance_pct: c.variance_pct, color: c.color,
    })), ytdThrough, thr);
    segmentReports.push({
      segment_id: seg.id, service_line: seg.service_line,
      template_version: seg.template_version, is_stub: tpl.is_stub,
      categories, ytd: segYtd,
    });
  }

  const allCells = segmentReports.flatMap(s => s.categories.flatMap(c => c.cells));
  const projYtd = sumCellsYtd(allCells, ytdThrough, thr);
  let weightedNum = 0, weightedDen = 0;
  for (const c of allCells) {
    if (c.variance_pct == null) continue;
    weightedNum += Math.abs(c.variance_pct) * c.budget;
    weightedDen += c.budget;
  }
  const health = weightedDen === 0 ? 0 : weightedNum / weightedDen;

  return {
    project_id: project.id as number,
    project_name: (project as { name: string }).name,
    fiscal_year: b.fiscal_year,
    scenario: b.scenario,
    status: b.status,
    start_month: b.start_month,
    segments: segmentReports,
    ytd: projYtd,
    health_score_pct: health,
    unmapped_actuals_total: projUnmapped,
  };
}

function sumCellsYtd(
  cells: VarianceCell[],
  ytdThrough: number,
  thr: ThresholdConfig,
): VarianceCell {
  const ytdCells = cells.filter(c => c.month <= ytdThrough);
  const budget = ytdCells.reduce((s, c) => s + c.budget, 0);
  const actual = ytdCells.reduce((s, c) => s + c.actual, 0);
  const variance = actual - budget;
  const variance_pct = budget === 0 ? null : (variance / budget) * 100;
  return {
    month: ytdThrough, budget, actual, variance, variance_pct,
    color: colorVariance(variance_pct, thr),
  };
}
```

- [ ] **Step 6: Verify build still passes**

Run: `npm run build`
Expected: completes with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/fmplus/budget/variance.ts src/lib/fmplus/budget/variance.test.ts
git commit -m "feat(fmplus): buildBudgetVariance orchestrator + colorVariance + rollup"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 7: Variance drill — `cellToMoveLines()`

**Files:**
- Create: `src/lib/fmplus/budget/variance-drill.ts`
- Create: `src/lib/fmplus/budget/variance-drill.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/fmplus/budget/variance-drill.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { matchesCellFilter } from './variance-drill';

describe('matchesCellFilter', () => {
  const map = [
    { category: 'manning', code_patterns: ['^500001$', '^500002$'] },
  ];
  it('keeps move-line whose account-code matches the cell category', () => {
    expect(matchesCellFilter(
      { date: '2026-02-12', account_code: '500001' },
      { category: 'manning', month: 2, year: 2026 }, map,
    )).toBe(true);
  });
  it('rejects different month', () => {
    expect(matchesCellFilter(
      { date: '2026-01-12', account_code: '500001' },
      { category: 'manning', month: 2, year: 2026 }, map,
    )).toBe(false);
  });
  it('rejects different category', () => {
    expect(matchesCellFilter(
      { date: '2026-02-12', account_code: '900000' },
      { category: 'manning', month: 2, year: 2026 }, map,
    )).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `npx vitest run src/lib/fmplus/budget/variance-drill.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/fmplus/budget/variance-drill.ts`:

```typescript
import { supabaseAdmin } from '@/lib/supabase';
import type { AccountMapJsonT } from './schema';
import { matchAccountToCategory } from './variance';

export function matchesCellFilter(
  ml: { date: string; account_code: string },
  cell: { category: string; month: number; year: number },
  map: AccountMapJsonT,
): boolean {
  const d = new Date(ml.date);
  if (d.getUTCFullYear() !== cell.year) return false;
  if (d.getUTCMonth() + 1 !== cell.month) return false;
  return matchAccountToCategory(ml.account_code, map) === cell.category;
}

export type DrillResult = {
  move_line_id: number;
  date: string;
  amount: number;
  account_code: string;
  account_name: string;
  partner_name: string | null;
  journal_name: string | null;
  ref: string | null;
};

export async function cellToMoveLines(opts: {
  projectId: number;
  category: string;
  month: number;
  year: number;
  accountMap: AccountMapJsonT;
}): Promise<DrillResult[]> {
  const sb = supabaseAdmin();
  const fromDate = `${opts.year}-${String(opts.month).padStart(2, '0')}-01`;
  const toDate   = monthEnd(opts.year, opts.month);
  const { data: links } = await sb
    .from('odoo_move_line_analytics')
    .select('move_line_id')
    .eq('analytic_account_id', opts.projectId);
  const ids = ((links ?? []) as Array<{ move_line_id: number }>).map(x => x.move_line_id);
  if (ids.length === 0) return [];
  const { data: rows } = await sb
    .from('odoo_move_lines')
    .select(`
      id, date, balance, ref,
      odoo_accounts!inner(code, name),
      odoo_partners(name),
      odoo_journals(name)
    `)
    .in('id', ids)
    .gte('date', fromDate)
    .lte('date', toDate);
  type Row = {
    id: number; date: string; balance: number; ref: string | null;
    odoo_accounts: { code: string; name: string };
    odoo_partners: { name: string } | null;
    odoo_journals: { name: string } | null;
  };
  const all = (rows ?? []) as Row[];
  return all
    .filter(r => matchesCellFilter(
      { date: r.date, account_code: r.odoo_accounts.code },
      { category: opts.category, month: opts.month, year: opts.year },
      opts.accountMap,
    ))
    .map(r => ({
      move_line_id: r.id,
      date: r.date,
      amount: Number(r.balance),
      account_code: r.odoo_accounts.code,
      account_name: r.odoo_accounts.name,
      partner_name: r.odoo_partners?.name ?? null,
      journal_name: r.odoo_journals?.name ?? null,
      ref: r.ref,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function monthEnd(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run src/lib/fmplus/budget/variance-drill.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/budget/variance-drill.ts src/lib/fmplus/budget/variance-drill.test.ts
git commit -m "feat(fmplus): cellToMoveLines drill + matchesCellFilter"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

## Phase 3 — Excel ingest (Tasks 8-11)

### Task 8: Path B parser — flat normalized template

**Files:**
- Create: `src/lib/fmplus/budget/parsers/flat-template.ts`
- Create: `src/lib/fmplus/budget/parsers/flat-template.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/fmplus/budget/parsers/flat-template.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseFlatBudgetXlsx, FLAT_HEADERS } from './flat-template';

async function buildWorkbook(rows: Array<Record<string, string | number>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('budget');
  ws.addRow(FLAT_HEADERS);
  for (const r of rows) {
    ws.addRow(FLAT_HEADERS.map(h => r[h] ?? ''));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('parseFlatBudgetXlsx', () => {
  it('parses one good row', async () => {
    const buf = await buildWorkbook([{
      project: 'AUC', service_line: 'hk',
      sub_location: 'NC Inner Campus', category: 'manning',
      line_code: 'hk_manager', season: 'high',
      qty: 0.75, unit_cost: 32500,
    }]);
    const result = await parseFlatBudgetXlsx(buf);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      project: 'AUC', service_line: 'hk', category: 'manning',
      season: 'high', qty: 0.75, unit_cost: 32500,
    });
  });

  it('reports row-level errors with row numbers', async () => {
    const buf = await buildWorkbook([
      { project: 'AUC', service_line: 'hk', sub_location: '',
        category: 'manning', line_code: 'hk_manager', season: 'spring',
        qty: 1, unit_cost: 1000 },
      { project: '', service_line: 'hk', sub_location: '',
        category: 'manning', line_code: 'hk_manager', season: 'high',
        qty: -5, unit_cost: 1000 },
    ]);
    const result = await parseFlatBudgetXlsx(buf);
    expect(result.errors.length).toBeGreaterThan(0);
    const rowNumbers = result.errors.map(e => e.row);
    expect(rowNumbers).toContain(2);
    expect(rowNumbers).toContain(3);
  });

  it('rejects unknown service_line', async () => {
    const buf = await buildWorkbook([{
      project: 'AUC', service_line: 'finance',
      sub_location: '', category: 'manning',
      line_code: 'hk_manager', season: 'high', qty: 1, unit_cost: 1000,
    }]);
    const result = await parseFlatBudgetXlsx(buf);
    expect(result.errors[0].message).toMatch(/service_line/i);
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `npx vitest run src/lib/fmplus/budget/parsers/flat-template.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement parser**

Create `src/lib/fmplus/budget/parsers/flat-template.ts`:

```typescript
import ExcelJS from 'exceljs';
import { ServiceLineSchema, SeasonSchema } from '../schema';

export const FLAT_HEADERS = [
  'project', 'service_line', 'sub_location', 'category',
  'line_code', 'season', 'qty', 'unit_cost', 'notes',
] as const;

export type FlatRow = {
  project: string;
  service_line: string;
  sub_location: string | null;
  category: string;
  line_code: string;
  season: 'high' | 'low';
  qty: number;
  unit_cost: number;
  notes: string | null;
};

export type FlatRowError = { row: number; field: string; message: string };

export type FlatParseResult = {
  rows: FlatRow[];
  errors: FlatRowError[];
};

export async function parseFlatBudgetXlsx(buf: Buffer | ArrayBuffer): Promise<FlatParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], errors: [{ row: 0, field: '', message: 'No worksheet' }] };

  const headerRow = ws.getRow(1);
  const headerMap = new Map<string, number>();
  for (let c = 1; c <= headerRow.cellCount; c++) {
    const v = String(headerRow.getCell(c).value ?? '').trim().toLowerCase();
    if (v) headerMap.set(v, c);
  }
  for (const required of ['project','service_line','category','line_code','season','qty','unit_cost'] as const) {
    if (!headerMap.has(required)) {
      return { rows: [], errors: [{ row: 1, field: required, message: `Missing required header: ${required}` }] };
    }
  }

  const rows: FlatRow[] = [];
  const errors: FlatRowError[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (h: string) => {
      const c = headerMap.get(h);
      return c ? row.getCell(c).value : null;
    };
    const project = String(get('project') ?? '').trim();
    const service_line = String(get('service_line') ?? '').trim();
    const sub_location = (() => { const v = String(get('sub_location') ?? '').trim(); return v === '' ? null : v; })();
    const category = String(get('category') ?? '').trim();
    const line_code = String(get('line_code') ?? '').trim();
    const season = String(get('season') ?? '').trim();
    const qtyRaw = get('qty');
    const unitRaw = get('unit_cost');
    const notes = (() => { const v = String(get('notes') ?? '').trim(); return v === '' ? null : v; })();

    if (!project)      { errors.push({ row: r, field: 'project',      message: 'Required' }); continue; }
    if (!service_line) { errors.push({ row: r, field: 'service_line', message: 'Required' }); continue; }
    if (!ServiceLineSchema.safeParse(service_line).success) {
      errors.push({ row: r, field: 'service_line', message: `Unknown service_line "${service_line}"` }); continue;
    }
    if (!category)     { errors.push({ row: r, field: 'category',     message: 'Required' }); continue; }
    if (!line_code)    { errors.push({ row: r, field: 'line_code',    message: 'Required' }); continue; }
    if (!SeasonSchema.safeParse(season).success) {
      errors.push({ row: r, field: 'season', message: `Season must be "high" or "low", got "${season}"` }); continue;
    }
    const qty = Number(qtyRaw);
    if (!Number.isFinite(qty) || qty < 0) {
      errors.push({ row: r, field: 'qty', message: `qty must be ≥ 0, got "${qtyRaw}"` }); continue;
    }
    const unit_cost = Number(unitRaw);
    if (!Number.isFinite(unit_cost) || unit_cost < 0) {
      errors.push({ row: r, field: 'unit_cost', message: `unit_cost must be ≥ 0, got "${unitRaw}"` }); continue;
    }
    rows.push({
      project, service_line, sub_location, category, line_code,
      season: season as 'high' | 'low', qty, unit_cost, notes,
    });
  }
  return { rows, errors };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run src/lib/fmplus/budget/parsers/flat-template.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/budget/parsers/flat-template.ts src/lib/fmplus/budget/parsers/flat-template.test.ts
git commit -m "feat(fmplus): Path B flat-template XLSX parser"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 9: Path B writer — flat-template export from Editor state

**Files:**
- Create: `src/lib/fmplus/budget/parsers/flat-template-export.ts`
- Create: `src/lib/fmplus/budget/parsers/flat-template-export.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { writeFlatBudgetXlsx } from './flat-template-export';
import { parseFlatBudgetXlsx } from './flat-template';

describe('writeFlatBudgetXlsx', () => {
  it('round-trips: write → read produces same rows', async () => {
    const rows = [
      { project: 'AUC', service_line: 'hk', sub_location: 'NC Inner Campus',
        category: 'manning', line_code: 'hk_manager', season: 'high' as const,
        qty: 0.75, unit_cost: 32500, notes: 'shared with Outer' },
      { project: 'AUC', service_line: 'hk', sub_location: null,
        category: 'overhead', line_code: 'mob_overhead', season: 'low' as const,
        qty: 1, unit_cost: 50000, notes: null },
    ];
    const buf = await writeFlatBudgetXlsx(rows);
    expect(Buffer.byteLength(buf)).toBeGreaterThan(0);
    const parsed = await parseFlatBudgetXlsx(buf);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ qty: 0.75, unit_cost: 32500, notes: 'shared with Outer' });
    expect(parsed.rows[1]).toMatchObject({ sub_location: null, season: 'low' });
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `npx vitest run src/lib/fmplus/budget/parsers/flat-template-export.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/fmplus/budget/parsers/flat-template-export.ts`:

```typescript
import ExcelJS from 'exceljs';
import { FLAT_HEADERS, type FlatRow } from './flat-template';

export async function writeFlatBudgetXlsx(rows: FlatRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('budget');
  ws.addRow(FLAT_HEADERS as unknown as string[]);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow([
      r.project, r.service_line, r.sub_location ?? '',
      r.category, r.line_code, r.season,
      r.qty, r.unit_cost, r.notes ?? '',
    ]);
  }
  ws.columns.forEach(col => { col.width = 18; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run src/lib/fmplus/budget/parsers/flat-template-export.test.ts`
Expected: PASS — round-trip test passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/budget/parsers/flat-template-export.ts src/lib/fmplus/budget/parsers/flat-template-export.test.ts
git commit -m "feat(fmplus): Path B flat-template XLSX writer (Editor export)"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 10: Path A parser — rich AUC-style XLSX

**Files:**
- Create: `src/lib/fmplus/budget/parsers/rich-auc-style.ts`
- Create: `src/lib/fmplus/budget/parsers/rich-auc-style.test.ts`
- Create: `src/lib/fmplus/budget/__fixtures__/auc-budget.xlsx` (copy from `FMPLUS/AUC Budget.xlsx`)

- [ ] **Step 1: Copy AUC fixture into the repo**

```bash
mkdir -p src/lib/fmplus/budget/__fixtures__
cp "C:/kareemhady/.claude/FMPLUS/AUC Budget.xlsx" src/lib/fmplus/budget/__fixtures__/auc-budget.xlsx
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/fmplus/budget/parsers/rich-auc-style.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRichAucStyleXlsx, isRichAucStyleWorkbook } from './rich-auc-style';

const FIXTURE = join(__dirname, '..', '__fixtures__', 'auc-budget.xlsx');

describe('parseRichAucStyleXlsx', () => {
  it('detects AUC-style workbook by sheet names', async () => {
    const buf = readFileSync(FIXTURE);
    expect(await isRichAucStyleWorkbook(buf)).toBe(true);
  });

  it('extracts manning lines from the Total Manning sheet', async () => {
    const buf = readFileSync(FIXTURE);
    const result = await parseRichAucStyleXlsx(buf, { project: 'AUC' });
    expect(result.errors).toHaveLength(0);
    const manningHigh = result.rows.filter(r =>
      r.category === 'manning' && r.season === 'high',
    );
    expect(manningHigh.length).toBeGreaterThan(0);
    const hkMgr = manningHigh.find(r => r.line_code === 'hk_manager');
    expect(hkMgr).toBeDefined();
  });

  it('totals reconcile with sheet Grand Total within 0.5%', async () => {
    const buf = readFileSync(FIXTURE);
    const result = await parseRichAucStyleXlsx(buf, { project: 'AUC' });
    // High-season monthly manning total per AUC sheet ≈ 2,466,250
    const hiManningSum = result.rows
      .filter(r => r.category === 'manning' && r.season === 'high')
      .reduce((s, r) => s + r.qty * r.unit_cost, 0);
    const expected = 2_466_250;
    const drift = Math.abs(hiManningSum - expected) / expected;
    expect(drift).toBeLessThan(0.005);
  });
});
```

- [ ] **Step 3: Run — verify failure**

Run: `npx vitest run src/lib/fmplus/budget/parsers/rich-auc-style.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement parser**

Create `src/lib/fmplus/budget/parsers/rich-auc-style.ts`:

```typescript
import ExcelJS from 'exceljs';
import type { FlatRow } from './flat-template';

const SHEET_NAME_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /Total\s+Manning/i,            category: 'manning'     },
  { pattern: /Total\s+Equipment/i,          category: 'tools'       },
  { pattern: /Total\s+Tools(?!.*Equipment)/i, category: 'tools'     },
  { pattern: /Total\s+Consumables/i,        category: 'consumables' },
  { pattern: /Total\s+Transportation/i,     category: 'transport'   },
  { pattern: /Total\s+IT/i,                 category: 'it'          },
];

const SUB_LOCATION_HEADERS: Array<{ keyword: string; sub_location: string }> = [
  { keyword: 'INNER',              sub_location: 'NC Inner Campus' },
  { keyword: 'OUTER',              sub_location: 'Outer Campus' },
  { keyword: 'OFF CAMPUS',         sub_location: 'NC Off-Campus Housing' },
  { keyword: 'MAADI',              sub_location: 'Maadi Buildings' },
];

const MANNING_LINE_LABELS: Array<{ label_pattern: RegExp; line_code: string }> = [
  { label_pattern: /^HK\s+Manager/i,           line_code: 'hk_manager' },
  { label_pattern: /^Ass\.?\s+Manager/i,       line_code: 'asst_manager' },
  { label_pattern: /Senior\s+Supervisor/i,     line_code: 'sr_supervisor' },
  { label_pattern: /^Supervisor\s+8H(?!\s*R)/i, line_code: 'sup_8h' },
  { label_pattern: /HK\s+Male\s*(&|and)\s*Female/i, line_code: 'hk_mf_8h' },
  { label_pattern: /Facades\s+Supervisor/i,    line_code: 'facades_sup' },
  { label_pattern: /Facades\s+Labor/i,         line_code: 'facades_lab' },
  { label_pattern: /Supervisor\s+Waste/i,      line_code: 'waste_sup' },
  { label_pattern: /Labor\s+Waste/i,           line_code: 'waste_lab' },
  { label_pattern: /^Admin/i,                  line_code: 'admin' },
  { label_pattern: /Storekeeper/i,             line_code: 'storekeeper' },
  { label_pattern: /Drivers?$/i,               line_code: 'driver' },
  { label_pattern: /^Trainer/i,                line_code: 'trainer' },
  { label_pattern: /Supervisor\s+8H\s+R/i,     line_code: 'sup_8h_r' },
  { label_pattern: /HK\s+Female\s+8H\s+R/i,    line_code: 'hk_f_8h_r' },
];

const TRANSPORT_LINE_LABELS: Array<{ label_pattern: RegExp; line_code: string }> = [
  { label_pattern: /^Bus/i,        line_code: 'bus' },
  { label_pattern: /^Microbus/i,   line_code: 'microbus' },
  { label_pattern: /Sidan|Sedan/i, line_code: 'sedan' },
  { label_pattern: /^Minivan/i,    line_code: 'minivan' },
  { label_pattern: /Pick.?up/i,    line_code: 'pickup' },
  { label_pattern: /Fuel|Fule/i,   line_code: 'fuel' },
];

export async function isRichAucStyleWorkbook(buf: Buffer | ArrayBuffer): Promise<boolean> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  const names = wb.worksheets.map(w => w.name);
  return SHEET_NAME_PATTERNS.some(p => names.some(n => p.pattern.test(n)));
}

export type RichParseResult = {
  rows: FlatRow[];
  errors: Array<{ sheet: string; row: number; message: string }>;
};

export async function parseRichAucStyleXlsx(
  buf: Buffer | ArrayBuffer,
  opts: { project: string },
): Promise<RichParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  const out: FlatRow[] = [];
  const errors: RichParseResult['errors'] = [];

  for (const ws of wb.worksheets) {
    const cat = SHEET_NAME_PATTERNS.find(p => p.pattern.test(ws.name))?.category;
    if (!cat) continue;
    if (cat === 'manning') {
      out.push(...parseManningSheet(ws, opts.project, errors));
    } else if (cat === 'transport') {
      out.push(...parseTransportSheet(ws, opts.project, errors));
    } else {
      out.push(...parseGenericCategorySheet(ws, cat, opts.project, errors));
    }
  }
  return { rows: out, errors };
}

function findSubLocationColumns(ws: ExcelJS.Worksheet): Array<{ sub_location: string; highCol: number; lowCol: number }> {
  const result: Array<{ sub_location: string; highCol: number; lowCol: number }> = [];
  for (let r = 1; r <= 6; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) {
      const v = String(row.getCell(c).value ?? '').toUpperCase();
      const found = SUB_LOCATION_HEADERS.find(s => v.includes(s.keyword));
      if (found) {
        result.push({ sub_location: found.sub_location, highCol: c, lowCol: c + 3 });
      }
    }
  }
  return result;
}

function parseManningSheet(
  ws: ExcelJS.Worksheet, project: string,
  errors: RichParseResult['errors'],
): FlatRow[] {
  const subs = findSubLocationColumns(ws);
  const rows: FlatRow[] = [];
  for (let r = 5; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const label = String(row.getCell(1).value ?? row.getCell(2).value ?? '').trim();
    if (!label) continue;
    const lineDef = MANNING_LINE_LABELS.find(l => l.label_pattern.test(label));
    if (!lineDef) continue;
    const ctc = Number(row.getCell(5).value ?? 0);
    if (!Number.isFinite(ctc) || ctc <= 0) continue;
    for (const sub of subs) {
      const high = Number(row.getCell(sub.highCol).value ?? 0);
      const low  = Number(row.getCell(sub.lowCol).value ?? 0);
      if (Number.isFinite(high) && high > 0) {
        rows.push({ project, service_line: 'hk', sub_location: sub.sub_location,
          category: 'manning', line_code: lineDef.line_code, season: 'high',
          qty: high, unit_cost: ctc, notes: null });
      }
      if (Number.isFinite(low) && low > 0) {
        rows.push({ project, service_line: 'hk', sub_location: sub.sub_location,
          category: 'manning', line_code: lineDef.line_code, season: 'low',
          qty: low, unit_cost: ctc, notes: null });
      }
    }
  }
  if (rows.length === 0) errors.push({ sheet: ws.name, row: 0, message: 'No manning rows extracted' });
  return rows;
}

function parseTransportSheet(
  ws: ExcelJS.Worksheet, project: string,
  errors: RichParseResult['errors'],
): FlatRow[] {
  const subs = findSubLocationColumns(ws);
  const rows: FlatRow[] = [];
  for (let r = 5; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const label = String(row.getCell(1).value ?? row.getCell(2).value ?? '').trim();
    if (!label) continue;
    const lineDef = TRANSPORT_LINE_LABELS.find(l => l.label_pattern.test(label));
    if (!lineDef) continue;
    const unitCost = Number(row.getCell(6).value ?? row.getCell(5).value ?? 0);
    if (!Number.isFinite(unitCost) || unitCost <= 0) continue;
    for (const sub of subs) {
      const high = Number(row.getCell(sub.highCol).value ?? 0);
      const low  = Number(row.getCell(sub.lowCol).value ?? 0);
      if (Number.isFinite(high) && high > 0) {
        rows.push({ project, service_line: 'hk', sub_location: sub.sub_location,
          category: 'transport', line_code: lineDef.line_code, season: 'high',
          qty: high, unit_cost: unitCost, notes: null });
      }
      if (Number.isFinite(low) && low > 0) {
        rows.push({ project, service_line: 'hk', sub_location: sub.sub_location,
          category: 'transport', line_code: lineDef.line_code, season: 'low',
          qty: low, unit_cost: unitCost, notes: null });
      }
    }
  }
  if (rows.length === 0) errors.push({ sheet: ws.name, row: 0, message: 'No transport rows extracted' });
  return rows;
}

function parseGenericCategorySheet(
  ws: ExcelJS.Worksheet, category: string, project: string,
  errors: RichParseResult['errors'],
): FlatRow[] {
  const subs = findSubLocationColumns(ws);
  const rows: FlatRow[] = [];
  for (let r = 5; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const label = String(row.getCell(1).value ?? row.getCell(2).value ?? '').trim();
    if (!label || /^total/i.test(label)) continue;
    const unitPrice = Number(row.getCell(6).value ?? row.getCell(5).value ?? 0);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;
    const depRaw = Number(row.getCell(5).value ?? 0);
    const depMonths = Number.isFinite(depRaw) && depRaw > 0 ? depRaw : 1;
    const lineCode = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'item';
    for (const sub of subs) {
      const high = Number(row.getCell(sub.highCol).value ?? 0);
      const low  = Number(row.getCell(sub.lowCol).value ?? 0);
      if (Number.isFinite(high) && high > 0) {
        rows.push({ project, service_line: 'hk', sub_location: sub.sub_location,
          category, line_code: lineCode, season: 'high',
          qty: high, unit_cost: unitPrice / depMonths, notes: null });
      }
      if (Number.isFinite(low) && low > 0) {
        rows.push({ project, service_line: 'hk', sub_location: sub.sub_location,
          category, line_code: lineCode, season: 'low',
          qty: low, unit_cost: unitPrice / depMonths, notes: null });
      }
    }
  }
  if (rows.length === 0) errors.push({ sheet: ws.name, row: 0, message: `No rows extracted for ${category}` });
  return rows;
}
```

- [ ] **Step 5: Run — verify pass**

Run: `npx vitest run src/lib/fmplus/budget/parsers/rich-auc-style.test.ts`
Expected: PASS — 3 tests. Reconciliation drift < 0.5%.

If reconciliation fails (drift exceeded), the column offsets in `findSubLocationColumns` need adjustment. Inspect the actual XLSX with a small debug script that prints `row 4 / row 5 / row 6` of the Manning sheet showing the cell values for cols A-Z, then adjust the `highCol`/`lowCol` offsets in the helper. Re-run until drift < 0.5%.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fmplus/budget/parsers/rich-auc-style.ts src/lib/fmplus/budget/parsers/rich-auc-style.test.ts src/lib/fmplus/budget/__fixtures__/auc-budget.xlsx
git commit -m "feat(fmplus): Path A rich AUC-style XLSX parser + fixture"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 11: Atomic commit — `commitBudget()` transaction

**Files:**
- Create: `src/lib/fmplus/budget/commit.ts`
- Create: `src/lib/fmplus/budget/commit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/fmplus/budget/commit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { groupRowsBySegment } from './commit';

describe('groupRowsBySegment', () => {
  it('groups flat rows by service_line and computes summary counts', () => {
    const rows = [
      { project: 'AUC', service_line: 'hk', sub_location: 'A',
        category: 'manning', line_code: 'hk_manager', season: 'high' as const,
        qty: 1, unit_cost: 1000, notes: null },
      { project: 'AUC', service_line: 'hk', sub_location: 'A',
        category: 'manning', line_code: 'hk_manager', season: 'low' as const,
        qty: 1, unit_cost: 1000, notes: null },
      { project: 'AUC', service_line: 'mep', sub_location: null,
        category: 'overhead', line_code: 'oh', season: 'high' as const,
        qty: 1, unit_cost: 500, notes: null },
    ];
    const grouped = groupRowsBySegment(rows);
    expect(grouped.size).toBe(2);
    expect(grouped.get('hk')!.length).toBe(2);
    expect(grouped.get('mep')!.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `npx vitest run src/lib/fmplus/budget/commit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/fmplus/budget/commit.ts`:

```typescript
import { supabaseAdmin } from '@/lib/supabase';
import type { FlatRow } from './parsers/flat-template';
import type { Scenario, ServiceLine } from './schema';
import { getLatestTemplate } from './templates';

export function groupRowsBySegment(rows: FlatRow[]): Map<ServiceLine, FlatRow[]> {
  const out = new Map<ServiceLine, FlatRow[]>();
  for (const r of rows) {
    const key = r.service_line as ServiceLine;
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(r);
  }
  return out;
}

export type CommitOpts = {
  projectId: number;
  fiscalYear: number;
  scenario: Scenario;
  startMonth: number;
  rows: FlatRow[];
  publishedBy?: string | null;
  publish?: boolean;
  notes?: string | null;
};

export type CommitResult = {
  budgetId: number;
  segmentsUpserted: Array<{ service_line: ServiceLine; segment_id: number; lines: number }>;
  status: 'draft' | 'published';
};

export async function commitBudget(opts: CommitOpts): Promise<CommitResult> {
  const sb = supabaseAdmin();
  const { projectId, fiscalYear, scenario, startMonth, rows, publishedBy, notes } = opts;
  const publish = opts.publish === true;

  // Upsert project_budgets row.
  const { data: existing } = await sb
    .from('project_budgets')
    .select('id, status')
    .eq('project_id', projectId)
    .eq('fiscal_year', fiscalYear)
    .eq('scenario', scenario)
    .maybeSingle();

  let budgetId: number;
  let status: 'draft' | 'published';
  if (existing) {
    const e = existing as { id: number; status: 'draft' | 'published' };
    budgetId = e.id;
    status = publish ? 'published' : e.status;
    const updates: Record<string, unknown> = {
      start_month: startMonth, notes: notes ?? null,
      updated_at: new Date().toISOString(),
    };
    if (publish) {
      updates.status = 'published';
      updates.published_at = new Date().toISOString();
      updates.published_by = publishedBy ?? null;
    }
    await sb.from('project_budgets').update(updates).eq('id', budgetId);
  } else {
    const insertRow: Record<string, unknown> = {
      project_id: projectId, fiscal_year: fiscalYear, scenario,
      start_month: startMonth, notes: notes ?? null,
      status: publish ? 'published' : 'draft',
    };
    if (publish) {
      insertRow.published_at = new Date().toISOString();
      insertRow.published_by = publishedBy ?? null;
    }
    const { data: ins, error } = await sb
      .from('project_budgets').insert(insertRow).select('id, status').single();
    if (error || !ins) throw new Error(`Failed to create budget: ${error?.message}`);
    budgetId = (ins as { id: number }).id;
    status = (ins as { status: 'draft'|'published' }).status;
  }

  // For each service_line in rows, upsert segment + replace lines.
  const grouped = groupRowsBySegment(rows);
  const summary: CommitResult['segmentsUpserted'] = [];
  for (const [serviceLine, segRows] of grouped.entries()) {
    const tpl = getLatestTemplate(serviceLine);
    const { data: segExisting } = await sb
      .from('project_budget_segments')
      .select('id')
      .eq('budget_id', budgetId)
      .eq('service_line', serviceLine)
      .maybeSingle();
    let segmentId: number;
    if (segExisting) {
      segmentId = (segExisting as { id: number }).id;
      // Wipe previous lines for this segment.
      await sb.from('budget_lines').delete().eq('segment_id', segmentId);
    } else {
      const { data: segIns, error: segErr } = await sb
        .from('project_budget_segments')
        .insert({ budget_id: budgetId, service_line: serviceLine, template_version: tpl.version })
        .select('id').single();
      if (segErr || !segIns) throw new Error(`Failed to create segment: ${segErr?.message}`);
      segmentId = (segIns as { id: number }).id;
    }
    if (segRows.length > 0) {
      const lineRows = segRows.map(r => ({
        segment_id: segmentId, sub_location: r.sub_location,
        category: r.category, line_code: r.line_code, season: r.season,
        qty: r.qty, unit_cost: r.unit_cost, notes: r.notes,
      }));
      await sb.from('budget_lines').insert(lineRows);
    }
    summary.push({ service_line: serviceLine, segment_id: segmentId, lines: segRows.length });
  }

  return { budgetId, segmentsUpserted: summary, status };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run src/lib/fmplus/budget/commit.test.ts`
Expected: PASS — 1 test (groupRowsBySegment). The DB-touching `commitBudget` is verified by integration in Task 26.

- [ ] **Step 5: Verify build still passes**

Run: `npm run build`
Expected: completes with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fmplus/budget/commit.ts src/lib/fmplus/budget/commit.test.ts
git commit -m "feat(fmplus): commitBudget — atomic per-segment line replacement"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

## Phase 4 — UI: Routes + Editor (Tasks 12-15)

### Task 12: Section layout, sub-tab strip, period control component

**Files:**
- Create: `src/app/fmplus/financial/budget/layout.tsx`
- Create: `src/app/fmplus/financial/budget/_components/sub-tabs.tsx`
- Create: `src/app/fmplus/financial/budget/_components/period-control.tsx`
- Create: `src/app/fmplus/financial/budget/_components/health-dot.tsx`

- [ ] **Step 1: Write `layout.tsx`**

Create `src/app/fmplus/financial/budget/layout.tsx`:

```tsx
import { TopNav } from '@/app/_components/brand';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { SubTabs } from './_components/sub-tabs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default function BudgetSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav>
        <Link href="/fmplus" className="ix-link">FMPLUS</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/fmplus/financial" className="ix-link">Financial</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Project Budget</span>
      </TopNav>
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-amber-700 font-medium">FMPLUS · Financial</p>
          <h1 className="text-3xl font-bold tracking-tight">Project Budget</h1>
        </header>
        <SubTabs />
        {children}
      </main>
    </>
  );
}
```

- [ ] **Step 2: Write `_components/sub-tabs.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Pencil, Upload, BarChart3, GitCompareArrows, Settings } from 'lucide-react';

const TABS = [
  { href: '/fmplus/financial/budget',          label: 'Overview',  Icon: LayoutDashboard,    exact: true },
  { href: '/fmplus/financial/budget/edit',     label: 'Editor',    Icon: Pencil,             exact: false },
  { href: '/fmplus/financial/budget/import',   label: 'Import',    Icon: Upload,             exact: false },
  { href: '/fmplus/financial/budget/variance', label: 'Variance',  Icon: BarChart3,          exact: false },
  { href: '/fmplus/financial/budget/compare',  label: 'Compare',   Icon: GitCompareArrows,   exact: false },
  { href: '/fmplus/financial/budget/settings', label: 'Settings',  Icon: Settings,           exact: false },
];

export function SubTabs() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
      {TABS.map(t => {
        const active = t.exact ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              'flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ' +
              (active
                ? 'border-amber-600 text-amber-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')
            }
          >
            <t.Icon size={14} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Write `_components/period-control.tsx`**

```tsx
'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export function PeriodControl({
  yearOptions = [2025, 2026, 2027],
  scenarioOptions = ['initial', 'revised', 'reforecast'] as const,
  showThrough = true,
}: {
  yearOptions?: number[];
  scenarioOptions?: readonly ('initial' | 'revised' | 'reforecast')[];
  showThrough?: boolean;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const year = Number(sp.get('year') ?? new Date().getUTCFullYear());
  const scenario = sp.get('scenario') ?? 'initial';
  const through = sp.get('through') ?? String(new Date().getUTCMonth() + 1);

  const update = (k: string, v: string) => {
    const params = new URLSearchParams(sp);
    params.set(k, v);
    router.push(`${path}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
              value={year} onChange={e => update('year', e.target.value)}>
        {yearOptions.map(y => <option key={y} value={y}>{`FY ${y}`}</option>)}
      </select>
      <select className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
              value={scenario} onChange={e => update('scenario', e.target.value)}>
        {scenarioOptions.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
      </select>
      {showThrough && (
        <select className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
                value={through} onChange={e => update('through', e.target.value)}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{`YTD ${new Date(2000, m-1, 1).toLocaleString('en', { month: 'short' })}`}</option>
          ))}
        </select>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `_components/health-dot.tsx`**

```tsx
import type { VarianceColor } from '@/lib/fmplus/budget/types';

const COLORS: Record<VarianceColor, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red:   'bg-rose-500',
};

export function HealthDot({ color, title }: { color: VarianceColor; title?: string }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${COLORS[color]}`} title={title} />;
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: completes with no errors. Visit http://localhost:3000/fmplus/financial/budget — page renders skeleton with sub-tabs and breadcrumb (Overview content stub follows in Task 13).

- [ ] **Step 6: Commit**

```bash
git add src/app/fmplus/financial/budget/layout.tsx src/app/fmplus/financial/budget/_components/
git commit -m "feat(fmplus): /financial/budget section layout + sub-tabs + period control"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 13: Overview page

**Files:**
- Create: `src/app/fmplus/financial/budget/page.tsx`
- Create: `src/app/fmplus/financial/budget/_components/anomaly-banner.tsx`
- Create: `src/lib/fmplus/budget/portfolio.ts`

- [ ] **Step 1: Write `portfolio.ts` — list every project's variance summary**

Create `src/lib/fmplus/budget/portfolio.ts`:

```typescript
import { supabaseAdmin } from '@/lib/supabase';
import { buildBudgetVariance } from './variance';
import type { BudgetVarianceReport, ServiceLine } from './types';
import type { Scenario } from './schema';

export type PortfolioRow = {
  project_id: number;
  project_name: string;
  plan_label: string | null;
  service_lines: ServiceLine[];
  budget_ytd: number;
  actual_ytd: number;
  variance: number;
  variance_pct: number | null;
  status: 'draft' | 'published';
  health_color: 'green' | 'amber' | 'red';
};

export async function buildPortfolio(opts: {
  fiscalYear: number;
  scenario: Scenario;
  ytdThrough?: number;
  serviceLineFilter?: ServiceLine | null;
}): Promise<{ rows: PortfolioRow[]; totals: { budget: number; actual: number; variance: number; variance_pct: number | null }; missing: Array<{ project_id: number; project_name: string }> }> {
  const sb = supabaseAdmin();
  const { data: budgets } = await sb
    .from('project_budgets')
    .select('id, project_id, status, fiscal_year, scenario')
    .eq('fiscal_year', opts.fiscalYear)
    .eq('scenario', opts.scenario);
  const list = (budgets ?? []) as Array<{ id: number; project_id: number; status: 'draft'|'published' }>;
  const rows: PortfolioRow[] = [];
  let totalBudget = 0, totalActual = 0;
  for (const b of list) {
    const v = await buildBudgetVariance({
      projectId: b.project_id, fiscalYear: opts.fiscalYear,
      scenario: opts.scenario, ytdThrough: opts.ytdThrough,
    });
    if (!v) continue;
    if (opts.serviceLineFilter && !v.segments.some(s => s.service_line === opts.serviceLineFilter)) continue;
    const { data: aa } = await sb
      .from('odoo_analytic_accounts').select('plan_id').eq('id', v.project_id).maybeSingle();
    const planId = (aa as { plan_id: number | null } | null)?.plan_id;
    let planLabel: string | null = null;
    if (planId) {
      const { data: pl } = await sb.from('odoo_analytic_plans').select('name').eq('id', planId).maybeSingle();
      planLabel = (pl as { name: string } | null)?.name ?? null;
    }
    totalBudget += v.ytd.budget;
    totalActual += v.ytd.actual;
    rows.push({
      project_id: v.project_id, project_name: v.project_name,
      plan_label: planLabel,
      service_lines: v.segments.map(s => s.service_line),
      budget_ytd: v.ytd.budget, actual_ytd: v.ytd.actual,
      variance: v.ytd.variance, variance_pct: v.ytd.variance_pct,
      status: v.status, health_color: v.ytd.color,
    });
  }
  rows.sort((a, b) => Math.abs(b.variance_pct ?? 0) - Math.abs(a.variance_pct ?? 0));
  const totals = {
    budget: totalBudget, actual: totalActual,
    variance: totalActual - totalBudget,
    variance_pct: totalBudget === 0 ? null : ((totalActual - totalBudget) / totalBudget) * 100,
  };

  // "Action needed" — analytic accounts with HK Projects plan but no budget for this FY
  const { data: hkProjects } = await sb
    .from('odoo_analytic_accounts')
    .select('id, name, root_plan_id, odoo_analytic_plans!inner(name)')
    .eq('active', true);
  type AA = { id: number; name: string; odoo_analytic_plans: { name: string } };
  const allHk = ((hkProjects ?? []) as AA[]).filter(a => /HK Projects/i.test(a.odoo_analytic_plans.name));
  const budgetedIds = new Set(rows.map(r => r.project_id));
  const missing = allHk
    .filter(a => !budgetedIds.has(a.id))
    .map(a => ({ project_id: a.id, project_name: a.name }));

  return { rows, totals, missing };
}
```

- [ ] **Step 2: Write the Overview `page.tsx`**

Create `src/app/fmplus/financial/budget/page.tsx`:

```tsx
import Link from 'next/link';
import { buildPortfolio } from '@/lib/fmplus/budget/portfolio';
import { PeriodControl } from './_components/period-control';
import { HealthDot } from './_components/health-dot';
import { AnomalyBanner } from './_components/anomaly-banner';
import type { Scenario } from '@/lib/fmplus/budget/schema';
import type { ServiceLine } from '@/lib/fmplus/budget/types';

export default async function BudgetOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; scenario?: string; through?: string; service_line?: string }>;
}) {
  const sp = await searchParams;
  const year = Number(sp.year ?? new Date().getUTCFullYear());
  const scenario = (sp.scenario ?? 'initial') as Scenario;
  const through = Number(sp.through ?? new Date().getUTCMonth() + 1);
  const sl = (sp.service_line ?? '') as ServiceLine | '';

  const { rows, totals, missing } = await buildPortfolio({
    fiscalYear: year, scenario, ytdThrough: through,
    serviceLineFilter: sl === '' ? null : sl,
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PeriodControl />
        <select
          className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
          defaultValue={sl} name="service_line"
          onChange={e => { window.location.search = (() => { const u = new URLSearchParams(window.location.search); u.set('service_line', e.target.value); return u.toString(); })(); }}
        >
          <option value="">All service lines</option>
          <option value="hk">Housekeeping</option>
          <option value="mep">MEP</option>
          <option value="landscape">Landscape</option>
          <option value="security">Security</option>
          <option value="pest_ctrl">Pest Control</option>
          <option value="waste_mgmt">Waste Management</option>
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Projects budgeted" value={String(rows.length)} />
        <KpiTile label="YTD budget" value={fmt(totals.budget)} />
        <KpiTile label="YTD actual" value={fmt(totals.actual)} />
        <KpiTile label="Portfolio variance" value={fmtPct(totals.variance_pct)} accent />
      </div>

      <AnomalyBanner rows={rows} />

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800 text-left">
            <th className="p-2 border-b border-slate-200 dark:border-slate-700">Project</th>
            <th className="p-2 border-b border-slate-200 dark:border-slate-700">Plan</th>
            <th className="p-2 border-b border-slate-200 dark:border-slate-700">Services</th>
            <th className="p-2 border-b border-slate-200 dark:border-slate-700 text-right">Budget YTD</th>
            <th className="p-2 border-b border-slate-200 dark:border-slate-700 text-right">Actual YTD</th>
            <th className="p-2 border-b border-slate-200 dark:border-slate-700 text-right">Var</th>
            <th className="p-2 border-b border-slate-200 dark:border-slate-700 text-right">Var %</th>
            <th className="p-2 border-b border-slate-200 dark:border-slate-700 text-center">Health</th>
            <th className="p-2 border-b border-slate-200 dark:border-slate-700">Status</th>
          </tr>
        </thead>
        <tbody className="font-variant-numeric tabular-nums">
          {rows.map(r => (
            <tr key={r.project_id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="p-2">
                <Link href={`/fmplus/financial/budget/variance?project=${r.project_id}&year=${year}&scenario=${scenario}&through=${through}`}
                      className="font-semibold text-amber-700 hover:underline">{r.project_name}</Link>
              </td>
              <td className="p-2 text-slate-500">{r.plan_label ?? '—'}</td>
              <td className="p-2">
                {r.service_lines.map(s => <span key={s} className="inline-block px-2 py-0.5 mr-1 text-[10px] rounded-full border border-amber-300 text-amber-700">{s}</span>)}
              </td>
              <td className="p-2 text-right">{fmt(r.budget_ytd)}</td>
              <td className="p-2 text-right">{fmt(r.actual_ytd)}</td>
              <td className={`p-2 text-right ${r.variance > 0 ? 'text-rose-600' : r.variance < 0 ? 'text-emerald-700' : ''}`}>{fmt(r.variance)}</td>
              <td className={`p-2 text-right ${r.health_color === 'red' ? 'text-rose-600' : r.health_color === 'amber' ? 'text-amber-600' : 'text-emerald-700'}`}>{fmtPct(r.variance_pct)}</td>
              <td className="p-2 text-center"><HealthDot color={r.health_color} title={r.health_color} /></td>
              <td className="p-2 text-slate-500 capitalize">{r.status}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={9} className="p-6 text-center text-slate-500">No budgets for this filter. Use the Editor or Import tab to create one.</td></tr>
          )}
        </tbody>
      </table>

      {missing.length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <h2 className="text-sm font-semibold mb-2">Action needed — HK projects without a budget for FY {year}</h2>
          <ul className="text-sm space-y-1">
            {missing.map(m => (
              <li key={m.project_id} className="flex items-center justify-between">
                <span>{m.project_name}</span>
                <Link href={`/fmplus/financial/budget/edit?project=${m.project_id}&year=${year}&scenario=${scenario}`}
                      className="text-amber-700 hover:underline">Create budget →</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function KpiTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${accent ? 'border-l-4 border-amber-500' : ''} bg-slate-50 dark:bg-slate-800`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(n);
}
function fmtPct(p: number | null): string {
  if (p == null) return '—';
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}
```

- [ ] **Step 3: Write `_components/anomaly-banner.tsx`**

```tsx
import type { PortfolioRow } from '@/lib/fmplus/budget/portfolio';

export function AnomalyBanner({ rows }: { rows: PortfolioRow[] }) {
  const flagged = rows
    .filter(r => r.variance_pct != null && Math.abs(r.variance_pct) > 15)
    .slice(0, 3);
  if (flagged.length === 0) return null;
  return (
    <div className="rounded border-l-4 border-rose-500 bg-rose-50 dark:bg-rose-900/20 p-3 text-sm">
      <strong className="text-rose-700 dark:text-rose-300">⚠ Anomaly detector</strong>
      {' — '}
      {flagged.length} project{flagged.length === 1 ? '' : 's'} deviating &gt;15% from budget:&nbsp;
      {flagged.map((r, i) => (
        <span key={r.project_id}>
          <strong>{r.project_name}</strong>
          {' '}
          <span className={r.variance > 0 ? 'text-rose-700' : 'text-emerald-700'}>
            ({r.variance_pct! > 0 ? '+' : ''}{r.variance_pct!.toFixed(0)}%)
          </span>
          {i < flagged.length - 1 ? ', ' : ''}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify build + smoke test**

Run: `npm run build`
Expected: completes with no errors.

Run dev: `npm run dev` and visit `/fmplus/financial/budget`. With no budgets seeded yet, expect: KPI tiles all zero, empty table with "No budgets for this filter" message, "Action needed" list populated with all HK Projects from Odoo (22 entries — AUC, Marassi, MBZ, etc.).

- [ ] **Step 5: Commit**

```bash
git add src/app/fmplus/financial/budget/page.tsx src/app/fmplus/financial/budget/_components/anomaly-banner.tsx src/lib/fmplus/budget/portfolio.ts
git commit -m "feat(fmplus): Overview tab — portfolio table, KPI tiles, anomaly banner, action-needed"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 14: Editor — project + service-line + scenario picker, form scaffold

**Files:**
- Create: `src/app/fmplus/financial/budget/edit/page.tsx`
- Create: `src/app/fmplus/financial/budget/edit/_components/project-picker.tsx`
- Create: `src/app/fmplus/financial/budget/edit/_components/service-line-picker.tsx`
- Create: `src/app/fmplus/financial/budget/edit/_components/editor-form.tsx`
- Create: `src/app/fmplus/financial/budget/edit/_components/category-block.tsx`

- [ ] **Step 1: Write `edit/page.tsx` — server component shell**

Create `src/app/fmplus/financial/budget/edit/page.tsx`:

```tsx
import { supabaseAdmin } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { ProjectPicker } from './_components/project-picker';
import { ServiceLinePicker } from './_components/service-line-picker';
import { EditorForm } from './_components/editor-form';
import { getTemplate } from '@/lib/fmplus/budget/templates';
import type { ServiceLine } from '@/lib/fmplus/budget/types';
import type { Scenario } from '@/lib/fmplus/budget/schema';
import { ServiceLineSchema, ScenarioSchema } from '@/lib/fmplus/budget/schema';

export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; year?: string; scenario?: string; service_line?: string }>;
}) {
  const sp = await searchParams;
  const projectId = Number(sp.project ?? 0);
  const year = Number(sp.year ?? new Date().getUTCFullYear());
  const scenarioParse = ScenarioSchema.safeParse(sp.scenario ?? 'initial');
  const scenario: Scenario = scenarioParse.success ? scenarioParse.data : 'initial';
  const slParse = ServiceLineSchema.safeParse(sp.service_line);
  const serviceLine: ServiceLine | null = slParse.success ? slParse.data : null;

  const sb = supabaseAdmin();

  if (!projectId) {
    const { data: projects } = await sb
      .from('odoo_analytic_accounts')
      .select(`id, name, plan_id, odoo_analytic_plans!inner(name)`)
      .eq('active', true)
      .order('name');
    type AA = { id: number; name: string; odoo_analytic_plans: { name: string } };
    return <ProjectPicker projects={(projects ?? []) as AA[]} year={year} scenario={scenario} />;
  }

  const { data: project } = await sb
    .from('odoo_analytic_accounts')
    .select('id, name, balance, plan_id, odoo_analytic_plans!inner(name)')
    .eq('id', projectId).maybeSingle();
  if (!project) redirect('/fmplus/financial/budget/edit');

  if (!serviceLine) {
    return <ServiceLinePicker
      projectId={projectId}
      projectName={(project as { name: string }).name}
      year={year} scenario={scenario}
    />;
  }

  const tpl = getTemplate(serviceLine, 1);
  const { data: budget } = await sb
    .from('project_budgets')
    .select('id, status, start_month, notes')
    .eq('project_id', projectId).eq('fiscal_year', year).eq('scenario', scenario)
    .maybeSingle();
  let segmentLines: Array<{ sub_location: string | null; category: string; line_code: string; season: 'high'|'low'; qty: number; unit_cost: number; notes: string | null }> = [];
  let budgetId: number | null = null;
  let segmentId: number | null = null;
  let status: 'draft' | 'published' = 'draft';
  let startMonth = 1;
  if (budget) {
    const b = budget as { id: number; status: 'draft'|'published'; start_month: number; notes: string | null };
    budgetId = b.id; status = b.status; startMonth = b.start_month;
    const { data: seg } = await sb
      .from('project_budget_segments').select('id').eq('budget_id', b.id).eq('service_line', serviceLine).maybeSingle();
    if (seg) {
      segmentId = (seg as { id: number }).id;
      const { data: lines } = await sb
        .from('budget_lines')
        .select('sub_location, category, line_code, season, qty, unit_cost, notes')
        .eq('segment_id', segmentId);
      segmentLines = (lines ?? []) as typeof segmentLines;
    }
  }

  return (
    <EditorForm
      projectId={projectId}
      projectName={(project as { name: string }).name}
      year={year}
      scenario={scenario}
      serviceLine={serviceLine}
      template={tpl}
      budgetId={budgetId}
      status={status}
      startMonth={startMonth}
      initialLines={segmentLines}
    />
  );
}
```

- [ ] **Step 2: Write `_components/project-picker.tsx`**

```tsx
import Link from 'next/link';
import type { Scenario } from '@/lib/fmplus/budget/schema';

export function ProjectPicker({
  projects, year, scenario,
}: {
  projects: Array<{ id: number; name: string; odoo_analytic_plans: { name: string } }>;
  year: number; scenario: Scenario;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Pick a project</h2>
      <p className="text-sm text-slate-500">Each project = one Odoo analytic account. Multi-service projects (e.g. R3) carry one segment per service line.</p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {projects.map(p => (
          <li key={p.id}>
            <Link href={`/fmplus/financial/budget/edit?project=${p.id}&year=${year}&scenario=${scenario}`}
                  className="block p-3 border border-slate-200 dark:border-slate-700 rounded hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20">
              <div className="font-semibold">{p.name}</div>
              <div className="text-xs text-slate-500">{p.odoo_analytic_plans.name}</div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Write `_components/service-line-picker.tsx`**

```tsx
import Link from 'next/link';
import { SERVICE_LINE_CATALOG } from '@/lib/fmplus/budget/templates';
import type { Scenario } from '@/lib/fmplus/budget/schema';

export function ServiceLinePicker({ projectId, projectName, year, scenario }: {
  projectId: number; projectName: string; year: number; scenario: Scenario;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{projectName} — pick service line</h2>
      <p className="text-sm text-slate-500">A project can carry one or more service lines; each gets its own segment in the budget.</p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {SERVICE_LINE_CATALOG.map(sl => (
          <li key={sl.code}>
            <Link href={`/fmplus/financial/budget/edit?project=${projectId}&year=${year}&scenario=${scenario}&service_line=${sl.code}`}
                  className={`block p-3 border rounded ${sl.template_status === 'ready' ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 hover:border-amber-600' : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'}`}>
              <div className="flex items-center justify-between">
                <div className="font-semibold">{sl.label}</div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sl.template_status === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                  {sl.template_status === 'ready' ? 'Ready' : 'Stub'}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1">{sl.odoo_plan_hint}</div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Write `_components/category-block.tsx` — one collapsible category**

```tsx
'use client';
import { useState } from 'react';

export type LineRow = {
  sub_location: string | null;
  line_code: string;
  line_label: string;
  season: 'high' | 'low';
  qty: number;
  unit_cost: number;
};

export function CategoryBlock({
  category, label, subLocations, seasons, lineDefs,
  rowsByKey, onChange,
}: {
  category: string;
  label: string;
  subLocations: string[];        // empty array = no sub-location dimension
  seasons: ('high'|'low')[];
  lineDefs: Array<{ code: string; label: string }>;
  rowsByKey: Map<string, { qty: number; unit_cost: number }>;
  onChange: (key: string, qty: number, unit_cost: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const subs = subLocations.length === 0 ? [null] : subLocations;
  return (
    <section className="border border-slate-200 dark:border-slate-700 rounded">
      <button type="button" onClick={() => setOpen(o => !o)}
              className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800">
        <span className="font-semibold">{label}</span>
        <span className="text-xs text-slate-500">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="p-3 overflow-x-auto">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr className="text-left">
                <th className="p-1 border-b border-slate-200 dark:border-slate-700">Line</th>
                <th className="p-1 border-b border-slate-200 dark:border-slate-700">Sub-location</th>
                <th className="p-1 border-b border-slate-200 dark:border-slate-700">Season</th>
                <th className="p-1 border-b border-slate-200 dark:border-slate-700 text-right">Qty</th>
                <th className="p-1 border-b border-slate-200 dark:border-slate-700 text-right">Unit cost</th>
                <th className="p-1 border-b border-slate-200 dark:border-slate-700 text-right">Monthly</th>
              </tr>
            </thead>
            <tbody className="font-variant-numeric tabular-nums">
              {lineDefs.flatMap(line => subs.flatMap(sub => seasons.map(season => {
                const key = `${category}|${line.code}|${sub ?? ''}|${season}`;
                const cur = rowsByKey.get(key) ?? { qty: 0, unit_cost: 0 };
                const monthly = cur.qty * cur.unit_cost;
                return (
                  <tr key={key} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="p-1">{line.label}</td>
                    <td className="p-1 text-slate-500">{sub ?? '—'}</td>
                    <td className="p-1 text-slate-500">{season}</td>
                    <td className="p-1 text-right">
                      <input type="number" step="0.01" min="0" defaultValue={cur.qty}
                             onBlur={e => onChange(key, Number(e.currentTarget.value), cur.unit_cost)}
                             className="w-20 text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" />
                    </td>
                    <td className="p-1 text-right">
                      <input type="number" step="0.01" min="0" defaultValue={cur.unit_cost}
                             onBlur={e => onChange(key, cur.qty, Number(e.currentTarget.value))}
                             className="w-24 text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" />
                    </td>
                    <td className="p-1 text-right text-slate-700 dark:text-slate-300">{monthly.toFixed(2)}</td>
                  </tr>
                );
              })))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Write `_components/editor-form.tsx` — top-level form orchestrator (client)**

```tsx
'use client';
import { useState, useTransition } from 'react';
import type { Template } from '@/lib/fmplus/budget/templates';
import type { Scenario } from '@/lib/fmplus/budget/schema';
import type { ServiceLine } from '@/lib/fmplus/budget/types';
import { CategoryBlock } from './category-block';
import { saveBudgetAction, publishBudgetAction } from '../actions';

export function EditorForm({
  projectId, projectName, year, scenario, serviceLine,
  template, budgetId, status, startMonth, initialLines,
}: {
  projectId: number; projectName: string; year: number; scenario: Scenario;
  serviceLine: ServiceLine; template: Template;
  budgetId: number | null; status: 'draft' | 'published'; startMonth: number;
  initialLines: Array<{ sub_location: string | null; category: string; line_code: string; season: 'high'|'low'; qty: number; unit_cost: number; notes: string | null }>;
}) {
  const initialMap = new Map<string, { qty: number; unit_cost: number }>();
  for (const l of initialLines) {
    initialMap.set(`${l.category}|${l.line_code}|${l.sub_location ?? ''}|${l.season}`, { qty: l.qty, unit_cost: l.unit_cost });
  }
  const [rows, setRows] = useState(initialMap);
  const [sm, setSm] = useState(startMonth);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (template.is_stub) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{projectName} · {template.service_line.toUpperCase()}</h2>
        <div className="rounded border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm">
          <strong>{template.service_line.toUpperCase()} template not yet defined.</strong> Drop the budget sheet for this service line in <code>FMPLUS/</code> and ping the team — once baked, you can come back and edit. A placeholder segment will be created if you save now (allowing variance to surface unmapped Odoo costs in Settings).
        </div>
      </section>
    );
  }

  const onChange = (key: string, qty: number, unit_cost: number) => {
    setRows(prev => {
      const next = new Map(prev);
      next.set(key, { qty, unit_cost });
      return next;
    });
  };

  const buildPayload = () => {
    const out: Array<{ sub_location: string | null; category: string; line_code: string; season: 'high'|'low'; qty: number; unit_cost: number }> = [];
    for (const [key, val] of rows.entries()) {
      const [category, line_code, subRaw, season] = key.split('|');
      if (val.qty === 0 && val.unit_cost === 0) continue;
      out.push({ sub_location: subRaw === '' ? null : subRaw,
                 category, line_code, season: season as 'high'|'low',
                 qty: val.qty, unit_cost: val.unit_cost });
    }
    return out;
  };

  const submit = (publish: boolean) => {
    const lines = buildPayload();
    startTransition(async () => {
      const action = publish ? publishBudgetAction : saveBudgetAction;
      const res = await action({
        projectId, year, scenario, serviceLine,
        startMonth: sm, lines,
      });
      setMsg(res.ok ? `${publish ? 'Published' : 'Draft saved'} · ${res.linesWritten} lines` : `Error: ${res.error}`);
    });
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{projectName} · {template.service_line.toUpperCase()}</h2>
          <p className="text-xs text-slate-500">FY {year} · Scenario: {scenario} · Status: <span className="capitalize">{status}</span></p>
        </div>
        <label className="text-sm">Start month:&nbsp;
          <select value={sm} onChange={e => setSm(Number(e.target.value))}
                  className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
              <option key={m} value={m}>{new Date(2000, m-1, 1).toLocaleString('en', { month: 'long' })}</option>)}
          </select>
        </label>
      </header>
      {status === 'published' && (
        <div className="rounded border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs">
          You're editing a <strong>published</strong> budget. Changes save immediately and are written to the audit log.
        </div>
      )}
      {template.schema_json.categories.map(c => (
        <CategoryBlock
          key={c.code}
          category={c.code}
          label={c.label}
          subLocations={template.schema_json.sub_locations_enabled ? template.schema_json.default_sub_locations : []}
          seasons={['high', 'low']}
          lineDefs={c.lines}
          rowsByKey={rows}
          onChange={onChange}
        />
      ))}
      <div className="flex gap-2 sticky bottom-0 bg-white dark:bg-slate-900 py-3 border-t border-slate-200 dark:border-slate-700">
        <button type="button" disabled={pending} onClick={() => submit(false)}
                className="px-4 py-2 rounded border border-slate-300 dark:border-slate-700 text-sm">
          {pending ? 'Saving…' : 'Save draft'}
        </button>
        <button type="button" disabled={pending} onClick={() => submit(true)}
                className="px-4 py-2 rounded bg-amber-600 text-white text-sm">
          {pending ? 'Publishing…' : 'Publish'}
        </button>
        {msg && <span className="text-sm self-center text-slate-500">{msg}</span>}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Verify build (actions.ts is stubbed in next task; create empty stub now)**

Create `src/app/fmplus/financial/budget/edit/actions.ts` with stub exports so the build passes:

```typescript
'use server';
import type { Scenario } from '@/lib/fmplus/budget/schema';
import type { ServiceLine } from '@/lib/fmplus/budget/types';

export async function saveBudgetAction(_args: { projectId: number; year: number; scenario: Scenario; serviceLine: ServiceLine; startMonth: number; lines: Array<{ sub_location: string|null; category: string; line_code: string; season: 'high'|'low'; qty: number; unit_cost: number }> }): Promise<{ ok: boolean; linesWritten: number; error?: string }> {
  return { ok: false, linesWritten: 0, error: 'Not implemented yet (Task 15)' };
}
export async function publishBudgetAction(args: Parameters<typeof saveBudgetAction>[0]): Promise<ReturnType<typeof saveBudgetAction>> {
  return saveBudgetAction(args);
}
```

Run: `npm run build`
Expected: completes; visit `/fmplus/financial/budget/edit` and walk through Project picker → Service-line picker → Editor form.

- [ ] **Step 7: Commit**

```bash
git add src/app/fmplus/financial/budget/edit/
git commit -m "feat(fmplus): Editor — project + service-line + scenario picker + form scaffold"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 15: Editor save/publish actions + audit logging

**Files:**
- Modify: `src/app/fmplus/financial/budget/edit/actions.ts` (replace stubs)
- Create: `src/lib/fmplus/budget/audit.ts`
- Create: `src/lib/fmplus/budget/audit.test.ts`

- [ ] **Step 1: Write the audit-helper test**

Create `src/lib/fmplus/budget/audit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeBudgetDiff } from './audit';

describe('computeBudgetDiff', () => {
  it('reports added / removed / changed lines', () => {
    const before = [
      { sub_location: 'A', category: 'manning', line_code: 'hk_manager', season: 'high' as const, qty: 1, unit_cost: 1000 },
      { sub_location: 'A', category: 'manning', line_code: 'sup_8h',     season: 'high' as const, qty: 5, unit_cost: 800  },
    ];
    const after = [
      { sub_location: 'A', category: 'manning', line_code: 'hk_manager', season: 'high' as const, qty: 1, unit_cost: 1100 }, // changed unit
      { sub_location: 'A', category: 'manning', line_code: 'admin',       season: 'high' as const, qty: 1, unit_cost: 9500 }, // added
      // sup_8h removed
    ];
    const diff = computeBudgetDiff(before, after);
    expect(diff.added.map(l => l.line_code)).toEqual(['admin']);
    expect(diff.removed.map(l => l.line_code)).toEqual(['sup_8h']);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].line_code).toBe('hk_manager');
    expect(diff.changed[0].before.unit_cost).toBe(1000);
    expect(diff.changed[0].after.unit_cost).toBe(1100);
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `npx vitest run src/lib/fmplus/budget/audit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `audit.ts`**

Create `src/lib/fmplus/budget/audit.ts`:

```typescript
import { supabaseAdmin } from '@/lib/supabase';

type LineKey = { sub_location: string | null; category: string; line_code: string; season: 'high'|'low' };
type Line = LineKey & { qty: number; unit_cost: number };

function keyOf(l: LineKey): string {
  return `${l.category}|${l.line_code}|${l.sub_location ?? ''}|${l.season}`;
}

export function computeBudgetDiff(before: Line[], after: Line[]): {
  added: Line[]; removed: Line[]; changed: Array<{ line_code: string; key: string; before: Line; after: Line }>;
} {
  const beforeMap = new Map(before.map(l => [keyOf(l), l]));
  const afterMap  = new Map(after.map(l  => [keyOf(l), l]));
  const added: Line[]   = [];
  const removed: Line[] = [];
  const changed: Array<{ line_code: string; key: string; before: Line; after: Line }> = [];
  for (const [k, a] of afterMap.entries()) {
    const b = beforeMap.get(k);
    if (!b) { added.push(a); continue; }
    if (b.qty !== a.qty || b.unit_cost !== a.unit_cost) changed.push({ line_code: a.line_code, key: k, before: b, after: a });
  }
  for (const [k, b] of beforeMap.entries()) {
    if (!afterMap.has(k)) removed.push(b);
  }
  return { added, removed, changed };
}

export async function writeAuditOnPublishedEdit(opts: {
  budgetId: number;
  changedBy: string | null;
  before: Line[];
  after: Line[];
}): Promise<void> {
  const diff = computeBudgetDiff(opts.before, opts.after);
  if (diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) return;
  await supabaseAdmin().from('budget_audit').insert({
    budget_id: opts.budgetId,
    changed_by: opts.changedBy,
    diff_json: diff,
  });
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run src/lib/fmplus/budget/audit.test.ts`
Expected: PASS — 1 test.

- [ ] **Step 5: Implement the real `actions.ts`**

Replace `src/app/fmplus/financial/budget/edit/actions.ts`:

```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { commitBudget } from '@/lib/fmplus/budget/commit';
import { writeAuditOnPublishedEdit } from '@/lib/fmplus/budget/audit';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser } from '@/lib/auth';
import type { Scenario } from '@/lib/fmplus/budget/schema';
import type { ServiceLine } from '@/lib/fmplus/budget/types';

type ActionArgs = {
  projectId: number;
  year: number;
  scenario: Scenario;
  serviceLine: ServiceLine;
  startMonth: number;
  lines: Array<{ sub_location: string|null; category: string; line_code: string; season: 'high'|'low'; qty: number; unit_cost: number }>;
};

async function loadExistingLines(budgetId: number, segmentServiceLine: ServiceLine) {
  const sb = supabaseAdmin();
  const { data: seg } = await sb
    .from('project_budget_segments').select('id').eq('budget_id', budgetId).eq('service_line', segmentServiceLine).maybeSingle();
  if (!seg) return [];
  const { data } = await sb.from('budget_lines')
    .select('sub_location, category, line_code, season, qty, unit_cost')
    .eq('segment_id', (seg as { id: number }).id);
  return (data ?? []) as Array<{ sub_location: string|null; category: string; line_code: string; season: 'high'|'low'; qty: number; unit_cost: number }>;
}

async function runAction(args: ActionArgs, publish: boolean): Promise<{ ok: boolean; linesWritten: number; error?: string }> {
  const user = await getSessionUser();
  if (!user || !user.is_admin) return { ok: false, linesWritten: 0, error: 'Admin only.' };
  try {
    const sb = supabaseAdmin();
    const { data: project } = await sb.from('odoo_analytic_accounts').select('name').eq('id', args.projectId).maybeSingle();
    if (!project) return { ok: false, linesWritten: 0, error: 'Unknown project.' };
    const projectName = (project as { name: string }).name;

    const { data: existing } = await sb
      .from('project_budgets').select('id, status')
      .eq('project_id', args.projectId).eq('fiscal_year', args.year).eq('scenario', args.scenario)
      .maybeSingle();
    let auditBefore: Awaited<ReturnType<typeof loadExistingLines>> = [];
    if (existing && (existing as { status: 'draft'|'published' }).status === 'published') {
      auditBefore = await loadExistingLines((existing as { id: number }).id, args.serviceLine);
    }

    const flatRows = args.lines.map(l => ({
      project: projectName, service_line: args.serviceLine,
      sub_location: l.sub_location, category: l.category,
      line_code: l.line_code, season: l.season,
      qty: l.qty, unit_cost: l.unit_cost, notes: null,
    }));

    const result = await commitBudget({
      projectId: args.projectId, fiscalYear: args.year, scenario: args.scenario,
      startMonth: args.startMonth, rows: flatRows,
      publish, publishedBy: user.id, notes: null,
    });

    if (auditBefore.length > 0) {
      await writeAuditOnPublishedEdit({
        budgetId: result.budgetId, changedBy: user.id,
        before: auditBefore, after: args.lines,
      });
    }

    revalidatePath('/fmplus/financial/budget', 'layout');
    return { ok: true, linesWritten: result.segmentsUpserted.find(s => s.service_line === args.serviceLine)?.lines ?? 0 };
  } catch (err) {
    return { ok: false, linesWritten: 0, error: (err as Error).message };
  }
}

export async function saveBudgetAction(args: ActionArgs) {
  return runAction(args, false);
}
export async function publishBudgetAction(args: ActionArgs) {
  return runAction(args, true);
}
```

- [ ] **Step 6: Verify build + smoke test**

Run: `npm run build`
Expected: completes.

Manual: log in as admin, walk Editor for AUC + HK + 2026 + Initial; enter a few quantities; click Save Draft → message "Draft saved · N lines". Click Publish → "Published · N lines". Re-open Editor → previous values restored.

- [ ] **Step 7: Commit**

```bash
git add src/app/fmplus/financial/budget/edit/actions.ts src/lib/fmplus/budget/audit.ts src/lib/fmplus/budget/audit.test.ts
git commit -m "feat(fmplus): Editor save/publish actions + audit log on published edits"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

## Phase 5 — Variance + Compare UI (Tasks 16-19)

### Task 16: Variance page — header, KPI tiles, service-line tabs, grid

**Files:**
- Create: `src/app/fmplus/financial/budget/variance/page.tsx`
- Create: `src/app/fmplus/financial/budget/variance/_components/variance-grid.tsx`

- [ ] **Step 1: Write `variance/page.tsx` — server component**

```tsx
import { redirect } from 'next/navigation';
import { buildBudgetVariance } from '@/lib/fmplus/budget/variance';
import { PeriodControl } from '../_components/period-control';
import { VarianceGrid } from './_components/variance-grid';
import { getTemplate } from '@/lib/fmplus/budget/templates';
import type { Scenario } from '@/lib/fmplus/budget/schema';
import { ScenarioSchema } from '@/lib/fmplus/budget/schema';

export default async function VariancePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; year?: string; scenario?: string; through?: string; segment?: string }>;
}) {
  const sp = await searchParams;
  const projectId = Number(sp.project ?? 0);
  if (!projectId) redirect('/fmplus/financial/budget');
  const year = Number(sp.year ?? new Date().getUTCFullYear());
  const sParse = ScenarioSchema.safeParse(sp.scenario ?? 'initial');
  const scenario: Scenario = sParse.success ? sParse.data : 'initial';
  const through = Number(sp.through ?? new Date().getUTCMonth() + 1);
  const activeSegmentId = sp.segment ? Number(sp.segment) : null;

  const report = await buildBudgetVariance({ projectId, fiscalYear: year, scenario, ytdThrough: through });

  if (!report) {
    return (
      <section className="space-y-3">
        <p className="text-sm text-slate-500">No budget for this project · year · scenario.</p>
        <a href={`/fmplus/financial/budget/edit?project=${projectId}&year=${year}&scenario=${scenario}`}
           className="inline-block px-3 py-2 rounded bg-amber-600 text-white text-sm">Create budget</a>
      </section>
    );
  }

  const seg = activeSegmentId
    ? report.segments.find(s => s.segment_id === activeSegmentId) ?? report.segments[0]
    : report.segments[0];

  return (
    <section className="space-y-4">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">{report.project_name}</h2>
          <p className="text-xs text-slate-500">FY {report.fiscal_year} · Scenario: {report.scenario} · Status: {report.status} · Start month: {report.start_month}</p>
        </div>
        <PeriodControl />
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiTile label="Annual budget" value={fmt(report.segments.flatMap(s => s.categories.flatMap(c => c.cells)).reduce((sum, c) => sum + c.budget, 0))} />
        <KpiTile label="YTD budget" value={fmt(report.ytd.budget)} />
        <KpiTile label="YTD actual" value={fmt(report.ytd.actual)} />
        <KpiTile label="Variance" value={fmt(report.ytd.variance)} accent={report.ytd.color} />
        <KpiTile label="Variance %" value={fmtPct(report.ytd.variance_pct)} accent={report.ytd.color} />
      </div>

      {report.unmapped_actuals_total !== 0 && (
        <div className="rounded border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs">
          <strong>{fmt(report.unmapped_actuals_total)} EGP of actuals</strong> didn't match any category. Configure mappings in Settings.
        </div>
      )}

      <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {report.segments.map(s => (
          <a key={s.segment_id}
             href={`?project=${projectId}&year=${year}&scenario=${scenario}&through=${through}&segment=${s.segment_id}`}
             className={`px-3 py-2 text-sm border-b-2 -mb-px ${seg?.segment_id === s.segment_id ? 'border-amber-600 text-amber-700 font-semibold' : 'border-transparent text-slate-500'}`}>
            {s.service_line.toUpperCase()}{s.is_stub ? ' (stub)' : ''}
          </a>
        ))}
      </nav>

      {seg?.is_stub ? (
        <div className="rounded border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm">
          {seg.service_line.toUpperCase()} template is not yet defined — variance cannot be computed for this segment.
        </div>
      ) : seg ? (
        <VarianceGrid
          projectId={projectId}
          year={year}
          serviceLine={seg.service_line}
          templateVersion={seg.template_version}
          template={getTemplate(seg.service_line, seg.template_version)}
          segment={seg}
          ytdThrough={through}
        />
      ) : (
        <p className="text-sm text-slate-500">No segments on this budget.</p>
      )}
    </section>
  );
}

function KpiTile({ label, value, accent }: { label: string; value: string; accent?: 'green'|'amber'|'red' }) {
  const border = accent === 'red' ? 'border-rose-500' : accent === 'amber' ? 'border-amber-500' : accent === 'green' ? 'border-emerald-500' : '';
  return (
    <div className={`rounded-lg p-3 bg-slate-50 dark:bg-slate-800 ${border ? `border-l-4 ${border}` : ''}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
function fmt(n: number): string { return new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(n); }
function fmtPct(p: number | null): string { if (p == null) return '—'; return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`; }
```

- [ ] **Step 2: Write `_components/variance-grid.tsx` — client component**

```tsx
'use client';
import { useState } from 'react';
import type { SegmentVariance } from '@/lib/fmplus/budget/types';
import type { Template } from '@/lib/fmplus/budget/templates';
import { DrillDrawer } from './drill-drawer';

const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

export function VarianceGrid({
  projectId, year, serviceLine, templateVersion, template, segment, ytdThrough,
}: {
  projectId: number; year: number; serviceLine: string; templateVersion: number;
  template: Template; segment: SegmentVariance; ytdThrough: number;
}) {
  const [drill, setDrill] = useState<{ category: string; month: number } | null>(null);
  const lowSet = new Set(template.schema_json.season_months.low);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800">
              <th className="p-1.5 text-left border-b border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-50 dark:bg-slate-800">Category</th>
              {MONTHS.map(m => (
                <th key={m} className={`p-1.5 text-right border-b border-slate-200 dark:border-slate-700 ${lowSet.has(m) ? 'bg-slate-100 dark:bg-slate-700' : ''}`}>
                  {new Date(2000, m-1, 1).toLocaleString('en', { month: 'short' })}
                </th>
              ))}
              <th className="p-1.5 text-right border-b border-slate-200 dark:border-slate-700 font-bold">YTD</th>
              <th className="p-1.5 text-right border-b border-slate-200 dark:border-slate-700">Var %</th>
            </tr>
          </thead>
          <tbody className="font-variant-numeric tabular-nums">
            {segment.categories.map(cat => (
              <tr key={cat.category} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-1.5 font-semibold sticky left-0 bg-white dark:bg-slate-900">{labelFor(cat.category, template)}</td>
                {MONTHS.map(m => {
                  const cell = cat.cells.find(c => c.month === m);
                  if (!cell) return <td key={m} className={`p-1.5 text-right text-slate-400 ${lowSet.has(m) ? 'bg-slate-100/50 dark:bg-slate-700/50' : ''}`}>—</td>;
                  return (
                    <td key={m}
                        onClick={() => setDrill({ category: cat.category, month: m })}
                        className={`p-1.5 text-right cursor-pointer ${cellBg(cell.color)} ${lowSet.has(m) ? 'border-l border-slate-300 dark:border-slate-600' : ''}`}
                        title={`B ${fmt(cell.budget)} · A ${fmt(cell.actual)} · ${fmtPct(cell.variance_pct)}`}>
                      <div>{fmtK(cell.budget)}</div>
                      <div className="text-[10px] text-slate-600 dark:text-slate-400">/ {fmtK(cell.actual)}</div>
                    </td>
                  );
                })}
                <td className="p-1.5 text-right font-semibold">
                  <div>{fmt(cat.ytd.budget)}</div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-400">/ {fmt(cat.ytd.actual)}</div>
                </td>
                <td className={`p-1.5 text-right ${cat.ytd.color === 'red' ? 'text-rose-600' : cat.ytd.color === 'amber' ? 'text-amber-600' : 'text-emerald-700'}`}>{fmtPct(cat.ytd.variance_pct)}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 dark:bg-slate-800 font-bold border-t border-slate-300 dark:border-slate-600">
              <td className="p-2 sticky left-0 bg-slate-50 dark:bg-slate-800">{serviceLine.toUpperCase()} total</td>
              {MONTHS.map(m => {
                const sum = segment.categories.reduce((a, c) => a + (c.cells.find(x => x.month === m)?.budget ?? 0), 0);
                const sumA = segment.categories.reduce((a, c) => a + (c.cells.find(x => x.month === m)?.actual ?? 0), 0);
                return (
                  <td key={m} className={`p-1.5 text-right ${lowSet.has(m) ? 'bg-slate-100 dark:bg-slate-700' : ''}`}>
                    <div>{fmtK(sum)}</div>
                    <div className="text-[10px] text-slate-600 dark:text-slate-400">/ {fmtK(sumA)}</div>
                  </td>
                );
              })}
              <td className="p-2 text-right">
                <div>{fmt(segment.ytd.budget)}</div>
                <div className="text-[10px] text-slate-600 dark:text-slate-400">/ {fmt(segment.ytd.actual)}</div>
              </td>
              <td className={`p-2 text-right ${segment.ytd.color === 'red' ? 'text-rose-600' : segment.ytd.color === 'amber' ? 'text-amber-600' : 'text-emerald-700'}`}>{fmtPct(segment.ytd.variance_pct)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Click any cell to see the underlying Odoo journal entries. Low-season columns shaded.</p>

      {drill && (
        <DrillDrawer
          projectId={projectId} year={year}
          serviceLine={serviceLine} templateVersion={templateVersion}
          category={drill.category} month={drill.month}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  );
}

function labelFor(catCode: string, template: Template): string {
  return template.schema_json.categories.find(c => c.code === catCode)?.label ?? catCode;
}
function cellBg(color: 'green'|'amber'|'red'): string {
  if (color === 'red')   return 'bg-rose-100/70 dark:bg-rose-900/30';
  if (color === 'amber') return 'bg-amber-100/70 dark:bg-amber-900/30';
  return 'bg-emerald-50/70 dark:bg-emerald-900/20';
}
function fmt(n: number): string { return new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(n); }
function fmtK(n: number): string { return n >= 10000 ? `${Math.round(n/1000)}k` : n.toFixed(0); }
function fmtPct(p: number | null): string { if (p == null) return '—'; return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`; }
```

- [ ] **Step 3: Verify build + smoke test**

Run: `npm run build`
Expected: completes. Note: `<DrillDrawer />` is referenced but defined in Task 17; create stub for now in `_components/drill-drawer.tsx`:

```tsx
'use client';
export function DrillDrawer(_props: { projectId: number; year: number; serviceLine: string; templateVersion: number; category: string; month: number; onClose: () => void }) {
  return null;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/fmplus/financial/budget/variance/
git commit -m "feat(fmplus): Variance tab — header, KPI tiles, service-line tabs, monthly grid"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 17: Variance drill side drawer

**Files:**
- Modify: `src/app/fmplus/financial/budget/variance/_components/drill-drawer.tsx`
- Create: `src/app/fmplus/financial/budget/variance/actions.ts`

- [ ] **Step 1: Write `variance/actions.ts`**

```typescript
'use server';
import { cellToMoveLines, type DrillResult } from '@/lib/fmplus/budget/variance-drill';
import { getTemplate } from '@/lib/fmplus/budget/templates';
import type { ServiceLine } from '@/lib/fmplus/budget/types';
import { ServiceLineSchema } from '@/lib/fmplus/budget/schema';

export async function loadDrillAction(args: {
  projectId: number;
  year: number;
  serviceLine: string;
  templateVersion: number;
  category: string;
  month: number;
}): Promise<{ ok: true; rows: DrillResult[] } | { ok: false; error: string }> {
  const slParse = ServiceLineSchema.safeParse(args.serviceLine);
  if (!slParse.success) return { ok: false, error: 'Invalid service line' };
  const tpl = getTemplate(slParse.data, args.templateVersion);
  const rows = await cellToMoveLines({
    projectId: args.projectId,
    category: args.category,
    month: args.month,
    year: args.year,
    accountMap: tpl.account_map_json,
  });
  return { ok: true, rows };
}
```

- [ ] **Step 2: Replace `_components/drill-drawer.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { loadDrillAction } from '../actions';
import type { DrillResult } from '@/lib/fmplus/budget/variance-drill';

export function DrillDrawer({
  projectId, year, serviceLine, templateVersion, category, month, onClose,
}: {
  projectId: number; year: number; serviceLine: string; templateVersion: number;
  category: string; month: number; onClose: () => void;
}) {
  const [rows, setRows] = useState<DrillResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null); setError(null);
    loadDrillAction({ projectId, year, serviceLine, templateVersion, category, month })
      .then(res => { if (!alive) return; if (res.ok) setRows(res.rows); else setError(res.error); });
    return () => { alive = false; };
  }, [projectId, year, serviceLine, templateVersion, category, month]);

  const total = rows?.reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <aside className="fixed inset-y-0 right-0 w-full sm:w-[520px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-xl z-50 flex flex-col">
      <header className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">{serviceLine.toUpperCase()} · {category} · {new Date(year, month-1, 1).toLocaleString('en', { month: 'long', year: 'numeric' })}</div>
          <div className="text-sm font-semibold">{rows ? `${rows.length} entries · ${new Intl.NumberFormat('en-EG').format(Math.round(total))} EGP` : 'Loading…'}</div>
        </div>
        <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">✕ Close</button>
      </header>
      <div className="overflow-y-auto flex-1">
        {error && <div className="p-3 text-rose-700 text-sm">{error}</div>}
        {rows && rows.length === 0 && <div className="p-3 text-slate-500 text-sm">No journal entries this month for this category.</div>}
        {rows && rows.length > 0 && (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Account</th>
                <th className="text-left p-2">Partner</th>
                <th className="text-left p-2">Journal</th>
                <th className="text-right p-2">Amount</th>
              </tr>
            </thead>
            <tbody className="font-variant-numeric tabular-nums">
              {rows.map(r => (
                <tr key={r.move_line_id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-2 whitespace-nowrap">{r.date}</td>
                  <td className="p-2"><div className="text-slate-500">{r.account_code}</div><div>{r.account_name}</div></td>
                  <td className="p-2 text-slate-500">{r.partner_name ?? '—'}</td>
                  <td className="p-2 text-slate-500">{r.journal_name ?? '—'}</td>
                  <td className="p-2 text-right">{new Intl.NumberFormat('en-EG').format(Math.round(r.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Verify build + smoke test**

Run: `npm run build`. Expected: success.

Manual: visit `/fmplus/financial/budget/variance?project=<id>&year=2026&scenario=initial`. Click a cell — drawer slides in showing journal entries that match the cell's (category, month). Click ✕ Close — drawer disappears.

- [ ] **Step 4: Commit**

```bash
git add src/app/fmplus/financial/budget/variance/_components/drill-drawer.tsx src/app/fmplus/financial/budget/variance/actions.ts
git commit -m "feat(fmplus): Variance — drill side drawer with Odoo journal entries"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 18: Compare tab — multi-project category grid

**Files:**
- Create: `src/app/fmplus/financial/budget/compare/page.tsx`
- Create: `src/app/fmplus/financial/budget/compare/_components/compare-grid.tsx`

- [ ] **Step 1: Write `compare/page.tsx`**

```tsx
import { buildPortfolio } from '@/lib/fmplus/budget/portfolio';
import { CompareGrid } from './_components/compare-grid';
import { PeriodControl } from '../_components/period-control';
import type { Scenario } from '@/lib/fmplus/budget/schema';
import type { ServiceLine } from '@/lib/fmplus/budget/types';
import { buildBudgetVariance } from '@/lib/fmplus/budget/variance';

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; scenario?: string; through?: string; service_line?: string }>;
}) {
  const sp = await searchParams;
  const year = Number(sp.year ?? new Date().getUTCFullYear());
  const scenario = (sp.scenario ?? 'initial') as Scenario;
  const through = Number(sp.through ?? new Date().getUTCMonth() + 1);
  const sl: ServiceLine = (sp.service_line ?? 'hk') as ServiceLine;

  const { rows } = await buildPortfolio({
    fiscalYear: year, scenario, ytdThrough: through, serviceLineFilter: sl,
  });

  // For each row, also fetch per-category variance %
  const enriched = await Promise.all(rows.map(async r => {
    const v = await buildBudgetVariance({ projectId: r.project_id, fiscalYear: year, scenario, ytdThrough: through });
    const seg = v?.segments.find(s => s.service_line === sl);
    const byCat = new Map<string, number | null>();
    for (const c of seg?.categories ?? []) {
      byCat.set(c.category, c.ytd.variance_pct);
    }
    return { ...r, by_category: byCat };
  }));

  return (
    <section className="space-y-4">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Compare projects</h2>
          <p className="text-xs text-slate-500">Service line: <strong className="uppercase">{sl}</strong> · {enriched.length} projects ranked by absolute variance %.</p>
        </div>
        <PeriodControl />
      </header>
      <div className="flex gap-2 flex-wrap">
        {(['hk','mep','landscape','security','pest_ctrl','waste_mgmt'] as ServiceLine[]).map(s => (
          <a key={s}
             href={`?year=${year}&scenario=${scenario}&through=${through}&service_line=${s}`}
             className={`px-3 py-1 rounded-full text-xs ${sl === s ? 'bg-amber-600 text-white' : 'border border-slate-300 dark:border-slate-700 text-slate-500'}`}>
            {s.toUpperCase()}
          </a>
        ))}
      </div>
      <CompareGrid rows={enriched} />
    </section>
  );
}
```

- [ ] **Step 2: Write `_components/compare-grid.tsx`**

```tsx
'use client';
import Link from 'next/link';

const CATEGORY_ORDER = ['manning', 'ppe', 'tools', 'consumables', 'transport', 'it', 'overhead'];

export function CompareGrid({ rows }: {
  rows: Array<{
    project_id: number; project_name: string;
    variance_pct: number | null;
    by_category: Map<string, number | null>;
    health_color: 'green' | 'amber' | 'red';
  }>;
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">No projects with budgets for this service line.</p>;
  const allCategories = Array.from(new Set(rows.flatMap(r => Array.from(r.by_category.keys()))))
    .sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse min-w-full">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800">
            <th className="p-2 text-left border-b border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-50 dark:bg-slate-800">Project</th>
            {allCategories.map(c => <th key={c} className="p-2 text-right border-b border-slate-200 dark:border-slate-700 capitalize">{c}</th>)}
            <th className="p-2 text-right border-b border-slate-200 dark:border-slate-700 font-bold">Total Var %</th>
            <th className="p-2 text-center border-b border-slate-200 dark:border-slate-700">Health</th>
          </tr>
        </thead>
        <tbody className="font-variant-numeric tabular-nums">
          {rows.map(r => (
            <tr key={r.project_id} className="border-b border-slate-100 dark:border-slate-800">
              <td className="p-2 font-semibold sticky left-0 bg-white dark:bg-slate-900">
                <Link href={`/fmplus/financial/budget/variance?project=${r.project_id}`} className="text-amber-700 hover:underline">{r.project_name}</Link>
              </td>
              {allCategories.map(c => {
                const pct = r.by_category.get(c) ?? null;
                return <td key={c} className={`p-2 text-right ${cellBg(pct)}`}>{fmtPct(pct)}</td>;
              })}
              <td className={`p-2 text-right font-semibold ${r.variance_pct == null ? '' : r.variance_pct > 15 ? 'text-rose-600' : Math.abs(r.variance_pct) <= 5 ? 'text-emerald-700' : 'text-amber-600'}`}>{fmtPct(r.variance_pct)}</td>
              <td className="p-2 text-center">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${r.health_color === 'red' ? 'bg-rose-500' : r.health_color === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-500 mt-2">Color rule: |var| ≤ 5% green · &gt;15% overspend red · everything else amber (incl. underspend &gt; 5%, scope-delivery risk).</p>
    </div>
  );
}
function cellBg(pct: number | null): string {
  if (pct == null) return '';
  if (pct > 15) return 'bg-rose-100/60 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300';
  if (Math.abs(pct) <= 5) return 'bg-emerald-50/60 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300';
  return 'bg-amber-100/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
}
function fmtPct(p: number | null): string { if (p == null) return '—'; return `${p > 0 ? '+' : ''}${p.toFixed(0)}%`; }
```

- [ ] **Step 3: Verify build + smoke test**

Run: `npm run build`. Expected: success. Visit `/fmplus/financial/budget/compare` — when at least 2 HK budgets exist, see them ranked by total variance %.

- [ ] **Step 4: Commit**

```bash
git add src/app/fmplus/financial/budget/compare/
git commit -m "feat(fmplus): Compare tab — service-line filter + project × category variance grid"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 19: Editor / Variance polish — health-dot + chips already shipped, no extra task

This task slot is intentionally empty — the anomaly banner (Task 13), health dot (Task 12), and service-line chips (Task 13) cover the polish items called out in the spec's "8 improvements". The remaining improvements (YoY template, phased starts) are spec-marked v2 or already implemented (start_month is a Task 14 column).

- [ ] **Step 1: Skip — proceed to Phase 6**

(No-op task. Leave as a marker in the plan for spec-coverage tracking.)

---

## Phase 6 — Import + Settings UI (Tasks 20-22)

### Task 20: Import page — upload, path detection, preview

**Files:**
- Create: `src/app/fmplus/financial/budget/import/page.tsx`
- Create: `src/app/fmplus/financial/budget/import/_components/import-uploader.tsx`
- Create: `src/app/fmplus/financial/budget/import/_components/preview-grid.tsx`
- Create: `src/app/fmplus/financial/budget/import/actions.ts`

- [ ] **Step 1: Write `import/page.tsx`**

```tsx
import { ImportUploader } from './_components/import-uploader';
import { supabaseAdmin } from '@/lib/supabase';

export default async function ImportPage() {
  const sb = supabaseAdmin();
  const { data: projects } = await sb
    .from('odoo_analytic_accounts')
    .select('id, name')
    .eq('active', true)
    .order('name');
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Import budget from Excel</h2>
      <p className="text-sm text-slate-500">
        Upload a budget XLSX. Two formats accepted: a <strong>rich AUC-style template</strong> (auto-detected by sheet names) or our <strong>flat normalized template</strong> (download below).
      </p>
      <a href="/api/fmplus/budget/flat-template-download" className="inline-block text-sm text-amber-700 hover:underline">⬇ Download blank flat template (.xlsx)</a>
      <ImportUploader projects={(projects ?? []) as Array<{ id: number; name: string }>} />
    </section>
  );
}
```

- [ ] **Step 2: Write `import/actions.ts`**

```typescript
'use server';
import { isRichAucStyleWorkbook, parseRichAucStyleXlsx } from '@/lib/fmplus/budget/parsers/rich-auc-style';
import { parseFlatBudgetXlsx, type FlatRow } from '@/lib/fmplus/budget/parsers/flat-template';
import { commitBudget } from '@/lib/fmplus/budget/commit';
import { getSessionUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import type { Scenario } from '@/lib/fmplus/budget/schema';

export async function previewImportAction(args: {
  fileBase64: string;
  projectId: number | null;       // required for rich; flat carries project name
  fiscalYear: number;
  scenario: Scenario;
}): Promise<
  | { ok: true; format: 'rich'|'flat'; rows: FlatRow[]; warnings: string[]; totals: { byCategory: Record<string, { high: number; low: number }>; high: number; low: number } }
  | { ok: false; error: string; details?: unknown }
> {
  const buf = Buffer.from(args.fileBase64, 'base64');
  const isRich = await isRichAucStyleWorkbook(buf);
  if (isRich) {
    if (!args.projectId) return { ok: false, error: 'Pick a project before uploading a rich AUC-style sheet.' };
    const sb = supabaseAdmin();
    const { data: project } = await sb.from('odoo_analytic_accounts').select('name').eq('id', args.projectId).maybeSingle();
    if (!project) return { ok: false, error: 'Unknown project' };
    const result = await parseRichAucStyleXlsx(buf, { project: (project as { name: string }).name });
    return summarize('rich', result.rows, result.errors.map(e => `${e.sheet} row ${e.row}: ${e.message}`));
  }
  const flat = await parseFlatBudgetXlsx(buf);
  return summarize('flat', flat.rows, flat.errors.map(e => `Row ${e.row} · ${e.field}: ${e.message}`));
}

function summarize(format: 'rich'|'flat', rows: FlatRow[], errs: string[]) {
  const byCat: Record<string, { high: number; low: number }> = {};
  let hi = 0, lo = 0;
  for (const r of rows) {
    const m = r.qty * r.unit_cost;
    if (!byCat[r.category]) byCat[r.category] = { high: 0, low: 0 };
    if (r.season === 'high') { byCat[r.category].high += m; hi += m; }
    else                     { byCat[r.category].low  += m; lo += m; }
  }
  return { ok: true as const, format, rows, warnings: errs, totals: { byCategory: byCat, high: hi, low: lo } };
}

export async function commitImportAction(args: {
  rows: FlatRow[];
  projectId: number;
  fiscalYear: number;
  scenario: Scenario;
  startMonth: number;
  publish: boolean;
}): Promise<{ ok: boolean; budgetId?: number; error?: string }> {
  const user = await getSessionUser();
  if (!user || !user.is_admin) return { ok: false, error: 'Admin only.' };
  try {
    const result = await commitBudget({
      projectId: args.projectId, fiscalYear: args.fiscalYear,
      scenario: args.scenario, startMonth: args.startMonth,
      rows: args.rows, publish: args.publish, publishedBy: user.id,
    });
    revalidatePath('/fmplus/financial/budget', 'layout');
    return { ok: true, budgetId: result.budgetId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
```

- [ ] **Step 3: Write `_components/import-uploader.tsx`**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { previewImportAction, commitImportAction } from '../actions';
import type { FlatRow } from '@/lib/fmplus/budget/parsers/flat-template';
import type { Scenario } from '@/lib/fmplus/budget/schema';
import { PreviewGrid } from './preview-grid';

export function ImportUploader({ projects }: { projects: Array<{ id: number; name: string }> }) {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const [scenario, setScenario] = useState<Scenario>('initial');
  const [startMonth, setStartMonth] = useState(1);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<{ format: 'rich'|'flat'; rows: FlatRow[]; warnings: string[]; totals: { byCategory: Record<string, { high: number; low: number }>; high: number; low: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<number | null>(null);

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      startTransition(async () => {
        setError(null); setPreview(null);
        const res = await previewImportAction({ fileBase64: base64, projectId, fiscalYear: year, scenario });
        if (res.ok) setPreview({ format: res.format, rows: res.rows, warnings: res.warnings, totals: res.totals });
        else setError(res.error);
      });
    };
    reader.readAsDataURL(file);
  };

  const commit = (publish: boolean) => {
    if (!preview || !projectId) return;
    startTransition(async () => {
      const res = await commitImportAction({
        rows: preview.rows, projectId, fiscalYear: year,
        scenario, startMonth, publish,
      });
      if (res.ok) setCommitted(res.budgetId ?? 0);
      else setError(res.error ?? 'Commit failed');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">Project:&nbsp;
          <select value={projectId ?? ''} onChange={e => setProjectId(e.target.value ? Number(e.target.value) : null)}
                  className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
            <option value="">— pick project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Year:&nbsp;
          <select value={year} onChange={e => setYear(Number(e.target.value))}
                  className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
            {[2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="text-sm">Scenario:&nbsp;
          <select value={scenario} onChange={e => setScenario(e.target.value as Scenario)}
                  className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
            <option value="initial">Initial</option>
            <option value="revised">Revised</option>
            <option value="reforecast">Re-forecast</option>
          </select>
        </label>
        <label className="text-sm">Start month:&nbsp;
          <select value={startMonth} onChange={e => setStartMonth(Number(e.target.value))}
                  className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{new Date(2000, m-1, 1).toLocaleString('en', { month: 'short' })}</option>)}
          </select>
        </label>
      </div>

      <input type="file" accept=".xlsx"
             onChange={e => { const f = e.currentTarget.files?.[0]; if (f) onFile(f); }}
             className="block text-sm" />
      {pending && <p className="text-sm text-slate-500">Working…</p>}
      {error && <div className="rounded border-l-4 border-rose-500 bg-rose-50 dark:bg-rose-900/20 p-3 text-sm">{error}</div>}
      {committed != null && <div className="rounded border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm">Saved budget id {committed}.</div>}

      {preview && (
        <>
          <p className="text-xs text-slate-500">
            Detected format: <strong>{preview.format === 'rich' ? 'rich AUC-style' : 'flat normalized'}</strong> · {preview.rows.length} lines.
            High season monthly total: <strong>{fmt(preview.totals.high)}</strong> · Low: <strong>{fmt(preview.totals.low)}</strong>.
          </p>
          {preview.warnings.length > 0 && (
            <div className="rounded border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs">
              <strong>{preview.warnings.length} warning{preview.warnings.length === 1 ? '' : 's'}:</strong>
              <ul className="list-disc pl-5 mt-1 max-h-32 overflow-y-auto">
                {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          <PreviewGrid rows={preview.rows} />
          <div className="flex gap-2">
            <button onClick={() => commit(false)} disabled={pending || !projectId}
                    className="px-3 py-2 rounded border border-slate-300 dark:border-slate-700 text-sm">Save as Draft</button>
            <button onClick={() => commit(true)} disabled={pending || !projectId}
                    className="px-3 py-2 rounded bg-amber-600 text-white text-sm">Publish</button>
          </div>
        </>
      )}
    </div>
  );
}
function fmt(n: number): string { return new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(n); }
```

- [ ] **Step 4: Write `_components/preview-grid.tsx`**

```tsx
'use client';
import type { FlatRow } from '@/lib/fmplus/budget/parsers/flat-template';
export function PreviewGrid({ rows }: { rows: FlatRow[] }) {
  const limited = rows.slice(0, 200);
  return (
    <div className="overflow-x-auto max-h-96 border border-slate-200 dark:border-slate-700 rounded">
      <table className="text-xs w-full">
        <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
          <tr>
            <th className="p-1.5 text-left">Service</th>
            <th className="p-1.5 text-left">Sub-loc</th>
            <th className="p-1.5 text-left">Category</th>
            <th className="p-1.5 text-left">Line</th>
            <th className="p-1.5 text-left">Season</th>
            <th className="p-1.5 text-right">Qty</th>
            <th className="p-1.5 text-right">Unit cost</th>
            <th className="p-1.5 text-right">Monthly</th>
          </tr>
        </thead>
        <tbody className="font-variant-numeric tabular-nums">
          {limited.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
              <td className="p-1.5">{r.service_line}</td>
              <td className="p-1.5 text-slate-500">{r.sub_location ?? '—'}</td>
              <td className="p-1.5">{r.category}</td>
              <td className="p-1.5">{r.line_code}</td>
              <td className="p-1.5">{r.season}</td>
              <td className="p-1.5 text-right">{r.qty}</td>
              <td className="p-1.5 text-right">{r.unit_cost.toLocaleString()}</td>
              <td className="p-1.5 text-right">{(r.qty * r.unit_cost).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 200 && <p className="p-2 text-xs text-slate-500">Showing first 200 of {rows.length} rows.</p>}
    </div>
  );
}
```

- [ ] **Step 5: Add the flat-template download route**

Create `src/app/api/fmplus/budget/flat-template-download/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { writeFlatBudgetXlsx } from '@/lib/fmplus/budget/parsers/flat-template-export';

export async function GET() {
  const buf = await writeFlatBudgetXlsx([]);
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="fmplus-budget-template.xlsx"',
    },
  });
}
```

- [ ] **Step 6: Verify build + smoke test**

Run: `npm run build`. Expected: success. Walk through Import page: drop `FMPLUS/AUC Budget.xlsx` → preview shows ~150-200 rows (per fixture inspection); high/low monthly totals match the AUC sheet's Grand Total within 0.5%; click Publish → redirects to Overview with the new budget visible.

- [ ] **Step 7: Commit**

```bash
git add src/app/fmplus/financial/budget/import/ src/app/api/fmplus/budget/flat-template-download/
git commit -m "feat(fmplus): Import tab — XLSX upload, path-A/path-B detection, preview, commit"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 21: (rolled into Task 20 above)

Task originally for "Import commit action" was implemented in Task 20 step 2 (`commitImportAction`). Skip — proceed to Task 22.

- [ ] **Step 1: Skip — proceed to Settings**

---

### Task 22: Settings page — thresholds, template list, mapping editor, unmapped warning

**Files:**
- Create: `src/app/fmplus/financial/budget/settings/page.tsx`
- Create: `src/app/fmplus/financial/budget/settings/actions.ts`

- [ ] **Step 1: Write `settings/actions.ts`**

```typescript
'use server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function updateThresholdsAction(args: { green_pct: number; amber_pct: number }): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || !user.is_admin) return { ok: false, error: 'Admin only.' };
  if (args.green_pct < 0 || args.amber_pct <= args.green_pct) {
    return { ok: false, error: 'Amber threshold must be greater than green threshold.' };
  }
  const sb = supabaseAdmin();
  const { error } = await sb.from('budget_settings')
    .update({ green_pct: args.green_pct, amber_pct: args.amber_pct, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/fmplus/financial/budget', 'layout');
  return { ok: true };
}
```

- [ ] **Step 2: Write `settings/page.tsx`**

```tsx
import { supabaseAdmin } from '@/lib/supabase';
import { SERVICE_LINE_CATALOG, getTemplate } from '@/lib/fmplus/budget/templates';
import { ThresholdEditor } from './_components/threshold-editor';

export default async function SettingsPage() {
  const sb = supabaseAdmin();
  const { data: settings } = await sb.from('budget_settings').select('*').eq('id', 1).maybeSingle();
  const s = settings as { green_pct: number; amber_pct: number; default_scenario: string } | null;

  // Compute the union of mapped Odoo account-code patterns across all active templates,
  // then list the cost accounts that don't match any pattern (drift detector).
  const tpl = getTemplate('hk', 1);
  const allPatterns = tpl.account_map_json.flatMap(e => e.code_patterns);
  const { data: costAccts } = await sb
    .from('odoo_accounts')
    .select('code, name, account_type')
    .ilike('account_type', 'expense%');
  type Acct = { code: string; name: string; account_type: string };
  const accts = (costAccts ?? []) as Acct[];
  const unmapped = accts.filter(a => !allPatterns.some(p => new RegExp(p).test(a.code)));

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Variance thresholds</h2>
        <ThresholdEditor green={s?.green_pct ?? 5} amber={s?.amber_pct ?? 15} />
        <p className="text-xs text-slate-500 mt-2">|var| ≤ green% → green · &gt;amber% overspend → red · everything else amber (incl. underspend &gt; green%, scope-delivery risk).</p>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Service-line templates</h2>
        <table className="text-sm w-full">
          <thead><tr className="bg-slate-50 dark:bg-slate-800 text-left"><th className="p-2">Service line</th><th className="p-2">Status</th><th className="p-2">Template version</th></tr></thead>
          <tbody>
            {SERVICE_LINE_CATALOG.map(c => (
              <tr key={c.code} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-2"><strong>{c.label}</strong> <span className="text-slate-500">({c.code})</span></td>
                <td className="p-2 capitalize">{c.template_status}</td>
                <td className="p-2 text-slate-500">v1</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">HK category-account mapping</h2>
        <p className="text-xs text-slate-500 mb-2">Templates today are code-defined and version-locked; edit by changing <code>src/lib/fmplus/budget/templates/hk.ts</code> and shipping a new template version (out of scope for this UI).</p>
        <table className="text-xs w-full">
          <thead><tr className="bg-slate-50 dark:bg-slate-800 text-left"><th className="p-2">Category</th><th className="p-2">Code-pattern regex</th></tr></thead>
          <tbody>
            {tpl.account_map_json.map(e => (
              <tr key={e.category} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-2 capitalize">{e.category}</td>
                <td className="p-2 font-mono text-slate-500">{e.code_patterns.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Unmapped Odoo cost accounts ({unmapped.length})</h2>
        {unmapped.length === 0 ? (
          <p className="text-sm text-emerald-700">All cost accounts mapped — no variance leakage.</p>
        ) : (
          <table className="text-xs w-full">
            <thead><tr className="bg-slate-50 dark:bg-slate-800 text-left"><th className="p-2">Code</th><th className="p-2">Name</th><th className="p-2">Type</th></tr></thead>
            <tbody>
              {unmapped.map(a => (
                <tr key={a.code} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-2 font-mono">{a.code}</td>
                  <td className="p-2">{a.name}</td>
                  <td className="p-2 text-slate-500">{a.account_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Write `_components/threshold-editor.tsx`**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { updateThresholdsAction } from '../actions';

export function ThresholdEditor({ green, amber }: { green: number; amber: number }) {
  const [g, setG] = useState(green);
  const [a, setA] = useState(amber);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm">Green ≤&nbsp;
        <input type="number" step="0.5" value={g} onChange={e => setG(Number(e.currentTarget.value))}
               className="w-16 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 text-right" />
        %
      </label>
      <label className="text-sm">Amber ≤&nbsp;
        <input type="number" step="0.5" value={a} onChange={e => setA(Number(e.currentTarget.value))}
               className="w-16 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 text-right" />
        %
      </label>
      <button disabled={pending}
              onClick={() => startTransition(async () => {
                const res = await updateThresholdsAction({ green_pct: g, amber_pct: a });
                setMsg(res.ok ? 'Saved.' : `Error: ${res.error}`);
              })}
              className="px-3 py-1.5 rounded bg-amber-600 text-white text-sm">{pending ? 'Saving…' : 'Save'}</button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Verify build + smoke test**

Run: `npm run build`. Expected: success. Visit `/fmplus/financial/budget/settings`. Change green threshold to 3 → Save → variance pages re-render with stricter coloring.

- [ ] **Step 5: Commit**

```bash
git add src/app/fmplus/financial/budget/settings/
git commit -m "feat(fmplus): Settings tab — thresholds editor, template list, unmapped-account drift"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

## Phase 7 — Permissions + Exports + Integration test (Tasks 23-26)

### Task 23: Permission gates — layout-level FM+ access + admin gate on edit/import/settings

**Files:**
- Modify: `src/app/fmplus/financial/budget/layout.tsx`
- Modify: `src/app/fmplus/financial/budget/edit/page.tsx`
- Modify: `src/app/fmplus/financial/budget/import/page.tsx`
- Modify: `src/app/fmplus/financial/budget/settings/page.tsx`

- [ ] **Step 1: Layout-level gate — only signed-in users with FM+ access**

Edit `src/app/fmplus/financial/budget/layout.tsx`. Add at the top of the default-export function:

```tsx
import { getSessionUser, canAccessDomain } from '@/lib/auth';
import { notFound } from 'next/navigation';
// ... (existing imports unchanged)

export default async function BudgetSectionLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) notFound();
  if (!canAccessDomain(user, 'fmplus')) notFound();
  // ... (existing JSX unchanged)
}
```

- [ ] **Step 2: Admin gate on Editor / Import / Settings pages**

For each of `edit/page.tsx`, `import/page.tsx`, `settings/page.tsx`, add at the top of the default-export function (after `searchParams` await if any):

```tsx
import { getSessionUser } from '@/lib/auth';
// ...
const user = await getSessionUser();
if (!user || !user.is_admin) {
  return (
    <section className="p-6">
      <p className="text-sm">This page is admin-only. Variance / Compare / Overview are open to all FM+ users.</p>
    </section>
  );
}
```

The server actions (`saveBudgetAction`, `publishBudgetAction`, `commitImportAction`, `updateThresholdsAction`) already enforce `is_admin` server-side from Tasks 15/20/22 — these page-level gates are belt-and-suspenders, with a friendlier UX than a thrown error.

- [ ] **Step 3: Verify build + smoke test**

Run: `npm run build`. Expected: success.

Manual: log in as a non-admin FM+ user (any `app_user.role !== 'admin'` with `app_user_domain_roles.domain = 'fmplus'`). Visit `/fmplus/financial/budget` — Overview / Variance / Compare load. Visit `/fmplus/financial/budget/edit` — see admin-only message. Log in as admin — full access.

- [ ] **Step 4: Commit**

```bash
git add src/app/fmplus/financial/budget/layout.tsx src/app/fmplus/financial/budget/edit/page.tsx src/app/fmplus/financial/budget/import/page.tsx src/app/fmplus/financial/budget/settings/page.tsx
git commit -m "feat(fmplus): permission gates — FM+ domain check + admin-only edit/import/settings"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 24: Variance — XLSX export

**Files:**
- Create: `src/lib/fmplus/budget/exports/variance-xlsx.ts`
- Create: `src/app/api/fmplus/budget/variance-xlsx/route.ts`
- Modify: `src/app/fmplus/financial/budget/variance/page.tsx` (add Export XLSX link)

- [ ] **Step 1: Write `variance-xlsx.ts`**

```typescript
import ExcelJS from 'exceljs';
import type { BudgetVarianceReport } from '../types';

const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

export async function buildVarianceXlsx(report: BudgetVarianceReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lime Investments';
  for (const seg of report.segments) {
    const ws = wb.addWorksheet(seg.service_line.toUpperCase());
    const header = ['Category', ...MONTHS.map(m => new Date(2000, m-1, 1).toLocaleString('en', { month: 'short' })), 'YTD budget', 'YTD actual', 'Variance', 'Variance %'];
    ws.addRow(header).font = { bold: true };
    for (const cat of seg.categories) {
      const monthCells = MONTHS.map(m => {
        const c = cat.cells.find(x => x.month === m);
        if (!c) return '—';
        return `${Math.round(c.budget)} / ${Math.round(c.actual)}`;
      });
      ws.addRow([cat.category, ...monthCells,
        Math.round(cat.ytd.budget), Math.round(cat.ytd.actual),
        Math.round(cat.ytd.variance), cat.ytd.variance_pct == null ? '' : `${cat.ytd.variance_pct.toFixed(1)}%`,
      ]);
    }
    ws.addRow([]);
    ws.addRow([`${seg.service_line.toUpperCase()} total`, ...MONTHS.map(() => ''),
      Math.round(seg.ytd.budget), Math.round(seg.ytd.actual),
      Math.round(seg.ytd.variance), seg.ytd.variance_pct == null ? '' : `${seg.ytd.variance_pct.toFixed(1)}%`,
    ]).font = { bold: true };
    ws.columns.forEach(col => { col.width = 14; });
  }
  const meta = wb.addWorksheet('Meta');
  meta.addRow(['Project', report.project_name]);
  meta.addRow(['Fiscal year', report.fiscal_year]);
  meta.addRow(['Scenario', report.scenario]);
  meta.addRow(['Status', report.status]);
  meta.addRow(['Health score %', report.health_score_pct.toFixed(2)]);
  meta.addRow(['Unmapped actuals', report.unmapped_actuals_total]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
```

- [ ] **Step 2: Write the API route**

Create `src/app/api/fmplus/budget/variance-xlsx/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getSessionUser, canAccessDomain } from '@/lib/auth';
import { buildBudgetVariance } from '@/lib/fmplus/budget/variance';
import { buildVarianceXlsx } from '@/lib/fmplus/budget/exports/variance-xlsx';
import { ScenarioSchema } from '@/lib/fmplus/budget/schema';

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || !canAccessDomain(user, 'fmplus')) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const url = new URL(req.url);
  const projectId = Number(url.searchParams.get('project') ?? 0);
  const year = Number(url.searchParams.get('year') ?? new Date().getUTCFullYear());
  const scenario = ScenarioSchema.safeParse(url.searchParams.get('scenario') ?? 'initial');
  const through = Number(url.searchParams.get('through') ?? new Date().getUTCMonth() + 1);
  if (!projectId || !scenario.success) {
    return new NextResponse('Bad request', { status: 400 });
  }
  const report = await buildBudgetVariance({
    projectId, fiscalYear: year, scenario: scenario.data, ytdThrough: through,
  });
  if (!report) return new NextResponse('Not found', { status: 404 });
  const buf = await buildVarianceXlsx(report);
  const fname = `variance-${report.project_name}-${year}-${scenario.data}.xlsx`.replace(/[^a-zA-Z0-9._-]/g, '_');
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fname}"`,
    },
  });
}
```

- [ ] **Step 3: Add Export XLSX button to Variance page**

In `src/app/fmplus/financial/budget/variance/page.tsx`, in the header next to `<PeriodControl />`, add:

```tsx
<a href={`/api/fmplus/budget/variance-xlsx?project=${projectId}&year=${year}&scenario=${scenario}&through=${through}`}
   className="text-sm px-3 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">⬇ XLSX</a>
```

- [ ] **Step 4: Verify build + smoke test**

Run: `npm run build`. Visit a Variance page → click ⬇ XLSX → file downloads with one worksheet per segment plus a Meta sheet.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/budget/exports/variance-xlsx.ts src/app/api/fmplus/budget/variance-xlsx/ src/app/fmplus/financial/budget/variance/page.tsx
git commit -m "feat(fmplus): Variance XLSX export"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 25: Variance — PDF export (react-pdf)

**Files:**
- Create: `src/lib/fmplus/budget/exports/variance-pdf.tsx`
- Create: `src/app/api/fmplus/budget/variance-pdf/route.ts`
- Modify: `src/app/fmplus/financial/budget/variance/page.tsx` (add Export PDF link)

- [ ] **Step 1: Write `variance-pdf.tsx`**

```tsx
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { BudgetVarianceReport } from '../types';

const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

const styles = StyleSheet.create({
  page:    { padding: 28, fontSize: 8, fontFamily: 'Helvetica' },
  h1:      { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  meta:    { fontSize: 8, color: '#666', marginBottom: 12 },
  sectionTitle: { fontSize: 10, fontWeight: 700, marginTop: 12, marginBottom: 4 },
  table:   { display: 'flex', flexDirection: 'column', borderTop: '1px solid #ccc' },
  row:     { flexDirection: 'row', borderBottom: '1px solid #eee' },
  cell:    { padding: 3, flex: 1, borderRight: '1px solid #eee' },
  cellSm:  { padding: 3, width: 28, borderRight: '1px solid #eee', textAlign: 'right' },
  cellMd:  { padding: 3, width: 50, borderRight: '1px solid #eee', textAlign: 'right' },
  catCell: { padding: 3, width: 80, borderRight: '1px solid #eee', fontWeight: 700 },
  totalRow:{ backgroundColor: '#f5f5f5', fontWeight: 700 },
});

export function VariancePdfDocument({ report }: { report: BudgetVarianceReport }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.h1}>{report.project_name} — Variance Report</Text>
        <Text style={styles.meta}>FY {report.fiscal_year} · Scenario: {report.scenario} · Status: {report.status} · Generated {new Date().toISOString().slice(0,10)}</Text>

        {report.segments.map(seg => (
          <View key={seg.segment_id} wrap={false}>
            <Text style={styles.sectionTitle}>{seg.service_line.toUpperCase()}{seg.is_stub ? ' (stub — no variance)' : ''}</Text>
            <View style={styles.table}>
              <View style={styles.row}>
                <Text style={styles.catCell}>Category</Text>
                {MONTHS.map(m => <Text key={m} style={styles.cellSm}>{new Date(2000, m-1, 1).toLocaleString('en', { month: 'short' })}</Text>)}
                <Text style={styles.cellMd}>YTD B</Text>
                <Text style={styles.cellMd}>YTD A</Text>
                <Text style={styles.cellMd}>Var</Text>
                <Text style={styles.cellMd}>Var %</Text>
              </View>
              {seg.categories.map(cat => (
                <View key={cat.category} style={styles.row}>
                  <Text style={styles.catCell}>{cat.category}</Text>
                  {MONTHS.map(m => {
                    const c = cat.cells.find(x => x.month === m);
                    return <Text key={m} style={styles.cellSm}>{c ? Math.round(c.budget / 1000) + 'k' : '—'}</Text>;
                  })}
                  <Text style={styles.cellMd}>{Math.round(cat.ytd.budget).toLocaleString()}</Text>
                  <Text style={styles.cellMd}>{Math.round(cat.ytd.actual).toLocaleString()}</Text>
                  <Text style={styles.cellMd}>{Math.round(cat.ytd.variance).toLocaleString()}</Text>
                  <Text style={styles.cellMd}>{cat.ytd.variance_pct == null ? '—' : cat.ytd.variance_pct.toFixed(1) + '%'}</Text>
                </View>
              ))}
              <View style={[styles.row, styles.totalRow]}>
                <Text style={styles.catCell}>Total</Text>
                {MONTHS.map(m => <Text key={m} style={styles.cellSm}>—</Text>)}
                <Text style={styles.cellMd}>{Math.round(seg.ytd.budget).toLocaleString()}</Text>
                <Text style={styles.cellMd}>{Math.round(seg.ytd.actual).toLocaleString()}</Text>
                <Text style={styles.cellMd}>{Math.round(seg.ytd.variance).toLocaleString()}</Text>
                <Text style={styles.cellMd}>{seg.ytd.variance_pct == null ? '—' : seg.ytd.variance_pct.toFixed(1) + '%'}</Text>
              </View>
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Write the API route**

Create `src/app/api/fmplus/budget/variance-pdf/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getSessionUser, canAccessDomain } from '@/lib/auth';
import { buildBudgetVariance } from '@/lib/fmplus/budget/variance';
import { ScenarioSchema } from '@/lib/fmplus/budget/schema';
import { VariancePdfDocument } from '@/lib/fmplus/budget/exports/variance-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || !canAccessDomain(user, 'fmplus')) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const url = new URL(req.url);
  const projectId = Number(url.searchParams.get('project') ?? 0);
  const year = Number(url.searchParams.get('year') ?? new Date().getUTCFullYear());
  const scenario = ScenarioSchema.safeParse(url.searchParams.get('scenario') ?? 'initial');
  const through = Number(url.searchParams.get('through') ?? new Date().getUTCMonth() + 1);
  if (!projectId || !scenario.success) {
    return new NextResponse('Bad request', { status: 400 });
  }
  const report = await buildBudgetVariance({
    projectId, fiscalYear: year, scenario: scenario.data, ytdThrough: through,
  });
  if (!report) return new NextResponse('Not found', { status: 404 });
  const buf = await renderToBuffer(<VariancePdfDocument report={report} />);
  const fname = `variance-${report.project_name}-${year}-${scenario.data}.pdf`.replace(/[^a-zA-Z0-9._-]/g, '_');
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fname}"`,
    },
  });
}
```

- [ ] **Step 3: Add PDF button to Variance page header**

Adjacent to the XLSX button:

```tsx
<a href={`/api/fmplus/budget/variance-pdf?project=${projectId}&year=${year}&scenario=${scenario}&through=${through}`}
   className="text-sm px-3 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">⬇ PDF</a>
```

- [ ] **Step 4: Verify build + smoke test**

Run: `npm run build`. Expected: success.

Visit a Variance page → click ⬇ PDF → A4 landscape PDF downloads with one section per service line.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fmplus/budget/exports/variance-pdf.tsx src/app/api/fmplus/budget/variance-pdf/ src/app/fmplus/financial/budget/variance/page.tsx
git commit -m "feat(fmplus): Variance PDF export (react-pdf, A4 landscape)"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

### Task 26: Integration test — AUC happy path end-to-end

**Files:**
- Create: `src/lib/fmplus/budget/integration.test.ts`

- [ ] **Step 1: Write the end-to-end test**

This test exercises the full pipeline against a real Supabase instance (test DB or the dev project). It is gated behind an env var so it doesn't run by default.

Create `src/lib/fmplus/budget/integration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRichAucStyleXlsx } from './parsers/rich-auc-style';
import { commitBudget } from './commit';
import { buildBudgetVariance } from './variance';
import { supabaseAdmin } from '@/lib/supabase';

const RUN = !!process.env.FMPLUS_BUDGET_INTEGRATION;

describe.skipIf(!RUN)('FMPLUS budget — AUC end-to-end', () => {
  it('imports AUC sheet → publishes → variance reconciles within 0.5%', async () => {
    const sb = supabaseAdmin();
    const { data: aa } = await sb.from('odoo_analytic_accounts').select('id, name').ilike('name', 'AUC').maybeSingle();
    expect(aa, 'AUC analytic account must exist').toBeTruthy();
    const auc = aa as { id: number; name: string };

    // Parse the fixture
    const buf = readFileSync(join(__dirname, '__fixtures__', 'auc-budget.xlsx'));
    const parsed = await parseRichAucStyleXlsx(buf, { project: 'AUC' });
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows.length).toBeGreaterThan(50);

    // Commit as Initial 2026, Published
    const result = await commitBudget({
      projectId: auc.id, fiscalYear: 2026, scenario: 'initial',
      startMonth: 1, rows: parsed.rows, publish: true,
    });
    expect(result.budgetId).toBeGreaterThan(0);
    expect(result.status).toBe('published');

    // Build variance — through Aug (covers low season + half of high)
    const variance = await buildBudgetVariance({
      projectId: auc.id, fiscalYear: 2026, scenario: 'initial', ytdThrough: 8,
    });
    expect(variance).toBeTruthy();
    expect(variance!.segments).toHaveLength(1);
    expect(variance!.segments[0].service_line).toBe('hk');

    // High-season annual total reconciliation: ~42.6M EGP per the AUC sheet
    const hkSeg = variance!.segments[0];
    const annualBudget = hkSeg.categories.flatMap(c => c.cells).reduce((s, c) => s + c.budget, 0);
    const expectedAnnual = 42_597_923;
    const drift = Math.abs(annualBudget - expectedAnnual) / expectedAnnual;
    expect(drift, `annual budget drift ${(drift * 100).toFixed(2)}%`).toBeLessThan(0.005);
  });
});
```

- [ ] **Step 2: Run with the env flag set**

Run: `FMPLUS_BUDGET_INTEGRATION=1 npx vitest run src/lib/fmplus/budget/integration.test.ts`
Expected: PASS — single test. Drift < 0.5%.

If the test fails because the AUC analytic account isn't in the dev DB, run the Odoo financial sync first via `npm run dev`, then the API route `POST /api/odoo/sync-financials` (requires `Authorization: Bearer $CRON_SECRET`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/fmplus/budget/integration.test.ts
git commit -m "test(fmplus): AUC end-to-end integration test (gated by FMPLUS_BUDGET_INTEGRATION env)"
git fetch origin main && git rebase origin/main
git push origin claude/quizzical-hoover-5cfcca:main
```

---

## Final acceptance check

After Task 26, run through the v1 acceptance criteria from the spec ([§16](../specs/2026-05-03-fmplus-project-budget-design.md#16-acceptance-criteria-for-v1)):

- [ ] Migration `0080` applied; 7 tables present; HK template seeded; 5 stubs seeded.
- [ ] `/fmplus/financial/budget/import` accepts `AUC Budget.xlsx` → published budget for AUC FY 2026 Initial; totals match within 0.5%.
- [ ] `/fmplus/financial/budget/variance?project=AUC` renders monthly grid; `budget / actual` per cell; traffic-light tint by deviation %.
- [ ] Click a Variance cell → side drawer lists `odoo_move_lines` for that month + category; vendor / date / amount / journal / account.
- [ ] `/fmplus/financial/budget/compare?service_line=hk` ranks projects by variance %.
- [ ] `/fmplus/financial/budget` Overview shows budgeted projects + anomaly banner.
- [ ] Settings tab editable for admins; non-admin sees read-only message.
- [ ] Editor lets admin pick a stub service line — placeholder segment created with banner; Save Draft works.
- [ ] Editor publish writes `published_at`, `published_by`; subsequent edit writes `budget_audit` row.
- [ ] Vitest unit tests green: schema, templates, variance, parsers, audit, commit.
- [ ] No regressions in Beithady financials or Odoo sync.
