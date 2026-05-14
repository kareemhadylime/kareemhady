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
