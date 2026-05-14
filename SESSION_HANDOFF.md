## 2026-05-14 — Sprint 9: Training & Certifications — COMPLETE ✅

**Status:** All 12 tasks done, code-reviewed, and deployed to production (Vercel dpl_83jLyerwWNXwHEJn3t9PVTnoghdf — READY).

**Commits (T1–T12 + review fixes):**
- `2d01b07` feat(hr): migration 0133 — hr_training_records table + hr-training storage bucket
- `d1781078` feat(hr): training types + formatTrainingDateRange helper — TDD
- `5b6860c` feat(hr): training server-only queries
- `2bd1ae3` feat(hr): training server actions — add, update, delete, setFile, getDownloadUrl
- `590ec59` feat(hr): training API routes — signed upload URL + by-employee records
- `78688da` feat(hr): extend hr-documents-expiry cron to include training/cert expiry alerts
- `5fa1d01` feat(hr): TrainingExpiryBanner component
- `92ff5bc` feat(hr): AddTrainingDialog — add/edit modal with type toggle and signed-URL file upload
- `0765c81` feat(hr): EmployeeTrainingList — expandable employee rows with training/cert chips + CRUD
- `b86da43` feat(hr): Training & Certifications page — expiry banner + employee training list
- `9be9d9d` feat(hr): Training tab on employee profile drawer
- `44ac044` feat(hr): Training & Certifications page + activate Sprint 9 tile — Sprint 9 complete
- `21c427e` fix(hr): add requireBeithadyPermission('hr','read') to setTrainingRecordFileAction and getTrainingRecordDownloadUrl
- `324fe4b` fix(hr): code quality fixes — setTrainingRecordFileAction needs hr:full, lift RecordRow to module scope, add try/catch to by-employee route

**Tests:** 531 passed, 22 skipped — all clean

**What was built:**
- `/beithady/hr/training` page with expiry banner (3 tiers) + expandable employee list
- Full CRUD for training records and certifications per employee
- Signed-URL file upload flow (PDF/JPG/PNG ≤10 MB)
- Cron extended: `hr-documents-expiry` now includes training/cert expiry in digest + individual reminders
- Training tab added to employee profile drawer (lazy-loaded via API)
- HR hub tile activated (was disabled Sprint 9 placeholder)

**Review fixes applied:**
1. `setTrainingRecordFileAction`: upgraded from `hr:read` → `hr:full` (write action)
2. `TrainingExpiryBanner`: lifted `RecordRow` to module scope (was nested inside function body)
3. `by-employee` route: added try/catch around `getEmployeeTrainingRecords`

**Deployed:** pushed to `origin/main`, `vercel --prod --archive=tgz` running

---

## 2026-05-14 — Sprint 9 Task 11: Training tab on employee profile drawer — SHIPPED

**Commit:** `9be9d9d` feat(hr): Training tab on employee profile drawer

**Files created/modified:**
- `src/app/beithady/hr/team/_components/training-tab.tsx` — new component; fetches `/api/hr/training/by-employee` for the given employee, renders each record with type badge (using `RECORD_TYPE_LABELS`/`RECORD_TYPE_ICONS`), date range, expiry-status colour, and a download button backed by `getTrainingRecordDownloadUrl`. Links out to `/beithady/hr/training` for full management.
- `src/app/beithady/hr/team/_components/add-edit-member-dialog.tsx` — added `TrainingTab` import, extended `Tab` union with `'training'`, added `🎓 Training` entry to TABS array, added `{tab === 'training'}` content blocks (guarded by `employee?.id` presence).

**Tests:** 531 passed (97 test files), 0 failures.

---

## 2026-05-14 — TikTok: IG Stories support (cross-post) — SHIPPED

**Commits this turn:**
- `ce00b50` feat(tiktok): IG Reels picker — mirror IG video to Supabase, pre-fill caption + hashtags
- `5fbe785` feat(tiktok): add IG Stories as source — combined picker with reel/story tagging

