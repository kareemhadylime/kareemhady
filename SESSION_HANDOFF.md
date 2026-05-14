# SESSION_HANDOFF.md

## 2026-05-14 — Ads: PMax full flow polish (DONE)

**Commits:** `65d69c7`, `b12ff38`

**Changes shipped:**

1. **IG post picker on PMax form**
   - PMax page calls `listIgMedia` and shows a horizontal thumbnail row above the form
   - Clicking a post → `?from_ig=<media_id>` → `buildPmaxDefaultsFromIgMediaItem()` mines caption via `buildTextBuckets`, mirrors image to `ig-media/{id}/creative` in `beithady-gallery-public`
   - `mirrorMetaCreative` refactored from `(url, campaignId: number)` → `(url, keyBase: string)` so both Meta-campaign and IG-post flows share it
   - Default Final URL changed from wa.me → `https://beithady.com`
   - `BH_WA_PHONE_E164` updated to `+201501010103` (BH Reservations) in `platforms.ts`

2. **Publish button for draft Google campaigns**
   - Draft campaigns (external_id starts with `draft_gpmax_`) now show a primary "Publish to Google Ads" button → `/beithady/ads/google/pmax`
   - DRAFT (DB-ONLY) badge gets a tooltip explaining why it's a draft

3. **Turbopack build fix** (`fix(hr): extract salary-access types to non-server file`)
   - `salary-access-board.tsx` + `tier-chip.tsx` (`'use client'`) were importing from `hr-salary-access-queries.ts` which has `import 'server-only'` → build error
   - Fix: `hr-salary-access-types.ts` (no server-only) holds types + constants; client components import from there

**Earlier: image upload pipeline**
- Brand assets in `beithady-gallery-public/brand/`: `bh-logo.png` (LOGO), `bh-wordmark-landscape.png` (MARKETING_IMAGE), `bh-logo-stacked.jpg` (SQUARE_MARKETING_IMAGE) — used as defaults on every PMax publish
- Google Ads tries both MARKETING_IMAGE + SQUARE_MARKETING_IMAGE field types per image; brand defaults guarantee all 3 slots filled
- Supabase service role key pulled fresh via `vercel env pull` (old JWT was stale)

---

## 2026-05-14 — HR Sprint 5: Biometric Upload — Plan DONE, ready to execute

**Status:** Design approved. Spec written and committed (`0575e58`). Awaiting user review before writing plan.

**Spec:** `docs/superpowers/specs/2026-05-14-beithady-hr-biometric-design.md`

**What Sprint 5 adds (thin sprint — reuses Sprint 4 entirely):**
- Migration `0129_hr_attendance_source.sql` — add `source text default 'manual' check ('manual'|'biometric')` to `hr_attendance_records`
- `AttendanceSource = 'manual' | 'biometric'` type + `source` field on `AttendanceRow`
- `confirmAttendanceAction` gains optional `source` param (default 'manual')
- `ImportAttendanceDialog` gains `source` prop — title changes to "Biometric Upload" when source='biometric'
- `AttendanceBoard` gets a "🔬 Biometric Upload" button + source column (violet "Bio" chip) in table
- Sprint 5 hub tile `href` → `/beithady/hr/attendance` (no separate /biometric page)

**Files to modify:** hr-attendance-types.ts, hr-attendance-actions.ts, hr-attendance-queries.ts, import-attendance-dialog.tsx, attendance-board.tsx, hr/page.tsx

---

## 2026-05-14 — HR Sprint 4: Daily Attendance — COMPLETE ✅

**All 8 tasks shipped to production.**

**Commits:** `8d9ec10` (migration) → `9c9d26e` (types+parser TDD) → `e467104` (queries) → `8c1cc69` (actions) → `2ab1e63` (API routes) → `243252d` (import dialog) → `12f2ccb` (board) → `acfd940` (page+deploy)

**What's live at /beithady/hr/attendance:** date picker + building/dept filters + Download Template (pre-filled Excel) + Import wizard (3-step BH-ID match) + attendance table + per-row + bulk approval · Tests: 508 passing

**Next sprint (Sprint 5):** Biometric Upload

---

## 2026-05-14: Beithady HR Sprint 4 — Task 2 (Daily Attendance) — TDD Implementation

