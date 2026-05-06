# FM+ Performance Dashboard — Design Spec

**Date:** 2026-05-06
**Author:** kareem + claude (brainstorm)
**Status:** Spec — pending kareem's formal review before writing-plans
**Related work:** Project Budget v2 (`docs/superpowers/specs/2026-05-04-fmplus-project-budget-v2-design.md`), Project Report (`docs/superpowers/specs/2026-05-05-fmplus-project-report-design.md`)

---

## 1. Goal

Add a new "Performance Dashboard" surface to FM+ that lets a non-analyst operator answer four questions in one glance, for any contract and any time slice:

1. Are we on plan? (Revenue / Expense / GP, with variance vs budget.)
2. Where is the gap? (By service line and by expense category.)
3. Are we staffed correctly? (Required vs Budgeted vs Implied actual headcount.)
4. What's leaking? (Expenses hitting the contract's analytic account that have no matching budget category.)

Every number on the page is a click away from the source journal lines. The dashboard is read-only — it is a *reading* surface, distinct from the existing Editor (which configures the budget) and Variance (which is a granular cell-level grid).

## 2. Non-goals

- **Not a write surface.** No edits to budgets, no journal posting, no sign-off actions. All edit affordances live on the existing Editor / Variance / Catalog tabs.
- **Not a customer-facing report.** The Project Report module already has a customer mode that hides cost cells. The Performance Dashboard is internal only — it always shows full numbers.
- **No PDF export in v1.** The page prints reasonably (linear scroll), but a polished PDF stays on the Project Report module.
- **No Cost-per-m² panel in v1.** Defer until `project_contracts.zones` reliably carries GFA.

## 3. User stories

- *As an FM operator,* I land on `/fmplus/performance`, see one row per contract with headline numbers for last month, and click the worst-variance contract to dig in.
- *As an FM operator,* I open a contract's dashboard and immediately see whether last month's GP is on plan and which service line is dragging.
- *As an FM operator,* I notice the "Unmapped expenses" panel is non-empty and click through to categorise the lines so next month closes cleanly.
- *As an FM controller,* I toggle off panels I don't need ("Days since sign-off", "Mobilization") and pin the sidebar so the page becomes my morning standup view.
- *As an executive,* I switch the period to YTD and see the year-over-year arc strip to confirm the contract is trending up.

## 4. Routes and navigation

| Route | Page |
|---|---|
| `/fmplus` | (existing) — adds a new "Performance Dashboard" card. |
| `/fmplus/performance` | Portfolio summary. Top KPIs + diverging variance bar + needs-attention cards + sortable contract table. |
| `/fmplus/performance/[contractId]` | Per-contract detail dashboard (the meat — 13 panels, see §6). |

**Permissions:** both routes call `requireBudgetView()` (existing wrapper for `requireDomainAccess('fmplus')`). No admin-only gating. There is no row-level multi-tenancy in the budget tables today, and we don't add one for v1.

## 5. Sidebar UX (both routes share the same shell)

The shell is a fixed left sidebar plus a flexible main content column. The sidebar pattern is identical on the portfolio page and the per-contract page, but the sidebar's contents differ slightly per route.

### 5.1 Dimensions and animation

| State | Width | Trigger |
|---|---|---|
| Expanded | 240 px | Default on first visit; mouse hovering inside the sidebar; pin enabled. |
| Collapsed (icon rail) | 56 px | 3 s after the mouse leaves the sidebar bounding box, **unless** pin is enabled. |