**Files touched:**
- `src/lib/beithady/ads/meta-client.ts` — added `listIgStories(limit)` + `IgStoryItem` type (nested Page → ig_business_account → stories edge)
- `src/lib/beithady/ads/ig-to-tiktok.ts` — added `IgPickerItem` (kind: 'reel'|'story'), `listIgStoriesForTikTok`, `listIgPickerItems` (combined source), `buildTikTokDefaultsFromPickerItem`
- `src/app/beithady/ads/tiktok/organic/page.tsx` — picker now uses combined Reels + Stories source, renders with visual differentiation (violet for reels, rose + STORY badge for stories)

**Flow:**
1. Server fetches Reels (`media` edge) + currently-live Stories (`stories` edge, 24h window) in parallel
2. Picker shows both in horizontal strip; click → `?from_ig=<id>`
3. Server-side mirror downloads IG video → Supabase `beithady-gallery-public/ig-tiktok/<id>.mp4` (idempotent upsert)
4. Pre-fills form `video_url` + `caption` (with `#hashtags` extracted to hashtags field)
5. User clicks Publish → normal `publishTikTokReelAction` path

**Deployed.** Latest deploy auto-pushed via GitHub → Vercel. `app.limeinc.cc` last manually aliased to `lime-mkx8iqha6` earlier — may need re-alias to new deploy.

**Possible gotcha:** IG Stories endpoint may need `instagram_basic` + `pages_show_list` scopes. Empty list could mean "no live stories" or "missing scope". No diagnostic surfaced yet.

**Sandbox caveat unchanged:** Posts land in `beit.hady` test user's TikTok inbox until Production App Review approved (needs demo video).

---

## 2026-05-14 — TikTok publish "refresh_failed" self-healing UX — SHIPPED ✅

**Status:** SHIPPED in commit `115456f` — `fix(tiktok): self-healing refresh-failed UX`. Live on production (Vercel deploy Ready). Pending user action: re-OAuth via the new Reconnect link.

**Symptom:** /beithady/ads/tiktok/organic publish form returned banner `refresh_token: refresh_failed` after clicking Publish on IG Reel mirrored to TikTok.

**Real reason** (pulled from `ads_tiktok_posts.status_error` row id=1):
```json
{"error":"invalid_grant","error_description":"Refresh token is invalid or expired.","log_id":"20260514191739EAFBD9174F26FC1A7DBF"}
```
TikTok invalidated the refresh token server-side. Our DB optimistically tracked `tiktok_refresh_expires_at: 2027-05-14` but that's a cap, not the truth — TikTok rotates refresh tokens on every refresh call and the loser of any race keeps a dead token forever.

**Failing account:** `ads_accounts.id=4` ("Beithady Tiktok"), `tiktok_open_id: -000c31VaSdPq6nxvJBP634dyeogsRyQFPc3`. Token still in DB (will auto-clear on next failed refresh attempt thanks to fix C).

**Fixes shipped (commit `115456f`):**
- **A.** `src/app/beithady/ads/accounts/page.tsx` — TikTok rows now always show a "Reconnect" link (amber) beside "Configure", so re-OAuth is one click away even when a stored (now-dead) token exists.
- **B.** `src/app/beithady/ads/tiktok/organic/page.tsx` + `actions.ts` — when publish errors with `refresh_failed`, the error banner now renders an inline "Re-authenticate @account →" CTA pointing at `/api/auth/tiktok/start?account_id=...`. The failing `account_id` is preserved through the error redirect so the link still works after fix C empties `connected[]`.
- **C.** `src/lib/beithady/ads/tiktok-client.ts:refreshTikTokAccessToken()` — on TikTok responding `invalid_grant` or `invalid_token`, clears `tiktok_refresh_token`/`token_expires_at`/`refresh_expires_at` columns on the row. Logs to stderr with accountId + errCode. UI naturally surfaces Connect again.
- **D.** ~~Backslash typo in actions.ts:447~~ — false alarm; the backslashes I saw in grep output were Windows path prefix from ripgrep, not file content. File content is correct.

**D bonus skipped:** No code change needed.

**TS check:** `npx tsc --noEmit -p .` clean.

**User's next step:** Click "Reconnect" on /beithady/ads/accounts OR retry publish (fix C clears + fix B shows the link inline). Either path completes OAuth → fresh refresh_token stored → publish works.
