# FM+ Project Budget — Design Spec

**Date:** 2026-05-03
**Author:** Kareem Hady (via Claude brainstorming session)
**Status:** Approved (chat) → ready for implementation plan
**Scope:** `/fmplus/financial/budget/**` — Project Budget feature inside the FM+ Financial section
**Migration:** `0080_fmplus_project_budget.sql` (new)
**Related, parallel work (different session):** the FM+ domain shell + `/fmplus/financial` parent page is being built separately. This spec treats the parent shell as a black box and defines a clean drop-in for `/fmplus/financial/budget`.

---

## 1. Problem statement

FMPLUS Property & Facility Management runs ~60 active projects (analytic accounts in Odoo, e.g. AUC, Emaar Uptown, Marassi, MBZ, Hyde Park, Ghabour Auto, R3, …) across 6 service lines (Housekeeping, MEP, Landscape, Security, Pest Control, Waste Management). Today:

1. **Budgets live in standalone Excel files** (one per project, e.g. `AUC Budget.xlsx`). Each is a rich multi-sheet workbook with merged cells, cross-sheet formulas, sub-location splits, and seasonal head-counts. Useful for the analyst who built it; opaque to anyone else.
2. **Actuals live in Odoo** (`odoo_move_lines` + `odoo_move_line_analytics`) — already synced into Supabase by the existing financial sync worker.
3. **There is no system that joins the two.** Budget vs Actual variance, anomaly detection, and cross-project comparison are all done by hand in spreadsheets, irregularly and only for the projects that someone happens to look at.

Result: FMPLUS leadership can't quickly answer "which 3 projects are bleeding cash this month?" or "are we on Manning budget across the HK portfolio?" The data exists; the wiring doesn't.

## 2. Goals

- One operational home for every FMPLUS project budget — entry, version, compare, drill.
- **Project budget input UI** that scales to 60+ projects with a familiar shape (categories, line items, seasons, sub-locations).
- **Excel import** that ingests both (a) the existing rich AUC-style template, and (b) a flat normalized template for fast bulk loads.
- **Variance dashboard** that joins each budget against the matching Odoo analytic account at monthly granularity, with traffic-light coloring and click-to-drill into Odoo journal entries.
- **Multi-project comparison** (rank by variance, filter by service line) — the one screen that answers "where's the bleeding."
- **Service-line model** that supports one-or-many service lines per project (a Mix-Projects-plan project like R3 may carry HK + MEP) and pluggable per-service-line templates so additional service lines drop in via one PR.
- **Phased rollout**: ship HK end-to-end (the only template fully defined today, derived from `FMPLUS/AUC Budget.xlsx`); other 5 service lines stub-selectable until their templates are dropped.

## 3. Non-goals (explicitly out of scope)

- The FM+ domain shell, top nav, and `/fmplus/financial` parent page (separate session).
- Beithady or any non-FMPLUS company budgets — this module is FMPLUS-only.
- Auto-approval workflows, multi-approver chains, or e-sign — Draft → Published is the whole workflow.
- Currency conversion / FX — EGP-only enforced at import.
- Re-implementing Odoo financial sync — module reads from existing `odoo_*` tables.
- Forecasting beyond simple "previous-actuals + X%" template generation — no time-series modeling.
- Per-sub-location actuals — Odoo only carries one analytic account per project (e.g. one "AUC" account, not four). Sub-locations remain a budget-only planning dimension and roll up to the project total for variance.
- Editing the budget template structure from the UI for the first release. Templates are code-seeded JSON; edits are a PR.
- Mobile-first layout. Desktop dashboard is the target.

## 4. Decisions made during brainstorming

