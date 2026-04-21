# Kareemhady — Session Handoff (2026-04-21)

## ✅ PHASE 7.6.1 — Building dropdown cleaned to the 5 canonical buildings (commit 98f1621)

User direction:
> "Combine all BH-XXX Under BH-OK (One Kattemia) as one analytic account
> BH-73 (29 Units Only) + BH-73-General
> BH-435 (14 Units Only) + BH-435-General
> BH-26 (22 Units Only) + BH-26 General"

Refactored `extractBuildingCode()` in `src/lib/run-odoo-financial-sync.ts`:
- Explicit "OK" / "OKAT" / "One Kattameya" text → BH-OK
- Numeric 26 / 34 / 73 / 435 → keep as their own building
- Any other `BH-<digit>` pattern (BH-101-55, BH-203-86, etc.) → BH-OK (contract Annex D "Separate Units")

Re-ran `?phase=analytic-accounts` to reclassify all 210 analytic accounts.

### Dropdown is now canonical
| Building | Accounts | Distinct names | What they are |
|---|---|---|---|
| BH-26 | 47 | 24 | 22 units + BH-26 GYM + BH-26 GENERAL (Lotus Building, New Cairo) |
| BH-34 | 2 | 1 | BH-34-GENERAL (Annex C, not yet operating) |
| BH-73 | 58 | 30 | 29 units + BH-73 GENERAL |
| BH-435 | 44 | 16 | 14 units + 2 generals (BH-435 General / BH-435-GENERAL — duplicate spelling in Odoo; aggregate together) |
| BH-OK | 20 | 10 | One Kattameya separate-unit codes (BH-101-55, BH-107-46, BH-109-23/43, BH-114-73, BH-115-75, BH-116-36, BH-202-61, BH-203-86, BH-213-82) |

### Feb 2026 revenue by building (sanity check)
BH-26 1,609,665 (45% of 3,572K consolidated) · BH-435 1,061,902 (30%) · BH-OK 429,173 (12%) · BH-73 291,565 (8%) · BH-34 null.
Sums to ~95% of consolidated revenue, which tracks — remaining 5% is un-tagged lines or analytic-distribution misses. Dashboard dropdown now shows exactly 5 buildings.

## ✅ PHASE 7.6 SHIPPED — Analytic plans/accounts/links + BH-building & LOB segregation + cron automation (commits e740ac4 + ce5bd49)

User request: "Cron automation for financial sync phases / plan/account resolution is not built yet".

### Schema additions (migration 0004_odoo_analytic.sql, applied via MCP)
- **`odoo_analytic_plans`** — Odoo 17+ `account.analytic.plan` containers. Synced 52 plans across FINANCIALS_COMPANY_IDS scope.
- **`odoo_analytic_accounts`** — per-building / per-LOB accounts with `plan_id`, `root_plan_id`, derived `building_code`, `lob_label`. Synced 210 accounts.
- **`odoo_move_line_analytics`** — flat projection of `analytic_distribution` jsonb. Splits composite keys (e.g. `{"538,537": 100}` → two rows because Odoo multi-plan-allocates). Synced **69,751 link rows** covering all 69,697 move lines that carry analytics.
- Extended `odoo_sync_runs` with analytic counters.

### Classification derived at sync time (via regex on analytic-account names)
**Buildings detected (13 distinct):**
- **BH-26**: 47 accounts (Lotus, New Cairo)
- **BH-34**: 2 accounts
- **BH-73**: 58 accounts
- **BH-435**: 44 accounts (AbdelHameed Gouda Elsahar St.; A1-owned)
- Plus minor: BH-101, BH-107, BH-109, BH-114, BH-115, BH-116, BH-202, BH-203, BH-213

**LOB detected:**
- **Arbitrage** (Leased model): 16 accounts
- **Management** (BH-435 model): 17 accounts

### Postgres RPC `pnl_aggregated`
Pushes GROUP BY + analytic EXISTS filter + partner exclusion into Postgres — avoids supabase-js URL-length limits when filtering by building/LOB touches 20k+ lines. Signature: `(from date, to date, company_ids bigint[], building_code text default null, lob_label text default null, exclude_partner_ids bigint[] default null)`. Returns per-account totals + line counts.

### Bug found & fixed during rollout
Initial `rebuildAnalyticLinks` used `PAGE = 2000`. Supabase PostgREST caps at `max-rows = 1000` by default, so the first batch returned 1000 rows and the loop interpreted `rows.length < PAGE` as end-of-set — producing only **1,000** link rows. Fixed by setting `PAGE = 1000` to match the cap; full rerun now produces 69,751 links.

### Cron automation (vercel.json)
9 cron entries now scheduled. Daily 04:00-04:30 UTC window:
```
04:00  /api/cron/odoo                               → companies + invoices (~15s)
04:05  /api/cron/odoo-financials?phase=metadata     → accounts + partners
04:10  /api/cron/odoo-financials?phase=move-lines-4 → A1 move lines (resume=true)
04:15  /api/cron/odoo-financials?phase=move-lines-5 → Egypt move lines (resume=true)
04:20  /api/cron/odoo-financials?phase=move-lines-10→ Dubai move lines (resume=true)
04:25  /api/cron/odoo-financials?phase=analytics    → plans + accounts + links
04:30  /api/cron/odoo-financials?phase=finalize     → owner flag
```
Plus existing Gmail crons at 06:00 + 07:00 UTC. All resume-aware + idempotent. Each phase fits in ~30s comfortably within the 300s cap.

