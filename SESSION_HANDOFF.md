# SESSION_HANDOFF.md

## 2026-05-14 — HR Sprint 9: Training & Certifications — Brainstorming IN PROGRESS

**All design decisions confirmed:**
- A: Combined table (`record_type`: 'training' | 'certification')
- Minimal + attachment: type · title · date · expiry_date · file · notes
- A: Extend existing `hr-documents-expiry` cron for expiry alerts
- A: Mirror Sprint 8 layout — Expiring Soon banner + expandable employee list + Add/Edit modal

**Data model approved:**
```sql
hr_training_records (id, employee_id, record_type, title, date, expiry_date, file_path, file_name, notes, created_by, created_at, updated_at)
```
Storage bucket: `hr-training` (private, signed-URL access)

**Page structure approved:**
- Expiring Soon banner (same tiers: 🔴≤7d 🟡8-30d 🔵31-60d)
- Expandable employee list with 🏅 Certification / 🎓 Training chips
- Add/Edit modal (type toggle, title, date, expiry, file upload, notes)
- Cron: extend `hr-documents-expiry` to include training records

**Spec written:** `docs/superpowers/specs/2026-05-14-beithady-hr-training-design.md` (commit `dd91c7a`)

**Plan written:** `docs/superpowers/plans/2026-05-14-beithady-hr-training.md` (commit `8f4b74f`) — 12 tasks

**Next step:** Execute plan (subagent-driven or inline)

---

## 2026-05-14 — HR Sprint 8: Documents & Compliance — COMPLETE ✅

**All 12 tasks shipped to production.**

**Commits:** `333a6d9` (migration) → `c3316c9` (types+TDD) → `1ada974` (queries) → `584e913` (actions) → `95eef1c` (upload-url) → `9ab3391` (cron+vercel) → `3b6b7bb` (ExpiringBanner) → `529ed0e` (AddDocumentDialog) → `844d04b` (EmployeeDocList) → `9606fa8` (page) → `a01419e` (team tab+by-employee) → `c321092` (activate+deploy)

**What's live at /beithady/hr/documents:**
- Expiring Soon banner (🔴 ≤7d · 🟡 8–30d · 🔵 31–60d)
- Searchable expandable employee list with document type chips (color-coded by expiry)
- Add/Edit modal with signed-URL file upload (PDF/JPG/PNG ≤10MB)
- File download via 60s signed URLs + delete with storage cleanup
- DST-safe 9 AM Cairo cron: HR WhatsApp digest + individual 25-30d/0-7d reminders
- Documents tab added to employee profile drawer in /beithady/hr/team
- 1 new DB table: `hr_employee_documents` + private `hr-documents` storage bucket
- Sprint 8 hub tile activated · Tests: 527 passing

**Next sprint (Sprint 9):** Training & Certifications

---

## 2026-05-14 — Meta ad non-delivery + sync diagnostic (advisory, no code)

**Status:** DONE (Q&A only — no code changes, no commits). Awaiting user go-ahead to ship fix.

**Thread 1 — Why Meta ad showed "Active" but $0 spent:**
- Initial guess (wrong date filter, narrow audience, country mix) — turned out user was viewing wrong date range. After fixing, ad showed real numbers: **$7.61 spent, 615 link clicks, 15,479 impressions, 14,045 reach** on a $50/day budget. Ad was fine; user-side date-picker issue.
- Earlier screenshots had shown "Unpublished edits" badge — flagged as likely cause; turned out moot since ad was actually delivering.

**Thread 2 — Why those Meta numbers aren't showing in our app dashboard:**

DB investigation via Supabase MCP:
- ✅ Campaign IS registered: `ads_campaigns` id=2, external_id=`120247361245980114`, name `[Beit Hady] Boost 2026-05-14 05:53`, status ACTIVE
- ✅ Today's sync (May 14 03:30 UTC) ran successfully — but `rows_upserted: 0`
- ❌ Prior 4 sync runs (May 10–13) all failed with `error: missing_credentials` — credentials only restored before May 14 run
- ❌ `ads_daily_metrics` for `platform='meta'` is **completely empty** (0 rows)

