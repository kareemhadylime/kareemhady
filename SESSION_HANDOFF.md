# Kareemhady — Session Handoff (2026-05-17)

## 🔴 2026-05-17 — Fix: /beithady/ads build failure (form action return type) ✅

Two-step fix for `ai-summary-card.tsx` line 21:

1. **Turn 1 fix** (`94bd3b2`): replaced inline arrow with direct `generateAiSummaryAction` reference → fixed runtime serialization but broke TS build: `form action` expects `Promise<void>`, action returns `Promise<AiSummaryResult>`.
2. **Turn 2 fix** (`f56aaadb`): restored inline wrapper with `'use server'` directive so React can serialize it AND it returns `Promise<void>` (discards result):
   ```tsx
   <form action={async (fd: FormData) => { 'use server'; await generateAiSummaryAction(fd); }}>
   ```
   Build now passes. Production deploying.

---

## 🔴 2026-05-17 — Fix: /beithady/ads crash (inline arrow unserializable) ✅

**Bug:** `app.limeinc.cc/beithady/ads` showed "Something went wrong" for all users.
**Root cause:** `src/app/beithady/ads/_components/ai-summary-card.tsx` line 21 had:
```tsx
<form action={async (fd) => { await generateAiSummaryAction(fd); }}>
```
React 19 / Next.js 16 cannot serialize an inline arrow function as a form action — it throws `Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with 'use server'`, which crashed the entire page render.

**Fix:** Replaced with direct server action reference (commit `94bd3b20`):
```tsx
<form action={generateAiSummaryAction}>
```
`generateAiSummaryAction` is already exported from `actions.ts` (`'use server'` file) and accepts `FormData`, so the hidden `from`/`to` inputs still populate it correctly. Pushed + auto-deployed.

---

## 🟢 2026-05-17 — /push-all end-of-session sync ✅

- All five Lime repos verified clean and in sync with `origin/main`
- voltauto-pricing: committed + pushed `supabase/.temp/cli-latest` drift (commit `5e9ec36`)
- kareemhady local `main` fast-forwarded 2 commits from a concurrent session (personal email drill-down + HR template)
- No code changes this turn — admin/sync only

---

## 🟢 2026-05-17 — Email preview: HTML body + images

Added on-demand HTML email rendering to the Beithady inbox preview pane. Previously all emails showed plain text (images stripped at ingest). Now when you click an email in the preview pane, it fetches the full HTML body from Gmail API, sanitizes it server-side with `sanitize-html`, and renders it in a sandboxed `<iframe>` — images, tables, and formatting all display correctly. Scripts are blocked by `sandbox`. Falls back to plain text if the fetch fails.

**Files changed:**
- `src/app/personal/email/actions.ts` — added `fetchEmailHtmlAction` (Gmail API fetch + sanitize-html)
- `src/app/personal/email/_components/drill-down-view.tsx` — PreviewPane now auto-fetches + renders HTML iframe
- `package.json` / `package-lock.json` — added `sanitize-html` + `@types/sanitize-html`

---

## ✅ 2026-05-17 — BH HR: Employee Import Template (full field coverage)

Added a **Download Template** button inside the Import Team Members dialog (Step 1 upload screen). HR can now grab a pre-formatted `.xlsx`, fill in all employee details, and re-upload it.

