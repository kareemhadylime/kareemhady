# Kareemhady — Session Handoff (2026-04-27)

## 🟡 Latest turn — Phase J planning: Operations Calendar (no commits yet)

User asked to plan a Guesty-style multi-calendar reservation module for Beithady. This turn was **plan-only**, per the user's process: "Plan → 95% confidence → Workflow → 95% → Code". No files written.

Reference UX (from screenshots the user shared this turn):
- Multi-row calendar grid: properties × dates with nightly price + min-stay in each cell, reservation bars overlaying date spans, channel-color coding, today indicator.
- Right-slideover reservation drawer: status, channel, guests, listing, check-in/out, nights, rate plan + tabs for guest, payment, communication, etc.

Plan I sent the user (waiting on answers to 10 questions before workflow phase):

**Module:** new "Operations" category card on the Beithady launcher; route `/emails/beithady/operations/calendar`.

**Grid rows = bookable atoms** (children + standalones — uses `fetchMtlParentIds + isBookableAtom` from `src/lib/beithady/mtl.ts`). 74 rows total: BH-73 28, BH-26 22, BH-435 14, BH-OK 10. Cells show price (pricelabs) + min-stay; reservation bars span check-in→check-out, color-coded by channel, click → drawer.

**Drawer = 10 tabs:** Overview / Guest (Phase B link) / Channel & Source / Payment & Finance / Communication (Phase C link + AI Phase E) / Check-in & Boarding (Phase F) / Tasks (Phase F) / Upsells (Phase F) / Attribution (Phases H + I) / Audit log (Phase A).

**Status-flag dot column** in left rail computed from each row's *next* upcoming reservation: red (unpaid + check-in ≤7d), orange (ID missing + ≤3d), yellow (pre-arrival not sent + ≤2d), green (healthy), purple (VIP arriving), gray (no booking in window).

**12 suggested improvements over Guesty** — flagged: AI risk score, heatmap overlay toggle, comp-set price triangles, bulk actions, drag-to-create manual blocks, Supabase Realtime live updates, saved views, anomaly callouts, channel-mix sparkline, WhatsApp share-boarding-pass, past-stay quick-look, mobile-optimized mode.

**Tech architecture sketch:** server component initial fetch + virtualized client grid + drawer via `?reservation=<id>` URL param + server actions for mutations. New tables: 1 (`beithady_reservation_overrides` for manual blocks/cache).

**10 open questions** asked the user, blocking workflow phase: routing placement, pricelabs DB schema, payment data source (Guesty vs Stripe), read-only vs read-write to Guesty, manual block sync semantics, channel logo assets, Realtime vs polling, mobile scope, AI risk score in v1 vs v2, bulk actions in v1 vs v2.

Confidence: ~85% on structure + grid + drawer 1–7; ~70% on payment/attribution/write-back depth pending user's answers.

## 🟢 Earlier this session — MTL polarity unified across Beithady (commit `5256135`)

User confirmed Option B (data-side fix). Three pieces:

**1. Migration `0042_beithady_mtl_backfill.sql`** — Adds `beithady_backfill_mtl_master_id()` RPC that infers `master_listing_id` from the nickname-prefix convention used in BH-73 (`BH73-3BR-SB-1-201` → child of `BH73-3BR-SB-1`). Idempotent — only writes when the value is NULL, so a real Guesty `masterListingId` always wins. One-shot run populated 23 BH-73 children. BH-26, BH-435, BH-OK unchanged (no MTLs).

Result per building:

| | standalones | parents | children |
|---|---|---|---|
| BH-26 | 22 | 0 | 0 |
| BH-73 | 5 | 8 | 23 |
| BH-435 | 14 | 0 | 0 |
| BH-OK | 10 | 0 | 0 |

**2. Sync re-runs the RPC** ([src/lib/run-guesty-sync.ts:233](src/lib/run-guesty-sync.ts:233)) — after every listings upsert. Keeps inference current as Guesty data evolves.

**3. Domain consumers simplified** to one-line SQL filters per the polarity matrix:

| Use | Filter | Polarity |
|---|---|---|
| Gallery / Documents / Ads creative / Pre-arrival | `WHERE master_listing_id IS NULL` | parents + standalones |
| CRM / Communication / Calendar / Daily report / Pipeline | drop parents (use `fetchMtlParentIds`) | children + standalones |

