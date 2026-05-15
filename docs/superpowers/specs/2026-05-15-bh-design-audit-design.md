# BH Design Audit & Migration Plan

**Date:** 2026-05-15
**Author:** kareem (via brainstorming session)
**Status:** Draft — pending review
**Scope:** Beithady module pages only (`src/app/beithady/**/page.tsx`)
**Deliverable type:** Paper audit + prioritized backlog. No code changes in this spec. Each migration on the backlog spawns its own spec → plan → PR cycle.

---

## 1. Goal & scope

Bring every page under `/beithady/*` onto a small, well-defined set of shell + filter + URL-state primitives so the BH module reads as one coherent product.

Trigger: the Financials cockpit and its sub-pages visibly drift from the rest of BH. The Financials Performance (P&L) page uses a horizontal pill bar where the Analytics Performance Dashboard uses a collapsible left filter rail; the Financials landing uses bespoke status cards with raw Tailwind palette colors that violate BH brand. Both surfaced this audit.

This document covers Beithady **only**. Other domains (boat-rental, FMPLUS, VoltAuto, Kika) have their own design owners and are out of scope.

## 2. TL;DR findings

- **124 page files** under `/beithady/**/page.tsx`.
- **107** wrap content in the canonical `<BeithadyShell>` — adoption is high.
- **12** still use raw `<TopNav>` from `@/app/_components/brand` **without** `BeithadyShell`. Of those 12: **10 are in `/beithady/financials/*`** (the entire financials module), plus `/setup` and `/pricing`. These are the **wrong-shell offenders**.
- **2 pages** have a left-sidebar + title-bar data-dashboard pattern: `analytics/performance` (the canonical one referenced in this spec) and `analytics/reports/fees-audit` (a parallel bespoke implementation under `_components/`). They don't share code — the extraction in §7.3 converges them. Every other filter-driven page uses an inline strip, a horizontal pill row, or no filter UI at all.
- **A1 is surfaced in scope filters** on 5 financials pages via `FinancialsFilterStrip`. Per project memory, A1 must not appear in any BH module scope filter.
- **66 pages** match raw Tailwind palette classes (`bg-indigo-*`, `border-red-*`, etc.). Most are semantic icon accents (`text-rose-600` on a tile icon) which are arguably fine; a meaningful subset is BH-surface chrome (status card backgrounds, borders, banners) which violates the brand-only rule and counts as drift.

The drift is concentrated, not diffuse. **Financials is ~80% of the visible problem.** Fixing Financials + extracting a reusable dashboard-shell primitive resolves the loudest complaints. The rest is mostly minor-grade brand-color cleanup.

## 3. Page-type taxonomy

| Type | Purpose | Examples |
|---|---|---|
| **1. Module landing** | Launcher tiles into sub-pages; optional KPI status pre-strip | `/beithady`, `/analytics`, `/financials`, `/operations`, `/communication`, `/crm`, `/inventory`, `/gallery`, `/hr`, `/fnb`, `/ads`, `/settings`, `/setup` |
| **2. Data dashboard** | Filter-driven; filters define the data | `analytics/performance`, `analytics/calendar-heatmap`, `analytics/market-intel`, `financials/performance`, `financials/balance-sheet`, `financials/payables`, `financials/ledgers`, `inventory/dashboard`, `ads/performance` |
| **3. List view** | Paginated rows + search/filter + bulk actions + row→detail | `communication/unified`, `communication/archive`, `inventory/items`, `inventory/stock`, `inventory/grn`, `crm/segments`, `crm/tasks`, `crm/pipeline`, `ads/campaigns`, `ads/leads`, `analytics/reviews`, `hr/team`, `hr/attendance` |
| **4. Detail view** | Single record + related data + actions | `crm/[guestId]`, `financials/snapshots/[id]`, `financials/import/[upload_id]`, `gallery/[buildingCode]`, `ads/campaigns/[id]`, `inventory/counts/[id]`, `operations/sop/[slug]` |
| **5. Form / wizard / settings** | Input + submit; multi-step flows; config screens | `financials/import` (upload wizard), `/setup`, `/settings/*`, `analytics/reports/builder`, `analytics/headcount`, `inventory/counts/new`, `operations/morning-brief/recipients` |

