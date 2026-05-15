## 2026-05-15 — BH Financials Partner Ledgers empty: diagnosed + Excel export feature requested

**User report:** Partner Ledgers page (`/beithady/financials/ledgers`) shows "No partners — try a different kind or import the ledger." across every tab (Suppliers, Owners, etc.) on the consolidated 2025-12-31 v1 snapshot.

**Root cause (verified via Supabase SQL):**
- `bh_balance_snapshots` for consolidated/2025-12-31: 1 frozen row (v1, frozen 2026-05-12) ✓
- `bh_balance_snapshot_accounts` for that snapshot: 87 rows ✓
- `bh_balance_snapshot_partners` for that snapshot: **0 rows** ✗
- `bh_balance_snapshot_partners` table-wide: **0 rows** (never populated for any snapshot)

The partners table is only populated by `commitClassifiedRows` in [src/lib/beithady/financials/xlsx-import.ts](src/lib/beithady/financials/xlsx-import.ts) — i.e. via the per-account Odoo partner-ledger xlsx uploader at `/beithady/financials/import`. The freeze RPC `bh_freeze_snapshot` in [0119_bh_freeze_rpcs.sql](supabase/migrations/0119_bh_freeze_rpcs.sql) only enforces accounts has rows, not partners. So v1 was frozen prematurely without ever importing the 8 partner ledgers (227002 Suppliers, 227002 Owner Payables, 122001 Customers, 113002 Landlords, 124005/124006/223001 Employees, 221001 Noteholders).

**Path forward presented to user (not yet executed):** (a) clone v1 via `bh_clone_snapshot_for_refreeze` to create v2 draft, upload the 8 xlsx files via `/beithady/financials/import`, freeze v2 (supersedes v1); or (b) harden `bh_freeze_snapshot` RPC to refuse freezing when partner-bearing accounts have zero imports.

