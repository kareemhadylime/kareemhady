## 2026-05-14 — TikTok publish "refresh_failed" diagnostic + UX fix (IN PROGRESS)

**Status:** Diagnostic complete. User approved fix bundle (A+B+C+D). Implementation pending.

**Symptom:** /beithady/ads/tiktok/organic publish form returned banner `refresh_token: refresh_failed` after clicking Publish on a video sourced from IG Reels picker. Error originated at [src/lib/beithady/ads/tiktok-client.ts:68](src/lib/beithady/ads/tiktok-client.ts:68) — `refreshTikTokAccessToken()` returning `{ ok: false, error: 'refresh_failed' }`.

**Real reason** (pulled from `ads_tiktok_posts.status_error` row id=1):
```json
{"error":"invalid_grant","error_description":"Refresh token is invalid or expired.","log_id":"20260514191739EAFBD9174F26FC1A7DBF"}
```
TikTok had server-side invalidated the refresh token. Our DB optimistically tracked `tiktok_refresh_expires_at: 2027-05-14` but that's a cap, not the truth — TikTok rotates refresh tokens on every refresh call and the loser of any race keeps a dead token forever.

**Account row:** `ads_accounts.id=4` ("Beithady Tiktok"), `tiktok_open_id: -000c31VaSdPq6nxvJBP634dyeogsRyQFPc3`.

**Immediate manual workaround given to user:** Hit `/api/auth/tiktok/start?account_id=4` directly to re-OAuth.

**UX bugs identified + user approved fix:**
- **A.** Accounts page only shows "Connect →" when `!r.tiktok_refresh_token` — when token IS set but dead, no UI path to recover. Add a "Reconnect" link that's always available.
- **B.** Publish page error banner is a dead-end string. Add inline "Re-authenticate" CTA when error includes `refresh_failed`.
- **C.** Auto-clear the dead token + log when refresh returns `invalid_grant` so the UI naturally shows Connect again.
- **D.** Bug at [src/app/beithady/ads/actions.ts:447](src/app/beithady/ads/actions.ts:447): redirect path uses backslashes — `redirect(\`\beithady\ads\tiktok\organic?...\`)`. `\b`=backspace, malformed URL; works only because browsers normalize it.

**Next:** Implement A+B+C+D in one commit, deploy, confirm fix shipping path works.

---

## 2026-05-14 — HR Training Server Actions (Sprint 9, Task 4)

**Status:** DONE

**What was done:**
- Created `src/lib/beithady/hr/hr-training-actions.ts` with five server actions:
  - `addTrainingRecordAction()` — insert new training record with validation
  - `updateTrainingRecordAction()` — update fields with optional chaining
  - `deleteTrainingRecordAction()` — delete record and attached file
  - `setTrainingRecordFileAction()` — attach file to record
  - `getTrainingRecordDownloadUrl()` — generate signed download URL (60s TTL)
- All actions use `'use server'` directive, check auth via `getCurrentUser()` and `requireBeithadyPermission('hr', 'full')`
- File storage integrated with `'hr-training'` bucket; cleanup on deletion
- `revalidatePath('/beithady/hr/training')` on mutations

**Tests:** 531 passed, 22 skipped (all passing)

**Commit:** `2bd1ae3` — feat(hr): training server actions — add, update, delete, setFile, getDownloadUrl

---

## 2026-05-14 — TrainingExpiryBanner Component (Sprint 9, Task 7)

**Status:** DONE

**What was done:**
- Created `src/app/beithady/hr/training/_components/training-expiry-banner.tsx` — display-only server component
- Banner filters training records into three severity buckets:
  - Critical: ≤7 days (red/🔴)
  - Warning: 8–30 days (amber/🟡)
  - Upcoming: 31–60 days (blue/🔵)
- Each record row displays employee name, icon+type, title, and expiry countdown
- Uses existing `daysUntilExpiry()` helper and training type constants/icons
- Zero external dependencies, pure display logic

**Tests:** 531 passed, 22 skipped (all passing)

**Commit:** `5fa1d01` — feat(hr): TrainingExpiryBanner — critical/warning/upcoming expiry alert for training records