| # | Question | Decision |
|---|----------|----------|
| Q1 | FM+ shell scope | Out of scope. Black-box parent. Build only `/fmplus/financial/budget/**`. |
| Q2 | Sub-location vs analytic account | Sub-locations are a budget-only planning dimension. Variance compares total-AUC-budget against the single Odoo `AUC` analytic account. Same pattern for any project that has internal splits. |
| Q3 | Service-line model | First-class dimension. 6 service lines: `hk`, `mep`, `landscape`, `security`, `pest_ctrl`, `waste_mgmt`. Multi-select per project. |
| Q4 | Template pluggability | Each service line has a versioned template (`budget_templates` row). Editor renders dynamically from template JSON. New service lines = one PR (seed row + tests). |
| Q5 | Excel ingest paths | Both: (Path A) rich AUC-style sheet parser, (Path B) flat normalized one-row-per-line XLSX. Editor exports to flat. |
| Q6 | Versioning | Per-fiscal-year × scenario (`initial` / `revised` / `reforecast`). Compare any scenario vs actuals. |
| Q7 | Approval workflow | Lightweight Draft → Published. Edits-after-publish allowed but written to `budget_audit`. Template version locked into segment on publish. |
| Q8 | Revenue side | Optional. Cost-only by default; revenue lines unlock GP / GP%. |
| Q9 | Variance sign convention | `variance = actual - budget`. Over-budget → positive → red. Standard cost-accounting. |
| Q10 | Variance thresholds (asymmetric) | Configurable. Defaults: <br>• `\|var\|` ≤ 5 % → **green** (small deviation either way)<br>• `var` > 15 % overspend → **red**<br>• otherwise → **amber** (includes 5-15 % overspend AND any underspend > 5 %)<br><br>Note the asymmetry: only large *overspend* triggers red. Large underspend stays amber because it usually signals scope under-delivery, not savings — needs review, not panic. |
| Q11 | (rolled into Q10) | — |
| Q12 | Time grain | Monthly. 12 columns + YTD rollup. Season template pre-fills, manual override per month allowed. |
| Q13 | Phased starts | `start_month` on `project_budgets`. Months before start contribute 0 budget; variance only computed from start_month onward. |
| Q14 | Permissions | Admin-only edit/import/publish. All FM+ users can view Variance + Compare + Overview. |
| Q15 | Currency | EGP only. Import rejects non-EGP lines. |
| Q16 | Drill-down | Click any variance cell → side drawer listing the underlying `odoo_move_lines` (vendor, date, amount, journal, account). |
| Q17 | Anomaly surface | Overview tab shows the 3 worst-variance projects this month as a banner. |
| Q18 | Health score | Single weighted-variance % per project, sortable on Overview + Compare. |
| Q19 | Unmapped accounts | Settings tab surfaces Odoo P&L accounts not matched by any `account_map_json` regex — so chart-of-accounts additions don't silently leak from variance. |

## 5. Architecture

**Approach:** Hybrid — native React form editor + flat XLSX import + legacy rich-XLSX migration parser. All data normalized into Supabase tables; variance computed at request time by joining against existing `odoo_*` tables.

Rejected alternatives:

- **Excel-only (lightweight)** — upload XLSX, store, render variance directly. Rejected: brittle parsing of merged cells / formulas, no in-app edit, doesn't scale to 60 projects, can't add scenarios cleanly.
- **Snapshot-only** — store XLSX as blob in Supabase Storage, parse totals at upload, no normalized data. Rejected: defeats "proper input UI", no drill-down, no comparison.

### 5.1 Module layout — 6 sub-tabs

`/fmplus/financial/budget` → tab strip:

| Sub-tab | Route | Purpose |
|---------|-------|---------|
| 📊 Overview | `/fmplus/financial/budget` | Portfolio table — every project with a budget, variance summary, traffic-light health. Filters: service line, fiscal year, scenario. Anomaly banner. |
| ✏️ Editor | `/fmplus/financial/budget/edit?project=X&year=2026&scenario=initial` | In-app form — service-line picker → category accordion → line rows × sub-location × season. Auto-calc monthly + annualized totals. Save Draft / Publish. |
| 📥 Import | `/fmplus/financial/budget/import` | XLSX upload, two paths (rich / flat), preview before commit. |
| 📈 Variance | `/fmplus/financial/budget/variance?project=X` | Single-project deep dive — month × category grid, traffic-light cells, drill to journal entries. |
| ⚖️ Compare | `/fmplus/financial/budget/compare?service_line=hk` | Multi-project grid — rows = projects, cols = categories, cell = variance %, sortable. |
| ⚙️ Settings | `/fmplus/financial/budget/settings` | Variance thresholds, template status, category-account mapping editor with unmapped-account drift warning. |

### 5.2 Server module structure

```
src/lib/fmplus/budget/
  templates/
    hk.ts              ← code-seeded HK template (the only one fully baked in v1)
    mep.ts             ← stub
    landscape.ts       ← stub
    security.ts        ← stub
    pest-ctrl.ts       ← stub
    waste-mgmt.ts      ← stub
    index.ts           ← exports getTemplate(serviceLine, version)
  parsers/
    rich-auc-style.ts  ← parser for the existing AUC-style XLSX layout
    flat-template.ts   ← parser for Path B flat XLSX
    flat-template-export.ts ← writer (Editor → flat XLSX download)
  variance.ts          ← buildBudgetVariance(opts) — main read API
  variance-drill.ts    ← cellToMoveLines(opts) — for drill-down side drawer
  audit.ts             ← writeAuditOnPublishedEdit(...)
  schema.ts            ← Zod schemas for all tables + JSON blobs
```

Routes use server actions for mutation (Editor save, Import commit, Publish) and `force-dynamic` server components for read pages (Variance, Compare, Overview).

## 6. Data model

Migration `supabase/migrations/0080_fmplus_project_budget.sql`:

```sql
-- Allowed service lines
-- 'hk' | 'mep' | 'landscape' | 'security' | 'pest_ctrl' | 'waste_mgmt'
-- Allowed scenarios: 'initial' | 'revised' | 'reforecast'
-- Allowed statuses:  'draft' | 'published'
-- Allowed seasons:   'high' | 'low'

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
  created_by      uuid references auth.users(id),
  published_at    timestamptz,
  published_by    uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, fiscal_year, scenario)
);
create index on public.project_budgets (fiscal_year, scenario);
create index on public.project_budgets (project_id);

create table public.project_budget_segments (
  id              bigserial primary key,
  budget_id       bigint not null references public.project_budgets(id) on delete cascade,
  service_line    text not null,
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
  monthly_revenue numeric(14,2) not null,
  vat_pct         numeric(5,2) not null default 14
);

create table public.budget_audit (
  id              bigserial primary key,
  budget_id       bigint not null references public.project_budgets(id) on delete cascade,
  changed_at      timestamptz not null default now(),
  changed_by      uuid references auth.users(id),
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
```

### 6.1 HK template seed (the only fully-baked v1 template)

Stored as `budget_templates` row, `service_line='hk'`, `version=1`, `is_stub=false`. Source: `FMPLUS/AUC Budget.xlsx` (read once during migration; subsequent template changes are PRs).