- The transition between states is a 200 ms `ease-out` on `width` and on the main content's `padding-left`.
- The collapse timer is `setTimeout(3000)` started on `mouseleave` and cleared on `mouseenter`. It is also cleared on focus inside the sidebar (so keyboard users don't get auto-collapsed mid-task).
- **Pin button** at the bottom of the sidebar (📌 icon). Toggling it sets `localStorage['fmplus_perf_sidebar_pinned'] = '1' | '0'`. When pinned, the auto-collapse timer is suppressed.
- **Mobile (`< md`, 768 px):** sidebar becomes a slide-over drawer triggered by a hamburger button in the page header. Auto-closes on selection. Pin is hidden on mobile.

### 5.2 Sidebar contents (per-contract page)

```
┌─────────────────────────────┐
│ [FM+ Logo]                  │  ← brand mark, links back to /fmplus/performance
│ Performance                 │
│ Trio Compound · SODIC       │  ← contract context
│                             │
│ ─ PERIOD ─                  │
│ ◦ This Month                │
│ ● Last Month                │  ← default, highlighted yellow
│ ◦ Last 3 Months             │
│ ◦ QTD                       │
│ ◦ YTD                       │
│ ◦ Custom →  (popover)       │
│ ☐ Compare to prior          │  ← off by default
│ Apr 2026 · Y1 · 4/12 mo     │  ← resolved range subtitle
│                             │
│ ─ JUMP TO ─                 │
│ • KPIs                      │
│ • Service Lines             │
│ • Variance                  │
│ • Manning                   │
│ • Categories                │
│ • Unmapped                  │
│ • Forecast                  │
│ • Vendors                   │
│ • Overtime                  │
│ • Mobilization              │
│ • Sign-off status           │
│ • Year-over-Year            │
│ • Anomalies                 │
│                             │
│ ─ VISIBLE SECTIONS ─        │
│ ☑ KPIs       ☑ Service…     │
│ ☑ Variance   ☑ Manning      │
│ ☑ Categories ☑ Unmapped     │
│ ☑ Forecast   ☑ Vendors      │
│ ☑ Overtime   ☑ Mobilization │
│ ☑ Sign-off   ☑ YoY          │
│ ☑ Anomalies                 │
│                             │
│ 📌 Pin sidebar              │
│ EN / ع                      │  ← bilingual toggle
└─────────────────────────────┘
```

Icon-rail icons (collapsed state, top to bottom): brand mark, calendar (period), list (jump to), checkbox (visible sections), pin, language (ع/EN). Each has a tooltip that shows on hover.

### 5.3 Sidebar contents (portfolio page)

Same shell, simpler menu. No "Jump to" / "Visible sections" sections (the portfolio is a single canvas). Replace with:

- Period (same chip set)
- Filters: Service line (multi-select), Health (green/amber/red checkboxes), Search (free-text on contract name + customer)
- Pin
- EN/ع

## 6. Per-contract page — main content

13 panels stacked top-to-bottom in a single flex column. Each panel is a card (`.ix-card` pattern) with a standard header strip:

```
[Section title]                    [○ collapse] [× hide]
[Subtitle / context]
─────────────────────────────────────────────────────────
[panel body — graph + paired comparison table]
```

- **`○ collapse`** toggles the panel body open/closed (chevron rotates). Header stays visible.
- **`× hide`** removes the panel from the column entirely; column reflows. State stored at `localStorage['fmplus_perf_panels']` keyed by panel id (e.g., `{ kpi: true, service_lines: true, manning: false, ... }`). Hidden panels are listed in the sidebar's "Visible sections" group with their checkbox unchecked — re-checking restores them.
- **Panel anchor IDs** (used by the Jump-to nav): `#perf-kpi`, `#perf-service-lines`, `#perf-variance`, `#perf-manning`, `#perf-categories`, `#perf-unmapped`, `#perf-forecast`, `#perf-vendors`, `#perf-overtime`, `#perf-mobilization`, `#perf-signoff`, `#perf-yoy`, `#perf-anomalies`.
- **Auto-hide when empty.** Panels whose data is empty for the selected period auto-hide regardless of the user's visibility toggle. Examples: Unmapped (0 unmapped lines), Mobilization (0 `mobilization_lines` rows), Top 5 Vendors (0 actuals in period), Anomalies (no triggered rules). The sidebar's "Visible sections" checkbox shows them as ghosted/disabled in this case so the user can still see they exist conceptually.

### 6.1 Panel catalogue

| # | id | Title | Visual | Comparison table | Drillthrough |
|---|---|---|---|---|---|
| 1 | `kpi` | **KPIs** | 5 tiles in a row, each: 12 px gold uppercase label · 28-32 px value · variance pill (color + arrow) · 6-month sparkline · chevron top-right. Tiles: Revenue, Expense, GP (abs), GP %, Variance %. | none (tile is the number) | Click tile → smooth-scrolls + flashes the relevant panel below. |
| 2 | `service_lines` | **Service Lines — Budget vs Actual** | Horizontal grouped bars per service line, two bars per line: Budget (slate-400) and Actual (FM+ yellow). GP % shown as a pill at the right of each pair, colored by status. | Service · Budget · Actual · Variance · Variance % · GP % · → | Bar click → drill drawer for that service. Row click → `/fmplus/financial/budget/variance?contract=…&service=…`. |
| 3 | `variance` | **Variance — Biggest Gaps** | Diverging horizontal bars centred on 0 %, sorted by absolute variance %. Right of zero = over budget (red), left = under budget (green). | Same columns as service lines but ranked by `|variance%|` desc. | Same drill targets as Service Lines. |
| 4 | `manning` | **Manning — Headcount & Spend** | Dumbbell per service line. Three dots: Required (slate-500, hollow), Budgeted (gold, solid), Implied actual (FM+ yellow, solid, larger). Tooltip on each dot. Below dumbbell: small horizontal manning-spend bar (Budget vs Actual). | Service · HC Req · HC Bud · HC Implied · Δ HC · Spend Bud · Spend Act · Var % | Row click → manning drill drawer (existing variance-drill filtered to `category='manning'`). |
| 5 | `categories` | **Expense Category Mix** | 8-category donut: manning, ppe, tools, consumables, transport, it, governmental, other. Centre label = Actual total for the period. | Category · Budget · Actual · Variance · Var % · → · plus a final ⚠ **Unmapped** row (red text) when unmapped > 0 | Slice click → drill drawer for that category. |
| 6 | `unmapped` | **⚠ Unmapped Expenses** | (none — table is the panel) | Date · Account code · Account name · Vendor · Journal · Ref · Amount · Categorise → | Row click → drill drawer with that single line; "Categorise →" link → editor pre-filtered to that account. **Panel auto-hides when count = 0.** |
| 7 | `forecast` | **Forecast / Burn Rate** | Half-circle gauge: needle at "current actual / pro-rated target". Below: a callout — "At this pace, year-end actual = X.YM EGP vs budget Z.WM (+/- N%)." Color of callout: green / orange / red per threshold. | none — single sentence is the answer | Click → loads a year-end pro-rata variance view. |
| 8 | `vendors` | **Top 5 Vendors** | Horizontal bar chart, one bar per vendor (FM+ yellow), labels at end. | Vendor · Spend · % of period actual · # invoices · → | Row → drill drawer filtered to that `partner_id`. |
| 9 | `overtime` | **Overtime — % of Manning** | Single KPI tile: OT spend value · OT as % of manning (variance pill vs budgeted %) · 6-month sparkline. | none — embedded in tile | Click tile → drill drawer to OT-flagged journal lines. |
| 10 | `mobilization` | **Mobilization Amortization** | Progress bar per `mobilization_lines` row: filled portion = amortized to date, hollow = remaining. Right label: "X of Y months". | Item · Total cost · Amortized · Remaining · Months left | Row → editor for that mob line. |
| 11 | `signoff` | **Sign-off Status** | Tiny status card with a colored dot (green = published, amber = stale draft > 30 d, slate = recent draft) and "Last published Y1 by kareem on 2026-04-22 · 14 days ago." | none | Click → variance page for that year. |
| 12 | `yoy` | **Year-over-Year Arc** | (none — table is the panel; row order = year_index asc) | Year · Status · Revenue · Expense · GP · GP % · Variance % · Health · → | Row → loads the dashboard for that year (date-range = full year). |
| 13 | `anomalies` | **Anomalies & Suggestions** | Bullet list of auto-detected issues, one bullet per line, each with a "Take action →" link on the right. Examples: *"Manning spend in HK is 8 % over budget — investigate overtime", "412 K unmapped — categorise before close", "Expense pace is 14 % ahead of plan."* | none | Each bullet → its own drill target (varies per rule). |

### 6.2 Panel order rationale

KPIs first (the headline). Service Lines + Variance + Manning cover the user's #1-#4 axes (Revenue, Expense, Manning, GP) at increasing levels of detail. Categories + Unmapped cover #2 and #5 (expense breakdown and leakage). Forecast/Vendors/Overtime/Mobilization/Sign-off are the "extras" — placed mid-page so they don't dominate. YoY and Anomalies are context strips at the bottom.

## 7. Portfolio page — main content

```
[Period chips] [Compare ☐]            [Apr 2026 subtitle]

KPI strip — 4 tiles: Total Revenue · Total Expense · Blended GP % · Portfolio Variance %
                     (variance pill + sparkline per tile, same anatomy as per-contract)

Variance — every contract, ranked      [LEFT: diverging bars centred 0%]
                                       [RIGHT: ranked table]
                                          Project · Customer · Var % · → 

Needs Attention — top-N cards (where |variance %| > amber threshold = 15 %)
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │ Trio Compound│ │ Uptown EMAAR │ │ City Gate    │
   │ +33 %        │ │ +15.3 %      │ │ -100 %       │
   │ Manning over │ │ Spend ahead  │ │ No actuals   │
   │ View →       │ │ View →       │ │ View →       │
   └──────────────┘ └──────────────┘ └──────────────┘

All contracts — sortable table
   Project · Customer · Year · Revenue · Expense · GP · GP % · Variance % · Health · Last sync · →
```

Each row → `/fmplus/performance/[contractId]?period=last-month` (period preserved across navigation).

## 8. Period filter

### 8.1 Chip set

| Chip | Meaning | Resolved range |
|---|---|---|
| This Month | Current month, partial. | First-of-month → today. |
| **Last Month** *(default)* | Last completed month. | First-of-prev-month → last-of-prev-month. |
| Last 3 Months | Trailing 3 calendar months. | First-of-(today − 3 months) → last-of-prev-month. |
| QTD | Quarter-to-date. | First-of-quarter → today. |
| YTD | Calendar year-to-date. | Jan 1 of current year → today. |
| Custom | Any date range. | Opens a calendar popover with two date pickers. |

The resolved range is shown as a subtitle below the chip row in the format **"Apr 2026 · Y1 · 4/12 mo elapsed"** (per-contract page) or **"Apr 2026 · 12 contracts"** (portfolio page).

### 8.2 Compare to prior period toggle

Off by default. When on:

- KPI tiles show prior-period value as a faded sub-line under the variance pill.
- Sparklines show two series (current = yellow, prior = slate-400 dashed).
- All bar/donut charts gain a faded "prior" overlay in the same dim slate.
- The variance pill's value remains "Actual vs Budget" — the prior series is decorative context, not a comparison axis. (Avoiding ambiguity about which variance is shown.)

The "prior period" definition matches the chip selection length: Last Month → Mar 2026; YTD → YTD 2025 (same number of days).

## 9. Data model and APIs

### 9.1 Reads (no schema changes for v1)

All data comes from existing tables. The new build function composes them.

- `project_contracts` — contract metadata. `contract_value`, `customer`, `start_date`, `end_date`.
- `project_years` — for YoY arc and current-year resolution.
- `project_year_services` — per-year revenue (`monthly_revenue`).
- `budget_lines` — cell grid. Filter `category='manning'` for CTC/HC; group by `service_line`/`category` for budget rollups.
- `mobilization_lines` — for the Mobilization panel.
- `odoo_move_lines` ⨝ `odoo_move_line_analytics` — actuals. Join on `analytic_account_id == project_contracts.project_id`.
- `odoo_partners` — vendor names for the Top-5 Vendors panel.
- `project_year_signoffs` — for the Sign-off Status panel.

### 9.2 New aggregation module

```
src/lib/fmplus/performance/build-dashboard.ts
  buildContractDashboard({ contract_id, period: { from, to }, compare?: boolean }):
    Promise<ContractDashboardPayload>

  buildPortfolioPerformance({ period, filters? }):
    Promise<PortfolioPerformancePayload>
```

`buildContractDashboard` is the per-contract page payload. It:

1. Calls existing `buildBudgetVarianceV2(contract_id, year_id)` for service-line / category / cell variance.
2. Slices that result by the `period` window (the variance loader is already month-keyed; we sum the months that fall in `from`..`to`).
3. Adds derived blocks:
   - **Implied HC** per service line: `actual_manning_spend / weighted_avg_ctc` where `weighted_avg_ctc = Σ(qty × unit_cost) / Σ(qty)` over `budget_lines` filtered to `category='manning'` and the service.
   - **Forecast**: simple linear projection — `period_actual / months_elapsed × 12 = projected_year_actual`. Variance vs `total_budget`. (v2 may add seasonality.)
   - **Top vendors**: `SELECT partner_id, SUM(debit-credit) FROM odoo_move_lines ⨝ odoo_partners WHERE analytic = contract.project_id AND date IN period GROUP BY partner_id ORDER BY sum DESC LIMIT 5`.
   - **OT %**: sum manning rows' `ctc_ot` for budget; for actual, look at journal-line account codes matching the OT pattern in the HK template (`templates/hk.ts:73`). Stub for non-HK service lines until they have account-code regexes.
   - **Mobilization status**: per `mobilization_lines` row, compute `(months_elapsed / amortization_months) * total_cost` as amortized; cap at total.
   - **Sign-off freshness**: latest `project_year_signoffs.signed_at` per year.
   - **Anomalies (v1 rules)**: returns `{ severity: 'amber'|'red', message, action_url }[]`.
       1. Any service line with manning variance > `budget_settings.amber_pct` (default 15 %) — severity = amber, message = "Manning spend in {service} is {var}% over budget — investigate overtime", action = variance page filtered to that service + manning category.
       2. Unmapped expenses > 5 % of total period spend — severity = red if > 15 %, else amber. Message = "{X}K unmapped — categorise before close", action = jump to Unmapped panel.
       3. Forecast year-end variance > `budget_settings.amber_pct` — severity matches threshold breach. Message = "At current pace, year-end actual = {X} vs budget {Y} ({±Z}%)", action = scrolls to Forecast panel.
       4. Latest sign-off > 30 days stale on the current year — severity = amber. Message = "Sign-off is {N} days stale", action = sign-off block on the report page.
       5. Top vendor concentration > 40 % of period spend — severity = amber. Message = "{vendor} accounts for {Y}% of period spend", action = vendor drill drawer.
       Thresholds (5 %, 15 %, 30 d, 40 %) live as constants in `build-dashboard.ts` for v1; future versions may move them into `budget_settings`.
4. If `compare === true`, runs the same query for the prior period and returns a parallel `prior` block.

`buildPortfolioPerformance` is the portfolio page payload. It iterates every contract and runs `buildBudgetVarianceV2` in parallel (same pattern as `src/app/fmplus/financial/budget/page.tsx:27-59`), then aggregates totals + needs-attention list + table rows.

### 9.3 New API route

`/api/fmplus/performance/[contractId]/route.ts`

- `GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&compare=1`
- Returns `ContractDashboardPayload` JSON.
- Server-side via `buildContractDashboard`. Auth: `requireBudgetView`.

The portfolio page renders server-side (no separate API route — same pattern as the existing overview page).

### 9.4 Drilldown API (reused)

The cell-level drilldown reuses the existing endpoint:

`/api/fmplus/budget/variance-drill?contract=&service=&category=&from=&to=` — no changes needed; we just call it with the period dates instead of a single year.

## 10. State persistence

| Key | Scope | Default | Type |
|---|---|---|---|
| `localStorage['fmplus_perf_sidebar_pinned']` | per-browser | unset (= unpinned) | `'1' \| '0'` |
| `localStorage['fmplus_perf_panels']` | per-browser | all panels visible | JSON `Record<panel_id, boolean>` |
| `localStorage['fmplus_perf_panels_collapsed']` | per-browser | all panels expanded | JSON `Record<panel_id, boolean>` |
| `localStorage['fmplus_budget_lang']` | (existing) | `'en'` | `'en' \| 'ar' \| 'both'` |
| URL `?period=last-month` (or `?from=&to=`) | per-link | `last-month` | string |
| URL `?compare=1` | per-link | absent | flag |

Period and compare flag live in the URL so links between portfolio → contract → variance preserve them. Sidebar state lives in localStorage so it doesn't pollute every link.

## 11. Brand and visual rules

Single source of truth: `src/lib/fmplus/brand.ts` (already exists).

### 11.1 Color usage

| Use | Token | Notes |
|---|---|---|
| KPI tile primary value | `fmplus-yellow` (`#FDCF00`) | only at ≥ 14 px to stay readable on navy |
| Active filter chip background | `fmplus-yellow` | black foreground |
| "Actual" chart series | `fmplus-yellow` | the hero series |
| Hover state on links + chevrons | `fmplus-gold` (`#EEB91D`) | |
| "Budget" chart series | `slate-400` | the context series |
| "Prior period" overlay (compare mode) | `slate-300` dashed | |
| Status: good / on-plan | `#22C55E` (green-500) | **never `fmplus-yellow` for status** |
| Status: warning / off-plan | `#F97316` (orange-500) | distinct from `fmplus-gold` |
| Status: bad / breach | `#EF4444` (red-500) | |
| Card background | `slate-900` (light) / `slate-800` (dark) | per existing `.ix-card` |
| Body text | white (≥ 7 : 1 contrast on card bg) | |

The brand-yellow-as-status conflict is real (white-on-yellow ≈ 1.07 : 1 contrast — fails WCAG). Status indicators use the separate green/orange/red palette only. Brand yellow stays for emphasis.

### 11.2 Typography

Per `src/lib/fmplus/brand.ts` — Lalezar (display headlines), DM Serif Display (subheads + KPI values), Lato (body), NotoSansArabic (Arabic fallback). Existing `.ix-card` already wires these.

### 11.3 Iconography

Lucide icons (already in deps). Standard set: `LayoutDashboard` for sidebar brand mark, `Calendar` for period, `List` for jump-to, `Eye` for visibility, `Pin` for pin, `ChevronDown` for collapse, `X` for hide, `ArrowRight` for drill, `AlertTriangle` for anomalies, `Languages` for EN/ع.

### 11.4 Density

- Cards: `p-6` standard, `p-4` for the KPI tile cluster.
- Vertical gap between cards: `gap-4` (16 px).
- Sidebar internal spacing: `gap-6` between groups, `gap-2` within a group.

## 12. Accessibility

- Sidebar collapse triggered by hover only — keyboard users must have a manual collapse button (the same 📌 pin button toggles between locked-expanded and locked-collapsed when focus is on it via Enter).
- Auto-collapse timer is suppressed while focus is anywhere inside the sidebar.
- All charts have a paired comparison table with the same data — screen-reader users always have the numbers.
- Status conveyed via color + arrow + text label (never color alone). The variance pill always reads "+12.4 %" with an up-arrow + red background — no information lost when the color is removed.
- All clickable cells / bars / slices are real `<button>` or `<a>`, not div-with-onclick. Focus-visible ring uses `fmplus-yellow`.
- Skip link at the top of the page jumps focus to "Main content."

## 13. Bilingual EN/ع

Reuse `src/app/fmplus/financial/budget/_components/bilingual-toggle.tsx` and the `LangLabel` helper from `manning-summary.tsx`. The toggle has three states: EN / ع / Both. State stored at `localStorage['fmplus_budget_lang']` (existing key).

In `'ar'` mode, `document.documentElement.dir = 'rtl'`. Each panel's flex direction is `start`-relative (Tailwind logical properties — `ms-*` / `me-*` instead of `ml-*` / `mr-*`) so the layout flips cleanly. Charts: legends and axis labels translated; bar order unchanged (still ranked by variance, just laid out RTL).

## 14. Mobile considerations

- Sidebar → slide-over drawer triggered by hamburger in page header. Auto-closes on selection. Pin hidden on mobile.
- Panels stack at full width.
- KPI strip wraps to 2 × 2 + 1 (or 1 column on very narrow screens).
- Charts: dumbbell + diverging bars stay horizontal (work fine narrow); donut shrinks; grouped bars become vertical when width < 480 px.

## 15. Out of scope / v2 candidates

- Cost-per-m² / per-zone panel (extra f) — depends on `project_contracts.zones` reliably carrying GFA.
- PDF export of the dashboard.
- Customer-facing mode that hides cost data.
- Forecast model with seasonality (v1 is straight-line linear projection).
- Editing or annotating the dashboard (notes, comments).
- Email digest / scheduled snapshot.
- Multi-tenancy / per-contract permissions.
- Account-code regex coverage for the 6 stub service-line templates (mep / landscape / security / pest_ctrl / waste_mgmt / back_office) — until those land, their actuals will continue to fall into Unmapped.

## 16. Open questions / risks

- **Implied HC denominator stability:** weighted avg CTC is sensitive to the manning roster. If the roster has a single very-high-CTC role (e.g. "Operations Manager"), the avg skews and implied HC is misleading. **Mitigation:** show implied HC as a *range* derived from min-CTC / max-CTC bounds when the spread is large. Note in the panel tooltip.
- **Forecast accuracy:** straight-line projection ignores seasonality (manning ramp, mobilization weights). v1 ships with an explicit "linear projection — does not account for ramp" tooltip.
- **Anomaly thresholds:** the rules in panel 13 use hard-coded thresholds (manning > 8 %, unmapped > 5 %, pace > 10 %). v1 reads these from `budget_settings` (`green_pct`, `amber_pct`) where applicable — the rest stay as constants in the build module.
- **Performance:** portfolio page calls `buildBudgetVarianceV2` per contract in parallel. With 50+ contracts this is fine; with 500+ it would need pagination / batching. Today the budget has < 10 active contracts.

## 17. Acceptance criteria (sketch — refined in writing-plans)

- A user can click "Performance Dashboard" on `/fmplus`, land on `/fmplus/performance`, see the portfolio with the period defaulting to Last Month, and click into a contract to see the per-contract dashboard.
- All 13 panels render for a contract that has at least one published year and one month of synced actuals.
- Panels with no data for the period (e.g. Unmapped when 0, Mobilization when no mob lines) auto-hide.
- Hover-out collapses the sidebar after 3 s; pin keeps it expanded.
- Toggling a panel off via either the sidebar's "Visible sections" group or the panel's `× hide` button removes it; the state persists across page reloads in the same browser.
- Every chart segment, bar, slice, and table row navigates to the appropriate drill target (variance drill drawer, variance page, editor, or focuses a sibling panel).
- The page renders cleanly in both EN and ع (RTL) modes without layout breakage.
- The page passes Lighthouse accessibility ≥ 95 on a contract with full data.

---

**End of spec.** Next step: spec self-review (this document), then kareem's formal review before invoking writing-plans.