**What shipped (commit `38620134` / `bf3aa9fd`):**
- **`GET /api/hr/employee-template`** — generates a styled Excel workbook with 18 columns (Name, Arabic Name, NID, DOB, Gender, Phone, Email, Department, Position, Building, Date Joined, Status, Salary Package, Transportation Allowance, Fixed Bonus, Contract Type, Payment Method, Bank IBAN), indigo header row, 2 grey example rows (with note to delete before uploading), in-cell dropdowns for enumerated fields (Gender, Department, Building, Status, Contract Type, Payment Method), frozen top-3 rows, and a Reference sheet with all valid values.
- **`ImportRow` type** extended with 11 new fields (arabic_name, national_id, date_of_birth, gender, phone, email, department, date_joined, contract_type, payment_method, bank_iban).
- **`hr-import.ts`** parser updated to detect and parse all 18 columns while remaining **backward-compatible** with the legacy Odoo salary sheet format (Name/JobTitle/S.Package/Analytic columns still work).
- **`importEmployeesAction`** now persists all newly parsed fields instead of always defaulting to `housekeeping` / `bank` / today's date. `date_joined` is used as both `date_joined` on the employee record and `contract_start`/`effective_from` on the contract. `incomplete_fields` now only flags what's actually missing in the imported row.
- **Import dialog** got a "Download Template" button with a Download icon, linking directly to the API route.

---

## 🟢 2026-05-17 — BH Ad Creatives: manual upload ✅ SHIPPED

Added drag-and-drop / click-to-browse upload to `/beithady/gallery/ad-creatives`. The `GalleryProvider` + `UploadTray` were already active for all of `/beithady`; the page just needed the `<Uploader category="ad_creative" />` component wired in (same pattern as the brand-library page).

**What changed:**
- `src/app/beithady/gallery/ad-creatives/page.tsx` — added `Uploader` import + upload section card above the asset grid; updated empty-state copy to direct users to the uploader
- Accepts JPG/PNG/WEBP/HEIC + MP4/WEBM; large videos auto-compressed; AI labels in ~2 min
- Files land in `beithady-gallery` (private bucket) under `ad-creatives/{date}/{id}.ext`; can be promoted to ad-eligible (public CDN) via the asset detail modal

**Commit:** `2cef1ced` — pushed to `origin/main`, Vercel auto-deploy triggered.

---

## 🟡 2026-05-17 — BH Ads Insights V4 (Sharing) — spec + plan + Tasks 1-5/20 shipped

Brainstormed V4 (Sharing — F1 public share link `/r/beithady/ads/<token>` + F2 PDF via browser print), wrote spec + 20-task TDD plan, and executed Tasks 1-5 via subagent-driven development. Mid-plan stop — 15 tasks remain.

**Decisions baked into the spec (kareem confirmed all):** snapshot scope = full mirror (overview + all 8 audience sub-tabs); PDF strategy = browser print (no @react-pdf, just print CSS on the /r/ page); fixed 48h expiry; AI summary force-regenerated per snapshot with graceful cap-skip (snapshot still ships); 5 share-links/user/day rate limit via `beithady_audit_log` count; render path = refactor each card into pure `<XxxView />` + thin fetcher wrapper so live + snapshot share the same view code.

**Tasks 1-5 shipped:**
- **Task 1** — migration 0141 `ads_dashboard_snapshots` table applied + verified (commit `1725d00e`)
- **Task 2** — `src/lib/beithady/ads/snapshot.ts` with `generateSnapshotToken()` (24-byte base64url, 32 chars), `AdsSnapshotPayload` type, `cleanupExpiredAdsSnapshots()` (commit `2a9ef08c`) + return-shape alignment fix to match daily-report pattern (commit `cd5e9f6f`) — 3 tests
- **Task 3** — extended `beithady-daily-report-cleanup` cron route to call both cleanup functions in `Promise.all` (commit `fd47e83a`)
- **Task 4** — `getAdsSnapshotData()` gathers all 13 dashboard slices + 3 provider statuses in parallel (19 promises), EGP-converts campaign spend, builds platform_status + audience_summary, returns `SnapshotGatherResult` (commit `4fa33f03`) + FX length-mismatch defensive guard from code review (commit `9fb0326a`) — 1 test (4/4 total in file)
- **Task 5** — `createAdsShareLinkAction` server action: ads:read permission, Cairo-midnight rate-limit count from `beithady_audit_log`, `getAdsSnapshotData` call with data_error guard, `generateAiSummary` call with graceful cap-skip (snapshot succeeds even on AI cap/error), assembles payload with `meta.schema_version=1`, inserts into `ads_dashboard_snapshots`, audit-logs `ads_share_link_created` (which IS the rate-limit ledger), returns `{ ok: true, token, url: /r/beithady/ads/<token>, expires_at, ai_skipped_reason? }` (commit `aeaa3f8a`) — 4 tests covering success / rate_limit / AI cap-skip / data_error

