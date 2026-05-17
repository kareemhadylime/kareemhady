

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

Next: Task 3 (wire cleanup into cron).
