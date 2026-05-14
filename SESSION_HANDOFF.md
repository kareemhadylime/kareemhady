## 2026-05-14 — HR Sprint 2 Task 9: Batch Payslip PDF Route DONE

**Commit:** `8a93daa` — feat(hr): batch payslip PDF route — POST /api/hr/payslips/batch + pdf-lib merge

**Files created (1):**
- `src/app/api/hr/payslips/batch/route.ts` — `force-dynamic`, `maxDuration=120`, auth-gated, accepts `{ monthId, filters }` (building_codes, departments, exclude_terminated), fetches entries via `getMonthEntries` + `getPayrollMonth`, renders each payslip with `PayslipEn`/`PayslipAr` via `renderToBuffer` per `payslip_language`, merges all single-page PDFs into one document using `pdf-lib` `PDFDocument.copyPages`, returns `application/pdf` attachment named `payslips-{month}-{N}employees.pdf`.

**Dependencies added (1):** `pdf-lib@1.17.1`

**Verification:** tsc clean (0 errors) · 479 tests pass (1 pre-existing failure unrelated)

---

## 2026-05-14 — HR Sprint 2 Task 8: Individual Payslip PDF Route DONE

**Commit:** `3726514` — feat(hr): individual payslip PDF route — GET /api/hr/payslip/[entryId]

**Files created (1):**
- `src/app/api/hr/payslip/[entryId]/route.ts` — `force-dynamic`, `maxDuration=60`, auth-gated (`getCurrentUser`), joins `hr_payroll_entries` + `hr_employees` to get `payslip_language`, calls `entryToPayslipData` + `getPayrollMonth`, renders `PayslipEn` or `PayslipAr` via `renderToBuffer`, returns `application/pdf` with content-disposition filename `payslip-{bh_id}-{month}.pdf`. Two TS fixes applied: `any` cast on element (react-pdf `DocumentProps` mismatch), `buffer as unknown as BodyInit` (same pattern as fmplus budget PDF route).

**Verification:** tsc clean (0 errors) · 479 tests pass (1 pre-existing failure unrelated)

---

## 2026-05-14 — HR Sprint 2 Task 7: Bilingual Payslip PDF Templates DONE

**Commit:** `3a5d1e7` — feat(hr): bilingual payslip PDF templates — EN (LTR Helvetica) + AR (RTL NotoSansArabic)

**Files created (2):**
- `src/app/beithady/hr/payroll/_components/payslip-en.tsx` — English LTR A4 payslip, Helvetica font, `server-only`, `@react-pdf/renderer`, `readFileSync` logo pattern
- `src/app/beithady/hr/payroll/_components/payslip-ar.tsx` — Arabic RTL A4 payslip, NotoSansArabic font registration (`try/catch` silent degrade), `direction: 'rtl'`, `row-reverse` flex, Arabic labels + `ar-EG` number formatting

**Verification:** tsc clean (0 errors) · 479 tests pass (1 pre-existing failure unrelated)

---

## 2026-05-14 — HR Sprint 1 Retrofix: payslip_language field wired DONE

**Commit:** `61ed481` — feat(hr): Sprint 1 retrofix — payslip_language field on employee profile + Personal Info tab radio

**Files changed (4):**
- `src/lib/beithady/hr/hr-types.ts` — added `payslip_language: 'arabic' | 'english'` to `HrEmployee` and `PersonalInfoInput` types
- `src/app/beithady/hr/team/_components/personal-info-tab.tsx` — added payslip language radio group between Email and Company ID fields
- `src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx` — `emptyPersonal()` defaults to `'arabic'`; `employeeToPersonal()` maps `emp.payslip_language`
- `src/lib/beithady/hr/hr-actions.ts` — `payslip_language` included in both `addEmployeeAction` insert and `editEmployeeAction` update

**Verification:** tsc clean (0 errors) · 479 tests pass (1 pre-existing failure unrelated)

---

## 2026-05-14 — HR Sprint 2 Task 5: Payroll Server Actions DONE

**Commit:** `c1aa3b9` — feat(hr): payroll server actions — previewPayroll (no DB) + confirmPayroll (upsert+overwrite)