```jsonc
// schema_json
{
  "sub_locations_enabled": true,
  "default_sub_locations": [
    "NC Inner Campus",
    "Outer Campus",
    "NC Off-Campus Housing",
    "Maadi Buildings"
  ],
  "season_months": {
    "high": [9, 10, 11, 12, 1, 2, 3, 4],
    "low":  [5, 6, 7, 8]
  },
  "vat_pct": 14,
  "categories": [
    {
      "code": "manning",
      "label": "Manning",
      "calc": "qty_x_unitcost",
      "lines": [
        { "code": "hk_manager",    "label": "HK Manager" },
        { "code": "asst_manager",  "label": "Assistant Manager" },
        { "code": "sr_supervisor", "label": "Senior Supervisor" },
        { "code": "sup_8h",        "label": "Supervisor 8H" },
        { "code": "hk_mf_8h",      "label": "HK Male & Female 8H" },
        { "code": "facades_sup",   "label": "Facades Supervisor 8H" },
        { "code": "facades_lab",   "label": "Facades Labor 8H" },
        { "code": "waste_sup",     "label": "Waste Supervisor 8H" },
        { "code": "waste_lab",     "label": "Waste Labor 8H" },
        { "code": "admin",         "label": "Admin" },
        { "code": "storekeeper",   "label": "Storekeeper" },
        { "code": "driver",        "label": "Driver" },
        { "code": "trainer",       "label": "Trainer" },
        { "code": "sup_8h_r",      "label": "Supervisor 8H R" },
        { "code": "hk_f_8h_r",     "label": "HK Female 8H R" }
      ]
    },
    {
      "code": "ppe",
      "label": "Uniform & PPE",
      "calc": "total_headcount_x_unitcost",
      "lines": [{ "code": "uniform_ppe", "label": "Uniform & PPE" }]
    },
    {
      "code": "tools",
      "label": "Tools & Consumables",
      "calc": "qty_x_unitcost_div_depreciation",
      "lines": [
        { "code": "machinery",   "label": "Machinery" },
        { "code": "tools",       "label": "Tools" },
        { "code": "consumables", "label": "Consumables" }
      ]
    },
    {
      "code": "transport",
      "label": "Transportation & Vehicles",
      "calc": "qty_x_unitcost",
      "lines": [
        { "code": "bus",      "label": "Bus" },
        { "code": "microbus", "label": "Microbus" },
        { "code": "sedan",    "label": "Sedan Car" },
        { "code": "minivan",  "label": "Minivan" },
        { "code": "pickup",   "label": "Pickup Car" },
        { "code": "fuel",     "label": "Fuel" }
      ]
    },
    {
      "code": "it",
      "label": "IT & Communication",
      "calc": "qty_x_unitcost",
      "lines": [{ "code": "ict_per_head", "label": "Laptop / Mobile / Printer / SIM (per head)" }]
    },
    {
      "code": "overhead",
      "label": "Mobilization & Overhead",
      "calc": "flat",
      "lines": [{ "code": "mob_overhead", "label": "Mobilization & Overhead" }]
    }
  ]
}
```

```jsonc
// account_map_json — category → Odoo account.code regex patterns
[
  { "category": "manning",     "code_patterns": ["^5000(0[1-9]|1[0-4])$"] },
  { "category": "ppe",         "code_patterns": ["^500011$"] },
  { "category": "tools",       "code_patterns": ["^5002(0[1-9]|1[0-9])$"] },
  { "category": "consumables", "code_patterns": ["^5001(0[1-9]|1[0-9])$"] },
  { "category": "transport",   "code_patterns": ["^5005[0-9]{2}$"] },
  { "category": "it",          "code_patterns": ["^5003(0[1-9]|1[0-9])$"] },
  { "category": "overhead",    "code_patterns": ["^5004(0[1-9]|1[0-9])$"] }
]
```

Stub templates for the other 5 service lines: same schema_json shape, `is_stub=true`, empty `categories` array, empty `account_map_json`, label "Coming soon — drop the budget sheet in `FMPLUS/`."

### 6.2 `calc` rules (in template)

- `qty_x_unitcost` — `monthly_cost = qty * unit_cost` (default for headcount/vehicle lines)
- `total_headcount_x_unitcost` — `qty` derived as `SUM(manning category qty)`, `unit_cost` from line; used by PPE
- `qty_x_unitcost_div_depreciation` — `monthly_cost = qty * unit_cost / depreciation_months`; applies to Equipment + Tools where the user enters total purchase value and amortization period
- `flat` — `monthly_cost = unit_cost`; for one-time mobilization