Centralized helpers live in new file [src/lib/beithady/mtl.ts](src/lib/beithady/mtl.ts): `MTL_AGGREGATES_FILTER` constant, `fetchMtlParentIds()`, and `isBookableAtom()`. Polarity matrix documented inline.

Updated this turn:
- [gallery-list.ts](src/lib/beithady/gallery/gallery-list.ts) — removed the `dropMtlChildren` JS helper; gallery uses pure SQL filter. BH-73 → 13 folders.
- [market/calendar.ts](src/lib/beithady/market/calendar.ts) — switched to `fetchMtlParentIds + isBookableAtom`. Drops the `.or('listing_type.is.null,...')` workaround.
- [beithady-daily-report/units.ts](src/lib/beithady-daily-report/units.ts) — `isPhysicalUnit` now consults `master_listing_id` first, fixes a latent bug where BH-73 MTL parents were counted as physical units.

End-to-end sanity check: gallery → BH-26: 22, BH-73: **13**, BH-435: 14, BH-OK: 10. Atoms → BH-26: 22, BH-73: **28**, BH-435: 14, BH-OK: 10.

## 🟢 Earlier this session — Gallery MTL polarity v3 (commit `5abec90`)

User correction: I had the polarity backwards. For the gallery, when an MTL exists, show the **parent** and hide the children. Sub-units share pictures + features with the parent, so a single upload to the MTL covers every child; showing each child as its own folder would force redundant uploads.

Inverted `dropMtlParents` → `dropMtlChildren` in [src/lib/beithady/gallery/gallery-list.ts:127](src/lib/beithady/gallery/gallery-list.ts:127). Same detection mechanism (master_listing_id reverse-ref OR nickname-prefix), opposite kept side.

Counts: BH-26→22 (no MTLs), **BH-73→13** (8 parents + 5 standalones, was 36), BH-435→14, BH-OK→10.

**Open question deferred for next turn:** user asked "use the same rule across all Beithady domain and features whenever fetching from Guesty strictly and writing to database". Gallery is now done. Other Guesty consumers (calendar/CRM/ads/pipeline/communication/daily-report) need per-domain decisions — calendar's occupancy math, for example, wants children (bookable atoms), not parents. Will ask for clarification before scoping a unified policy.

## 🟢 Earlier this turn — Gallery dropped MTL parents (commit `bf53ca1`, superseded)

User pushback after the last commit: BH-73 was still showing 36 folders, not 28. Inspection of the data showed Guesty sync hasn't populated `master_listing_id` yet — the previous turn's filter was effectively a no-op. The MTL hierarchy in BH-73 is encoded entirely in nicknames:

- Parent: `BH73-3BR-SB-1` (an aggregate, not bookable)
- Sub-units: `BH73-3BR-SB-1-001`, `BH73-3BR-SB-1-101`, `BH73-3BR-SB-1-201`, … (`<parent>-NNN`)

Replaced the SQL `master_listing_id IS NULL` filter with a JS post-fetch helper `dropMtlParents()` that drops any row with at least one child, where "child" is detected via either:

- (a) another row's `master_listing_id` points to it (Guesty-structured MTLs — future-proofs)
- (b) another row's nickname starts with `<this.nickname>-` (naming-convention MTLs — today's data)

Both gallery functions in [src/lib/beithady/gallery/gallery-list.ts](src/lib/beithady/gallery/gallery-list.ts) now fetch all matching listings and apply the helper. Counts after fix:

| Building | Before | After | MTL parents dropped |
|---|---|---|---|
| BH-26 | 22 | 22 | 0 |
| BH-73 | 36 | **28** ✓ | 8 |
| BH-435 | 14 | 14 | 0 |
| BH-OK | 10 | 10 | 0 |

The 8 MTL parents dropped from BH-73: `BH73-1BR-C-8`, `BH73-2BR-SB-5`, `BH73-2BR-SB-6`, `BH73-3BR-C-4`, `BH73-3BR-SB-1`, `BH73-3BR-SB-2`, `BH73-3BR-SB-3`, `BH73-ST-C-7`. Page footer text updated to describe the new rule.