**Files created:**
- `src/lib/beithady/hr/hr-payroll-actions.ts` — `'use server'`. Exports: `previewPayrollAction` (parses Excel via `parsePayrollFile`, no DB writes) and `confirmPayrollAction` (upserts `hr_payroll_months` on `month_key`, overwrites `hr_payroll_entries` for that month, skips error rows, revalidates `/beithady/hr/payroll`).

**Verification:** tsc clean (0 errors) · 479 tests pass (1 pre-existing failure unrelated)

---

## 2026-05-14 — HR Sprint 2 Task 4: Payroll Server-Only Query Layer DONE

**Commit:** `c73e505` — feat(hr): payroll server-only queries — listMonths, getMonthEntries, entryToPayslipData

**Files created:**
- `src/lib/beithady/hr/hr-payroll-queries.ts` — server-only (`import 'server-only'`). Exports: `listPayrollMonths`, `getPayrollMonth`, `getMonthEntries` (with building/dept/terminated filters), `entryToPayslipData` (maps PayrollEntryRow → PayslipData for PDF templates).

**Verification:** tsc clean (0 errors) · 479 tests pass (1 pre-existing failure in bh-financials-snapshot-reminder, unrelated)

---

## 2026-05-14 — HR Sprint 2 Task 3: Payroll Excel Parser (TDD) DONE

**Commit:** `c587954` — feat(hr): payroll Excel parser — all columns + name-matching (TDD, 9 tests)

**Files created:**
- `src/lib/beithady/hr/hr-payroll-parser.ts` — exports `normalizeForMatch`, `matchEmployeeName`, `parsePayrollFile`. Imports `mapAnalyticToBuilding` + `isRedFill` from `hr-import.ts` (no duplication). NOT server-only.
- `src/lib/beithady/hr/hr-payroll-parser.test.ts` — 9 Vitest tests (4 normalizeForMatch, 5 matchEmployeeName)

**TDD steps completed:** test-first (fail) → implement → all 9 pass → full suite 479 passed 0 new failures → tsc clean

**Name matching strategy:** exact full-name → fuzzy (all employee words in sheet words) → first-name-only fallback (surfaces ambiguous) → unmatched

---

## 2026-05-14 — Ads: Campaign Status Auto-Sync + IG Boost Fixes (DONE)

**Commits this mini-session:**
- `2f1b8d3` — Auto-sync Meta campaign statuses on campaigns list page load: on every visit to `/beithady/ads/campaigns`, fetches `effective_status` from Meta for all active/paused Meta campaigns, patches DB where statuses differ, mutates in-memory array so render reflects correct status immediately. Non-fatal (try/catch).
- `d90adb3` — Enable Advantage+ audience (`advantage_audience: 1`) on all new IG boosts
- `a24d6a1` — Drop `instagram_actor_id` from `source_instagram_media_id` creative (the fix that made IG boost work — Meta infers actor from media ID)
- `59bee71` — Use `/instagram_accounts` endpoint for ig_actor_id resolution
- `59b703d` — Resolve ig_actor_id fresh from Meta API at boost time
- `edbb3de` — IG boost 3-bug fix (default→website link, wa.me fallback removed, source_instagram_media_id)
- `c1c23f6` — Live Meta Insights card on campaign detail page

**Current working state:**
- IG Boost: `source_instagram_media_id` (no `instagram_actor_id`), `destination_type: WEBSITE`, landing URL defaults to `https://beithady.com`, Advantage+ audience ON
- CTWA: WhatsApp connected to Beithady FB Page (+20 15 01010103), available via Destination dropdown
- Campaigns list: auto-syncs Meta status on every page load — stale ACTIVE rows get corrected to PAUSED/DELETED automatically
- Campaign "[Beit Hady] Boost 2026-05-14 05:53": ACTIVE · DELIVERING on Meta

**Deferred:** Google Ads account setup (original session request, never started)

---

## 2026-05-14 — BEITHADY HR MODULE SPRINT 1: COMPLETE ✅

### All 18 tasks shipped to production

**Commits (Sprint 1, today):** be9a179 → d5dbfab → b9840c1 → f3197cd → e98532d → b5cd585 → 4750543 → 0018d90 → a43f658 → 59a9590 → e6f6302 → 02d7b44 → a196f86 → c598907 → d251218 → (T16) → 4e90c0b → 4411054