The canonical pattern is different for each type. The audit classifies every page by type, then grades it against the canonical for that type.

## 4. Canonical patterns

### 4.1 Module landing
- **Shell:** `<BeithadyShell breadcrumbs={[…]}>` — provides TopNav + BH branding + `max-w-6xl` container.
- **Header:** `<BeithadyHeader eyebrow title subtitle right? />`.
- **Optional status pre-strip:** 3-card row with active state / open work / next due, themed via BH vars (NOT raw Tailwind palette).
- **Launcher:** `<BeithadyLauncher tiles columns={3} />`.
- **Optional section blocks:** `<BeithadyRuleCards>`, etc.

### 4.2 Data dashboard *(the "gold standard")*
- **Top:** `<TitleBar>` (navy gradient) — title, scope chips, "Customize" button, mobile filter button.
- **Left:** `<LeftRail>` collapsible filter rail with pin toggle. Sections vary per page (Period / Building / Compare / Scope / etc).
- **Mobile:** `<MobileFilterSheet>` (bottom sheet) replaces the rail under `max-width: 767px`.
- **Main:** 12-col grid of panels; each panel hide-able via `<CustomizeDrawer>`.
- **URL state:** Typed hook (à la `usePerfUrlState`). All filters/date/compare live in URL params so links are shareable and reloads preserve state.
- **Brand:** BH cream/ink/mute/steel CSS vars only; `data-bh-brand="true"` scope on the wrapping div.
- **Scope filter:** Where one exists, options are `['consolidated', 'egypt', 'dubai']` — **never A1**.
- **Currently exists at:** `src/app/beithady/analytics/performance/_components/{dashboard-shell,left-rail,title-bar,mobile-filter-sheet,customize-drawer}.tsx` + `_hooks/use-url-state.ts`. These are private to that route. Migration spec A will extract them to `src/app/beithady/_components/dashboard-shell/`.

### 4.3 List view
- **Shell:** `<BeithadyShell>` + `<BeithadyHeader right={<ActionButtons/>}>`.
- **Filter surface:** `<LeftRail>` when filters are complex (≥3 dimensions, e.g., inbox: channel × status × assignee × date); top filter strip otherwise (just search + 1–2 pills).
- **Body:** Sticky-header table, sortable columns, row-click → detail, server-driven pagination (or virtualized when row count is unbounded).
- **Empty state:** Title + subtext + primary CTA.
- **URL state:** filters, sort, page, search all in URL params.

### 4.4 Detail view
- **Shell:** `<BeithadyShell breadcrumbs={[parent, recordName]}>`.
- **Header:** title (record name) + status chips on left, action buttons on right via `right=`.
- **Body:** 2-col layout — primary content (~8 cols) + metadata sidebar (~4 cols, sticky on desktop). Tabs allowed for grouping (timeline / files / activity / etc).
- **Mobile:** stacked single column.

### 4.5 Form / wizard / settings
- **Shell:** `<BeithadyShell>` + `<BeithadyHeader right={<SaveButton/>}>`.
- **Body:** Centered `max-w-3xl` vertical form, or multi-step wizard with step indicator at top.
- **Fieldsets:** Grouped sections with helper text and inline validation.
- **Submit:** Anchored at bottom; sticky on mobile.

## 5. Drift severity rubric

| Severity | Definition |
|---|---|
| **None** | Page matches the canonical pattern for its type. |
| **Minor** | Right shell, small divergence: stale icons, missing eyebrow, container width wrong, raw `<Link>` for back-nav instead of breadcrumb. Cosmetic. |
| **Major** | Wrong shell entirely, OR missing the canonical filter affordance on a data dashboard, OR uses raw Tailwind palette on chrome (cards / borders / banners). |
| **Blocker** | A1 in scope filter; no clear period picker on a P&L page; raw Tailwind palette on a status-card surface; hard-coded date with no URL override on a filter-driven page; broken mobile layout. |

