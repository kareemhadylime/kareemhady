# FM+ Project Budget v2 — Acceptance Walk-Through

**Date:** 2026-05-04
**Spec:** [docs/superpowers/specs/2026-05-04-fmplus-project-budget-v2-design.md](../specs/2026-05-04-fmplus-project-budget-v2-design.md)
**Plan:** [2026-05-04-fmplus-project-budget-v2.md](2026-05-04-fmplus-project-budget-v2.md)
**Branch:** `claude/eager-williamson-5787df` → `origin/main`
**Status:** v2.0 functionally complete · 2 deferred items for v2.1

## Summary

36 of 40 plan tasks shipped end-to-end. The 4 deferred tasks (T29-T32, rich XLSX parsers for AUC/TRIO/CityGate/Emaar layouts) are explicitly v2.1 follow-on. The flat-template parser (T33) is sufficient for v2.0 import; rich parsers throw a clear "use flat template" message in the Import UI when their layout is detected.

## What ships in v2.0 (functional)

### Foundation
- ✅ Migration `0081_fmplus_project_budget_v2.sql` — drops v1's 7 tables, creates v2's 10 tables (`project_contracts`, `project_services`, `project_years`, `project_year_services`, `fmplus_catalog`, `project_catalog_overrides`, `budget_lines`, `mobilization_lines`, `budget_audit`, `budget_settings`)
- ✅ Migration `0082_fmplus_catalog_seed.sql` — seeds 76 catalog items from Emaar Pricelist (37 consumables, 36 tools, 3 ppe)
- ✅ Zod schemas + TypeScript types for all 10 tables (`src/lib/fmplus/budget/schema.ts`, `types.ts`)
- ✅ Permission gates over `requireDomainAccess('fmplus')` + `is_admin` flag (`permissions.ts`)
- ✅ DB helper with `TABLES` constant (`db.ts`)

### Templates (7 service lines)
- ✅ HK / MEP / Landscape / Security / Pest Ctrl / Waste Mgmt / Back Office templates with bilingual labels (en + ar) and account_map regex per service-line range
- ✅ Governmental category (`gov_taminat` 1.4% revenue + tax stamps + work permits) post-merged onto every service via `getTemplate()`

### Catalog
- ✅ Server modules: `searchCatalog`, `upsertCatalogItem`, `archiveCatalogItem`, `resolveCatalogPrice`, `upsertOverride`, `removeOverride`
- ✅ `/fmplus/financial/budget/catalog` — searchable table with toolbar (search + service/category/active filters), 8 columns (status / code / bilingual name / unit / default price / services / tags / actions), per-project override side panel (selected-item summary + contract picker + override price + delta indicator + notes + cross-contract comparison), bulk import (XLSX) modal with diff summary

### Project Hub
- ✅ Portfolio aggregator (`buildPortfolio()`) returning contract cards with year/service/contract value/GM%/YoY/mob ROI
- ✅ `/fmplus/financial/budget/projects` — 2-column card grid + filter toolbar + action-needed banner
- ✅ `/fmplus/financial/budget/projects/new` — 4-section wizard (analytic account → contract metadata → year tracking + zones → service lines), atomic create via `createContract()` (creates contract + Y1 + per-service revenue rows)

### Editor
- ✅ `/fmplus/financial/budget/edit?contract=&year=&service=` — full Editor:
  - Year tabs strip (Y1/Y2/... + Add Year + Copy Year buttons)
  - Service tabs strip (per-service + Revenue + Mobilization)
  - Section accordion (one per template category, with line counts and category totals)
  - Add Line modal (catalog picker tab + free-text tab; service+category filters preset)
  - CTC expand panel for manning rows (6 components: Net + Relievers + OT + Training + Insurance + Medical) + per-line variance threshold override
  - KPI strip (revenue / cost / GM% / headcount / lines)
  - Bilingual toggle in layout (EN ↔ ع) — applies `dir="rtl"` to document
  - Save Draft / Publish actions
  - Add Year (creates blank Yn+1)
  - Copy Y1 → Y2 dialog with 3 inflation knobs (revenue / manpower / non-manpower) + per-line tweak override panel + audit log
  - Revenue tab — per-service `monthly_revenue`, `vat_pct`, `manpower_ramp` JSON
  - Mobilization tab — contract-level capex/opex/training/recruitment lines with amortization (straight_line / flat) over `amortization_months`

### Variance
- ✅ `buildBudgetVarianceV2(contractId, yearIndex, scenario, serviceLine?, bilingual?)` — joins `budget_lines` + `project_year_services` for budget side, `odoo_move_lines` via `odoo_move_line_analytics` + `odoo_accounts.code` regex for actuals; honors per-line threshold overrides; reports unmapped actuals
- ✅ `cellToMoveLines()` drill function for Variance grid drilldown
- ✅ `amortizeMobilization()` pure math (straight_line + flat, end_date truncation, multi-line accumulation)
- ✅ `/fmplus/financial/budget/variance?contract=&year=` — KPI strip + per-segment month×category grid with traffic-light coloring + click-to-drill side drawer (lists `odoo_move_lines` for the cell with date/account/partner/amount) + unmapped-actuals warning + XLSX/PDF export buttons