**What's live at /beithady/hr:**
- Hub page: 11-tile launcher (Team Members active, Sprints 2–11 dimmed)
- /beithady/hr/team: Full FMPLUS-style employee roster
  - Search (EN/AR/NID/BH-ID), filter by dept/building/status
  - Add Member: right-side slide-over, 3 tabs (Personal Info, Contract & Payout, Timeline)
  - NID auto-fill: Egyptian 14-digit NID → DOB + gender auto-extracted on blur
  - Photo upload → Supabase Storage hr-photos bucket
  - Edit + Terminate (optimistic UI update)
  - Import Excel: 3-step wizard (upload → preview/toggle terminated → batch insert)
  - ⚠️ incomplete badge for employees missing NID/phone/DOB/date_joined

**DB tables live on Supabase bpjproljatbrbmszwbov:**
- hr_employees (BH-NNN company IDs via sequence)
- hr_employee_contracts (salary versioning via effective_from/effective_to)
- hr_employee_events (immutable audit timeline)
- hr_salary_access (5-tier RBAC, gating logic in Sprint 2)
- Trigger: hr_employees_touch (auto-updates updated_at)

**Tests:** 471 passing, 22 skipped (added 20 new: company ID, NID parser, import parser)

**⚠️ Manual action required:**
- Create `hr-photos` bucket in Supabase dashboard → Storage → New bucket (private)
  Without this, employee photo uploads return "Bucket not found" at runtime

**Next sprint (Sprint 2):** Monthly Payroll — Excel upload → parse → store → print payslips

---

## 2026-05-14 — SPRINT 2 BRAINSTORM IN PROGRESS

### Monthly Payroll — design questions answered so far:

**Q1 — Linking payroll to employee master:** A — auto-match by name (fuzzy), unmatched rows still import + print  
**Q2 — Payslip format:** A — Bilingual Arabic + English, @react-pdf/renderer (already installed)  
**Q3 — Monthly data management:** A — Overwrite on re-upload  
**Batch print:** Filter first (by building/dept) then print batch as one PDF  

### Full design presented (awaiting user approval):

**Section 1 — Page structure `/beithady/hr/payroll`:**
- Month picker dropdown + "Upload New Month" button
- Roster table: Name · BH-ID (matched/unmatched) · Position · Building · Net Salary · 🖨 per row
- "Print Payslips ▾" → filter drawer (building/dept) → batch PDF download

**Section 2 — Data model (2 new tables):**
- `hr_payroll_months` (id, month_key UNIQUE e.g. "2026-04", label, uploaded_at, uploaded_by)
- `hr_payroll_entries` (id, month_id FK, employee_id nullable FK, sheet_name, job_title, working_days, salary_package, ot, transport_allowance, bonus, travel_allowance, salary_in_advance, deduction, net_salary, building_code, analytic_raw, is_terminated, created_at, created_by)
- Re-upload = delete entries for month_key + re-insert (overwrite)

**Section 3 — Upload flow (3-step wizard):**
- Step 1: Drop .xlsx, parse ALL salary sheet columns
- Step 2: Preview with match status (✅ BH-ID matched / ⚠️ unmatched / 🔄 ambiguous dropdown / ❌ error)
- Step 3: Done summary (X saved, Y matched, Z unmatched)

**Section 4 — Payslip PDF (bilingual A4):**
- Header: Beithady logo + "SALARY SLIP · كشف مرتب" + Month EN+AR
- Employee section: Name, Position, BH-ID, Building, Working Days
- Earnings table: Basic Salary, OT, Transport, Travel, Bonus → Total Earnings
- Deductions table: Salary in Advance, Other → Total Deductions
- NET SALARY bold footer
- Signature lines: HR + Employee

**Status: Waiting for user approval of full design before writing spec**

## 2026-05-14 — OLDER CONTENT BELOW

### Ads Session: IG Boost + Live Meta Insights (DONE)

