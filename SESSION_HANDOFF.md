

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

**Session complete.** All three V4 tasks delivered: migration applied, snapshot helpers created + tested, cron extended.