### Compare
- ✅ `/fmplus/financial/budget/compare?mode=projects&service=hk` — cross-project category grid, sortable, traffic-light colored
- ✅ `/fmplus/financial/budget/compare?mode=yoy&contract=X&service=hk` — Year-vs-Year category × year grid for a single multi-year contract

### Settings
- ✅ `/fmplus/financial/budget/settings` — variance thresholds (asymmetric green/amber) + 3 inflation defaults (revenue/manpower/non-manpower) + mobilization amortization months + bilingual default + template summary table + sample of unmapped Odoo accounts

### Import
- ✅ `/fmplus/financial/budget/import` — XLSX upload + auto-detect dispatcher + flat-template parser + diff preview (per contract+year, contract-exists / year-exists checks) + commit (replaces lines for matching year_id; refuses to overwrite published years)
- ✅ Empty flat-template download via `/api/fmplus/budget/flat-template-download`
- ✅ Round-trip-tested: `exportFlatTemplate()` → `parseFlatTemplate()` produces identical FlatRow[] (4 vitest cases passing)

### Overview
- ✅ `/fmplus/financial/budget` — portfolio rollup KPI tiles (projects budgeted / YTD budget / YTD actual / portfolio variance %) + service-line filter chips + project table (variance % per project + GM% + health dot + status) + anomaly banner + action-needed list

### Exports
- ✅ Variance PDF (`/api/fmplus/budget/variance-pdf?contract=&year=`) — A4 landscape with KPI strip + per-segment month×category table with traffic-light colored cells
- ✅ Variance XLSX (`/api/fmplus/budget/variance-xlsx?contract=&year=`) — Summary sheet + one sheet per segment with frozen header/first-column + colored variance% column

### Layout
- ✅ 8-tab strip (Overview · Project Hub · Editor · Catalog · Import · Variance · Compare · Settings)
- ✅ Bilingual toggle (en/ع) with localStorage persistence + document `dir="rtl"` application

## What's deferred to v2.1

| Task | Description | Why deferred | Workaround in v2.0 |
|---|---|---|---|
| T29 | Rich AUC-style XLSX parser | Per-file column-mapping inspection + < 0.5% drift validation needs ~5 hours per parser | Re-export AUC sheet to flat-template format and use Import |
| T30 | TRIO-style XLSX parser | Same | Re-export to flat |
| T31 | City Gate multi-year XLSX parser | Same — most complex (Y1/Y2 sheets + Mobilization sheet + FM Fees Summary) | Re-export per-year to flat |
| T32 | Emaar zone-style XLSX parser | Same — needs zone-collapse logic | Re-export to flat |

**v2.0 import path:** flat template (Task 33) handles all data shapes via the user re-exporting their existing XLSX into `fmplus-budget-flat-template-v2.xlsx` format.

## Manual smoke-test checklist

Run through after the SESSION_HANDOFF push lands and Vercel deploys (`limeinc.vercel.app`):

### A. Schema + foundation
- [ ] Open `https://limeinc.vercel.app/fmplus/financial/budget/projects` → Project Hub renders empty state with "+ New Contract" button (admin)
- [ ] Click "+ New Contract" → wizard renders 4 sections; analytic-account dropdown lists FMPLUS accounts (`company_id=1`)
- [ ] Submit form for a real FMPLUS project (e.g. AUC) with HK + Pest Ctrl service lines → redirects to `/edit?contract=<id>&year=1`
- [ ] Editor scaffold renders with year tabs (Y1 only), service tabs (HK / Pest / Revenue / Mobilization), 5 empty section accordions (Manning / PPE / Tools / Transport / IT), 1 Governmental section with "NEW in v2" amber border

### B. Editor + Catalog
- [ ] Click "+ Add line" on Manning section → modal opens with Catalog tab default
- [ ] Search "supervisor" → matches visible (since Catalog is HK-seeded with cleaning items, expect mostly bin/cloth matches if any; switch to Free-text tab if no manning items in catalog yet)
- [ ] Add a free-text line → row appears in section
- [ ] Click expand on a manning row → CTC breakdown panel renders with 6 inputs + threshold override
- [ ] Edit CTC values → "Save CTC" persists, sum updates `unit_cost` automatically
- [ ] Switch to Revenue tab → enter monthly revenue per service, save → returns to grid
- [ ] Switch to Mobilization tab → "+ Add line" → enter capex with 24-month amortization → save
- [ ] Click "Save Draft" → no-op (lines persist via individual actions); page refreshes
- [ ] Click "Publish Y1" → confirms, status flips to published

