# FM+ Project Budget v2 — Design Spec

**Date:** 2026-05-04
**Author:** Kareem Hady (via Claude brainstorming session, design locked at 95% confidence)
**Status:** Draft → awaiting Kareem's review → then `superpowers:writing-plans`
**Scope:** `/fmplus/financial/budget/**` — full rewrite of the Project Budget feature inside the FM+ Financial section
**Migration:** `0081_fmplus_project_budget_v2.sql` (BIG-BANG — drops v1 tables, creates 10 new)
**Supersedes:** [`2026-05-03-fmplus-project-budget-design.md`](2026-05-03-fmplus-project-budget-design.md) (v1, shipped to main, all 26 tasks complete, immediately deprecated by this spec)

---

## 1. Why v2 (problem statement update)

v1 shipped end-to-end on 2026-05-04 and worked for **AUC** — a single-year, single-service (Housekeeping), 4-sub-location project. The day after merge the user studied four other live FMPLUS budgets and identified gaps that v1's data model cannot absorb without surgery:

| File in `C:\kareemhady\.claude\FMPLUS\` | Shape | What v1 cannot do |
|----|----|----|
| `AUC Budget.xlsx` | 1-year × 1-service × 4 sub-locations | ✓ home turf for v1 |
| `TRIO Budget .xlsx` | 1-year × 4 services + Back Office, BOQ-driven | v1 has only HK template; needs all 7 |
| `City Gate Budget.xlsx` | **2-year** contract (Y1/Y2 sheets), 5 services + Transportation, separate Mobilization sheet, FM Fees Summary | v1 has no multi-year, no contract-level mobilization |
| `Emaar Uptown HK Budget.xlsx` | 1-year × HK × Zone A/B, **richest CTC breakdown** (Net + Relievers + OT + Training + Insurance + Medical), Items Pricelist sheet | v1 manning lines collapse CTC into a single `unit_cost` |
| (`ACUD R3 Budget` was mentioned but no file present in folder.) | | |

The user also added 8 explicit business requirements that v1 does not meet:

1. Multi-service projects (Citygate-style: Security + HK + MEP + Landscape + Pest + Waste + Transportation).
2. Multi-year contracts with both inflation-based AND line-by-line escalation (City Gate Y1/Y2 pattern).
3. Revenue inflation per year.
4. Manpower ramp per contract clauses (HC grows year-over-year).
5. **NEW Governmental Expenses category** (تامينات مقاولات + tax stamps + work permits).
6. Different expense category groupings per service line.
7. **"+ Add line" UX** with dropdown from a per-project Catalog (vs v1's fixed template).
8. Project-level contract metadata (customer, dates, duration, contract value, VAT, reimbursables).

v2 is a from-scratch rebuild aimed at all five reference files, all 8 requirements, and 10 enhancement suggestions absorbed during brainstorming (see §17).

## 2. Goals

- **One contract, many years, many services.** A single `project_contracts` row anchors a 1- to N-year FMPLUS contract carrying any subset of 7 service lines. Year tabs (Y1/Y2/...) live in the Editor. "Copy Y1 → Y2 + 7% inflation" is a one-click flow.
- **Catalog-driven line entry.** "+ Add line" opens a searchable picker fed by a global `fmplus_catalog` (admin-curated, seeded from `Emaar Uptown HK Budget.xlsx → Items Pricelist`) with per-project overrides. Free-text fallback when an item isn't in the catalog yet.
- **All 7 service-line templates fully baked.** HK · MEP · Landscape · Security · Pest Control · Waste Management · Back Office. Each template lists default sections + default rows. User can delete inapplicable rows on a per-project basis.
- **Mobilization as a first-class concept.** A `mobilization_lines` table holds one-time / capital items per contract; the Variance/P&L view amortizes them across contract duration (default 24 months).
- **Bilingual labels.** Catalog and template labels carry `name_en` + `name_ar`. UI flips on a session toggle.
- **Project Hub** — a new top-level tab listing every contract as a card with KPIs (revenue, GM%, Y1 vs Y2 trend, mobilization ROI, health). Doubles as the contract-creation entry point.
- **Reuse v1's variance engine, not v1's data model.** The Variance/Compare/Settings tabs keep their UX (asymmetric thresholds, drill-to-journal, unmapped-account drift) but read from v2 tables.

## 3. Non-goals (explicitly out of scope)

- Anything in v1's non-goals list still applies (FM+ shell, currency conversion, mobile layout, multi-approver workflow, forecasting, etc.).
- **Per-zone variance** (Emaar Uptown's Zone A vs Zone B). Zones are project metadata only; budget lines aggregate to project total. Same compromise as v1's sub-location handling.
- **Auto-detecting an existing v1 budget on migration.** Migration `0081` drops v1 tables. There is exactly **one** v1 production budget today (AUC FY 2026 Initial); the user has accepted re-entry through v2.
- **Per-zone Odoo analytic accounts.** Odoo still has one analytic account per project. v2 does not invent zone-level scoping for variance.
- **Sub-second Catalog autocomplete.** The catalog is bounded (~80–100 items at seed); a normal client-side filter is fine for v1 of v2.
- **Workflow editor for Catalog** (visual category builder). Catalog items are inserted via the Settings → Catalog table; service-line templates are still code-seeded.
- **Editing the contract structure mid-contract** in a way that re-shapes Y1 history. New revisions go to a new scenario, same as v1.

## 4. Decisions made during brainstorming

(Brainstorm conversation lives in worktree `quizzical-hoover-5cfcca` SESSION_HANDOFF.md, design-locked entry. Summarized here.)

| # | Question | Decision | Rationale |
|---|----|----|----|
| Q1 | Migration strategy | **A — Big bang.** `0081` drops v1 tables (`project_budgets`, `budget_lines`, `project_budget_segments`, `budget_revenue_lines`, `budget_audit`, `budget_settings`, `budget_templates`) and creates v2 fresh. | Only one v1 budget exists in prod (AUC). Avoids carrying a v1↔v2 translation layer forever. |
| Q2 | Year-tracking semantics | **C — Hybrid.** `project_contracts.year_tracking` flag (`'contract'` or `'fiscal'`) per project. Contract-anchored years for AUC/TRIO/Emaar; fiscal-year tracking for projects whose accounting year is the calendar year. | City Gate is contract-anchored (2-year deal, Y1 & Y2 don't align to calendar). Other projects align to FY. |
| Q3 | Catalog scope | **B — Global + per-project.** `fmplus_catalog` (admin-managed, seeded from Emaar Pricelist) + `project_catalog_overrides`. | Most prices repeat across projects (uniforms, tools). Some need project-specific tweaks (transport rates per route). |
| Q4 | Inflation / escalation | **C — Both.** "Copy Y1 → Y2" dialog with 3 uniform % knobs (revenue / manpower CTC / non-manpower) + "Tweak per line" expand panel for surgical overrides. | Matches City Gate behaviour: most lines escalate uniformly, a few specific lines have contract-clause-driven different escalation rates. |
| Q5 | Zones | **C — Project-metadata only.** `project_contracts.zones jsonb` for reference; lines don't carry a zone dimension. AUC's 4 sub-locations collapse to project totals in v2. | Odoo only has one analytic account per project; per-zone variance can't be computed against actuals anyway. v1 made the same trade-off. |
| Q6 | Mobilization | **C — Project-level entity.** Separate `mobilization_lines` table, amortized across contract duration (default 24 months). | City Gate has a separate Mobilization sheet; Emaar Uptown has Items Pricelist that includes mob items. v1 had a `flat` calc on a `overhead` category — too coarse, and amortization is wrong against a multi-year contract. |
| Q7 | Templates | **B — All 7 service lines fully baked at launch + user can delete inapplicable rows per project.** | TRIO + City Gate provide enough seed material to define MEP/Landscape/Security/Pest/Waste/Back Office templates without further data hunting. |

## 5. Architecture

**Approach:** Same hybrid pattern as v1 — native React form editor + flat XLSX import + legacy rich-XLSX parser — but with the data model expanded for contracts, years, services, catalog, and mobilization.

### 5.1 Module layout — 8 sub-tabs (was 6 in v1)

`/fmplus/financial/budget` → tab strip:

| Sub-tab | Route | New in v2? | Purpose |
|---------|-------|-----------|---------|
| 📊 Overview | `/fmplus/financial/budget` | (kept, redesigned) | Portfolio table — same KPIs as v1 + new "GM%" + "Mob. ROI" columns + bilingual toggle. |
| 🏗️ Project Hub | `/fmplus/financial/budget/projects` | **NEW** | Contract-card grid. One card per `project_contracts` row showing customer, duration, contract value, GM%, Y1/Y2 trend sparkline, mobilization-ROI badge, health dot. Click a card → Editor for the latest year of that contract. **+ New Contract** button is the only entry point for creating a new project. |
| ✏️ Editor | `/fmplus/financial/budget/edit?contract=X&year=1&service=hk` | (rewritten) | Year tabs (Y1/Y2/...) + "+ Add year" + "Copy year". Service-line tabs within each year. Section accordion within each service. **+ Add line** opens Catalog picker. Save Draft / Publish per year. |
| 📚 Catalog | `/fmplus/financial/budget/catalog` | **NEW** | Searchable table of `fmplus_catalog` items + per-project override panel. Bulk import from XLSX. Admin-only edit. |
| 📥 Import | `/fmplus/financial/budget/import` | (kept, expanded) | XLSX upload, auto-detects: AUC-style / TRIO-style / City-Gate-multi-year / Emaar-Zone-style / flat. Preview before commit. |
| 📈 Variance | `/fmplus/financial/budget/variance?contract=X&year=1` | (kept) | Single-year, single-service deep dive — month × category grid. Drill-to-journal side drawer. |
| ⚖️ Compare | `/fmplus/financial/budget/compare?service_line=hk` | (kept, expanded) | Multi-project + new **"Year-vs-Year"** mode. |
| ⚙️ Settings | `/fmplus/financial/budget/settings` | (kept, expanded) | Variance thresholds (asymmetric) + per-line threshold override + Service-line template list + unmapped-account drift + bilingual default. |

### 5.2 Server module structure

```
src/lib/fmplus/budget/
  templates/
    hk.ts              ← fully baked, expanded with richer CTC breakdown
    mep.ts             ← fully baked (was stub in v1)
    landscape.ts       ← fully baked
    security.ts        ← fully baked
    pest-ctrl.ts       ← fully baked
    waste-mgmt.ts      ← fully baked
    back-office.ts     ← NEW (Citygate / TRIO style)
    governmental.ts    ← NEW global category seed (تامينات مقاولات etc.)
    index.ts           ← exports getTemplate(serviceLine, version)
  parsers/
    rich-auc-style.ts        ← v1 parser, preserved
    trio-style.ts            ← NEW
    city-gate-multi-year.ts  ← NEW
    emaar-zone-style.ts      ← NEW
    flat-template.ts         ← v1 parser, preserved
    flat-template-export.ts  ← v1 writer, preserved
    auto-detect.ts           ← NEW dispatcher: sniffs sheet names → returns parser ID
  contracts/
    create.ts          ← server action: new contract wizard commit
    duplicate.ts       ← "Copy Y1 → Y2" with inflation knobs
    rollover.ts        ← FY-end auto-rollover (cron-driven, optional)
  catalog/
    upsert.ts
    search.ts          ← server-side substring + tags search
    overrides.ts       ← per-project overrides resolver
  variance.ts          ← buildBudgetVarianceV2(opts)
  variance-drill.ts    ← cellToMoveLines(opts), unchanged contract
  mobilization.ts      ← amortizeMobilization(contractId): rolls into variance
  audit.ts             ← writeAuditOnPublishedEdit(...)
  inflation-calc.ts    ← preview engine for "Copy year" dialog
  schema.ts            ← Zod schemas
  types.ts             ← Pure TS types