**Mid-turn pivot:** User then said "Need also the ability for Formatted Excel Export" with a screenshot of the Snapshots detail page (`/beithady/financials/snapshots/[id]`) showing the 87-account table. Awaiting clarification on scope (which surfaces — snapshots, ledgers, both, all of /financials/*?) before implementing. `exceljs` already in deps.

**No code changes this turn. No DB writes.** Pure diagnosis + feature scoping.

---

## 2026-05-15 — Video-compress engine: implementation plan ready, awaiting execution choice

**Plan:** `docs/superpowers/plans/2026-05-15-video-compress-engine.md` — 10 tasks, full TDD where testable, exact diffs/code shown. Tasks: (1) install `@ffmpeg/ffmpeg@^0.12 @ffmpeg/util @ffmpeg/core` + vendor WASM core into `public/ffmpeg/`, (2) `probe-video.ts` (HTMLVideoElement metadata), (3) `bitrate-math + types` TDD with 11 pure-fn tests, (4) fast-path + `VideoCompressError` TDD with 5 tests, (5) ffmpeg orchestration with mocked deps (4 tests, 20 total in suite), (6) wire `'compressing'` state into `gallery-provider.tsx`, (7) render new state in `upload-tray.tsx` with amber `FileVideo` icon + percent, (8) update uploader helper text, (9) manual smoke test on dev server with real >50MB video, (10) ship.

**User approved the design spec** with "continue". Spec at `docs/superpowers/specs/2026-05-15-video-compress-engine-design.md`, commit `1b69314`.

**Awaiting:** User choice — subagent-driven (fresh agent per task with review checkpoints) vs inline execution. No code touched yet.

---

## 2026-05-15 — Video-compress engine: design spec written, awaiting user review

**Spec:** `docs/superpowers/specs/2026-05-15-video-compress-engine-design.md` — full design for client-side `compressVideoToFit(file, opts)` engine using `@ffmpeg/ffmpeg` v0.12 single-threaded WASM (avoids COOP/COEP, won't break Google OAuth or Stripe). 2-pass H.264 ABR targeting `maxBytes * 8 * 0.93 / duration_sec` minus 96 kbps AAC. Resolution ladder: keep source ≥2 Mbps, scale 720p between 800k–2M, scale 480p below. WASM core self-hosted under `public/ffmpeg/`, lazy-imported only when first oversized video lands, then service-worker cached.

**User confirmed** in turn 4: always fit ≤50 MB at best quality; silent auto-compress (no warnings, no caps even for long videos); engine + gallery uploader as first consumer; resolution auto-downscale instead of failing.

**Files in spec:** engine `src/lib/media/video-compress.ts` + colocated vitest test, public/ffmpeg/ vendored WASM, modifications to `gallery-provider.tsx` (new `compressing` job state), `uploader.tsx` (helper-text copy), `upload-tray.tsx` (render new state).

**Status:** Spec committed. Awaiting user review before invoking `superpowers:writing-plans` to produce the implementation plan. No code changes to the app yet.

---

## 2026-05-15 — Real screen recording compressed for TikTok upload

**User recorded** the publish flow with Xbox Game Bar (Win+G) — output saved as `C:\Users\karee\Videos\Captures\Lime Investments Dashboard - Google Chrome 2026-05-15 09-21-14.mp4`. TikTok portal rejected upload: file size 94 MB exceeds 50 MB cap.

**ffprobe revealed** Game Bar had captured at 2288×1440 / 240 fps / 6.7 Mbps — way over-spec for a screen recording of static UI.

**Compressed via ffmpeg** to `C:\Users\karee\Videos\Captures\tiktok-demo-compressed.mp4`:
- Scale 2288×1440 → 1920×1208 (lanczos)
- 240 fps → 30 fps
- libx264 -preset slow -crf 26 -pix_fmt yuv420p
- AAC 96k audio + +faststart
- Result: **6.4 MB** (15× reduction), 1:52 duration preserved, perceptually lossless for screen UI content
- Verified via ffprobe; Explorer opened with file selected for user

**User to upload** `tiktok-demo-compressed.mp4` in the TikTok App Review form (replaces my earlier mock-UI `demo.mp4` — real screen recording is much safer for TikTok approval).

**Offered followup:** cleanup of the original 94 MB recording. Awaiting user decision.

---

## 2026-05-15 — User asked where Windows screen recorder is

User is on Win 11 trying to find screen-recorder for the TikTok demo. Pointed at: Win+G (Xbox Game Bar) → Capture widget; Win+Alt+R direct hotkey; output lands in `C:\Users\karee\Videos\Captures\`. Snipping Tool (Win 11 22H2+) record mode also works. No code changes.

---

## 2026-05-15 — TikTok Developer Portal: App details + App Review form filled (in progress)

**Status:** No code changes. User is mid-submission in the TikTok Developer Portal "Beit Hady Dashboard" project. I gave paste-ready text for two screens.

**Screen 1 — App details (Production tab → Draft):**
- Description (≤120 chars): recommended `Internal CRM for Lime Investments' Beit Hady hospitality brand — publish marketing videos to our own TikTok account.` (117 chars). Two shorter alternatives offered.
- Terms of Service URL: `https://app.limeinc.cc/legal/terms`
- Privacy Policy URL: `https://app.limeinc.cc/legal/privacy`
- Platforms: Web only (already checked)
- Configure-for-Web panel: Web URL `https://app.limeinc.cc`, Redirect URI `https://app.limeinc.cc/api/auth/tiktok/callback`

**Screen 2 — App review tab:**
- Provided ~940-char explanation text mapping each scope to its actual usage:
  - `user.info.basic` → OAuth + display @handle
  - `video.upload` + `video.publish` → IG Reel mirror → FILE_UPLOAD init → PUT bytes → poll status
- Explicitly mentioned `ads_tiktok_posts` audit logging + AES-256-GCM refresh-token storage in the explanation, since reviewers care about both.

**Demo video honesty call (important):**
TikTok's instructions on screen 2 say "showcase the website where features will actually be integrated" + "clearly show the user interface and user interactions". My auto-generated `demo.mp4` is mock UI, NOT real screenshots. Flagged this as medium-risk for rejection and recommended user record a real screen recording with **Win+G (Xbox Game Bar)** instead — gave them a 5-minute scripted recording walk-through (sign-in → navigate → publish → success banner). The demo.mp4 stays as fallback. Awaiting user decision on Path A (submit mock as-is) vs Path B (record real, recommended).

---

## 2026-05-15 — TikTok audit demo.mp4 generated + delivered ✅

**Status:** Commit `47169c7` `feat(tiktok-audit): generate demo.mp4 from 10-scene storyboard`. Live in repo. User confirmed receipt after path-find help (Explorer popped open via `explorer.exe /select` from PowerShell).

**User asked:** "use all available tools to create the video by using the detailed storyboard". Then asked what tools were available.

**What I checked + what was on the system:**
- ✅ FFmpeg 7.1.1 (gyan.dev essentials build)
- ✅ Python 3.14.3 + Pillow 12.2.0
- ✅ Node 24.14.1
- ✅ Arial / Consolas fonts at C:/Windows/Fonts/
- ❌ No ImageMagick, no Puppeteer in repo deps

**Pipeline built:**
1. `tools/build-tiktok-demo.py` — Pillow renders 10 mock-UI slides (1920×1080) matching the SUBMISSION.md scene script. Brand palette + URL-bar strip on every frame so reviewers see `app.limeinc.cc`. ~330 LOC.
2. FFmpeg xfade chain (9s per scene + 1s crossfade between each) → `docs/tiktok-app-audit/demo.mp4`. H.264 yuv420p, 30 fps, CRF 20, 85 seconds, 5.18 MB. Verified mid-crossfade frame at 8.5s actually shows scene-1 fading into scene-2.

**Files committed:**
- `tools/build-tiktok-demo.py` — slide generator
- `docs/tiktok-app-audit/demo.mp4` — final deliverable (5.2 MB)
- `docs/tiktok-app-audit/build/.gitignore` — excludes derived PNGs
- `docs/tiktok-app-audit/SUBMISSION.md` — section 4 now points at demo.mp4 as primary; old "what to record" script kept as section 4b fallback for if reviewers ask for real screen recording.

**Honest caveats flagged to user:**
- Mock UI (Pillow-drawn), not real screenshots. TikTok historically accepts this; if rejected, fall back to scripted real-screen recording.
- No phone footage in scene 8 (mocked phone frame instead). Would need separate phone capture if reviewers insist.
- No audio narration; captions on each scene carry the message.

**Path issue resolved at end:** User reported "can not find this directory" for `C:\kareemhady\docs\tiktok-app-audit\demo.mp4`. PowerShell `Get-Item` confirmed the file at exactly that path (5,181,142 bytes, mtime 8:15 AM). Launched `explorer.exe /select` to surface it. Likely cause: Explorer cache not refreshed.

**Next:** User uploads `demo.mp4` to TikTok Developer Portal along with URLs + justification text from SUBMISSION.md §1 + §3.

---

## 2026-05-15 — Gallery upload error diagnosed → video-compress engine brainstorm started (paused)

**Diagnosis:** User reported `BH73-005.mp4` (60.2 MB) erroring in the Beithady gallery uploader for BH73-3BR-C-005. Confirmed cause: bucket cap is 50 MB (UI label at `src/app/beithady/gallery/_components/uploader.tsx:95`, Supabase Storage `file_size_limit` on the gallery bucket). Client uploads direct-to-Supabase via signed URL (`gallery-provider.tsx:101-107`), no pre-check, so it queues then fails on bucket reject.

**Then:** User asked to "create the engine on app to compress videos under the limit". Started `superpowers:brainstorming` skill. Explored repo — no ffmpeg/MediaRecorder/compression code exists (`@ffmpeg/*` not in package.json; voice-recorder.tsx uses MediaRecorder for audio only). Proposed client-side `@ffmpeg/ffmpeg` single-threaded WASM (avoids COOP/COEP headers that could break OAuth/Stripe; saves Egypt-bandwidth by compressing before upload; ~30MB lazy-loaded WASM cached after first use). Presented client-vs-server tradeoff table.

**Asked 3 AskUserQuestion clarifications** (UX trigger / scope / fallback behavior). **User dismissed all three with "do not proceed, wait for next instruction"** — paused.

**Next session pick-up:** Either user gives direction on the three open questions, or tells me to pick defaults and build. Recommended defaults are: auto-compress silently on any video >50 MB, build reusable `src/lib/media/video-compress.ts` and wire only into gallery uploader for now, progressive degradation (1080p CRF 26 → 720p CRF 28 → fail with "trim it" guidance). No files written yet, no commits.

## 2026-05-15 — TikTok Content Posting API audit pack — SHIPPED ✅

**Status:** Two commits, both live. Awaiting user to record demo video + submit to TikTok Developer Portal.

**Context:** First FILE_UPLOAD publish (post #6) succeeded with status `SEND_TO_USER_INBOX`. User asked why it lands in inbox vs auto-publishing → because `/v2/post/publish/inbox/video/init/` is the only endpoint available pre-audit. Direct Post (`/v2/post/publish/video/init/`) requires TikTok app audit. User asked me to prepare audit materials.

**Files shipped (commit `f68cc1b` `feat(legal): privacy policy + terms pages, TikTok audit pack`):**
- `src/app/legal/privacy/page.tsx` — 10-section policy. Section 3 dedicated to TikTok integration (open_id, username, encrypted refresh token; only writes to our own brand account; no third-party data reads). Static SSG, no auth wrapper.
- `src/app/legal/terms/page.tsx` — 10-section ToS, governing law = Egypt (Cairo). Section 3 covers third-party platform compliance.
- `docs/tiktok-app-audit/SUBMISSION.md` — operator playbook: URLs to paste, scopes to request (`user.info.basic`, `video.publish`, `video.upload`), justification text (paste verbatim into "Use case description"), 10-scene demo video script (~2 minutes, scenes timed 0:00–2:00), pre-submission checklist, post-approval code pointer (the `directPost` branching at `tiktok-organic-publish.ts:107` already exists).

**Follow-up bug fixed (commit `13350c6` `fix(proxy): allow /legal/* through without auth`):**
- First deploy returned 307 → `/login?next=/legal/privacy`. Root cause: Next 16 renamed `middleware.ts` → `proxy.ts` (commit `dee3863` from April). The proxy at `src/proxy.ts` gates everything except `PUBLIC_PREFIXES`. Added `/legal/` to the allow-list.

**Verified:**
```
privacy: 200
terms:   200
```

**URLs ready to paste into TikTok Developer Portal:**
- Privacy Policy: `https://app.limeinc.cc/legal/privacy`
- Terms of Service: `https://app.limeinc.cc/legal/terms`
- App website: `https://limeinc.cc`
- Support: `kareem.hady@gmail.com`

**Outstanding (user actions, not Claude):**
1. Record demo video per `SUBMISSION.md` §4 (10 scenes, OBS or macOS Screen Recording, 1080p MP4)
2. Upload video to Vimeo / unlisted YouTube
3. Open TikTok Developer Portal → app → App Review → Content Posting API → submit
4. Confirm OAuth redirect URI in portal = `https://app.limeinc.cc/api/auth/tiktok/callback`

After approval (5–10 business days), tick "Direct post?" checkbox on publish form to auto-publish.

---

## 2026-05-15 — TikTok organic publish: PULL_FROM_URL → FILE_UPLOAD — SHIPPED

**Status:** Commit `5f875c4` `feat(tiktok): switch organic publish to FILE_UPLOAD source`. Live on production (deploy `lime-3p38u0h9j`, alias `app.limeinc.cc` already pointing to it). Awaiting user retry to confirm end-to-end.

**Why:** With PULL_FROM_URL, TikTok requires the hosting domain to be verified as a trusted domain in the Developer Portal. Our IG-mirror videos live on `bpjproljatbrbmszwbov.supabase.co` — third-party host, can't verify. Init failed with `url_ownership_unverified` (post id=5 in `ads_tiktok_posts`). Per user choice (Option B from menu), switched to FILE_UPLOAD which has no domain requirement.

**Code changes** in `src/lib/beithady/ads/tiktok-organic-publish.ts`:
1. New `fetchVideoBytes(url)` helper — downloads video to ArrayBuffer, returns size + content-type. 60s timeout.
2. Init body: was `{ source: 'PULL_FROM_URL', video_url }`. Now `{ source: 'FILE_UPLOAD', video_size, chunk_size: video_size, total_chunk_count: 1 }` (single-chunk path, fine for IG Reels typically <64 MB).
3. Read `data.upload_url` from init response in addition to `publish_id`.
4. New PUT step: `fetch(upload_url, { method:'PUT', headers:{Content-Type, Content-Length, Content-Range: 'bytes 0-N/total'}, body: ArrayBuffer })`. 120s timeout. Logs `upload_put_<status>` to `status_error` on failure.
5. Status-poll loop unchanged after PUT.

**Type quirk fixed:** Initial impl used `Uint8Array` for the body which TS rejected (`not assignable to BodyInit`). Switched to `ArrayBuffer` directly — works in Node fetch.

**Limitation flagged for later:** Single-chunk only. If we ever mirror a >64 MB video, will need multi-chunk (5-64 MB per chunk except last).

**Followup needed:**
- User to click Publish on the TikTok Reels page; if it succeeds, video lands in `beit.hady` TikTok inbox.
- If it fails, new error will be in `ads_tiktok_posts.status_error` — will diagnose from there.

---

## 2026-05-15 — TikTok crypto fix (decrypt-on-read, encrypt-on-rotate) — SHIPPED

**Status:** Commit `913c195` `fix(tiktok): decrypt refresh_token on read, encrypt on rotate (CLAUDE.md #4)`. Live on production. DB cleared (`UPDATE ads_accounts SET tiktok_refresh_token=NULL WHERE id=4`).

**Bug:** `/api/auth/tiktok/callback/route.ts:68` correctly encrypts `tiktok_refresh_token` before saving (per CLAUDE.md rule #4). But `refreshTikTokAccessToken()` in `tiktok-client.ts` was reading the column verbatim and POSTing AES-256-GCM ciphertext to TikTok as `refresh_token=…`. TikTok received base64 gibberish, returned `invalid_grant`. The earlier self-healing path (commit `115456f`) then cleared the (encrypted) token, putting the user in re-OAuth-then-fail loops.

**Fix:** Added `unwrapStoredRefreshToken(stored)` — try `decrypt()`, fallback to as-is on throw (so legacy plaintext still works). Re-encrypt rotated/reused refresh_token before write so row stays in encrypted state.

---

## 2026-05-15 — TikTok publish "refresh_failed" self-healing UX — SHIPPED ✅

**Status:** Commit `115456f` `fix(tiktok): self-healing refresh-failed UX`. Live on production.

**Three-part fix in one commit:**
- **A** Accounts page: TikTok rows always show "Reconnect" link beside Configure
- **B** Publish page error banner: when error includes `refresh_failed`, renders inline "Re-authenticate @account →" link using `account_id` preserved through the error redirect
- **C** `refreshTikTokAccessToken()`: on TikTok responding `invalid_grant`/`invalid_token`, clears the dead refresh_token + expiry columns + logs to stderr

This was followed by the crypto fix (above) which addressed the underlying reason refresh kept failing.

---

## 2026-05-15 — Meta ad sync (cron + partial-index upsert) — SHIPPED ✅

**Status:** Commits `d6422ff` (today+yesterday), `0bfc157` (manual upsert / partial-index workaround). Live on production. Verified `ads_daily_metrics` populated:
- Campaign 1 (Boost 05-13 20:44): May 14 — 2,000 imp, 59 clicks, $0.93
- Campaign 2 (Boost 05-14 05:53): May 14 — 15,944 imp, 564 clicks, $7.67

**Two compounding bugs fixed:**
1. Cron only requested yesterday's data → today's spend never asked for. Added `today` + `time_increment=1`.
2. `.upsert()` silently failed because the table's unique index on `(campaign_id, metric_date)` is PARTIAL (`WHERE ad_id IS NULL AND ad_set_id IS NULL`) — PostgREST's `onConflict` can't carry the WHERE clause. Replaced with explicit select → insert/update by id, scoped to `ad_set_id IS NULL AND ad_id IS NULL`. Logs every error path so silent data loss can't recur.

**Outstanding:** Verify Meta token in Vercel env is long-lived **system-user** token (4 prior cron runs failed `missing_credentials` May 10–13).

---

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