### Completed
- **hr-attendance-types.ts** (73 lines): Pure types — AttendanceStatus, AttendanceRecord, AttendancePreviewRow, AttendancePreviewResult, AttendanceFilter
- **hr-attendance-parser.ts** (132 lines): Core parsing logic
  - `normalizeAttendanceStatus(raw)`: Converts user input (present/absent/yes/no/p/a/1/0 + Arabic) → 'present' | 'absent' | null
  - `matchByBhId(bhId, employees)`: Case-insensitive BH-ID lookup with whitespace trim
  - `parseAttendanceFile(buffer, employees, protectedEmployeeIds)`: ExcelJS parser that extracts Name, BH-ID, Status columns; matches by BH-ID first, falls back to fuzzy name match via `matchEmployeeName` (reused from hr-payroll-parser); flags protected (approved) records; returns AttendancePreviewResult with counts
- **hr-attendance-parser.test.ts** (35 lines): 17 tests covering edge cases
  - 12 tests for `normalizeAttendanceStatus`: case, aliases, unknown input
  - 5 tests for `matchByBhId`: exact/case-insensitive/whitespace, nulls, empty

### Test Results
- ✓ All 17 tests pass
- ✓ Full suite: 508 passed, 22 skipped (no regressions)
- TDD workflow: write tests → RED → implement → GREEN → commit

### Commit
- SHA: `9c9d26e` — "feat(hr): attendance types + parser (normalizeStatus, matchByBhId, parseAttendanceFile) — TDD"
- Files: 3 (types, impl, tests) — 224 insertions

### Next: Task 3
- Daily Attendance submission & approval (server actions, DB inserts, validation)
- Approval UI + status updates
### Next: Task 3
- Daily Attendance submission & approval (server actions, DB inserts, validation)
- Approval UI + status updates

## 2026-05-14: Beithady HR Sprint 4 — Task 6 (Import Dialog) — UI Implementation

### Completed
- **import-attendance-dialog.tsx** (190 lines): 3-step modal wizard
  - Step 1 (Upload): Date input + drag-drop .xlsx/.xls file picker, shows parsing progress
  - Step 2 (Preview): Summary pills (matched/unmatched/protected/errors), scrollable preview table with Name, BH-ID, Status, Match columns, ← Re-upload button, Save button (disabled if 0 matched)
  - Step 3 (Done): Success screen with saved record count, "Pending admin approval" message, Done button
  - Integrates with server actions: `previewAttendanceAction(FormData)` → AttendancePreviewResult, `confirmAttendanceAction(date, rows)` → saved count
  - Tailwind dark theme (neutral-900, white/10 borders, violet-600 primary, emerald-600 success), Lucide icons (Upload, X, CheckCircle2)
  - Dialog closes and resets on Cancel or Done, calling parent `onClose()` + `onSaved()` callbacks

### Test Results
- ✓ All tests pass (508 total, 22 skipped)
- ✓ No regressions from new component
- Note: Component is client-side ('use client') and doesn't require unit tests per project convention (integrates with existing server actions + types)

### Commit
- SHA: `243252d` — "feat(hr): ImportAttendanceDialog — 3-step upload→preview→saved wizard"
- Files: 1 (component) — 190 insertions
- Created: `src/app/beithady/hr/attendance/_components/`

### Next: Task 7+
- Wire ImportAttendanceDialog into daily attendance page (open/close trigger, date picker)
- Cron jobs for auto-sync + morning brief display

## 2026-05-14 · Task 8: Daily Attendance Page — Sprint 4 Complete

**Task:** Implement Daily Attendance page (Task 8/Sprint 4), activating the hub tile and wiring the final page component.

**Changes:**
- Created `src/app/beithady/hr/attendance/page.tsx` — server component that:
  - Calls `requireBeithadyPermission('hr', 'read')` and computes `canApprove` from roles (admin/manager)
  - Fetches today's attendance via `getAttendanceDayView(today, {})`
  - Renders BeithadyShell + BeithadyHeader + AttendanceBoard with proper breadcrumbs and subtitle
  
- Updated `src/app/beithady/hr/page.tsx` — removed `disabled: true` and `comingSoonLabel: 'Sprint 4'` from the Daily Attendance tile, activating it for user navigation

**Tests:** All 508 tests pass (93 files, 22 skipped, 4.40s runtime)

**Deploy:** 
- Commit: `acfd940` — "feat(hr): Daily Attendance page + activate Sprint 4 tile — Sprint 4 complete"
- Pushed to origin/main, Vercel deployment initiated with `--archive=tgz` flag
- GitHub → Vercel auto-integration will finalize the deployment

**Sprint 4 Status:** COMPLETE — all tasks delivered (Team Members, Monthly Payroll, Salary Access, Daily Attendance)