**Commits this session (oldest → newest):**
- `c1c23f6` — Live Meta Insights card on campaign detail page (`fetchMetaCampaignInsights`, `⚡ Live from Meta` card, parallel fetch)
- `edbb3de` — IG boost 3-bug fix: default→website link, `wa.me` fallback removed, switched to `source_instagram_media_id`
- `59b703d` — Resolve `ig_actor_id` fresh from Meta API at boost time
- `59bee71` — Use `/instagram_accounts` endpoint for `ig_actor_id` resolution (correct node type)
- `a24d6a1` — Drop `instagram_actor_id` from `source_instagram_media_id` creative (this was the fix that worked — Meta infers actor from media ID)
- `d90adb3` — Enable Advantage+ audience (`advantage_audience: 1`) on all new IG boosts

**Final working state:**
- IG Boost → Website link (default), `source_instagram_media_id` without `instagram_actor_id`, `destination_type: WEBSITE`, landing URL defaults to `https://beithady.com`
- CTWA → WhatsApp now connected to Beithady FB Page (+20 15 01010103), CTWA path available
- Campaign "[Beit Hady] Boost 2026-05-14 05:53" → ACTIVE · DELIVERING on Meta with actual post image + "Learn more" CTA
- All new boosts: Advantage+ audience enabled by default

**Known state:**
- The currently running boost campaign uses `object_story_spec.link_data` (old approach, still delivering fine)
- New boosts use `source_instagram_media_id` (correct, preserves post content)
- Google Ads account setup still deferred (original session request, never started)

---

### Task 17: TeamRoster client component (DONE)

- **`src/app/beithady/hr/team/_components/team-roster.tsx`** — new `'use client'` component. Receives `initialRows: HrEmployeeRow[]`. Features: live search (name/arabic/NID/BH-ID), department/building/status filter dropdowns, employee count badge, avatar + name + arabic RTL sub-line + BH-ID + status + warning badge table, row-click opens Edit dialog, MoreHorizontal context menu (Edit / Terminate), Add Member and Import buttons. Passes `events={[]}` to AddEditMemberDialog (Timeline tab shows empty — acceptable). Terminate calls `terminateEmployeeAction` and optimistically updates local state.
- tsc --noEmit: 0 errors. Tests: 471 passed (0 regressions).
- Commit: `4e90c0b`

---

### Task 18: Team Members server component page + Sprint 1 deploy (DONE)

- **`src/app/beithady/hr/team/page.tsx`** — Server Component. `force-dynamic`, calls `requireBeithadyPermission('hr','read')`, fetches `listEmployees({ pageSize: 200 })`, renders `BeithadyShell` + `BeithadyHeader` + `TeamRoster` with `max-w-7xl` container.
- tsc --noEmit: 0 errors.
- Tests: 471 passed, 22 skipped (90/93 test files) — no regressions.
- Commit: `4411054` — `feat(hr): Team Members page — server component, Sprint 1 complete`
- Pushed to `origin/main`. Vercel deploy: `lime-nlei5js1h-lime-investments.vercel.app` (production).
- **Sprint 1 complete.** All 18 tasks shipped.

### Task 16: importEmployeesAction + ImportDialog (DONE)

- **`src/lib/beithady/hr/hr-actions.ts`** — appended `importEmployeesAction` (+ exported `ImportResult` type); added `ImportRow` to the type import. Loops over rows, skips `validationState === 'error'`, inserts `hr_employees` + `hr_employee_contracts` + `hr_employee_events` for each valid row, dedupes `incompleteFields`, calls `revalidatePath`.
- **`src/app/beithady/hr/team/_components/import-dialog.tsx`** — new 3-step dialog (upload → preview+toggle → done). Step 2 shows stat chips, sortable table with toggleable terminated status per row. Fixed Lucide `title` prop TS error by wrapping icons in `<span title>`.
- tsc --noEmit: 0 errors. Tests: 471 passed (0 regressions).
- Commit: `e77e11a`

### Task 15: XLSX Import Parser — hr-import.ts (DONE, TDD)

Created via TDD (tests-fail-first → implement → all pass):