**Spec compliance:** all 5 tasks ✅ reviewed clean. **Code quality:** Tasks 1-4 ✅ approved (with minor inline fix applied to Task 2 return shape + Task 4 FX guard). **Task 5 code quality review NOT YET RUN** — implementer reported DONE + spec ✅ but the code-reviewer subagent dispatch was interrupted by session close.

**Adaptations the implementers made vs the plan (all sensible):** `getDashboardKpisWithCompare` takes `compare: boolean` not `string|null` (cast via `!== null`); `AiSummaryResult.error` discriminator is `'daily_cap_reached'` in real code (action normalises both `'daily_cap_reached'` and `'cap_reached'` to `'cap_reached'`); `AiSummaryResult` shape uses `.summary` not `.text` (action reads `.summary ?? .text`); `SessionUser` has no typed `.email` (cast defensively); rollup row types loosened to `Array<{ clicks: number }>` for reduce callbacks since `AdsSnapshotPayload` intentionally types slices as `unknown` to avoid circular imports. Anomalies cast to `AnomalyEvent[]` rather than the plan's loose shape.

**Spec + plan paths:**
- `docs/superpowers/specs/2026-05-17-bh-ads-v4-sharing-design.md` (commit `64b40386`, 428 lines)
- `docs/superpowers/plans/2026-05-17-bh-ads-v4-sharing.md` (commit `ca7d6e32`, 3042 lines, 20 TDD tasks with full code blocks)

**Commits this session (newest first):**
- `2d009ee8` chore(handoff): log Task 5 createAdsShareLinkAction complete (V4)
- `aeaa3f8a` feat(bh-ads): createAdsShareLinkAction — 5/day rate limit + graceful AI cap-skip (V4)
- `89199881` chore(handoff): log bh-ads FX length guard
- `9fb0326a` fix(bh-ads): fail loud on FX conversion length mismatch in snapshot gather
- `eefc03ae` chore(handoff): log V4 Task 4 — getAdsSnapshotData gather function
- `4fa33f03` feat(bh-ads): getAdsSnapshotData — gather all 13 dashboard slices (V4)
- `0ffd252d` chore(handoff): log task 3 complete — cleanup cron extended
- `fd47e83a` feat(bh-ads): extend cleanup cron to purge ads_dashboard_snapshots (V4)
- `8aeff97f` chore(handoff): log Task 2 code-review fix
- `cd5e9f6f` refactor(bh-ads): align cleanupExpiredAdsSnapshots return shape with daily-report pattern
- `66953ee7` chore(handoff): log Task 2 complete (snapshot.ts)
- `2a9ef08c` feat(bh-ads): snapshot.ts — token gen + payload type + cleanup (V4)
- `1725d00e` feat(bh-ads): migration 0141 — ads_dashboard_snapshots table (V4)
- `64b40386` docs: BH Ads V4 sharing design spec (approved by kareem)
- `ca7d6e32` docs: BH Ads V4 implementation plan (20 TDD tasks)

**State left in:** 5/20 tasks shipped to `origin/main` + auto-deployed to Vercel. Migration applied. **No user-facing surface yet** — the action exists but no UI button calls it (Task 19), no public route renders snapshots (Task 18), no view components extracted yet (Tasks 6-16). So sharing is not usable from `/beithady/ads/` until at least Tasks 6-19 land.