**Root cause identified** in `src/app/api/cron/beithady-ads-insights/route.ts:51`:
```ts
const yesterday = new Date(Date.now() - 86400e3).toISOString().slice(0,10);
// time_range = { since: yesterday, until: yesterday }
```
- Cron runs once daily at `30 3 * * *` (03:30 UTC / 05:30–06:30 Cairo)
- Only pulls **yesterday's** data, never today's
- When today's run fired, "yesterday" = May 13 → campaign was PAUSED → 0 rows
- Today's actual $7.61 spend won't sync until May 15 03:30 UTC run

**Bonus finding:** Meta token may have been short-lived user token (not system-user token) — caused 4 consecutive `missing_credentials` failures May 10–13. Worth verifying in Vercel env.

**Recommendation proposed (Option C):** One-line fix — change `time_range` to `{ since: yesterday, until: today }` so the cron upserts both rows each run. `onConflict: 'campaign_id,metric_date'` already handles overwrites safely. User asked to confirm before shipping.

**Repo state:** clean, no changes.

---

## 2026-05-14 — Documents tab on employee profile (HR Sprint 8 Task 11)

**Status:** DONE

**What was done:**
- Created `src/app/beithady/hr/team/_components/documents-tab.tsx` — read-only list of employee documents with expiry status badges and signed-URL download button; fetches from `/api/hr/documents/by-employee`
- Created `src/app/api/hr/documents/by-employee/route.ts` — `GET ?employee_id=` route backed by `getEmployeeDocuments()`, auth-gated via `getCurrentUser()`
- Modified `src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx`:
  - Added `'documents'` to `type Tab` union
  - Added `{ id: 'documents', label: '🗂 Documents' }` to `TABS` array
  - Added `DocumentsTab` render block (shows "save first" message in Add mode)
  - Added `import { DocumentsTab }` at top
- Variable names found: `employee` (prop, `HrEmployeeRow | undefined`); no `canManage` prop exists — passed `false` as constant

**Tests:** 527 passed (all passing)

**Commit:** a01419e — `feat(hr): Documents tab on employee profile + GET /by-employee API route`

---

## 2026-05-14 — AddDocumentDialog component (HR Sprint 8 Task 8)

**Status:** DONE

**What was done:**
- Created `src/app/beithady/hr/documents/_components/add-document-dialog.tsx`
- Handles both add and edit flows via `isEdit` flag driven by `editDoc` prop
- Orchestrates 3-step signed-URL file upload: insert record → GET upload URL → PUT to Supabase → update file path
- Form fields: employee select (add-only), doc type, title, doc number, issue/expiry dates, file picker (PDF/JPG/PNG ≤10 MB), notes
- Validation: employee required on add, title required; file size gate client-side
- `useTransition` for non-blocking async submit; inline error display
- Dark theme (`bg-neutral-900`, `border-white/10`) with `ix-input` CSS class throughout

**Tests:** 527 passed (all passing)

**Commit:** 529ed0e — `feat(hr): AddDocumentDialog — add/edit modal with signed-URL file upload`

**Next steps:** Wire AddDocumentDialog into the documents page (add button + row edit action).

---

## 2026-05-14 — ExpiringBanner component (HR Sprint 8 Task 7)

**Status:** DONE

**What was done:**
- Created `src/app/beithady/hr/documents/_components/expiring-banner.tsx`
- Displays expiring HR documents in three severity tiers (critical ≤7d, warning 8-30d, upcoming 31-60d)
- Uses Tailwind v4 dark theme with amber/red/blue alert colors
- Pure display component (no 'use client')
- Leverages `HrDocumentRow`, `DocType`, `DOC_TYPE_LABELS`, and `daysUntilExpiry` from hr-documents-types

**Tests:** 527 passed (all passing)

**Commit:** 3b6b7bb — `feat(hr): ExpiringBanner — critical/warning/upcoming expiry alert`

**Next steps:** Integrate ExpiringBanner into the Documents page layout.

## 2026-05-14 · Task 10: Documents & Compliance Page

**Status:** DONE

**Commit:** 9606fa8

**What:** Created `src/app/beithady/hr/documents/page.tsx` — the main Documents & Compliance page for Beithady HR Sprint 8.