```

Routes use server actions for mutation (Editor save, Import commit, Publish, Catalog upsert, Contract create) and `force-dynamic` server components for read pages.

## 6. Data model

Migration `supabase/migrations/0081_fmplus_project_budget_v2.sql`:

```sql
-- DROP v1 tables (in dependency order). User has accepted loss of AUC v1 budget.
drop table if exists public.budget_audit cascade;
drop table if exists public.budget_revenue_lines cascade;
drop table if exists public.budget_lines cascade;
drop table if exists public.project_budget_segments cascade;
drop table if exists public.project_budgets cascade;
drop table if exists public.budget_settings cascade;
drop table if exists public.budget_templates cascade;

-- v2 ENUMs (text-checked for migration ergonomics; switch to native enums later if needed)
-- service_line: 'hk' | 'mep' | 'landscape' | 'security' | 'pest_ctrl' | 'waste_mgmt' | 'back_office'
-- year_tracking: 'contract' | 'fiscal'
-- scenario: 'initial' | 'revised' | 'reforecast'
-- status: 'draft' | 'published'
-- mob_amortization: 'straight_line' | 'flat'
-- catalog_unit: 'each' | 'monthly' | 'annual' | 'per_head' | 'liter' | 'kg' | 'm2'

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
  zones           jsonb not null default '[]'::jsonb, -- reference only
  notes           text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, name)
);
create index on public.project_contracts (project_id);