The DB column `monthly_cost` is `qty * unit_cost` for simplicity. `calc` rules are applied at *Editor* time when computing what to write to `qty` and `unit_cost`. The Editor exposes the underlying inputs (e.g. depreciation months) but always normalizes to qty + unit_cost in the row that gets persisted.

## 7. Excel ingest

### 7.1 Path A — rich AUC-style parser

Triggered when the uploaded XLSX has sheet names matching the AUC pattern: a Grand Total sheet plus per-category detail sheets (`* Total Manning`, `* Total Equipment`, `* Total Tools`, `* Total Consumables`, `* Total Transportation`, `* Total IT & Communication`).

Strategy:

1. **Detect**: sheet-name regex.
2. **Per detail sheet**: known cell layout (e.g. Manning sheet → col B = role label, cols F/I = high/low headcount per sub-location, col E = CTC). Column offsets are part of the parser config so AUC-style sheets for other projects (e.g. `Emaar Uptown HK Budget.xlsx`) parse without changes.
3. **Iterate** rows × sub-locations × seasons → emit normalized line records (one per role × sub-location × season).
4. **Sanity check**: sum normalized lines, compare to the Grand Total sheet's totals. Diff must be < 0.5 % per category — otherwise abort with a parser-mismatch error showing both numbers.
5. **Preview** UI: extracted lines grouped by category, totals next to original sheet's totals. User confirms.
6. **Commit**: writes `project_budgets`, `project_budget_segments` (for HK), `budget_lines`. Existing same-key budget is replaced atomically (delete-and-re-insert in one transaction; existing audit log preserved).

### 7.2 Path B — flat normalized template

Server provides downloadable `budget_template_flat.xlsx`. One row per line:

| Column | Required | Example | Notes |
|--------|----------|---------|-------|
| `project` | yes | `AUC` | matches `odoo_analytic_accounts.name` |
| `service_line` | yes | `hk` | one of the 6 codes |
| `sub_location` | optional | `NC Inner Campus` | blank = whole project |
| `category` | yes | `manning` | matches template category code |
| `line_code` | yes | `hk_manager` | matches template line code |
| `season` | yes | `high` | `high` or `low` |
| `qty` | yes | `0.75` | headcount or quantity |
| `unit_cost` | yes | `32500` | EGP |
| `notes` | optional | | free text |

Header row enforced. Validation runs row-by-row; errors shown inline (unknown line_code, missing project, qty < 0, season not in template, currency suffix detected). Editor exports its current state in this format — round-tripping is possible.

### 7.3 Common preview UI

Both paths converge on the same preview screen:

- Lines grouped by service line → category → sub-location.
- Per-cell budget totals shown.
- Diff vs any existing budget for same (project, year, scenario): "would replace 187 lines, add 12 new, delete 4."
- Validation errors inline (red row marker).
- Buttons: **Save as Draft** · **Publish** · **Cancel**.
- Admin-only.

## 8. Variance computation

`src/lib/fmplus/budget/variance.ts`:

```ts
export async function buildBudgetVariance(opts: {
  projectId: number;
  year: number;
  scenario: 'initial' | 'revised' | 'reforecast';
  month?: number;          // null = full year
  ytdThrough?: number;     // for YTD rollup
}): Promise<BudgetVarianceReport>;
```

Steps:

1. **Load budget**. Pull `budget_lines` for the project's `project_budgets` row, joined to `project_budget_segments`. Aggregate to `(segment_id, category, line_code, sub_location, season) → monthly_cost`. Expand to `(segment_id, category, month) → budget_amount` using the template's `season_months` and the budget's `start_month`.

2. **Load actuals**. Pull `odoo_move_lines` joined to `odoo_move_line_analytics` filtered by `analytic_account_id = projectId` and `date BETWEEN year-01-01 AND year-12-31`. For each line, fetch `odoo_accounts.code`, then match against the segment's template `account_map_json` regex patterns to determine `(category)`. Aggregate to `(segment_id, category, month) → actual_amount`. Lines that don't match any pattern go to a special `_unmapped` bucket and surface as a warning in Settings.