**Next session — resume from:**
1. **Task 5 code quality review** (run the deferred superpowers:code-reviewer agent against `aeaa3f8a` with base SHA `9fb0326a`). Likely surface: type-safety on the long action body, error message phrasing, deferred audit log writes if insert fails.
2. **Tasks 6-16: view+fetcher refactor of 13 cards** (mostly mechanical extraction — pure view component takes data as prop, existing card becomes thin wrapper that fetches + delegates). Plan has full code blocks for each. Use haiku for each — 5-10 min per card.
3. **Task 17: AdsSnapshotView composition** (sonnet — composes all 13 view components in fixed vertical layout with section breaks).
4. **Task 18: `/r/beithady/ads/[token]/page.tsx`** (sonnet — mirrors existing `/r/beithady/[token]` pattern with print toolbar + @page A4 CSS).
5. **Task 19: ShareLinkButton + dialog wire** (sonnet — client component with useState/useTransition, calls `createAdsShareLinkAction`, renders 5 dialog states: initial/loading/success/rate_limit/error).
6. **Task 20: final smoke + V4 SHIPPED handoff** (haiku — vitest + tsc verification, prepend V4 SHIPPED entry, commit + push).

Plan file is fully self-contained with verbatim code per task — a new agent can pick up at any task by reading the plan section.

---

## 🔵 2026-05-17 — Promoted `/handoff-push-all` + `/pull-all` skills to user scope

Cross-project tooling cleanup. The two skills lived under `.claude/skills/` in this repo, but they're explicitly multi-repo (cover all 5 Lime projects: kareemhady, fmplus-beta, voltauto-pricing, etsy-store, voltauto-website). Project-scope made them invisible in every project except kareemhady — `/handoff-push-all` couldn't be invoked from the ETSY workspace where the user was working.

Moved both folders out of this repo to `C:\Users\karee\.claude\skills\`, where they're loaded for any CWD on this machine. Net effect on this repo: two tracked files deleted.

**Commits this session:**
- (pending) — single commit covering both deletions + this handoff entry

**State left in:** deployed-equivalent (skills are harness config, not Vercel runtime code; GitHub→Vercel will auto-deploy this docs/.claude change but it has no app surface impact).

**Next session:** nothing pending on this front. If a future session re-creates project-scoped skills, prefer user-scope when the skill clearly spans multiple repos.

---

## 🟢 New `/beithady/analytics/pace` route — Pace Report (Guesty Business-On-The-Books parity) ✅ SHIPPED

Executed the full 18-task plan at `docs/superpowers/plans/2026-05-16-beithady-pace-route.md` via subagent-driven development. All tests pass (28/28 across 4 test files), full `npm run build` succeeds, brand-grep guard clean (only allowed `emerald-700`/`red-700` for delta badges).

**What landed:**

- **Lib** at `src/lib/pace-report/`:
  - `types.ts` — `PaceReportPayload`, `PaceKpi`, `DailyPerfRow`, `PickupCohortRow`, `PropertyRow`, `CityRow`, `PaceFilters`, `CohortBucket`, `COHORT_LABELS`
  - `date-ranges.ts` — `parsePeriod` (this-month / last-month / last-30-days / custom), `shiftPriorYear` (with leap-day clamp), `enumerateDays`, `daysBetween` — 10 unit tests
  - `cohorts.ts` — `bucketCohort(createdAt, checkIn)` → same/1mo/2mo/3-5mo/6+mo — 6 unit tests
  - `load-listings.ts` — server-only; pulls `guesty_listings` with country/city/tag/active filters; excludes MTL parents; normalizes Egypt/UAE country codes
  - `load-reservations.ts` — server-only; paginated 1000-row batches; USD-normalizes via `toUsd`; keeps cancellations with `is_canceled` flag
  - `aggregate.ts` — `aggregatePaceReport(input)` returns KPIs (revenue/booked_days/occupancy_pct/anr LY-vs-Selected), daily grid, pickup cohorts, per-property + per-city — 7 unit tests

- **Route** at `src/app/beithady/analytics/pace/`:
  - `page.tsx` — server component; parallel current/prior reservation queries; loads unfiltered listing universe for rail options
  - `_hooks/use-pace-url-state.ts` — `usePaceUrlState`, `parsePaceSearchParams`, `paceStateToSearchParams` — 5 unit tests
  - `_components/pace-shell.tsx` — lavender BH container, header with PeriodPicker, flex layout with main + FilterRail; empty-state when no data
  - `_components/tab-strip.tsx` — brand-locked generic tab primitive
  - `_components/period-picker.tsx` — This Month / Last Month / Last 30 Days + Custom range popover
  - `_components/filter-rail.tsx` — 260px right rail with Country (EG/AE), City, Tag chips + Display toggles
  - `_components/panels/pace-kpi-strip.tsx` — 4 paired bars (prior #a8b6d4 vs selected #003462) for Revenue / Booked Days / Occupancy / ANR
  - `_components/panels/daily-performance.tsx` — date × revenue/booked/reserved/bookable/available/occ/ANR with zebra rows + Grand Total
  - `_components/panels/pickup-cohort.tsx` — stacked bar by check-in month, 5-color legend (Guesty palette: #5b8bd6/#f1a07a/#e35a78/#9ec5b8/#6077a6), tabs for Revenue / Booked Days / ANR
  - `_components/panels/property-breakdown.tsx` — table with By Property / By City tabs; columns: Nickname, Unit Type, Revenue, Booked, Reserved, Bookable, Available, Occupancy, ANR, RevPAR

- **Tile** added to `/beithady/analytics` landing — slate accent, Activity icon, "New" gold badge.

**Phase-1 caveats** (encoded in types + docstrings):
- `reserved_days` always 0 — needs Guesty inquiry-hold sync (deferred to Phase 2 plan)
- `bookable_days` = `physical_units × period_days` — owner-block deduction deferred (same)
- BH-DXB included in scope (unlike daily report) since country is a user-driven filter

**Brand lockdown enforced**: every UI piece uses lavender `#eae9f3` bg with pattern overlay, navy `#003462` text, muted `#6077a6` secondary, `var(--bh-heading)` font, shared `PanelFrame` chrome. Only `emerald-700`/`red-700` for delta-up/down indicators (matches existing `stly-yoy.tsx`).