- `src/lib/beithady/hr/hr-import.test.ts` — 13 tests covering `mapAnalyticToBuilding`, `inferStatus`, `validateRow`
- `src/lib/beithady/hr/hr-import.ts` — implementation with:
  - `mapAnalyticToBuilding`: regex table mapping Odoo analytic names → `BuildingCode` (case-insensitive; returns null for unknowns)
  - `isRedFill(argb)`: detects red ExcelJS cell fills (R>180, G<100, B<100)
  - `inferStatus(isRedRow)`: terminated vs on_job
  - `validateRow(row)`: errors (missing name, negative salary) + incompleteFields (position, building_code) + validationState
  - `parseImportFile(buffer)`: async ExcelJS XLSX parser — auto-detects header row, reads Name/JobTitle/S.Package/Transport/Bonus/Analytic columns, applies red-row detection, returns `ImportPreviewResult`
- TDD result: 13/13 pass; full suite 471 passed (0 regressions); tsc --noEmit clean
- NOT server-only (safe for client-side preview use)

Commit: `d251218`

### Task 14: AddEditMemberDialog — 3-tab right slide-over (DONE)

Created `src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx`:
- Right-anchored full-height slide-over panel (max-w-2xl), backdrop + ESC + scroll-lock
- 3 tabs: Personal Info, Contract & Payout, Timeline
- Add mode (emptyPersonal/emptyContract defaults) and Edit mode (populates from HrEmployeeRow)
- Client-side validation before submission (first_name, department, position, job_role, building_code)
- Photo upload via `/api/hr/upload-photo` with uploading state
- Wired to `addEmployeeAction` / `editEmployeeAction` server actions via `useTransition`
- Error display in footer; auto-switches to tab containing the offending field
- TypeScript clean (tsc --noEmit zero errors)

Commit: `c598907`

### Task 9: HR Photo Upload API Route (DONE)

Created `src/app/api/hr/upload-photo/route.ts`:
- POST endpoint for multipart file uploads
- Validates: authentication, file size (<100 KB), image type (JPEG/PNG/WebP)
- Uploads to Supabase Storage bucket `hr-photos` (private)
- Returns public URL and storage path
- maxDuration=30 for Vercel timeout

**Note:** `hr-photos` bucket must be created manually via Supabase dashboard if not yet present. Code is correct; bucket creation is a one-time setup task separate from this deployment.

Commit: `59a9590`

### Task 13: Contract & Payout Tab Component (DONE)

Created `src/app/beithady/hr/team/_components/contract-payout-tab.tsx`:
- Client component for HR team member contract and salary details
- Displays contract type (permanent, fixed-term, hourly) with conditional contract-end field
- Building/cost center selector with label mapping
- Salary package input with history chips (last 3 contracts in top-right)
- Allowances: transport, travel, fixed bonus (3-column grid)
- Bank info section: bank name, payment method (bank/cash), account number, IBAN
- Helper Field component for label + input styling
- Full TypeScript type support; no errors
- Passes salary history as props for audit trail

Commit: `a196f86`

---

## 2026-05-14: Beithady HR Sprint 2 Task 1 — Payroll Migrations + Font (DONE)

### Deliverables

**Migrations**

- **Migration 0125** (`supabase/migrations/0125_hr_payslip_language.sql`): Added `payslip_language` column to `hr_employees` table with default 'arabic' and check constraint (arabic|english).
  
- **Migration 0126** (`supabase/migrations/0126_hr_payroll_tables.sql`): Created two new tables:
  - `hr_payroll_months`: Tracks uploaded payroll batches (id, month_key, label, uploaded_at, uploaded_by)
  - `hr_payroll_entries`: Individual payroll records with columns for salary components, building/analytic mapping, termination flag, audit timestamps
  - Added indexes on month_id and employee_id for query performance

Both migrations applied successfully to Supabase project `bpjproljatbrbmszwbov`.

**Verification** (via execute_sql):
- `payslip_language` column confirmed in `hr_employees` with default value `'arabic'::text` ✓
- Both `hr_payroll_months` and `hr_payroll_entries` tables present ✓

**Font Asset**

- Downloaded NotoSansArabic-Regular.ttf (variable font from GitHub raw) to `public/fonts/`
- File size: 825KB (valid TrueType font, 21 tables)
- Ready for Arabic payslip rendering in FMPLUS module

**Commit:** `8e12f38` — feat(hr): migrations 0125+0126 — payslip_language + payroll tables; NotoSansArabic font