### C. Year + Copy
- [ ] Click "Add year" in year tabs → blank Y2 created, switches to Y2
- [ ] Click "Copy year" → dialog opens with 3 inflation knobs (defaults from Settings) + Tweak per line panel
- [ ] Adjust knobs / override one line → projected target totals update live
- [ ] Commit → new Y3 (or whichever next index) created with inflated values; redirects there
- [ ] Audit log row created (`budget_audit`) with the inflation knobs + per-line overrides

### D. Catalog
- [ ] Open `/fmplus/financial/budget/catalog` → 76 seeded items render
- [ ] Search "garbage" → filters to bag/bin items
- [ ] Click a row → override side panel shows item details + contract picker
- [ ] Pick a contract + enter override price → save → "Other overrides" list updates
- [ ] Click "Bulk import" → upload an XLSX with same Items Pricelist structure → diff summary shows added/updated/archived counts

### E. Variance
- [ ] Open `/fmplus/financial/budget/variance` → contract picker if no `?contract=` param
- [ ] Pick the AUC contract → grid renders 5+ category rows × 12 months
- [ ] Cells with non-zero actuals are colored (green/amber/red) based on ±5% / >15% thresholds
- [ ] Click a non-zero cell → drill drawer slides in with `odoo_move_lines` list (date / account / partner / amount)
- [ ] Click "📊 XLSX" or "📄 PDF" buttons → file downloads with formatted variance grid

### F. Compare
- [ ] Open `/fmplus/financial/budget/compare?mode=projects&service=hk` → all HK contracts ranked by variance %
- [ ] Toggle to "Year-vs-Year" → eligible contracts (≥2 years) listed → pick one → category × year grid

### G. Settings
- [ ] Open `/fmplus/financial/budget/settings` → form renders with current defaults (5 / 15 / initial / 7 / 10 / 5 / 24 / en)
- [ ] Edit thresholds → "green must be < amber" client-side validation works
- [ ] Save → returns; refreshing page shows persisted values
- [ ] Template summary table lists all 7 services with correct line counts
- [ ] Unmapped accounts section shows recent Odoo accounts not in any template's `account_map_json` (best-effort sample)

### H. Import
- [ ] Open `/fmplus/financial/budget/import` → uploader visible (admin)
- [ ] Click "Download blank template" → empty XLSX with v2 header row downloads
- [ ] Fill in a few rows → upload → "Preview & Validate" → diff summary shows contract/year exists checkmarks
- [ ] If contract+year exists → "Commit N lines" → confirms then commits → editor reflects changes
- [ ] Upload a non-flat XLSX (e.g. raw Emaar Uptown) → preview shows clear "v2.1 deferred" message + sheet names

### I. Bilingual
- [ ] Click EN/ع toggle in layout header → page direction flips to RTL
- [ ] Catalog table shows Arabic labels next to English (when `name_ar` set)
- [ ] Editor section accordion shows Arabic category names (e.g. "العمالة" for Manning)

### J. Build health
- [ ] `npx tsc --noEmit` returns 0 errors in `src/lib/fmplus/budget/` and `src/app/fmplus/financial/budget/`
- [ ] `npm run test` — all vitest suites pass (skipped integration tests gated by `FMPLUS_BUDGET_INTEGRATION=1`)
- [ ] No regressions on FMPLUS Financials page (`/fmplus/financial/*` other routes untouched)
- [ ] Vercel deploy `limeinc.vercel.app` returns 200 for all 8 tabs

## Known limitations / quirks (v2.0)

1. **Mob amortization is computed but not folded into per-category cells** — variance shows mob spend separately at the segment level. Future v2.1 could distribute mob across categories.
2. **Variance computation is flat-monthly** — `qty × unit_cost` replicated across all 12 months. Seasonal multipliers (high/low) are template metadata but not yet applied to spread. Future v2.1 enhancement.
3. **No multi-currency** — EGP only, enforced by Zod and DB.
4. **Manpower ramp is JSON-edited as raw text** — UI minimal; future v2.1 could add structured editor.
5. **Add Item modal in Catalog is disabled** — admin can edit existing items but UI for adding net-new items is deferred (use Bulk Import for now).
6. **Inline qty/unit_cost edits in Editor are not yet wired** — Save Draft is a no-op refresh trigger. Editing happens via Add Line + CTC expand. Future v2.1 inline-edit.

## v2.1 follow-up roadmap

1. Rich XLSX parsers (T29-32) — AUC, TRIO, City Gate, Emaar zone layouts
2. Inline qty/unit_cost editing in Editor (Save Draft becomes a real bulk save)
3. Add Item modal in Catalog (vs Bulk Import only)
4. Mob amortization per-category distribution
5. Seasonal spread (high/low months differ)
6. Auto-rollover at FY end (cron-driven)
7. Year-over-year template suggestion ("propose Y3 from Y2 + actuals")

## Sign-off

This document marks **v2.0 plan completion**. The 4 deferred tasks (T29-T32) are tracked above as v2.1 work; they don't block production usability since the flat-template path covers all import scenarios via re-export.