**Implementation:**
- Enforced `requireBeithadyPermission('hr', 'read')` with admin/manager role detection
- Loaded expiring documents (60-day window) and employee document summary in parallel
- Mapped summary to employee list for EmployeeDocList component
- Wired ExpiringBanner (alerts on approaching expiries) and EmployeeDocList (searchable per-employee docs grid)
- Routed via BeithadyShell with breadcrumbs + standard HR eyebrow + title/subtitle

**Tests:** 527 passing

Next: HR Sprint 8 is complete—ready for activation and review.

## 2026-05-14 · Task 12: Documents & Compliance Tile Activation (Final Sprint 8)

**Status:** ✅ COMPLETE

**Work completed:**
- Edited `src/app/beithady/hr/page.tsx` to activate Documents & Compliance tile
- Removed `disabled: true` and `comingSoonLabel: 'Sprint 8'` from tile object
- Tests: All 527 passing (no change to test count)
- Commit: c321092 (`feat(hr): Documents & Compliance activate Sprint 8 tile — Sprint 8 complete`)
- Deploy: Vercel production deployed successfully (Ready status)

**Sprint 8 Status:** ✅ ALL TASKS COMPLETE
- Task 1: Documents page ✅
- Task 2: ExpireDocumentsDialog ✅
- Task 3: DocumentsTable ✅
- Task 4: Documents tab on profile ✅
- Task 5: GET /by-employee API ✅
- Task 6: Expiry cron + alerts ✅
- Task 7: HeadcountMonthlyAvg ✅
- Task 8: HeadcountMonthlyAvg grid integration ✅
- Task 9: HeadcountHistory ✅
- Task 10: HcComparison ✅
- Task 11: HeadcountMonthlyAvg picker + launch ✅
- Task 12: Tile activation ✅

---

## 2026-05-14 — HR Sprint 9: Task 2 — Training types + formatTrainingDateRange — TDD

**Status:** ✅ DONE

**What was done:**
- Created `src/lib/beithady/hr/hr-training-types.test.ts` with 4 test cases (TDD approach)
  - `formatTrainingDateRange(null, null)` → `'—'`
  - `formatTrainingDateRange('2026-03-01', null)` → `'Completed 2026-03-01'`
  - `formatTrainingDateRange(null, '2027-06-30')` → `'Expires 2027-06-30'`
  - `formatTrainingDateRange('2026-03-01', '2027-03-01')` → `'2026-03-01 → 2027-03-01'`
- Created `src/lib/beithady/hr/hr-training-types.ts` with:
  - Type definitions: `RecordType`, `HrTrainingRecord`, `HrTrainingRecordRow`, `EmployeeTrainingSummary`
  - Form inputs: `AddTrainingInput`, `UpdateTrainingInput`
  - Constants: `RECORD_TYPE_LABELS`, `RECORD_TYPE_ICONS`, `RECORD_TYPES`
  - Helper: `formatTrainingDateRange(date, expiryDate)`

**Test results:** 4/4 passing for new tests; full suite: 531 tests passing

**Commit:** d1781078af463a09e21e8e58f49f18a78c8b3ea4 — `feat(hr): training types + formatTrainingDateRange helper — TDD`

**Next step:** Task 3 — Queries for training records (getTrai, getEmployeeTrainingSummaries, getExpiringTrainingRecords)

---

## 2026-05-14 — HR Sprint 9: Task 3 — Training server-only queries

**Status:** ✅ DONE

**What was done:**
- Created `src/lib/beithady/hr/hr-training-queries.ts` — server-only module with 3 async query functions:
  - `getExpiringTrainingRecords(withinDays)` — fetch records expiring within N days; joins with `hr_employees` for name/phone; returns `HrTrainingRecordRow[]`
  - `getAllEmployeeTrainingSummary()` — fetch all active employees (non-terminated) + their training records grouped; returns `EmployeeTrainingSummary[]`
  - `getEmployeeTrainingRecords(employeeId)` — fetch all training records for one employee (team drawer); returns `HrTrainingRecord[]`
- All functions use `supabaseAdmin()` service-role client; error handling via `.throw()`
- Types imported from `hr-training-types.ts`

**Tests:** All 531 passing (no regression)

**Commit:** 5b6860c — `feat(hr): training server-only queries — getExpiringTrainingRecords, getAllEmployeeTrainingSummary, getEmployeeTrainingRecords`

**Next step:** Task 4 — Server actions for add/edit/delete
