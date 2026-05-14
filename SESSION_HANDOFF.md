# SESSION_HANDOFF.md

## 2026-05-14 — HR Sprint 8: Documents & Compliance — Brainstorming IN PROGRESS

**All design decisions confirmed:**
- C: Files + expiry metadata together
- Document types: `id` · `contract` · `police_report` · `military_certificate` · `other`
- B+C: Expiry on-page alerts + employee profile + HR daily digest WhatsApp + individual 30d/7d reminders
- A: Employee-centric page with Expiring Soon section + expandable employee rows

**Data model approved:**
```sql
hr_employee_documents (id, employee_id, doc_type, title, document_number, issue_date, expiry_date, file_path, file_name, notes, created_by, created_at, updated_at)
```
Storage bucket: `hr-documents` (private, signed-URL access)

**Page structure presented — awaiting user approval:**
- Expiring Soon banner (🔴 ≤7d · 🟡 8–30d · 🔵 31–60d)
- Searchable employee list with expandable rows + document chips
- Add/Edit modal (type, title, doc number, dates, file upload, notes)
- File download via signed URL (60s TTL)
- Delete: hr:full only

**Spec written:** `docs/superpowers/specs/2026-05-14-beithady-hr-documents-design.md` (commit `4f11621`)

**Plan written:** `docs/superpowers/plans/2026-05-14-beithady-hr-documents.md` (commit `0f4f62a`) — 12 tasks

**Next step:** Execute plan (subagent-driven or inline)

---

## 2026-05-14 — HR Sprint 7: Headcount Report — COMPLETE ✅

**All 10 tasks shipped to production.**

**Commits:** `beaf722` (migration) → `095a52a` (types+TDD) → `dc5c625` (queries) → `6b270ef` (cron+vercel) → `4ea7969` (API routes) → `26ea650` (HeadcountGrid) → `6065d96` (HcComparison) → `100d6a1` (HeadcountHistory) → `937b991` (HeadcountMonthlyAvg) → `d6382b3` (page+deploy)

**What's live at /beithady/hr/headcount:**
- Section 1: Live Today Grid — departments × buildings matrix with on_job counts + totals
- Section 2: HK & Security Comparison — actual per building + portfolio total vs HC Estimator planned
- Section 3: Daily Snapshot History — date range + building + dept filters
- Section 4: Monthly Averages — month picker + avg matrix with days-recorded indicator
- 1 new DB table: `hr_headcount_snapshots` (date, building_code, department, count)
- DST-safe cron: 9 AM Cairo daily, registered at UTC 06:00 + 07:00
- Sprint 7 hub tile activated on /beithady/hr
- Tests: 517 passing

**Next sprint (Sprint 8):** Documents & Compliance

---

## 2026-05-14 — TikTok Setup — IN PROGRESS (Sandbox path)

