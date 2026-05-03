# FMPLUS Financials Sub-Module — Design Spec

**Date:** 2026-05-03
**Status:** Spec — pending implementation plan
**Worktree branch:** `claude/nifty-dubinsky-1633d8`
**Rollout:** Single-shot release (one PR, one migration, one deploy)

---

## 1. Overview

Adds a new top-level **FMPLUS** module at `/fmplus` with its first sub-module: **Financials**, pulled from Odoo's `fmplus.odoo.com` tenant for the company "FMPLUS Property & Facility Management" (single-company; no consolidation, no intercompany elimination).

The sub-module replicates the user's existing Feb-2026 Excel exports row-for-row:

- **Profit & Loss statement** — service-line revenue (HK / MEP / Security / Landscape / Pest / Waste / Paid Services / Variation Order) cascading through Cost of Operations → Gross Profit → General Expenses → EBITDA → INT/TAX/DEP → Net Profit. Each service line carries its own Gross Margin %.
- **Balance Sheet** — Assets / Liabilities / Equity with Excel-mirrored sub-buckets, opening-balance seed for periods ≥ 2026-02-28.
- **Dashboard** — KPI strip, revenue/cost mix donuts, gross-margin-by-service horizontal bar, 12-month trend line, top-10 active projects.

Three filter dimensions:

1. **Period granularity** — Monthly / Quarterly / Yearly tabs.
2. **Period count** — 1 / 3 / 6 / 12 columns side-by-side.
3. **Scope mode** — Period Trend (default) / Plans Compare (pick N plans, columns) / Accounts Compare (pick 1 plan + N accounts, columns).

URL is the source of truth for every filter — the page is shareable, bookmarkable, and the back button works.

---

## 2. Goals & non-goals

### Goals

- Replicate the user's two Excel statements (P&L "with Dep" and "no Dep" variant; Balance Sheet) row-for-row so the operator can read the same hierarchy they're used to.
- Surface **per-service-line gross margin** as a hard requirement — it's the single most-actionable number for a multi-service ops business.
- Enable trend reading (last 3 / 6 / 12 periods side-by-side) to spot deterioration before it lands in a closing meeting.
- Enable project-level drill-down: pick a plan, see which projects are dragging the line down.
- "Active-only" picker — never show 0-balance accounts in the chooser, scoped to the selected period.
- Dashboard view with charts/graphs as the entry point — exec view first, statement detail second.
- No regression to Beithady financials. FMPLUS classifier + aggregator are wholly separate.

### Non-goals (explicitly out of v1)