3. **Compute variance per cell**:
   ```
   variance     = actual - budget
   variance_pct = budget == 0 ? null : variance / budget

   // Asymmetric coloring — only large OVERSPEND turns red.
   // Large underspend stays amber (scope-delivery risk, not savings).
   color        = abs(variance_pct) <= green_pct           → 'green'
                  variance_pct      >  amber_pct           → 'red'
                  else                                      → 'amber'
   ```

4. **Roll up**: cell → category → segment (service line) → project. Health score = `weighted_avg(|variance_pct|, weights = budget_amount)` per segment; project health = weighted average across segments.

5. **Drill-down map**: a `Map<cellKey, OdooMoveLineId[]>` so the side drawer in the Variance UI can list the underlying journal entries on click. Lazy-loaded — populated only when the user requests it.

Re-uses scoping logic from `src/lib/financials-pnl.ts::buildPnlReport`. Per-request, no caching for v1 (Odoo data already in Supabase, query is fast).

## 9. UI flows — wireframe summary

### 9.1 Overview tab

- Filters: fiscal year · scenario · service line · Odoo plan · YTD-through-month.
- 4 KPI tiles: projects budgeted, YTD budget, YTD actual, portfolio variance %.
- Anomaly banner: top 3 worst-variance projects this month (red bar, dismiss action available).
- Project table: project · plan · service-line chips · budget YTD · actual YTD · variance · variance % · health dot · status. Sort by any column. Click row → Variance tab for that project.
- Below-the-fold: "Action needed" — projects in scope (per Odoo) without a published budget for the current FY.

### 9.2 Variance tab

- Header: project name, FY, scenario, status, published-at.
- 5 KPI tiles: annual budget · YTD budget · YTD actual · variance · variance %.
- Service-line sub-tabs (one per segment).
- Main grid: rows = categories (collapsed), cols = 12 months + YTD + Variance %. Each cell shows `budget / actual` with traffic-light tinted background. Low-season columns subtly shaded. Click row → expand to line-level rows. Click cell → side drawer with `odoo_move_lines` list (vendor, date, amount, journal name, account name).
- Export buttons: PDF (formatted for management), XLSX (raw flat table).

### 9.3 Compare tab

- Service-line filter chips (single-select; default "all HK projects").
- Period selector (YTD / month).
- Sort selector (worst variance % / best / alphabetical).
- Grid: rows = projects (filtered), cols = template categories + total variance % + health dot. Cell tint by category-level variance %. Click project name → Variance tab. Click category column header → re-pivot grid to month × category for the selected single project (or "show me category trend across all projects").

### 9.4 Settings tab

- Variance thresholds (inline editable).
- Default scenario.
- Service-line template list with status (`active` / `stub`).
- Category-account mapping editor per service line — list of regex patterns; "Test mapping" button shows which `odoo_accounts.code` rows match.
- **Unmapped accounts warning**: lists Odoo P&L cost accounts that don't match any pattern (so chart-of-accounts additions can't silently leak from variance).
- Season month definitions per template.

## 10. Edge cases