**Latest progress:**
- Build error fixed: removed invalid ProviderId cases (`anthropic`/`stripe`/`gmail`/`meta_ads` aren't in `ProviderId` type) — commit `d2ec7a5`, deployed
- `app.limeinc.cc` aliased to latest deploy `lime-o57y3rbh8` via `vercel alias set`
- TikTok integration card now shows **CONNECTED** with detail "app_id set · no access token yet — complete OAuth to enable posting" ✅
- Production OAuth attempt failed with `client_key` error → app is still in Draft state, Production OAuth requires App Review approval
- **Switched to Sandbox path:** Created sandbox "Beithady" with "Clone from Production" — needs Description (120 char) + ToS URL (`https://beithady.com`) + Privacy URL (`https://beithady.com`) + Platforms=Web → Apply changes
- After Apply: get Sandbox Client key + Client secret from App details (different from production), swap in `/admin/integrations` temporarily for OAuth testing

**Resume next session here:**
1. Sandbox form needs: description, ToS=`https://beithady.com`, privacy=`https://beithady.com`, Platforms=Web
2. **Delete Webhooks product** from Sandbox — cloned from Production but we don't use it, blocks form with required Callback URL. Trash icon next to "Webhooks" header.
3. Sandbox Login Kit Redirect URI already cloned: `https://app.limeinc.cc/api/auth/tiktok/callback` ✅
4. Click Apply changes
5. Sandbox → App details → copy Client key + Client secret
6. Update `/admin/integrations` → TikTok with sandbox creds
7. Add yourself as test user in Sandbox settings
8. Go to `https://app.limeinc.cc/beithady/ads/tiktok/accounts` → Add account → Connect OAuth
9. Verify limeinc.cc on TikTok URL properties (still pending TXT propagation)

**App:** "Beit Hady Dashboard" on developers.tiktok.com

**DNS TXT records (GoDaddy):**
- `beithady.com` → `tiktok-developers-site-verification=gaHLd6nsLbPoVAIaVBlkDMZxjqFUGfBg` ✅ VERIFIED
- `limeinc.cc` → `tiktok-developers-site-verification=bSbK9KEum4bwbDlno55fJ0mBLrrhuyXQ` ✅ DNS saved, needs "Continue to verify" click in TikTok URL properties

**App configuration done:**
- Products: Login Kit + Content Posting API (Direct Post ON)
- Scopes: `user.info.basic`, `video.publish`, `video.upload`
- Redirect URI: `https://app.limeinc.cc/api/auth/tiktok/callback`
- Credentials saved at `/admin/integrations` → TikTok Marketing API:
  - App ID: `awag4yuup3hnxq6n`, App secret: saved ✅
  - **Must tick "Enabled" checkbox and re-save**

**Code shipped — commit `e266b95`:**
- `src/lib/integration-tests.ts`: added `tiktok_ads` ping (checks creds, hits Business API if access_token present) + stubs for `google_ads`, `anthropic`, `stripe`, `gmail`, `meta_ads` (no more `unknown_provider` errors)

**Remaining steps:**
1. Tick "Enabled" on TikTok card at `/admin/integrations` → Save
2. Click "Continue to verify" for `limeinc.cc` in TikTok URL properties
3. OAuth flow at `/beithady/ads/tiktok/accounts` → get access token
4. Advertiser ID from TikTok for Business → enter at integrations for paid ads
5. App Review (description + demo video) → submit for production approval (not urgent)

---

## 2026-05-14 · HR Headcount Queries (Task 3)

### What was done
- Created `src/lib/beithady/hr/hr-headcount-queries.ts` with four server-only query functions:
  1. `getLiveHeadcount()` — live employee grid, grouped by building & department
  2. `getHcComparison()` — HK + Security actual vs HC Estimator planned, per operational building
  3. `getHeadcountHistory()` — historical snapshots with optional date/building/department filters
  4. `getMonthlyAvgHeadcount()` — monthly average headcount, returns rows + days recorded
- All functions use Supabase JS via `supabaseAdmin()` and follow server-only pattern
- Integrated with `calculateHKWeeks()` for planned HK comparison
- Tested: 517 tests pass
- Committed: `dc5c625`

### Status
DONE — ready for next task


## 2026-05-14 · HR Sprint 7 Task 4: Headcount Snapshot Cron

✅ **COMPLETE** — Created `src/app/api/cron/hr-headcount-snapshot/route.ts` + vercel.json schedule

**Files delivered:**
- **`src/app/api/cron/hr-headcount-snapshot/route.ts`** — Daily 9 AM Cairo cron handler
  - Auth: Bearer token + ?force=1&secret fallback for manual testing
  - Cairo hour gate: `Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false })`, skips unless hour == 9
  - Groups `hr_employees` by `building_code + department` (status == 'on_job'), counts, upserts to `hr_headcount_snapshots` with `date,building_code,department` as conflict key
  - Empty count list returns `upserted: 0`; otherwise returns actual count
- **`vercel.json`** — Added 2 cron entries:
  - `{ "path": "/api/cron/hr-headcount-snapshot", "schedule": "0 6 * * *" }` — UTC 06:00 daily (covers DST spring)
  - `{ "path": "/api/cron/hr-headcount-snapshot", "schedule": "0 7 * * *" }` — UTC 07:00 daily (covers DST fall)

**Tests:** All 517 passing (95 files, 3 skipped)

**Commit:** 6b270ef (`feat(hr): headcount snapshot cron (9 AM Cairo DST-safe) + vercel.json schedule`)

**Deploy:** Auto-deployed via GitHub → Vercel on main push


## 2026-05-14 · HR Sprint 7 Task 6: HeadcountGrid Component

✅ **COMPLETE** — Created `src/app/beithady/hr/headcount/_components/headcount-grid.tsx`

**File delivered:**
- **`src/app/beithady/hr/headcount/_components/headcount-grid.tsx`** — Live headcount dept×building matrix
  - Props: `{ cells: GridCell[] }` (from `getLiveHeadcount()` query)
  - Renders table with departments (rows) × buildings (columns)
  - Cells: count bold white, 0 shows "—" dimmed (`text-white/20`)
  - Row totals per department, column totals per building
  - Footer with emerald highlight (`text-emerald-400` / `text-emerald-300`)
  - Sticky left header + responsive overflow
  - Dark theme: `bg-neutral-900`, `border-white/10`, `text-white`

**Tests:** All 517 passing (95 files, 3 skipped)

**Commit:** 26ea650 (`feat(hr): HeadcountGrid — live dept×building matrix with totals`)


## 2026-05-14 · HR Sprint 8 Task 2: HR Documents Types + Helpers (TDD)

✅ **COMPLETE** — Implemented document type system and expiry-status helpers using Test-Driven Development

**Files created:**
- **`src/lib/beithady/hr/hr-documents-types.ts`** — Pure types + constants + helpers (159 lines)
  - **Doc types:** `DocType` union (id, contract, police_report, military_certificate, other)
  - **Constants:** `DOC_TYPE_LABELS` mapping + `DOC_TYPES` array
  - **DB types:** `HrDocument`, `HrDocumentRow`, `EmployeeDocSummary`
  - **Form inputs:** `AddDocumentInput`, `UpdateDocumentInput`
  - **Expiry status:** `ExpiryStatus` enum + `EXPIRY_STATUS_COLORS` palette
  - **Helpers:**
    - `daysUntilExpiry(expiryDate: string | null): number | null` — calculates days until expiry (handles null, DST-safe via midnight UTC conversion)
    - `getExpiryStatus(expiryDate: string | null): ExpiryStatus` — returns status tier: `no_expiry | expired | critical (≤7d) | warning (≤30d) | upcoming (≤60d) | valid`

- **`src/lib/beithady/hr/hr-documents-types.test.ts`** — Test suite (10 tests)
  - Tests for `daysUntilExpiry()`: null, today (0), past (<0), future (>0)
  - Tests for `getExpiryStatus()`: null, expired, critical (5d), warning (20d), upcoming (45d), valid (90d)

**Test results:**
- `hr-documents-types.test.ts`: 10/10 PASS
- Full suite: 527 PASS (96 files, 22 skipped, 549 total)

**Commit:** c3316c9 (`feat(hr): documents types + daysUntilExpiry/getExpiryStatus helpers — TDD`)

**Deploy:** Auto-deployed via GitHub → Vercel on main push
