# SESSION_HANDOFF.md

## 2026-05-14 — Ads: Fix Google Ads credential chain (3 bugs) (DONE)

**Commits:** `1f64fe1`, `f675400`, `5212f8f`

**Bug 1:** `loadGoogleAdsCredentials()` looked for `refresh_token` in `integration_credentials` (not there) → `missing_credentials` → draft mode. Fix: accepts `accountRefreshToken` override; all callers pass `ads_accounts.google_refresh_token`.

**Bug 2:** `ads_accounts.google_refresh_token` is AES-256-GCM encrypted via `crypto.ts`. Was passing cipher bytes to Google's OAuth endpoint. Fix: `decrypt()` in `loadGoogleAdsCredentials` before use (try-catch for safety).

**Bug 3:** Error on form redirect was just `"step: error_code"` with no Google response detail. Fix: `result.raw` included in audit log + redirect URL. Error banner now scrolls into view automatically.

**Status:** All 3 fixes deployed (READY). User's last confirmed attempt was at 09:38 before any fix. Next attempt should succeed or show exact Google error in the banner.

---

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

## 2026-05-14 — HR Sprint 6: Leave & Overtime — Plan DONE, ready to execute

**Spec:** `docs/superpowers/specs/2026-05-14-beithady-hr-leave-ot-design.md` (commit `36195e2`)

**Design:** Single page `/beithady/hr/leave-ot` with two tabs:
- **Leave tab:** Year/employee filter · Pending requests (Approve/Reject, hr:full) · Balances table (Annual/Sick/Emergency, inline edit total_days)
- **OT tab:** Month/employee filter · Pending OT (Approve/Reject) · Approved history

**3 new tables:** `hr_leave_balances` (employee/year/type/total/used) · `hr_leave_requests` · `hr_overtime_records`
**Balance logic:** Approving annual/sick deducts days_count from used_days; emergency = no deduction
**5 server actions:** addLeaveRequest, reviewLeaveRequest, setLeaveBalance, logOvertime, reviewOvertime

**Next step:** User reviews spec → approve → invoke writing-plans

---

## 2026-05-14 — HR Sprint 5: Biometric Upload — COMPLETE ✅

**Commits:** `96dcd7a` (migration) → `3c4834c` (types+queries) → `292e60a` (action) → `1e46763` (dialog) → `527eda8` (board+tile+deploy)

**What's live:** `hr_attendance_records.source` column ('manual'|'biometric') · "Biometric Upload" button on attendance board (indigo, Fingerprint icon) → same 3-step wizard with "Biometric Upload" title · Source column in table ("Bio" chip / "Manual" text) · Sprint 5 hub tile → /beithady/hr/attendance · 508 tests passing

**Next sprint (Sprint 6):** Leave & Overtime

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

---
## 2026-05-14 · Task 2: Beithady HR Leave-OT Types (TDD)

**COMPLETED**: Task 2 of Beithady HR Sprint 6

### What was built:
- **`src/lib/beithady/hr/hr-leave-ot-types.ts`** — Pure types + helpers:
  - `LeaveType`, `ReviewStatus`, `LeaveBalance`, `LeaveRequest`, `OvertimeRecord` types
  - `LeaveRequestRow`, `OvertimeRecordRow`, `LeaveBalanceRow` row types
  - `AddLeaveInput`, `LogOtInput` input types
  - `LEAVE_TYPE_LABELS`, `REVIEW_STATUS_LABELS` constants
  - **`calcLeaveDays(start, end)`** — calendar-day calculator (inclusive range)

- **`src/lib/beithady/hr/hr-leave-ot-types.test.ts`** — 5 TDD tests:
  - Single day returns 1
  - Consecutive days inclusive
  - 4-day range
  - End before start returns 0
  - Month boundary (cross-month inclusive)

### TDD workflow followed:
1. ✅ Test file written first
2. ✅ Tests run → FAIL (module not found)
3. ✅ Implementation written
4. ✅ Tests run → PASS (all 5)
5. ✅ Full suite run → PASS (513 tests, 22 skipped)

### Commit:
- **SHA**: `5d5bd19`
- **Message**: `feat(hr): leave-ot types + calcLeaveDays helper — TDD`
- **Files**: 2 new, 121 insertions

Next: Task 3 (Leave request submission logic + API route).


## 2026-05-14 · Task 4: Beithady HR Leave-OT Actions (Server Actions)

**COMPLETED**: Task 4 of Beithady HR Sprint 6