### UI updates
- **Segregation panel** between Scope tabs and the P&L: dropdowns for Building (All / each BH-*) + LOB (All / Arbitrage / Management). Submit form preserves scope + period.
- Active filter annotates the P&L subtitle (e.g. `Building: BH-26 · LOB: Arbitrage`).
- Period preset + month-specific links preserve `building` and `lob` query params across navigation.
- Clear-filters link visible when a filter is active.
- Note: Balance Sheet and Payables are NOT filtered by building/LOB (those are balance-sheet concepts that don't segregate cleanly by analytic). UI warns the user of this via an amber note when filter is active.

### Smoke-tested (20 combinations all HTTP 200)
4 scopes × 5 filter states (none, BH-26, BH-435, Arbitrage, Management). Scope-aware Rent Costs routing (from 7.5) still works under analytic filtering.

### Verification via RPC
Feb 2026, BH-26 scope: Revenue From Airbnb 941,788 EGP (44% of the 2,136,790 consolidated) — plausible share for the 22-unit Lotus Building property. Agents Commission Airbnb 177,807 (67% of 265,958 consolidated). Data is internally consistent.

### Known gaps still open
1. **Balance Sheet undercounts pre-2025 history** — our 365d move-line window misses inception-to-April-2025 entries. A1 snapshot still shows Assets 2.17M vs xlsx 9.44M. Not addressed this turn.
2. **Cost of Revenue consolidated -14%** — still open; investigation deferred.
3. **Building-scoped Balance Sheet / Payables** — not implemented; only P&L supports the filter. Would require a per-account-type analytic breakdown which is iffy for accrued liabilities.
4. **Cron first fire** will be next 04:00 UTC (02:00 Cairo) — no results to verify yet. Dashboard's latest-sync metadata will update after that window.

## ✅ PHASE 7.5 SHIPPED — 4 company views + Balance Sheet + A1 in scope (commits c9aa061 + 06ae34c)

User request: "Study All, cover All Gaps and Show Dashboard for Balance Sheet ... also P&L Dashboard important Numbers Mainly for Beithady Consolidated & A1 as Owner ... segregation for BH-26 - BH-73 - BH-435, Arbitrage / Management Line of Business" + four xlsx files (Consolidated, UAE, Egypt, A1) as target layouts.

### New source files read (in `C:\kareemhady\.claude\Documents\`)
- `Beithady Consolidated P&L with Both Egypt & Dubai.xlsx` — YTD Jan+Feb 2026 consolidated P&L (Revenue 9,284,450, Net Profit -5,462,189). Confirms Filters = Egypt + Dubai only.
- `Beithady Dubai & Egypt Balance Sheert FEB-2026.xlsx` — balance sheet as of 28/02/2026 + same YTD P&L + Filters sheet. Assets 75,456,779; Liabilities 85,262,188; Equity -9,805,409.
- `f.s__beithady_hospitality_-(egypt).xlsx` — both P&L (Feb 2026 3.57M) and the same (consolidated) balance sheet duplicated. Treat its P&L as the Egypt single-company view.
- `f.s_beithady_hospitality-(_uae).xlsx` — Beithady Dubai (FZCO) P&L (not fully inspected this turn — truncated by output). Jan-Feb 2026 YTD.
- `f.s__a1_hospitality.xlsx` — A1 standalone. P&L Jan-Feb 2026 YTD (Revenue 1,562,150 all from account 401009 "Revenue From Hospitality"; Net Profit 199,721). Balance Sheet as of 28/02/2026 (Assets 9,444,897; Liab 1,937,812; Equity 7,507,085). Uses a different CoA than Beithady — depreciation is at 606xxx not 607xxx.

### Ships in this phase
- **A1HOSPITALITY (id 4) added to FINANCIALS_COMPANY_IDS**. After deploy, ran phases `accounts` → `partners` → `move-lines&company=4`. A1: 11,874 move lines, adds its full CoA (657 accounts total across all 3 companies), 310 partners total.
- **CompanyScope type** (`consolidated | egypt | dubai | a1 | custom`) with `scopeCompanyIds()` + `scopeLabel()` + `COMPANY_LABELS` lookup. Exported `ALL_FINANCIALS_COMPANY_IDS`.
- **Intercompany elimination is scope-conditional** — active only when scope spans both 5 AND 10. Single-company or A1-only views preserve their raw intercompany entries.
- **Scope-aware P&L classifier**: "Rent Costs" routes to Home Owner Cut for Beithady (the arbitrage-operator view that pays head-lease owners), but to Operating Cost under Cost of Revenue for A1 (where rent is A1's own expense). Checked via `isA1OnlyScope` flag. Explicit lesson: name-based classification must be context-aware when the same account name carries different business meaning across companies.
- **New `buildBalanceSheet(asOf, companyIds)` aggregator** — reads `odoo_move_lines` filtered to posted entries + `<= asOf`, groups by `account_type`:
  - `asset_cash` → Bank and Cash, `asset_receivable` → Receivables, `asset_prepayments` → Prepayments, `asset_current` → Other Current Assets, `asset_fixed` → Fixed Assets, `asset_non_current` → Non-current
  - `liability_payable` → Payables, `liability_current` → Other Current Liab, `liability_non_current` → Non-current Liab
  - `equity` + `equity_unaffected` → Unallocated Earnings / Retained (by name pattern)
  - Sign-flips liabilities + equity so display reads positive (Odoo stores them with credit normal balance = negative in `balance`).
  - Returns a `balanced` flag (Assets ≈ L + E within 1 EGP).
- **UI redesigned** (`src/app/emails/beithady/financials/page.tsx`, ~580 lines):
  - Top company scope tab selector: Consolidated / Egypt / Dubai / A1.
  - Period filter with presets + specific-month picker + custom range; all forms preserve scope across submissions.
  - P&L table (full xlsx hierarchy, Sub-GP / GP / EBITDA / Net Profit subtotals, % of revenue column).
  - Two-column Balance Sheet panel (Assets on left, Liabilities + Equity on right) with nested groups + accounts scrolling inside each sub-section. Headlines Assets / (Liab+Eq) totals + Balanced ✓ indicator.
  - Three Payables cards side-by-side (Vendors / Employee / Owners).
  - Unclassified accounts warning panel still visible when misses exist.

### Verification (all HTTP 200)
- `?scope=consolidated&preset=month:2026-02` ✅
- `?scope=egypt&preset=month:2026-02` ✅
- `?scope=dubai&preset=month:2026-02` ✅
- `?scope=a1&preset=month:2026-02` ✅

**A1 Jan-Feb 2026 P&L vs xlsx**: Revenue / G&A / Depreciation match EXACTLY (1,562,150 / 11,617 / 203,589); Cost of Revenue closed from 47% off to within rounding after the Rent-Costs routing fix.

### Known Phase 7.6 backlog — NOT done this turn
1. **Balance Sheet accuracy**: our `buildBalanceSheet` aggregates from last 365d move lines only, so A1 snapshot shows Assets 2.17M vs xlsx 9.44M — ~7.3M of historical equity/asset entries are pre-April-2025 and outside our sync window. Two fix paths: (a) extend backfill to all-time (maybe 200k+ rows for Egypt — needs further phasing), or (b) add opening-balances sync. Either requires more work; for now the UI should carry a disclaimer.
2. **BH-26 / BH-73 / BH-435 + Arbitrage / Management LOB segregation**: not built. Odoo uses analytic plans; `analytic_distribution` on move lines carries comma-separated IDs like `{"538,537": 100}` where commas = multi-plan allocation. 180 distinct analytic account IDs referenced across the synced lines. Needs: sync `account.analytic.account` (with plan_id), sync `account.analytic.plan` ("Leased" vs "Management"), parse `analytic_distribution` JSON keys (split on comma), join to plan to get LOB, UI filter controls.
3. **Cost of Revenue consolidated gap (14%)**: still open. With the scope-aware Rent Costs routing, consolidated CoR now recategorizes Rent Costs into Home Owner Cut, which tracks the xlsx. Net Profit matches, but exact sub-breakdown (Agents / Direct / Operating) may still be off by the 305K — investigate account-type edge cases in 7.6.
4. **Full balance sheet historical backfill** — see (1).
5. **Dubai (FZCO) single-company P&L not yet cross-verified** against its xlsx (file was truncated in this turn's read).
6. **Cron orchestration for financial sync** — still manual phase-through; add 04:30 UTC cron that runs accounts → partners → move-lines per company → finalize in sequence.

## ✅ PHASE 7.2 + 7.3 SHIPPED — Beithady Financials rule live at /emails/beithady/financials

Multi-commit push (1d40a47 + 6aebff5 + 201222c + 30aec77 + ab3f1fc + c676e76). Final deploy `kareemhady.vercel.app`. Page renders HTTP 200 in ~5.7s.

### Architecture delivered
- **Schema (migration 0003 + ad-hoc partner_id alter)**: `odoo_accounts` (439 rows), `odoo_partners` (277 rows, 19 flagged is_owner), `odoo_move_lines` (Egypt 55,100 + Dubai 11,486 = 66,586 rows), extended `odoo_sync_runs` with accounts/partners/move_lines counters, `odoo_companies.partner_id` for intercompany elimination.
- **Phased financial sync** (`/api/odoo/sync-financials?phase=<X>`) — Vercel's 300s cap forced a split. Phases: `accounts` → `partners` → `move-lines&company=5` → `move-lines&company=10` → `finalize`. `move-lines` supports `?resume=1` starting from max(id) for when a single company exceeds one function window.
- **Date cap discovered**: Odoo pre-generates 12-year future depreciation schedules (BH-26 through 2038). Raw Egypt returned 193k lines; after `date <= today` cap, dropped to 55k. Cleaned up 160k future rows via one-off DELETE.
- **P&L aggregator (`src/lib/financials-pnl.ts`)**: `account_type`-driven grouping (not code-prefix) because the tenant's CoA diverges across companies — same code (`500103`) means 'Home Owner Cut' in one and 'AGENTS COMMISION Hopper' in another. Sub-buckets by name keywords (agents/operating/direct for expense_direct_cost; back_office/office/transport/legal_fin/marketing/other for expense). Home Owner Cut + Rent Costs pulled out as dedicated section by name pattern. Interest lines routed to INT-TAX-DEP by name. Depreciation = all expense_depreciation. Income sections sign-flip for display.
- **Intercompany elimination**: `getIntercompanyPartnerIds()` matches partner names against `%beithady hospitality%` (catches auto-linked company partners AND custom intercompany booking partners like "053. BeitHady Hospitality- UAE" and "Beithady Hospitality - Egypt", id 27005/27007/12). "Beit Hady Website" does NOT match because it lacks 'hospitality' in name. Applied to both P&L and Payables reports.
- **Page (`src/app/emails/beithady/financials/page.tsx`)**: standalone route at `/emails/beithady/financials` (Next.js static segment takes precedence over `[ruleId]` dynamic). Period presets: this_month / last_month / this_quarter / last_quarter / this_year / last_year + specific-month dropdown (last 12 months) + custom date range. Full P&L table with Sub-GP, GP, EBITDA, Net Profit subtotals + % of revenue column + sign-colored cells. Three payables cards side-by-side. Unclassified-accounts warning panel.
- **Domain page**: `src/app/emails/[domain]/page.tsx` adds a "Financials" entry card under Beithady rules list.
- **`.gitignore`**: excluded `.claude/Documents/` (contract with bank details + Feb 2026 P&L xlsx are confidential).

### Verification vs Feb 2026 xlsx
| Line | xlsx | Ours | Diff |
|---|---|---|---|
| Revenue | 3,572,265 | 3,574,175 | +0.05% ✅ |
| Home Owner Cut | 1,755,816 | 1,755,817 | ~exact ✅ |
| Depreciation | 740,370 | 740,127 | -0.03% ✅ |
| Interest | 1,468,342 | 1,468,342 | exact ✅ |
| G&A (ex-interest) | 1,617,669 | 1,619,290 | +0.10% ✅ |
| Cost of Revenue | 2,153,928 | 1,848,758 | -14% ⚠️ |

Cost of Revenue is the one line where we're off by ~305k. Likely explanation: Odoo's draft-vs-posted state handling differs from the xlsx report's treatment, or some accounts used at the margin are typed as `expense` rather than `expense_direct_cost`. Known example: `502105 water, and gas` (account_type = 'expense'). Candidate for Phase 7.4 polish.

### Known owner-partner flag
19 partners currently flagged as `is_owner = true` (post-sync from move lines hitting accounts named "Home Owner Cut" / "Rent Costs"). Visible in the Owners Payables card.

### Cron
`vercel.json` still only crons `/api/cron/odoo` at 04:00 UTC — that runs `runOdooSync` (companies + invoices only). The financial sync (`/api/odoo/sync-financials`) must be triggered manually or via a future cron orchestrator. For now, user needs to manually phase through after any Odoo data change. Candidate for cron automation in Phase 7.4 (serialized phase-by-phase cron runs).

### Key technical lessons (for memory)
1. **Vercel Pro hard cap is 300s** — combined sync for this tenant hits that. Always design sync endpoints to fit single-invocation budgets.
2. **Odoo auto-generates future depreciation** — always cap `date <= today` on line syncs.
3. **CoA codes aren't stable across companies** in multi-company Odoo tenants with diverged histories — `account_type` is the reliable classifier.
4. **Intercompany eliminations need explicit logic** — even when the user says "it's already eliminated", that refers to the SOURCE xlsx, not raw Odoo data.
5. **Supabase `!inner` joins with paginated select** — supabase-js default limit 1000, need explicit `.range()` pagination loops for > 1000 rows.

### Where next
Dashboard is live and functional. User can start USING it for real finance reporting. Phase 7.4 backlog:
- Close the 14% Cost of Revenue gap (account_type investigation + draft-entry treatment)
- Cron-orchestrated financial sync (currently manual phase-through)
- Per-building P&L via `analytic_distribution` cross-company join (BH-435 3-company view)
- Balance sheet rule (Receivables, Payables totals, Fixed Assets)
- A1HOSPITALITY owner-side view for BH-435
- Currency conversion display toggle (EGP / USD / AED)

## 🟡 PHASE 7.2 + 7.3 PLANNING — Beithady Financials rule (awaiting user answers on 5 decisions)

### User direction
> "Dashboard surface: render Odoo data in / or a new /finance route. Vendors Payables / Employee Payables / Owners Payables. There is the Beithady Consolidated Company P&L for FEB 2026, use the Structure to Build the New Rule Under Beithady Domain - Beithady Financials with Period Filters"

Plus business context (critical, save in memory):
- **Beithady FZco owns 100% of Beithady Egypt LLC**. Intercompany Master Services & Master Lease Agreement signed 29 Oct 2025.
- **Operating model**: FZCO (Dubai) = brand/pricing/distribution hub + guest revenue collector. Egypt = on-ground turnkey ops. Egypt invoices FZCO one monthly lump-sum Turnkey Fee per building. 10% auto-escalation per year. Back-to-back with head-lease.
- **BH-26, BH-73, BH-34, BH-OKAT** are **Leased (arbitrage)** — Beithady leases + furnishes + short-term rents. Full operational P&L.
- **BH-435** is **Management** — A1HOSPITALITY (Lime 50%) owns the building, Beithady FZCO manages for **25% of top-line revenue including all utilities**.
- **Odoo Analytic Plans** split this: "Leased" plan (BH-26/73/34/OKAT) and "Management" plan (BH-435). Per-building slicing requires joining through `account.move.line.analytic_distribution`.

### Documents read this turn (in `C:\kareemhady\.claude\Documents\`)
- `Beithady Consolidated P&L.xlsx` — source-of-truth P&L format. 3 sheets: Consolidated P&L (109 rows), %-breakdown, Balance Sheet (28/02/2026), Filters. Feb 2026 totals: Revenue 3.57M EGP, Cost of Rev 2.15M, Sub GP 1.42M, Home Owner Cut 1.76M, GP -337K, G&A 1.62M, EBITDA -1.96M, INT-TAX-DEP 2.21M, Net Profit -4.16M. Balance Sheet: Assets 75.5M, Liabilities 85.3M (Payables 11.89M), Equity -9.8M. **Filters confirmed: Companies = FZCO + Egypt only (NOT A1HOSPITALITY); Options = "With Draft Entries".**
- `Intercompany Master Services & Master Lease Agreement ... (oct 29, 2025).docx` — 20-clause agreement. Key clauses: §5 commercial (monthly lump-sum invoicing by 5th, 15-day payment, 10% annual escalation), §6 term structure (back-to-back with head-lease), §15 IP (brand vests solely in FZCO), Annexes A-E per building. **Annexes: BH-26 Lotus Building New Cairo (USD 21k/month, 12-yr term starting 1 Jun 2026), BH-73, BH-34, BH-OKAT (One Kattameya), BH-435.** BH-435 is in this file but terms locked — details come from the 25% management fee context user provided separately.

### P&L grouping derived from account codes
Standard Egyptian accounting prefix pattern (works because Odoo CoA uses 6-digit codes):
- 400xxx = Activity revenues | 401xxx = Other revenues
- 500xxx = Agents Cost | 501xxx = Direct cost for reservations | 502xxx = Operating Cost
- 504xxx = Home Owner Cut (+ Rent 504100)
- 600xxx = Back Office Salaries & Benefits | 601xxx = Office/Stores Rent & Utilities | 602xxx = Transportation | 603xxx = Legal & Financial | 604xxx = Marketing | 605xxx = Other Expenses
- 606xxx = Interest | 607xxx = Depreciation

Memory file recommended for writing before coding: `account_code_prefix_mapping.md` so Phase 7.3 can reference it.

### Data gap to solve (Phase 7.2)
Supabase has **invoice headers only** (`odoo_invoices`: amount_total, move_type, state). Feb 2026 P&L needs **per-account breakdown** → required:
- `account.account` (chart of accounts: code, name, account_type) — NEW table `odoo_accounts`
- `account.move.line` (per-line detail: `account_id`, `partner_id`, `debit`, `credit`, `balance`, `amount_residual`, `analytic_distribution` jsonb, `parent_state`, `date`) — NEW table `odoo_move_lines`
- `res.partner` (vendors/employees/owners with rank fields + category tags) — NEW table `odoo_partners`
- **Sync must include drafts** (xlsx says "With Draft Entries") — our 7.1 sync filters to `posted`. For move lines we'll include `parent_state IN (draft, posted)`.
- Expected volume: 365d × (5+10 companies) × posted+draft ≈ **20-30k move lines**.

### Rules architecture understood
- `src/lib/rules/aggregators/beithady-*.ts` — each rule is a ~600-line aggregator producing a typed aggregate object
- `src/lib/rules/presets.ts` — domain definitions (`beithady` already exists, rose accent, Home icon) + `RangePreset` (today/last24h/last7d/mtd/ytd/custom)
- Route: `/emails/[domain]/[ruleId]` — so Beithady Financials = `/emails/beithady/financials`
- Need to extend `RangePreset` with `this_month`, `last_month`, `this_quarter`, `last_quarter` for finance periods

### 5 questions sent to user (awaiting answers)
1. **Intercompany eliminations** — Egypt → FZCO Turnkey Fees would double-count if we raw-sum. Does the Feb 2026 xlsx eliminate these, or is it a raw sum?
2. **Currency** — 3.57M EGP shown, but many txns USD/AED. Is this Odoo's line-level `balance` (always company-currency) or externally converted?
3. **Employee/Owner classification** — is there `hr.employee → res.partner` linkage or a tag/category we can rely on for the payables split?
4. **Scope A1HOSPITALITY** — drop from consolidated P&L (per the Filters sheet), keep for per-building BH-435 owner analysis in a later rule?
5. **Build order** — (a) 7.2 alone first (verify data matches xlsx totals), then 7.3 UI; **recommended**. (b) 7.2 + 7.3 combined.

### Proposed Phase 7.2 schema
- `odoo_accounts`: id bigint pk, code text, name text, account_type text, company_ids bigint[]
- `odoo_move_lines`: id bigint pk, move_id bigint fk → odoo_invoices, company_id fk, account_id fk → odoo_accounts, partner_id bigint, date, debit/credit/balance/amount_residual numeric, currency, analytic_distribution jsonb, parent_state text, reconciled bool
- `odoo_partners`: id bigint pk, name, email, phone, supplier_rank, customer_rank, is_employee bool, is_owner bool, active bool, category_ids bigint[]

### Proposed Phase 7.3 deliverables
- `src/lib/rules/aggregators/beithady-financials.ts` — aggregator with P&L tree matching Feb 2026 hierarchy + payables split
- `src/app/emails/beithady/financials/page.tsx` — UI with period filter, P&L hierarchy render, payables panel
- Register in `presets.ts` + `engine.ts`

### Status
Nothing coded this turn. 1,400 lines of docx + 109 xlsx rows digested. Memory file candidates noted. **Waiting on user answers to Q1-Q5 before writing schema or code.**

## ✅ PHASE 7.1 SHIPPED — Odoo backfill sync live, 3,675 invoices synced to Supabase (commit 4744a74, deployed)

User picked option (a): ship now with `[4, 5, 10]` scope + post-migration analytic-account probe deferred to 7.2.

### What shipped (5 files, one commit)
- **`supabase/migrations/0002_odoo.sql`** — applied directly via Supabase MCP `apply_migration` (named `phase_7_1_odoo_invoices_and_companies`). Creates:
  - `odoo_sync_runs` — run log with `companies_synced`, `invoices_synced`, `status`, `error`
  - `odoo_companies` — `id` (bigint PK = Odoo res.company.id), `name`, `country`, `currency`, `in_scope` bool, `last_synced_at`
  - `odoo_invoices` — `id` (bigint PK = Odoo account.move.id), `name`, `move_type`, `state`, `company_id` FK, `partner_id` + denormalized `partner_name`, `invoice_date`, `amount_total`, `currency`, `odoo_created_at`, `odoo_updated_at`, `synced_at`
  - Indexes on `company_id`, `invoice_date` desc, `partner_id`, `move_type`, and `odoo_sync_runs.started_at` desc
- **`src/lib/run-odoo-sync.ts`** — mirrors `run-daily.ts` pattern. Iterates `SCOPE_COMPANY_IDS = [4, 5, 10]`. For each: upserts the company row, then paginates `account.move` at PAGE_SIZE=200 filtered by `move_type IN (out_invoice, in_invoice, out_refund, in_refund)`, `state='posted'`, `invoice_date >= today - 365d`, `company_id=X`. Passes `context: { allowed_company_ids: [X] }` per call. Upserts on `id`. Writes a single `odoo_sync_runs` row spanning the whole run.
- **`src/app/api/odoo/run-now/route.ts`** — CRON_SECRET-protected manual trigger. Accepts both GET + POST (GET for easy curling). `maxDuration: 300`.
- **`src/app/api/cron/odoo/route.ts`** — daily cron handler, no Cairo-time gate (unlike Gmail's 9AM gate) — whenever Vercel fires it, sync runs.
- **`vercel.json`** — added `{ "path": "/api/cron/odoo", "schedule": "0 4 * * *" }` (04:00 UTC, staggered ahead of the 06:00/07:00 Gmail crons).

### First sync results (trigger: manual, run_id `49751772-023e-43db-b9c4-bdf1660f992a`, 14.4s)
| Company | ID | Invoices | Customer | Vendor | Refunds | Currencies | Date range |
|---|---|---|---|---|---|---|---|
| A1HOSPITALITY | 4 | 131 | 100 | 31 | 0 | 2 | 2025-04-21 → 2026-04-01 |
| Beithady Egypt | 5 | 2,216 | 1,207 | 1,008 | 1 | 3 | 2025-04-21 → 2026-04-15 |
| Beithady Dubai | 10 | 1,328 | 1,254 | 74 | 0 | 3 | 2025-11-01 → 2026-04-21 |

Verified via MCP `execute_sql` aggregation. Numbers align with `?explore=1` probe expectations:
- A1HOSPITALITY: probe showed 191 all-time → 131 within 365d window (60 older); ratio is plausible.
- Beithady Egypt: probe 2,266 all-time → 2,216 within window + 1 refund ≈ probe (close match).
- Beithady Dubai: probe 1,328 all-time → 1,328 within window (100% — company is < 365d old).

### Observations for future phases
- **Beithady Dubai is customer-heavy** (94% customer invoices, only 74 vendor bills) — operational costs likely routed through Egypt's books. Cross-company join essential for true Dubai P&L.
- **Currency mix confirmed**: USD + EGP + AED across the three companies. `amount_total` is in transaction currency (per `currency_id` tuple); for revenue aggregates we'll need an FX table or exchange rates.
- **Company currencies all stored as "EGP"** in `res.company.currency_id` — this is the base reporting currency, NOT the transaction currency.
- **No FK on `partner_id`** intentionally — partners table deferred to 7.2. Denormalized `partner_name` keeps dashboards cheap for v1.

### Existing Supabase schema surprise
`public.rule_runs` (43 rows) and `public.app_users` (1 row) exist but aren't in `0001_init.sql` — prior session(s) added them directly via the Supabase SQL editor or an un-checked-in migration. Not related to Odoo; noted for awareness.

### What's open (user's call)
- **Phase 7.2**: analytic-account-to-invoice mapping via `account.move.line.analytic_distribution` → unlocks per-building P&L (BH-435 cross-company join across companies 4, 5, 10)
- **Phase 7.3**: partners sync (`res.partner` with supplier_rank/customer_rank), adds vendor/cleaner directory
- **Dashboard surface**: render Odoo data in `src/app/page.tsx` or new `/finance` route
- **Pivot to next platform**: PriceLabs (easier, pairs with Guesty) or Green-API WhatsApp (messaging layer)

## 🟡 PHASE 7.1 SCOPE — A1HOSPITALITY added for owner-side P&L of BH-435 (awaiting portfolio mapping)

### User direction
> "Get the A1 Hospitality owns Building BH-435, Lime owns 50% of the Company, Beithady is doing the Property Management for it"

Reveals a non-trivial ownership/management split that changes the scope:
- **Building BH-435** is owned by **A1HOSPITALITY** (Odoo company id=4).
- **Lime Commercial Investment** (id=3) owns **50%** of A1HOSPITALITY.
- **Beithady Hospitality - (EGYPT)** (id=5) performs the Property Management, earning PM fees in its own books.

### Scope decision
Updated Phase 7.1 scope to **`company_id IN (4, 5, 10)`**:
- **id=4 A1HOSPITALITY** (191 posted invoices) — owner-side P&L for BH-435 (depreciation, capex, owner draws, Lime 50% distributions)
- **id=5 Beithady Hospitality Egypt** (2,266 invoices) — PM-side revenue + Egypt unit operations
- **id=10 Beithady Hospitality FZCO Dubai** (1,328 invoices) — Dubai unit operations

**Total: ~3,785 posted invoices in scope.** Lime (id=3) NOT in scope — mentioned only for ownership context; add later if Lime's 50%-share distribution view is wanted.

### Why this scope shape matters for schema
- **Per-building P&L is multi-company by definition**: BH-435 has owner-side entries in A1HOSPITALITY's books + PM-side entries in Beithady Egypt's books. A naive `SELECT * FROM odoo_invoices WHERE building='BH-435'` would show only half the picture without a cross-company analytic-account join.
- **Dashboard must expose a Building dimension** that aggregates across companies via analytic account — don't treat Beithady Egypt's books as the full story for BH-435.
- **Unknown — likely more of these splits**: any other Beithady-managed buildings owned by FMPLUS Property, Lime Commercial, or a non-scoped entity? Need to map before we're confident Phase 7.1's scope is complete.

### Memory saved
Wrote `C:\Users\karee\.claude\projects\C--kareemhady\memory\beithady_ownership_structure.md` + MEMORY.md pointer so future sessions understand the PM-vs-owner split.

### Open question sent to user
Two options offered:
- **(a)** Ship Phase 7.1 now with `[4, 5, 10]` + post-migration probe to list all `BH-*` analytic accounts by company → surface any other owner companies needing inclusion (backfill-friendly path).
- **(b)** User maps out the full ownership table (which Odoo company owns which BH-* building) first, then we ship with a complete scope from day one.

### Status
**Awaiting user pick.** No code written this turn. Still have `src/lib/odoo.ts` + `/api/odoo/ping` (with `?explore=1`) shipped and working.

## 🟢 PHASE 7.1 EXPLORE PROBE COMPLETE — Beithady company IDs + volumes confirmed (commits 765524e, d8ecd30)

User said "go ahead" → shipped `?explore=1` mode on `/api/odoo/ping`. Took two iterations:

### Round 1 (commit 765524e) — blocked
Passed `allowed_company_ids: [all 11 company ids]` to the context for each per-company count call. Every call errored:
```
odoo_rpc_error: object.execute_kw — Access to unauthorized or invalid companies.
```
Cause: Odoo 16+ validates every id in `allowed_company_ids` against the API user's `res.users.company_ids` set. The fmplus tenant has one company the user can't see: **MASK for development, investment and trading (id=11)**. One bad id poisoned every call.

### Round 2 (commit d8ecd30) — clean
Changed per-company calls to pass `allowed_company_ids: [c.id]` (single-element). Now each call is isolated — 10 companies succeed, MASK's call errors only itself.

### Full company + volume table
| Company | ID | Posted invoices | Journals |
|---|---|---|---|
| FMPLUS Property & Facility Management | 1 | 6,752 | 86 |
| VOLTAUTO | 2 | 878 | 18 |
| Lime Commercial Investment | 3 | 202 | 14 |
| **A1HOSPITALITY** | **4** | **191** | **22** |
| **Beithady Hospitality - (EGYPT)** | **5** | **2,266** | **25** |
| X Label for Tailoring Kika | 6 | 939 | 29 |
| Lime For Restaurants | 7 | 72 | 11 |
| 202993 security creation new company | 9 | 0 | 0 |
| **Beithady Hospitality FZCO - (Dubai)** | **10** | **1,328** | **24** |
| MASK for development, investment and trading | 11 | — (access denied) | — |
| The Bees Art Direction for Managing Websites | 15 | 0 | 7 |

- Tenant total: 12,626 posted invoices across 11 companies (10 API-accessible).
- **Beithady scope `[5, 10]`**: **3,594 posted invoices** (28% of tenant) — sync volume is manageable.
- Note: **company currencies all listed as EGP** in `res.company.currency_id` — but individual transactions carry their own currency (we saw USD in first ping for "Direct Reservations"), so row-level currency must be preserved.
- A1HOSPITALITY (id=4, 191 invoices) is another hospitality company in the tenant — possibly legacy/sub-brand/pre-Beithady. **Unsure if in scope.**

### Waiting on user answer
One question sent: should Phase 7.1 scope be just Beithady `[5, 10]` or `[4, 5, 10]` (include A1HOSPITALITY)? Once answered, I ship migration `0009_odoo.sql` + sync worker + `/api/odoo/run-now` + cron `/api/cron/odoo` (04:00 UTC) in one commit.

### Library changes shipped this turn (commit 765524e)
- `src/lib/odoo.ts`: `odooSearchRead` and `odooSearchCount` now accept an optional `context` kwarg. New `OdooCompany` type (`id`, `name`, `country_id` tuple, `currency_id` tuple, `partner_id` tuple).
- `src/app/api/odoo/ping/route.ts`: `?explore=1` branch returns `{ ok, mode: 'explore', company_count, companies: [...] }`. `maxDuration` bumped to 60s since 11 companies × 2 count calls runs ~15s total.

## 🔄 PHASE 7.1 PLAN REVISED — Scope filter pivots from analytic-accounts to `company_id` (awaiting explore-patch go-ahead)

User dropped the Odoo company-switcher screenshot — fmplus tenant is **multi-company**, which is much cleaner than analytic-account prefix scoping. Company list:

- VOLTAUTO (currently selected in user's session)
- Lime Commercial Investment
- A1HOSPITALITY
- **Beithady Hospitality - (EGYPT)** ← include in scope
- **Beithady Hospitality FZCO - (Dubai)** ← include in scope
- X Label for Tailoring Kika
- Lime For Restaurants
- 202993 - fm security creation new co... (truncated)
- FMPLUS Property & Facility Managem... (truncated)
- The Bees Art Direction for Managing ... (truncated)

User confirmed: **"Chart of accounts is divided by company"** → clean multi-company separation exists natively in this Odoo tenant.

### Why company_id > analytic account prefix
- **Complete** — captures invoices/bills/partners/journals/payments that belong to Beithady, not just records that happen to be tagged with a `BH-*` analytic account
- **Explicit** — Odoo's native multi-tenant mechanism (`allowed_company_ids` context)
- **Handles Egypt/Dubai split** — two companies, clean EGP vs USD/AED currency zones, dashboard can split or unify
- **Future-proof** — resilient to analytic account renames

### Revised plan
1. **Ship `?explore=1` patch to `/api/odoo/ping`** — returns all `res.company` rows (id, name, country_id tuple, currency_id tuple) + per-company posted-invoice counts. ~5 min of work. Confirms the two Beithady company IDs + shows real sync volume (vs the full 12,626).
2. **Migration `0009_odoo.sql`** — `odoo_companies`, `odoo_analytic_accounts`, `odoo_invoices` tables all carry `company_id` + `company_name`. Unique `(odoo_id)`. Defer partners + payments to 7.2.
3. **`src/lib/odoo.ts` refactor** — extend `odooSearchRead` to accept an optional `context` param so callers can pass `{ allowed_company_ids: [bh_egypt, bh_dubai] }`. Required for correct multi-company scoping.
4. **`src/lib/run-odoo-sync.ts`** — mirrors `run-daily.ts`. Context-scoped to Beithady companies. Pulls posted invoices last 365 days + all analytic accounts. Upserts.
5. **`/api/odoo/run-now`** + **cron `/api/cron/odoo`** (04:00 UTC, stagger from Gmail 06/07:00).

### Status
**Awaiting user go-ahead to ship the `?explore=1` patch.** Once we have the two company IDs, migration + sync worker lands in one shot. No code committed this turn.

## 🟡 PHASE 7.1 PLANNING — Proposed scope + migration plan, awaiting user go/no-go

User said "ready for 7.1". Before writing the migration, I sent a plan + one decision to confirm.

### Proposed scope filter
**Scope Beithady-only data by analytic account name `LIKE 'BH-%'`.** Rationale: fmplus Odoo hosts 4+ unrelated businesses; analytic accounts are the only clean per-property discriminator we've seen. Alternatives considered: per-company `res.company_id` (need to probe if multi-company is on), per-journal filter (need to see journal names). Picked analytic accounts because we already confirmed `BH-Laila Elwy` exists.

### Proposed Phase 7.1 sequence (mirrors Guesty cadence)
1. **Exploration ping first** — extend `/api/odoo/ping` with `?explore=1` mode returning: count + names of all `BH-*` analytic accounts, `res.company` list, journals with "BH"/"beithady" in name. Confirms scope filter before committing schema.
2. **Migration `0009_odoo.sql`** — tables `odoo_analytic_accounts`, `odoo_invoices` (FK to analytic account, preserve original currency), `odoo_sync_runs`. Unique `(odoo_id)` keys. Defer partners + payments to 7.2.
3. **`src/lib/run-odoo-sync.ts`** — mirrors `run-daily.ts` pattern. Pulls `BH-*` analytic accounts + their posted invoices (last 365 days default). Upserts.
4. **`/api/odoo/run-now`** — manual trigger route.
5. **Cron** — add 04:00 UTC entry to `vercel.json` → new `/api/cron/odoo` handler (stagger from Gmail 06:00/07:00 UTC).

### Open decisions offered to user
- Scope filter (analytic account prefix) — default pick, user can override
- Exploration-first step yes/no
- Backfill window (365d default)
- Defer partners + payments to 7.2 yes/no

### Status
**Waiting on user confirmation** before any code writes. Nothing committed this turn.

## ✅ PHASE 7.0.3 — Odoo connection verified end-to-end (no code changes)

User regenerated API key + updated `ODOO_API_KEY` in Vercel. Redeploy to `kareemhady-7m4fvqp4l-lime-investments.vercel.app` + ping returned HTTP 200.

### Ping response (4.4s round-trip)
- **Server**: Odoo `18.0+e` — **Enterprise edition** (not Community/Online free tier; confirms paid license)
- **Invoices**: `posted_total: 12626` posted customer/vendor invoices (heavy volume — Odoo is source of truth for accounting)
- **Sample invoices**:
  - `BILL/2026/05/0001` — 15,000 EGP vendor bill to "#004 Abanoub Rent" (future-dated 2026-05-01)
  - `INV/2026/00027` — 7,627,176.50 EGP customer invoice to T&D (large construction-scale line)
  - `INV/4712` — 4,617 EGP to "العاصمه الاداريه للتنميه العمرانيه" (New Administrative Capital / Urban Development)
  - `INV/2026/00776` — 40 USD to "Direct Reservations" — **hospitality revenue, USD currency** (Beithady-relevant)
- **Partners**: Arabic-named suppliers (اوميجا للهندسه، سعودي للمقاولات، etc.) — construction/trade/clothing vendors, not hospitality
- **Analytic accounts**: `BH-Laila Elwy` (×2, different balances — likely per-year or per-company variant), `Mall of Mansoura`, VIN-style codes like `HJ4ABBHK2TN111058`

### 🚨 Critical discovery — fmplus is a multi-business Odoo tenant
fmplus.odoo.com hosts **multiple unrelated businesses** in one Odoo instance:
- **Beithady** (hospitality, `BH-*` analytic accounts)
- **Construction** (مقاولات suppliers, T&D customer)
- **Mall of Mansoura** (commercial property)
- **Autos/vehicles** (VIN-style codes `HJ4ABBHK*`)

Implication for Phase 7.1+: we **cannot** blindly import all 12,626 invoices — kareemhady app is Beithady-scoped. Need to filter by either:
1. Analytic account name `LIKE 'BH-%'`
2. Per-company `res.company_id` filter (need to confirm fmplus uses multi-company with a dedicated Beithady company)
3. Journal (`account.journal`) filter if they've separated journals per business

### Schema planning for Phase 7.1
- **Listing → analytic_account join is non-trivial**: Guesty listing nicknames are unit-level (`BH73-ST-C-004`), but Odoo analytic accounts are building-level (`BH-Laila Elwy`). Need a `building_name` column or mapping table. Probably: extract building name from Guesty `listing.address.street` or a `customField`, then fuzzy-match to `BH-<name>`.
- **Currency**: preserve original on every row (EGP + USD coexist) — do NOT normalize.
- **Duplicate analytic accounts**: two `BH-Laila Elwy` exist — check for year/company discriminator when querying.

### Memory saved
Wrote project memory at `C:\Users\karee\.claude\projects\C--kareemhady\memory\fmplus_odoo_tenant.md` + MEMORY.md index entry so future sessions pick up the multi-business context without re-probing.

### Phase 7 scaffold: COMPLETE
- `src/lib/odoo.ts` + `src/app/api/odoo/ping/route.ts` live and working.
- Credentials all resolved: `ODOO_URL=https://fmplus.odoo.com`, `ODOO_DB=fmplus-live-17577886`, `ODOO_USER=kareem@fmplusme.com`, `ODOO_API_KEY=<regenerated-persistent-key>`.

### Next step
Phase 7.1 — Supabase migration `0009_odoo.sql` (tables: `odoo_invoices`, `odoo_partners`, `odoo_analytic_accounts`, `odoo_sync_runs`) + scoping filter for Beithady-only, then a `odoo_invoice_sync` rule (cron + on-demand like the Guesty one). OR — user may want to kick off next platform (PriceLabs or Green-API) instead of going deep on Odoo rules. Ask first.

## ⚠️ PHASE 7.0.2 — Auth still failing after DB fix: API key regeneration needed

After user updated `ODOO_DB=fmplus-live-17577886` and redeployed, the Postgres-level error went away but auth now returns:
```
odoo_auth_failed: authenticate returned false — check ODOO_USER and ODOO_API_KEY
```

User sent screenshot of Odoo → Change My Preferences dialog confirming:
- Display name: "Kareem Hady"
- Email / login: **`kareem@fmplusme.com`** ✅ (matches `ODOO_USER` already set)
- Timezone: Africa/Cairo (consistent with our Cairo tz rendering convention)

Since `ODOO_USER` is confirmed correct, the `authenticate → false` response points to the API key value. Most likely copy error (whitespace / newline / truncation — Odoo shows the key once and it's long).

### Instructed user to regenerate
1. In the preferences dialog, click **Account Security** tab.
2. Delete the existing API key (trash icon).
3. **New API Key** → name `kareemhady-vercel` → duration **Persistent key** → confirm password.
4. Copy the key from the green one-time-display box, no leading/trailing whitespace.
5. Update `ODOO_API_KEY` in Vercel (Prod + Preview + Dev) + `.env.local`.

Waiting on user "done" → I redeploy + retest.

## ⚠️ PHASE 7.0.1 — DB name correction: NOT `fmplus`, actually `fmplus-live-17577886`

First ping attempt returned `odoo_rpc_error: common.authenticate — ... FATAL: database "fmplus" does not exist`. My subdomain-matches-DB-name assumption was wrong for this tenant — it's hosted on odoo.sh infra, so the DB name follows `{tenant}-{env}-{id}` pattern.

Found the real name by hitting the unauth'd endpoint:
```
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"call","params":{},"id":1}' \
  https://fmplus.odoo.com/web/database/list
# → {"result":["fmplus-live-17577886"]}
```

User needs to update `ODOO_DB` in Vercel (Prod + Preview + Dev) + `.env.local` to `fmplus-live-17577886`, then I redeploy + retest.

**Lesson for future Odoo Online tenants**: don't infer DB name from subdomain — always probe `/web/database/list`. Free Odoo Online may match subdomain; paid/odoo.sh adds the `-live-{id}` suffix.

## ✅ PHASE 7 SCAFFOLD — Odoo 18 JSON-RPC client + smoke-test endpoint (commit 2691f4a, deployed)

### Credentials gathered
- `ODOO_URL=https://fmplus.odoo.com` (user pasted `.../odoo` — code strips the `/odoo` web-client suffix automatically in `getCreds()`)
- `ODOO_DB=fmplus` (inferred from subdomain; Odoo Online always matches)
- `ODOO_USER=kareem@fmplusme.com`
- `ODOO_API_KEY=<user has it, not yet in Vercel>`

User reported Bad Request on `/web/session/get_session_info` — that's a JSON-RPC endpoint wanting POST, harmless. DB name confirmed via subdomain convention.

### What shipped
Zero-dep scaffold mirroring the Guesty pattern (pure fetch, no `odoo-await` — kept deps minimal).

#### `src/lib/odoo.ts` (new, ~180 lines)
- **JSON-RPC over HTTPS** to `{ODOO_URL}/jsonrpc`. Two services used: `common` (for auth + version probe) and `object` (for `execute_kw` against models).
- **Auth flow**: `authenticate(db, user, api_key, {})` → returns `uid` (int). Cached per cold start, invalidated if `user:key` changes. API key is sent on every `execute_kw` call as the password field.
- **URL normalization** — `getCreds()` strips trailing `/odoo` path + trailing slashes, so user can paste the web-client URL.
- Exported helpers:
  - `odooExecute<T>(model, method, args, kwargs)` — low-level escape hatch for any model method
  - `odooSearchRead<T>(model, domain, { fields, limit, offset, order })` — workhorse for reading records (combines search + read in one RPC)
  - `odooSearchCount(model, domain)` — for ping totals
  - `odooVersion()` — unauthenticated server probe (calls `common.version`)
- Typed shapes: `OdooInvoice` (`account.move` with `move_type`, `state`, `partner_id` tuple, `amount_total_signed`, `currency_id`), `OdooPartner`, `OdooAnalyticAccount`.
- Error handling: JSON-RPC errors distinguished from HTTP errors; `odoo_http_{status}`, `odoo_rpc_error`, `odoo_auth_failed` prefixes for grep-friendly logs.

#### `src/app/api/odoo/ping/route.ts` (new)
- `GET /api/odoo/ping` protected by `CRON_SECRET` bearer (same pattern as `/api/guesty/ping` and `/api/cron/daily`).
- Missing-env check returns 400 with a per-var boolean map so user can see which one isn't set.
- Four reads in parallel:
  - `odooVersion()` → server version string
  - `odooSearchCount('account.move', [['move_type', 'in', ['out_invoice', 'in_invoice']], ['state', '=', 'posted']])` → total posted invoice count (filtered to customer + vendor invoices in posted state only; drafts + cancels excluded to avoid inflation)
  - `odooSearchRead<OdooInvoice>` → 5 most recent posted invoices
  - `odooSearchRead<OdooPartner>` → 5 most recent partners
  - `odooSearchRead<OdooAnalyticAccount>` → 5 most recent analytic accounts (eventual per-property P&L tags)
- Response shape: `{ ok: true, duration_ms, server: { version, serie }, invoices: { posted_total, sample }, partners: { sample }, analytic_accounts: { sample } }`.

#### `.env.example`
- Added 4 vars with inline comment documenting the API-key creation path (Profile → My Profile → Account Security → New API Key) + recommendation to use a dedicated "API Bot" user with scoped read-only accounting access, not personal admin login.

### Verification
- `npx tsc --noEmit` clean.
- Vercel build deployed to `kareemhady-gn95129gv-lime-investments.vercel.app` — READY.
- **Env vars NOT yet added to Vercel** — deploy compiled fine but ping will return 400 until user adds them.

### Waiting on user
Add `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_API_KEY` to Vercel (Production + Preview + Development) + `.env.local`, then I redeploy + curl the ping. If green, Phase 7.1 is Supabase migration `0009_odoo.sql` + backfill rule.

### Gotchas to remember when wiring rules later
- Datetimes stored UTC — use existing Cairo tz helper when rendering.
- `allowed_company_ids` context must be set on reads if multi-company — single-company for fmplus tenant should be fine.
- `partner_id`/`currency_id` etc. are tuples `[id, display_name]` or `false`; `Array.isArray` check before indexing.
- `move_type` values: `out_invoice` = customer invoice, `in_invoice` = vendor bill, `out_refund` / `in_refund` = credit notes, `entry` = journal entry (skip for revenue/cost).
- Analytic accounts (`account.analytic.account`) are the per-property P&L mechanism — Beithady listings should each map to one; confirm name pattern matches listing `nickname` (e.g. `BH73-ST-C-004`) during 7.1.

## ✅ PHASE 6.2 — Guesty connection verified end-to-end (worktree only, no main commit)

Ping returned `ok: true`, 569ms Guesty round-trip. 90 listings total (all Beit Hady `BH73-*`), 34 reservations flowing from `airbnb2` / `Booking.com` / `manual`, check-ins 2026-04-21 → 2026-04-29, USD payouts. Account ID `68342f589bf7f8c07ec2435c` (env value matches auto-detect). Phase 6 complete.

## 🔧 PHASE 6.1 — Guesty ping: account_id is now optional / auto-detected (commit 921a939)

### User feedback
Couldn't find Account ID in Guesty URL (`app.guesty.com/account/company-info` has no ID segment). Sent screenshots of OAuth Applications (already has "Beit Hady App" — different purpose), Marketplace, OAuth Analytics (all zeros — unused), Webhooks (PriceLabs endpoint configured, 0% errors).

### Change
`src/app/api/guesty/ping/route.ts` now:
- Errors only when `GUESTY_CLIENT_ID` or `GUESTY_CLIENT_SECRET` is missing — `GUESTY_ACCOUNT_ID` is no longer required.
- Adds `accountId` to the `fields` projection on `/listings` and `/reservations` so Guesty stamps it into each record.
- Auto-detects Account ID from the first record returned → response includes `detected_account_id` + `account_id_source: 'env' | 'auto-detected from API response' | 'not found'`.

Rationale: OAuth creds already scope to one account, so Account ID is cosmetic — used only for display in the ping. User can now set just 2 env vars, hit ping, read the auto-detected ID, optionally copy to Vercel later.

### Guidance I sent user for Guesty UI
1. **Create new OAuth app** (don't reuse "Beit Hady App" — that's for Booking/Added Services): OAuth Applications → New Application → name "InboxOps" → scopes `open-api` + `reservations:read` + `listings:read` + `guests:read` + `reviews:read` + `communication:read` + `tasks:read` + `payments:read`. Capture Client ID + Client Secret (secret shown once).
2. **Vercel env**: `GUESTY_CLIENT_ID`, `GUESTY_CLIENT_SECRET` to Production + Preview + Development. Skip `GUESTY_ACCOUNT_ID` — ping auto-detects.
3. **Local .env.local**: same two vars.
4. **Redeploy** (`vercel --prod --yes` from `C:\kareemhady`).
5. **Test**: `curl -H "Authorization: Bearer $CRON_SECRET" https://kareemhady.vercel.app/api/guesty/ping`.
6. **Later (webhook step)**: Add Endpoint `https://kareemhady.vercel.app/api/webhooks/guesty` with events `reservation.*`, `conversation.message.*`, `review.*`, `payout.sent`, `payment.received`, `task.*`, `listing.updated`, `listing.calendar.updated` → copy signing secret to `GUESTY_WEBHOOK_SECRET`.

### Verification
- Build clean, 15 routes.
- Deployed to `kareemhady-cfkcv1cyz-lime-investments.vercel.app`.

### Waiting on user
OAuth app creation + credentials in Vercel + smoke-test response. Once ping returns `ok: true` with real listing/reservation samples, next step is Supabase migration `0008_guesty.sql` + `guesty_reservation_pull` rule + webhook endpoint.

## ✅ PHASE 6 SCAFFOLD — Guesty Open API client + smoke-test endpoint (commit d9c8c2d)

### User direction
> "lets do guesty"

After presenting the 4-platform research synthesis, user picked Guesty as the first integration. Not unexpected — biggest unlock, user already pays for PRO.

### What shipped
Scaffolding only — the OAuth flow, generic fetch helper, typed list methods for reservations + listings, and a smoke-test endpoint. No DB schema, no rule type, no dashboard wiring yet. Intentionally minimal so the user can validate auth + API connectivity on real data before we commit to the bigger migration.

### Files

#### `src/lib/guesty.ts` (new, ~220 lines)
- **OAuth 2.0 client_credentials flow** against `https://open-api.guesty.com/oauth2/token` with `scope=open-api`.
- **Module-scoped in-memory token cache** (`cachedToken` singleton) with `expiresAt` check. Lazy-refresh when < 5 min remain. TTL is 24h (no refresh token — re-hit the token endpoint).
- `guestyFetch<T>(path, opts)` — generic helper:
  - Bearer injection from cache
  - Query-param serialization (handles null/undefined skip)
  - JSON body auto-encoding with `Content-Type`
  - **429 retry** honoring `Retry-After` header, max 2 retries (Guesty PRO is ~120/min, `/listings` tighter ~60/min)
  - 500-series retry, 4xx-except-429 throws immediately
- Typed exports:
  - `GuestyListing` — `_id`, `nickname`, `title`, `active`, **`listingType: 'SINGLE' | 'MTL' | 'SLT'`**, `masterListingId` (for multi-unit parent lookup), `customFields`, `address`
  - `GuestyReservation` — `_id`, `confirmationCode`, `status`, `source`, `listingId`, `guest.fullName`, `checkInDateLocalized` (property-tz wall date — **don't mix with** the UTC variant), `checkOutDateLocalized`, `nightsCount`, `guestsCount`, `money.{currency, hostPayout, guestPaid, fareAccommodation, cleaningFee}`, **`integration.confirmationCode`** (Airbnb HM-code), `createdAt`, `updatedAt`
- `listGuestyReservations(params)` — limit/skip, filters (Mongo-style, JSON-serialized), fields projection, sort
- `listGuestyListings(params)` — same shape
- Exports `guestyFetch` and `getAccessToken` for downstream use

#### `src/app/api/guesty/ping/route.ts` (new)
Smoke-test endpoint. `GET /api/guesty/ping` protected by `CRON_SECRET` bearer (same pattern as `/api/cron/daily`).

Response when credentials are missing → 400 with which env vars are present:
```json
{ "ok": false, "error": "Guesty credentials missing", "env": { "GUESTY_CLIENT_ID": false, ... } }
```

Response when auth works → 200 with 5 listings (`_id`, `nickname`, `title`, `active`, `listingType`) + 5 most-recent reservations (`_id`, `confirmationCode`, `status`, `source`, `guest`, checkIn/checkOut, `nights`, `hostPayout`, `currency`, `airbnb_code`, `createdAt`) + total counts + `duration_ms`.

Usage (once user sets credentials):
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://kareemhady.vercel.app/api/guesty/ping
```

#### `.env.example`
- New: `GUESTY_CLIENT_ID`, `GUESTY_CLIENT_SECRET`, `GUESTY_ACCOUNT_ID`, `GUESTY_WEBHOOK_SECRET` — with inline comments on where/how to create each.
- Backfilled the `STRIPE_SECRET_KEY` entry that was live since Phase 5.8 but missing from the example.

### What user needs to do (credentials)
1. Guesty UI → **Integrations → Marketplace → API** → "New secret token" → scope `open-api` → capture **Client ID** + **Client Secret** (secret shown once).
2. Note **Account ID** from URL (`app.guesty.com/accounts/<id>/...`).
3. Add to Vercel Prod + Preview + Dev: `GUESTY_CLIENT_ID`, `GUESTY_CLIENT_SECRET`, `GUESTY_ACCOUNT_ID` (webhook secret can wait).
4. Also add same vars to `C:\kareemhady\.env.local` for local dev.
5. Hit the ping endpoint to verify.

### Verification
- `rm -rf .next && npm run build` clean (15 routes now; `/api/guesty/ping` new).
- commit d9c8c2d on main via `git push origin HEAD:main`.
- Deployed via root `C:\kareemhady` → `kareemhady-qd0spoo16-lime-investments.vercel.app` (Ready, 48s).

### What's NOT done yet (next after smoke-test passes)
1. **Supabase migration `0008_guesty.sql`** — tables `guesty_reservations`, `guesty_listings`, `guesty_reviews`, `guesty_messages`, `guesty_webhook_events` with unique `(account_id, guesty_id)` per table.
2. **Rule type `guesty_reservation_pull`** in `src/lib/rules/engine.ts` — cron job that calls `listGuestyReservations({ filters: { createdAt: { $gte: last_run } }, ... })`, upserts to `guesty_reservations`. Runs alongside the existing `beithady_booking_aggregate` email rule for cross-check during cutover.
3. **Webhook endpoint `src/app/api/webhooks/guesty/route.ts`** — HMAC-SHA256 verify of `x-guesty-signature` header, raw body, event-type router.
4. **Dashboard swap** — point `/emails/beithady/<bookings-rule-id>` at the new `guesty_reservations` table; keep the email-derived output accessible under a "legacy" view during cutover.
5. **Backfill script** — one-off `npm run guesty:backfill` that paginates through 2 years of reservations.
6. **Apply same pattern** to reviews (`/reviews` endpoint) + conversations/messages (`/communication/conversations`) — these would replace Phase 5.9 (Reviews), 5.10 (Inquiries), 5.11 (Guest Requests) rules once trust is established.

### Gotchas to remember for the next step
- **MULTI-UNIT parents** — Guesty models multi-unit buildings (our BH-73 with MULTI-UNIT/SUB-UNIT children) as `listingType: 'MTL'` with child listings pointing via `masterListingId`. Reservations always attach to the SUB-UNIT child — aggregate up via `masterListingId` when rolling up to building-level metrics.
- **Canceled reservations** stay in `/reservations` unless filtered — would double-count payouts if we don't exclude `status: 'canceled'`.
- **Multi-currency** — `money.currency` can vary per reservation. Currently the email-driven rule defaults USD globally, which may mask EGP bookings. The API will force us to handle this correctly.
- **Webhook ordering not guaranteed** — always upsert-by-id with `updatedAt` comparison before overwriting; never trust ordering.
- **Offset pagination** (`skip` + `limit`, max 100) — prefer `sort=-createdAt` for resumable paging.
- **Localized vs UTC timestamps** — `checkInDateLocalized` is a wall date in the listing's timezone (string `YYYY-MM-DD`, no tz info), while `checkInDate` (without suffix) is a UTC ISO. Use the localized variant for display; use `createdAt` / `updatedAt` (UTC) for all sync pagination + CAIRO rendering via existing helper.

## 🔬 PLATFORM INTEGRATION RESEARCH COMPLETE — 4 of 4 agents returned (NO CODE YET; synthesis prepared for user)

### User request
> "My Intention to Connect all our platforms to this app kareemhady — Odoo 18, Guesty PRO, Price Labs, Green Whatsapp. Study carefully the detailed steps and what are the data that can be used through api from each one of them."

### Approach
Spawned 4 parallel research agents (general-purpose) — each digging into one platform's API docs, auth model, endpoint catalog, rate limits, webhook support, and fit with existing Beithady rules. Agents were briefed to return 500-800 word structured briefs, not code.

### Status — 3 of 4 complete; Guesty still in flight

#### ✅ Odoo 18 (returned)
- **Auth**: JSON-RPC + API key (Odoo 14+ feature, Odoo 18 unchanged). User generates in **Profile → Account Security → New API Key**. Env vars needed: `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_API_KEY`. Create a dedicated "API Bot" user with scoped permissions.
- **Works on** odoo.sh / Enterprise / Community / self-hosted — identical API. Odoo Online SaaS blocks custom modules (matters for the native webhook story).
- **Node SDK**: `odoo-await` (Ivan Chernyshov, actively maintained through 2025, works with 18). Avoid `odoo-xmlrpc` (callback style).
- **Models for hospitality ops**: `account.move` (invoices/bills via `move_type` filter), `hr.expense` (per-property expenses with `analytic_account_id` tag), `account.payment`, `account.bank.statement.line` (Stripe reconciliation), `res.partner` (vendors/cleaners/guests), `account.analytic.account` (critical for per-property P&L), `crm.lead`, `product.product`.
- **Webhooks**: native in Odoo 18 via `base.automation` rules + "Send Webhook Notification" action. Configure in Settings → Technical → Automation Rules.
- **Gotchas**: datetimes stored UTC (apply Cairo tz on render); `allowed_company_ids` context needed for multi-company; XML-RPC returns `False` / JSON-RPC returns `false` — normalise; v17 renamed `invoice_date`, `amount_total_signed` (stable in 18 but older docs may lie).

#### ✅ PriceLabs (returned)
- **Access tier**: API is **free on every paid plan**, no separate tier. Rate limit ~60 req/min per API key (parallel fan-out > 10 concurrent will 429).
- **Auth**: `X-API-Key` header (NOT `Authorization: Bearer`). Generated in **Account → Profile → API**. Base URL `https://api.pricelabs.co/v1`. One key per account, regenerable.
- **Endpoints**: `GET /listings` (canonical catalog — includes `pms_reference_id` joinable to Guesty listing_id + `pms = 'guesty'`), `GET /listing_prices` (per-listing daily recommendations — recommended_rate, min_stay, reasons, late-2025 additions `booking_prob`, `adjusted_price`), `GET /reservations`, `GET /listing/min_stay`, `POST /listings`/`PUT /listings/{id}` (push overrides), `GET /neighborhood_data`, `GET /market_dashboards` (requires ~$10/mo add-on), `POST /sync_now` (ad-hoc recalc, uses rate limit).
- **No webhooks as of 2026** — pull-only. Plan on a daily Vercel cron at 03:30 UTC (after PriceLabs' ~03:00 UTC internal nightly recalc).
- **REST-only, no official Node SDK** — build a thin `fetch` wrapper in `src/lib/pricelabs.ts` matching the shape of `src/lib/stripe-payouts.ts`.
- **Dashboard surface**: per-listing-per-day `gap_pct = (rec - pushed)/pushed`. Flag `> +15%` (leakage) or `< -10%` (missed upside), plus `push_enabled=false` as "PL paused, manual pricing" warning.
- **Gotchas**: `/listings` returns all in one response (no pagination under ~500 listings — Beithady at 91 is safe). `/listing_prices` is per-listing per-call — serialize with ~1s spacing. `>180d` ranges silently truncate at 500d. Listing-local timezone (Africa/Cairo for Beithady; Dubai listings would be Asia/Dubai — distinguish). 401 returns empty body; log `X-Request-ID`.
- **Items to confirm on the live portal**: exact header capitalisation (`X-API-Key` vs `X-Api-Key`), current `/listing_prices` schema fields, Market Dashboard availability on user's plan.

#### ✅ Green-API WhatsApp (returned)
- **What it is**: third-party WhatsApp gateway scripting an automated WhatsApp Web session. **NOT Meta's official WABA**. Cheaper + faster setup; carries ban risk if Meta flags automated patterns. Acceptable for ~50-200 msgs/day hospitality use; bad for marketing blasts.
- **Account setup**: register at console.green-api.com → create "instance" → scan QR from WhatsApp → phone must stay online with WhatsApp installed (disconnects > 14 days kill the session).
- **Tiers (2026)**: Developer (free, ~2 msg/sec, 1 instance, 14d expiry on inactivity), Business (~$40/mo, higher limits, 99.5% uptime), Enterprise (custom).
- **Credentials**: `idInstance` + `apiTokenInstance`. Base URL `https://api.green-api.com/waInstance{idInstance}/{method}/{apiTokenInstance}` — **token in URL path**, which leaks in proxy logs / CDN access logs / browser history. Rotate quarterly, server-only, redact from log pipelines.
- **Endpoints**: `GET /getStateInstance` (health poll every 5 min), `POST /sendMessage` (chatId format `{phone}@c.us`), `sendFileByUrl`/`Upload` (100MB cap), `sendContact`/`sendLocation`/`sendPoll`, `getChatHistory`, `checkWhatsapp`. Webhook mode preferred over `receiveNotification` polling.
- **Webhook payloads**: `typeWebhook = incomingMessageReceived | outgoingMessageStatus | stateInstanceChanged | deviceInfo`. Message `typeMessage = textMessage | imageMessage | videoMessage | audioMessage | documentMessage | locationMessage | contactMessage | buttonsResponseMessage | listResponseMessage | quotedMessage | reactionMessage | pollMessage`.
- **CRITICAL SECURITY GAP**: Green-API does NOT sign webhook payloads (no HMAC, no shared secret, no `X-GreenApi-Signature` header as of 2026). Mitigations: obscure random path `/api/webhooks/green/{long-random-slug}`, IP-allowlist Green-API egress ranges, validate `instanceData.idInstance` matches expected, HTTPS-only. Treat as untrusted input.
- **Rate discipline**: max 1 msg / 3-5 sec per recipient, random jitter, warm new numbers (day 1: 10 msgs, day 7: 100), vary wording. Ban = number dies, no chat export, must get new SIM + re-scan.
- **Fits for Beithady**: (a) inbound webhook → reuse existing inquiry/request urgency classifier + category taxonomy; (b) cron 24h pre-arrival → pull Guesty check-ins → send WhatsApp with address/code/WiFi; (c) +2h post-checkout → review reminder; (d) urgent inbound (broken AC, lockout) → Slack/email escalation.
- **Env vars**: `GREENAPI_ID_INSTANCE`, `GREENAPI_API_TOKEN`, `GREENAPI_WEBHOOK_SECRET_PATH`.
- **Compare to Meta Cloud API**: Meta = 2-4 week setup + pre-approved templates outside 24h window + per-conversation pricing + policy-compliant. Green-API = 10-min setup + free-form + phone-dependent + ban risk. For v1 integration, Green-API is pragmatic; if ops scale, migrate to Meta.

#### ✅ Guesty PRO Open API (returned — biggest unlock)
- **Included in PRO** (verify on account). Open API base: `https://open-api.guesty.com/v1`. **Rate limit ~120 req/min per token**; `/listings` and `/calendar` tighter at ~60/min. 429 includes `Retry-After`.
- **Auth**: OAuth2 client_credentials. UI path: Guesty → *Integrations → Marketplace → API* → "New secret token". Token endpoint `POST /oauth2/token` with `grant_type=client_credentials&scope=open-api`. **24h TTL**, no refresh token — re-hit token endpoint. Cache in-memory, lazy-refresh at <5 min remaining.
- **Core endpoints**:
  - `GET /listings` — full catalog. `_id`, `nickname` (our `listing_code`), `title`, `address`, bedrooms/bathrooms, `propertyType`, `tags`, `customFields`, `amenities`. **MULTI-UNIT parents have `listingType: 'MTL'`; children point via `masterListingId`** — our Beithady listings CSV MULTI-UNIT/SUB-UNIT can be cross-verified here.
  - `GET /reservations` — filterable by `checkIn`/`checkOut`/`createdAt` with `$gte`/`$lte`, `status` (inquiry/reserved/confirmed/canceled), `source` (Airbnb/Booking.com/Direct/Vrbo), `listingId`. Offset pagination (`skip`+`limit` up to 100).
  - `GET /reservations/{id}` — full detail: `guest`, `money.hostPayout` (net after commission, matches our `total_payout` to the cent), `money.fareAccommodation`/`cleaningFee`/`guestPaid`, `integration.platform`, `integration.confirmationCode` (Airbnb HM-code), `checkInDateLocalized` (property-tz wall date) vs UTC variants.
  - `GET /guests/{id}`, `GET /calendar?listingId&from&to`, `GET /reviews` (with `overallRating`, `public.content`, `reservationId`, `channel`).
  - `GET /communication/conversations` + `/messages` — **replaces the RE: Reservation email scraping** in the Guest Requests rule. Each message has `module` (sms/email/airbnb/booking-chat), `body`, `from`, `createdAt`.
  - `GET /tasks` — housekeeping/maintenance. `GET /payments` — receivables. `GET /integrations` — Airbnb / Booking.com / Expedia / Vrbo connection health + channel listing IDs. `GET /analytics/{occupancy,revenue}` — gated add-on.
- **Webhooks** via `POST /webhooks` (or UI Integrations → Webhooks). Events: `reservation.new/updated/status.updated/canceled`, `conversation.message.received/sent`, `review.new/updated`, `listing.created/updated/calendar.updated`, `task.created/updated`, `payment.received`, `payout.sent`. **Signature verification: HMAC-SHA256 of raw body, `x-guesty-signature` header** — use a constant-time compare.
- **No official Node SDK**. OpenAPI 3 spec at `/openapi.json` — plan is `openapi-typescript` → generated types + thin `fetch`-based client in `src/lib/guesty.ts` (~150 LOC).
- **Field mapping** (email → API) is a ready map in the handoff research output — `booking_id` → `reservation.confirmationCode`, Airbnb HM → `reservation.integration.confirmationCode`, `guest_name` → `reservation.guest.fullName`, `listing_code` → `listing.nickname`, `total_payout` → `reservation.money.hostPayout`, `check_in_date` → `reservation.checkInDateLocalized`, `channel` → `reservation.source`, `nights` → `reservation.nightsCount`.
- **Gotchas**: MULTI-UNIT rollup via `masterListingId`; `checkInDateLocalized` vs `checkInDate` (localized = property wall date, non-localized = UTC ISO — don't mix); offset pagination max `limit=100`; `canceled` reservations stay in results unless filtered (would double-count payouts); `money.currency` varies per reservation (multi-currency) — email rule's USD default masks EGP bookings; webhook ordering not guaranteed — always upsert-by-id with `updatedAt` comparison.
- **Env vars**: `GUESTY_CLIENT_ID`, `GUESTY_CLIENT_SECRET`, `GUESTY_WEBHOOK_SECRET`, `GUESTY_ACCOUNT_ID`.
- **Integration path** (8 steps): (1) create creds in Guesty UI, (2) add env vars, (3) `src/lib/guesty.ts` with token cache + 429-retry + `list{Reservations,Listings,Reviews,Conversations}` methods, (4) migration `0008_guesty.sql` for `guesty_{reservations,listings,reviews,messages,webhook_events}` tables with `(account_id, guesty_id)` unique keys, (5) new rule `guesty_reservation_pull` — cron + on-demand, replaces the LLM email parsing (keep email rule in parallel for cross-check during cutover), (6) webhook endpoint `src/app/api/webhooks/guesty/route.ts` with HMAC verify + event-type router, (7) dashboard swap `/emails/beithady/<bookings-rule>` to read from `guesty_reservations` directly, (8) backfill script pulls last 2 years via pagination.

### Full synthesized roadmap for user

**Priority 1 — Guesty PRO Open API (biggest unlock)**
Replaces email-driven parsing with live data for all 5 Beithady rules (bookings, payouts via `/payments`, reviews, inquiries via `/communication/conversations`, guest requests via same). Accurate to the cent, no LLM parse errors, near-realtime via webhooks. User already pays for PRO.

**Priority 2 — Odoo 18 (finance closure)**
Pulls invoices (`account.move` with `out_invoice` for guests, `in_invoice` for vendor bills), per-property expenses tagged by `analytic_account_id`, bank-statement lines for Stripe reconciliation, vendor CRM. Enables per-property P&L in a new `finance` domain alongside `beithady`.

**Priority 3 — PriceLabs (revenue optimization)**
Pulls daily rate recommendations, min-stay rules, gap-vs-pushed analysis. Flags revenue leakage (price above recommendation → empty nights) and missed upside (price below → leaving money on table). Pull-only, daily cron. `pms_reference_id` in `/listings` response joins cleanly to `guesty_listing_id`.

**Priority 4 — Green-API WhatsApp (guest messaging)**
Inbound webhook → reuse existing inquiry/request classifier + urgency taxonomy. Outbound automation: 24h pre-arrival check-in instructions, post-checkout review reminders, urgent-incident escalation. Ship BUT warn user about ban risk + security gap (unsigned webhooks); plan Meta Cloud API migration path if volume grows.

### Credential checklist — what user needs to provision before I write code
- **Guesty**: Client ID + Client Secret (from Integrations → Marketplace → API) + Webhook secret + Account ID
- **Odoo**: URL (`https://beithady.odoo.com` or self-hosted), DB name (from `/web/database/selector`), API Bot user email, API key (from Profile → Account Security)
- **PriceLabs**: API key (from Account → Profile → API)
- **Green-API**: create instance in console.green-api.com, scan QR with dedicated Beithady WhatsApp number, grab `idInstance` + `apiTokenInstance`

### Schema direction (high-level, not yet migrated)
- New domain `finance` for Odoo-backed rules
- Extend `beithady` with `pricelabs_pricing_snapshot` rule (daily cron)
- New domain `whatsapp` for Green-API inbound
- New Supabase tables per platform: `guesty_{reservations,listings,reviews,messages,webhook_events,accounts}`, `pricelabs_snapshots`, `whatsapp_messages`, `odoo_records`
- Integration tokens stored AES-GCM encrypted using existing `TOKEN_ENCRYPTION_KEY`

### What happens next session (synthesis still pending)
When Guesty returns, produce:
1. **Prioritized roadmap** — Guesty first (replaces email ingestion with live data; user already pays for PRO), then Odoo (finance closure), then PriceLabs (revenue optimization), then Green-API (guest messaging).
2. **Credential checklist** for the user — exactly what env vars / OAuth creds / instance IDs to provision before I write code.
3. **Schema mapping** — how each platform's data maps onto existing rules (bookings, payouts, reviews, inquiries, requests) + where new domains are needed (likely `finance` for Odoo, extend `beithady` with `pricelabs_pricing_snapshot`, new `whatsapp` domain).
4. **5-step integration skeleton per platform** using the existing rule-engine pattern (aggregator file + engine branch + mini card + detail view + seeded rule row).

### No code changes this turn
Pure research/planning. The Cairo timezone fix (commit 77256a9) is still the last shipped change.

### If picking up fresh
- Guesty research output will be in the agent's output file by then; the summary will auto-stream into the next conversation. If not, re-run the Guesty research agent.
- Do NOT start writing integration code before confirming the roadmap + credentials with the user. This is a research/planning turn.

## ✅ CAIRO TIMEZONE ON ALL DASHBOARD TIMESTAMPS (commit 77256a9)

### User question
> "are timings correct to Cairo Time GMT +2 (mind Day Saving Schedule)"

### The bug
Bare `new Date(iso).toLocaleString()` calls in server components used the Node runtime's default timezone. On Vercel that's **UTC**, not Cairo. So "Last run · 4/21/2026, 6:45:35 AM" shown to the user was actually the UTC time — Cairo would have been 8:45 AM (UTC+2 on 4/21, before the DST switch on April 24).

Client-side renders would respect the browser timezone but only after hydration, and the Airbnb Line Items modal table (client component) was the only client-rendered date — still inconsistent depending on the viewer's laptop clock.

### The fix
New module `src/lib/fmt-date.ts` with two helpers:
- `fmtCairoDateTime(iso)` — returns "4/21/2026, 8:45:35 AM" in `Africa/Cairo`
- `fmtCairoDate(iso)` — returns "4/21/2026" in `Africa/Cairo`

Both pin `timeZone: 'Africa/Cairo'` explicitly. IANA `Africa/Cairo` handles Egypt's DST automatically (EEST UTC+3 from the last Friday of April through the last Thursday of October since 2023 re-instatement, EET UTC+2 otherwise). Locale pinned to `en-US` so the displayed format stays exactly what the user already has on screen (server + client render identically).

### Files changed
- `src/lib/fmt-date.ts` — new helper module.
- `src/app/emails/page.tsx` — 1 call (home emails page, domain cards "Last run · 4/21/2026").
- `src/app/emails/[domain]/page.tsx` — 1 call (per-domain card's "Last run · <datetime>").
- `src/app/emails/[domain]/[ruleId]/page.tsx` — 22 calls (detail page: latest-run header timestamp, time-range clamp warning dates, run history "Started" column, Airbnb payout email dates, Stripe API payout created/arrival dates + transaction timestamps, inquiry / review / request received timestamps in their various cards, cross-match run timestamp, etc.).
- `src/app/emails/[domain]/[ruleId]/AirbnbLineItemsTable.tsx` — 1 call (footer caption: "last run <datetime>").
- `src/app/admin/accounts/page.tsx` — 3 calls (accounts last_synced_at, runs started_at, email_logs received_at).

### Left untouched on purpose
- **Numeric `.toLocaleString()` calls** — count / currency formatting, not timezone-sensitive. Scan passed them over.
- **Month-bucket label generation** in `beithady-review.ts` + `beithady-payout.ts` — renders "Apr 2026" style labels from UTC month-start keys. The output is a bucket identifier used for sort + display, not a Cairo moment.
- **Detail page line 2055** — same month-label pattern used for the chart x-axis, keeps its explicit UTC options.

### Why Africa/Cairo vs fixed GMT+2
Egypt runs DST:
- EET (UTC+2) from last Thursday of October to last Friday of April (winter)
- EEST (UTC+3) from last Friday of April to last Thursday of October (summer)

Hardcoding `GMT+2` would break every April 24 → October 30. `Africa/Cairo` in the IANA tz database tracks this automatically — no code changes ever needed for future DST transitions.

Today (2026-04-21) Egypt is in EET (UTC+2). On 2026-04-24 it'll switch to EEST (UTC+3). The dashboard will reflect the switch automatically.

### Sed-based bulk replacement
For the detail page's 22 calls + accounts page's 3 + AirbnbLineItemsTable's 1, ran:
```
sed -i 's/new Date(\([^)]*\))\.toLocaleString()/fmtCairoDateTime(\1)/g;
        s/new Date(\([^)]*\))\.toLocaleDateString()/fmtCairoDate(\1)/g'
```
with the escape-brackets-in-path gotcha — had to cd into each directory rather than use the `[domain]/[ruleId]` path glob, since bash interprets the brackets as a glob pattern and couldn't find the file otherwise.

### Verification
- `rm -rf .next && npm run build` clean, 14 routes.
- commit 77256a9 on main via `git push origin HEAD:main`.
- Deployed via root `C:\kareemhady` → `kareemhady-6puoe28m2-lime-investments.vercel.app` (Ready, 49s).

### Note for the next session
If a future component introduces a new `new Date(x).toLocaleString()` or `.toLocaleDateString()` call, use `fmtCairoDateTime(x)` / `fmtCairoDate(x)` from `@/lib/fmt-date` instead. The bare calls are correct timezone-wise only if the server happens to match Cairo.

## ✅ PAYOUTS: CLICK "BY BUILDING" ROWS TO DRILL INTO LINE ITEMS (commit b5a1971)

### User request
User shared a screenshot of the "Airbnb payouts by building" table (UNKNOWN 12 items / BH-73 9 / BH-435 3 / BH-OK 2) and said:
> "trying to click on unknown to try to see whats the problem ....Nothing Happens Unclickable"

### The fix
Added a URL-driven `?building=<key>` filter. Clicking a building row toggles the filter on; clicking the active row (or the Clear button) removes it. Same URL-param pattern already used elsewhere (Requests group-by toggle, Range preset).

### Files changed (single file)
`src/app/emails/[domain]/[ruleId]/page.tsx`:

- Detail page server: added `building?: string` to `searchParams` type; resolved into `airbnbBuildingFilter = sp?.building?.trim() || null`; threaded into `BeithadyPayoutView` alongside `domain`, `ruleId`, `searchParamsSnapshot`.
- `BeithadyPayoutView` signature extended with those props. New `buildPayoutHref(nextBuildingKey | null)` helper inside the component — constructs the URL preserving `preset` / `from` / `to`, appends `?building=X` when setting, omits the param when clearing, and **adds `#airbnb-line-items` anchor so the browser scrolls to the drill-in** after the click.
- **By-building table rows clickable via stretched-link pattern**: each `<tr>` is `position: relative`; the Building cell wraps its content in `<Link>` containing a `<span className="absolute inset-0" />` that expands to cover the full row. Entire row is clickable, hover-emerald, valid HTML (`<a>` inside `<td>`, never wrapping `<tr>`). Active row gets `bg-emerald-100/60` + a small `active · clear` chip. Clicking the active row passes `null` to `buildPayoutHref` and clears the filter.
- Line items pre-filtered at render via `filteredRefundables = buildingFilter ? refundables.filter(l => (l.building_code || 'UNKNOWN') === buildingFilter) : refundables`. UNKNOWN bucket catches line items whose `building_code` is null.
- Airbnb line items section gained `id="airbnb-line-items"` anchor + `scroll-mt-6` for a small offset from top.
- When a filter is active, an emerald banner renders above the table: "Filtered to {X} — showing {N} of {M} line items" + "Clear filter" button that links back to the no-filter URL. UNKNOWN banner appends an explanation: "These are line items whose listing name didn't match the Beithady catalog or a BH-code" (so the user immediately understands why those items fell through).
- Section title updates to reflect filter: `Airbnb line items · UNKNOWN (12 of 26)`.
- Hint copy updated on the by-building section: "Click a row to filter the line items table below."
- `AirbnbLineItemsTable` client component unchanged — it just receives the already-filtered list. The existing click-row-for-modal detail interaction still works inside the filtered view.

### Verification
- `rm -rf .next && npm run build` clean, TS pass, 14 routes.
- commit b5a1971 on main via `git push origin HEAD:main`.
- Deployment: first `vercel --prod --yes` threw `ECONNRESET` on the response but `vercel inspect` confirmed `kareemhady-1ikcfj49z` went Ready + was aliased to `kareemhady.vercel.app`. The CLI errored on the response, not the upload — the deploy itself succeeded.

### URL pattern
- Drill into UNKNOWN: `/emails/beithady/<payout-rule-id>?building=UNKNOWN#airbnb-line-items`
- Drill into BH-73: `?building=BH-73`
- Clear: click the active row or the Clear filter button (returns to no-param URL)

### Why this shape over alternatives
- **URL param vs client state**: state survives refresh + is shareable (paste "show me what went to UNKNOWN" URL in Slack).
- **Stretched-link vs onClick**: keeps the whole interaction server-renderable. `<a>`-inside-`<td>` with a stretched span is the cleanest cross-browser way to make a whole `<tr>` clickable without invalid HTML.
- **Section anchor**: clicking a building row 4 cards above the table was confusing without the scroll — anchor jumps the viewport to the drill-in location automatically.

### Open question for next run
After the user re-runs the rule with the updated listings catalog (commit 6aee045), they should see FEWER UNKNOWN line items — Gouna / Dubai / BH-NEWCAI listings that previously fell into UNKNOWN should now route to their canonical buckets. If UNKNOWN is still large, clicking it reveals the remaining listings and we can tune the `findListingByName` fuzzy matcher.

## ✅ STRIPE API ARRIVAL-DATE FILTER + AIRBNB LINE-ITEM MODAL (commit 1ea2c30)

### User request
User ran the Payouts rule with real data and shared screenshots:
- Stripe API reconciliation showed "API TOTAL USD 3,288 · 1 payouts" while the hero said "5 Stripe payouts". Asked: "if it is 5 payouts for Stripe, why it is showing only 1 in API"
- "Also need to click on line in Airbnb to see details as popup"

### Issue 1: arrival_date vs created filter
**Root cause**: `fetchStripePayoutBreakdown` in `src/lib/stripe-payouts.ts` filtered Stripe payouts by `created` timestamp (when Stripe initiated the payout). Stripe's payout notification emails trigger around `arrival_date` (when funds land at the bank), which can be 2-4 days after creation. A payout created on Mon arriving Thu shows up in Thu emails — but the API filter with a Thu-only window would miss it.

**Fix**: switched `listPayoutsInRange()` to filter by `arrival_date: { gte: fromTs, lte: toTs }`. Now API range aligns with email-trigger timing.

**Secondary fix**: the hero's "Stripe USD" subtitle conflated raw Gmail hits with successfully-parsed payout notifications. Now shows `${stripePayouts.length} parsed payouts · Booking.com / Expedia / Manual` when all emails parsed, or `${stripePayouts.length} parsed · ${stripeCount} Stripe emails · Booking.com / Expedia / Manual` when they differ. The hero no longer implies "5 payouts" when only 1 or 2 of those Gmail matches are actual payout notifications.

### Issue 2: click-to-modal on Airbnb line items
New client component `src/app/emails/[domain]/[ruleId]/AirbnbLineItemsTable.tsx` (`'use client'`):

- Accepts `lineItems`, `bookings`, `crossMatchRunAt` as plain-data props (no functions — serializable across the server/client boundary).
- Rebuilds the `bookingsByCode` + `bookingsByGuest` lookup maps client-side via `useMemo`. Same two-step match logic as the server: exact HM-code first, one-and-only-one guest-name fallback.
- Each row is now a cursor-pointer button that setOpen()s the line item. Hover-rose stays.
- Native `<dialog>` element with `useRef` + `useEffect` to call `.showModal()` / `.close()`. Free focus trap + escape-key handling + backdrop click (detected via `e.target === dialogRef.current` in the onClick handler).
- Modal header: confirmation code mono, Refund/Type badges, "matched Guesty" emerald pill when there's a match, guest name.
- Modal body:
  - Full listing name (word-wrapped, NOT truncated) + Airbnb numeric listing id below
  - 4-cell grid: Amount (rose tone when refund), Airbnb bldg (from email), Stay, Payout sent
  - When matched: full emerald panel with Channel, Guesty bldg, Listing code (mono), Expected payout, Nights, Guesty guest, Check-in, Check-out, Guesty listing (wrap). Delta callout when |paid - expected| > $1: amber for overpaid, emerald for underpaid.
  - When not matched: slate note explaining why ("booking rule hasn't run in range, non-Airbnb channel paid through Stripe, etc").
- Footer: Close button + small "Click any row to see full details (cross-matched against Guesty bookings last run ...)".
- Small `DetailCell` helper for the grid cells with label / value / optional icon / mono / wrap / tone options.

`BeithadyPayoutView` server component now just forwards props:
```tsx
<AirbnbLineItemsTable
  lineItems={refundables}
  bookings={crossMatchBookings}
  crossMatchRunAt={crossMatchRunAt}
/>
```
All interactive state lives in the client file. The old `lookupBooking` usage inside `BeithadyPayoutView` for the Airbnb table is gone (still used for the Stripe txn table, which stays server-rendered — Stripe txn volume is larger and per-row interactivity isn't the same ask).

### Type fix during build
First build failed because `AirbnbLineItem.listing_airbnb_id` was required but the server-side line_items type didn't include it. Made it optional (`?: string | null`) on the client type — it's shown in the modal when present but doesn't break when missing.

### Verification
- `rm -rf .next && npm run build` clean, 14 routes, TS pass.
- commit 1ea2c30 on main via `git push origin HEAD:main`.
- Deployed via root `C:\kareemhady` → `kareemhady-rlgzukdai-lime-investments.vercel.app` (Ready, 51s).

### What the user should see on next run
- Stripe API reconciliation MATCHED count should go up (since arrival_date catches payouts that created-date missed).
- Hero's "Stripe USD" subtitle now honest: shows both parsed-count and email-count when they differ.
- Clicking any row in the Airbnb line items table opens a centered modal with the full reservation detail + Guesty match panel.

### Note on why some payouts may still be email-only
Even with arrival_date, email-only counts can remain non-zero because:
- The rule searches `from:stripe to:payments@beithady.com` — if some Stripe emails for OTHER accounts got forwarded there, they'd count as emails but not be in this account's API.
- The Restricted key might not have read access to an older payout if Stripe archived it (unusual).
- Date boundaries: an arrival_date exactly on the boundary second could go either way depending on timezone rounding.

## ✅ BEITHADY PAYOUTS: ALL AMOUNTS IN USD (commit 2bdd20f)

### User request
User shared a screenshot of the Payouts detail page showing "TOTAL PAYOUTS AED 22,462 / AIRBNB AED 10,386 / STRIPE AED 12,076" and said:
> "why we are back to AED, All currencies should be USD"

### The fix
All Beithady Payouts displays now render in USD. Render-time conversion only — no aggregator changes, no stored-output schema changes, existing `rule_runs` display the new currency without a re-run.

### The conversion
UAE dirham is pegged to USD at **1 USD = 3.6725 AED** (fixed by the UAE Central Bank since 1997). Safe to hardcode — no FX API needed, no drift. Defined as `AED_PER_USD` constant + `aedToUsd()` / `fmtAedAsUsd()` helpers next to the existing `fmt()` helper at the top of `src/app/emails/[domain]/[ruleId]/page.tsx`.

### What's sourced where
- **Airbnb "USD"** — prefers the **native** `airbnb_total_usd` field (sum of per-reservation USD line amounts from the payout email bodies). Falls back to `airbnb_total_aed / 3.6725` when the native value is missing. Native is more accurate because Airbnb's own FX rate differs slightly from the peg in email totals.
- **Stripe "USD"** — peg-converted from `stripe_total_aed` (AED is Stripe's settlement currency for this account). For per-transaction API breakdown rows, prefers the **native** `source_amount` when `source_currency === 'USD'` (Booking.com / Expedia charges are often USD pre-FX), otherwise peg-converts from the AED settlement amount.
- **Total USD** — peg-converted from `total_aed` (sum of both sources' AED settlements, so the peg is applied uniformly — keeps Airbnb + Stripe comparable on the same scale).

### Files changed
`src/app/emails/[domain]/[ruleId]/page.tsx`:
- Shared helpers: `AED_PER_USD`, `aedToUsd()`, `fmtAedAsUsd()`.
- `BeithadyPayoutView` hero — all 4 HeroStat labels + values: Total USD / Airbnb USD (prefer native) / Stripe USD / Unique reservations count (unchanged).
- Bank destinations — reworded to explain the peg + that both sources settle AED to the same FZCO IBAN.
- Source split — bar widths unchanged (share math identical), labels/tooltips in USD, hint mentions peg.
- `PayoutMonthChart` — bar labels + hover titles in USD.
- Airbnb payouts table — "Payout AED" → "Payout USD" column with `fmtAedAsUsd(p.total_aed)`. "USD in items" unchanged (already native).
- Stripe email-payouts table — "Amount AED" → "Amount USD".
- `StripeApiBreakdownSection` — "API total AED" → "API total USD" stat, per-payout hero amount + net/fees in USD, transaction "Amount USD" column with the native-source-preferred logic above, all hints/copy updated.
- Run history column "Total AED" → "Total USD" with `aedToUsd` applied to the count.

`src/app/emails/[domain]/page.tsx`:
- `BeithadyPayoutMini` — inlined `AED_PER_USD` constant + same prefer-native-then-peg logic. Labels: Total USD / Airbnb USD / Stripe USD / Payout emails.

### Expected numbers (from user's screenshot)
Was: AED 22,462 / Airbnb 10,386 / Stripe 12,076 / 2,828 USD line items (13 reservations)
Now: **~$6,116 USD total · $2,828 Airbnb (native) · $3,289 Stripe (peg) · 13 reservations**

### Verification
- `rm -rf .next && npm run build` clean, 14 routes.
- commit 2bdd20f on main via `git push origin HEAD:main`.
- Deployed via root `C:\kareemhady` → `kareemhady-44qjysluy-lime-investments.vercel.app` (Ready, 48s).

### Why peg-hardcoded (not a live FX API)
- UAE's AED has been pegged to USD at 3.6725 since 1997 — zero drift.
- Adding openexchangerates / fixer.io / any FX provider would add an API key, a dependency, and ongoing auth rotation for a value that literally doesn't change.
- If the peg ever changes (extremely unlikely), flip one constant.

### Gotcha to remember
Aggregator `BeithadyPayoutAggregate` type still stores `*_aed` fields — they're the AED settlement amounts, which is the source of truth. The USD figures are computed at render from those. Do not rename the stored fields to `*_usd`; you'd break Phase 5.8's Stripe API reconciliation which compares amounts in AED minor units.

## ✅ REQUESTS GROUP-BY TOGGLE + COLLAPSIBLE RUN HISTORY (commit 6f34fdf)

### User request
> "Requests view grouped with Choice Between Guest and Reservation / Choose how to group"
> "Run history across all domains to be button only shows up when pressed"

### Guest Requests view — group-by toggle (?group=guest | reservation)
- Added `group?: string` to the detail page `searchParams`. Resolved server-side into `requestsGroupMode: 'guest' | 'reservation'`, default `reservation` (preserves existing behavior — shareable URL, no client bundle).
- Threaded `groupMode`, `domain`, `ruleId`, `searchParamsSnapshot` into `BeithadyRequestView`. Local `buildGroupHref(mode)` helper builds the opposite-mode URL preserving existing preset / from / to params, omits the `group` query when switching back to reservation (keeps URL clean).
- Toggle UI: two Next.js `<Link prefetch={false}>` buttons rendered inline with the section header. Active button is indigo-filled; inactive is white with slate text. Button pair wrapped in a rounded pill border.

### New guest-mode rendering
Added two helpers at module scope (after `BeithadyRequestView`):
- `buildGuestThreads(messages)`: groups by `guest_name.toLowerCase().trim()`, builds per-thread aggregate — `reservationCount` (unique group_keys), `maxUrgency` (via `REQUEST_URGENCY_RANK`), `hasImmediateComplaint`, `categories` (union), `buildings` (union), `listings` (union), `latestReceivedIso` + associated `latestSummary` / `latestSuggestedAction`. Sort: immediate-complaint first → max urgency desc → latest activity desc.
- `GuestThreadsList({ messages })`: thread card per guest. Header chips: guest name, urgency badge, immediate-complaint siren badge, msg count, **N reservations** chip when > 1, building codes, category union. Latest summary + suggested-action callouts. Inner messages chat-style (oldest first), each annotated with its own listing + stay range + `StayPhaseBadge` (so the reservation context stays legible when a guest spans multiple stays). Inline classifier summary, verbatim quote (Arabic-preserving with `whitespace-pre-wrap`), per-message suggested action.

Reservation-mode rendering unchanged — still driven by `byReservation` (from the aggregator's pre-built reservation groups) + `messagesByGroup` fan-out. The conditional `groupMode === 'guest' ? <GuestThreadsList .../> : (<reservation markup>)` lives inside the existing section wrapper.

### Run history — collapsed by default (all rule types)
Existing `<section>` wraps a `<details className="group">`:
- `<summary>` styled as a full-width clickable header: chevron-right icon that rotates 90° when open (via `group-open:rotate-90`), "Run history (N)" title, and a "Show"/"Hide" label that swaps via `group-open:hidden` / `hidden group-open:inline`.
- Default disclosure triangle hidden with `list-none`.
- Table content lives directly inside `<details>` so native HTML handles hide/show — zero JS, no client component.
- Applies to all five rule types (Shopify, Beithady Bookings / Payouts / Reviews / Inquiries / Requests) since the Run history section is shared across them at the detail-page layout level.

### Verification
- `rm -rf .next && npm run build` clean (14 routes).
- commit 6f34fdf on main via `git push origin HEAD:main`.
- Deployed via root `C:\kareemhady` → `kareemhady-d7gy3815x-lime-investments.vercel.app` (Ready, 47s).

### URL for QA
- Default (reservation): `/emails/beithady/<requests-rule-id>`
- Guest-mode: `/emails/beithady/<requests-rule-id>?group=guest`

### Why URL param over client component
1. Matches the existing pattern of the detail page (`preset`, `from`, `to` all use searchParams).
2. State survives refresh + is shareable (paste the ?group=guest URL in Slack and land on the right view).
3. No client bundle growth / no extra hydration for a rarely-used toggle.
4. Toggle involves a round-trip, which on Vercel is ~200ms — fine for this kind of pivot.

## ✅ INQUIRIES VIEW: CHAT-STYLE PER-GUEST THREADS (commit b8868ea)

### User request
User shared a screenshot of `/emails/beithady/<inquiries-rule-id>` showing the "All inquiries (38)" section with four consecutive cards all from "Abdalla Binu" for the same listing and stay dates. Said:
> "need to combine messages from Same Guest in a chat like review, no need to keep them separate, distraction"

### Change
Restructured the "All inquiries" section in `BeithadyInquiryView` to render **one card per guest** with the guest's messages stacked chronologically inside — same shape as the Phase 5.11 Guest Requests reservation-thread cards.

### Implementation
Pure render-time regroup inside `BeithadyInquiryView`. No aggregator changes, no schema changes, no backend work.

- Group by normalized guest name (`.toLowerCase().trim()`).
- Per-thread aggregates computed at render:
  - `worstTone` — smallest SLA-tone rank across messages (`overdue < urgent < soon < fresh < unknown`). Used for the header SLA badge AND the group sort.
  - `latestReceived` — "last activity" timestamp in the header.
  - `needsAttention` — any message with `classification.needs_manual_attention`.
  - `listings` — unique listing names (rendered as "Name + N more" when >1).
  - `buildings` — unique building codes (chips rendered in header).
  - `categories` — union of categories across the thread (chip row in header).
  - `stayRanges` — unique check-in→check-out strings; rendered as "1 stay range" text or "N stay ranges" when multi.
- Thread sort: worst-tone asc → needs-attention first → latest activity desc.
- Message sort within a thread: **oldest first** (chat reading order, newest at the bottom).
- Each inner message: timestamp, category chip, compact "decision" chip when that specific message needs one, its own `SlaBadge`, Haiku summary, verbatim guest question blockquote (Arabic preserved via `whitespace-pre-wrap`).
- Header-level badges: guest name (first-seen casing), msg count, thread-level "needs decision" when any message is flagged.

### UX notes
- The older "Combined by guest" table earlier in the page is untouched — it's the compact scan view, the new thread cards are the detailed-read view. Some redundancy but the table remains useful for quick counting.
- Section header renames from "All inquiries (38) · sorted by SLA urgency" to "Conversations (N guests · M messages) · sorted by SLA urgency" so the grouping is self-evident.
- Old rule_runs render the new layout immediately — the regroup is on the stored `messages[]` array, no re-run needed.

### Verification
- `rm -rf .next && npm run build` clean, 14 routes.
- commit b8868ea on main via `git push origin HEAD:main`.
- Deployed via root `C:\kareemhady` → `kareemhady-rh0u09i3l-lime-investments.vercel.app` (Ready, 51s).

### If the user asks for similar grouping on Guest Requests
The Phase 5.11 Guest Requests view already groups by reservation thread (subject-normalized). Guest-level grouping on top of that is possible but would collapse multiple reservations from the same guest — ask before doing it because splitting BY RESERVATION is often desirable (a guest's current stay vs their next booking are distinct).

## ✅ BEITHADY LISTINGS CATALOG SHIPPED — authoritative property table + classifier wiring (commit 6aee045)

### User request
> "C:\kareemhady\.claude\Documents — Look at file Beithady Listings ... This is a full list of Properties, save it for further match across Beithady Domain Rules"

Imported the 91-row CSV and made it the single source of truth for building classification and listing metadata across all five Beithady rules.

### Source
`C:\kareemhady\.claude\Documents\Beithady Listings.csv` — columns: NICKNAME, TITLE, TYPE OF UNIT, TAGS, LISTING ID.

Building groups represented:
- **BH-26** (22 units: BH-26-001 … BH-26-501) · Kattameya
- **BH-435** (14 units: BH-435-001 … BH-435-402) · New Cairo
- **BH-73** (26 units, mix of SINGLE-UNIT / MULTI-UNIT / SUB-UNIT: BH73-1BR-C-8, BH73-2BR-SB-5, BH73-3BR-SB-1/2/3, BH73-ST-C-7, BH73-4BR-C-405, etc.) · New Cairo, 24/7 desk
- **BH-ONEKAT** (10 scattered Kattameya units: BH-101-55, BH-107-46, BH-109-23/43, BH-114-73, BH-115-75, BH-116-36, BH-202-61, BH-203-86, BH-213-82) — rendered as **BH-OK** in the UI (existing canonical code)
- **BH-MG** (1 Heliopolis apartment: BH-MG-20-1)
- **BH-GOUNA** (3 units: BH-MANG-M15B13 Mangroovy, BH-MB34-105 AbuTig, BH-WS-E245 WaterSide) · El Gouna resorts
- **BH-NEWCAI** (1 standalone New Cairo unit near AUC: BH-NEWCAI-4021)
- **DXB** (3 Dubai units: LIME-MA-1402 Marina, REEHAN-204 Reehan, YANSOON-105 Yansoon)

### Files

#### `src/lib/rules/beithady-listings.ts` (new, 224 lines)
- `BeithadyListing` type with nickname, title, unit_type (`SINGLE-UNIT` | `MULTI-UNIT` | `SUB-UNIT`), tags (parsed from CSV), building_tag (primary = first tag), guesty_listing_id.
- `RAW` const — 91 tuples `[nickname, title, unit_type, tagsJoined, guestyId]`. Easy to re-paste from a future CSV update.
- `BEITHADY_LISTINGS` — readonly array, built once at module load.
- Lookup maps built at module load: `byNickname` (upper-case), `byGuestyId`, `byTitle` (lower-case, first-write-wins for duplicated titles like the 10+ identical "Luxury 2 Bedroom Residence by Beit Hady" BH-435 units).
- Exports:
  - `getListingByNickname(code)` — exact, case-insensitive
  - `getListingByGuestyId(id)` — exact
  - `findListingByName(name)` — three-strategy fuzzy match: (1) extract `\bBH[-\s]?[A-Z0-9-]+\b` from input and try exact + progressive prefix/contains comparisons against all nicknames; (2) exact title match; (3) substring — catalog title inside input (≥12 chars minimum).
  - `buildingFromListingName(name)` — shortcut returning the canonical building code directly.
  - `canonicalBuildingFromTag(tag)` — translates `BH-ONEKAT → BH-OK` (the only remap); everything else passes through as-is.
  - `getCanonicalBuilding(listing)` — sugar for the above applied to `listing.building_tag`.

#### `src/lib/rules/aggregators/beithady-booking.ts`
- `classifyBuilding(code)` now consults `getListingByNickname(code)` FIRST. If the code matches a catalog row, returns `getCanonicalBuilding(listing)` — which handles all the new buckets (DXB, BH-GOUNA, BH-NEWCAI) plus the BH-ONEKAT → BH-OK remap.
- Legacy prefix rules remain as FALLBACK for any future listings added to the rules engine before they're added to the catalog. So the system fails-open: new bookings still classify, they just might go through the fuzzy prefix path until the catalog is updated.
- `BEITHADY_BUILDINGS` registry got three new entries (`BH-GOUNA`, `BH-NEWCAI`, `DXB`) with descriptions. Existing entries gained descriptions too (rendered in the Booking rule's trophy card + building hint).

#### `src/lib/rules/aggregators/beithady-{payout,review,inquiry,request}.ts`
Each of the four aggregators has a `buildingFromListing(listing_name)` / `buildingFromLineItem(li)` helper used to bucket emails without a clean BH-code. All four now:
1. Try `buildingFromListingName(name)` first (catalog match).
2. Fall back to regex extraction + `classifyBuilding`.
3. Fall back to the existing name-cue heuristic (`ednc`/`new cairo`/`kattameya` → BH-OK; `heliopolis`/`merghany` → BH-MG).

### Verification
- `rm -rf .next && npm run build` clean, TS 12.4s, 14 routes.
- commit 6aee045 on main via `git push origin HEAD:main`.
- Pulled into `C:\kareemhady`, `vercel --prod --yes` → `kareemhady-48taxnpmc-lime-investments.vercel.app` (Ready, 53s).

### Expected impact on real data
Previously, any Airbnb listing title that didn't include a BH-code (e.g. Gouna listings, Dubai listings, the BH-ONEKAT compound units where the title is just "Luxurious 3 Bedroom in Katameya") would bucket into **UNKNOWN** or fall into the wrong name-cue branch. With the catalog wired in:
- Gouna titles (Mangroovy / AbuTig / WaterSide) now bucket as **BH-GOUNA**
- Dubai titles (Burj Dubai / Dubai Mall / Marina) now bucket as **DXB**
- "Stunning Gated 2 BR-Mins To AUC" (BH-NEWCAI-4021) no longer accidentally matches the "new cairo" cue → BH-OK; now correctly **BH-NEWCAI**
- BH-ONEKAT units with generic titles now correctly route to **BH-OK** via the nickname prefix match

The Beithady-dashboard by-building tables should show these new rows next time the rules run. Historical rule_runs still render their stored bucket labels (the UI re-applies `classifyBuilding` render-time for the booking rule — Phase 5.6 behavior — so the bookings rule auto-reclassifies without a re-run; the other four rules need a re-run to pick up the new classification).

### How to update the catalog going forward
When listings change:
1. Paste the new rows into the `RAW` array in `src/lib/rules/beithady-listings.ts`, keeping the tuple format.
2. Update the header-comment import date.
3. Commit + deploy — no DB migration needed.

### What's NOT wired in yet (possible follow-ups)
- **Guesty listing-ID matching on Stripe transactions** — Stripe API transactions carry `customer` / `charge` metadata; if Guesty ever surfaces the Guesty listing id inside charge metadata, `getListingByGuestyId` would let us pin each Stripe txn to a specific unit (not just a building). Currently the Stripe cross-match uses the bookings rule's `booking_id` only.
- **Unit-type-aware rendering** — we now know if a listing is SINGLE-UNIT / MULTI-UNIT / SUB-UNIT. MULTI-UNIT masters have several SUB-UNIT children (e.g. BH73-3BR-SB-1 → BH73-3BR-SB-1-001/101/201/301/401). UI doesn't show this hierarchy yet; would be useful in the Bookings rule's listing table.
- **Admin page showing the catalog** — no UI surfaces the catalog itself. Could add `/admin/beithady-listings` that renders the table. Skipped this turn — user asked for "save for further match," not a dashboard.

## ✅ PHASE 5.8 FOLLOW-UP SHIPPED — cross-match payouts against Beithady Bookings (commit e93f8c2)

### User request
> "follow-up cross match"

Closes the reconciliation loop: Airbnb payout line items AND Stripe API transactions both now join against the latest Beithady Bookings rule run so the UI shows Guesty's canonical `building_code` + expected `total_payout` next to each paid row. Fully render-time / server-side; no new stored fields.

### Key insight used
Guesty's `booking_id` field in the Beithady Bookings rule's output IS the Airbnb HM-xxxxxxxx confirmation code (verified against the existing reconciliation logic in `beithady-booking.ts:545-552` which builds `guestyCodes` from `booking_id` and intersects with Airbnb `confirmation_code`s). So a single map keyed by uppercase confirmation code handles both the Airbnb email leg and the Stripe API leg.

### Files (single-file diff)

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
**Server component** — after the normal rule/runs fetch, when `isPayout`, do a small sequential lookup:
1. Query `rules` by `domain=beithady`, filter JS-side for `actions.type === 'beithady_booking_aggregate'`.
2. If found, query `rule_runs` for the latest `status=succeeded` row, pull `output.bookings[]`.
3. Pass as `crossMatchBookings` (array) + `crossMatchRunAt` (ISO) to `BeithadyPayoutView`.

If no bookings rule exists OR no successful runs yet → empty array, UI gracefully falls back to "—" in match columns. No errors, no warnings.

**BeithadyPayoutView** — builds two maps ONCE at render:
- `bookingsByCode: Map<string (upper-cased confirmation), CrossMatchBooking>` — primary lookup
- `bookingsByGuest: Map<string (lowercased guest name), CrossMatchBooking[]>` — fallback only when exactly one booking shares a name (list.length === 1). Prevents ambiguous joins when a guest booked twice under different codes.

Exposes a single `lookupBooking(code, guestName) → CrossMatchBooking | null` helper typed `BookingLookup` and threads it down.

**Airbnb line items table** — two new columns between "Bldg" and "Stay":
- **Matched Bldg** — Guesty's canonical `building_code` (emerald, semibold) when matched, else `—`. More accurate than the existing "Bldg" column which is regex-derived from the Airbnb listing name (often `UNKNOWN` when the listing doesn't carry a BH-code).
- **Expected (USD)** — Guesty's stored `total_payout` for the matched booking. Compared against the line item's `amount` (non-refund only); if `|Δ| > $1`, shows a `↑` (overpaid vs expected) or `↓` (underpaid) arrow with the Δ on hover. Subtle way to surface payout drift.

**StripeApiBreakdownSection** — accepts `lookupBooking` + `crossMatchCount` props. Same two new columns in the per-payout transaction table. Guest column also gets a small green `✓` next to the name when matched (title tooltip shows channel + listing_code for the matched booking).

**Match-rate banner** — computed pre-render by iterating all txns once:
- If `crossMatchCount > 0` AND `totalTxns > 0`: show `GitCompare` icon + "Cross-matched X of Y Stripe transactions to a Guesty booking" in an emerald card when `matchedTxns > 0`, amber card when 0.
- When matchedTxns === 0, the banner asks the user to share a sample Stripe charge's metadata keys so the extractor (currently checks `guest_name`/`guestName`/`guest`/`reservation_guest`) can be tuned to Guesty's actual schema.

### Verification
- `rm -rf .next && npm run build` clean, TS 10.0s, 14 routes.
- commit e93f8c2 on main via `git push origin HEAD:main`.
- Pulled into `C:\kareemhady`, `vercel --prod --yes` → `kareemhady-e1xjoi2w8-lime-investments.vercel.app` (Ready, 49s build).

### Design choices worth remembering
- **Render-time join, not aggregate-time** — bookings might update between payout runs. Rather than baking a snapshot into each payout run's output (which would go stale), the detail page does a fresh `rule_runs` lookup every time it's rendered. One extra Supabase query per page view; negligible.
- **Exact match on booking_id, guest-name only as fallback** — guest names can collide. The fallback only fires when (a) no confirmation code extracted AND (b) exactly one booking has that guest name. Keeps the UI honest about what was "matched" vs guessed.
- **No schema changes** — `BeithadyPayoutAggregate` is untouched. This was a UI-only enhancement. Older `rule_runs` render correctly (match columns just show `—`) because the lookup key reads from live DB, not the stored output.
- **Payout Δ indicator** — shows up only when difference > $1 and only on non-refund rows. Small affordance for spotting when Airbnb paid out a different amount than Guesty expected (possible causes: currency FX drift, late refund, host service fee change). Doesn't hard-flag — just shows the arrow + value on hover.

### Guest-name extractor status (to re-check after a real run)
The `extractGuestFromTxn` helper in `StripeApiBreakdownSection` checks these metadata keys: `guest_name`, `guestName`, `guest`, `reservation_guest`. Plus a regex fallback on description (`/(?:guest|for)\s+([A-Z][a-zA-Z'\`\- ]{1,40})/`). After the user runs the Payouts rule next time, if the match-rate banner shows "0 of N Stripe transactions matched" with a non-empty bookings list, the keys list needs tuning. User has agreed to share a sample charge's metadata when that happens.

### Next / queue
- Still waiting on a real-data run to validate the match rate. User said they'd share sample Stripe charge metadata if the extractor needs tuning.
- Still unstarted: user-side Vercel orphan cleanup (4 random-name projects — `vigorous-almeida-bec425`, `peaceful-moser-39791b`, `exciting-ride-1a2629`, `gifted-mcclintock`).

## ✅ PHASE 5.8 SHIPPED — Stripe API reconciliation on Beithady Payouts (commit 8568d40)

### User request
> "complete phase 5.8"

Unblocked: `STRIPE_SECRET_KEY` was already set (local .env.local + Vercel production, 8h old at the start of this turn). Extended the existing Beithady Payouts rule with live Stripe API drill-down so email-parsed payouts can be reconciled against API-visible payouts, and each payout's component transactions are itemized.

### Files

#### `src/lib/stripe.ts` (new, 11 lines)
Lazy singleton client reading `STRIPE_SECRET_KEY`. Throws `STRIPE_SECRET_KEY not set` if called without the env var.

#### `src/lib/stripe-payouts.ts` (new, 254 lines)
- Types: `StripeTransactionDetail`, `StripeApiPayoutDetail`, `StripeApiBreakdown`.
- `listPayoutsInRange(client, fromTs, toTs)` — auto-paginates `stripe.payouts.list({ created: { gte, lte } })`, capped at **MAX_PAYOUTS = 100** per run.
- `listTransactionsForPayout(client, payoutId)` — auto-paginates `stripe.balanceTransactions.list({ payout, expand: ['data.source'] })`, capped at **MAX_TXNS_PER_PAYOUT = 200**. The `expand: ['data.source']` is critical: it inlines the underlying Charge/Refund object so we don't need a second round-trip per txn.
- `extractTxnDetail(txn)` resolves per-type:
  - `charge` → description, statement_descriptor, receipt_email, customer_id, metadata. `source_amount`/`source_currency` populated when the charge currency differs from the settlement (txn) currency — so USD/EUR OTA charges show alongside AED settlement.
  - `refund` → charge_id, reason, metadata.
  - `payout` type transactions are filtered out upstream in `fetchStripePayoutBreakdown` — they're the payout's own debit leg, not a component.
- `fetchStripePayoutBreakdown(fromIso, toIso)`:
  - Wraps the Stripe client initializer in try/catch so a missing key returns `{ error: 'STRIPE_SECRET_KEY not set', api_payouts: [], ... }` rather than throwing and failing the whole rule_run.
  - Wraps `listPayoutsInRange` in try/catch too — network / auth / scope errors are surfaced as `.error` on the breakdown.
  - Per-payout txn fetch failures are swallowed so one payout's failure doesn't kill the others; the payout still shows with its header but empty txns.
  - Fee amount sum uses each BalanceTransaction's embedded `fee` field (Stripe fees are per-txn, not a separate `payout_fee` BT type — had to remove a first-draft filter that used a non-existent `payout_fee` type).

#### `src/lib/rules/aggregators/beithady-payout.ts`
- `BeithadyPayoutAggregate` extended with Phase 5.8 fields: `stripe_api`, `stripe_api_total_aed`, `reconcile_matched`, `reconcile_api_only`, `reconcile_email_only`, `stripe_api_charge_count`, `stripe_api_refund_count`, `stripe_api_guest_names`.
- `aggregateBeithadyPayouts` now takes a third optional arg `stripeApi: StripeApiBreakdown | null = null`. Reconciles payout_ids between the email-parsed Stripe payouts and the API set, counts charges/refunds across all API txns, and flags how many had a guest name extractable from `metadata.guest_name` / `metadata.guestName` / description patterns (`/guest|reservation|booking/i`).

#### `src/lib/rules/engine.ts`
- `evaluatePayoutRule` runs `fetchStripePayoutBreakdown(fromIso, toIso)` **in the same Promise.all** as the Airbnb + Stripe email body fetches (parallel API + Gmail). Passes the breakdown to `aggregateBeithadyPayouts` as the third arg. Re-running always triggers a fresh API pull.

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
- Added `<StripeApiBreakdownSection out={out} />` at the end of `BeithadyPayoutView`.
- New `StripeApiBreakdownSection` component:
  - Three states: no `stripe_api` (old rule_run — pre-5.8 data), `stripe_api.error` (red banner with error message + likely-cause troubleshooting for key/scope/network), or normal breakdown.
  - 4 Stat cards: API total AED, Matched, API-only, Email-only. `reconcile_api_only`/`reconcile_email_only` tinted amber/indigo when non-zero.
  - Green confirmation banner when any txns have guest names extracted.
  - Per-payout cards (sorted newest-first by `created_iso`) with header: payout_id monospace, status chip, method, created + arrival + destination bank/last4. Right-aligned: big AED amount + txn count + net components + fees.
  - Expanded txn table per payout (capped at 100 rows in UI, truncation note shown): time, type chip (emerald/rose/amber/slate by type), AED amount, source amount+currency when different, extracted guest name, detected confirmation code (HM-xxxx or BH-xxxx regex match against description+metadata), description (truncated, title-attr on hover).
- Helpers `extractGuestFromTxn` and `extractConfirmationCodeFromTxn` live in-file, used only by this section.

### Verification
- `rm -rf .next && npm run build` passed on first attempt after fixing the `payout_fee` type-check error (replaced with per-txn fee summation).
- `git push origin HEAD:main` → commit 8568d40.
- Pulled into `C:\kareemhady`, `npm install` (installs stripe@22.0.2 in root too), then `vercel --prod --yes` → `kareemhady-hr865kerg-lime-investments.vercel.app` (Ready, 50s build).

### Design choices worth remembering
- **API + email both kept** — we don't remove the email-parsed `stripe_payouts` section. Email arrives in near-realtime; API requires the key. Showing both lets the user cross-verify. Matched/api-only/email-only surfaces drift (email missing = Stripe sent it but Gmail lost it; api-only = email hasn't arrived yet).
- **One round-trip per payout via `expand: ['data.source']`** — if we naively called `charges.retrieve(charge_id)` for every balance transaction, a YTD run with 100 payouts × 10 txns each = 1000 extra API calls. The expand option keeps it at ~101 calls total (1 list + 100 per-payout lists with inlined charges).
- **Non-fatal Stripe failure** — if the key is wrong or network is down, the rule_run still succeeds with email-only data and the UI shows a red banner explaining why API data is missing. Avoids "the whole run failed" when Stripe has a blip.
- **Guest name extraction is heuristic** — Guesty's metadata schema isn't guaranteed to use `guest_name` / `guestName`. We check both + a generic "guest|for X" regex on description. If Guesty uses a different key in practice, we'll see `0 of N guest names extracted` in the green banner and can tune the key list.
- **No confirmation-code cross-reference yet against the Beithady Bookings rule** — I capture confirmation codes per-txn when present (HMxxxxxxxx / BH-xxx patterns) but don't yet join them against `latest rule_run.output.bookings[].booking_id`. That's the next step if the user asks for it after seeing real API data.

### Cost sanity check
Stripe API: 1 list-payouts call + ~100 list-txns calls per YTD run = ~101 calls. Free tier covers this trivially. No per-call cost.

### What would still be nice but isn't done
1. **Cross-match confirmation_code against Beithady Bookings rule** — at render time, look up the latest `beithady_booking_aggregate` rule_run for the same time range; for each Stripe txn where we extracted an HM-code, display the matching booking's building_code + expected payout next to it. Would close the full reconciliation loop (Stripe charge → Guesty booking → Airbnb payout line item).
2. **Store API response smaller** — current payloads put the full per-txn rows into `rule_runs.output` (JSONB). For YTD with 100 payouts × 10 txns, that's a few MB. Fine for now but could be moved to a separate `stripe_api_snapshots` table if it grows.
3. **Webhook instead of polling** — Stripe can POST payout.created / payout.updated to a webhook endpoint so we never miss one and don't need to poll YTD. Bigger lift, skipped for v1.

### Remaining queue
- **All three Beithady Phase-5-series rules now live** (Reviews / Inquiries / Guest Requests) + Stripe reconciliation layered onto the existing Payouts rule. No other queued phases from the user's explicit asks.
- **Vercel orphan-project cleanup** still pending user action — user said they'd handle deletes manually via UI; I offered to unlink the worktree's `.vercel/project.json` but haven't yet since no confirmation.

## ✅ PHASE 5.11 SHIPPED — Beithady guest requests rule (in-stay messages) + per-reservation threads (commit 77ccff3)

### User request
> "phase 5.11"

Completes the three-rule Beithady arc: Reviews (5.9) + Inquiries (5.10) + Guest Requests (5.11). Sample email reviewed in the original turn: subject `RE: Reservation for Luxury 2 Bedroom Residence by Beit Hady, Apr 24 – 29`, from "service via Guesty" to `guesty@beithady.com`, body shows Adel (Booker) sending "Image sent" and Arabic text `لما بحاول اقدم الطلب بيقولي no refund` ("when I try to submit the request, it tells me no refund"), listing card with Luxury 2BR, check-in Friday Apr 24 3PM, checkout Wed Apr 29 11AM, 2 adults 2 children.

### New action type: `beithady_requests_aggregate`

Single Gmail search. Engine branches early via `evaluateRequestsRule`.

### Files

#### `src/lib/rules/aggregators/beithady-request.ts` (new, 444 lines)
- Types: `ParsedGuestMessage`, `RequestCategory` (7-way), `RequestUrgency` (immediate/high/normal), `RequestClassification`, `StoredMessage`, `RequestReservationGroup`, `BeithadyRequestAggregate`.
- `parseGuestMessage` — Haiku tool_choice **auto**. Subject `RE: Reservation for <Listing>, <Dates>`. Extracts guest name (the Booker in the topmost bubble), listing, check-in/out dates, party size, `message_text` verbatim (preserves Arabic — NO translation at parse time), `has_image` flag, `message_count_in_thread` (capped at 20). Drops outbound alteration proposals, cancellations, booking confirmations with no guest body.
- `classifyMessage` — second Haiku call, tool_choice=**tool**. Category: `date_change` / `amenity_request` / `immediate_complaint` / `refund_dispute` / `check_in_help` / `general_question` / `other`. Urgency: `immediate` (hours — no hot water, can't enter, arriving today, refund dispute escalating) / `high` (today but not next hour) / `normal`. Summary is 1-2 sentences in **English** (translates from Arabic). `suggested_action` is one imperative concrete step (e.g. "Dispatch maintenance to unit to check AC within 1 hour" or "Open a date-change proposal in Airbnb for Apr 26-30 and message guest to confirm").
- `aggregateBeithadyRequests`: parse+settle, classify+settle separately. Groups messages by `normalizeSubject(subject)` — strip `RE:` / `Fwd:` prefixes (repeatable with `+` regex so `Re: Re: foo` → `foo`), lowercased. Group preserves max_urgency (using URGENCY_RANK), has_immediate_complaint bool, all categories union, latest_summary + latest_suggested_action from newest message.
- `by_reservation` sort: immediate-complaint first → max_urgency desc → most-recent desc.

#### `src/lib/rules/engine.ts`
- Added `'beithady_requests_aggregate'` to `RuleAction['type']`.
- Early branch after inquiries branch.
- New `evaluateRequestsRule` — `subjectContains: 'Reservation'` + `toContains: 'guesty@beithady.com'`. Standard rule_run + mark-as-read flow.

#### `src/app/admin/rules/_form.tsx`
- New action-type option "Beithady guest requests aggregate (Airbnb)".

#### `src/app/emails/[domain]/page.tsx`
- Sixth icon/tint branch: `LifeBuoy` (orange) for requests.
- `BeithadyRequestMini` — 4 mini-stats: Messages / Reservations / Immediate / Emails.

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
- New `isRequests` check. View branch order: requests → inquiries → reviews → payouts → bookings → shopify.
- Run-history "Messages" column (from `total_messages`).
- New `BeithadyRequestView` — orange/rose/amber gradient hero (4 HeroStat: Messages / Active reservations / Immediate / Currently in-stay) + red Immediate pill when non-zero + by-category stat grid with **per-category icons** (CalendarRange for date_change, Wrench for amenity, Siren for immediate_complaint, Banknote for refund_dispute, DoorOpen for check_in_help) + **reservation-thread cards** (one per reservation group, sorted immediate-first).
- Thread card design: colored border when immediate-complaint (rose) or in-stay (orange-tinted); header has guest, `StayPhaseBadge` (pre_arrival / in_stay / post_stay / unknown — computed at render from check-in/out vs now), `UrgencyBadge`, immediate-complaint siren badge, building chip, msg count, listing + stay dates, category chip row; latest summary callout (slate); latest suggested-action callout (emerald with Lightbulb icon); then **per-message timeline** sorted newest-first with time, category chip, urgency badge, image indicator, thread-bubble count, Haiku summary, verbatim message quote (with `whitespace-pre-wrap` for Arabic / multi-line preservation), per-message suggested_action.
- Helpers: `REQUEST_CATEGORY_LABEL`, `REQUEST_CATEGORY_TINT`, `REQUEST_CATEGORY_ICON` maps; `stayPhaseOf(ci, co)` computed at render time so phase stays current between runs; `StayPhaseBadge` + `UrgencyBadge` components.

### DB
Seeded row id `19e5a773-b3a3-46be-8aa9-92cb6397548f`:
- name: "Beithady Guest Requests (Airbnb)"
- account: kareem@limeinc.cc (`e135f97d-429c-4879-ae20-ccfc12a40f53`)
- domain: beithady, priority 130
- actions: `{ type: 'beithady_requests_aggregate', mark_as_read: true }`

### Verification
- Clean `.next/` + `npm run build` (14 routes, TS 9.4s).
- `git push origin HEAD:main` → commit 77ccff3.
- Pulled into `C:\kareemhady`, `vercel --prod --yes` → `kareemhady-3w0eq2f4l-lime-investments.vercel.app` (Ready, 48s build).

### Design choices worth remembering
- **Arabic preservation**: parse prompt explicitly says "preserve Arabic if Arabic" — we keep the verbatim guest text. The classifier's `summary` field translates to English for the dashboard, but the original quote shows in the timeline. `whitespace-pre-wrap` on the blockquote keeps line breaks intact.
- **Per-message vs per-thread view**: one email can contain multiple bubbles (as in the Adel sample). We parse the newest bubble as `message_text` and record thread depth via `message_count_in_thread`. Each EMAIL is one row; each reservation groups 1..N rows. The thread card shows both aggregate info (urgency/phase/categories) at top and the full per-email timeline below.
- **Stay phase at render time**: like the Inquiries SLA countdown, phase is recomputed from check-in/out against `Date.now()` on each page view. A guest checking in tomorrow becomes `in_stay` the day after the run without needing a re-run.

### Cost sanity check
Each reservation-message email: 2 Haiku calls (parse ~1200 tokens, classify ~500 tokens). In-stay messages are medium volume (~100-200/year expected). YTD run well under $0.50.

### Beithady arc complete
All three asks from the original turn shipped in sequence:
- **5.9 Reviews** — avg rating, 1-5 histogram, best/worst building, flagged-review action plans with suggested reply + internal action.
- **5.10 Inquiries** — summarize + combine by guest + urgency (SLA-based) + category buckets with 24h countdown.
- **5.11 Guest Requests** — combine by reservation + date_change / amenity_request / immediate_complaint segregation with per-message suggested actions.

### Remaining queue
- **Phase 5.8 — Stripe API reconciliation** still blocked on user setting `STRIPE_SECRET_KEY`. When user returns to this, I'll resume from the Phase 5.8 plan: `npm i stripe`, add `src/lib/stripe.ts`, extend `evaluatePayoutRule` to list payouts via API + drill into balance transactions + cross-reference with Beithady Bookings confirmation_codes.

## ✅ PHASE 5.10 SHIPPED — Beithady inquiries rule (Airbnb) + SLA countdown + per-guest rollup (commit c83a489)

### User request
> "start Phase 5.10"

Continuation of the "do one by one" track — Reviews (5.9) shipped last turn, Inquiries this turn.

### New action type: `beithady_inquiries_aggregate`

Single Gmail search (conditions field is ignored, note field documents that). Engine branches early via `evaluateInquiriesRule` following the same shape as `evaluateReviewsRule`.

### Files

#### `src/lib/rules/aggregators/beithady-inquiry.ts` (new, 365 lines)
- Types: `ParsedAirbnbInquiry`, `InquiryCategory` (7-way enum), `InquiryClassification`, `InquiryGuestGroup`, `StoredInquiry`, `BeithadyInquiryAggregate`.
- `parseAirbnbInquiry` — Haiku tool_choice **auto** (non-inquiry emails dropped). Subject pattern `"Inquiry for <Listing> for <Date range>"`. Extracts guest_name, guest_question verbatim when embedded (null when just "wants to book"), listing, stay dates, party size (adults/children/infants).
- `classifyInquiry` — second Haiku call, tool_choice=**tool**. Outputs: category (`location_info` / `amenity` / `pricing` / `booking_logistics` / `availability` / `group_question` / `other`), 12-words-max summary, `needs_manual_attention` bool (true for discount requests / pet permits / policy exceptions; false for listing-lookup questions).
- `aggregateBeithadyInquiries`: parse+settle, classify+settle separately (one failing classify doesn't drop the parsed row). Builds by-category, by-building, by-guest maps. Guest-group sort: manual-attention first → inquiry count desc → most-recent desc.

#### `src/lib/rules/engine.ts`
- Added `'beithady_inquiries_aggregate'` to `RuleAction['type']` union.
- Early branch after reviews branch.
- New `evaluateInquiriesRule` at end — `subjectContains: 'Inquiry'` + `toContains: 'guesty@beithady.com'`. Standard rule_run open → fetch bodies → aggregate → mark-as-read.

#### `src/app/admin/rules/_form.tsx`
- New action-type option "Beithady inquiries aggregate (Airbnb)".

#### `src/app/emails/[domain]/page.tsx`
- Fifth icon/tint branch: `MessageCircleQuestion` (sky) for inquiries.
- New `BeithadyInquiryMini` — 4 mini-stats: Inquiries / Unique guests / Needs attention / Emails.

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
- New `isInquiries` check. View branch order: inquiries → reviews → payouts → bookings → shopify.
- Run-history "Inquiries" column (counts from `total_inquiries`).
- New `BeithadyInquiryView` — sky/indigo hero (4 HeroStat: Total / Unique guests / Overdue (>24h) / Needs manual decision) + overdue/urgent pill row under hero + by-category stat grid (tint per category) + by-building table + combined-by-guest table + **SLA-sorted inquiry cards** (per-email cards with guest header, category chip, manual-decision badge, building chip, listing/stay/party, received timestamp, SLA badge, Haiku summary, verbatim question blockquote when embedded).
- Helpers: `INQUIRY_CATEGORY_LABEL` + `INQUIRY_CATEGORY_TINT` maps; `inquirySlaState(iso)` computes 24h countdown at render time (overdue / urgent (<6h) / soon (<12h) / fresh / unknown); `SlaBadge` component renders the state with Timer/AlertTriangle icon.

### DB
Seeded row id `cddbd313-fe41-40b4-9ecc-0a3c02b1e048`:
- name: "Beithady Inquiries (Airbnb)"
- account: kareem@limeinc.cc (`e135f97d-429c-4879-ae20-ccfc12a40f53`)
- domain: beithady, priority 125 (between reviews 120 and future requests)
- actions: `{ type: 'beithady_inquiries_aggregate', mark_as_read: true }`

### Verification
- Clean `.next/` + `npm run build` (14 routes, TS 9.5s).
- `git push origin HEAD:main` → commit c83a489.
- Pulled into `C:\kareemhady`, `vercel --prod --yes` → `kareemhady-9b0zni3aq-lime-investments.vercel.app`.

### Design choice worth remembering
SLA countdown is computed at **render time** (UI compares `received_iso` to `Date.now()`), not stored in the aggregate. Stays current between runs — viewing dashboard 4h after last run shows the correct reduced remaining time. Hero's overdue_count also re-derived at render, minor extra CPU for always-fresh numbers.

### Cost sanity check
Each inquiry: 2 Haiku calls (parse ~900 tokens, classify ~400 tokens). Volume is lower than reviews (~50/year expected). YTD run well under $0.10.

### Next
- **Phase 5.11 — `beithady_requests_aggregate`**: last of the three in user's original ask. In-stay guest requests from `RE: Reservation for...` threads. Segregate date-change / amenity-during-stay / immediate-complaint. Should cross-reference confirmation_code against Beithady Bookings rule for stay status (pre-arrival / checked-in / departed).
- **Phase 5.8 — Stripe API reconciliation** still queued (blocked on `STRIPE_SECRET_KEY`).

### Vercel project cleanup discussion (side thread this turn)
User asked about the 8 projects showing in Vercel overview. Mapped them:
- `kareemhady` = this InboxOps app (Personal)
- `fmplus-beta` = FM+
- `voltauto-pricing` + `voltdrive-brand` = Volt (two separate apps)
- `peaceful-moser-39791b`, `exciting-ride-1a2629`, `gifted-mcclintock`, `vigorous-almeida-bec425` = orphan random-name projects, likely v0 scratch deploys
- **`vigorous-almeida-bec425`** was the worktree's linked project — my first `vercel --prod` in Phase 5.9 went there by mistake before I realized and redeployed from root. User said they'd handle cleanup manually via Vercel UI; I offered to unlink worktree's `.vercel/project.json` but user hasn't said yes yet.

## ✅ PHASE 5.9 SHIPPED — Beithady reviews rule (Airbnb) + flagged-review action plans (commit 7907bdf)

### User request
> "do one by one"

After I proposed splitting the Reviews / Inquiries / Guest Requests asks into sequential phases (see scoping turn below), the user said do them one at a time. Shipped Phase 5.9 (Reviews) this turn.

### New action type: `beithady_reviews_aggregate`

Uses a single fixed Gmail search (conditions ignored, note field documents that). Engine branches early via `evaluateReviewsRule(...)` following the same shape as `evaluatePayoutRule`.

### Files

#### `src/lib/rules/aggregators/beithady-review.ts` (new, 399 lines)
- Types: `ParsedAirbnbReview`, `ReviewActionPlan`, `ReviewBuildingBucket`, `ReviewMonthBucket`, `FlaggedReview`, `BeithadyReviewAggregate`.
- `parseAirbnbReview` — Haiku tool_choice **auto** (non-review Airbnb mail like "Review your upcoming stay" or host-side "Time to review X" is silently dropped). Prompt documents the subject pattern `"<Guest> left a <N>-star review!"`, explains that email body usually does NOT contain the actual review text (guest has 48h to finalize), so `review_text` is typically null — this is expected, not a parse failure.
- `suggestActionPlan` — second Haiku call, tool_choice=**tool** (must return). Runs only for ratings < 3. Output shape: category (cleanliness/noise/staff/amenities/check_in/location/value/communication/other), priority (high/medium/low), root_cause, suggested_response (2-3 sentences, empathetic, no boilerplate), internal_action (one concrete operational step).
- `aggregateBeithadyReviews`:
  - Parse + settle all reviews, count parse_errors separately
  - Histogram across 1-5
  - By-building via `classifyBuilding` — Airbnb listing names rarely carry BH-codes, so the `buildingFromListing` helper also does name-cue matching ("ednc"/"new cairo"/"kattameya" → BH-OK; "heliopolis"/"merghany" → BH-MG). Otherwise `UNKNOWN`.
  - Best/worst require ≥2 reviews per building to qualify (single 5-star would trivially "win" otherwise).
  - Action plans generated in parallel via `Promise.allSettled` only for flagged reviews.

#### `src/lib/rules/engine.ts`
- Added `'beithady_reviews_aggregate'` to the `RuleAction['type']` union.
- Early branch after account validation.
- New `evaluateReviewsRule` at end of file — standard pattern: search → open rule_run → fetch full bodies → aggregate → mark-as-read → close run. Single search, no multi-source complexity like payouts.

#### `src/app/admin/rules/_form.tsx`
- New action-type option "Beithady reviews aggregate (Airbnb)".
- Currency hint updated ("ignored for Beithady reviews").

#### `src/app/emails/[domain]/page.tsx`
- Card icon/tint branches four ways now: Star (amber) for reviews, Banknote (emerald) for payouts, BedDouble (rose) for bookings, ShoppingBag (violet) for Shopify.
- New `BeithadyReviewMini` — 4 mini-stats: Reviews / Avg rating ⭐ / Flagged <3 / 5-star.

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
- New `isReviews` check. Detail view branch order: reviews → payouts → bookings → shopify.
- Run-history table: extra branch for `isReviews` ("Reviews" column showing `total_reviews`).
- New `BeithadyReviewView` component — amber/rose gradient hero (4 HeroStat: Total / Avg / Flagged / 5-star) + rating distribution bars (1-5, emerald for 5-star, rose for 1-2, amber otherwise) + best/worst building cards (emerald and rose tinted) + By-building table + By-month trend + **Flagged reviews cards** (one per flagged review with guest name, star row, priority badge, listing/stay, optional review text, category chip, root cause, suggested public reply in emerald callout, internal action in indigo callout) + All-reviews compact table.
- New `StarRow` helper renders filled/empty star icons for a rating.

### DB
Seeded row id `777647f1-8528-40b2-9b7d-61cbfbaf729b`:
- name: "Beithady Reviews (Airbnb)"
- account: kareem@limeinc.cc (`e135f97d-429c-4879-ae20-ccfc12a40f53`)
- domain: beithady, priority 120
- conditions: `{ note: "conditions are ignored for beithady_reviews_aggregate..." }`
- actions: `{ type: 'beithady_reviews_aggregate', mark_as_read: true }` — no currency (reviews aren't monetary).

### Verification
- Clean `.next/` + `npm run build` passed (14 routes, TS 10.0s).
- `git push origin HEAD:main` from worktree → commit 7907bdf landed on main.
- Pulled into `C:\kareemhady` root checkout, `vercel --prod --yes` deployed (`dpl_Bv2puBeQrmzpLonLagLyfQoHHWZX`).

### Gotcha worth remembering
Worktree `.vercel/project.json` links to a DIFFERENT Vercel project (`vigorous-almeida-bec425`) than the one backing `kareemhady.vercel.app` (`kareemhady`). Always run `vercel --prod` from `C:\kareemhady` after pushing, not from the worktree. My first `vercel --prod` run from here deployed to the wrong project; the real deploy happened after pulling into `C:\kareemhady`.

### Cost sanity check
Each review email: 1 Haiku call (~800 tokens out). Each flagged review: 1 additional Haiku call (~700 tokens out). At 100 reviews/year with 10% flagged, that's ~100 parse calls + 10 action-plan calls per run = well under $0.20 total even on YTD runs. No budget concern.

### Next phases (queued, user said "one by one")
- **Phase 5.10 — `beithady_inquiries_aggregate`**: guest inquiries with urgency classification + 24h SLA countdown.
- **Phase 5.11 — `beithady_requests_aggregate`**: in-stay guest requests with date-change/amenity/complaint segregation.
- **Phase 5.8 — Stripe API reconciliation** still sitting open (blocked on `STRIPE_SECRET_KEY`). Not pursued this turn since user's "do one by one" implied continuing the new Reviews/Inquiries/Requests track.

## 🗣️ PHASE 5.9–5.11 SCOPING TURN — awaiting user confirmation (no code yet)

### User request (this turn)
> "New Task — New Rule Under Beithady Domain. (1) Reviews – collect Airbnb reviews, segregate by rating level, flag <3, segregate by units, best/worst, suggest action plan for bad reviews. (2) Inquiries – summarize guest inquiries, combine by same guest, flag urgent vs location-info, top-view dashboard. (3) Guest Requests – for reservations: combine by guest/reservation, segregate date-change / amenity / immediate-complaint requests."

Three email samples pasted:
- **Inquiry** — from "service via Guesty" to `guesty@beithady.com`, subject `Inquiry for Luxury 3BR | 24/7 Front Desk & Security for Apr 23 – 27, 2026` ("Respond to Fatema's inquiry", 3 adults 3 children, 24h SLA warning).
- **Review** — from "service via Guesty" to `guesty@beithady.com`, subject `Charlie left a 5-star review!` ("Overall rating: 5 Great", listing "Luxury 3BR - Near EDNC - 247 Front Desk & Security").
- **Guest request (reservation reply)** — subject `RE: Reservation for Luxury 2 Bedroom Residence by Beit Hady, Apr 24 – 29`, booker "Adel" sending Arabic messages ("لما بحاول اقدم الطلب بيقولي no refund"), with the Airbnb reservation card inline.

### My reply to the user (proposal, NOT yet built)
Split into three sequential phases, each following the `beithady_payout_aggregate` pattern (new aggregator file + engine early-branch + action-type union entry + dashboard mini card + dedicated detail view):

1. **Phase 5.9 — `beithady_reviews_aggregate`**
   - Search: `to:guesty@beithady.com subject:"review"` (picks up "left a N-star review" subjects).
   - Haiku parse: rating (1–5), guest name, listing name, review text, stay dates.
   - Aggregate: totals + avg rating + histogram, by-unit buckets via `classifyBuilding(listing_name)`, best/worst buckets, **flag any rating < 3** as `needs_attention`.
   - Action plan: second Haiku call on flagged reviews → suggested response + root-cause category (cleanliness / noise / staff / amenities / location / other).

2. **Phase 5.10 — `beithady_inquiries_aggregate`**
   - Search: `to:guesty@beithady.com subject:"Inquiry for"` (matches "Inquiry for Luxury 3BR...").
   - Haiku parse: guest name, listing, check-in/out range, guest party size, inquiry text (if present in body — the sample only had "What is the name of the compound please?" as guest question).
   - Group by guest name+email; classify urgency (Haiku): `urgent` (trip within 48h / price disputes / booking issues) / `location_info` / `amenity_question` / `pricing` / `other`.
   - Dashboard: top-view table, urgency-sorted, with 24h-SLA countdown per inquiry (since these have the "24 hours to respond" clock).

3. **Phase 5.11 — `beithady_requests_aggregate`**
   - Search: `to:guesty@beithady.com subject:"Reservation for"` (picks up both original reservation emails AND the `RE:` replies with guest messages).
   - Haiku parse: confirmation code, guest name, stay dates, message body (multiple message turns possible in one email — extract newest guest message + context).
   - Combine by confirmation_code so multiple messages from same guest roll up into one row.
   - Haiku classify request type: `date_change` / `amenity_request` / `immediate_complaint` / `refund_dispute` / `other`. Flag `immediate_complaint` as urgent (needs intervention during stay).
   - Cross-reference against Beithady Bookings rule (same confirmation_code key) to show current stay status (checked-in / pre-arrival / departed).

### Two tradeoffs flagged to user
1. **Phase 5.8 (Stripe API reconciliation) is still open in prior handoff** — blocked on `STRIPE_SECRET_KEY`. Asked user: pause 5.8 and ship 5.9–5.11 first, or finish 5.8 first?
2. **All-in-one commit vs one-commit-per-phase**: asked user which they prefer. Recommend one-per-phase since each needs real-email sample validation before moving on.

### What I'm waiting on before writing code
- User's go-ahead on (a) order (5.8 first or 5.9–5.11 first), (b) all three in one commit or phased, (c) any corrections to the search filters / bucket taxonomies / urgency rules above.

### Notes for next session
- No files changed this turn — pure scoping.
- Git status clean, branch `claude/vigorous-almeida-bec425` (worktree `vigorous-almeida-bec425`).
- When user replies, the work will start with Phase 5.9 Reviews unless they redirect. Each aggregator will live under `src/lib/rules/aggregators/` and register its action type in `src/lib/rules/engine.ts` via an `evaluateXRule` early-branch just like `evaluatePayoutRule`.
- Every new rule needs a seeded row in the `rules` table bound to `kareem@limeinc.cc` (account id `e135f97d-429c-4879-ae20-ccfc12a40f53`, domain `beithady`), same as Phase 5.7.

## 🔧 PHASE 5.7.1 HOTFIX — missing Banknote icon import on detail page (commit 9a7742e)

### What happened
User manually "Redeploy"-ed commit 78d1cca (the last handoff-only commit) from the Vercel UI. Build failed:
```
Type error: Cannot find name 'Banknote'.
./src/app/emails/[domain]/[ruleId]/page.tsx:1022:14
```
Vercel's Build Logs truncated after ~30 lines in the screenshot so the TS error wasn't directly visible — I reproduced by pulling main into the root project (`C:\kareemhady`, not the worktree) and running `npm run build`.

### Root cause
When I added `BeithadyPayoutView` in Phase 5.7, I imported `Banknote` into `src/app/emails/[domain]/page.tsx` (for the domain-list card icon) but forgot to add it to the lucide-react import block in `[ruleId]/page.tsx` where I also use it in the payout view's hero row.

### Why my local `npm run build` didn't catch it
The worktree's `.next/` cache from Phase 5.7's successful build masked the missing import. Vercel always builds from a cold cache, so it failed on first compile after commit 6b4c2a9. The user hadn't tried a vercel deploy immediately after 5.7 — they hit it when manually clicking Redeploy.

### Fix
One-line import addition + Vercel redeploy.

### Verification
- Pulled fix into `C:\kareemhady` main checkout, `npm run build` clean (all 14 routes).
- `vercel --prod --yes` successful.

### Lesson carried forward
For large edits that introduce a symbol in one new location: `rm -rf .next && npm run build` locally before pushing — clears the Turbopack persistent cache so I catch import-drift class bugs before they surface on Vercel.

## 🚧 PHASE 5.8 IN PROGRESS — Stripe API reconciliation (blocked on user: STRIPE_SECRET_KEY)

### User request (this turn)
> "I want you to connect to stripe through api to extract Payment Transactions to reconcile with Reservations and Payouts on the same rule, guide me to give you the right api and secrets to access stripe data"

### Guidance given
1. **Use Restricted key, NOT Standard secret** — safer (read-only, scoped). On Stripe's "How will you be using this key?" screen, user picked **Option 1: "Powering an integration you built"** (confirmed by me — Options 2/3 are for third-party SaaS / direct AI-agent MCP, neither applies here since the key sits in Vercel env and is called by our own server code).
2. **Permissions toggled** (all Read, everything else None):
   - Core → Charges
   - Core → PaymentIntents
   - Core → Refunds
   - Core → Customers
   - Balance → Balance transactions
   - Connected accounts and people → Payouts
3. **Do NOT create a new Stripe account** despite Guesty's yellow banner — we want to read from the SAME account Guesty manages so payouts from Booking.com / Expedia / Manual settle into rows we can reconcile. A new account would have no overlap.
4. **Storage path**:
   - `C:\kareemhady\.env.local`: `STRIPE_SECRET_KEY=rk_live_...`
   - Vercel production env: `vercel env add STRIPE_SECRET_KEY production`
   - Then `vercel --prod --yes` to redeploy.

### Blocker hit this turn
User ran `vercel env add STRIPE_SECRET_KEY production` in PowerShell → PSSecurityException: "vercel.ps1 cannot be loaded because running scripts is disabled on this system." Default PowerShell Execution Policy (`Restricted`) blocks npm-installed shims.

Two workarounds given:
- **A**: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` + `Y` to confirm. Then vercel CLI works. (Scoped to user, allows local scripts, keeps remote-script signing requirement.)
- **B**: Skip CLI — add env var via Vercel dashboard at `/settings/environment-variables`, redeploy via Deployments tab.

### What I'll do once user replies "key is set"
1. `npm i stripe`
2. Create `src/lib/stripe.ts` with lazy client initializer reading `STRIPE_SECRET_KEY`.
3. Extend `evaluatePayoutRule` in `src/lib/rules/engine.ts`:
   - After the existing Stripe-email parsing, also call `stripe.payouts.list({ created: { gte: fromTs, lte: toTs }, limit: 100 })` to catch any Stripe payouts that didn't email.
   - For each payout (from either source), call `stripe.balanceTransactions.list({ payout: po_..., limit: 100, expand: ['data.source'] })` → each transaction is a charge/refund/application_fee etc.
   - For `charge` type, resolve the charge → guest metadata (`charges.metadata.guest_name` / `description` / `statement_descriptor`).
4. Extend `aggregateBeithadyPayouts` output with a `stripe_breakdown: Array<{ payout_id, date, amount_aed, transactions: Array<{ type, amount, charge_id?, guest?, description?, metadata? }> }>`.
5. New dashboard section "Stripe payout breakdown" showing per-payout transaction drill-down. Cross-reference with the confirmation_code map from the Beithady Bookings rule (previously-deferred Phase 5.8 reconciliation roadmap).
6. Currency handling: Stripe likely reports transactions in the original currency (USD/EUR for OTAs) + the payout is converted to AED. The balance-transaction `amount` is in settlement (AED) minor units; `source_amount`/`source_currency` when available reflects the original charge.

### Security posture reaffirmed
- Restricted key = read-only. If leaked: attacker can see data, NOT move money.
- Never commit key. Never paste in chat. If suspected leak: Developers → API keys → that row → Roll (revokes instantly).
- Stripe's publishable key from user's screenshot (`pk_live_51RcAec...`) is NOT sensitive (public by design) but I'm not storing or using it — we only need server-side access.

## ✅ PHASE 5.7 SHIPPED — Beithady payouts rule (Airbnb + Stripe) + dashboard (commit 6b4c2a9)

### User request
> Under Domain Beithady — create a rule for Beithady Payouts. Payouts are coming from two: Airbnb & Stripe. Airbnb with the form of attached email — Total Payout + corresponding reservations payouts + deducted refunds. Stripe payouts are some of Manual Payouts and Booking Payouts & Expedia Payouts (some manual payouts also paid in cash at hotels) — reconcile with previous reservations if possible. Suggest suitable indicative dashboard and necessary overlooking details.

Two sample emails provided:
1. **Airbnb payout via Guesty** — from "service via Guesty" to `guesty@beithady.com`, subject "We sent a payout of X د.إ AED". Body has bank IBAN last4, sent/arrival dates, then a list of line items per reservation: guest, Home or "Pass Through Tot", date range, listing name with Airbnb ID, confirmation code (HM...), USD amount.
2. **Stripe payout** — from "'Stripe' via Payments beithady" to `payments@beithady.com`, subject "Your AED12,076.23 payout for Beithady Hospitality is on the way". Body has AED amount, estimated arrival, BANQUE MISR last4, Payout ID `po_...`. No per-booking breakdown in email.

### New action type: `beithady_payout_aggregate`

Uses two fixed Gmail searches (user's rule.conditions are ignored for this action type, documented in a note field in the row). Engine branches early via a new `evaluatePayoutRule(...)` helper rather than shoehorning the two-search flow into the existing single-search pipeline.

### Files

#### `src/lib/rules/aggregators/beithady-payout.ts` (new)
- Types: `ParsedAirbnbPayout`, `AirbnbPayoutLineItem`, `ParsedStripePayout`, `BeithadyPayoutAggregate`, bucket types.
- `parseAirbnbPayout` — Haiku tool_choice=tool. Prompt documents subject shape, body structure, "Pass Through Tot" alternate type, refund detection (negative amounts).
- `parseStripePayout` — Haiku tool_choice=auto. Returns null for non-payout Stripe emails so Stripe password-reset / account-update mails don't pollute the aggregate.
- `aggregateBeithadyPayouts(airbnbBodies, stripeBodies)`:
  - Totals (AED combined, per source, USD from Airbnb line items, refund totals)
  - Unique reservations (dedupe by confirmation_code on non-refund lines)
  - Building attribution: `buildingFromLineItem` regex-matches `\bBH[-\s]?[A-Z0-9]+\b` inside the Airbnb listing name and pipes through `classifyBuilding`. Most Airbnb listings don't embed a BH-code → `UNKNOWN` bucket. Future Phase 5.8 can cross-match via confirmation_code against the Beithady Bookings rule's latest rule_run.
  - By-month bucket keyed on email received date (stacked AED per source)
  - Flat line items array + flat Stripe payouts array for the detail tables

#### `src/lib/rules/engine.ts`
- Added `'beithady_payout_aggregate'` to the `RuleAction['type']` union.
- **Early branch** after account validation: `if (action.type === 'beithady_payout_aggregate') return evaluatePayoutRule(...)`.
- New `evaluatePayoutRule` function at file end — runs two parallel searchMessages calls, opens its own rule_run with `input_email_count = airbnb + stripe`, fetches + aggregates, then marks BOTH batches via `markMessagesAsRead` (batchModify under the hood), stores `marked_read` / `mark_errors` for Airbnb and `marked_read_stripe` / `mark_errors_stripe` for Stripe.
- `mark_error_reason` captures the first error from whichever batch had one.

#### `src/lib/gmail.ts`
- `fetchEmailFull` return type now includes `receivedIso: string | null`, computed from `res.data.internalDate`. This was needed to group payouts into monthly buckets (no existing caller broke — aggregators just ignore the extra field if they don't need it).

#### `src/app/admin/rules/_form.tsx`
- New action-type option "Beithady payout aggregate (Airbnb + Stripe)".
- Currency hint updated ("AED is hardcoded for Beithady payouts").

#### `src/app/emails/[domain]/page.tsx`
- Card icon/tint branches three ways: Banknote (emerald) for payouts, BedDouble (rose) for bookings, ShoppingBag (violet) for Shopify.
- New `BeithadyPayoutMini` function component: 4 mini-stats Total AED / Airbnb AED / Stripe AED / Payout emails.

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
- Run history table: extra branch for `isPayout` to show "Total AED" column with rounded AED.
- New `isPayout` check, new view branch: `isPayout ? <BeithadyPayoutView> : isBeithady ? <BeithadyView> : <ShopifyView>`.
- New `BeithadyPayoutView` component — emerald/indigo gradient hero (4 HeroStat) + Bank destinations cards + stacked source-split bar + stacked monthly chart (`PayoutMonthChart` helper, Airbnb pink over Stripe indigo) + building bucket table + Airbnb payouts header table + Airbnb line items table (with Bldg column via existing classifier) + optional Refunds table (amber) + Stripe payouts table.
- Explicit copy in the source-split hint: "Manual payouts at hotel (cash) don't appear in either email — track those separately."

### DB
Seeded row id `f8eeb1a4-653b-46f4-8c8f-91cc83972a6a`:
- name: "Beithady Payouts (Airbnb + Stripe)"
- account: kareem@limeinc.cc (`e135f97d-429c-4879-ae20-ccfc12a40f53`)
- domain: beithady, priority 110
- conditions: `{ note: "conditions are ignored for beithady_payout_aggregate..." }` — documents why the usual from/subject/to fields are empty.
- actions: `{ type: 'beithady_payout_aggregate', currency: 'AED', mark_as_read: true }`

### Verification
- `npm run build` passes (all 14 routes, TS 11.2s).
- `vercel --prod --yes` successful.

### Reconciliation roadmap (not done this phase)
Airbnb payout line items carry the confirmation_code (HM...) which is the same key as the Beithady Bookings rule's `booking.booking_id`. A future cross-rule reconciliation section could:
1. At render time in the payout view, look up the Beithady Bookings rule's latest successful rule_run output for the same time range.
2. For each line item, find the matching booking → pull its building_code, listing_code (canonical BH), and expected payout.
3. Show "Paid out vs Expected" and "Outstanding bookings (booked but not yet paid out)" tables.

Stripe is harder — emails have no booking info. Reconciliation would need Stripe API access (Payout ID → Balance Transactions → Charges → metadata/guest name) which is outside the current email-only architecture.

### Known caveat (cash-at-hotel manual payouts)
User called out that some manual payouts are paid in cash at the hotel. These never hit Airbnb or Stripe email streams, so they won't appear in this dashboard. The Source Split hint copy flags this explicitly so the user remembers to track them separately.

## ✅ PHASE 5.6 SHIPPED — canonical building classifier (commit 5626464)

### User rules (verbatim)
> Any Unit starting with BH-26 belongs to Building BH-26
> Any Unit starting with BH-435 belongs to Building BH-435
> Any Unit starting BH-(3 Digits)-xx belongs to BH-OK (One Kattameya)

The previous `deriveBuildingCode` simply returned the first dash-separated segment of the listing code (`BH73-3BR-SB-1-201 → BH-73`). That was fine for BH-26 / BH-73 / BH-435 / BH-MG, but any other 3-digit code (BH-101, BH-205, etc.) was becoming its own bucket instead of rolling up to BH-OK.

### Implementation

#### `src/lib/rules/aggregators/beithady-booking.ts`
New exported function applying the rules top-down:
```ts
export function classifyBuilding(listingCode: string): string {
  const code = (listingCode || '').toUpperCase().trim();
  if (!code) return 'UNKNOWN';
  const m = code.match(/^BH-?([A-Z0-9]+)/);
  if (!m) return code;
  const suffix = m[1];
  if (suffix.startsWith('26'))   return 'BH-26';
  if (suffix.startsWith('435'))  return 'BH-435';
  if (/^\d{3}/.test(suffix))     return 'BH-OK';
  return `BH-${suffix}`;
}
```

- Matches both `BH73-…` (emails as we've seen them) and `BH-73-…` (in case future listing codes use the dashed form).
- Order matters: BH-26 and BH-435 are checked BEFORE the generic 3-digit fallback because their suffixes are also (entirely or partly) numeric and would otherwise get pulled into BH-OK.
- `deriveBuildingCode` now delegates to `classifyBuilding`.

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
Imports `classifyBuilding` and applies it on render so **historical rule_runs** (whose stored `building_code` is just the first segment like `BH73`) show the new mapping without requiring a re-run:
- `normalizeBuildingCode(b)` now prefers `b.listing_code` (most faithful to the raw data) and falls back to `b.building_code`.
- Reservations table Bldg column: `normalizeBuildingCode(b)` on each row.
- `BuildingTable`: builds `itemsByCode` by re-classifying every bucket `label` with `classifyBuilding`, AGGREGATING across buckets that now map to the same canonical code. So if a legacy run had separate buckets for `BH101`, `BH102`, and `BH205`, they merge into a single `BH-OK` row with summed reservation_count / nights / total_payout.
- Trophy card "Most reserved building": name + description lookup both go through `classifyBuilding(topBuilding.label)`.

Section hint text updated to document the mapping:
> Mapping: BH-26* → BH-26 · BH-435* → BH-435 · BH-73* → BH-73 · BH-<3 digits>-xx → BH-OK (scattered One Kattameya) · BH-MG → BH-MG (Heliopolis single).

### Verification
- `npm run build` passes.
- `vercel --prod --yes` deployed, alias updated.
- Historical runs immediately render the new classification via the render-time re-map.
- A fresh Run is still recommended so `by_building` bucket keys and `booking.building_code` are persisted under the canonical codes at source.

### Edge cases considered
- `BH-260` → startsWith('26') → BH-26. If the user later has a real BH-260 that should NOT fold into BH-26, we'd need stricter matching (e.g. `/^26(-|$)/`). Flagged here for future if it ever comes up.
- `BH-435A` → startsWith('435') → BH-435. Same caveat.
- Listing codes that aren't `BH*` at all — returned as-is in uppercase (preserves data visibility for debugging weird rows).

## ✅ PHASE 5.5 SHIPPED — Airbnb reconciliation looks in the right mailbox (commit 455b580)

### User correction
Screenshot of the live dashboard showed the reconciliation section reporting "0 Airbnb emails scanned / 0 confirmations parsed" while "19 Guesty (Airbnb) not matched". Second screenshot of an actual Airbnb confirmation email revealed why:

- **Subject**: "Reservation confirmed - Mohamed-Mutasim Mohamed arrives Apr 20"
- **From**: "service via Guesty" (not airbnb.com)
- **To**: `guesty@beithady.com` (not kareem@beithady.com)
- **Body**: standard Airbnb template with "Airbnb Ireland UC, 25 North Wall Quay, Dublin" footer

Airbnb sends confirmations to the Guesty-owned alias `guesty@beithady.com`; Guesty's mail relay then forwards them to the kareem@limeinc.cc mailbox with rewritten From. `from:airbnb.com` never matches.

### Changes

#### `src/lib/rules/engine.ts`
Inside the `beithady_booking_aggregate` search, swapped the filter:
```diff
-  fromContains: 'airbnb.com',
-  subjectContains: 'Reservation confirmed',
+  subjectContains: 'Reservation confirmed',
+  toContains: 'guesty@beithady.com',
```
Subject alone is specific enough (the Guesty NEW BOOKING stream uses a different subject "NEW BOOKING from Airbnb"), but `to:guesty@beithady.com` adds an extra guard against other "Reservation confirmed"-style subjects that might appear from other sources.

#### `src/lib/rules/aggregators/beithady-booking.ts`
Rewrote `AIRBNB_SYSTEM` prompt to match reality:
- Subject pattern: `"Reservation confirmed - <Guest Name> arrives <Date>"`
- From: "service via Guesty" (Airbnb's original From is rewritten by Guesty's relay)
- Footer: "Airbnb Ireland UC, 25 North Wall Quay, Dublin"
- HM-prefixed confirmation code lives in the body / "View details" link area
- Explicitly lists non-confirmation Airbnb emails (alteration, cancellation, review, payout-only) as things to skip

`tool_choice: 'auto'` stays — non-confirmation Airbnb emails now get silently dropped rather than parsed into garbage rows.

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
- Reconciliation section hint updated to say "Airbnb emails (relayed by Guesty to guesty@beithady.com)" — calling out the indirection so the user understands what's being searched.
- Empty-state placeholder now quotes the actual search string: `to:guesty@beithady.com subject:"Reservation confirmed"` (Airbnb confirmations relayed via Guesty).

### Verification
- Build: 14 routes, TS clean.
- Deploy: `vercel --prod --yes` successful, aliased to kareemhady.vercel.app.
- Expected result after next Run: Airbnb confirmations count becomes non-zero; "Guesty (Airbnb) not matched" drops from 19 as Airbnb codes get paired with Guesty booking_ids.

### Semantic reminder for future sessions
**All three Airbnb signals in one mailbox arrive via Guesty's relay, not direct from Airbnb**:
1. Guesty NEW BOOKING from Airbnb → subject "NEW BOOKING from Airbnb", to `kareem@beithady.com`
2. Airbnb Reservation confirmed → subject "Reservation confirmed - ...", to `guesty@beithady.com`
3. Future signal sources (cancellations, alterations) would follow the same pattern — check TO addresses, not FROM domains.

## ✅ PHASE 5.4 SHIPPED — mark-as-read uses batchModify (commit 86f981c)

### User question
User pasted a screenshot of the OAuth consent screen showing the app's two granted blocks:
1. "View your email messages and settings" = `gmail.readonly`
2. "Read, compose, and send emails from your Gmail account" (with bullets including "Create, change, or delete your email labels" and "Move new emails to your inbox, labels, spam, and trash") = `gmail.modify`

User asked: "do they have the mark read rights?"

### Diagnosis
**Permissions were fine.** Google's consent-screen copy for `gmail.modify` misleadingly says "compose and send" but the underlying scope only grants label/metadata modification — which is exactly what `removeLabelIds: ['UNREAD']` needs. Confirmed against recent `rule_runs.output` for the Beithady rule:

| started_at | marked | errors | error_reason |
|---|---|---|---|
| 14:05:39 | 21 | 8 | Too many concurrent requests for user. |
| 14:05:13 | 29 | 33 | Too many concurrent requests for user. |
| 12:38:45 (pre-re-auth) | 0 | 62 | (403 scope — now fixed) |

So the user **had** re-authed kareem@limeinc.cc (the 0/62 run was before that; the recent 21/29 rows prove modify is now working). The residual errors were Gmail rate-limiting, not authz.

### Fix — `src/lib/gmail.ts:markMessagesAsRead`
Rewrote to use `gmail.users.messages.batchModify` which accepts up to 1000 ids in a single request. Chunks to 1000 for safety (per-user runs should be well under this anyway). If a chunk's batchModify itself throws, falls back to **serial** per-id modify for that chunk — preserves the "bad id doesn't kill the whole run" behaviour without reintroducing the parallelism that caused the rate-limit.

Before:
```ts
await Promise.all(messageIds.map(async id => {
  await gmail.users.messages.modify({...});
}));
```

After:
```ts
for (let i = 0; i < messageIds.length; i += 1000) {
  await gmail.users.messages.batchModify({
    userId: 'me',
    requestBody: { ids: chunk, removeLabelIds: ['UNREAD'] },
  });
  // fallback to serial modify on chunk error
}
```

### Unchanged
- Scopes in `SCOPES` (still readonly + modify)
- Callers (engine.ts for both Guesty + Airbnb)
- Persisted shape (`marked_read` / `mark_errors` / `mark_error_reason` / airbnb variants)
- UI banners

### Verification
- `npm run build` passes, 14 routes.
- `vercel --prod --yes` deployed; no `--force` needed.
- Next Beithady run should show `marked_read` = full match count and `mark_errors` = 0 for both Guesty and Airbnb batches.

### One byproduct worth calling out
The new batchModify flow **doesn't distinguish** per-id success/failure in the happy path — `batchModify` is "all or nothing" for the chunk. So `mark_errors` will typically be 0, not "N out of M". Only the fallback serial branch produces per-id errors. For the user-facing banners this is fine: a green count when it works, a red banner with a single sample error message when it doesn't.

## ✅ PHASE 5.3 SHIPPED — Airbnb ↔ Guesty reservation reconciliation (commit d15d741)

### User feedback this turn
> "I want you also to check messages from Airbnb Guesty with Reservation Confirmation and cross reference with the Guesty Messages Confirmation and check for any missing reservations"
> "Also Mark all checked Airbnb Reservation Confirmation as read once cross referenced"

### Design
Beithady rule now does two Gmail searches per run, parses both, cross-references by Airbnb confirmation code (HMxxxxx — same as the `booking_id` Guesty already extracts), and surfaces three reconciliation buckets plus mark-as-read on both sets.

### `src/lib/rules/aggregators/beithady-booking.ts`
- **New types**: `ParsedAirbnbConfirmation`, `ReconciliationMissing`.
- **Output type** extended with: `airbnb_emails_checked`, `airbnb_confirmations_parsed`, `airbnb_parse_errors`, `airbnb_parse_failures[]`, `airbnb_matched_in_guesty`, `missing_from_guesty[]`, `guesty_not_in_airbnb`.
- **New Haiku tool** `extract_airbnb_confirmation` (`tool_choice: 'auto'`, not forced) — so non-confirmation Airbnb emails (inquiries, reviews, payout notices) return no tool_use and get silently dropped rather than erroring.
- **`aggregateBeithadyBookings` signature change**: new third param `airbnbBodies` (defaults to `[]`). Existing callers without reconciliation still work.
- **Reconciliation logic**:
  - Parse all Airbnb bodies with `Promise.allSettled`; dedupe by `confirmation_code`.
  - `guestyCodes = Set(parsed.booking_id.toUpperCase())`, `airbnbCodes = Set(confirmation_code.toUpperCase())`.
  - `missing_from_guesty` = Airbnb parsed rows whose code ∉ guestyCodes (the actionable set: Guesty missed the booking).
  - `airbnb_matched_in_guesty` = count of Airbnb rows whose code ∈ guestyCodes.
  - `guesty_not_in_airbnb` = count of Guesty bookings with `channel ∋ 'airbnb'` whose `booking_id` ∉ airbnbCodes. Useful inverse signal.

### `src/lib/rules/engine.ts`
- Inside the `beithady_booking_aggregate` switch case:
  1. Second `searchMessages` call: `fromContains: 'airbnb.com'`, `subjectContains: 'Reservation confirmed'`, same time range (reuses yearStart clamp and Jan-1 cap).
  2. `fetchEmailFull` each Airbnb match.
  3. `aggregateBeithadyBookings(bodies, currency, airbnbBodies)`.
  4. Stores `airbnbMatchIds` for the mark step.
- Mark-as-read now calls `markMessagesAsRead` twice: once for Guesty ids, once for Airbnb ids. Separate counts persisted as `marked_read` / `mark_errors` (Guesty) and `marked_read_airbnb` / `mark_errors_airbnb` (Airbnb). `mark_error_reason` captures the first error from whichever call had one.
- Empty-state branch (no Guesty matches) now also includes all the reconciliation fields with zero values so the UI renders cleanly.

### `src/app/emails/[domain]/[ruleId]/page.tsx`
- **New icons**: `AlertTriangle`, `GitCompare`, `Plane`. Removed unused `Percent`.
- **New section** "Airbnb ↔ Guesty reconciliation" placed right after "Most reserved" (before "Booking received from"). Rendered by `ReconciliationPanel` component:
  - **4 Stat cards**: Airbnb confirmations (rose, Plane icon) · Matched in Guesty (emerald, CheckCircle2) · Missing from Guesty (amber/emerald, AlertTriangle) · Guesty (Airbnb) not matched (indigo/emerald, GitCompare).
  - **Airbnb mark-as-read banner** when either `marked_read_airbnb > 0` or `mark_errors_airbnb > 0`. Green if fully marked, red if all failed.
  - **Missing-from-Guesty table** (amber header with AlertTriangle) listing: Code · Guest · Listing · Check-in · Check-out · Nights · Payout (USD, integer via `fmt()`). Includes action copy: "Investigate in Guesty: open the reservation by code and confirm it was imported; if not, trigger a manual sync."
  - Fallbacks: all-matched → green banner; no Airbnb emails found → muted placeholder explaining the search pattern.

### Verification
- `npm run build` passes (TS 10.1s, 14 routes).
- Deploy: `vercel --prod --yes` → `dpl_...` aliased to kareemhady.vercel.app.
- Build cache did not need `--force` this time.

### Known caveat (unchanged from 5.2)
Airbnb mark calls will 403 until `kareem@limeinc.cc` is re-Connected at `/admin/accounts` to grant `gmail.modify`. The new red banner variant in Reconciliation Panel surfaces this alongside the existing one on the main view.

## ✅ PHASE 5.2 SHIPPED — USD + integers + building catalog + re-auth banner (commit dd89e8d)

### User feedback this turn
> "All Currency is USD, No Decimal Digits in all"
> "Whats Commission Absorbed ?"
> "We Have Buildings: BH-26, BH-73, BH-435, BH-OK (Scattered Apartments in One Kattameya Compound), BH-MG (Single Apartment in Heliopolis)"
> "Emails are not marked as read in mailbox"

### Diagnosis of mark-as-read
Queried `rule_runs` for the Beithady rule: latest successful run processed 62 emails, `marked_read=0, mark_errors=62` — every mark call 403'd. This is the known re-auth action item from Phase 2.1: `kareem@limeinc.cc`'s OAuth token was issued with `gmail.readonly` only; `gmail.modify` was added to the `SCOPES` array later but the existing refresh token doesn't carry it. User must re-Connect that mailbox at `/admin/accounts`. Can't be fixed in code.

### Changes

#### `src/lib/rules/aggregators/beithady-booking.ts`
- Exported `BEITHADY_BUILDINGS` catalog:
  ```ts
  { 'BH-26': {...}, 'BH-73': {...}, 'BH-435': {...},
    'BH-OK': { description: 'Scattered apartments · One Kattameya compound' },
    'BH-MG': { description: 'Single apartment · Heliopolis' } }
  ```
- `deriveBuildingCode()` normalizes: any `BH<suffix>` from listing code becomes `BH-<suffix>` uppercased. So `BH73-3BR-SB-1-201 → BH-73`, `BHOK-... → BH-OK`.

#### `src/lib/rules/engine.ts`
- After `markMessagesAsRead`, if any errors came back we take the first one, strip the `"<messageId>: "` prefix, and persist the first 300 chars as `output.mark_error_reason`. UI surfaces this so the user sees the actual 403 message, not just a count.

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
- Added `fmt(n)` helper at module scope — rounds to integer and `.toLocaleString()`s. Used everywhere money is displayed.
- `BeithadyView` now hardcodes `const CURRENCY = 'USD';` (ignores the `out?.currency` field).
- Removed commissionAbsorbed computation + Commission Absorbed Stat card.
- Added `avgListRate = mean(bookings[].rate_per_night)` + "Avg list rate/night USD" Stat in its slot.
- Performance KPI strip is now: ADR · Avg list rate/night · Booking pace · Avg lead time.
- Hero stat subtitles use `fmt()`; nights/stay hint shows `avgNights.toFixed(1)` for decimal granularity on a non-money number.
- TrophyCards use `fmt()`; the "Most reserved building" card prepends the catalog description (e.g. "Scattered apartments · One Kattameya compound · 12 nights · 2,450 USD").
- `BuildingTable` rewritten to pre-render all 5 canonical buildings (empty rows dimmed to `text-slate-400` with `—` cells) plus any extra codes discovered. Each row has a two-line cell: mono code on top, 11px gray description below.
- Reservations table: rate + payout cells use `fmt()`; `Bldg` cell passes through `normalizeBuildingCode()` (local helper) so any historical un-normalized codes display canonical format.
- Footer sum uses `fmt()`; mismatch banner uses `fmt()`.
- Dropped `currency` prop from ChannelMix / BucketPanel / CheckInMonthPanel / BucketBars / GuestTable — each now writes "USD" literally.
- New red banner between the parse_errors banner and the view: shows when `(mark_errors > 0 && marked_read === 0)`. Contents: "None of N emails could be marked as read", account email in mono, link to `/admin/accounts`, instruction to re-Connect with `gmail.modify`, sample error line from `mark_error_reason`. Complements the existing green "Marked N · (M errors)" success banner.

#### `src/app/emails/[domain]/page.tsx`
- `BeithadyMini` card: hardcoded "Total payout USD" label, `Math.round` before toLocaleString.

### Known building-code gotcha
Historical rule_runs have `building_code` stored as the raw first-segment (e.g. "BH73"). The new normalize happens at parse time. Until the rule is re-run, the stored `building_code` on old rows stays "BH73". The detail page's Bldg column normalizes on render via `normalizeBuildingCode()`, so the UI is consistent. The aggregator's `by_building` bucket keys on new runs will already be "BH-73"; the BuildingTable also normalizes pre-existing bucket labels when matching against the catalog.

### Verification
- `npm run build` passes (10.9s TS, all 14 routes).
- `vercel --prod --yes` → dpl_DzExo6r5aZ5FUJjvjWUM9aYdK8A3 ready, aliased to kareemhady.vercel.app.
- Stale Vercel build cache issue did NOT recur this time (no `--force` needed after the previous force-build).

### Remaining user action
**Re-Connect kareem@limeinc.cc at [/admin/accounts](https://kareemhady.vercel.app/admin/accounts)** so OAuth grants `gmail.modify`. Until then, every Beithady run will show the red "62/62 failed" banner. Kika works because `kareem.hady@gmail.com` was already re-authed earlier.

## ✅ PHASE 5.1 SHIPPED — Beithady dashboard redesigned as hospitality view (commit 84b8039, force-deployed)

### User feedback this turn
Screenshot from `/emails/beithady/<id>` showed:
1. **Failed run**: `unknown_action_type: beithady_booking_aggregate` — the Vercel bundle was stale, engine didn't know the new action type yet.
2. **Complaint**: "you copied the dashboard of kika, this is not the info I need, customize as per my rule request, every rule has to have its own output based on the business and the info I want to see"

The Phase 5 view used the same 4-stat + bar-card pattern as KIKA, just with different labels — the user perceived it as a template clone, not a property dashboard.

### Fix 1 — force-redeploy
`vercel --prod --force --yes` → dpl_BTxNHRrL2uEoiDDfFps4bXDBXXA1 ready, aliased to kareemhady.vercel.app. Bundle now contains the `beithady_booking_aggregate` branch in engine.ts. Next Run click on the rule will succeed.

### Fix 2 — full BeithadyView rewrite (`src/app/emails/[domain]/[ruleId]/page.tsx`)
Replaced the Stat-strip-with-bar-cards pattern with a purpose-built hospitality dashboard:

- **Rose/pink gradient hero band** — 3 oversized KPIs in a single card (Reservations / Total payout / Nights reserved). Distinct visual identity vs the KIKA plain white cards.
- **"Most reserved" trophy trio** — 3 themed cards (apartment rose / building indigo / bedroom-count violet) matching the user's explicit 3-metric ask. Each has a `TrophyCard` with chip-tagged rank, Lucide icon, mono listing code, primary count, secondary nights+payout.
- **"Booking received from"** — new `ChannelMix` component with a single stacked horizontal bar (100%-width, one segment per channel) + per-channel legend pills. Colored `ChannelBadge` (Airbnb rose, Booking.com blue, Vrbo/Expedia amber, Direct emerald, other slate).
- **"Reservations in each building" table** — proper tabular breakdown with columns: Building · Reservations · Share % (inline bar) · Nights · Avg nights/res · Total payout · Avg payout/res.
- **Performance KPI row** — ADR (payout/nights), Booking pace (res/day over range days), Commission absorbed (Σ rate×nights − payout), Avg lead time.
- **Length-of-stay distribution** — bucketed Short ≤2 / Mid 3-7 / Long 8-14 / Extended 15+.
- **Lead-time distribution** — bucketed last-minute <1 / short 1-7 / medium 8-30 / far 31-90 / distant 90+, computed client-side from check-in vs time_range.from.
- **Check-ins by month** — vertical bar chart (rose→pink gradient) grouped by YYYY-MM.
- **Check-in weekday mix** — 7-bar chart with count + share% per weekday (indigo→violet gradient).
- **Top listings** — BucketBars top 15.
- **Reservations table** — rose-themed header/hover, mono booking id in rose-700, colored ChannelBadge cell, sub-total row summing nights/guests/payout + mismatch warning.
- **Guests repeat-visitor table** — unchanged shape, rose-themed header.

### New helper components (same file)
`HeroStat`, `SectionHeader`, `TrophyCard`, `ChannelBadge`, `ChannelMix`, `BuildingTable`, `BucketPanel`, `CheckInMonthPanel`, `CheckInWeekdayPanel`, `BucketBars`, plus client-side bucketers `bucketStayLengths`, `bucketLeadTimes`, `groupByCheckInMonth`, `groupByCheckInWeekday`.

### Dead code removed
`HighlightCard` and `BucketCard` helpers + `Star` / `Globe2` icon imports. Added icons: `DoorOpen`, `Percent`, `Hourglass`, `BookOpen`, `CalendarDays`.

### Architecture note for future rules
The user wrote: "every rule has to have its own output based on the business and the info I want to see". Going forward, each new action type should get its own `XxxView` component that's visually and structurally distinct — not just relabelled stats. Current setup:
- `ShopifyView` → KIKA (shopify_order_aggregate)
- `BeithadyView` → Beithady (beithady_booking_aggregate)
- Future Lime / FMPlus / VoltAuto rules each need their own view when rule action types are added.

### Verification
- `npm run build` passes (Turbopack 25.2s compile, TS 2.9min).
- `vercel --prod --force --yes` completed successfully; alias updated.
- User was told to click Run on the rule to populate data (the stale "failed" run history row is left as-is — will be superseded by the next successful run).

### Rule row (unchanged from Phase 5)
- id: `587ab03f-0b90-4b0a-a562-4858609e0839`
- name: "Beithady Guesty Bookings"
- account: kareem@limeinc.cc (`e135f97d-429c-4879-ae20-ccfc12a40f53`)
- conditions: `from_contains: guesty`, `subject_contains: NEW BOOKING`
- actions: `type: beithady_booking_aggregate, currency: USD, mark_as_read: true`

## ✅ PHASE 5 SHIPPED — Beithady Guesty Bookings rule + reservation dashboard

### What's new
- **New aggregator**: `src/lib/rules/aggregators/beithady-booking.ts` — uses Claude Haiku tool-use to extract Guesty booking notifications (channel, listing, listing_code, guest, dates, nights, guests, rate, total_payout, booking_id). Derives `building_code` (first dash-segment of listing_code) and `bedrooms` (regex `\dBR`). Dedups by booking_id, computes buckets by channel/building/bedrooms/listing, totals, averages, unique guests, optional lead-time (days from email received → check-in).
- **Engine**: `src/lib/rules/engine.ts` action union extended with `beithady_booking_aggregate`. Empty-run stub now branches on action type so Beithady runs with zero matches still render valid dashboard shape.
- **Admin form**: `_form.tsx` Type select now offers "Beithady booking aggregate (Guesty)" alongside Shopify. Currency hint added (EGP for KIKA, USD default for Beithady).
- **Domain list page** (`/emails/[domain]`): cards branch on action type. Beithady cards show Reservations / Total payout / Nights / Buildings; Shopify cards unchanged. Beithady icon is `BedDouble` with rose tint.
- **Detail page** (`/emails/[domain]/[ruleId]`): refactored to share header + time range + banners + run history, then branches to `ShopifyView` or `BeithadyView`. Beithady view includes:
  - 4 primary KPIs: Reservations / Total payout / Nights reserved / Buildings
  - 4 derived KPIs: Avg payout / Avg rate per night / Avg nights per booking / Avg lead time
  - 4 Top-highlight cards: Top apartment / Top building / Top bedroom count / Top channel
  - 4 breakdown bar-charts: by channel / building / bedroom count / listing
  - Full reservations table with Booking / Channel / Listing / Bldg / Guest / Check-in / Check-out / Nights / Guests / Rate / Payout columns + subtotal row + KPI mismatch warning
  - Guest repeat-visitor table grouped by guest name, sorted by bookings then payout
  - Run history "Orders" column becomes "Reservations" when Beithady rule
- **Rule row inserted** in DB for kareem@limeinc.cc:
  - id: `587ab03f-0b90-4b0a-a562-4858609e0839`
  - name: "Beithady Guesty Bookings", domain: `beithady`, account: kareem@limeinc.cc (`e135f97d-429c-4879-ae20-ccfc12a40f53`)
  - conditions: `from_contains: guesty`, `subject_contains: NEW BOOKING`
  - actions: `type: beithady_booking_aggregate, currency: USD, mark_as_read: true`
  - enabled: true, priority: 100

### Period filters
Same presets as KIKA (today/last24h/last7d/mtd/ytd/custom), same Jan-1 clamp, same preset chips auto-run, same ranged custom form — all shared infrastructure reused verbatim.

### Mark-as-read
Rule has `mark_as_read: true`. After each run, Guesty booking emails get UNREAD label removed in kareem@limeinc.cc Gmail (assuming the account was re-authed with `gmail.modify` scope — same action item as KIKA).

### Lead-time caveat
Gmail's message metadata for `received_at` is not currently threaded into the aggregator (we pass `receivedAtByIndex` as optional parameter but engine currently passes only `bodies`). Lead-time KPI is therefore `null` in v1 runs. Wire-up is a one-line follow-up if desired: capture `internalDate` from `gmail.users.messages.get` and pass through.



## Status: Phase 1 scaffold pushed, Google OAuth blank, Part C user-owned
Commit `b9a4251` pushed to `main` at https://github.com/kareemhadylime/kareemhady (16 files, 1263 insertions). Project moved out of the VoltAuto worktree into its own home at `C:\kareemhady` with its own `CLAUDE.md`, `.claude/settings.json` (Stop-hook for handoff continuity), and this handoff file.

## What was done 2026-04-19
- **Directory:** `C:\kareemhady` (scaffolded via `npx create-next-app@latest . --ts --tailwind --app --src-dir --no-eslint --import-alias "@/*" --use-npm --turbopack`)
- **Deps added:** `@supabase/supabase-js`, `googleapis` (103 packages total with Next 16 scaffold defaults)
- **Files written (14):** `.env.example`, `.env.local` (gitignored), `vercel.json` (two crons 6/7 UTC), `supabase/migrations/0001_init.sql`, `src/lib/{crypto,supabase,gmail,run-daily}.ts`, `src/app/api/auth/google/{start,callback}/route.ts`, `src/app/api/run-now/route.ts`, `src/app/api/cron/daily/route.ts`, `src/app/page.tsx`, `README.md`. Default branch renamed from `master` → `main`.
- **`.gitignore` fix:** scaffold had `.env*` (too aggressive — would exclude `.env.example`). Replaced with `.env` / `.env.local` / `.env.*.local` pattern.
- **Secrets generated via Node `crypto.randomBytes`** (written to `.env.local` only, NOT committed):
  - `TOKEN_ENCRYPTION_KEY=SrzTf+8P5KLCBro/zHjU14Ft8teEKk5JEIZnlzqija8=`
  - `CRON_SECRET=e649b97787c27e1692364581cf22eba8d3a2e8a9b9dbfbca678aa88184365ad4`
- **Supabase creds populated in `.env.local`:**
  - URL: `https://bpjproljatbrbmszwbov.supabase.co`
  - anon + service_role JWT keys (old-style — spec expects these, NOT the new `sb_publishable_*`/`sb_secret_*` keys).
  - Project ref: `bpjproljatbrbmszwbov`
  - Org: "Lime Investments", region eu-central-1, Nano tier

## CLI installation state (2026-04-19)
- ✅ Node 24.14.1
- ✅ Vercel CLI — authed as `kareem-2041`
- ✅ `gh` installed via `winget install GitHub.cli` → v2.90.0. **Not yet authed.** If you need it: `gh auth login`. Wasn't needed for the initial push — git used cached Windows credentials.
- ⚠️ Supabase CLI — `npm i -g supabase` exited 0 but `supabase` binary not on bash PATH. Options: open a fresh terminal, use `scoop install supabase`, or skip CLI entirely and paste the migration SQL into Supabase dashboard → SQL Editor.

## ✅ DONE: Google OAuth app created, creds in `.env.local`
1. ✅ GCP project: `kareemhady-inboxops`, project number `593051355315`, no org
2. ✅ Gmail API enabled
3. ✅ OAuth consent (new "Google Auth Platform" UI — Branding/Audience/Data Access/Clients replaced old wizard)
4. ✅ OAuth Web Client created — `593051355315-b4g0mm67eqhq041gajatba2hj1ohr8d9.apps.googleusercontent.com`. Redirect URI: `http://localhost:3000/api/auth/google/callback` (prod URI to add after Vercel deploy).
5. ✅ Client ID + Secret written to `C:\kareemhady\.env.local` (NOT the worktree — `.env.local` lives in the main project root).

### ⚠️ Action items for user
- **Rotate client secret** — user pasted it in chat. After Phase 1 working, go to Clients → InboxOps web → reset secret, update `.env.local` + Vercel env.
- **Trim scopes** — user accidentally added `gmail.modify` and `gmail.compose` in Data Access. Only `gmail.readonly` is needed (read-only Phase 1). Told user to remove modify/compose. Keep: `gmail.readonly`, `userinfo.email`, `userinfo.profile`, `openid`.
- **Test users in Audience** — confirm all 3 mailboxes added (`kareem.hady@gmail.com`, `kareem@fmplusme.com`, `kareem@limeinc.cc`).

**Project naming nit:** spec said `kareemhady`, actual is `kareemhady-inboxops`. Cosmetic only.

## ✅ Path B (Vercel-first deploy) executed
User chose deploy-to-Vercel. Done this turn:
1. ✅ Supabase migration `init_inboxops_schema` applied via Supabase MCP — 4 tables created (`accounts`, `runs`, `email_logs`, `rules`), all empty, RLS disabled (fine for single-tenant w/ service-role key).
2. ✅ Vercel project linked: `lime-investments/kareemhady` (`.vercel/` created in `C:\kareemhady\`, gitignored).
3. ✅ Env vars added — **production + development**. **Preview SKIPPED** due to Vercel CLI plugin bug: `vercel env add NAME preview --value V --yes` fails with `git_branch_required` regardless of syntax (passing `main` as branch hits `branch_not_found: Cannot set Production Branch "main" for a Preview Environment Variable`). Preview env not needed for single-tenant prod app — fine to skip.
4. ✅ First deploy: `vercel --prod --yes` → built in 31s → assigned `https://kareemhady.vercel.app` (alias) + `https://kareemhady-20a4ooras-lime-investments.vercel.app` (deployment URL).
5. ✅ Updated `GOOGLE_OAUTH_REDIRECT_URI` and `NEXT_PUBLIC_APP_URL` in Vercel prod env from localhost → `https://kareemhady.vercel.app/...` (rm + re-add).
6. ✅ Redeployed → `https://kareemhady-hipc9na5r-lime-investments.vercel.app` (alias `kareemhady.vercel.app` updated).

## ✅ PHASE 1 COMPLETE — verified end-to-end at https://kareemhady.vercel.app
3 accounts connected, 4 manual runs all succeeded (158 emails each), tokens AES-encrypted (base64 prefix verified, not plaintext `1//…`). All cron jobs configured. User saw stale dashboard at first — hard refresh fixed it (Next.js `dynamic = 'force-dynamic'` works server-side; browser was just cached).

## ✅ PHASE 2 SHIPPED — modular UI + rule engine + Claude parsing (commits c1e8c69, f1d764e, e4f7226)
- **Landing → 2 cards: Admin / Emails** with branded TopNav, gradient hero, lucide-react module icons (background flourish)
- `/admin/accounts` — Connected Emails UI moved here + ingest runs + recent emails
- `/admin/rules` — full CRUD (list / new / [id] edit / delete / run)
- `/emails/output` — list of rule cards w/ KPI snapshot
- `/emails/output/[ruleId]` — **dashboard layout**: 4 KPI cards (Orders / Total / Products / Emails matched), top-products with horizontal bar charts, orders table, run history
- New libs: `src/lib/anthropic.ts`, `src/lib/rules/engine.ts`, `src/lib/rules/aggregators/shopify-order.ts` (Claude Haiku extracts order data per email via tool use; aggregates client-side)
- New table: `rule_runs` (id, rule_id, started_at, finished_at, status, input_email_count, output jsonb, error)
- KIKA rule seeded: `from_contains: kika`, `subject_contains: Order`, `time_window_hours: 24`, action `shopify_order_aggregate` currency `EGP`, account `kareem.hady@gmail.com`
- Shared UI components: `src/app/_components/{brand,module-card,stat}.tsx`
- Visual palette: indigo/violet on slate-50 base, gradient body bg, ix-card / ix-btn-primary utility classes in globals.css
- Server actions in `src/app/admin/rules/actions.ts` (createRule, updateRule, deleteRule, runRuleAction) — no API routes for CRUD; forms call actions directly
- Dynamic params use Next 16 `params: Promise<{...}>` pattern (verified against `node_modules/next/dist/docs/`)

### Mark-as-read (Phase 2.1)
- Scope expanded: `gmail.readonly` + **`gmail.modify`** in `src/lib/gmail.ts` SCOPES
- New `markMessagesAsRead(refreshTokenEncrypted, ids)` removes UNREAD label after rule processes
- Engine calls it post-aggregation; output gets `marked_read` + `mark_errors` counts
- Failures are caught (won't fail the run); user sees green/amber banner on detail page

### ⏳ User action items (still pending from Phase 2.1)
- **Add `gmail.modify` scope in Google Cloud → Data Access** (not done yet — user only granted readonly originally)
- **Re-Connect each of 3 Gmail accounts** at `/admin/accounts` so OAuth picks up the new scope (existing tokens lack `gmail.modify`; mark calls return 403 until re-auth)
- Test KIKA rule run after re-connect → confirm "Marked N email(s) as read" banner shows on detail page

## ✅ PHASE 3 SHIPPED — domain tabs, date-range filter, mark-as-read toggle, no $ symbols (commit c0ac86d)

### DB
- Migration `add_domain_to_rules_and_mark_read_default` — added `rules.domain` text column + `idx_rules_domain` index. Updated KIKA seed: `domain='kika'`, `actions.mark_as_read=true`.

### New lib
- `src/lib/rules/presets.ts` — exports `DOMAINS` (`personal | kika | lime | fmplus | voltauto | beithady`), `DOMAIN_LABELS`, `RANGE_PRESETS` (today/last24h/last7d/mtd/ytd), `resolvePreset(preset)` returns ISO from/to, `dateInputValue(iso)` formats for `<input type="date">`.

### Engine changes
- `evaluateRule(ruleId, range?)` — optional `EvalRange` overrides default `time_window_hours`
- Mark-as-read now **conditional** on `rule.actions.mark_as_read === true` (not unconditional)
- Output JSON now embeds `time_range: { from, to, label? }` so detail page shows what range was used

### UI changes
- Rule form: Domain select + Mark-as-read checkbox (with rationale about gmail.modify scope)
- Rules list: shows domain badge + "MARK READ" badge per rule
- `/emails/output`: tab strip filters by `?domain=...` (counts shown per tab); each rule card shows domain badge
- `/emails/output/[ruleId]`: new "Time range" section with preset chips + custom from/to date inputs + two Run buttons (custom range vs preset). Run history now includes a "Range" column showing `from → to` per past run.
- `runRuleAction` server action accepts `preset` or `from`/`to` form fields; `rangeFromForm()` helper resolves to EvalRange

### No more $ symbols
- `DollarSign` icon replaced with `Wallet` (lucide-react) on output detail Stat
- Currency rendered as plain text suffix (e.g. "Total EGP", "3,100 EGP") — never a `$`

### ⚠️ Build gotcha
- **Always `cd /c/kareemhady && npm run build` (or `vercel --prod`)** — running from inside the worktree directory (`C:\kareemhady\.claude\worktrees\dazzling-vaughan-ac37b7`) builds the worktree's stale Phase 1 checkout (only 6 routes), not the main project's code. The Bash tool's cwd may reset to the original worktree path between sessions.

### Latest production deployment after Phase 3
Commit `c0ac86d` deployed; smoke tests passed: `/`, `/emails/output`, `/emails/output?domain=kika`, `/admin/rules/new` all returned 200.

## ✅ PHASE 4 SHIPPED — domain landing + per-domain rule pages (commit 490ad53)

### Routing change
- **`/emails`** is no longer "Reports & outputs" with one sub-card; it's now **6 domain cards** (+ "Other" card auto-appears if any rule has `domain IS NULL`). Each card shows label, description, icon, rule_count, last_run timestamp.
- **`/emails/[domain]`** (NEW) — list of rule boxes under that domain. Validates domain via `isDomain()` or === 'other'.
- **`/emails/[domain]/[ruleId]`** (MOVED from `/emails/output/[ruleId]`) — same dashboard, but now validates that the rule's domain matches the path domain (404 otherwise). Breadcrumbs are `Emails › <Domain> › <Rule>`.
- **DELETED:** `/emails/output/page.tsx` and `/emails/output/[ruleId]/page.tsx`.

### Engine / actions
- `runRuleAction` now looks up the rule's domain and redirects to `/emails/{slug}/{id}` (slug = rule.domain or 'other').
- `revalidatePath` calls updated to `/emails`, `/emails/{slug}`, `/emails/{slug}/{id}`.

### New presets metadata + helpers (`src/lib/rules/presets.ts`)
- `DOMAIN_DESCRIPTIONS` — one-liner per domain
- `DOMAIN_ACCENTS` — color accent per domain (slate/violet/emerald/amber/indigo/rose)
- `DOMAIN_ICON_NAMES` — lucide icon name per domain
- `isDomain(s)` — type guard

### New component
- `src/app/_components/domain-icon.tsx` — `<DomainIcon domain={...} />` maps Personal→User, KIKA→ShoppingBag, LIME→Citrus, FMPLUS→Building2, VOLTAUTO→Zap, BEITHADY→Home, other→Layers.

### Form copy
- Domain field now has hint text: "Where this rule appears under Reports & outputs."
- Empty option label: "— Other (no domain) —"

### Smoke tests after deploy
- `/`, `/emails`, `/emails/kika`, `/emails/personal`, `/admin/rules/new` → all 200
- `/emails/foobar` → 404 (correctly rejected)

## ✅ PHASE 4.1 SHIPPED — preset chips auto-Run + time_window_hours removed (commit b07c36e)

### Bug user reported
Picking a preset chip (e.g. "Month to date") only changed the URL searchParam — it didn't trigger evaluateRule, so the dashboard kept rendering the previously-cached 24h run. Looked like the range filter "reverted to 24h."

### Fix
- Preset chips on `/emails/[domain]/[ruleId]` are now `<form>` buttons (one per preset) that POST to `runRuleAction` with `preset=<id>`. Clicking immediately re-evaluates and the page renders the new run.
- `runRuleAction` now appends `?preset=<id>` to the redirect URL so the chosen chip stays highlighted after the run.
- The redundant secondary "Run preset: X" button was removed (chips themselves are the run trigger).

### Per user request: removed `time_window_hours` field from the rule
- Form: removed the "Default time window (hours)" `<input>`
- Server action: stopped writing `conditions.time_window_hours`
- UI: removed the "· last Nh" hint from `/admin/rules` and `/emails/[domain]` cards (no longer meaningful since UI controls the range)
- Engine **kept** `(cond.time_window_hours || 24) * 3600 * 1000` as a defensive fallback for any callers that don't pass a range (e.g. a future cron). Existing seeded KIKA rule still has `time_window_hours: 24` in conditions; harmless because all UI buttons now pass an explicit range.

### Cosmetic note for Kareem
- KIKA rule's name `KIKA Shopify Orders (last 24h)` still has the literal "(last 24h)" text — just a string. Edit in `/admin/rules` if it's misleading now that range is dynamic.

## ✅ PHASE 4.2 SHIPPED — rule eval now queries Gmail directly (commit f8e6fd5)

### The real bug user hit
After Phase 4.1, picking "Month to date" / "Year to date" still returned the same 8 orders as "Last 24h". User reported: "still report reverts to 24hr results, no effect on changing dates."

### Root cause
Rule engine was filtering `public.email_logs`. The daily ingest (`src/lib/gmail.ts:fetchLast24hMetadata`) only fetches emails `newer_than:1d` — so email_logs is a **24-hour rolling cache**. Confirmed via SQL: 8 KIKA emails in the cache, ALL from 2026-04-19. Widening the date filter found the same 8 rows because older emails were never ingested.

### Fix
- New `searchMessages(refreshTokenEncrypted, opts)` in `src/lib/gmail.ts` — builds a Gmail query string from the rule's conditions + date range (e.g. `from:kika subject:Order after:2026/04/12 before:2026/04/20 -in:spam -in:trash`), pages through up to 500 results. Gmail's `after:`/`before:` are day-granular, so we pad by ±1 day and let the aggregator be the source of truth.
- `evaluateRule` no longer touches `email_logs`. It requires `rule.account_id` (throws `account_or_token_missing` if null) and calls `searchMessages` directly. This guarantees the eval always sees fresh data for whatever range the UI passes.
- `email_logs` is now only used by the dashboard's "recent emails" view on `/admin/accounts` — it remains a shallow 24h cache for display.

### Timeout
- Added `export const maxDuration = 60;` to `/emails/[domain]/page.tsx` and `/emails/[domain]/[ruleId]/page.tsx`. YTD runs on a large mailbox could otherwise hit Vercel's default 10s timeout; Vercel Pro allows up to 60s.

### Implication for rules without an account
- Rules with `account_id IS NULL` (the "All accounts" option in the form) will now throw when run — the engine can only pick one account's OAuth token at a time. Phase 1 seeded KIKA rule has `account_id` set so it works. If needed in future: loop over accounts in engine.

## ✅ PHASE 4.3 SHIPPED — Jan 1 of current year is the earliest search floor (commit 373fdd9)

### Change requested by user
"Lets do it always the limit up to Year start — so 2026 will be back up to 1-JAN-2026, not to search the full library of emails."

### Implementation
- `evaluateRule` computes `yearStartMs = new Date(new Date().getUTCFullYear(), 0, 1).getTime()` and clamps `fromIso = max(requestedFromIso, yearStartMs)`. All Gmail searches are floored at this value.
- `output.time_range` now carries `clamped_to_year_start?: boolean` and `requested_from?: string` so the UI can tell when a clamp happened.
- Detail page shows an amber banner: "Requested start date X was clamped to Jan 1 (Jan 1 cap)."
- Both date inputs (`From`, `To`) get `min={yyyy-01-01}` so the native picker hints the floor visually.
- Preset section helper text updated: "Searches are always capped at Jan 1, {current year} at the earliest."

### Behaviour per preset
- Today / Last 24h / Last 7 days / MTD — all well within the cap, no change
- YTD — already uses Jan 1, no change
- Custom: if From predates Jan 1 of this year, it's silently clamped + user sees amber banner

## ✅ PHASE 4.4 SHIPPED — split "Total paid" vs "Product revenue"; show all products (commit 44fa251)

### Bug user hit
"Filter 7 Days — These Don't Match the Total of 375K ????" — product bars summed to ~166K but Total KPI said 373,918.86.

### Root cause
Two different numbers were labelled as "Total":
- `order.total_amount` from Claude extraction = **final customer charge** (incl. shipping + tax, after discounts)
- `line_item.total` from Claude extraction = **list price × qty** (pre-discount, pre-shipping, pre-tax)
Per-product revenue was the sum of line items; the KPI was the sum of order totals. For KIKA, large "Custom discount" lines (seen earlier: 3100 list → 142.50 paid) make these wildly different.

Also: product chart was capped at `products.slice(0, 12)`, so 57 of 69 products were invisible.

### Fix
- Aggregator (`shopify-order.ts`) now emits a separate `line_items_subtotal` alongside `total_amount`.
- Detail page KPI strip renamed:
  - "Total paid EGP" (Wallet icon, emerald) — with hint "Final customer charges (incl. shipping + tax, after discounts)"
  - "Product revenue EGP" (Package icon, indigo) — with hint "Sum of line items (list price × qty)"
  - "Emails matched" demoted into the "Products" card's hint line to free a slot.
- Product list now renders **all** products (removed the `.slice(0, 12)` cap); heading reads "Products (N)" with a clarifying line.

### Schema implications
- No DB changes. `rule_runs.output` is JSONB so the new `line_items_subtotal` field appears on new runs only; historical runs still render fine (subtotal treated as 0 if missing, which is honest).

### Retry note
The user needs to click a preset / Run to get a new run whose output carries `line_items_subtotal`; older rule_runs still show 0 for "Product revenue" until re-run.

## ✅ PHASE 4.5 SHIPPED — parse_failures detail + preset auto-highlight (commit ef823a6, force-deployed)

### User's three complaints this turn
1. "Still total is not correct" + screenshot showing old TOTAL EGP / EMAILS MATCHED cards — Phase 4.4 labels weren't visible.
2. "Parsing error" — 12 of 193 KIKA emails failed to parse; no way to see which ones.
3. "When i go out cache clears and the default is 9am to previous 24hrs" — returning to the detail page resets chip to Last 24h even though the displayed data was MTD/YTD.

### Diagnosis of #1
- `git log` on main shows `44fa251 Phase 4.4` deployed. `curl https://kareemhady.vercel.app/emails/kika/<id>` returned HTML containing "Total paid" / "Product revenue" and none of "TOTAL EGP" / "EMAILS MATCHED" → **Phase 4.4 is actually live; user's browser was cached**. Needed hard refresh.
- `rule_runs.output` on recent runs (10:11:04 / 10:11:36) was missing `line_items_subtotal`. Suspected Vercel build cache holding an older aggregator bundle. **Fix: `vercel --prod --force --yes`** to invalidate build cache.

### Fix for #2 (parse_failures)
- `aggregateShopifyOrders` now emits `parse_failures: [{subject, from, reason}]` alongside the numeric `parse_errors` count.
- Reason is either `String(rejection.message)` (Promise rejected — Claude API error/network) or `'no_tool_output'` (Claude returned no tool_use block).
- Detail page's amber "N email(s) could not be parsed" banner is now a `<details>` element — clicking it expands a list of up to 50 failed emails with subject/from/reason. Gives user visibility into whether the filter is catching non-order emails.

### Fix for #3 (preset auto-highlight)
- `EvalRange` now carries `presetId?: string`. `rangeFromForm` in `actions.ts` injects it (either the resolved preset id or the literal `'custom'`).
- Engine persists it as `time_range.preset_id` in the output JSONB.
- Detail page now resolves `activePreset = urlPreset || lastRunPreset || 'last24h'` — so returning to the page with no `?preset` query shows the chip matching the last run that was actually executed.

### Deployment note for future
- Vercel's build cache appears to have held an older bundle of `src/lib/rules/aggregators/shopify-order.ts` after Phase 4.4. **If new JSONB fields don't show up in `rule_runs.output`, force-redeploy with `vercel --prod --force --yes`.**

## ✅ PHASE 4.6 SHIPPED — fallbacks so historical rule_runs render correctly (commit e9ad08c)

### User confusion this turn
Screenshot showed:
- Product Revenue EGP = 0 (expected a number)
- Chip stuck on "Last 24h" even though "Last run covered 4/1 → 4/20 (Month to date)"
- User hadn't clicked anything

User asked "Why old cache is persistent" — really asking why a stale-looking snapshot shows on page load.

### Design clarification (not a bug)
- `rule_runs` is an append-only table of run snapshots.
- Detail page reads `WHERE rule_id=X ORDER BY started_at DESC LIMIT 1` and renders that one row. No auto-run on load (would burn Claude API on every visit).
- So "cache" really = the latest stored snapshot. Runs created before a new field was added simply lack that field.

### Fix: two client-side fallbacks on detail page
1. `subtotal = out.line_items_subtotal ?? sum(products[].total_revenue)` — computes Product Revenue on the fly for Phase <4.4 runs, since the per-product `total_revenue` totals are already stored.
2. `activePreset` chain expanded to `urlPreset || lastRunPreset || labelFallbackPreset || 'last24h'`. The label fallback matches `time_range.label` against `RANGE_PRESETS` (e.g. "Month to date" → `mtd`) for Phase <4.5 runs that predate `preset_id`.

### No schema/migration change
- Fallbacks are pure render-layer. Existing rule_runs JSONB untouched.
- New runs continue to persist `line_items_subtotal` and `time_range.preset_id` natively (Phase 4.4/4.5 still in effect).

## ✅ PHASE 4.7 SHIPPED — domain-list cards now match detail-page labels (commit fada7e9)

### User reported
Screenshot from `/emails/kika` still showing "TOTAL EGP" (and no Product Revenue) even after hard refresh. Phase 4.4's rename only touched the DETAIL page (`/emails/[domain]/[ruleId]`), not the LIST page (`/emails/[domain]`).

### Fix
Applied the same change to `src/app/emails/[domain]/page.tsx` rule cards:
- "Total EGP" → "Total paid EGP"
- Added "Product revenue EGP" mini-stat with the same fallback (`line_items_subtotal ?? sum(products[].total_revenue)`)
- Mini-stats grid bumped from 3 to 4 columns

### Verification
`curl https://kareemhady.vercel.app/emails/kika | grep` confirms the page now serves "Total paid" and "Product revenue", no "TOTAL EGP".

## (Original Phase 1 — kept for reference, no longer blocking)

### ✅ Production redirect URI added to Google
User added `https://kareemhady.vercel.app/api/auth/google/callback` to OAuth client (initial typo `callbackS` corrected to `callback`).

### 🐛 Fixed two Vercel issues that caused 404 on https://kareemhady.vercel.app
1. **Vercel SSO Protection** (`ssoProtection.deploymentType: "all_except_custom_domains"`) was enabled by default on the new project — `kareemhady.vercel.app` is a Vercel subdomain (not a custom domain) so it was protected. Disabled with `vercel project protection disable kareemhady --sso`. Project state now: `ssoProtection: null`.
2. **`framework: null`** on the project — Vercel auto-detect didn't fire (likely because project was created via `vercel link --yes` from CLI, not from GitHub import). Build correctly used Next.js 16.2.4 and produced all routes, but Vercel's edge wasn't routing through Next.js. Fixed by adding `"framework": "nextjs"` to `vercel.json` and redeploying.

After both fixes: `curl https://kareemhady.vercel.app/` returns 200, dashboard HTML serves correctly.

### Latest production deployment
`dpl_Bk6BpTdvsfQ6fpfsQeNz6hfZn5AR` → `kareemhady-ayndz3ft5-lime-investments.vercel.app` (alias `kareemhady.vercel.app`).

### Notes for future debugging
- `vercel alias rm` + `vercel alias set` did NOT fix the 404 on its own — only the framework fix did. If you see Vercel 404s in the future where build succeeded, check `framework: null` first.
- SSO Protection is NOW DISABLED. Anyone who can guess the URL can see the dashboard. For Phase 1 this is fine (no email content shown publicly without OAuth flow). Re-enable later if needed (would need a callback bypass mechanism).

## Vars known to env (stored in `.env.local` + Vercel; never commit secret values to git)
- `GOOGLE_CLIENT_ID` — public, prefixed `593051355315-...apps.googleusercontent.com`
- `GOOGLE_CLIENT_SECRET` — secret; user pasted in chat → **rotate after Phase 1 working** (Cloud → Clients → InboxOps web → reset)
- `ANTHROPIC_API_KEY` — secret; user pasted in chat → **rotate after Phase 2 working** (console.anthropic.com → API Keys → recreate)
- Vercel project ID stored in `.vercel/project.json` at `C:\kareemhady\`

## Remaining Part C steps (user-owned)
1. ✅ Apply migration (done via MCP)
2. ✅ `vercel link` (done)
3. `vercel env add` for each var in `.env.example` — pick Production + Preview + Development for each
4. `vercel --prod`
5. After first deploy: add `https://<deployed-url>/api/auth/google/callback` to Google Cloud OAuth redirect URIs, update `GOOGLE_OAUTH_REDIRECT_URI` + `NEXT_PUBLIC_APP_URL` in Vercel env, redeploy
6. Connect the 3 mailboxes at the deployed URL
7. Workspace gotcha: if OAuth "app blocked" on `fmplusme.com` / `limeinc.cc` — Google Admin → Security → API Controls → Manage Third-Party App Access → add as trusted
8. Click "Run now" to verify end-to-end
9. Lock down with Vercel Pro Deployment Protection

## Verification checklist (Part D) to run post-deploy
- 3 mailboxes under Connected accounts with fresh `last_synced_at`
- At least one `succeeded` run with non-zero `emails_fetched`
- Supabase `accounts.oauth_refresh_token_encrypted` column contains base64 gibberish (NOT plaintext `1//…` — if plaintext, encryption broken, STOP)
- Vercel cron jobs visible at `0 6 * * *` and `0 7 * * *`
- Dashboard URL requires Vercel Deployment Protection auth

## Spec reference
Full Phase 1 spec: `C:\Users\karee\Downloads\inboxops-phase1-build.md` (user's local file, not in repo). Future phases preview:
- Phase 2: Supabase Auth (email magic link), rules CRUD UI, rule evaluator, `ai_summarize` Claude action, `actions_taken` in email log
- Phase 3: Rule matching engine
- Phase 5: WhatsApp error alerts