| Case | Handling |
|------|----------|
| Project has actuals but no budget | Surfaced in Overview "Action needed" section. Variance tab shows "No budget for FY 2026 — create one" CTA. |
| Budget published, then edited | New `budget_audit` row written with diff JSON. Editor banner: "You're editing a published budget — changes go live immediately and are logged." |
| Phased start (project begins May) | `start_month=5` → months 1-4 contribute 0 budget, no variance computed for those months. UI marks them "before start". |
| Re-forecast | New `project_budgets` row with `scenario='reforecast'`. Initial scenario untouched. Compare tab can pick which scenario to compare against actuals. |
| Multi-service project (HK + MEP) | Two `project_budget_segments` rows. Variance tab shows per-segment grid + project rollup. Compare tab filters by segment service line. |
| Stub service line picked in Editor | Allowed: creates a placeholder segment with `template_version = 0`. Editor renders "MEP template not yet defined" banner. Variance for that segment shows "Pending template" until template lands. |
| Account-map drift (new Odoo account added) | Settings tab "Unmapped accounts" panel shows it. Until mapped, those move lines fall into `_unmapped` and are excluded from variance — explicit, not silent. |
| Currency != EGP at import | Row rejected at import with explicit error. EGP-only is a project invariant. |
| Template version upgrade | Existing published budgets keep their locked `template_version` (stable comparison over time). New budgets pick up the latest version. When re-opening a published budget on an outdated version, the Editor renders against the locked old version and shows a banner: "This budget uses HK template v1; v2 is now available. To migrate, create a new `revised` scenario from this one." Edits never silently jump versions. |
| `qty * unit_cost` overflow | DB column is `numeric(14,2)` — supports up to 999 billion EGP per line. Beyond that, schema needs widening (not in v1). |
| Concurrent edits | Server actions are transactional; optimistic concurrency via `updated_at` check on save. Last writer wins; `budget_audit` records both edits. |
| Delete project from Odoo | `odoo_analytic_accounts` keeps the row (sync is upsert-only). Project still appears in Overview with a "Project archived in Odoo" badge. Budgets remain readable; new editing disabled. |

## 11. Phasing

### v1 (this spec, single PR or small PR series)

- Migration `0080`.
- HK template seeded fully from `FMPLUS/AUC Budget.xlsx`.
- 5 stub templates (MEP, Landscape, Security, Pest Ctrl, Waste Mgmt).
- All 6 sub-tabs functional.
- Path A parser: tested against `AUC Budget.xlsx` and `Emaar Uptown HK Budget.xlsx` (both already in `FMPLUS/`).
- Path B parser + flat template export.
- Variance computation against `odoo_move_line_analytics`.
- Drill-to-journal side drawer.
- PDF + XLSX export from Variance tab.
- Anomaly detector banner.
- Health score column.

### v1 stubs

- MEP, Landscape, Security, Pest Ctrl, Waste Mgmt templates show "Coming soon" in Editor and Settings.
- Multi-service projects can be created with HK + (placeholder) — variance still works for the HK segment.
- **Known limitation for multi-service projects**: cost actuals belonging to a stubbed segment fall into the `_unmapped` bucket (Settings panel surfaces them) and don't appear in the Variance grid until the matching template lands. For HK-only projects (the entire HK Projects plan in Odoo today) this never matters. For Mix-Projects-plan projects (e.g. R3) carrying HK + MEP, only the HK portion of variance is visible until the MEP template ships.

### v2+ (future PRs as templates land)

- One PR per service line: adds the seed row + parser config + tests + a sample sheet in `FMPLUS/`.
- Cross-service-line "company-level" rollup view (Lime Investments → FMPLUS-wide variance) — separate spec when needed.
- Year-over-year template ("build 2027 budget from 2026 actuals + X%") — separate spec.
- Re-forecast scheduling automation — separate spec.

## 12. Permissions

- **View** (Overview, Variance, Compare): any signed-in FM+ user.
- **Edit / Import / Publish / Settings**: admin only. Existing admin gate (`requireAdmin()` in `src/lib/auth.ts`) reused.
- Server actions verify the gate; UI hides edit affordances for non-admins.

## 13. Interfaces with the FM+ shell (parallel session)

The FM+ shell session owns:

- The route `/fmplus` (domain landing).
- The route `/fmplus/financial` (Financial section with its own tab strip).
- The TopNav for FM+.

This module owns: everything under `/fmplus/financial/budget/**`.