**Cross-cutting blockers** (count once, apply to every page where they appear):
- A1 in any scope filter.
- Raw Tailwind palette classes on BH-surface chrome.
- Filter-driven view with no URL state (filters reset on reload).

**Scoring inputs (drive backlog order, separate from severity):**
- **Frequency** — H/M/L. Left blank for kareem to fill during review.
- **Effort** — S (≤200 LOC, no new primitives) / M (≤600 LOC, may need a new shared primitive) / L (>600 LOC or touches data layer).

**Backlog priority formula** (default; override per row): `priority = severity_weight × frequency_weight ÷ effort_weight` where blocker=4, major=3, minor=1; H=3, M=2, L=1; S=1, M=2, L=4.

## 6. Inventory

For readability, pages with severity **None** (most BH pages using `BeithadyShell` correctly for landings/lists/forms) are listed in summary form per module. Pages with severity **Minor / Major / Blocker** are listed individually.

### 6.1 Wrong-shell offenders (Blocker — wrong shell, brand drift, A1 present, no LeftRail on a data dashboard)

Every page here uses raw `<TopNav>` directly without `<BeithadyShell>`. All within `/beithady/financials/*` except `/setup` and `/pricing`.

| Path | Type | Shell | Filter UI | URL state | A1 in filter? | Brand-vars? | Severity | Effort | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `financials/page.tsx` | Landing | raw TopNav + custom CockpitTile | n/a | none | n/a | mixes raw indigo/red/yellow palette on status cards | **Blocker** | M | Migrate to `BeithadyShell + BeithadyHeader + BeithadyLauncher`. Keep status pre-strip but re-theme via BH vars. |
| `financials/performance/page.tsx` | Data dashboard | raw TopNav + `FinancialsFilterStrip` | horizontal pill bar | URL params, ad-hoc | **yes** | none | **Blocker** | L | Adopt `DashboardShell+LeftRail`. Replace pill bar with rail. Add real month picker (e.g., `<input type="month">` or styled). Drop A1. |
| `financials/balance-sheet/page.tsx` | Data dashboard | raw TopNav + `FinancialsFilterStrip` (as-of date + scope) | top form (date input + scope pills) | URL params, ad-hoc | **yes** | none | **Blocker** | M | Adopt LeftRail. Move as-of date and scope into rail sections. Drop A1. |
| `financials/payables/page.tsx` | Data dashboard | raw TopNav + `FinancialsFilterStrip` | top form (date + scope) | URL params, ad-hoc | **yes** | none | **Blocker** | M | Same as balance-sheet. Drop A1. |
| `financials/ledgers/page.tsx` | List view (per-partner) | raw TopNav + custom filter | inline filter | URL params, ad-hoc | **yes** | none | **Blocker** | M | Adopt `BeithadyShell` + LeftRail (or top filter strip if simple). Drop A1. |
| `financials/snapshots/page.tsx` | List view | raw TopNav | minimal | n/a | no | none | **Major** | S | Adopt `BeithadyShell + BeithadyHeader`. |
| `financials/snapshots/[id]/page.tsx` | Detail view | raw TopNav | n/a | n/a | no | none | **Major** | S | Adopt detail-view canonical. |
| `financials/reconciliation/page.tsx` | Data dashboard | raw TopNav | inline filter | URL params, ad-hoc | no | none | **Major** | M | Adopt LeftRail (variance audit benefits from filterable views). |
| `financials/import/page.tsx` | Form / wizard | raw TopNav | n/a | n/a | **yes** *(type guard includes 'a1' even though wizard doesn't surface scope filter)* | none | **Major** | S | Adopt form/wizard canonical. Remove `a1` from `isCompanyScope` guard. |
| `financials/import/[upload_id]/page.tsx` | Detail view | raw TopNav | n/a | n/a | no | none | **Major** | S | Adopt detail-view canonical. |
| `setup/page.tsx` | Form / wizard / setup | raw TopNav | n/a | n/a | no | none | **Major** | S | Adopt form-wizard canonical. |
| `pricing/page.tsx` | Data dashboard *(PriceLabs)* | raw TopNav + bespoke `PricingControls` (horizon tabs) | URL params (`building/snapshot/horizon`), ad-hoc | no | uses raw `bg-rose-600` on horizon tabs | **Major** | M | Adopt `BeithadyShell + BHDashboardShell`. Move horizon + building + snapshot into LeftRail. Re-theme rose-600 buttons. |

### 6.2 Data dashboards using `BeithadyShell` but missing LeftRail (Major)

These already use the canonical landing/header wrapper but rely on inline or no-filter patterns where a left filter rail would match the canonical data-dashboard pattern.

| Path | Type | Current filter UI | Severity | Effort | Notes |
|---|---|---|---|---|---|
| `analytics/calendar-heatmap/page.tsx` | Data dashboard | inline (building selector) | **Major** | M | 90-day grid per building. Move building/date filters into LeftRail. |
| `analytics/market-intel/page.tsx` | Data dashboard | inline | **Major** | M | Per-country drilldown; filters benefit from rail. |
| `analytics/market-intel/[country]/page.tsx` | Detail view | n/a | Minor | S | Detail page; rail not required. Confirm uses canonical detail pattern. |
| `analytics/reviews/page.tsx` | List view | inline | Minor | S | Filterable list; current inline strip is OK if filter count <3. |
| `analytics/reports/page.tsx` | Landing (report list) | n/a | None | — | |
| `analytics/reports/builder/page.tsx` | Form / wizard | n/a | None | — | |
| `analytics/reports/[id]/page.tsx` | Detail view | n/a | Minor | S | |
| `analytics/reports/fees-audit/page.tsx` | Data dashboard | **bespoke Sidebar + TitleBar** under `_components/` (parallel implementation to `analytics/performance`) | **Major** | M | Already has the right structure but bespoke. Migrate to consume the shared `BHDashboardShell` package from §7.3 — that's the whole point of the extraction. |
| `analytics/headcount/page.tsx` | Form / calculator | n/a | None | — | |
| `analytics/headcount/security/page.tsx` | Form / calculator | n/a | None | — | |
| `inventory/dashboard/page.tsx` | Data dashboard | inline | **Major** | M | KPI dashboard; would benefit from rail. |
| `inventory/items/page.tsx` | List view | inline filter | Minor | S | Acceptable if <3 filter dims. Verify. |
| `inventory/stock/page.tsx` | Data dashboard | inline | **Major** | M | Filter by warehouse/category. Move to rail. |
| `ads/performance/page.tsx` | Data dashboard | inline | **Major** | M | Channel × date × campaign filters. Rail. |
| `ads/campaigns/page.tsx` | List view | inline | Minor | S | |
| `operations/calendar/page.tsx` | Data dashboard | inline (date) | **Major** | M | Date-driven; rail. |
| `operations/cancel-risk/page.tsx` | Data dashboard | inline | **Major** | M | |
| `operations/morning-brief/page.tsx` | Data dashboard | inline (date) | **Major** | M | |
| `hr/payroll/page.tsx` | Data dashboard | inline (month) | **Major** | M | |
| `hr/attendance/page.tsx` | Data dashboard | inline (date range) | **Major** | M | |
| `hr/headcount/page.tsx` | Data dashboard | inline | **Major** | M | |
| `communication/unified/page.tsx` | List view (inbox) | inline | **Major** | L | Inbox has channel × status × assignee × date — strongly benefits from LeftRail. |
| `communication/archive/page.tsx` | List view | inline | Minor | S | |

### 6.3 Pages on canonical pattern (None)

Listed in summary. All use `BeithadyShell + BeithadyHeader + (Launcher | Form | List | Detail body)`.

- **Module landings (canonical):** `/beithady`, `/beithady/analytics`, `/beithady/operations`, `/beithady/communication`, `/beithady/crm`, `/beithady/inventory`, `/beithady/gallery`, `/beithady/hr`, `/beithady/fnb`, `/beithady/ads`, `/beithady/settings`.
- **Sub-landings (canonical):** `analytics/reports`, `inventory` sub-landings (`/grn`, `/transfers`, `/issue`, `/counts`).
- **List/form pages already on canonical wrapper (~75 pages):** all `/hr/*` (except payroll/attendance/headcount flagged above), all `/settings/*`, all `/ads/*` (except `performance`), all `/inventory/*` non-dashboard, all `/crm/*` (need spot-check on segments/pipeline filter complexity), all `/operations/sop`, all `/communication/admin`, `/communication/guesty`, `/communication/wa-casual`, `/communication/wa-cloud`, `/communication/webhooks`, all `/gallery/*`, all `/fnb/*`, `analytics/headcount/*`.
- **The single canonical data dashboard:** `analytics/performance` ✅

These pages may still have minor brand-color drift (raw Tailwind palette on chrome) — covered as a cross-cutting fix in §7.

## 7. Cross-cutting fixes

These apply across multiple pages and should ship as their own focused PRs ahead of (or alongside) the per-page migrations.

### 7.1 Remove A1 from BH scope filters everywhere *(Blocker)*
- **Source-of-truth code:**
  - `src/app/beithady/financials/_components/FinancialsFilterStrip.tsx` — the `SCOPES` array.
  - `src/lib/financials-pnl.ts` — `CompanyScope` type union and `scopeCompanyIds` function.
  - `src/lib/beithady/financials/types.ts` — alternate type definition.
  - `src/app/beithady/financials/actions.ts`.
  - Type guards in 5 page files (`financials/performance`, `balance-sheet`, `payables`, `ledgers`, `import`).
- **Open question (see §9):** keep A1 functional via URL but hidden from UI, or remove from the underlying `CompanyScope` type entirely?
- **Effort:** S if UI-only; M if removing from type union (need to confirm no internal consumers of `scope='a1'`).

### 7.2 Adopt BH brand vars for chrome — sweep raw Tailwind palette *(Major)*
- Sweep 66 pages flagged for raw Tailwind palette classes.
- Triage rule: replace palette colors used on **chrome** (card backgrounds, borders, banners, status pills, dividers) with `--bh-*` vars. Leave palette colors on **semantic icon accents** (e.g., `text-rose-600` on a lucide icon inside a launcher tile) alone — they're tonally consistent and meaningful.
- Highest-impact targets: `financials/page.tsx` status cards (indigo/red/yellow palette → BH-vars).
- **Effort:** S–M per page; total L across all 66.

### 7.3 Extract `BHDashboardShell` package from `analytics/performance` *(enabler)*
- Move `TitleBar`, `LeftRail`, `MobileFilterSheet`, `CustomizeDrawer` from `src/app/beithady/analytics/performance/_components/` to `src/app/beithady/_components/dashboard-shell/`.
- Move `use-url-state.ts` hook to a generic `use-bh-url-state.ts` that takes a typed shape (so each page can declare its own filter shape).
- Migrate `analytics/performance` to consume the shared primitives (no behavior change — proves the extraction).
- **Converge** with the parallel implementation at `analytics/reports/fees-audit/_components/{Sidebar,TitleBar}.tsx` — that page becomes the second consumer. Reconcile any divergence (the fees-audit Sidebar has country-category presets that auto-apply building filters; the canonical LeftRail doesn't have that affordance. Decision: add an optional `presets` slot to LeftRail, or keep fees-audit's wrapper composition).
- Required before any other data dashboard can adopt the canonical pattern.
- **Effort:** M. **Ships with the first migration that consumes it** (Financials Performance is the obvious candidate — see §8.1).

### 7.4 Add real period picker to financial P&L surfaces *(Blocker)*
- Current `FinancialsFilterStrip` uses pill presets (this month / last month / this quarter / last quarter / this year / last year). No arbitrary month picker — user complaint flagged this explicitly.
- Add `<input type="month">` (or a styled equivalent) to the LeftRail Period section on `financials/performance` and `financials/balance-sheet`. Keep preset pills as quick-jump.
- **Effort:** S (once LeftRail is in place).

## 8. Prioritized migration backlog

Roll-up of all migration work, ordered by priority. Frequency column blank — kareem fills during review.

| # | Migration | Pages touched | Severity | Effort | Freq | Priority order |
|---|---|---|---|---|---|---|
| 1 | **Remove A1 from BH scope filters** (cross-cutting) | 1 (filter strip) + 5 (type guards) + maybe types module | Blocker | S | _ | P0 — ship standalone, frees every subsequent migration |
| 2 | **Extract `BHDashboardShell` primitive + migrate `analytics/performance`** to consume it | 1 (extraction) + 1 (consumer) | enabler | M | _ | P0 — required by every Major-tier data dashboard |
| 3 | **Migrate Financials Performance (P&L)** to new shell + add month picker | 1 | Blocker | L | _ | P1 — loudest user complaint, highest-traffic financial surface |
| 4 | **Migrate Financials Balance Sheet** to new shell | 1 | Blocker | M | _ | P1 |
| 5 | **Migrate Financials landing** to `BeithadyShell + BeithadyLauncher` + re-theme status cards | 1 | Blocker | M | _ | P1 — entry point to all financials |
| 6 | **Migrate Financials Payables / Ledgers / Snapshots / Reconciliation / Import** | 6 | Major–Blocker | M each | _ | P2 — bulk financials work, ships after the canonical patterns are proven on Performance+BS |
| 7 | **Migrate `analytics/calendar-heatmap` + `market-intel` + `reports/fees-audit`** to LeftRail | 3 | Major | M each | _ | P2 |
| 8 | **Migrate `inventory/dashboard` + `inventory/stock`** | 2 | Major | M each | _ | P2 |
| 9 | **Migrate `ads/performance`** | 1 | Major | M | _ | P2 |
| 10 | **Migrate `operations/calendar` + `cancel-risk` + `morning-brief`** | 3 | Major | M each | _ | P2 |
| 11 | **Migrate `hr/payroll` + `attendance` + `headcount` data dashboards** | 3 | Major | M each | _ | P2 |
| 12 | **Migrate `communication/unified` inbox** to LeftRail | 1 | Major | L | _ | P2 — complex (4-dim filter, async loading, infinite scroll) — schedule after simpler migrations to derisk the shell |
| 13 | **Brand var sweep** (replace raw Tailwind palette on chrome surfaces across 66 pages) | up to 66 | Major | L (total) | _ | P3 — bulk cleanup, can run in parallel with feature work |
| 14 | **Migrate `/setup` and `/pricing`** to `BeithadyShell` | 2 | Major | S each | _ | P3 — low-traffic, easy wins |

## 9. Open questions

1. **A1 type removal.** Do we keep `'a1'` in the `CompanyScope` type union (so URL `?scope=a1` still works for any direct-link bookmarks) but hide it from BH UI? Or remove from the type entirely (cleaner, breaks any link/bookmark that still references it)?
2. **Brand var coverage on semantic icons.** Confirm: palette colors on lucide icons inside launcher tiles (e.g., `text-rose-600`, `text-amber-600`) are OK to leave alone — they're semantic accents, not chrome. The brand-only rule applies to surfaces (cards, borders, banners, status pills), not icon strokes. Right?
3. **Frequency column.** I left it blank. Want to fill it in during review, or skip and trust the severity/effort rank?
4. **Inbox filters — left rail or top strip?** `communication/unified` has 4 filter dimensions. The canonical says ≥3 → LeftRail. But inboxes traditionally have a left **navigation** sidebar (folders/channels) rather than a filter rail. Resolve: is the channel selector navigation or filtering? Affects whether LeftRail or a different "InboxRail" pattern is right.
5. **Scope of brand-var sweep.** 66 pages flagged. Do all chrome surfaces get retheme'd, or only the worst offenders (Financials cockpit status cards)? If "only the worst," what's the threshold?
6. **Backlog format.** Want the migration backlog kept as a single living document (this spec), or moved to a tracking surface (Notion / Linear / GitHub issues)?

---

*Generated 2026-05-15 during BH design audit brainstorming session.*
