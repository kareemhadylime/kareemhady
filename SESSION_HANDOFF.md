# Kareemhady — Session Handoff (2026-04-27, end of day)

## 🟢 Beithady v2 — Phases A, B, C.1, C.2, C.3 ALL DEPLOYED to canonical production

User flow this session:
1. Plan → Workflow → Confirm (3-phase process completed at 95% confidence)
2. Phase A: Foundation (5-card landing, role matrix, brand theme) — deployed
3. Phase B: CRM read-only (5,753 guests ingested) — deployed
4. Phase C.1: Communication v1 read side (6,694 convs + 1,011 messages mirrored) — deployed
5. Phase C.2: Communication send side (Guesty composer + late-reply digest) — deployed
6. Phase C.3: WhatsApp Casual two-way (Green-API webhook + voice + file) — deployed THIS TURN

User granted **standing authorization for direct pushes to main** ("Always Direct Push") so all phases land on `limeinc.vercel.app` automatically via Vercel's GitHub integration.

---

## Branch + commit state

`claude/quizzical-satoshi-83e453` and `main` are at `2874261`. Recent commits in order:
- `b4724c9` Phase A — foundation (5-card landing, role matrix, brand theme)
- `dae8630` docs: SESSION_HANDOFF for Phase A
- `2b18588` (sibling worktree) KIKA Daily Performance Report
- `4e5e938` (sibling worktree) docs: SESSION_HANDOFF for KIKA
- `667a238` Phase B — CRM read-only (rebased onto main with KIKA work)
- `d5a526a` Phase B follow-up: SQL initial-ingest proc + fx_rates fix
- `5532cac` Phase C.1 — Communication v1 read side
- `0cd6982` Phase C.2 — Communication send side
- `2874261` Phase C.3 — WhatsApp Casual two-way (Green-API)

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