### What was built:
- **`src/lib/beithady/hr/hr-leave-ot-actions.ts`** (190 lines) — Five server actions:

  1. **`addLeaveRequestAction(input: AddLeaveInput)`** — Submit a leave request
     - Auth: `getCurrentUser()` (hr:read level)
     - Validates: employee_id, dates, days_count > 0
     - Inserts into `hr_leave_requests` with status 'pending', submitted_by, submitted_at
     - Revalidates: `/beithady/hr/leave-ot`

  2. **`reviewLeaveRequestAction(requestId, decision: 'approved'|'rejected')`** — Manager approval/rejection
     - Auth: `requireBeithadyPermission('hr', 'full')` (hr:full level)
     - Fetches request, checks status != 'pending', updates with decision + reviewed_by/at
     - **Balance logic:** If approved + leave_type != 'emergency':
       - Extract year from start_date
       - Fetch `hr_leave_balances` row for (employee, year, leave_type)
       - If exists: increment `used_days` by days_count
       - If not exists: insert with total_days=0, used_days=days_count

  3. **`setLeaveBalanceAction(employeeId, year, leaveType, totalDays)`** — Allocate annual allotment
     - Auth: hr:full
     - Validates: totalDays ≥ 0
     - UPSERT on (employee_id, year, leave_type): set total_days
     - Used for HR initialization of annual/sick/emergency caps

  4. **`logOvertimeAction(input: LogOtInput)`** — Submit overtime log
     - Auth: getCurrentUser() (hr:read)
     - Validates: employee_id, date, hours > 0
     - Inserts into `hr_overtime_records` with status 'pending'

  5. **`reviewOvertimeAction(recordId, decision)`** — Approve/reject OT
     - Auth: hr:full
     - Updates status + reviewed_by/at, only if status == 'pending'

### Implementation pattern:
- `'use server';` at top
- Imports: revalidatePath, supabaseAdmin, getCurrentUser, requireBeithadyPermission, types
- All return `{ ok: boolean; error?: string }` for consistent error handling
- Type-safe queries via `.eq()`, `.single()`, `.maybeSingle()`, `.upsert()`
- Audit trail: submitted_by, submitted_at, reviewed_by, reviewed_at captured
- No calls to hr-leave-ot-queries.ts (queries are server-only, actions are direct DB)

### Tests:
- ✅ All 513 tests pass, 22 skipped (no new test files in this task)
- ✅ Full Vitest run: 4.19s

### Commit:
- **SHA**: `28fec59`
- **Message**: `feat(hr): leave-ot server actions — add/review leave, set balance, log/review OT`
- **Files**: 1 new, 190 insertions

**Sprint 6 Progress:** 2 tasks complete (Types, Actions); 3 remain (Queries, UI, Deploy).

## 2026-05-14 · Task 6: Beithady HR Leave-OT UI Dialogs

**COMPLETED**: Task 6 of Beithady HR Sprint 6

### What was built:
- **`src/app/beithady/hr/leave-ot/_components/add-leave-dialog.tsx`** (131 lines) — AddLeaveDialog modal:
  - 'use client' component with useState + useTransition for async server action calls
  - Employee selector, Leave Type buttons (annual/sick/emergency), start/end date inputs
  - Displays day count when both dates selected (using `calcLeaveDays` helper)
  - Optional reason textarea
  - Form validation (employee + dates required, end date must be >= start date)
  - Calls `addLeaveRequestAction(input)` on submit; resets form and closes on success
  - Dark theme: rose-600 button, neutral-900/white border, error handling with red-400

- **`src/app/beithady/hr/leave-ot/_components/log-ot-dialog.tsx`** (85 lines) — LogOtDialog modal:
  - 'use client' component with useState + useTransition
  - Employee selector, Date input (defaults to today), Hours input (0.5 step), optional reason
  - Form validation (employee + date required, hours must be > 0)
  - Calls `logOvertimeAction(input)` on submit; resets and closes on success
  - Dark theme: orange-600 button (OT-specific color), neutral-900/white border, error handling

### Pattern compliance:
- Both follow ImportAttendanceDialog pattern (reset(), handleClose(), 'use client')
- Fixed z-50 overlay with backdrop blur
- Tailwind dark theme (bg-neutral-900, border-white/10, text-white, text-white/50, etc.)
- Form inputs use 'ix-input' class
- Error display in red-400
- Modal returns null if !open (guard clause)
- Both reset state on close and after successful save

### Tests:
- ✅ All 513 tests pass, 22 skipped
- ✅ Full Vitest run: 4.04s

### Commit:
- **SHA**: `80d8726`
- **Message**: `feat(hr): AddLeaveDialog + LogOtDialog modals`
- **Files**: 2 new, 216 insertions (131 + 85 lines)

**Sprint 6 Progress:** 4 tasks complete (Types, Actions, UI Dialogs); 2 remain (Queries, Page+Deploy).