Ready for forward-deploy to production via auto-deploy on push.

---

## 2026-05-17 · BH Ads V4 — Migration 0141

**TASK 1 COMPLETE**: Created + applied migration 0141 (`ads_dashboard_snapshots` table).

- **File**: `supabase/migrations/0141_ads_dashboard_snapshots.sql` (27 lines)
- **Migration**: Applied via Supabase MCP to project `bpjproljatbrbmszwbov` ✓
- **Verification**: 7 columns confirmed (id uuid, token text, payload jsonb, generated_at timestamptz, generated_by_user_id uuid, expires_at timestamptz, deleted_at timestamptz)
- **Commit**: `1725d00e` — "feat(bh-ads): migration 0141 — ads_dashboard_snapshots table (V4)"
- **Push**: Pushed to origin/main ✓

Table mirrors `daily_report_snapshots` schema (token + payload + expires_at + deleted_at pattern). Auto-expires 48h after generation; hourly cleanup cron zeros payload + sets deleted_at.

**TASK 2 COMPLETE**: Created `snapshot.ts` helper with token generator, payload type, and cleanup function (TDD).

- **Files**: 
  - `src/lib/beithady/ads/snapshot.ts` (76 lines) — exports `generateSnapshotToken()`, `AdsSnapshotPayload` type, `cleanupExpiredAdsSnapshots()`, and `SNAPSHOT_SCHEMA_VERSION` constant
  - `src/lib/beithady/ads/snapshot.test.ts` (34 lines) — 3 vitest cases (token format + uniqueness, cleanup row count)
- **Tests**: All 3 passing ✓
  - `generateSnapshotToken returns 32-char base64url string`
  - `generateSnapshotToken returns unique values across calls`
  - `cleanupExpiredAdsSnapshots returns count of rows zeroed`