-- Which service lines this contract covers
create table public.project_services (
  id              bigserial primary key,
  contract_id     bigint not null references public.project_contracts(id) on delete cascade,
  service_line    text not null check (service_line in
                    ('hk','mep','landscape','security','pest_ctrl','waste_mgmt','back_office')),
  template_version int not null,
  unique (contract_id, service_line)
);

-- One row per year of the contract (Y1, Y2, ...)
create table public.project_years (
  id              bigserial primary key,
  contract_id     bigint not null references public.project_contracts(id) on delete cascade,
  year_index      int  not null check (year_index >= 1),       -- 1, 2, 3
  fiscal_year     int,                                          -- nullable when year_tracking='contract'
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
create index on public.project_years (contract_id);

-- Per-(year, service) revenue + manpower ramp (HC grows YoY per contract clauses)
create table public.project_year_services (
  id              bigserial primary key,
  year_id         bigint not null references public.project_years(id) on delete cascade,
  service_line    text not null,
  monthly_revenue numeric(14,2) not null default 0,
  vat_pct         numeric(5,2)  not null default 14,
  manpower_ramp   jsonb not null default '{}'::jsonb,           -- { "hk_manager": 1, "hk_mf_8h": 240 } overrides
  unique (year_id, service_line)
);

-- The line items themselves (one row per (year, service, category, line, season))
create table public.budget_lines (
  id              bigserial primary key,
  year_id         bigint not null references public.project_years(id) on delete cascade,
  service_line    text not null,
  category        text not null,                                -- 'manning' | 'ppe' | 'tools' | 'consumables' | 'transport' | 'it' | 'governmental' | 'other'
  line_code       text not null,                                -- matches template line.code OR catalog item.code
  catalog_item_id bigint references public.fmplus_catalog(id),  -- nullable when free-text
  label_en        text not null,
  label_ar        text,
  season          text not null default 'high'
                    check (season in ('high','low')),
  qty             numeric(12,4) not null default 0,
  unit_cost       numeric(14,2) not null default 0,
  monthly_cost    numeric(14,2) generated always as (qty * unit_cost) stored,
  -- Richer CTC breakdown (manning lines only; nullable elsewhere)
  ctc_net         numeric(14,2),
  ctc_relievers   numeric(14,2),
  ctc_ot          numeric(14,2),
  ctc_training    numeric(14,2),
  ctc_insurance   numeric(14,2),
  ctc_medical     numeric(14,2),
  -- Per-line variance threshold override (NULL = use global)
  threshold_green numeric(5,2),
  threshold_amber numeric(5,2),
  notes           text,
  created_at      timestamptz not null default now()
);
create index on public.budget_lines (year_id, service_line, category);
create index on public.budget_lines (catalog_item_id);

-- Mobilization / one-time / capital items, amortized across contract duration
create table public.mobilization_lines (
  id              bigserial primary key,
  contract_id     bigint not null references public.project_contracts(id) on delete cascade,
  category        text not null,                                -- 'capex' | 'opex_one_time' | 'training' | 'recruitment'
  label_en        text not null,
  label_ar        text,
  qty             numeric(12,4) not null default 1,
  unit_cost       numeric(14,2) not null default 0,
  total_cost      numeric(14,2) generated always as (qty * unit_cost) stored,
  amortization    text not null default 'straight_line'
                    check (amortization in ('straight_line','flat')),
  amortization_months int not null default 24,
  notes           text
);
create index on public.mobilization_lines (contract_id);

-- Global catalog of priced items (admin-curated, seeded from Emaar Pricelist)
create table public.fmplus_catalog (
  id              bigserial primary key,
  code            text unique not null,                         -- e.g. 'uniform_polo_hk'
  name_en         text not null,
  name_ar         text,
  unit            text not null check (unit in
                    ('each','monthly','annual','per_head','liter','kg','m2')),
  default_price   numeric(14,2) not null,
  service_lines   text[] not null default '{}',                 -- which services this item is relevant to
  category        text not null,                                -- default category bucket
  tags            text[] not null default '{}',                 -- search tags (en + ar)
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.fmplus_catalog using gin (tags);
create index on public.fmplus_catalog using gin (service_lines);

-- Per-project price/qty overrides on top of catalog
create table public.project_catalog_overrides (
  id              bigserial primary key,
  contract_id     bigint not null references public.project_contracts(id) on delete cascade,
  catalog_item_id bigint not null references public.fmplus_catalog(id) on delete cascade,
  unit_cost       numeric(14,2),                                -- override price
  notes           text,
  unique (contract_id, catalog_item_id)
);

-- Audit log on any published edit
create table public.budget_audit (
  id              bigserial primary key,
  year_id         bigint not null references public.project_years(id) on delete cascade,
  changed_at      timestamptz not null default now(),
  changed_by      uuid references auth.users(id),
  diff_json       jsonb not null
);

-- Global settings + thresholds
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
```

Touch trigger on `updated_at` columns (project conventions, applied to `project_contracts`, `project_years`, `fmplus_catalog`, `budget_settings`).

### 6.1 Service-line template seeds (all 7 fully baked)

Each `project_services` row carries a `template_version` int referencing a `templates/<service>.ts` module. Templates are code-seeded TS objects (not DB rows) — they describe the **default** line set. User edits the live `budget_lines` rows; the template just bootstraps a new year.

#### 6.1.1 HK template (expanded from v1's AUC model + Emaar's CTC breakdown)

```ts
// src/lib/fmplus/budget/templates/hk.ts (v1 of v2)
export const hkTemplate = {
  service_line: 'hk',
  version: 1,
  vat_pct: 14,
  default_seasons: { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] },
  categories: [
    { code: 'manning',      label_en: 'Manning',      label_ar: 'العمالة',
      lines: [
        // Subset shown — full list ~18 roles; uses richer CTC breakdown columns
        { code: 'hk_manager',    label_en: 'HK Manager',          label_ar: 'مدير النظافة' },
        { code: 'asst_manager',  label_en: 'Assistant Manager',   label_ar: 'مدير مساعد' },
        { code: 'sr_supervisor', label_en: 'Senior Supervisor',   label_ar: 'مشرف أول' },
        { code: 'sup_8h',        label_en: 'Supervisor 8H',       label_ar: 'مشرف 8 ساعات' },
        { code: 'hk_mf_8h',      label_en: 'HK Male & Female 8H', label_ar: 'عامل/ة نظافة' },
        { code: 'facades_sup',   label_en: 'Facades Supervisor',  label_ar: 'مشرف واجهات' },
        { code: 'facades_lab',   label_en: 'Facades Labor',       label_ar: 'عامل واجهات' },
        { code: 'waste_sup',     label_en: 'Waste Supervisor',    label_ar: 'مشرف نفايات' },
        { code: 'waste_lab',     label_en: 'Waste Labor',         label_ar: 'عامل نفايات' },
        // ... admin, storekeeper, driver, trainer, reliever roles
      ]},
    { code: 'ppe',          label_en: 'Uniform & PPE',                label_ar: 'الزي والمعدات الواقية' },
    { code: 'tools',        label_en: 'Tools, Machinery & Consumables', label_ar: 'الأدوات والآلات والمستهلكات' },
    { code: 'transport',    label_en: 'Transportation & Vehicles',    label_ar: 'النقل والمركبات' },
    { code: 'it',           label_en: 'IT & Communication',           label_ar: 'تقنية المعلومات والاتصال' },
    { code: 'governmental', label_en: 'Governmental Expenses',        label_ar: 'المصروفات الحكومية',
      lines: [
        { code: 'gov_taminat',     label_en: 'Contractor Insurance (تامينات مقاولات) — 1.4% of revenue', label_ar: 'تامينات مقاولات (1.4٪ من الإيرادات)' },
        { code: 'gov_tax_stamps',  label_en: 'Tax Stamps',          label_ar: 'دمغات وضرائب' },
        { code: 'gov_work_permit', label_en: 'Work Permits',        label_ar: 'تصاريح عمل' },
      ]},
  ],
  account_map_json: [
    { category: 'manning',      code_patterns: ['^5000(0[1-9]|1[0-4])$'] },
    { category: 'ppe',          code_patterns: ['^500011$'] },
    { category: 'tools',        code_patterns: ['^5002(0[1-9]|1[0-9])$', '^5001(0[1-9]|1[0-9])$'] },
    { category: 'transport',    code_patterns: ['^5005[0-9]{2}$'] },
    { category: 'it',           code_patterns: ['^5003(0[1-9]|1[0-9])$'] },
    { category: 'governmental', code_patterns: ['^5006[0-9]{2}$'] },     // new chart-of-accounts range
  ],
};
```

(Other 6 templates follow the same shape; full content in the `templates/*.ts` files when implemented. Plan task will define each one based on TRIO + City Gate + Emaar reference sheets.)

#### 6.1.2 Manning lines: CTC breakdown

Manning lines may set the 6 CTC component columns (`ctc_net`, `ctc_relievers`, `ctc_ot`, `ctc_training`, `ctc_insurance`, `ctc_medical`). The Editor shows a "Show CTC breakdown" toggle that expands the row inline. `unit_cost` is computed as `SUM(ctc_*)` when any component is non-null, otherwise the user enters `unit_cost` directly. This preserves Emaar's level of detail without forcing it on smaller projects.

#### 6.1.3 Governmental category as a global add-on

Every service-line template inherits a Governmental section (3 default lines: تامينات مقاولات, tax stamps, work permits). Inserted via `getTemplate(...)`'s post-merge step in `templates/index.ts`. User can delete unused lines per project.

### 6.2 Catalog seed

`fmplus_catalog` is seeded from `FMPLUS/Emaar Uptown HK Budget.xlsx → Items Pricelist` sheet. Expected ~80–100 items at launch covering uniforms, tools, machinery, consumables, transport, ICT. See plan task **Seed `fmplus_catalog`** for the parsed CSV.

## 7. Excel ingest (5 paths now, was 2 in v1)

Auto-detection happens before any parsing. `auto-detect.ts` sniffs:

| Pattern | Detected via | Parser |
|----|----|----|
| Multiple `Y1 -*` and `Y2 -*` sheets + `FM Fees Summary` | Sheet name regex | `city-gate-multi-year.ts` |
| `Items Pricelist` + zone column header (`Zone A`, `Zone B`) | Sheet name + col header | `emaar-zone-style.ts` |
| `Back Office`, `BOQ Summary` sheets | Sheet name | `trio-style.ts` |
| Per-category detail sheets matching `* Total Manning`, `* Total Equipment`, ... | Sheet name regex | `rich-auc-style.ts` (v1) |
| `project, service_line, year_index, category, line_code, ...` flat header | Header row check | `flat-template.ts` (v1) |
| None of the above | — | Fail with "Unknown XLSX layout" + show all detected sheet names |

Each parser:

1. **Reads the workbook** into a normalized in-memory shape: `{ contract: {...}, services: [...], years: [...], lines: [...], mobilization: [...] }`.
2. **Sanity-checks** parsed totals against the workbook's grand-total cells. < 0.5% tolerance per category; otherwise abort with a parser-mismatch error showing both numbers.
3. **Returns a preview payload**. The Import UI shows: contract metadata, year tabs, service-line tabs, line counts, lines-vs-existing diff if a contract with the same `(project_id, name)` already exists, validation errors inline.
4. **On Commit**: writes the contract, all years, all year-services, all budget_lines, all mobilization_lines in one transaction. Existing same-key contract is **upserted** at contract level; year-level data is replace-and-rewrite for whichever years are in the import.

The flat template is updated to v2 (adds `year_index`, `contract_name`, `customer`, manpower/CTC columns). Editor exports v2-flat. Old v1 flat exports will fail validation (intentional — explicit error message).

## 8. Variance computation (v2)

`src/lib/fmplus/budget/variance.ts`:

```ts
export async function buildBudgetVarianceV2(opts: {
  contractId: number;
  yearIndex: number;
  scenario?: 'initial' | 'revised' | 'reforecast';
  serviceLine?: ServiceLine;     // null = all services in this year
  month?: number;                // null = full year
  ytdThrough?: number;           // for YTD rollup
  bilingual?: 'en' | 'ar';       // label language
}): Promise<BudgetVarianceReportV2>;
```

Steps mirror v1 (load budget → load actuals → join by (segment, category, month) → compute variance with asymmetric thresholds → roll up → drill-down map). Differences:

1. **Mobilization amortization is added to the budget side** before variance. `amortizeMobilization(contractId)` returns a `Map<(year, month, category), amortized_amount>` that is summed into the budget cell. This way the Variance grid shows budget = recurring + amortized mobilization.
2. **Per-line threshold overrides** (`budget_lines.threshold_green` / `threshold_amber`) win over global thresholds when set.
3. **Bilingual labels** flow through. The variance report includes both `label_en` and `label_ar` per line; the UI picks one.
4. **Year-level rollup** is the default unit. "Full contract" rollup is computed by summing year-level rollups, not by re-querying.
5. **The `_unmapped` bucket** still exists and surfaces in Settings.

## 9. UI flows — wireframe summary

### 9.1 Project Hub (NEW)

- Grid of contract cards. Card shows: project name (en/ar toggle), customer, duration (e.g. "Y1 of 2"), contract value, current-year GM%, sparkline of `monthly_actual / monthly_budget`, mobilization-ROI badge (`mob_total / contract_value × 100`), health dot.
- "+ New Contract" CTA (admin only) → wizard:
  1. Pick Odoo analytic account
  2. Customer + dates + contract value + VAT
  3. `year_tracking` choice
  4. Pick service lines (multi-select)
  5. (Optional) seed Y1 from a v2-flat XLSX OR start blank
- Row-tap → Editor at the latest year of that contract.

### 9.2 Editor (rewritten)

- Tab strip: Y1 / Y2 / Y3 / "+ Add year" / "Copy year"
- Within each year: Service-line tabs (HK / MEP / ...) + a project-level "Mobilization" tab + a "Revenue" tab.
- Within each service: section accordions (Manning, PPE, Tools, ...). Each section has rows.
- "+ Add line" button per section → catalog picker modal (search + tags + filter by service_line + filter by category) OR "Add free-text line" tab.
- Manning rows: collapsed = `qty × unit_cost`; expand to show CTC breakdown columns.
- Bilingual toggle in the page header (en/ar). Persists in localStorage.
- "Copy year" dialog (Q4): 3 inflation knobs (revenue/manpower/non-manpower default-filled from `budget_settings`) + "Tweak per line" expand panel showing every line in the source year with editable per-line %.
- Save Draft / Publish per year. Save = atomic; Publish = sets `status='published'`, `published_at`, `published_by`.

### 9.3 Catalog (NEW)

- Searchable table: code · name (en/ar) · unit · default_price · service lines · category · tags · is_active.
- Per-row inline edit (admin only).
- "+ Add item" CTA.
- "Bulk import from XLSX" CTA — re-uses Items Pricelist parser.
- Side panel: "Per-project overrides" — pick a contract → shows `project_catalog_overrides` rows for that contract → inline edit.

### 9.4 Variance / Compare / Settings

Same as v1 with these expansions:
- **Variance**: contract picker → year picker → service picker + Mobilization line shown separately (amortized over contract duration). Cell tooltip shows "of which X EGP is mobilization amortization" when present.
- **Compare**: new "Year-vs-Year" mode toggle. When ON, x-axis becomes Y1/Y2/Y3 instead of project list; rows are categories.
- **Settings**: new sections — bilingual default · default inflation knobs (Q4 defaults) · default mobilization amortization months · per-line threshold override visibility flag.

## 10. Edge cases

| Case | Handling |
|------|----------|
| Contract with no published year | Project Hub card shows "No year yet — create Y1". Variance route 404s gracefully with CTA. |
| User adds a 4th year mid-contract | Allowed. Adds `project_years` row with `year_index=4`. "Copy year" dialog defaults source = Y3. |
| `year_tracking='fiscal'` and contract spans calendar boundary | Y1 may have `start_month != 1`. Months before `start_month` contribute 0 to YTD on Variance grid. |
| Mobilization amortization extends past contract end | Truncated at `end_date`. Settings explicitly notes this; `mobilization.ts` returns 0 for months beyond contract end. |
| Catalog item deleted but referenced by `budget_lines` | `catalog_item_id` is FK with no cascade; deletion fails. Admin must first reassign or null the FK in budget_lines. UI offers "Replace with..." flow. |
| Catalog item price changes after a budget is published | No retroactive change. `budget_lines.unit_cost` is materialized; Catalog default_price is just the picker default. |
| Per-project override changes mid-year | Same as above — only applies to NEW lines added after the change. |
| User tries to import a v1-flat XLSX | Parser detects the v1 column shape and fails with "v1 flat template is no longer supported. Re-export from Editor or download new flat template." |
| Concurrent year edits | Optimistic concurrency on `project_years.updated_at`. |
| Project archived in Odoo | `odoo_analytic_accounts` row stays (sync is upsert-only). Contract continues to display + report; new year creation disabled with a banner. |
| All v1 budgets are gone | Acceptable — only AUC v1 existed in prod. Re-entry effort is one afternoon. |
| Service-line template doesn't have a Governmental section | All templates inherit it via `templates/index.ts` post-merge. Code-enforced. |
| `qty * unit_cost` overflow | numeric(14,2) — same ceiling as v1. |

## 11. Phasing

### v2.0 (this spec, single PR series)

- Migration `0081` (drops v1, creates 10 new tables).
- 7 service-line templates fully baked.
- Catalog seeded (~80–100 items) from Emaar Pricelist.
- All 8 sub-tabs functional.
- 5 Excel parsers (auto-detect dispatcher).
- Variance v2 (with mobilization amortization + per-line threshold override).
- Bilingual UI toggle.
- "Copy year + inflation" dialog.
- Project Hub with contract cards.
- PDF + XLSX export updated for v2 schema.

### v2.1+ (future)

- Auto-rollover at FY end (cron-driven, optional, behind a setting flag).
- CTC inflation calculator preview as a standalone tab.
- Year-over-year template suggestion ("propose Y3 from Y2 + actuals").
- Cross-service-line FMPLUS-wide rollup view.
- Re-forecast scheduling automation.
- Catalog versioning (price history).

## 12. Permissions

Same as v1:

- **View** (Overview, Project Hub, Variance, Compare): any signed-in FM+ user.
- **Edit / Import / Publish / Catalog edit / Settings**: admin only. `requireAdmin()` reused.

## 13. Interfaces with the FM+ shell (parallel session)

Unchanged from v1. The FM+ shell owns `/fmplus` + `/fmplus/financial`. This module owns `/fmplus/financial/budget/**` and stays drop-in.

## 14. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Big-bang migration drops the AUC v1 budget unrecoverably | Cert | Low (1 budget; user accepted) | Migration is forward-only; AUC re-entry is one afternoon via v2 Editor + AUC.xlsx import. |
| 5 parsers double the surface area for ingest bugs | Med | Med | Each parser ships with its reference XLSX as a vitest fixture; > 0.5% drift fails the test. |
| Catalog tagging quality drives picker UX | High | Med | Seed includes en+ar tags from the Items Pricelist; admin can iterate from Catalog tab without code changes. |
| Multi-year copy dialog lets user double-inflate (apply % twice) | Med | Med | Dialog is single-shot; closing without commit discards. Audit log records the inflation knobs used. |
| 7 templates are inconsistent in label conventions | Med | Low | `templates/index.ts` enforces a Zod schema; lint test asserts every template parses. |
| Mobilization amortization gets confused with monthly opex | Low | Med | `mobilization_lines` is a separate table; it never lands in `budget_lines`. Variance UI labels mob amount inline in cell tooltip. |
| Bilingual toggle leaks untranslated labels | High | Low | Fallback rule: `label_ar ?? label_en`. Settings panel shows "% lines with Arabic label" per template for monitoring. |
| 60+ contracts × 3 scenarios × N years scales beyond the page | Low | Low | Project Hub paginates if > 50 cards; Compare aggregates server-side; Variance is per-contract-year. |
| Workflow boundary: contract creation wizard vs Editor confusion | Med | Low | "+ New Contract" only on Project Hub. Editor never lets you create a new contract — only new years on an existing contract. |

## 15. Open questions (to confirm before / during implementation)

None blocking. Items revisited during build:

1. Should the "Year-vs-Year" Compare mode also compare contracts with each other when both are multi-year (e.g. CityGate Y1 vs AUC Y2)? → Default v2.0 NO (apples to apples within a single contract); cross-contract comparison stays on the Compare tab's existing project-rank mode.
2. Should the catalog picker show suggestions from the user's recent picks (per-user MRU)? → v2.0 NO. Defer to v2.1 if friction emerges.
3. Should "Tweak per line" in the inflation dialog default to all lines visible or collapsed-by-default? → Default collapsed; expand per-line on demand. Dialog shows count of overridden lines next to commit button.
4. Translation policy: what's the source of truth for Arabic labels? → Plan assumes admin edits in the Catalog/Settings; no auto-translation. Templates ship with seed Arabic labels reviewed by Kareem.

## 16. Acceptance criteria for v2.0

- [ ] Migration `0081_fmplus_project_budget_v2.sql` applied; 10 v2 tables present; 7 v1 tables dropped; `budget_settings` row present; templates resolvable via `getTemplate()`.
- [ ] `/fmplus/financial/budget/projects` (Project Hub) lists 0 contracts on a fresh DB; "+ New Contract" wizard creates a contract end-to-end; card appears.
- [ ] `/fmplus/financial/budget/import` accepts `AUC Budget.xlsx` and produces a complete published Y1 for the AUC contract — totals match within 0.5 %.
- [ ] `/fmplus/financial/budget/import` accepts `City Gate Budget.xlsx`, auto-detects the 2-year layout, produces both Y1 and Y2 published.
- [ ] `/fmplus/financial/budget/import` accepts `TRIO Budget .xlsx`, auto-detects multi-service layout, produces all services in Y1.
- [ ] `/fmplus/financial/budget/import` accepts `Emaar Uptown HK Budget.xlsx`, auto-detects zone layout, **collapses zones to project total** (per Q5), populates richer CTC columns per manning row.
- [ ] `/fmplus/financial/budget/edit?contract=<id>&year=1` renders year tabs, service-line tabs, "+ Add line" picker fed from `fmplus_catalog`.
- [ ] "Copy Y1 → Y2" dialog: 3 uniform % knobs apply correctly; "Tweak per line" accepts overrides; commits both year + inflation diffs to `budget_audit`.
- [ ] `/fmplus/financial/budget/catalog` lists seeded items; admin can edit a row; non-admin sees read-only.
- [ ] `/fmplus/financial/budget/variance?contract=<id>&year=1` renders monthly grid; mobilization amortization is summed into the budget cell; tooltip shows the amortized component.
- [ ] Per-line threshold override (set on a `manning` line) wins over global thresholds in cell coloring.
- [ ] Bilingual toggle in any tab flips labels en↔ar; manning labels in Arabic come through from template seed.
- [ ] `/fmplus/financial/budget/compare?service_line=hk` retains v1 ranked view; "Year-vs-Year" mode toggle pivots correctly within a single contract.
- [ ] `/fmplus/financial/budget/settings` lets admin edit thresholds + bilingual default + inflation defaults + mobilization amortization months.
- [ ] All 5 parsers covered by vitest fixtures (one .xlsx per parser); each test asserts < 0.5% drift vs the workbook's totals.
- [ ] Variance math unit tests cover: phased start, multi-year rollup, mobilization amortization, asymmetric thresholds, per-line override, bilingual label resolution.
- [ ] No regressions in existing FMPLUS Financials page or Odoo sync worker; no orphan v1 references in the codebase.

## 17. Improvement suggestions absorbed (10 of 10)

These were proposed during brainstorming and are baked into v2.0 above:

1. **Richer CTC breakdown** (Net + Relievers + OT + Training + Insurance + Medical) — `budget_lines.ctc_*` columns + Editor expand panel. (§6 schema, §6.1.2 UI)
2. **Per-service margins** (OVH%+GM%) — Project Hub card + Compare tab columns. (§9.1, §9.4)
3. **Contract-level revenue summary** — Project Hub card + Editor "Revenue" tab + variance report. (§9.1, §9.2)
4. **YoY visualizer** — Project Hub sparkline + Compare "Year-vs-Year" mode. (§9.1, §9.4)
5. **Mobilization ROI badge** — Project Hub card. (§9.1)
6. **Bilingual labels** (`name_en` + `name_ar`) — schema everywhere + UI toggle. (§6, §9 throughout)
7. **Auto-rollover at FY end** — deferred to v2.1 (cron-driven, optional). (§11)
8. **Per-line variance threshold override** — `budget_lines.threshold_green/amber` + Editor inline editor + Variance respects it. (§6, §8)
9. **CTC inflation calculator preview** — embedded in "Copy year" dialog as the per-line tweak panel; standalone tab is v2.1. (§9.2, §11)
10. **Year-vs-year project comparison** — Compare tab "Year-vs-Year" mode toggle within a contract. (§9.4)

## 18. Migration / rollout plan

1. **PR sequence** (per `superpowers:writing-plans` output, expected ~30–40 commits across 8 phases):
   - Phase 1 — Migration `0081` + schema + types + Zod
   - Phase 2 — 7 templates + Catalog seed
   - Phase 3 — Catalog tab + admin CRUD
   - Phase 4 — Project Hub + new-contract wizard
   - Phase 5 — Editor (year tabs, service tabs, picker, CTC expand, bilingual, Copy-year dialog)
   - Phase 6 — 5 Excel parsers + auto-detect + Import UI
   - Phase 7 — Variance v2 + Mobilization amortization + per-line threshold override
   - Phase 8 — Compare YoY mode + Settings expansion + PDF/XLSX exports + acceptance walk-through
2. **Pre-merge** — every phase ships with its tests passing; TypeScript clean.
3. **Deploy** — push to main → GitHub→Vercel auto-deploy. Migration `0081` applied via Supabase MCP `apply_migration` per CLAUDE.md standing authorization.
4. **Post-merge** — user re-enters AUC FY 2026 Initial via v2 (one afternoon, via Import → AUC.xlsx).
5. **Adoption** — user imports City Gate, TRIO, Emaar Uptown over a week.

---

**Next step after approval of this spec:** invoke `superpowers:writing-plans` to produce the step-by-step implementation plan. That plan will reference this spec by path and break v2.0 into commit-sized increments.