## 🟢 Earlier this turn — `master_listing_id IS NULL` filter (commit `f87502f`)

First attempt at the MTL parent/child semantic — switched the SQL filter from `listing_type != 'MTL'` to `master_listing_id IS NULL`. This was the right approach for Guesty-structured MTLs, but turned out to be a no-op against the actual data (sync hasn't populated master_listing_id). Superseded by `bf53ca1` above. Calendar heatmap ([market/calendar.ts:42](src/lib/beithady/market/calendar.ts:42)) was left untouched — it intentionally keeps the opposite semantic for occupancy math.

## 🟢 Earlier this turn — Gallery unit folders fix (commit `4cd4d12`)

User screenshot showed BH-26 building gallery rendering "0 IMPORTED FROM GUESTY" / 0 unit folders even though Guesty has 22 BH-26 listings (BH-26-001…BH-26-501). Investigation: the listings were in `guesty_listings` correctly tagged `building_code = 'BH-26'`, `active = true`, `listing_type = NULL`.

**Root cause:** PostgREST null-comparison gotcha. The Supabase JS query used `.neq('listing_type', 'MTL')`, which translates to SQL `listing_type <> 'MTL'`. In Postgres, `NULL <> 'MTL'` evaluates to **NULL** (not true), so PostgREST drops every row with a null listing_type. Across the 4 active Beithady buildings, 100% of listings have `listing_type = NULL` (BH-26: 22, BH-73: 36, BH-435: 14, BH-OK: 10) → all silently filtered out.

**Fix:** replaced `.neq('listing_type', 'MTL')` with `.or('listing_type.is.null,listing_type.neq.MTL')` in calendar.ts; the gallery-list.ts call sites were superseded by the `master_listing_id` filter above.

Verified post-fix: BH-26 → 22 folders, BH-73 → 36, BH-435 → 14, BH-OK → 10.

## 🟢 Earlier this session — Vercel build hotfix (commit `f478f23`, green on `limeinc.vercel.app`)

The Gallery per-unit-folders commit (`8bd7ca5`) broke production with `Command "npm run build" exited with 1`. Vercel's build logs showed compile ✅ at 30s, then a TypeScript type error during the `tsc` pass:

```
./src/lib/beithady/gallery/gallery-list.ts:215
Type error: Expected 2 arguments, but got 3.
```

Two new call sites in [src/lib/beithady/gallery/gallery-list.ts](src/lib/beithady/gallery/gallery-list.ts) (lines 215 + 257, the per-unit-folder cover and General-Building-Area cover) passed `3600` as a TTL override to `signedUrlFor()`, but the helper's signature only took 2 args.

**Fix:** promoted the TTL to an optional third parameter on `signedUrlFor()` in [src/lib/beithady/gallery/storage.ts:19](src/lib/beithady/gallery/storage.ts:19), default = existing `SIGNED_URL_TTL_SEC = 3600`. Backward-compatible — the 5 other callers (asset-grid, asset-detail-modal, documents/page, ai-label, getSignedUrlForAsset) continue to work unchanged with two args.

Pushed to main. GitHub-triggered build for `f478f23` went green: `dpl_5v3PftwFBByY7pKvtSQFdC9k4XhC` = READY. `limeinc.vercel.app` is unblocked.

---

## 🟢 Beithady v2 — Phases A → I + Gallery follow-up ALL DEPLOYED to canonical production

Order of phases shipped (oldest → newest):
1. **A** (`b4724c9`) — Foundation: 5-card landing, role matrix, brand theme
2. **B** (`667a238` + `d5a526a`) — CRM read-only, 5,753 guests ingested
3. **C.1** (`5532cac`) — Communication v1 read side, 6,694 convs + 1,011 messages mirrored
4. **C.2** (`0cd6982`) — Communication send side: Guesty composer + late-reply digest
5. **C.3** (`2874261`) — WhatsApp Casual two-way: Green-API webhook + voice + file
6. **D** (`ca08b11`) — Gallery + Documents module
7. **E** (`3dbaf64`) — AI auto-reply system
8. **F** (`eda96f2`) — Engagement: loyalty + upsell + pre-arrival + CSAT + boarding pass + tasks
9. **G** (`ba93412`) — Market Intelligence + Calendar Heatmap (closes Phase B residence_country gap)
10. **H** (`1c7edd0`) — Ads module port (VoltAuto + Beithady extensions)
11. **I** (`94a38d4` + `72325b2`) — Lead pipeline + AI review reply + `/api/leads/*` proxy allowance
12. **Gallery follow-up** (`8bd7ca5`) — Per-unit folders imported from Guesty + General Building Area
13. **Hotfix #1** (`f478f23`) — `signedUrlFor` accepts optional ttl (unblocks Vercel build)
14. **Hotfix #2** (`4cd4d12`) — `.neq('listing_type','MTL')` → `.or('listing_type.is.null,listing_type.neq.MTL')` (unit folders now actually render in calendar.ts; gallery-list.ts later superseded)
15. **MTL semantics v1** (`f87502f`) — gallery-list.ts switched to `master_listing_id IS NULL` (turned out to be no-op against current data)
16. **MTL semantics v2** (`bf53ca1`) — `dropMtlParents()` via nickname prefix; BH-73 → 28 (kept children — wrong polarity, superseded)
17. **MTL semantics v3** (`5abec90`) — inverted to `dropMtlChildren()`; BH-73 → 13 folders (gallery only)
18. **MTL backfill + cross-domain unification** (`5256135`) — migration 0042 + sync re-runs RPC + central `mtl.ts` helpers + applied to gallery/calendar/daily-report
19. **Phase J plan drafted** (no commit) — Operations Calendar module spec sent to user; awaiting answers to 10 questions before moving to workflow phase (this turn)

User has standing authorization for direct pushes to main ("Always Direct Push") — all phases land on `limeinc.vercel.app` automatically via Vercel's GitHub integration.

---

## Branch + commit state

Active worktree this turn: `claude/jovial-wilbur-a3fd6a`. `main` is at `f478f23` (Vercel-green).

Branch is clean except SESSION_HANDOFF.md being updated each turn.

---

## Live URLs

| URL | Phase | Notes |
|---|---|---|
| https://limeinc.vercel.app | Canonical | Auto-deploys from main |
| https://quizzical-satoshi-83e453.vercel.app | Worktree preview | Manual `vercel --prod` deploys |

All Beithady routes auth-gated → 307 redirect to `/login`.

---

## Phase A — Foundation (deployed)

**Migration `0030_beithady_v2_foundation.sql`**:
- `beithady_role` enum (5 roles), `beithady_user_roles`, `beithady_audit_log`, `beithady_settings` tables
- Seeded `ai_confidence_threshold=0.85`, `ai_auto_reply_enabled=true`, `vip_digest_enabled=true`
- App-admins auto-granted Beithady admin role on install

**Library `src/lib/beithady/`**: full permission matrix (5 roles × 7 categories), `requireBeithadyPermission()`, audit log writer/reader, settings KV with typed getters.

**Brand**: navy `#1E2D4A`, blue `#5F7397`, cream `#F5F1E8`, gold `#D4A93A`. Logos at `public/brand/beithady/{wordmark,monogram}.jpg`.

**Pages**: 5-card launcher at `/emails/beithady` + 7 category routes (financial, analytics, crm, communication, settings, gallery, ads). Settings has 9 sub-tabs (3 functional, 4 stubs, 2 redirects).

---

## Phase B — CRM read-only (deployed)

**Migrations 0031 + 0032** — beithady_guests + notes + segments + timeline_cache + sync_runs + SQL initial-ingest proc.

**Initial ingest result**: 5,753 guests · 924 returning · 225 platinum auto-VIP · 66 gold · 113 silver · 520 bronze · 253 future arrivals · $10,439,027 lifetime spend.

**CRM library**: loyalty.ts, guests-sync.ts (with fixed fx_rates schema), guest-list.ts, guest-loader.ts, ai-summary.ts, segments.ts.

**Routes**: list page with filters/widgets/CSV export, 360° profile with 7 sub-components, segments CRUD, loyalty (read-only), market-intel/tasks stubs.

**Cron**: `30 5 * * *` UTC daily JS sync.

**Known gap**: `residence_country` is empty for all guests — Phase G enrichment needed.

---

## Phase C.1 — Communication v1 read side (deployed)

**Migrations 0033 + 0034** — beithady_conversations + beithady_messages + comm_sync_runs + ingest/SLA SQL procs.

**Initial ingest**: 6,694 conversations + 1,011 messages mirrored from guesty_*. SLA computed: 2,133 RED breaches, 4 ORANGE.

**Routes under `/emails/beithady/communication`**: landing → /guesty redirect, guesty/wa-cloud/wa-casual/unified tabs, channel-tabs + sla-pill + sidebar-list + thread-pane components.

**Crons**: `*/5 * * * *` comm-sync + sla-recalc.

---

## Phase C.2 — Communication send side (deployed)

**Library**:
- `src/lib/guesty.ts`: `sendGuestyConversationPost()` wraps `POST /v1/communication/conversations/{id}/posts`. Tier-gated; on failure returns `{ ok:false, status, error }` for fallback.
- `src/lib/beithady/communication/send-guesty.ts`: server-side wrapper. Persists outbound, clears SLA, audits.

**Server actions**: `sendGuestyMessageAction` + `toggleKillSwitchAction`.

**UI**: Real reply composer (textarea + char counter + channel chips + send button + inline error/success/AI-off banners + Reply-in-Guesty fallback). "Create booking" deep-link button in thread header.

**Cron**: `0 6,12 * * *` UTC = 09:00 + 15:00 Cairo `late-reply-digest` — generates digest in `beithady_settings`. Phase F adds delivery.

---

## Phase C.3 — WhatsApp Casual two-way (deployed THIS TURN)

**Migration `0035_beithady_wa_casual.sql`** (applied via Supabase MCP):
- Storage bucket `beithady-wa-media` (public, 20MB cap, audio/image/video/pdf MIME allowlist)
- `beithady_green_webhook_events` table — raw event log keyed on `green_event_id` (idempotency unique index)
- `beithady_ensure_wa_casual_conversation(phone_digits, name)` RPC — lazy conv creation on first inbound, links to existing `beithady_guests` by phone_e164

**Green-API client extensions** (`src/lib/whatsapp/green-api.ts`):
- `sendWhatsAppFile` (sendFileByUrl wrapper for voice + media + files)
- `getGreenInstanceState` (online/offline ping)
- `configureGreenInboundWebhook` (one-shot `setSettings` to register webhook URL on Green-API side)

**Inbound webhook** (`/api/webhooks/green/[slug]/route.ts`):
- Obscure-slug protection (matches credentials `webhook_path_slug`)
- Optional `GREEN_API_ALLOWED_IPS` env-var IP allowlist
- GET = health check; POST = ingest event
- Always 200 to Green-API even on internal failure (no retry storms)

**Ingest helper** (`src/lib/beithady/communication/wa-casual-ingest.ts`):
- Handles incomingMessageReceived (text + extendedText + image + doc + video + audio + voice + location + contact)
- Handles outgoingMessageStatus → updates delivery_status on existing message
- Skips group chats (@g.us) for Phase C.3
- Recomputes SLA so the inbox sidebar lights up immediately

**Send wrapper** (`src/lib/beithady/communication/send-wa-casual.ts`):
- `sendWaCasualMessage` (text + optional fileUrl) → Green-API → persists outbound, clears SLA, audits
- `uploadWaMedia` (ArrayBuffer → Supabase Storage → public URL) for voice + attachments

**Server actions** (added to `actions.ts`):
- `sendWaCasualMessageAction` (text-only form action)
- `sendWaCasualVoiceAction` (multipart upload — voice OR file blob; Storage upload then send via Green-API)

**UI**:
- `voice-recorder.tsx` — in-browser MediaRecorder (ogg/opus → webm/opus → mp4 fallback) with start/stop/preview/discard/send + duration display
- `wa-casual-composer.tsx` — text input + voice recorder + file attach + inline error/sent/AI-off banners
- `wa-casual/page.tsx` — replaces stub with functional split-pane inbox. Shows step-by-step setup card when Green-API not yet configured (with the exact webhook URL to register).
- `thread-pane.tsx` — channel-aware composer routing (Guesty → GuestyComposer, wa_casual → WaCasualComposer, wa_cloud → ComposerStub) + Attachments component renders audio/image/file inline with HTML5 audio + thumbnails.

**Live switch** — to activate inbound + outbound (code is ready):
1. Add Green-API credentials in `/admin/integrations` (already used by boat-rental — same provider)
2. Set `webhook_path_slug` to a random string
3. Set webhook URL in Green-API console to `https://limeinc.vercel.app/api/webhooks/green/<slug>`
4. Toggle provider to enabled

---

## What's deferred

| Slice | Phase | Notes |
|---|---|---|
| WhatsApp Cloud Beit Hady WABA provisioning + Cloud API send | C.4 | Manual setup task; user provisions then adds creds in `/admin/integrations` for `meta_waba` provider |
| AI auto-reply integration | E | Reads `beithady_settings` keys + per-conv ai_kill_switch from Phase A/C.1 |
| Gallery + Documents | D | Depends on Supabase Storage tier |
| Loyalty editable + Upsell + Pre-arrival + CSAT + Boarding pass + late-reply digest delivery | F | Depends on Phase E |
| Market Intelligence + Calendar Heatmap | G | Depends on `residence_country` enrichment |
| Ads module port | H | Depends on Beithady WABA + Meta Marketing approval |
| Lead pipeline kanban + AI multi-language review reply | I | Cleanup phase |

---

## Crons currently active (vercel.json)

```
*/5 * * * *  /api/cron/beithady-comm-sync           # Phase C.1
*/5 * * * *  /api/cron/beithady-sla-recalc          # Phase C.1
0 6,12 * * * /api/cron/beithady-late-reply-digest   # Phase C.2 — 09:00 + 15:00 Cairo
30 5 * * *   /api/cron/beithady-crm-sync            # Phase B — 07:30/08:30 Cairo
```

Plus existing crons untouched: beithady-daily-report, kika-daily-report, daily, odoo, odoo-financials phases, pricelabs, guesty, shopify, boat-rental holds.

---

## Migrations applied (Supabase project `bpjproljatbrbmszwbov`)

```
0030_beithady_v2_foundation.sql        — Phase A
0031_beithady_crm.sql                  — Phase B
0032_beithady_crm_initial_ingest.sql   — Phase B (SQL ingest proc)
0033_beithady_communication.sql        — Phase C.1
0034_beithady_communication_ingest.sql — Phase C.1 (SQL ingest + SLA recompute)
0035_beithady_wa_casual.sql            — Phase C.3 (storage bucket + webhook events + ensure_wa_casual_conversation RPC)
```

All applied + verified with row counts. No pending migrations.

---

## Webhooks live

```
POST /api/webhooks/green/[slug]   — Green-API inbound (Phase C.3)
                                    Slug = credentials.green.webhook_path_slug
                                    Idempotent on green_event_id
                                    Always 200 to avoid retry storms
GET  /api/webhooks/green/[slug]   — Health check (Green-API uses this when configuring)
```

---

## Storage buckets (Supabase)

```
beithady-wa-media   — Phase C.3
                     Public-read, 20MB cap per object
                     MIME allowlist: audio/{webm,ogg,mpeg,mp4,wav}
                                    image/{jpeg,png,webp,gif}
                                    video/{mp4,webm}
                                    application/{pdf,zip}
                     Used for voice notes + WA Casual file attachments
```

---

## Next user prompt options

- **C.4** — Configure Beit Hady WABA in Meta Business Manager, then ship Cloud API send
- **D** — Gallery + Documents module
- **E** — AI auto-reply system (consumes kill-switch + threshold from Phase A settings)
- **F** — Loyalty/Upsell/Pre-arrival/CSAT/Boarding pass + activate the late-reply digest delivery
- **G** — Market Intelligence + Calendar Heatmap (also fixes residence_country gap from Phase B)
- **H** — Ads module port (Voltauto Auto Ads Module)
- **I** — Lead pipeline + AI review reply (cleanup phase)
- Or any slice in any order; pieces stack cleanly.

Each completed phase has been pushed to main + auto-deployed to `limeinc.vercel.app`. To pick up in a new session, continue from any phase letter; the migrations + ingest data are already in production Supabase.