Contract: this module exports a `<ProjectBudgetTab />` server-component bundle that the shell can mount inside its tab strip if the shell wants to (or just link to `/fmplus/financial/budget` directly). The Project Budget pages also work in isolation if accessed via direct URL — they render their own breadcrumb + page header, so the shell can be ahead, behind, or absent without breaking this feature.

## 14. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Path A parser breaks on `Emaar Uptown HK Budget.xlsx` due to layout drift | Med | Med | Parser config is per-template; hard-fail with a diff error during preview, not silent; cover both sample sheets with parser tests in v1. |
| Account-map regex misses a new Odoo cost account | High | Low | Settings unmapped-accounts panel surfaces drift; `_unmapped` bucket is explicit, not silent. |
| User publishes a budget against the wrong analytic account (typo) | Med | High | Editor shows the analytic-account `name + code + plan + balance` from `odoo_analytic_accounts` so the user can sanity-check; Publish requires confirmation modal. |
| Performance degradation on the Compare tab when 60 projects × 6 categories × YTD | Low | Med | Variance read aggregates in SQL (window functions), not in app code; pagination on Overview if > 50 rows. |
| Two admins edit the same draft simultaneously | Low | Low | Optimistic concurrency on `project_budgets.updated_at`; second saver gets a "stale draft" error and offered a refresh-and-merge. |
| Template stub (MEP etc.) is requested but never delivered → orphan placeholder segments | Med | Low | Editor shows segment count per project on Overview; orphan placeholders flagged. |

## 15. Open questions (to confirm before / during implementation)

None blocking. The following are explicit decisions to revisit later, not blockers for v1:

1. Should "underspend > amber threshold" surface in the Anomaly banner alongside overspend? (v1: yes — both directions fire.)
2. Cross-service-line rollup view at FMPLUS company level — when does this become valuable? (v1: skip; spec separately when leadership asks.)
3. Should there be a "freeze" status above Published to prevent any edits, even with audit? (v1: skip; the audit log + admin-only is enough trust.)
4. Year-over-year template suggestion — heuristic only or surface 12-month trend chart per category? (v1: skip.)

## 16. Acceptance criteria for v1

- [ ] Migration `0080_fmplus_project_budget.sql` applied; 7 tables present; HK template seeded; 5 stubs seeded.
- [ ] `/fmplus/financial/budget/import` accepts `AUC Budget.xlsx` and produces a complete published budget for AUC FY 2026 Initial — totals match the sheet within 0.5 %.
- [ ] `/fmplus/financial/budget/variance?project=AUC` renders monthly grid with category rows; cells show `budget / actual` with traffic-light coloring; all numbers reconcile by hand against the AUC sheet + Odoo P&L.
- [ ] Click a Variance cell → side drawer lists `odoo_move_lines` for that month + category; each row shows vendor, date, amount, journal, account.
- [ ] `/fmplus/financial/budget/compare?service_line=hk` shows AUC + (any other HK project that has a budget) ranked by variance %.
- [ ] `/fmplus/financial/budget` Overview shows the 1-N projects budgeted, anomaly banner if any project exceeds 15 % deviation.
- [ ] Settings tab lets an admin edit thresholds; non-admin user sees read-only Settings; edit/save/publish actions fail with 403 for non-admin.
- [ ] Editor lets an admin pick a stub service line (MEP) — creates a placeholder segment with "template not yet defined" banner — and still saves Draft.
- [ ] Editor publish writes `published_at`, `published_by`; subsequent edit writes a `budget_audit` row.
- [ ] Vitest unit tests: rich parser (AUC sheet), flat parser, variance math (incl. phased start, multi-segment rollup), threshold coloring (incl. underspend > amber rule), template version locking on publish.
- [ ] No regressions in existing Beithady financials page or Odoo sync worker.

---

**Next step after approval of this spec:** invoke `superpowers:writing-plans` to produce the step-by-step implementation plan. That plan will reference this spec by path and break v1 into commit-sized increments.