- **Commit**: `2a9ef08c` — "feat(bh-ads): snapshot.ts — token gen + payload type + cleanup (V4)"
- **Push**: Pushed to origin/main ✓

Token gen mirrors daily-report pattern (24 random bytes → base64url = 32 chars, 192-bit entropy). Payload type intentionally loosely-typed to avoid circular imports; Task 4 will assemble with real types. Cleanup mirrors `cleanupExpiredSnapshots()` from run.ts — zeroes payload (frees TOAST), sets deleted_at (soft delete for audit). Task 3 will wire into hourly cleanup cron.

**TASK 2 CODE-REVIEW FIX COMPLETE**: Aligned `cleanupExpiredAdsSnapshots()` return shape and cached `nowIso` for atomic timestamp.

- **Issue**: Return shape mismatch (Task 2 returned `{ deleted: number }`, but daily-report cleanup returns `{ ok: true; cleaned: number }`; Task 3 needs consistent shape to aggregate both)
- **Changes**:
  - `snapshot.ts`: Return type `Promise<{ ok: true; cleaned: number }>` + cached `nowIso` for both update + filter conditions
  - `snapshot.test.ts`: Updated test to assert `r.ok === true` + `r.cleaned === 2`
  - Enhanced JSDoc: "Return shape matches cleanupExpiredSnapshots from beithady-daily-report/run.ts so the cron route can aggregate both cleanly"
  - Error message: Changed from bare `.throw(error)` to `.throw(new Error(...))` for consistency
- **Tests**: All 3 passing ✓ (same 3 from Task 2 + updated 3rd test)
- **TypeScript**: No errors in snapshot files ✓
- **Commit**: `cd5e9f6f` — "refactor(bh-ads): align cleanupExpiredAdsSnapshots return shape with daily-report pattern"
- **Push**: Pushed to origin/main ✓

**TASK 3 COMPLETE**: Extended hourly cleanup cron to call `cleanupExpiredAdsSnapshots`.

- **File**: `src/app/api/cron/beithady-daily-report-cleanup/route.ts` (31 lines)
- **Changes**:
  - Added import: `import { cleanupExpiredAdsSnapshots } from '@/lib/beithady/ads/snapshot';`
  - Updated comment to document V4 ads snapshots cleanup (48h expiry, soft-delete pattern)
  - Changed handler to run both cleanups in parallel: `Promise.all([ cleanupExpiredSnapshots(), cleanupExpiredAdsSnapshots() ])`
  - Return shape: `{ daily: {...}, ads: {...} }` for clean aggregation
- **TypeScript**: No errors in modified file ✓
- **Commit**: `fd47e83a` — "feat(bh-ads): extend cleanup cron to purge ads_dashboard_snapshots (V4)"
- **Push**: Pushed to origin/main ✓

Cron runs hourly (per vercel.json, no changes needed). Bearer-auth check covers both cleanups. If either throws, route returns 500 + error; hourly retry on next tick.

**TASK 4 COMPLETE**: Implemented `getAdsSnapshotData` — gather all 13 dashboard slices in parallel (TDD).

- **Files**:
  - `src/lib/beithady/ads/snapshot.ts` — appended `SnapshotGatherInput`, `SnapshotGatherResult` types, and `getAdsSnapshotData()` function (exports parallel Promise.all of all 13 slices)
  - `src/lib/beithady/ads/snapshot.test.ts` — appended `describe('getAdsSnapshotData', ...)` block with `vi.resetModules()` + `vi.doMock` for all 15 imported modules
- **Tests**: All 4 passing ✓ (3 existing + 1 new)
- **TypeScript**: No new errors (2 pre-existing errors in unrelated `build-dxb-section.test.ts` / `build-yesterday-summary.test.ts`)
- **Commit**: `4fa33f03` — "feat(bh-ads): getAdsSnapshotData — gather all 13 dashboard slices (V4)"
- **Push**: Pushed to origin/main ✓ (rebased over concurrent commit first)