- Payables / Receivables aging surface (Beithady has them; FMPLUS spec doesn't ask for them).
- Cash Flow Statement.
- Trial Balance / GL drill-down to individual journal entries.
- Multi-company consolidation (FMPLUS is single-company in this tenant).
- Budget overlay (no Odoo budget module evidence in the tenant export).
- Forecast / what-if scenarios.
- Historical periods before 2026-02-28 (the opening-balance seed date — earlier periods would need a deeper move-lines backfill which is out of scope).
- 2D matrix view (periods × plans simultaneously) — alternates only.
- Custom-arithmetic line items beyond the Excel template.

---

## 3. Decisions log (from Q1–Q4 brainstorming)

| Q | Decision | Rationale |
|---|----------|-----------|
| Q1 Company scope | Single Odoo company "FMPLUS Property & Facility Management" | User confirmed via Odoo company-switcher screenshot; no consolidation needed |
| Q2 P&L format | Mirror the Feb-2026 Excel export row-for-row, both "with Dep" and "no Dep" as a toggle | User provided the file; "you suggest best form - with percentages to revenue - Clear Dashboards and Informational Graphs" |
| — Classifier | Pure code-prefix rules (50/51/52/53/54/55/56/57 = service-line costs; 600-606 = G&A; 607 = Interest; 608/609 = Depreciation) | FMPLUS CoA is deterministic by prefix — no name-regex hacks like Beithady's "Home Owner Cut" |
| — Per-service Gross Margin | Hard requirement; rendered as a colored pill on each "Cost of {Service}" header | User explicitly asked for percentages; the Excel surfaces it |
| — With-dep vs No-dep toggle | URL flag `with_dep=1` (default ON); off = strip 5xx02xx depreciation rows from COGS subgroups, sum into bottom INT-TAX-DEP bucket | User has both views in their Excel |
| Q3 Period comparison | Granularity tabs (Monthly/Quarterly/Yearly) + Last-N-Periods selector (1/3/6/12) → render N columns side-by-side as a trend table; default 3 | User example: "Monthly - Last 3 Periods" |
| — Comparison axis | Period-Trend mode renders multiple periods as columns. Δ% column appears between each pair | Standard finance review pattern |
| Q4 Multi-select | Two-step: pick period first → toggle Mode (Plans Compare / Accounts Compare) → multi-select inside | User-described flow |
| — Active-account prune | Picker queries `pnl_aggregated_multiperiod` for the selected period and only lists accounts with non-zero `SUM(ABS(balance))` | User: "Only Accounts that Have active values in the period chosen appear to choose from" |
| — Mode stacking | Period-Compare and Plan/Account-Compare are alternates, never combine into a 2D matrix | Readability — picking 4 plans × 6 months = 24 columns gets unreadable fast |
| — BS plan-compare | Hidden on Balance Sheet tab; small banner explains "BS is whole-company; project scoping doesn't apply" | A single project doesn't have its own BS |
| — Tabs | Dashboard (default) / Profit & Loss / Balance Sheet | User asked for "Clear Dashboards and Informational Graphs" — leads with charts |
| — Nav placement | New top-level `/fmplus` route, parallel to `/beithady` and `/kika` | First feature for FMPLUS module — establishes home base |
| — Opening balance seed | Mandatory; seed file `src/lib/fmplus/opening-balance.ts` from the Feb-2026 Excel snapshot; live-sums deltas after that date | Same approach as Beithady — move_lines only sync ~365 days |
| — FMPLUS company-id discovery | One-shot helper `discoverFmplusCompanyId()` in the sync queries `res.company WHERE name='FMPLUS Property & Facility Management'` and persists to `odoo_companies` | User didn't share the ID; auto-discovery is cheap and resilient to Odoo-side changes |
| — Sync cadence | Rides existing financial-sync cron. No new cron entry | One-line change to `FINANCIALS_COMPANY_IDS` |
| — URL state | Every filter is GET-encoded; same pattern as the existing Beithady financials page | Shareable, bookmarkable, back-button safe |
| — Drafts | `include_drafts=1` default (parent_state IN ('draft','posted')) | Matches user's Excel "Filters" tab "With Draft Entries" |
| — Excel/PDF export | Uses existing `exceljs` / `@react-pdf/renderer` | Already in deps; matches Beithady's pattern |

---

## 4. Information architecture & routing

### 4.1 Routes

```
/fmplus                          — FMPLUS module landing.
                                   v1: cards for each sub-module (Financials only).
                                   Future: ops/projects/contracts cards alongside.
/fmplus/financials               — Financials sub-module (3 tabs).
/api/fmplus/active-accounts      — GET: returns active analytic accounts for a
                                   given (plan_id, period, company_id) tuple.
                                   Drives the picker auto-prune.
```

### 4.2 URL state on `/fmplus/financials`

| Param            | Values                                  | Default            | Notes |
|------------------|-----------------------------------------|--------------------|-------|
| `view`           | `dashboard` / `pnl` / `balance_sheet`   | `dashboard`        | Active tab |
| `granularity`    | `monthly` / `quarterly` / `yearly`      | `monthly`          | Top-bar tabs |
| `periods`        | `1` / `3` / `6` / `12`                  | `3`                | Number of columns |
| `asof`           | `YYYY-MM` (monthly), `YYYY-Q[1-4]` (quarterly), `YYYY` (yearly) | most recent closed period | Anchor — most recent column |
| `mode`           | `trend` / `plans` / `accounts`          | `trend`            | Scope mode |
| `plans`          | csv of plan slugs (e.g. `hk_projects,mep_projects`) | empty | Only when mode=plans |
| `plan`           | single plan slug                        | empty              | Only when mode=accounts |
| `accounts`       | csv of analytic.account ids             | empty              | Only when mode=accounts |
| `with_dep`       | `1` / `0`                               | `1`                | "Show depreciation in COGS" |
| `include_drafts` | `1` / `0`                               | `1`                | Include parent_state=draft |

### 4.3 Tabs & filter bar

The filter bar is sticky at the top and persists across tabs. Tab content below it re-renders on filter change.

```
[ Dashboard ]  [ Profit & Loss ]  [ Balance Sheet ]
─────────────────────────────────────────────────────
GRANULARITY:  [ Monthly* ] [ Quarterly ] [ Yearly ]
PERIODS:      [ 1 ]  [ 3* ]  [ 6 ]  [ 12 ]   As of: [ Feb 2026 ▾ ]
MODE:         (•) Period Trend  ( ) Plans Compare  ( ) Accounts
[ mode-specific picker appears here when mode ≠ trend ]
OPTIONS:      ☑ Include drafts   ☑ Show depreciation in COGS
─────────────────────────────────────────────────────
Active filter: 3 columns · Period Trend · Feb 2026 / Jan 2026 / Dec 2025
```

On the Balance Sheet tab, the MODE row is hidden with a banner: *"Balance Sheet is whole-company; project scoping doesn't apply."*

---

## 5. P&L renderer

### 5.1 Data model

```ts
type PnlPeriod = {
  key: string;                     // 'm:2026-02', 'q:2026-1', 'y:2026'
  label: string;                   // 'Feb 2026', 'Q1 2026', '2026'
  fromDate: string;                // 'YYYY-MM-DD'
  toDate: string;
};

type PnlLeaf = {
  code: string;                    // '500001'
  name: string;                    // 'Basic Salary Hk'
  account_type: string;            // 'expense_direct_cost'
  values: Record<string, number>;  // { 'm:2026-02': 7265784.56, ... }
};

type PnlAccountGroup = {
  key: string;                     // '500001-500012'
  label: string;                   // 'HK - Headcount Cost'
  totals: Record<string, number>;
  leaves: PnlLeaf[];
};

type PnlServiceLine = {
  key: 'hk' | 'mep' | 'security' | 'landscape' | 'pest' | 'waste' | 'paid' | 'vo';
  label: string;                   // 'Cost of Housekeeping'
  totals: Record<string, number>;
  groups: PnlAccountGroup[];
  gross_margin_pct: Record<string, number>;  // per-period margin %
};

type PnlSection =
  | { key: 'revenue'; label: 'Revenue'; totals: ...; subgroups: ... }
  | { key: 'cost_of_revenue'; label: 'Cost of Revenue'; totals: ...; service_lines: PnlServiceLine[] }
  | { key: 'general_expenses'; label: 'General Expenses'; totals: ...; subgroups: ... }
  | { key: 'interest_tax_dep'; label: 'INT - TAXES - DEP'; totals: ...; subgroups: ... };

type PnlReport = {
  periods: PnlPeriod[];            // 1..12 columns
  scope: { mode, plans, plan, accounts };
  sections: PnlSection[];
  subtotals: {
    gross_profit:  Record<string, number>;
    ebitda:        Record<string, number>;
    net_profit:    Record<string, number>;
  };
  unclassified: PnlLeaf[];         // any account whose code prefix doesn't fit
};
```

### 5.2 Classifier (pure function, deterministic)

`src/lib/fmplus/classifier.ts`:

```
classifyByPrefix(code, name, account_type):
  Income / income_other:
    Match name keywords: HK / MEP / Security / Landscape / Pest / Waste /
      "paid services" / "variation order" / "other"
    → section=revenue, subgroup=<service_revenue|other_revenue>

  expense_direct_cost / expense / expense_depreciation:
    code prefix '500..501'  → service=HK,        cost_category=<by 3rd-digit>
    code prefix '510..511'  → service=MEP
    code prefix '520..521'  → service=Security
    code prefix '530..531'  → service=Landscape
    code prefix '540..541'  → service=PestControl
    code prefix '550..551'  → service=WasteManagement
    code prefix '560..561'  → service=PaidServices
    code prefix '570..571'  → service=VariationOrder
    code prefix '600'       → ga.back_office_salaries
    code prefix '601'       → ga.office_rent_utilities
    code prefix '602'       → ga.transportation
    code prefix '603'       → ga.marketing_tender
    code prefix '604'       → ga.legal_financial
    code prefix '605'..'606'→ ga.other
    code prefix '607'       → interest_tax_dep.interest
    code prefix '608'..'609'→ interest_tax_dep.depreciation
    else                    → unclassified (surface in panel)

  Cost-category sub-prefix (3rd digit of 5xxx**x**xx):
    0 → Headcount       (xx0001-xx0012)
    1 → Consumables     (xx0101-xx0106)
    2 → Tools/Equipment (xx0201-xx0208)   ← contains depreciation rows
    3 → ICT             (xx0301-xx0306)
    4 → Staff Accommodation (xx0401-xx0408)
    5 → Transportation  (xx0501-xx0540)
    6 → Subcontractors  (xx0601-xx0608)
    9 → Contracting Insurance (xx0901-xx0902)
    10 → Penalties      (xx1001-xx1002)
    11 → Indirect Costs (xx1101-xx1103)
```

### 5.3 With-dep / No-dep toggle

When `with_dep=0`:
- Move the entire `xx02xx` cost-category group out of every service line.
- Sum it into the bottom `interest_tax_dep.depreciation` bucket.
- Service-line gross margin recalculates accordingly.
- Net Profit must remain identical between the two views (sanity-check during render).

### 5.4 Layout rules

- Every section is a collapsible `<details>` with chevron rotation. Top-level sections start CLOSED in P&L; only subtotal rows (Gross Profit / EBITDA / Net Profit) are always-visible.
- Per-service-line **Gross Margin pill**: color-coded green ≥ 20%, amber 5–20%, red < 5%. Click pill → drill into that service line's accounts (Accounts-Compare mode pre-filtered).
- **% column** (% of period revenue) renders next to every balance value in every period.
- **Period column ordering**: current (anchor) is **leftmost**, older periods to the right (matches the user's Excel and the natural eye-landing point for the most-relevant data).
- **Δ% column** appears between each pair of period columns when `periods ≥ 2`. The Δ shows movement from the column to its right (older) to the column to its left (newer) — i.e., "how did this number change from older to newer?". Color-coded: green if improving, red if deteriorating; cost lines invert the color logic.
- Net Profit hero card top-right of P&L tab: signed value + 6-period sparkline.
- Unclassified panel at the bottom: amber, dismissible, lists leaf accounts that didn't classify. Surfaces CoA drift over time.
- Excel export button (top-right): `exceljs` writes a multi-sheet workbook (P&L, BS, Cover w/ filter summary).
- PDF export (top-right): `@react-pdf/renderer` produces a print-friendly snapshot.

### 5.5 Plans Compare mode

Columns are plans (e.g., HK Projects + MEP Projects). Single period. Same row hierarchy.

### 5.6 Accounts Compare mode

Columns are individual analytic accounts within one plan (e.g., 3 Marassi projects). Single period. Account names auto-pruned to those with active values in the period.

---

## 6. Balance Sheet renderer

### 6.1 Data model

Mirrors the user's "Balance Sheet" sheet in `financial_statements__fm (7).xlsx`:

```
ASSETS
  Current Assets
    Bank and Cash Accounts
      [123001-123117 Cash, Bank, and Custody]
      [215001-215003 Other Non-Current Liabilities]   (Excel quirk preserved)
      [221001-221016 Trade and Other Payables]        (Excel quirk preserved)
      [(No Group)]
    Receivables
      [122001 Trade and Other Receivables]
      [(No Group)]
    Current Assets (sub-sub)
      [121001-121012 Inventories]
      [124001-124028 Prepayments]
    Prepayments
      [124001-124028 Prepayments]
  Plus Fixed Assets
    [111001-111006 PPE]
    [111007-111010 Equipment]
    [111011-111014 Electrical Devices]
    [111015-111018 Tools]
    [111019-111022 Furniture]
    [111023-111026 Computers, Printers]
    [111027-111028 Leasehold Improvements]
    [111029-111034 Uniform]
    [112001-112006 Right Of Use Assets - Car]
    [112007-112008 Right Of Use Assets - Equipment]
  Plus Non-current Assets
    [113001 Deferred Tax Assets]
    [115001-115002 Intangible Assets]
    [117001-117007 Restricted Cash]
    [(No Group)]

LIABILITIES
  Current Liabilities
    Current Liabilities (sub-sub)
      [221001-221016 Trade and Other Payables]
      [226001-226006 Current Tax Liabilities]
      [227001-227004 Other Liabilities]
    Payables
      [221001-221016 Trade and Other Payables]
  Plus Non-current Liabilities
    [211001 Borrowings - Concrete]
    [211002 Borrowings - Lime]
    [211003 Borrowings - Bank]
    [211004 Borrowings - CIB]
    [211005 Borrowings - FAB]
    [215001-215003 Other Non-Current Liabilities]
    [(No Group)]

EQUITY
  Unallocated Earnings
    Current Year Unallocated Earnings    ← derived from current-FY YTD P&L
    Previous Years Unallocated Earnings  ← from equity_unaffected balance
  Retained Earnings
    Previous Years Retained Earnings

LIABILITIES + EQUITY  (must equal ASSETS within 1 EGP tolerance)
```

### 6.2 Opening-balance seed

`src/lib/fmplus/opening-balance.ts` contains the cumulative balances at `2026-02-28` extracted from the user's Balance Sheet export. The renderer:

- For `asof < 2026-02-28`: shows banner "Snapshots before 2026-02-28 unavailable" and renders the seed snapshot only for asof = 2026-02-28.
- For `asof = 2026-02-28`: renders directly from the seed.
- For `asof > 2026-02-28`: seeds the totals with the snapshot values, then sums move_lines after `2026-02-28` and adds the deltas. Live updates as new lines sync.

This mirrors the `useOpeningBalance` path in [financials-pnl.ts:775-811](src/lib/financials-pnl.ts).

### 6.3 Balance check

Show ✓ green if `|assets - (liabilities + equity)| < 1 EGP`, ⚠ amber otherwise with the delta amount. This catches both data drift and sign-convention mistakes early.

### 6.4 Period-Trend on BS

When `periods ≥ 2`, columns are **snapshots at each period's last day**. e.g., periods=3, monthly, asof=2026-02 → columns = 2026-02-28, 2026-01-31, 2025-12-31. Δ column shows movement amount + %.

### 6.5 No plan/account-compare on BS

Mode toggle hidden; renders the whole-company BS regardless of mode setting.

---

## 7. Dashboard tab (charts & KPIs)

Default landing tab. Built with `recharts` (already in `package.json`). Charts in client components; data aggregation in server components above them.

### 7.1 KPI strip (4 cards across the top)

```
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ Revenue    │ │ Gross Pr.  │ │ EBITDA     │ │ Net Profit │
│ 38.5M      │ │ 5.3M (13.7%)│ │ 808k (2.1%)│ │ -716k (-1.9%)│
│ vs Jan +X% │ │ vs Jan ±X%  │ │ vs Jan ±X% │ │ vs Jan ±X% │
│ ▁▂▄▆█▇▅    │ │ ▆▇▆▇█▇▆     │ │ ▂▃▂▃▂▃▂    │ │ ▂▁▂▁▃▁▂    │
└────────────┘ └────────────┘ └────────────┘ └────────────┘
```

- Each card shows current period value, % vs immediately prior period of same granularity, and a 6-period sparkline.
- Click a card → navigates to the P&L tab with cursor scrolled to that subtotal row.

### 7.2 Revenue & Cost mix donuts (side-by-side)

- Revenue donut: 8 service-line revenue slices, sorted by share desc.
- Cost donut: 8 service-line cost slices.
- Hover: tooltip with exact value + %.
- Click slice: jump to Accounts-Compare mode pre-filtered to that service line's plan.

### 7.3 Gross Margin by Service Line (horizontal bar)

- 8 bars, sorted by margin desc.
- Color: green ≥ 20%, amber 5–20%, red < 5%.
- Most-actionable chart on the page — surfaces drag immediately.

### 7.4 12-Month Trend (line chart)

- 4 lines: Revenue (blue), Gross Profit (green), EBITDA (amber), Net Profit (red).
- X-axis: trailing 12 months (or 12 quarters / 5 years per granularity tab).
- Tooltip: month + 4 values.

### 7.5 Top-10 Active Projects (horizontal bar)

- Pulled from `odoo_move_line_analytics` joined with `odoo_analytic_accounts`.
- Sort by absolute period balance desc.
- Click bar → Accounts-Compare mode pre-filtered to that account.

### 7.6 Filter bar applies

All charts respect the global filter (period range, drafts toggle, with/no-dep). When `mode=plans` or `mode=accounts`, the dashboard shows the same charts scoped to the selected dimension.

---

## 8. Data layer

### 8.1 New Supabase migration

`supabase/migrations/0079_fmplus_financials.sql`:

- **No new tables.** Reuses `odoo_companies`, `odoo_accounts`, `odoo_partners`, `odoo_move_lines`, `odoo_analytic_plans`, `odoo_analytic_accounts`, `odoo_move_line_analytics`.
- **New RPC `pnl_aggregated_multiperiod`**: takes a JSONB array of periods + company_ids + optional plan_ids/account_ids/include_drafts. Returns one row per `(period_key, code)` so the renderer pivots N columns from a single round-trip.
- **New RPC `fmplus_active_accounts`**: takes `(plan_id, from, to, company_ids)`. Returns analytic-account ids with non-zero `SUM(ABS(balance))` in the period. Drives the picker auto-prune.

The existing Beithady `pnl_aggregated` RPC is untouched.

### 8.2 Code structure

```
src/lib/fmplus/
  classifier.ts              # classifyByPrefix() — pure deterministic mapping
  financials.ts              # buildFmplusPnl, buildFmplusBalanceSheet,
                             # buildFmplusDashboard, resolvePeriodSeries
  opening-balance.ts         # FMPLUS_OPENING_BALANCES_2026_02 const
                             # OPENING_BALANCE_DATE = '2026-02-28'
  classifier.test.ts         # Vitest — unit tests for every prefix branch
  financials.test.ts         # Vitest — golden tests against the Excel snapshot
src/app/fmplus/
  page.tsx                   # Module landing — cards for each sub-module
  financials/
    page.tsx                 # Server component, 3 tabs, server-rendered tables
    _components/
      FilterBar.tsx          # 'use client' — sticky filter UI
      PnlTable.tsx           # Server — native <details> collapse, no JS hydration
      BalanceSheetTable.tsx  # Server
      Dashboard.tsx          # Server — KPI cards + chart wrappers
      DashboardCharts.tsx    # 'use client' — recharts wrappers
      AccountPicker.tsx      # 'use client' — multi-select with active-only prune
src/app/api/fmplus/
  active-accounts/route.ts   # GET — drives the picker prune (calls
                             # fmplus_active_accounts RPC)
```

### 8.3 Sync change

[src/lib/run-odoo-financial-sync.ts:18](src/lib/run-odoo-financial-sync.ts):
```ts
export const FINANCIALS_COMPANY_IDS = [4, 5, 6, 10, FMPLUS_COMPANY_ID];
```

`FMPLUS_COMPANY_ID` is determined by a one-shot helper:

```ts
async function discoverFmplusCompanyId(): Promise<number> {
  const sb = supabaseAdmin();
  // First try the cached row.
  const { data } = await sb
    .from('odoo_companies')
    .select('id')
    .ilike('name', 'fmplus property%')
    .maybeSingle();
  if (data?.id) return Number(data.id);
  // Cold path — query Odoo directly.
  const rows = await odooSearchRead<OdooCompany>(
    'res.company',
    [['name', 'ilike', 'FMPLUS Property%']],
    { fields: ['name', 'country_id', 'currency_id', 'partner_id'], limit: 1 }
  );
  if (!rows[0]) throw new Error('FMPLUS company not found in Odoo');
  // Persist to odoo_companies for future cold starts.
  // ... upsert ...
  return rows[0].id;
}
```

Cron rides the existing financial-sync schedule. No new cron entry.

### 8.4 Testing strategy

- **Unit (Vitest)**: `classifier.test.ts` covers every code-prefix branch with name fixtures from the Excel export.
- **Integration (Vitest)**: `financials.test.ts` golden tests — the totals computed by `buildFmplusPnl({ asOf: '2026-02-28' })` must match the Excel export's section totals (Revenue 38.5M / Cost of Revenue 33.2M / Gross Profit 5.26M / EBITDA 808k / Net Profit -716k) within 1 EGP tolerance.
- Tests run against a fixture move_lines payload checked into the test directory so they're hermetic.

---

## 9. Brand & styling

- Brand accent: amber (already wired in [src/lib/brand-theme.ts:101](src/lib/brand-theme.ts) as the FMPLUS theme).
- Icons: `Building2` (FMPLUS module landing, already mapped in [src/app/_components/domain-icon.tsx:8](src/app/_components/domain-icon.tsx)).
- Table styling matches Beithady financials (same `ix-card` / `ix-link` / `ix-input` design tokens) so the two pages feel like siblings.
- Section subtotals (Gross Profit, EBITDA, Net Profit) use the same dark-band treatment as the Beithady page.

---

## 10. Risks & open items

| Risk | Mitigation |
|------|-----------|
| FMPLUS company has tens of thousands of move lines — first sync may exceed Vercel's 300s function cap | Existing sync already paginates per company with resume support (`syncOdooMoveLines(companyId, { resume: true })`); FMPLUS rides the same path. Worst case: `?phase=move-lines&company=<id>&resume=1` invoked manually until complete. |
| `pnl_aggregated_multiperiod` RPC not in any migration file (parallels the Beithady situation) | Apply via Supabase dashboard SQL Editor per CLAUDE.md guidance. Inspect the existing `pnl_aggregated` first to mirror its style. Capture the SQL in the migration file even though it gets applied via dashboard. |
| Opening-balance seed drifts from reality if Odoo back-posts to 2025 entries | Seed is a constant; if drift detected (balanced check fails by > 1 EGP), surface ⚠ banner and link to a "re-extract opening balance" runbook. |
| Account code drift — new accounts appearing with prefixes outside the classifier's table | Unclassified panel surfaces them. Designer/operator extends `classifyByPrefix` and ships a small follow-up. |
| Performance — multi-period RPC could be slow for `periods=12` × all accounts | The RPC aggregates server-side and returns at most ~700 rows per call (≈100 accounts × 12 periods reduced). One round-trip per render. Indexed on `(company_id, date)`, GIN on `analytic_distribution`. |
| User mistypes a period in the URL | `resolvePeriodSeries()` validates and falls back to "current period, granularity-default count". |

---

## 11. Implementation sequence (preview — full plan in writing-plans phase)

Rough sketch — the writing-plans skill will turn this into the actual execution plan with TDD checkpoints:

1. Migration `0079_fmplus_financials.sql` (RPCs only, no schema changes).
2. `discoverFmplusCompanyId` + extend `FINANCIALS_COMPANY_IDS`. First sync to land FMPLUS data.
3. `src/lib/fmplus/classifier.ts` + tests.
4. `src/lib/fmplus/opening-balance.ts` (extracted from the Excel).
5. `src/lib/fmplus/financials.ts` (`buildFmplusPnl`, `buildFmplusBalanceSheet`, `buildFmplusDashboard`, `resolvePeriodSeries`) + tests.
6. `/api/fmplus/active-accounts` route handler.
7. `/fmplus` landing page + brand wiring.
8. `/fmplus/financials` page with the 3-tab shell and filter bar.
9. P&L renderer (Period-Trend mode first, then Plans-Compare, then Accounts-Compare).
10. Balance Sheet renderer.
11. Dashboard tab — KPI cards, then donuts, then trend line, then top-10 bar.
12. Excel + PDF export buttons.
13. End-to-end smoke test against real Odoo data; reconcile to the Excel snapshot.

---

## 12. References

- User's Excel export: `C:\kareemhady\.claude\FMPLUS\financial_statements__fm (7).xlsx` (sheets: "Profit and loss_ FMPLUS", "Profit and loss_ FMPLUS (No Dep", "Balance Sheet", "Filters")
- User's analytic-account export: `C:\kareemhady\.claude\FMPLUS\Analytic Account (account.analytic.account).xlsx`
- Reference implementation (Beithady): [src/app/beithady/financials/page.tsx](src/app/beithady/financials/page.tsx)
- Reference data layer (Beithady): [src/lib/financials-pnl.ts](src/lib/financials-pnl.ts)
- Existing Odoo sync: [src/lib/run-odoo-financial-sync.ts](src/lib/run-odoo-financial-sync.ts)
- Existing period helpers (extend, don't duplicate): [src/lib/financials-pnl.ts:1101](src/lib/financials-pnl.ts) `resolveFinancePeriod`
- Brand wiring: [src/lib/brand-theme.ts:101](src/lib/brand-theme.ts) (FMPLUS theme), [src/app/_components/domain-icon.tsx:8](src/app/_components/domain-icon.tsx) (Building2 icon)

---

**End of spec.**