Key implementation note: `getDashboardKpisWithCompare` takes `compare: boolean`, not `'prev_period' | 'prev_year' | null`; converted via `compare !== null`. EGP conversion for campaign spend done upfront via `convertManyToEgp`. Platform status uses `platformConfigured(enabled, status, minKeys)` helper. FRT returns `null` when `total_leads === 0`. Cohort uses empty `{ buckets: [] }` placeholder. `vi.resetModules()` required before `vi.doMock` calls to prevent stale module cache from first `describe` block.

**Session complete (Tasks 1–4).** Ready for Task 5: `createAdsShareLinkAction` server action.

---

## 2026-05-17 · BH Ads V4 — Code-Review Fix: `getAdsSnapshotData` FX Length Guard

**CODE-REVIEW FIX COMPLETE**: Added defensive length check to `getAdsSnapshotData` after FX conversion.

- **File**: `src/lib/beithady/ads/snapshot.ts` (added 4-line guard between `campaignSpendEgp` assignment and `campaignsWithEgp` mapping)
- **Change**: Inserted length-validation guard:
  ```ts
  if (campaignSpendEgp.length !== campaigns.length) {
    throw new Error(
      `FX conversion length mismatch: ${campaigns.length} campaigns vs ${campaignSpendEgp.length} converted`,
    );
  }
  ```
- **Rationale**: `convertManyToEgp` must preserve array length. If FX rates fail partially and shorten the result, downstream `spend_egp: 0` would silently misreport campaign performance. Better to fail loud at snapshot-generation time than ship stale data to the dashboard.
- **Tests**: All 4 passing ✓ (existing test mocks return `[]` for both campaigns and converted rates, so `0 === 0` passes guard)
- **TypeScript**: No errors ✓
- **Commit**: `9fb0326a` — "fix(bh-ads): fail loud on FX conversion length mismatch in snapshot gather"
- **Push**: Pushed to origin/main ✓

---

## 2026-05-17 · BH Ads V4 — Task 5: `createAdsShareLinkAction`

**TASK 5 COMPLETE**: Implemented `createAdsShareLinkAction` server action with TDD.

- **Files**:
  - `src/app/beithady/ads/actions.ts` — added `AnomalyEvent` import, snapshot imports, and `createAdsShareLinkAction` export (+ `CreateShareLinkInput` / `CreateShareLinkResult` types)
  - `src/app/beithady/ads/actions.share-link.test.ts` — new test file with 4 vitest cases
- **Tests**: All 4 passing ✓
  - `success path returns token + URL + expires_at`
  - `rate_limit when audit log already has 5 entries today`
  - `graceful AI cap-skip — snapshot succeeds with ai_skipped_reason`
  - `data_error when getAdsSnapshotData throws`
- **TypeScript**: No new errors (2 pre-existing in `build-dxb-section.test.ts` / `build-yesterday-summary.test.ts`)
- **Commit**: `aeaa3f8a` — "feat(bh-ads): createAdsShareLinkAction — 5/day rate limit + graceful AI cap-skip (V4)"
- **Push**: Pushed to origin/main ✓

Key implementation adjustments vs spec:
1. `AiSummaryResult.error` is `'daily_cap_reached'` in real code; test mock uses `'cap_reached'`. Action normalises both to `'cap_reached'` in `ai_skipped_reason` (checks both strings).
2. `AiSummaryResult.ok=true` returns `summary` (not `text`). Action accesses both `.summary ?? .text ?? null` so mock compatibility is preserved.
3. `SessionUser` has no `email` field — used `(user as ... & { email?: string | null }).email ?? null` defensively.
4. Anomalies cast fixed from `Array<{ type, severity, message }>` to `AnomalyEvent[]` (AnomalyEvent also requires `platform` + `metric`).

Ready for Task 6: `/r/beithady/ads/[token]` public share route.
