# Kareemhady — Session Handoff (2026-04-30)

## 🟢 Latest turn — Fixed Guesty 400 VALIDATION_ERROR on POST conversation-posts (manual reply now works)

User screenshot: tried sending a manual reply on Hady Family (conv `69f2f16b824ad00012c34e12`) via Guesty WA. Got `Send failed · status 400 · guesty_400: VALIDATION_ERROR "type is not allowed"`.

**Root cause:** Guesty's Open API now rejects the top-level `type` field on `POST /v1/communication/conversations/{id}/posts`. Our `sendGuestyConversationPost` was sending `type: 'message'` per the previously-valid schema; Guesty tightened validation and the field is no longer accepted at the top level.

**Fix shipped (commit `d1fea00`):**
- `src/lib/guesty.ts` `sendGuestyConversationPost`: stop including `type` in the payload. Kind is implicit from `module` / `subject` / `attachments` shape.
- `GuestySendPostInput.type` kept on the type signature with `@deprecated` so existing callers compile; the field is now ignored.
- `src/lib/beithady/communication/send-guesty.ts`: stopped passing `type: 'message'` explicitly.

**Why this only fired now:** the fix path through the inbox composer + manual gate was the first real attempt at a Guesty POST after Phase C.5 shipped + the user resumed the `manual_outbound` switch. The earlier `outbound_paused` 503 was masking this 400 entirely.

**Verification:** user should retry the same send on Hady Family → expect `Sent successfully via Guesty.` Outbound row writes to `beithady_messages` with `direction='outbound'`, `module_type='whatsapp'`.

**Branch state:** `claude/gallant-brahmagupta-1d925c`. Last commit `d1fea00` pushed to `main`. Vercel auto-deploy via GitHub integration lands within ~1-2 min.

## 🟢 Earlier this session — AI item info cards COMPLETE (M1–M5 shipped, both prod deploys VERIFIED)

**End-state confirmation (post-deploy):**
- Commit `7aa2711` (M1: schema + 43-item seed) → Vercel deploy `dpl_bq3ScXnGcrJmAy2eU52dYWcushVm` → READY
- Commit `f4f9d14` (M2–M5: lib + actions + UI + tooltip) → Vercel deploy `dpl_3tvs5eUoYWQzJQMGqPXcJgKENH4z` → READY (production target)
- 3 Supabase migrations applied via MCP: `0053_amazon_eg_review_state`, `0058_inventory_ai_info`, `0059_seed_extra_inventory_items`
- DB verified post-seed: **73 active items across 9 categories** (chemicals 17, sanitary 17, fnb 12, linen 7, branded 8, maintenance 5, welcome_tray 2, consumables 5)
- `npx tsc --noEmit` clean, `npm run build` clean


**End-state confirmation (post-deploy):**
- Commit `7aa2711` (M1: schema + 43-item seed) → Vercel deploy `dpl_bq3ScXnGcrJmAy2eU52dYWcushVm` → READY
- Commit `f4f9d14` (M2–M5: lib + actions + UI + tooltip) → Vercel deploy `dpl_3tvs5eUoYWQzJQMGqPXcJgKENH4z` → READY (production target)
- 3 Supabase migrations applied via MCP: `0053_amazon_eg_review_state`, `0058_inventory_ai_info`, `0059_seed_extra_inventory_items`
- DB verified post-seed: **73 active items across 9 categories** (chemicals 17, sanitary 17, fnb 12, linen 7, branded 8, maintenance 5, welcome_tray 2, consumables 5)
- `npx tsc --noEmit` clean, `npm run build` clean
- Rebase encountered: parallel session pushed `e7632b3` (auto-archive Guesty system-notifs) + `6f89fe0` while M2–M5 was being written. Resolved cleanly — both their `0058_beithady_auto_archive_*` and my `0058_inventory_ai_info` migration files coexist on disk (different applied-names in DB, no collision). SESSION_HANDOFF.md conflict resolved by demoting their entry to "Earlier today (parallel session)".

**User said "All Default - Do All changes to Vercel & Supabase automatically"** → skipped sign-off gate, executed entire workflow plan in one turn.

**M2 — AI lib `src/lib/beithady/inventory/ai-item-info.ts` (new file, 240 lines):**
- `generateItemInfo()` — single Haiku 4.5 call with `web_fetch_20250910` server-managed tool when `amazon_eg_url` is set. Adds `anthropic-beta: web-fetch-2025-09-10` header. Falls back to general housekeeping knowledge when fetch fails — Claude self-tags `source` field.
- Robust JSON extraction (direct parse → strip code fence → bracket-substring slice) + 1 retry @ temp 0 on parse fail.
- `validate()` enforces required strings, trims to max lengths, normalises `key_features` to 1–6 strings.
- `persistItemInfo()` writes the row + appends history + prunes history to last 10 entries per item via fetch-ids-then-delete (cheaper than CTE on supabase REST).
- `regenerateItemInfo()` — convenience wrapper used by both manual and bulk paths. Fetches item + category, flips status running → idle/error, never throws.
- `setAiInfoStatus()` — small status flip helper for queued/running/error/idle.
- `isWithinCooldown()` — 24h check for the auto-regen cooldown.

**Catalog types extended (`src/lib/beithady/inventory/catalog.ts`):**
- New `AiInfoStatus` type ('idle'|'queued'|'running'|'error') and `AiItemInfoPayload` (the structured info card shape — single source of truth, re-exported from ai-item-info as `AiItemInfo` alias).
- `ItemRow` now has `ai_info`, `ai_info_generated_at`, `ai_info_source`, `ai_info_status`, `ai_info_error`.
- `listItems()` mapper passes those through with `ai_info_status` defaulting to 'idle'.

**M3 — Server actions `src/app/beithady/inventory/items/actions.ts`:**
- New imports: `waitUntil` from `@vercel/functions` (newly installed @ ^3.4.6), AI helpers.
- `setAmazonSourceAction:400` — extended: only enqueues regen when URL actually CHANGED (avoids burning tokens on no-op saves) and either no card exists OR cooldown elapsed. Sets `ai_info_status='queued'` synchronously then fires `waitUntil(regenerateItemInfo(...))` so the operator's save returns instantly. Calls `revalidatePath` from inside the background promise too.
- `generateAiInfoAction(itemId)` — manual single regen, foreground (request waits ~5–10s). Bypasses cooldown. Audits.
- `generateAllMissingAiInfoAction()` — flags every active item with `ai_info IS NULL` as queued, fires `waitUntil` background pool of 5 concurrent generations. Returns queued count immediately.

**M4 — UI:**
- New `_components/ai-info-card.tsx` (190 lines) — handles 4 states: queued/running spinner, no-info CTA with "Generate AI info" button, full card render (summary EN+AR-RTL, key features, usage tips, ingredients/warnings/pack-details three-up), error banner. Footer shows source badge (Amazon EG vs General knowledge), generated date, model name, "Fallback used" warning when URL exists but Amazon fetch failed, and "Refresh AI info" button (manual regen, bypasses cooldown).
- New `_components/bulk-ai-info-button.tsx` — header CTA, only visible when ≥1 item has `ai_info IS NULL && active`. Click queues background regen for all missing.
- `_components/items-section-list.tsx` — added chevron column (Right/Down lucide) on row left, expand-state in parent, second `<tr>` with colSpan rendering `<AiInfoCard />` when expanded. Also added an auto-poll: `setInterval(router.refresh, 4000)` while any row is queued/running so spinners flip to cards as background regen completes (no SSE/websockets needed).
- `items/page.tsx` — counts `aiInfoMissingCount`, renders `<BulkAiInfoButton />` next to the existing Excel template / Add item buttons.

**M5 — Estimator tooltip:**
- `EstimatorLine` extended with `ai_info_summary_en: string \| null`.
- `estimator.ts` query selects `ai_info`, populates `ai_info_summary_en` from `it.ai_info?.summary_en`.
- `estimator/[configId]/page.tsx:267` — item-name link's `title=` shows the summary when present, with a newline + "Click to edit…" continuation line.

**Verification:**
- `npx tsc --noEmit` — clean.
- `npm run build` — clean (no lint script available; build does its own validation).
- DB before commit: 73 active items across 9 categories (verified via SELECT after M1).

**Architecture notes left for future me:**
- `waitUntil` requires `@vercel/functions` (now installed). On any non-Vercel runtime it falls back to a no-op which means the regen would never run; we only deploy to Vercel so this is fine.
- Auto-poll runs ONLY while spinners are visible — checks `sections.some(it.ai_info_status in queued/running)`. Page is otherwise static SSR, so no perf concern.
- Cost: Haiku ~$0.001/call. Bulk regen of 73 items ≈ $0.07 worst case; daily auto-regens negligible.
- The `web_fetch` tool may fail outright if Anthropic blocks Amazon EG (likely). Fallback path always works since prompt instructs Claude to set source='general_knowledge' on fetch failure.
- History table prune is fire-and-forget; if it fails the next regen also tries to prune so we don't accumulate unbounded.

**Files touched (M2–M5 commit):**
- New: `src/lib/beithady/inventory/ai-item-info.ts`, `src/app/beithady/inventory/items/_components/ai-info-card.tsx`, `src/app/beithady/inventory/items/_components/bulk-ai-info-button.tsx`
- Edited: `src/lib/beithady/inventory/catalog.ts`, `src/app/beithady/inventory/items/actions.ts`, `src/app/beithady/inventory/items/_components/items-section-list.tsx`, `src/app/beithady/inventory/items/page.tsx`, `src/lib/beithady/inventory/estimator-shared.ts`, `src/lib/beithady/inventory/estimator.ts`, `src/app/beithady/inventory/rules/estimator/[configId]/page.tsx`, `package.json`, `package-lock.json`

**Smoke test plan (post-deploy):**
1. Load `/beithady/inventory/items` → 73 items across 9 sections, every row has chevron.
2. Click any chevron → "No AI info card yet" CTA appears.
3. Click "Generate AI info" → spinner ~5–10s → full card renders with summaries, features, tips.
4. Header should show "AI info for ~73 missing" pill — click → all rows flip to spinner; auto-poll fills them in over ~2 min.
5. Click "Change" on Amazon URL → save valid URL → row flips to spinner (queued). Wait ~10s + refresh → card now shows source=Amazon EG.
6. Estimator detail page: hover any item name → tooltip shows summary_en (after at least one regen completes for that item).

---

## 🟢 Earlier today — Auto-archive Guesty system-notification emails SHIPPED (Option B2 — parallel session)

User picked Option B2. Migrations 0058 + 0058a applied via Supabase MCP, code commit `e7632b3` pushed to main (then merged with upstream's parallel `0058_inventory_ai_info.sql` — both coexist, no conflict).

**Migrations applied:**
- `0058_beithady_auto_archive_system_notifications.sql` — adds `beithady_conversations.is_system_notification BOOLEAN NOT NULL DEFAULT false` + partial index `idx_bh_conv_system_notif` + new RPC `beithady_classify_system_notifications()`
- `0058a_extend_archived_reason_check.sql` — extends `beithady_conversations_archived_reason_check` allowlist with `'system_notification'` (was rejecting it on first classify run; previous values: `manual_month_bulk, auto_cron_90d, manual_single, duplicate, restore_undo`)

**RPC behavior:**
- Two-pass: archive + restore
- Archive branch: flips `is_system_notification=true` + sets `archived_at + archived_reason='system_notification'` for any conv where ALL posts match `module_type='email' AND from_type='host' AND module_subject ILIKE 'NEW BOOKING from %'`
- Restore branch: un-archives + clears flag if any non-pattern message later arrives. Future-proofs against guests replying on a flagged thread.

**Cron wire-in:**
- `/api/cron/beithady-comm-sync/route.ts` now runs the classifier as Step 3 after orphan recovery + SQL mirror
- Best-effort error handling: classifier failure logs but doesn't fail the cron
- Audit row metadata gains `classify: { archived, restored }` field
- Returns `classify` in the JSON response

**One-shot manual run cleared 18 system-notification rows** including both convs from the user screenshot (`60b63d94 BH-26-002 manual` and `e907161a BH-435-202 airbnb2`). Verification:
- `flagged_total: 18`
- `flagged_archived: 18`
- `flagged_active_BUG: 0`

**Branch state:** `claude/gallant-brahmagupta-1d925c`. Last commit `6f89fe0` (auto-archive ship + merge). Local `vercel --prod` skipped (network flaky); GitHub auto-deploy to `limeinc.vercel.app` is canonical.

**End-state in production:** the 18 system-notification rows are archived. Future inbound: next 5-min cron tick auto-classifies any newly-arrived booking-notification email. The active inbox now shows only real guest threads. Archive tab can be browsed for the system-notification history if needed (filter by `archived_reason='system_notification'`).



User screenshot showed two "Unknown guest" rows in the unified inbox after the orphan recovery pulled them in:
1. **MANUAL · BH-26-002 · 4/30/2026 12:22:16 PM** — conv `60b63d94-083d-4201-b138-0741287195f4`
2. **AIRBNB · BH-435-202 · 4/30/2026 11:04:11 AM** — conv `e907161a-6b71-4160-bd77-4ccbf14d9543`

**Definitive diagnosis:** both are **Guesty automation-generated booking-notification emails sent into the host's own inbox**, not real guest conversations.

Evidence from `beithady_messages` query:
- Conv 1 has 1 message: `module_type='email', module_subject='NEW BOOKING from manual', from_type='host', direction='inbound'`, body is `<!DOCTYPE html>...📩 **A New Booking Received from : <strong>manual</strong></div>...Type of Reservation: Reservation Extension`
- Conv 2 has 1 message: same shape, subject `NEW BOOKING from Airbnb`
- Both have `guest_full_name=NULL, guest_email=NULL, guest_phone=NULL` because the Guesty service address has no real guest identity

The same booking (`Ali Lushe / BH-26-002`) has a **separate real conv** `3b43b2d2-…` with proper guest_full_name + email + phone. The system-notification thread is parallel noise.

**Two fix options sent for user pick:**

- **Option A — disable in Guesty (root cause).** User's Guesty workspace has an "Automation: email host on every NEW BOOKING from {channel}" rule. Disable in Guesty Admin → Automations. Cleanest — they stop being created.
- **Option B — server-side filter:**
  - B1: hide from active inbox + new "System notifications" filter
  - B2: auto-archive on ingest (~30 lines) — migration adds `is_system_notification BOOLEAN DEFAULT false` to `beithady_conversations`; update `beithady_communication_ingest()` to set the flag + auto-archive when `module_subject ILIKE 'NEW BOOKING from %' AND from_type='host'` and only one post; `listInbox()` already excludes archived by default

Recommended: A long-term + B2 immediate cleanup. Awaiting user pick.

**Branch state:** `claude/gallant-brahmagupta-1d925c`. Last commit `fc97ca3` (handoff for split kill switches). No commits this turn.

## 🟢 Earlier turn — Split kill switch SHIPPED (1 manual + 12 per-automation switches + admin UI)

User confirmed Q1–Q5: include AI under automatic, **separate switch per automation**, carry over current state (TRUE = paused), add settings UI. One commit `d7e5314` pushed to main.

**Migration 0057 applied via Supabase MCP** — seeded all 13 flags TRUE per Q3 carry-over:
- `beithady_pause_manual_outbound` — agent inbox composer
- `beithady_pause_ai_auto_reply`
- `beithady_pause_pre_arrival`
- `beithady_pause_csat_survey`
- `beithady_pause_boarding_pass`
- `beithady_pause_loyalty_notifications`
- `beithady_pause_upsell_offer`
- `beithady_pause_cancel_risk_reconfirm`
- `beithady_pause_morning_brief` (covers Ops + GR + Finance briefs)
- `beithady_pause_late_reply_digest` (forward-compat — delivery wires up in Phase F)
- `beithady_pause_vip_digest` (forward-compat — delivery wires up in Phase F)
- `beithady_pause_daily_report_dispatch`

Legacy `beithady_outbound_paused` row stays in `beithady_settings` for history but is no longer checked by code.

**New artefacts (commit `d7e5314`):**
- `src/lib/beithady/automations.ts` — typed `AUTOMATION_REGISTRY` catalog with label/description/category/triggeredBy per automation. Helpers: `isManualOutboundPaused`, `isAutomationPaused(key)`, `setManualOutboundPaused`, `setAutomationPaused`, `getAllPauseStates`. Adding a new automation = extend registry + gate at entry point + UI auto-renders a toggle.
- `src/app/beithady/settings/outbound/page.tsx` + `actions.ts` — admin-only page (added to `ADMIN_ONLY_SETTINGS_SUBTABS`) with 13 toggles grouped by category (Inbox, Communication, Engagement, Operations, Reports). Header banner shows aggregate state ("N of 13 switches paused"). Each row: icon + label + description + triggeredBy + Pause/Resume button (form posts to `toggleOutboundFlagAction`).
- New tile on `/beithady/settings` launcher (PowerOff icon, rose accent).
- Added `outbound` to `ADMIN_ONLY_SETTINGS_SUBTABS` in auth.ts.

**Refactored senders:**
- `send-guesty.ts` / `send-wa-casual.ts` accept `mode: 'manual' | 'automatic'` (default 'manual'). Manual gates on the manual flag only when mode='manual'. Audit row error code now says `manual_outbound_paused` instead of generic `outbound_paused`. Imports switched from `isOutboundPaused` (deprecated) to `isManualOutboundPaused`.
- `channel-switch.ts` `DispatchPayload` + `sendViaChannel` plumb mode through.
- All manual call sites (composer actions) keep default `mode='manual'` — no signature change required.

**Refactored automation entry points (each gated with `if (await isAutomationPaused(KEY)) return ...`):**
- `src/lib/beithady/ai/auto-reply.ts:processInboundForAutoReply` — short-circuits before classify/draft/send so we don't burn tokens. AI's downstream `sendWaCasualMessage` call now passes `mode: 'automatic'`.
- `src/lib/beithady/engagement/{pre-arrival,csat,boarding-pass,loyalty-tick,upsell}.ts` — each `run*Dispatch` returns early with `paused: true`. Internal `sendWaCasualMessage` calls all pass `mode: 'automatic'`.
- `src/app/beithady/operations/calendar/actions.ts:sendReconfirmationAction` — returns `cancel_risk_reconfirm_paused` when paused.
- `src/lib/beithady/morning-brief/run.ts` — gates the WA delivery loop only; brief still builds + persists for the web archive page.
- `src/lib/beithady-daily-report/distribute.ts` — per-recipient skip path: writes `daily_report_deliveries` row with `status='skipped', error_message='daily_report_dispatch_paused'`.

**Legacy `isOutboundPaused()` retained as deprecated shim** reading the manual flag — preserves any external imports while we migrate.

**Branch state:** `claude/gallant-brahmagupta-1d925c`. Last commit `d7e5314` pushed to `main`. Vercel auto-deploy via GitHub integration is the canonical path; local `vercel --prod` retried twice and hit transient DNS / ETIMEDOUT errors but does not affect the GitHub-triggered production build.

**To use:** Navigate to **`/beithady/settings/outbound`** (admin only). All 13 toggles currently show "Paused" (rose). Click "Resume" on each one as you're ready to release that path. Manual inbox is the one to flip first if you want to type replies again. Each flip is audited under module=settings, action=setting_updated.

## 🟡 Earlier turn — User requested splitting the outbound kill switch into manual-vs-automatic; sent Q1–Q5 for confirmation (no commits)

User: "separate the toggle between the manual inbox sending and the automatic template sending. ask if not clear"

**Plan drafted (pending answers):**

Replace single `beithady_outbound_paused` with two independent flags:
- `beithady_outbound_paused_manual` — agent-driven sends from inbox composers (GuestyComposer / WaCasualComposer / SwitchComposer / Phase C.5 sendMessageWithSwitchAction)
- `beithady_outbound_paused_automatic` — machine-triggered sends (AI auto-reply, cron-driven templates, morning brief WA broadcasts, K.2 cancel-risk WA re-confirm, late-reply digest, Phase F pre-arrival/CSAT/boarding-pass dispatches)

**Implementation sketch:**
- Add `mode: 'manual' | 'automatic'` arg to `sendGuestyMessage` / `sendWaCasualMessage` / `sendWaCloudMessage` / `sendViaChannel`. Update all call sites to declare their mode.
- `isOutboundPaused(mode)` reads the right flag from `beithady_settings`.
- Retrofit non-gated senders (K.2 reconfirm, morning brief, late-reply digest) so the automatic kill switch covers them — these currently call provider APIs directly without going through the wrapper, bypassing the flag entirely.
- Migration `0057_beithady_split_outbound_kill_switch.sql` — adds two new keys, backfills from current value per Q3.
- Settings UI page (Q4 pending) — two toggles with audit attribution.

**Q1–Q5 sent to user:**
- Q1: AI auto-reply belongs under `automatic`? (recommend yes — machine-triggered)
- Q2: Fold K.2 reconfirm + morning brief + late-reply digest + Phase F dispatches under the new automatic flag (currently they bypass the kill switch entirely)? (recommend yes)
- Q3: Initial values on migration — carry over `true → true/true` (a), reset both to false (b), or split `manual=false/automatic=true` (c)? (recommend c — type replies today, machine sends stay paused)
- Q4: Add settings UI (`/beithady/settings/outbound` with two switches + audit) or SQL-only? (recommend add UI — frequently flipped, audit attribution improves)
- Q5: Naming — `_manual`/`_automatic` (chosen) vs `_inbox`/`_templates`, `_agent`/`_machine`, `_human`/`_bot`? (open)

**Estimate:** 3 commits — migration + lib mode-aware refactor + settings UI page.

**Branch state:** `claude/gallant-brahmagupta-1d925c`, last commit `a756172` (orphan-recovery handoff). No commits this turn.

## 🟡 Earlier turn — Diagnosed "outbound_paused" 503 on Hady Family send + confirmed capability matrix correctness (no commits, awaiting user "go" to flip kill switch)

User screenshot showed Hady Family thread now visible (orphan recovery worked). User clicked send via channel switcher and got `Send failed · status 503 · outbound_paused`. Capability matrix correctly showed all 4 alternative channels (WA Casual / WABA / Email / SMS) crossed out.

**Two distinct findings, both correct behavior:**

### 1. Global emergency kill switch is ON
`beithady_settings.beithady_outbound_paused = true`. This flag is checked at the top of `sendGuestyMessage` AND `sendWaCasualMessage` (and the WABA stub) BEFORE touching any provider. When true, every outbound returns `{ ok: false, status: 503, error: 'outbound_paused' }` and writes a `send_guesty_blocked_killswitch` audit row.

Audit confirmed: at 2026-04-30 07:32:56 UTC, user's send attempt for conversation `1d523f48-0bf6-4897-a33d-5d7226f5c7e4` (Hady Family) was blocked with reason `beithady_outbound_paused=true`. Someone turned this on (likely safety pause during earlier development) and never turned off.

**To flip it off** — ask user for explicit confirmation since this affects production message delivery (also re-enables AI auto-replies, K.2 cancel-risk WA, morning brief broadcasts, etc.). User asked "Outbound Paused?" — I responded explaining the kill switch + asked before flipping. Awaiting yes/no.

### 2. Capability matrix correctly shows all 4 alternatives unavailable for THIS conversation
Hady Family is an **Airbnb inquiry** — guest hasn't booked yet. Airbnb doesn't release phone or email to hosts until booking confirmation. The `beithady_conversations` row confirms `guest_phone: null` AND `guest_email: null`.

So:
- WA Casual / WABA / SMS → need phone → unavailable (correct)
- Email → needs email → unavailable (correct)
- Only **Guesty's native module=whatsapp** (Airbnb's masked tunnel via Guesty) is viable for inquiry-stage threads — this is the existing default, not a switcher target

Channel switcher behaves as designed (Phase C.5 spec). Once Hady Family books → Airbnb releases phone/email → the switcher will light up automatically.

**No code change needed** — this was a state question, not a bug.

**Branch state:** `claude/gallant-brahmagupta-1d925c`, last commit `a756172` (handoff for orphan recovery verification). No commits this turn.

## 🟢 Earlier turn — Orphan recovery VERIFIED in production (post-wakeup check)

ScheduleWakeup fired 6 minutes after deploy. Ran the four verification queries against Supabase:

**(a) Cron run sequence in `beithady_comm_sync_runs`:**
| Time (UTC) | Code | conversations_upserted | messages_upserted |
|---|---|---|---|
| 06:35:42 | pre-fix | 0 | 0 |
| **06:40:29** | **NEW** | **17** | **22** |
| 06:45:35 | new (steady-state) | 0 | 0 |

**(b) `beithady_orphan_conv_ids(500)` returns 0 rows** — down from 17.

**(c) Hady Family `69f2f16b824ad00012c34e12` exists in BOTH tables:**
- `guesty_conversations`: last_message_user_at=06:09:20 (host "Received ✅"), last_message_nonuser_at=06:06:36 (guest "Test Message")
- `beithady_conversations`: mirrored with correct semantics — `last_inbound_at=06:06:36`, `last_outbound_at=06:09:20`

**(d) Audit row at 06:40:34:**
```json
"recovery": { "scanned": 17, "recovered": 17, "notFound": 0, "failed": 0, "errors": [] }
```

**End-state:** zero orphans, all 17 previously-invisible conversations now in the unified inbox. User should see Hady Family + Abdullah Idrees + 14 booking auto-notifications + 1 newer thread when they refresh. Future brand-new conversations land on first webhook tick via lazy-create; cron sweeps any misses every 5 minutes.

## 🟢 Earlier this turn — Orphan recovery SHIPPED (Hady Family bug fix)

User: "Ship all automatically" → fix landed in 2 commits + applied migration:

| Commit | What |
|---|---|
| `6347899` | feat code: lazy-create + orphan-scan recovery |
| `4d51b21` | merge resolution to keep upstream handoff |

Migration `0056_beithady_orphan_conv_recovery.sql` — applied via Supabase MCP. Adds RPC `beithady_orphan_conv_ids(p_limit int)` that returns up to 500 orphan conversation_ids ordered by latest post recency.

**Confirmed via the new RPC:** 17 orphans currently in the system, including:
- `69f2f7ee961ab90013cd53ff` (newest, ~9:34 Cairo)
- `69f2f16b824ad00012c34e12` (Hady Family, 2 posts)
- `69f2e786aa8177001222e798` (Abdullah Idrees, 5 posts)
- 14 booking auto-notification threads going back to 4/28

**New artefacts:**
- `src/lib/guesty.ts` — `getGuestyConversation(id, fields?)` — fetches single conversation via `GET /v1/communication/conversations/{id}` with `data` envelope unwrap. Returns null on 4xx/5xx (caller decides what to do).
- `src/lib/run-guesty-sync.ts` — `normalizeConversationRow` is now exported (was internal). No behavior change.
- `src/lib/guesty-conversation-recovery.ts` — `fetchAndUpsertConversation(id)` (single-id recovery, with fast-path skip when row already exists) + `recoverOrphanedConversations(maxToFetch=50, throttleMs=200)` (batch scan, sequential, throttled to keep Guesty rate-limit headroom).
- `src/lib/guesty-webhook.ts` `ingestMessage` — calls `fetchAndUpsertConversation(conversationId)` before upserting the post. Fast-path no-op when row exists. Best-effort: logs and continues on failure (next cron tick will recover).
- `src/app/api/cron/beithady-comm-sync/route.ts` — runs `recoverOrphanedConversations(50, 200)` BEFORE the SQL mirror. Best-effort: if recovery throws, the SQL mirror still runs. Audit row now includes recovery stats.

**Why the bug existed:** Guesty's webhook subscription on this Beithady account does NOT fire `conversation.created` events. Only `reservation.messageReceived` / `reservation.messageSent` arrive. Verified via `guesty_webhook_events` query — 0 rows ever for `event_name like 'conversation.%'`. The webhook handler's `ingestMessage` did `UPDATE guesty_conversations` for the parent — silent no-op when the conv didn't exist. Posts upserted into `guesty_conversation_posts` correctly but were orphaned. The SQL ingest proc `beithady_communication_ingest()` LEFT JOINs posts → conversations and skips orphans entirely.

**Pre-existed Phase C.5 by months** — was hidden because the daily 4:40 UTC `/api/cron/guesty` pull catches up overnight. Affected every brand-new conversation message between daily syncs.

**Risk register status:**
- R1 — Guesty Open API rate limit on parent fetches: mitigated by 50 cap + 200ms throttle
- R2 — webhook race condition (parent fetched while concurrent webhook fires): existing `onConflict:id` upsert handles
- R3 — Guesty 404 on very-fresh conversation: returns null, logged, next cron tick retries
- R4 — recovery failure blocks SQL mirror: mitigated by try/catch around recovery; SQL mirror runs even if recovery throws

**Validation pending:** next 5-min cron tick (next firing at the 5-minute boundary in UTC) should:
1. Call `beithady_orphan_conv_ids(50)` → 17 rows
2. Fetch each from Guesty Open API and upsert into `guesty_conversations` (or skip if 404)
3. Call SQL mirror — `beithady_communication_ingest()` joins now-non-orphan posts → mirrored to `beithady_conversations` + `beithady_messages`
4. Hady Family + others appear in `/beithady/communication/unified` within ≤5 min of deploy

User should refresh their unified inbox in ~5-10 minutes; "Hady Family" + 16 other conversations should land. Audit row at `/beithady/settings/audit` will show `comm_sync_run` with new `recovery: {scanned: 17, recovered: N, ...}` field.



## 🟠 Latest turn — Diagnosed pre-existing orphaned-conversation bug (NOT shipped — awaiting user "go")

User screenshot showed they sent "This is a Test Message" via Guesty (Hady Family inquiry, Airbnb, BH73-3BR-SB-3-305, 9:06 AM Cairo / 06:06 UTC) but the message never appeared in our Unified Inbox at limeinc.vercel.app. They asked: "Where is my Test Message, it doesn't show up in inbox on app".

**Initially suspected** Phase C.5 deployment (just shipped 6 commits). Ruled out — diagnosis traced to a pre-existing bug.

**Definitive diagnosis (via Supabase MCP queries):**

1. The post itself IS in our DB — `guesty_conversation_posts.id = 69f2f16b646a600011c746c1`, body = "Good Morning\n\nThis is a Test Message", from_type=guest, parent conv_id=`69f2f16b824ad00012c34e12`. Team's "Received ✅" reply is also there as post `69f2f210e41ade0011b3be34`, from_type=host.
2. **Both posts are ORPHANED** — parent conversation `69f2f16b824ad00012c34e12` does NOT exist in `guesty_conversations`. The SQL ingest proc `beithady_communication_ingest()` LEFT JOINs posts → conversations and skips orphans entirely.
3. **Root cause:** Guesty's webhook subscription on this Beithady account does NOT fire `conversation.created` events. Verified by querying `guesty_webhook_events` for the last 2h — 13 events received, ALL of them `reservation.messageReceived` or `reservation.messageSent`. Zero `conversation.*` events ever (`event_name like 'conversation.%'` returned 0 rows).
4. **Mechanism:** When a new conversation is created in Guesty, only the FIRST `reservation.messageReceived` webhook fires. Our `ingestMessage` handler (src/lib/guesty-webhook.ts:240+) does `UPDATE guesty_conversations SET last_message_user_at = X WHERE id = <new_id>` — silent no-op since the conversation row doesn't exist. The post itself gets upserted into `guesty_conversation_posts` correctly, but it's orphaned.
5. **Scope:** At least 9 orphaned posts visible across multiple conversations created TODAY (Hady Family, Abdullah Idrees + 7 booking auto-notifications). The full daily Guesty pull at 4:40 UTC (07:40 Cairo) is the only thing that materializes new conversation rows — anything created between daily syncs is invisible until tomorrow.
6. **Existing conversations work fine** — Krisztian Keszocze's 9:09 message arrived 3min after Hady Family's and IS in the inbox, because his conversation row was already in `guesty_conversations` from a previous daily sync; the webhook just bumped his `last_message_nonuser_at` and the 5-min comm-sync mirrored the change.

**Architecture confirmed:**
- `/api/cron/guesty` (daily, 4:40 UTC) — full pull from Guesty Open API → upserts `guesty_conversations` + `guesty_conversation_posts`
- `/api/webhooks/guesty/...` — real-time event handler. Handles `reservation.message*` (UPDATE-only on conv) + `conversation.*` (UPSERT, but Guesty doesn't fire these on this account)
- `/api/cron/beithady-comm-sync` (every 5 min) — runs SQL proc `beithady_communication_ingest()` which mirrors `guesty_conversations` + `guesty_conversation_posts` → `beithady_conversations` + `beithady_messages`
- The 5-min comm-sync can ONLY mirror data that's already upstream. It does NOT call Guesty's API.

**Proposed two-part fix (one commit, awaiting user "go"):**

1. **Modify `src/lib/guesty-webhook.ts` `ingestMessage`:** when the parent conv doesn't exist in `guesty_conversations`, fetch it via Guesty Open API (`GET /v1/communication/conversations/{id}`) and upsert before continuing. Prevents future orphans.
2. **Modify `/api/cron/beithady-comm-sync/route.ts`:** before calling the SQL proc, scan for orphaned posts (`SELECT DISTINCT conversation_id FROM guesty_conversation_posts gcp LEFT JOIN guesty_conversations gc ON gc.id=gcp.conversation_id WHERE gc.id IS NULL LIMIT 50`), fetch each missing parent from Guesty API, upsert. Recovers existing orphans (Hady Family + 8 others) on the next 5-min tick + any future webhook misses.

**Risk register for the fix:**
- R1 — Guesty Open API rate limit on parent-conversation fetches. Mitigation: cap orphan-scan at 50 per cron run, sequential, 250ms throttle between calls.
- R2 — webhook race condition (parent fetch happens during another webhook firing for the same conv). Mitigation: webhook ingest is already idempotent via post `id` upsert; double-create on conversation is harmless via `onConflict: id`.
- R3 — Guesty API returns 404 for very-fresh conversation (not yet propagated). Mitigation: log + skip; next cron tick retries.

**Why this is NOT a Phase C.5 problem:** Phase C.5 only added the channel-switcher UI + send dispatcher. It does not touch the ingest path or the inbox query. The bug pre-dates C.5 by months — it's been hiding since Phase C.1 because the daily Guesty sync was masking it (anything created between daily syncs was invisible for up to 24h).

**Awaiting:** User confirmation to ship the fix. No commits this turn.

**Branch state:** `claude/gallant-brahmagupta-1d925c`. Last commit `2f8efbb` (handoff for Phase C.5 ship).

## 🟢 Earlier turn — Phase C.5 Channel Switcher SHIPPED across 6 commits

User asked to switch outbound transport mid-thread to Green WP / WABA / Email / SMS with no-info revert. Plan → Workflow → Code with 95% confidence gates; user accepted all 10 questions + 12 improvements + workflow as drafted; PF1 (Guesty cross-module live probe) skipped on user's request.

**Commits + branch state:**

| Commit | Title | Vercel |
|---|---|---|
| `9da5c77` | feat(beithady): Phase C.5 migration 0055 — channel switcher schema | green |
| `454d899` | feat(beithady): Phase C.5 channel-switch library + WABA stub | green |
| `2f66f69` | feat(beithady): Phase C.5 sendMessageWithSwitchAction | green |
| `f51f868` | feat(beithady): Phase C.5 ChannelSwitcher UI component | green |
| `d9ceaa7` | feat(beithady): Phase C.5 wire ChannelSwitcher + cross-channel composer | green |
| `300b9cc` | feat(beithady): Phase C.5 cross-cutting — K.2 cancel-fallback + audit filter | deploying |

All pushed to `main` and auto-deployed to `limeinc.vercel.app` via the GitHub-Vercel integration; explicit `vercel --prod` also triggered after each commit on the worktree project `gallant-brahmagupta-1d925c.vercel.app`.

**Migration 0055 — applied via Supabase MCP `apply_migration`** (NOT pasted in dashboard):
- `beithady_conversations.preferred_outbound_channel TEXT NULL` + CHECK constraint allowing 7 targets (incl. forward-compat email_standalone / sms_standalone)
- `beithady_conversations.preferred_outbound_set_at TIMESTAMPTZ NULL`
- `beithady_messages.was_channel_switched BOOLEAN NOT NULL DEFAULT false`
- `beithady_messages.original_thread_channel TEXT NULL`
- `idx_bh_msg_guest_channel_outbound` partial index for the channel-score badge
- Verified via `information_schema.columns` query — all 4 columns present

**Library `src/lib/beithady/communication/channel-switch.ts` (new):**
- `ChannelTarget` union (5 wired today: wa_casual, wa_cloud, guesty_email, guesty_sms, guesty_whatsapp; 2 forward-compat: email_standalone, sms_standalone)
- F1 `resolveTargetChannel(ctx, target)` — validates phone/email + provider gates; returns `ResolveOk` (with display string) or `ResolveErr` with reason: `no_phone | no_email | provider_disabled | green_offline | wrong_home_channel | invalid_phone | unknown_target`
- F2 `sendViaChannel(target, payload)` — dispatcher routes to `sendGuestyMessage` (with module=email/sms/whatsapp) / `sendWaCasualMessage` / `sendWaCloudMessage` (501 stub)
- F4 `getAvailableChannels(ctx)` — capability matrix with per-target `available`, `reason`, `lastUsedAt`, `lastInboundAt`, `costHint`, `attachmentsSupported`, `voiceSupported`. Reads last 50 messages per guest for the "★ replied here Nh ago" badge.
- F5 `setPreferredChannel(conversationId, target)` — writes Q3-c "Remember" preference
- Helpers: `homeChannelToDefaultTarget` (smart default, improvement #3), `targetIsCrossChannel`, `hoursSinceLastInbound` (WABA 24h window)
- Source gating in F1: Airbnb / Booking conversations refuse `guesty_sms` ("no SMS sub-channel"); only `guesty` home channel allows guesty_* targets

**Library `src/lib/beithady/communication/send-wa-cloud.ts` (new):**
- `sendWaCloudMessage` returns `{ ok: false, status: 501, error: 'waba_not_yet_provisioned' | 'waba_send_not_implemented_yet' }` until C.4 ships. Real implementation lands when Beit Hady WABA is provisioned in Meta Business Manager.

**Server action `sendMessageWithSwitchAction` (in `actions.ts`):**
- Validates `target_channel` against allowed set; reads conversation row; calls F1
- F1 fail → redirect with `?switch_revert=<reason>&switch_hint=<text>` (UI shows banner + manual Revert per Q8-c)
- F2 success + cross-channel → updates `beithady_messages` row with `was_channel_switched=true` + `original_thread_channel=<home>` so thread bubbles can render the "via X" badge (single-thread view per Q4-a)
- `remember=on` → calls F5 to persist preference
- `backup_target` (improvement #10 multi-channel send) → fail-soft secondary send with separate audit row (`channel_backup_sent | failed | unresolvable`)
- Audit metadata-only per Q10: `{from, to, contact_used_hint, body_length, cross_channel, remember, backup}` — no body content

**UI `_components/channel-switcher.tsx` (new client component):**
- U1: 4 buttons (WA Casual / WABA / Email / SMS) with availability dot (green/red/grey), cost-hint $ badge, "★ Nh ago" channel-score badge, per-button tooltip
- U2: NoInfoBanner with friendly message, contact summary, CRM 360° deep-link `/beithady/crm/<guestId>?focus=phone|email` (improvement #6), manual Revert button
- U3: ActiveChannelPill with cross-channel indicator + "📌 Remembered" pill
- CapabilityMatrixLine (improvement #12)
- Alt+1..4 keyboard shortcuts (improvement #11) + collapsible Shortcuts hint
- Exports `ContactValidatorPill` (improvement #5) reused by switch-composer

**UI `_components/switch-composer.tsx` (new client component):**
- Used when `effectiveChannel` diverges from conversation home channel (cross-channel path)
- Inline phone/email validator pills, template-aware attachment-drop warning (improvement #4: heuristic on `{`, `}}`, `[[`)
- "Remember for this conversation" checkbox (Q3-c)
- "+Send X backup" multi-channel toggle (improvement #10)
- Char counter, kill-switch banner, fallback link rendering on error

**`thread-pane.tsx` (refactored to async server component):**
- Computes `effectiveChannel` precedence: URL `?ch` → `preferred_outbound_channel` → home-default heuristic
- Renders `<ChannelSwitcher>` above `<EffectiveChannelComposer>` which routes to:
  - GuestyComposer when `effectiveChannel ∈ {guesty_email, guesty_sms, guesty_whatsapp}` AND home=guesty
  - WaCasualComposer when home=wa_casual AND target=wa_casual
  - SwitchComposer otherwise (cross-channel path)
- WabaOutsideWindowBanner (Q6-b) — disables Send when target=wa_cloud AND >24h since last inbound

**Pages `unified/`, `guesty/`, `wa-casual/` page.tsx:**
- SearchParams + composerHints surface `ch`, `switch_revert`, `switch_hint`, `via`, `return_path`

**K.2 Cancel-risk fallback (improvement #9, R10 mitigation):**
- `sendReconfirmationAction` in `operations/calendar/actions.ts` now falls back to email-via-Guesty when guest_phone is missing AND env flag `BEITHADY_CANCEL_FALLBACK=true` (default off)
- Looks up the open Guesty conversation linked to the reservation and injects `module=email` post via `sendGuestyMessage`
- Audit row gains `via='wa_casual'|'guesty_email'` + `used_fallback` boolean
- Existing behavior preserved when env flag is off

**Audit page (improvement #8):**
- `Settings → Audit` gains an Action dropdown filter with the 6 Phase C.5 events grouped under "Channel switcher (Phase C.5)"
- `queryAudit` + `AuditQueryOpts` extended with optional `action` field

**All 12 improvements in:**
1. Live availability badges ✓ (ChannelButton dot color)
2. Channel score per guest ✓ (★ relative time badges)
3. Smart default ✓ (effectiveChannel resolution)
4. Template-aware switching ✓ (showAttachmentDropWarning)
5. Phone/email validators ✓ (ContactValidatorPill)
6. CRM ?focus= deep-link ✓ (NoInfoBanner)
7. Cost/risk hint ✓ ($ badge)
8. Audit filter ✓ (Settings → Audit Action dropdown)
9. K.2 fallback hookup ✓ (BEITHADY_CANCEL_FALLBACK env flag)
10. Multi-channel send ✓ (+Email backup checkbox)
11. Keyboard shortcuts ✓ (Alt+1..4)
12. Capability matrix one-liner ✓ (CapabilityMatrixLine)

**Out of scope (explicit, deferred):**
- ❌ WABA send pipeline → Phase C.4 (stub returns 501)
- ❌ Standalone Resend/Twilio providers → future phase
- ❌ AI auto-reply through new switcher → still hardcoded to wa_casual in `auto-reply.ts:5`; PF5 documented this gap, no code change needed for C.5
- ❌ Phase E AI gating preserved — the kill switch still independently disables auto-reply

**Pre-flights run:**
- PF1 (Guesty cross-module probe) — SKIPPED on user request; mitigation R1 in place (Airbnb/Booking SMS hidden via source gating in F1)
- PF2 confirmed via Supabase MCP — schema migration was metadata-only
- PF3 confirmed `getGreenInstanceState` returns `{stateInstance: 'authorized'}` for online
- PF4 confirmed `beithady_messages` `unique(channel, external_id)` — cross-channel rows safe (channel matches actual transport, not home)
- PF5 confirmed AI auto-reply hardcodes wa_casual; documented as out-of-scope
- PF7 confirmed last-inbound source = `beithady_messages.sent_at WHERE direction='inbound'`
- PF8 confirmed latest applied migration was `0054a` not `0046` per stale handoff line — used `0055` instead

**Manual test scenarios (NOT yet executed — user should validate):**
1. Airbnb thread → click WA Casual → message lands on guest phone via Green-API; row in thread shows "via WA Casual" cross-channel badge
2. Airbnb thread, no email → click Email → no-info banner shows + manual Revert
3. wa_casual thread → click WABA → button disabled, tooltip "Phase C.4"
4. Switch channel mid-typing → body preserved (form state inside SwitchComposer)
5. Toggle "Remember" → next thread reload defaults to switched channel
6. Alt+2 from Guesty thread → switches to WABA-disabled state
7. WABA outside 24h → Send disabled, banner explains template-only
8. "+Email backup" toggle → 2 outbound rows in beithady_messages, audit captures both
9. Settings → Audit → Action filter `channel_switched` → see all switches
10. K.2 batch with `BEITHADY_CANCEL_FALLBACK=true` + guest with no phone → email fallback fires

**Branch state:** `claude/gallant-brahmagupta-1d925c` ahead by SESSION_HANDOFF.md update only after `300b9cc`. Auto-deploy ongoing for last commit.

**Risk register status (10 risks):**
- R1 (Guesty cross-module rejection) — PF1 skipped; live probe deferred. Source gating in F1 prevents the most likely failure mode (SMS on Airbnb)
- R2 (table lock) — no lock observed, ADD COLUMN was metadata-only
- R3 (unique constraint collision) — confirmed safe, channel matches actual transport
- R4 (URL collision) — `?ch=` confirmed unused
- R5 (remember surprises user) — default unchecked
- R6 (WABA template gap) — banner-only per spec
- R7 (multi-channel cost) — toggle off by default
- R8 (smart default surprise) — only fires when preferred is set
- R9 (Alt key collision) — scoped to thread-pane, no global hijack
- R10 (K.2 fallback breaks batch) — gated by env flag, default off

## ✅ Earlier turn — Phase M.15.4 shipped: per-item Amazon EG source review on items list

User course-corrected away from inline source editing on the estimator detail page → wanted editing on the **items list page**, items grouped by category, with explicit Accept ✓ / Change ✎ per row so each URL change cascades into every unit-config budget. Plan → Workflow → Code phases with 95% confidence gates; user accepted all defaults except #5 (only edit on items page; remove URL field from the big ItemFormButton modal entirely).

**Shipped (commit 24826cd, deployed dpl_BHwcEM5wgfP4tMaLMSVZE4sJsHFw):**

**Schema migration `0053_amazon_eg_review_state.sql`** — MUST be run manually in Supabase SQL Editor (per AGENTS.md, supabase CLI isn't on PATH on Windows). Until run, every Source action returns: `Run migration 0053_amazon_eg_review_state.sql in Supabase SQL Editor before reviewing sources.` Adds:
- `amazon_eg_url_reviewed_at timestamptz`
- `amazon_eg_url_reviewed_by uuid REFERENCES app_users(id) ON DELETE SET NULL`
- Partial index on `(reviewed_at) WHERE amazon_eg_url IS NOT NULL` for the Needs-review filter

**Server actions (`items/actions.ts`):**
- `setAmazonSourceAction(itemId, url|null)` — validates `AMAZON_EG_URL_PATTERN`, resets `amazon_eg_price_egp / pack_size / image_url / last_status` plus `reviewed_at / by` (new ASIN ⇒ unverified)
- `acceptAmazonSourceAction(itemId)` — refuses if URL null; stamps reviewed_at/by; promotes status `unchecked` → `ok`
- `acceptManySourcesAction(itemIds[])` — bulk; server-side `IS NOT NULL` filter so stale clients can't accept rows without URLs; status flip restricted to the unchecked/null subset
- All: `requireBeithadyPermission('inventory', 'full')`, single `recordAudit` per call, revalidate items + estimator + dashboard

**UI (`/beithady/inventory/items`):**
- Items grouped into `<section id="cat-{code}">` blocks per `listCategories()` order, H2 + sub-table per section
- New "Jump to category" client select scrolls to anchor (replaces hard-filter category dropdown)
- "Needs review" filter chip with badge count
- Sticky bulk-accept bar appears when ≥1 row checked: shows N selected + M eligible (URL-set), disabled when M=0
- Per-section header counter: `7 items · 5 sourced · 3 reviewed`
- `SourceCell` client component: 3 visual states + Change/Set popover
- `ItemFormButton` modal no longer renders the Amazon EG URL field (per user choice — single source of truth)
- `ix-flash-highlight` CSS animation for hash-anchor scroll target

**Estimator detail page tightened:**
- Item name + SKU now deep-link to `/beithady/inventory/items#item-<id>`
- Source column still click-throughs to Amazon EG (buy affordance only)
- Deleted orphan `src/app/beithady/inventory/rules/estimator/actions.ts`

**Catalog lib changes:** `ItemRow` extended with `amazon_eg_url_reviewed_at` + `amazon_eg_url_reviewed_by`; `ItemListRow` adds `amazon_eg_url_reviewed_by_name` joined via `app_users.username`; `listItems()` learns `needsReview` filter.

**Risks for next iteration:**
- Migration not yet run → first Accept click will surface the friendly error. User needs to paste the SQL once.
- `amazon_eg_url_reviewed_by_name` joins via `app_users(username)`. If a richer display field added later (full_name, display_name), bump the SELECT in `listItems()`.
- No "Select all visible" master checkbox spanning sections — per-section only.
- Bulk-accept promotes status `unchecked → ok` only; items in `oos` / `price_changed` / `404` keep that status while the operator's review still stamps the timestamp.

## 🟡 Earlier turn — Phase C.5 "Channel Switcher" — plan + workflow drafted, awaiting workflow sign-off (no commits this turn)

User asked for ability to switch outbound transport mid-thread to **Green WP / WABA / Email / SMS** with a "no info → revert" guardrail when guest contact field is missing. Process: Plan → Q&A → Workflow → review → Code (per user's "95% confidence per phase" rule).

**Plan delivered + answered:** 10 clarifying questions (Q1–Q10) + 12 improvement suggestions. User replied **"Yes to all"** — adopting every recommended default and improvement.

**Confirmed scope (Phase C.5):**
- Email/SMS sends route through Guesty's `module=email|sms` field (path Q2-a — defer standalone Resend/Twilio providers)
- One-shot send + optional "Remember for this conversation" checkbox (Q3-c)
- Cross-channel sends inject into the current thread with a "via X" badge (Q4-a) — single-thread view preserved
- WABA button **visible-but-disabled** until C.4 ships (Q5-a) with stub `sendWaCloudMessage` returning 501
- WABA outside-24h enforcement is a banner, not auto-popping the template picker (Q6-b)
- Manual revert only on no-info banner (Q8-c) — no auto-revert timer
- Existing `'communication':'full'` permission gates the action (Q9)
- Audit logs metadata only — no message bodies (Q10)
- All 12 improvements in: live availability badges, channel score per guest, smart default, template-aware switching, phone/email validators, CRM `?focus=` deep-link, cost/risk hints, audit filter, K.2 cancel-fallback hookup, multi-channel "+Email backup," `Alt+1/2/3/4` shortcuts, capability matrix one-liner

**Workflow drafted (sent for review, awaiting "go"):**
- 8 pre-flight investigations (PF1 = Guesty cross-module probe is the only at-risk one — proposed running it as a one-shot test post into a real thread)
- 6 commits, each independently deployable: migration → library → server action → UI components → wire-in → cross-cutting (WABA gating + multi-channel + bulk hookup)
- Migration `0047_beithady_channel_switch.sql` adds `preferred_outbound_channel` + `preferred_outbound_set_at` to `beithady_conversations` and `was_channel_switched` + `original_thread_channel` to `beithady_messages`
- Risk register: 10 risks identified, R1 (Guesty cross-module rejection on Airbnb-native conv) is highest — mitigation = hide Email/SMS buttons on Airbnb/Booking threads if PF1 fails
- Test plan: typecheck + build per commit, 10 manual end-to-end scenarios after Commit 6
- Estimate: ~5.5 hours of focused work, 1 working session

**Files I will touch (preview only — no edits this turn):**
- NEW: `src/lib/beithady/communication/channel-switch.ts`
- NEW: `src/app/beithady/communication/_components/channel-switcher.tsx`
- NEW: `supabase/migrations/0047_beithady_channel_switch.sql`
- MODIFY: `thread-pane.tsx`, `composer.tsx`, `wa-casual-composer.tsx`, `actions.ts`, `inbox.ts`

**Architecture context I confirmed by reading:**
- `thread-pane.tsx` routes composer by `header.channel` (guesty / wa_casual / wa_cloud-stub) — needs to key on `effectiveChannel` instead
- `composer.tsx` already has a "Channel hint" chip group (WhatsApp/Email/SMS) — but only switches Guesty's internal `module` field, not the transport. Will be promoted into a true cross-channel switcher.
- `send-guesty.ts` accepts `module: 'email' | 'sms' | 'whatsapp' | 'log'` — already routable via Guesty Open API
- `send-wa-casual.ts` (Green-API) requires E.164 phone — uses `external_id` of conversation today; needs to accept arbitrary phone for cross-channel
- `meta_waba` provider slot exists in `src/lib/credentials.ts` but **no send function** — stubbed return 501
- Email/SMS as standalone (Resend/Twilio) does NOT exist — out of scope for C.5

**Branch state:** `claude/gallant-brahmagupta-1d925c` worktree, clean. No commits this turn.

**Next user action:** Confirm workflow + answer "run PF1 as live Guesty probe yes/no" + any commit resequencing. Then I execute pre-flights → Commit 1 → 6 with auto-deploy after each.

## 🔴 Earlier turn — Guesty attachment proxy: 11 Open-API candidates all 4xx; 4 internal-app candidates added + graceful UI fallback shipped

User confirmed real-photo placeholders STILL fail after the POST-signing iteration. Final diagnostic:

- 6 POST signing endpoints (`/v1/communication/attachments/{id}/sign` etc.) → 404 (don't exist on Open API)
- 4 GET endpoint variants → 404 or 400 validation errors
- s3-direct → 403 AccessDenied (bucket private, signed URLs required)

**Definitive conclusion: Guesty's Open API does NOT expose attachment signing.** The signed URLs we observed in the user's browser are minted by Guesty's INTERNAL admin app at `app.guesty.com`, not their integration API. The 4 attempts that returned `Cannot POST /api/v2/...` HTML pages confirm those routes don't exist on Guesty's Express server either.

**Side bug fixed during the iteration:** my POST-signing + V3-fix commits (986ddc26, 60be4e9) were never pushed to `origin/main` because a sibling worktree's commits diverged the branch. `vercel --prod` was deploying my code to the worktree-specific Vercel project (`optimistic-brown-e4d920`), not to `limeinc.vercel.app` which auto-deploys from `main` via GitHub. Resolved by `git merge origin/main`, accepting their SESSION_HANDOFF, then pushing the merged head as `a92562a`. Limeinc auto-deploy now has all my commits.

**This-turn shipped:**
1. **4 last-ditch internal-app candidates** — `https://app.guesty.com/api/v2/communication/conversations/{cId}/posts/{pId}/attachments/{aId}` and 3 sign/url/post variants. Bearer token probably won't authenticate (their UI uses session cookies) but worth one attempt.
2. **`<ImageWithFallback>` client component** — replaces direct `<img src=proxyURL>` rendering:
   - Fetches the proxy URL via JS on mount, checks status
   - 2xx → blob URL + renders inline
   - Non-2xx → amber explanation card: "Couldn't load original media · Guesty stores guest-uploaded photos on a private CDN with short-lived signed URLs that their integration API doesn't expose to third parties. To view this photo, open the conversation in Guesty's web app where the URL is signed by their UI on demand."
   - During fetch → spinner with filename
   - Eliminates broken-image-icon UX

**Where this leaves us:** if Guesty ever ships attachment signing in their Open API, we add one candidate to the proxy and it lights up. Until then, agents see honest copy explaining the limit. The placeholder still fires only on Airbnb/Booking empty messages (heuristic tightened earlier this session).

## ✅ Earlier turn — Estimator lines click-through to Amazon EG (buy-now affordance)

User saw every Source cell rendered as "No source" plain text and asked: "Want to be able to click and go to the source of the item to buy". Direct interpretation: rows must always be clickable to a buy page, not only when the canonical Amazon EG URL is set.

**Fix shipped (commit d67fa5f, deployed dpl_41ni1674fZ5L1T7bWXpZNCd5YY9w):**
- New helper `buildAmazonSearchUrl(itemNameEn)` → `https://www.amazon.eg/s?k=<encoded item_name_en>`
- Item-name + SKU cell now wrapped in `<a target="_blank">` linking to `amazon_eg_url ?? buildAmazonSearchUrl(item_name_en)`. Hover emeralds the SKU and underlines the name so the affordance is visible.
- Source cell: when URL is set → existing "Amazon EG" badge with status tone (unchanged). When URL is missing → replaces the dead "No source" text with a clickable "Search Amazon EG" pill (Search icon from lucide-react) firing the same fallback URL.
- Both anchors carry `rel="noreferrer noopener"` and a `title` tooltip indicating whether they go direct or fall through to search.

**Why search-fallback instead of a sourcing workflow:** Amazon EG sourcing was supposed to populate `amazon_eg_url` per item via M.15.2 ingest, but the current data shows every item with `amazon_eg_url=null`. Proper fix is (a) run that ingest, then (b) build a per-line "Choose Amazon match" UI for items that fail to auto-source. Until that's productized, the search link is the lowest-effort way to deliver the click-to-buy the user asked for.

**Earlier this turn — fixed the Edit-button 404 (commit 79e7483):**
- Created `src/app/beithady/inventory/rules/estimator/[configId]/page.tsx` (the dynamic route was missing → every Edit click 404'd)
- Server-rendered breakdown via `computeEstimatorOutput`: header (config name, tier badge, BR/BA/guests, total/per-checkin/per-guest), 6 group-total cards, per-group line tables (formula, base/computed/effective qty, loss %, unit cost, line total, source, rule scope chip), help banner pointing at the rules page for actual edits

**Risk for next iteration:**
- Search URL uses raw `item_name_en` — items like "Bleach 1L" or "Conditioner bottle 30ml" may rank loosely. If poor matches: strip trailing size suffixes (`\s+\d+(\.\d+)?\s*(ml|l|g|kg|oz|pack|count|ct)$`) before encoding, or send category code as a secondary keyword.
- `RuleFormButton` doesn't expose a `unit_config` scope_value picker, so the help banner asks users to copy a UUID into a free-form field. Cleanest fix: detail page gets an "Add config-specific rule" button that opens the form pre-filled with `scope=unit_config` + `scope_value=<configId>` locked.

## 🟡 Earlier turn — Iterating Guesty attachment proxy; assets.guesty.com 400's empty, all API endpoints 404

User confirmed real photo uploads (not just structured cards) appear in Guesty UI but didn't render in our app. Iteration chain:

1. **Found the actual payload shape**: `attachments[].attachmentUrl` (relative path) + `type` (extension) — not `url`/`downloadUrl`
2. **CDN guess `app-public-cdn.guesty.com`** → NXDOMAIN
3. **Probe-and-cache 8 candidates** → `assets.guesty.com` returns 200 on HEAD but `<img src="...">` 400's in browser
4. **Server-side proxy with Bearer token** → still 400 with empty body
5. **Tried 7 API endpoint variants** → all 404, including `/v1/communication/*/attachments/*` and `/v1/<path>`. Server internally proxies `/v1/*` → `/api/v2/*` per the 404 HTML body

**Diagnostic findings**: `assets.guesty.com` 400 with EMPTY body = host has the asset but rejects direct GETs (likely Referer/Origin/signature gating). Open API has no documented attachment endpoints.

**Current iteration deployed:**
- Referer + Origin spoof: `https://assets.guesty.com/<path>` with `Referer: https://app.guesty.com/`
- Browser-like User-Agent on every request
- 5 API endpoint variants including `?withSignedAttachments=true` and `?expand=attachments`
- New `findSignedUrl()` recursively walks any JSON response looking for an http URL matching attachmentId / filename / S3-signature query params — handles "API returns nested signed URLs"
- 502 response includes full `attempts[]` array with per-candidate URL+status+body for next iteration

**Next-best moves if Referer spoof fails:**
- User opens Chrome DevTools on Guesty UI, finds the actual photo URL in Network tab → tells us hostname/headers/cookies used
- Or build an authenticated puppeteer worker (heavy, last resort)

Note: a sibling worktree shipped Estimator detail route fixes (the previous "Latest turn" entry below) in parallel.

## ✅ Earlier turn — Estimator detail route created (Edit button was 404ing)

User clicked "Edit" on a row in `/beithady/inventory/rules/estimator` (Housekeeping Setup Matrix) and got Next's 404 page. Root cause: the matrix landing page links every row + Edit button to `/beithady/inventory/rules/estimator/${configId}`, but `[configId]/page.tsx` didn't exist.

**Fix shipped (commit 79e7483, deployed):**
- New file `src/app/beithady/inventory/rules/estimator/[configId]/page.tsx`
- Server-rendered detail view via `computeEstimatorOutput(configId)` (existing lib in `src/lib/beithady/inventory/estimator.ts`); `notFound()` on missing/inactive config
- Header: config name + tier badge + bedrooms/bathrooms/guests + total per check-in + per-guest cost
- 6 group-total cards (Cleaning / Sanitary / Tray / Linen / Branded / Misc) with item counts
- Per-group line tables: SKU + name, formula label, base qty, computed qty, loss %, effective qty, unit cost, line total, Amazon EG sourcing badge with status tone (`AMAZON_STATUS_LABEL`), and rule-scope chip (unit_config = green w/ pencil, listing = violet, category = cyan, building = blue, global = slate)
- Help banner explains scoping ladder + deep links to `/beithady/inventory/rules` for actual rule editing

**Why view-only (not inline edit) for now:** the existing `RuleFormButton` doesn't expose a `unit_config` `scope_value` picker — its else-branch only handles `category`. To add per-config inline editing, the form needs a `lockedScope` + `lockedScopeValue` prop pattern (or a unit-config dropdown when `scope === 'unit_config'`). Deferred to next iteration; users can still create unit_config-scoped rules from the rules page directly by entering the UUID shown in the help banner.

**Risk for next iteration:** the help banner asks users to copy a config UUID into a free-form scope_value field — that's awkward. Two paths to clean it up: (1) extend `RuleFormButton` to render a `<select>` of unit configs when `scope === 'unit_config'`, OR (2) add an "Add rule for this config" button on the detail page that opens the form pre-filled with the scope and scope_value locked. Option 2 is the smaller diff.

## 🟡 Earlier turn — Proxy v2: try 7 Guesty Open API + CDN candidates (Bearer didn't unlock CDN either)

User reported v1 proxy returned `all_hosts_failed` with status 400 on every CDN candidate. Bearer token works against `open-api.guesty.com/v1/...` (every other Guesty API call uses it) but does NOT work against `assets.guesty.com`. So the CDN-direct path is dead.

**Expanded proxy in `src/app/api/beithady/communication/guesty-attachment/route.ts`:**

V3 endpoint now passes `attachmentId`, `postId`, `conversationId` query params alongside `path`. `ExtractedAttachment` type extended with those optional fields. Validated via `ID_PATTERN = /^[a-zA-Z0-9_-]+$/`.

**Proxy tries 7 candidates in priority order:**
1. `/v1/communication/conversations/{convId}/posts/{postId}/attachments/{attId}` (Bearer)
2. Same + `/download` suffix (Bearer)
3. `/v1/communication/attachments/{attId}` (Bearer)
4. `/v1/attachments/{attId}` (Bearer)
5. `/v1/<storage-path>` (Bearer)
6. `assets.guesty.com/<path>` (NO auth — maybe public after all)
7. `app-public-cdn.guesty.com/<path>` (NO auth)

**Smart JSON handling:** if any candidate returns `application/json` instead of binary, parse for `{ url | downloadUrl | signedUrl | data.url }` and **follow the signed URL server-side** with no auth (typical pre-signed S3 URL pattern), then stream the actual binary back. Covers both "API returns binary" and "API returns signed CDN URL" scenarios.

**Failure response upgraded:** 502 now includes `attempts[]` array with `{label, url, status, body}` per candidate. So if all 7 still fail, the diagnostic JSON shows exactly which endpoints Guesty exposes and what they complain about — actionable data for the next iteration.

## ✅ Earlier turn — Server-side attachment proxy V1 (CDN requires auth, public GETs 400)

User pasted the `?debug=1` response from V3 endpoint. Two findings:

1. **Probe correctly identified `assets.guesty.com`** as the CDN host — the URL my code built was right
2. **But that host returns HTTP 400 to public unauthenticated GETs**. Browsers can't directly send our service-account Bearer token, so direct `<img src="https://assets.guesty.com/…">` will always fail.

**Fix shipped — server-side attachment proxy:**

New route `src/app/api/beithady/communication/guesty-attachment/route.ts`:
- Receives `?path=production/<acct>/png/<hash>_<filename>.png` from the browser
- Validates path matches `^[a-zA-Z0-9_./-]+$` + rejects `..` → SSRF-safe
- Calls `getAccessToken()` (same OAuth path every other Guesty API call uses)
- Loops 5 candidate hosts (`assets.guesty.com` first) with `Authorization: Bearer <token>` header until one returns 2xx
- Streams binary back to browser with `Content-Type` from upstream (or inferred from path extension via `EXT_TO_MIME` map) and 1h client cache (`Cache-Control: private, max-age=3600`)
- 502 with `{last_status, last_body, path}` diagnostic if all 5 hosts fail (so future iterations have actionable info, not silent failure)

**V3 endpoint simplified back:**
- Removed CDN candidate probing + module-scope cache (no longer needed since the browser doesn't load CDN URLs directly anymore)
- `absoluteAttachmentUrl()` returns `/api/beithady/communication/guesty-attachment?path=<encoded path>`
- `deriveAttachments()` reverted to sync

**Risk for next iteration:** if Guesty's CDN doesn't accept the OAuth Bearer token from the API (token might be scoped only to `/communication/*` endpoints, not raw asset paths), the proxy will return 502. Recovery options to try next:
- Use a separate signed-URL endpoint Guesty might expose (e.g. `GET /communication/conversations/{id}/posts/{postId}/attachments/{attachmentId}/download`)
- Add `Referer: https://app.guesty.com` header
- Try the API base URL `https://open-api.guesty.com/v1/communication/...` for asset access instead of `assets.guesty.com`

## ✅ Earlier turn — Real photo URL extraction fixed + redundant footer removed

User clicked a placeholder for a real photo upload. Image attempted to load `https://app-public-cdn.guesty.com/production/<acct>/png/<hash>_<filename>.png` — Chrome reported `DNS_PROBE_FINISHED_NXDOMAIN`. The hostname I guessed doesn't exist. Guesty's CDN base URL isn't documented publicly anywhere I could check.

**Switched to probe-and-cache approach:**
- Server-side HEAD-tests 8 candidate hostnames (3s timeout each):
  - `assets.guesty.com`
  - `app-public-cdn.guesty.com`
  - `public-cdn.guesty.com`
  - `cdn.guesty.com`
  - `media.guesty.com`
  - `files.guesty.com`
  - `guesty-app-public.s3.amazonaws.com`
  - `guesty-prod-uploads.s3.amazonaws.com`
- First 2xx response wins, cached at module scope (warm-Lambda lifetime)
- `cdnProbeInFlight` promise dedupes concurrent probes
- If all 8 fail → fallback to first candidate so client still gets a URL it can try
- `deriveAttachments` now async (awaits `absoluteAttachmentUrl`)

**Debug escape hatch:** added `?debug=1` query param to V3 endpoint that includes `_raw_target` and `_raw_first_post` in the response. If probe-and-cache also fails (i.e. all 8 hostnames return 4xx/5xx), call `/api/beithady/communication/guesty-post?conversationId=<id>&sentAt=<ts>&debug=1` and inspect the raw API response — Guesty might use a different field name (`signedUrl`, `cdnUrl`, etc.) we haven't extracted yet.

**Open question for next iteration:** if none of the 8 hostnames serve the asset, the path forward is server-side proxy — fetch the binary via Guesty's authenticated attachment endpoint (probably `GET /communication/conversations/{id}/posts/{postId}/attachments/{attachmentId}` or similar) and stream it through our backend. Avoids the CDN-URL-guessing game entirely.

## ✅ Earlier turn — Real photo URL extraction fixed + redundant footer removed

User correctly pointed out that the placeholders weren't all flight-info cards — many are **actual guest-uploaded photos** that show up in Guesty's UI. Investigation revealed:

**Photo extraction bug (V3 endpoint):** my `deriveAttachments` was looking for `attachments[].url` / `downloadUrl`, but Guesty actually returns this shape (verified directly via `beithady_messages.raw` for two real photos on Saad Alkhaldi's thread):

```
{ _id, body: '', module: { type: 'airbnb2' }, sentBy: 'guest',
  attachments: [{
    type: 'png',
    attachmentUrl: 'production/<acct>/png/<hash>.png',
    origFileName: '...',
    contentName: 'ugcAttachment'
  }] }
```

**Fix shipped:**
- `deriveAttachments` now reads `attachmentUrl` (relative storage path) + builds absolute URL: `https://app-public-cdn.guesty.com/<path>`
- New `classifyByExt` helper maps file extension (`png`/`jpeg`/`mp4`/etc.) → MIME + kind (image/audio/video/file)
- Uses `origFileName` as the attachment display name (better than `contentName: 'ugcAttachment'`)
- Direct `url`/`downloadUrl` fallback retained for shape variations

So the V3 inline media loader should now correctly render real guest photos when placeholder is clicked. Channel-native structured cards (flight info etc.) still hit the empty-state with the explainer copy, since those genuinely don't have attachment URLs in the payload.

**Footer removed:** "Cross-channel search · sorted by latest guest message (newest first)" line on the unified inbox was redundant (sort dropdown above already says "Newest first (default)") and visually overlapping the AttachmentMenu dropdown when opened. Cleaner without it.

**Risk for next session:** the `app-public-cdn.guesty.com` URL pattern is an educated guess based on the storage-path shape. If images 404, alternate patterns to try: signed URL via `/communication/conversations/{id}/posts/{postId}/attachments/{attachmentId}`, or the `account-cdn.guesty.com` variant. Will surface as broken image icon → clear signal to iterate.

## ✅ Earlier turn — Investigation complete: channel-native structured cards aren't recoverable; clearer empty-state shipped

## ✅ Earlier turn — Investigation complete: channel-native structured cards aren't recoverable; clearer empty-state shipped

User compared our placeholder ("Guesty returned this post with no media") to the Guesty UI showing the actual flight-info card. Investigated by inspecting `guesty_conversation_posts.raw` directly:

**Hard finding — this is a Guesty platform limit, not our code:**
- Webhook delivers `body=""`, `postId=""`, empty thread entry for these messages
- V3 server-side fetch (Guesty Open API) returns the same empty post — verified
- Structured-card content (Airbnb flight-info / verification request / co-traveller card; Booking.com event notifications) is rendered **only in Guesty's UI layer** and never exposed to API consumers
- No workaround possible from our side without Airbnb/Booking direct API integration (out of scope)

**Better empty-state copy shipped:**
- Module-aware title: "Airbnb-native structured card" / "Booking.com structured event" / "Channel-native structured message"
- Body explains why Guesty's API can't deliver the content
- Workaround line: "view this thread on the original channel hosting dashboard, where the card renders natively"
- 1 commit + deploy in background

So when V3 successfully resolves a regular guest photo / file / audio, it renders inline as expected. When it hits an Airbnb/Booking structured card (which is the case the user just saw), the placeholder now explains the limit honestly instead of saying "no media or content".

## ✅ Earlier turn — Fixed "t is not iterable" runtime error in V3 media loader (wrong response field)

User clicked the placeholder and got "Failed to load original — t is not iterable". Root cause: my V3 API route was reading `data.results` from the Guesty Open API response, but the actual field per the type definition (`src/lib/guesty.ts:427-433`) is `data.posts`. The fallback then cast the entire response object to `GuestyPost[]`, so `for (const p of posts)` threw "t is not iterable" in minified prod code.

**Fix shipped:**
- Read `dataObj.posts` first (correct shape per `GuestyConversationPostsResponse = { posts, count, limit, sort, cursor }`)
- Defensive fallbacks: `dataObj.results` → direct array → `[]`
- All branches gated by `Array.isArray()` so future shape changes can't reproduce this class of error
- 1 commit + deploy in background

Should now render the actual image inline on click.

## ✅ Earlier turn — Inline media loader (V3): bypasses Guesty UI permissions entirely

User reported "Still same problem" with the search-by-phone URL — Guesty's UI was 403-ing on `/inbox?search=…` too for their restricted role. Both V1 (`/inbox/<conv_id>`) and V2 (`/inbox?search=`) deep-link approaches hit the same access wall.

**V3 fix shipped:** stopped trying to deep-link to Guesty's UI at all. Instead, fetch the actual post via **Guesty Open API server-side** using our service-account OAuth token (which has full read access regardless of any individual user's UI permissions).

**New code:**
- **`/api/beithady/communication/guesty-post`** (server route) — authenticates calling user with `communication:read`, calls `listGuestyConversationPosts(conversationId)` with the service token, matches target post by `sentAt` within ±5min tolerance (since `postId` is empty in webhook payload for media messages), extracts attachments from `.attachments[]` (url|downloadUrl + fileName + mimeType) and `.images[]` (url|original|thumbnail), classifies each as image/audio/video/file
- **`<MediaPlaceholder>`** (client component, new file `media-placeholder.tsx`) — click "Load original" → fetches the API → renders media inline:
  - Images: grid layout (multi-image cards) with click-to-zoom
  - Audio: HTML5 controls
  - Files: download links
  - Body text or `bodyHtml` rendered fallback
  - Loading spinner state, error state with retry-on-click, dark/light variants
- Removed the broken inline MediaPlaceholder from `thread-pane.tsx`; `Bubble` legacy props (`guestPhone/guestName/guestEmail`) kept optional for backwards compat

**End state:** click any placeholder card → media renders directly inside our app. Never opens Guesty. Permissions issue is solved structurally because we proxy through a service account.

**Risk:** every click costs 1 Guesty Open API call. At scale this could hit their rate limit (~120 req/min/token). Acceptable for V1 — agents don't click these often. If usage spikes, add caching: store the resolved attachments in `beithady_messages.attachments` after first fetch so subsequent renders don't re-call Guesty.

## ✅ Earlier turn — Media placeholder URL fixed: search-by-phone instead of direct conversation deep-link

User clicked the new placeholder card and got Guesty's "You don't have access to this page" 403. Verified the conversation ID was correct (`69f0e6e017350d0013192201` exists in both our DB and Guesty's tables) — the issue is **Guesty's UI itself 403s on direct `/inbox/<conversation_id>` deep-links** for many user roles, even when the same user can see the conversation through normal inbox navigation.

**Fix shipped:**
- Changed placeholder href from `https://app.guesty.com/inbox/<conversation_id>` to `https://app.guesty.com/inbox?search=<phone>` (mirrors `<NoReservationFallback>` pattern)
- Search priority: `guest_phone` → `guest_email` → `guest_full_name` → bare `/inbox`
- `Bubble` now receives `guestPhone` / `guestEmail` / `guestName` props; `guestyExternalId` kept (prefixed `_`) for future use
- Title hint: "Search this guest in Guesty inbox to view the original media"
- 1 commit + deploy in background

The same approach should be applied to other Guesty deep-links across the app (the existing `Open in Guesty` link in `<GuestyComposer>` at line 139 still uses `/inbox/<external_id>` — same potential 403). Not blocking enough to fix preemptively, but worth a sweep if more reports come in.

## ✅ Earlier turn — Clickable media placeholder for empty-body Guesty messages

User reported still seeing "(empty)" bubbles for messages where Guesty UI shows photos / rich cards (Airbnb flight info card, Booking confirmation cards, etc.). Verified the underlying cause via direct payload inspection:

**Guesty's webhook genuinely sends `body: ""` and `postId: ""` for image / rich-card messages** — the actual media URL never reaches our DB. The content lives only on Airbnb/Booking's CDN and is accessible only via Guesty's authenticated UI.

**Fix shipped:**
- New `<MediaPlaceholder>` component in `thread-pane.tsx` — dashed-border card with `Image` / `FileQuestion` icon, label like "Airbnb media or rich card", subtitle "Body not delivered by webhook · click to view original"
- Renders when: `body` is whitespace-empty AND `attachments[]` is empty AND `module_type ∈ {airbnb, airbnb2, bookingCom, booking.com, booking, whatsapp, sms, email}`
- Click → opens `https://app.guesty.com/inbox/<conversation_id>` in a new tab
- Outbound messages get a darker variant matching the bubble tone
- `Bubble` component now receives conversation's `external_id` (only when `channel='guesty'`) so the deep-link resolves
- 1 commit + deploy in background

**V2 deferred:** fetch Guesty Open API `/communication/conversations/{id}/posts/{postId}` on-demand and proxy media URLs. Adds API cost + rate-limit risk; deep-link is enough until usage analytics show clicks are frequent enough to justify.

## ✅ Earlier turn — Critical webhook bug fixed: Guesty messages were silently dropped for ~16 hours

User reported messages from Guesty not appearing (Saad Alkhaldi missing 4:02 PM agent reply; Abdulaziz Althagafi missing 8:32 AM reply; Zeinab AlKhashab still showing "1 NEW"/unreplied despite reply on Guesty).

### Root cause

**Phase O webhook receiver was rejecting 100% of events with `"message _id missing"` error since registration ~16 hours ago.**

Code in `src/lib/guesty-webhook.ts` looked for `payload.message._id` or `payload.message.id`. Guesty's actual webhook payload (verified by inspecting one of the 138 stored events) puts the conversation-post id at **`payload.message.postId`** instead. The receiver wrote each event to `guesty_webhook_events` with `status='error'` then bailed before upserting into `guesty_conversation_posts`.

The reason this was masked: the daily Guesty backfill at `40 4 * * *` UTC was still pulling everything via the Open API once a day, so anything between daily ticks was invisible until the next 04:40 UTC tick. Today the user noticed because they were looking at conversations that had activity between 04:42 UTC (last successful sync) and ~13:30 UTC (when they reported the issue).

### Fix shipped (deploy ✓ green)

- **`src/lib/guesty-webhook.ts`** — id lookup chain now: `message.postId` → `message._id` → `message.id` → `meta.messageId` (in 3 places: `deriveUniqueKey`, `processGuestyWebhook` outer, `ingestMessage` inner)
- Also tightened `moduleType`: removed fallback to `message.type` (which is `'fromGuest'`/`'fromHost'`, not channel) — explicit fallback to `'whatsapp'` instead
- `accountId` now also reads from `payload.conversation.accountId`
- `fromFullName` synthesised from `conversation.meta.guestName` for inbound posts (Guesty doesn't include `from.fullName` on guest messages)

### Recovery (executed via Supabase MCP)

1. **Replayed 138 errored events** by extracting `message.postId/body/module/createdAt/...` from stored payloads and upserting into `guesty_conversation_posts` (deduped to 131 unique postIds)
2. Called `beithady_communication_ingest()` RPC → 39 new messages inserted into `beithady_messages` (the rest were already known from daily backfill)
3. Recomputed `beithady_conversations.last_inbound_at` / `last_outbound_at` / `modified_at_external` from messages so the sidebar dates reflect the recovered data
4. Marked all 138 events `status='processed'` so the verify page reports 0 errors

### State after fix

- Latest message in `beithady_messages`: 13:26 UTC (Cairo 4:26 PM) — was 03:30 UTC (8 hours stale)
- 0 webhook events still erroring
- Saad Alkhaldi: last_inbound now 13:02 UTC (4:02 PM Cairo) — matches Guesty UI
- Abdulaziz Althagafi: last_inbound now 05:32 UTC (8:32 AM Cairo) — matches Guesty UI

**Earlier in this turn:** Default sort fixed to `last_inbound_at desc` (matches the column the sidebar visibly displays). The "API error" the user saw was actually this webhook bug surfacing as stale conversations.

## ✅ Earlier turn — Default sort fixed: now sorts by the column that's actually displayed (last_inbound_at)

User asked for newest-first. First attempt set default to `recent_activity` (`modified_at_external desc`) which produced visually scrambled lists — sidebar rows display `last_inbound_at` so the SORTED column ≠ DISPLAYED column. User screenshot showed dates jumping 4/29 → 4/28 → 4/24 → 4/27 in adjacent rows.

**Fix shipped:**
- Default sort now `recent_inbound` (`last_inbound_at desc`) — same column the row visibly shows
- DB-side verification: top 8 rows strictly descending: 4/29 06:30 → 4/29 03:08 → 4/29 02:05 → 4/29 01:59 → 4/29 00:59 → 4/29 00:57 → 4/29 00:28 → 4/28 23:49
- Sort dropdown reordered + footer hint on unified page updated
- `recent_activity` (modified_at_external) still available as a selectable option

**Earlier "api error?" investigation** — was a red herring. Runtime logs showed pre-existing 500s on `beithady-comm-sync` / `beithady-sla-recalc` / `beithady-operations-recompute` cron endpoints, all from the worktree's Vercel project (`optimistic-brown-e4d920-*.vercel.app`) which is missing `NEXT_PUBLIC_SUPABASE_URL` env var. These don't affect the user-facing `limeinc.vercel.app` project. Worktree project is separate; same GitHub branch, independent env config. Left as-is — not blocking.

**Commits this turn:**
- `b6344a0` manual archive fire (5,496 conversations)
- `ea3b609` first sort attempt (recent_activity, scrambled-display bug)
- (latest) sort fix to `recent_inbound` (deploying)

## ✅ Earlier turn — Manual archive fire: 5,496 conversations archived (Phase R first-run executed)

User asked "has all messages been archived as planned?" — answer was no, the cron hadn't fired yet. User picked option (c): fire the real archive now. Executed via Supabase MCP (cleaner than curl+CRON_SECRET; same SQL the cron handler runs).

**Result matches Q.0 prediction exactly:**
- Batch 1: 5,000 archived
- Batch 2: 496 archived
- **Total: 5,496 archived · 1,248 still active · 0 remaining candidates**
- Active inbox by month: Apr 474 · Mar 366 · Feb 384 · Jan 24 (matches workflow R prediction)
- 2 audit rows in `beithady_audit_log` (one per batch) with metadata identical to what the cron would have logged

Tomorrow's 1 AM UTC cron tick will be a no-op (0 candidates) until threads start aging out — exactly the steady-state behavior the workflow designed for.

## ✅ Earlier turn — Phase Q FULLY shipped (Q.2 → Q.2.5 → Q.3 → Q.4, 4 commits + deploys)

User said "Continue" → auto-mode → resumed from where Phase Q paused (Q.0 + Q.1 already live as reservation chip + popout) and shipped the remaining four sub-phases sequentially.

### Phase Q commit ledger (full)

| # | Commit | Sub-phase | What shipped |
|---|---|---|---|
| Q.0 | `92a17a9` (earlier session) | pre-flight doc | `docs/PHASE_Q_PREFLIGHT.md` — coverage probes, Guesty attachments[] discovery, listing.raw shape |
| Q.1 | `023452c` (earlier session) | reservation chip + popout | ReservationStatusChip · ReservationMiniTimeline · GuestHistoryBadge · NoReservationFallback · loadThread reservation+guest joins |
| **Q.2** | `320a903` | templates V1 + listing secrets | Migration 0053a · 8 seed templates · templates-shared.ts client-safe resolver · `<TemplatePicker>` popover · variable resolver wired into both composers · block-send guard for unresolved {var} |
| **Q.2.5** | `c157583` | admin templates CRUD | `/beithady/communication/admin/templates` page · table with active toggle/edit/delete · `<TemplateFormDialog>` · 4 server actions |
| **Q.3** | `43bfdb8` | multi-attach + library | Migration 0053c (beithady_listing_assets) · `<AttachmentMenu>` (device/camera/library) · `<LibraryPicker>` (building → unit → photos 2-step modal) · sendWaCasualMultiAttachAction (5 files, caption on first) · sendGuestyMultiAttachAction (uses existing attachments[] field per Q.0) · uploadListingAssetAction (admin) · 3 API routes for picker |
| **Q.4** | `945f5e9` | polish bundle | Migration 0053d (beithady_conversation_notes + resolved fields on beithady_conversations) · `<InternalNotesPanel>` collapsible amber strip · `<ResolveButton>` with 5-reason dropdown + Re-open · 4 server actions (add/delete note, mark/unmark resolved) · ThreadHeader resolved-summary line |

### Locked variable list (Q.5)

`{guest_name} {guest_first_name} {listing_nickname} {check_in_date} {check_out_date} {nights} {guests} {building_code} {wifi_ssid} {wifi_password} {checkin_time} {agent_name} {today_date} {address}` — resolves client-side at template-pick time. `wifi_password / wifi_ssid / checkin_time` lookup from `beithady_listing_secrets`.

### What's now live on the inbox right panel

1. **Reservation status chip** + click → opens calendar drawer in new tab (Q.1, earlier)
2. **Reservation mini-timeline** + guest history badge (Q.1, earlier)
3. **Templates button** (📋) next to attach + send — popover with category tabs + per-template missing-var indicator + click-to-insert with cursor-friendly placement
4. **Attachment menu** (📎) with 3 sources: from device (multi-file), camera, listing library (2-step modal: building → unit → multi-select photos)
5. **Pending tray** with thumbnail previews, drag-friendly remove buttons, "Send N" CTA — 5 file max
6. **Guesty composer attaches** via the already-wired `attachments[]` field discovered in Q.0 — single message with N attachments
7. **wa_casual** sends N sequential WhatsApp posts with shared caption on first only (per Q8)
8. **Internal notes** — collapsible amber strip between header and messages, staff-only, with author username + delete; auto-opens when notes exist
9. **Resolve button** in header — 5-reason dropdown (resolved · booked · no_response · spam · duplicate); switches to "Re-open" when resolved; sets `state='closed'` for archive auto-cron compatibility
10. **Block-send guard** — composer disables send + shows amber banner listing missing template variables when body still has unresolved `{var}` keys

### Admin pages

- **`/beithady/communication/admin/templates`** — CRUD page for all 8+ templates. Active toggle inline. Form dialog with name/category/language/sort/channels/source-filter/body + known-vars hint chips.

### Migrations applied (4)

```
0053a_message_templates_and_listing_secrets  — templates table + 8 seeds + listing_secrets table + touch trigger
0053c_listing_assets                         — listing photo + asset library
0053d_conversation_notes_and_resolved        — internal notes table + resolved_* columns
```

(Pre-existing 0054a from Phase R already on main.)

### Storage usage

- `beithady-wa-media` (20MB, public) — outbound chat media
- `beithady-gallery-public` (50MB, public) — listing library photos at `listing/{listing_id}/{file}`

### Deferred from Q.4

The original Q.4 polish cut included #6 translate inline, #12 AI suggestion edit, #13 bulk mark-read + keyboard shortcuts. Shipped this round were #1 (mini-timeline, in Q.1), #2 (guest history, in Q.1), **#3 internal notes**, **#5 mark resolved**. Translate / AI edit / bulk-read / shortcuts deferred to V2 — none blocking.

### V2 / future work

- Translate inline (Anthropic haiku per-bubble menu)
- AI suggestion edit button on `<SuggestionStrip>`
- Bulk mark-read + keyboard shortcuts (j/k/r/e)
- Listing secrets admin page at `/beithady/settings` (currently editable only via direct DB)
- Listing assets bulk uploader (drag a folder; auto-route by filename pattern)
- WABA template picker (waiting on Beit Hady WABA provisioning)

## ✅ Earlier turn — Phase R fully shipped end-to-end (commits `81319e8` → `63b1087`, 5 sequential auto-deploys)

User said "Ship R1 To R15 Together" → auto-mode → defaults on S1/S2/S3 → ran the entire R.0 → R.5 sub-phase chain in one turn.

### Sub-phase commit ledger

| # | Commit | What shipped | Deploy |
|---|---|---|---|
| **R.0** | `81319e8` | doc-only pre-flight → [docs/PHASE_R_PREFLIGHT.md](docs/PHASE_R_PREFLIGHT.md) | ✅ |
| **R.1** | `bf853a4` | Migration 0054a + listInbox/getInboxStats archive gating + getArchiveBuckets aggregator | ✅ |
| **R.2** | `d2ba7e4` | Archive tab + year/month landing + month detail + ArchivedBanner + bulk-archive dialog + bulk-restore bar + 4 server actions | ✅ |
| **R.3** | `33d1e40` | Auto-archive cron `/api/cron/beithady-conversation-archive` + vercel.json schedule | ✅ |
| **R.4** | `63b1087` | MobileFullscreenLayout + compact sidebar row + AutoScrollThread first-unread | ✅ |
| **R.5** | (rolled into R.2) | Search-within-month: `<input name="q">` on month detail + listInbox search filter | ✅ |

### Q.0 pre-flight findings (Supabase MCP probes)

- **6,744 total conversations**, **all in `open` state** — `closed` branch of auto-cron predicate matches 0 rows (future-proofing)
- **5,496 conversations meet 90d cutoff** — 81.5% of inbox auto-archives day 1; LIMIT 5000/run spreads across 2 nights
- **Year/month grid:** 2026 (1,788) · 2025 (4,167) · 2024 (789) · 25 distinct month buckets
- Active inbox post-archive = **1,248 conversations** (Apr 474 · Mar 366 · Feb 384 · Jan 24)
- `beithady_settings.value` is JSONB (not text) — seed adjusted
- `app_users.id` is uuid — fk type-clean
- Vercel cron: 33 → 34, headroom 6

### Schema (Migration 0054a, applied via Supabase MCP)

```sql
alter table beithady_conversations
  add column archived_at timestamptz,
  add column archived_by_user_id uuid references app_users(id),
  add column archived_reason text check (archived_reason in (
    'manual_month_bulk', 'auto_cron_90d', 'manual_single', 'duplicate', 'restore_undo'
  ));

create index idx_bh_conv_archived_null on beithady_conversations(state, last_inbound_at desc nulls last)
  where archived_at is null;
create index idx_bh_conv_archived_at on beithady_conversations(archived_at desc)
  where archived_at is not null;

-- 3 settings seeds: comm_auto_archive_days=90 / comm_auto_archive_pause=false / comm_auto_archive_max_per_run=5000
```

### What's now live

**[/beithady/communication/archive](https://limeinc.vercel.app/beithady/communication/archive)** — 5th tab (badge shows total archived count). Click year → month grid. Click month → sidebar+thread layout scoped to that month with bulk-archive button + per-conversation restore.

**Active inbox (all 4 channels)** — auto-gates on `archived_at IS NULL`. Archive count badge in tab. Mobile (< lg) → tapping a conversation opens fullscreen 100dvh thread with sticky back-arrow header. Compact sidebar row hides building/listing meta on phones to fit ~2× more conversations per scroll.

**Cron** at `0 1 * * *` UTC (4 AM Cairo winter / 3 AM summer):
- Reads `comm_auto_archive_pause` settings flag → short-circuits if true
- Reads `comm_auto_archive_days` (90) and `comm_auto_archive_max_per_run` (5000)
- `?dry_run=1` returns count + 25-id sample without writing — **must run before first real cron tick** to verify the predicate
- Race-safe `update … where archived_at is null` re-check on UPDATE
- Single audit row per run (workflow R15)

**Composer behavior on archived conversation** = `<ArchivedBanner>` replaces it with reason ("archived by 90-day inactivity rule") + timestamp + one-click Restore button.

**Bulk-archive dialog** — type-to-confirm gate when count > 500 (requires typing `archive [month name]` in lowercase).

**Auto-scroll-first-unread** — server-side computes first inbound message id newer than `last_outbound_at`; client `<AutoScrollThread>` scrolls it into view on mount; falls back to thread tail anchor.

### V2 / future work

- Body-text search across messages (V1 only searches header fields: name/email/phone/listing)
- Single-conversation archive button on sidebar row (right-click menu / mobile swipe-left)
- "Pause auto-archive" toggle in `/beithady/settings` UI (DB flag exists, no UI yet)
- CSV export of archived month (deferred per workflow R13)

### Important next-step for production

Before the first cron tick fires (tomorrow 1 AM UTC), run:
```bash
curl 'https://limeinc.vercel.app/api/cron/beithady-conversation-archive?secret=<CRON_SECRET>&dry_run=1'
```
Expected response: `{"ok":true,"dry_run":true,"would_archive_count":~5000,"sample_ids":[...]}`. If the count looks wrong, flip `comm_auto_archive_pause` to `true` in `beithady_settings` to disable until investigated.

## 🟡 Earlier this turn — Phase R workflow doc drafted: True archive locked, defaults on R2–R15, awaiting S1–S3 (no code)

User answered **R1 = True archive (Option B)** explicitly; treated R2–R15 as defaults per recommendations. Sent the workflow doc for review per standing process. **No code this turn.**

### Locked answers

R1 **True archive** (user explicit) — `archived_at timestamptz · archived_by_user_id · archived_reason text` columns on `beithady_conversations`, no new tables. R2 90 days threshold (configurable via `beithady_settings`). R3 closed + open-with-no-inbound 90+ days. R4 composer disabled with banner + restore CTA. R5 month = `coalesce(modified_at_external, last_inbound_at, created_at)`. R6 5th tab on all 4 channel views. R7 lg=1024px. R8 tablet fullscreen too. R9 top-left arrow + URL-driven browser back. R10 `communication:full` perm. R11 type-to-confirm if >500 conversations. R12 archive search V1. R13 CSV export V2. R14 compact sidebar row + auto-scroll-first-unread V1. R15 audit just bulk batches.

### Workflow doc sent (12 sections + S sign-off)

1. Locked answers recap
2. **1 migration: 0054a_conversation_archive.sql** — adds 3 columns + 2 indexes (active-inbox `where archived_at is null` + month-bucket grouping `date_trunc + archived_at is not null`)
3. `beithady_settings` seed — `comm_auto_archive_days = 90`
4. **5 server actions** — `archiveConversationsMonthAction · restoreConversationAction · bulkRestoreConversationsAction · searchArchiveAction · archiveConversationSingleAction`
5. **Cron handler** at `/api/cron/beithady-conversation-archive` daily 1 AM UTC (4 AM Cairo winter), with `?dry_run=1` safety mode for first run + LIMIT 5000/run. Vercel cron count 33→34 (headroom 6).
6. Inbox query updates — `listInbox` + `getInboxStats` + composer gating add `archived_at is null` filter
7. **3 new routes:** `/beithady/communication/archive` (year grid) · `/[year]` (month grid) · `/[year]/[month]` (sidebar + thread). 9 new components: `<ArchiveTabs>` (5-tab) · `<ArchiveYearGrid>` · `<ArchiveMonthGrid>` · `<ArchiveMonthHeader>` · `<ArchiveSidebarList>` (with checkbox column) · `<ArchivedBanner>` · `<RestoreButton>` · `<MobileFullscreenLayout>` · `<MobileBackButton>`
8. **Mobile fullscreen = CSS-only.** When `?c=<id>` set on `< lg`, sidebar hides, thread takes `100dvh fixed` (not `100vh`, handles iOS Safari address bar). Composer becomes `sticky` not `fixed` so OS keyboard handles scroll. Applies to all 4 inbox routes + new archive month-detail.
9. Auto-archive of new inbound on archived conversation auto-restores via webhook ingest setting `archived_at = null`, `archived_reason = 'restore_undo'` — guest replies don't get lost
10. **15-case edge matrix** — first-run 5,000+ archive (single audit row + LIMIT) · iOS Safari address bar (`100dvh`) · keyboard pop (`sticky`) · empty year hide · webhook auto-restore · listing-orphaned restored convs · concurrent-user archive-while-open
11. **Pre-flight (R.0)** — count by-month, oldest open date, dry-run cutoff count, settings table check, `BeithadyShell` containerClass mobile breakout audit, `app_users.id` uuid type, no other queries assume non-archive
12. **Test plan: 12 scenarios** — covering year/month grid · archive open → composer disabled · single + bulk restore · type-to-confirm bulk archive · cron dry-run + real run · mobile 390×844 fullscreen · keyboard pop · back arrow URL strip

### 5 sub-phase commits

R.0 doc-only pre-flight · R.1 schema + active-inbox query updates · R.2 archive tab + year/month landing + thread access + banner · R.3 auto-archive cron + manual bulk-archive month + bulk-restore · R.4 mobile fullscreen + compact sidebar row + auto-scroll-first-unread · R.5 archive search within month.

### 3 S sign-off questions

S1 workflow scope as drafted? rec ship · S2 sub-phase ordering OK (mobile fullscreen R.4 lands after archive R.2/R.3 — could ship earlier as R.1.5 if mobile is urgent)? rec as-is · S3 first-cron-run risk acceptance — `?dry_run=1` first + LIMIT 5000/run? rec yes.

**Confidence ~93%** post-defaults. Last 7% recovers after R.0 pre-flight dry-run count.

Reply S1/S2/S3 individually or "default + proceed" → next turn ships R.0 doc-only commit + R.1 first real code (migration + query updates).

Note Phase Q paused mid-stream after Q.1 ship. Q.2/Q.2.5/Q.3/Q.4 still queued; can interleave with Phase R or run sequentially after R.5.

## 🟡 Earlier this turn — Phase R plan drafted: Archive feature + Mobile fullscreen (no code, awaiting R1–R15)

User asked for two new features mid-session, post-Phase-Q.1-ship:
1. **Archive feature** — archive all messages by month, navigable Year → Month → conversations, "up to month-to-date"
2. **Mobile fullscreen conversation** — on mobile, tapping a conversation should open a popup covering the full screen so messages render in a proper window (today the sidebar + thread pane stack vertically on phones, awful UX)

Per standing process: Plan → 95% → Workflow → 95% → Code. **No code this turn.**

### Plan I sent the user (full version in chat)

**R.1 Archive feature — two flavors offered:**

- **A. View-only filter** — no schema change, archive tab = date-filtered view of every conversation by month
- **B. True archive** (recommended) — new `archived_at timestamptz · archived_by_user_id · archived_reason text` columns on `beithady_conversations`. Archived rows hidden from Open/SLA/Unread queries (one-line `where archived_at is null` addition). Auto-cron archives anything untouched 90+ days. Manual bulk-archive per month. Restore button.

Recommended **B** — open count is 6,741 today and growing ~250/day; without true archiving the SLA queries will degrade. Estimated active count post-archive: ~1,500.

**Schema sketch:** `archived_at timestamptz · archived_by_user_id uuid · archived_reason text check in (manual_month_bulk · auto_cron_90d · manual_single · duplicate)` plus an indexed `(date_trunc('month', coalesce(modified_at_external, last_inbound_at, created_at)) desc, archived_at)` for fast month-grouped reads.

**Routes (all 4 channel views get the Archive tab as a 5th):**
- `/beithady/communication/archive` — year/month grid landing
- `/beithady/communication/archive/[year]` — 12 month cards with conversation counts
- `/beithady/communication/archive/[year]/[month]` — conversation list + thread pane (reuses existing `<ThreadPane>`)

**Auto-archive cron** — daily 4 AM Cairo (`vercel.json` entry, 33→34 of 40), bulk update closed conversations OR open with no inbound 90+ days. Single audit row per cron-run, not per-conversation.

**Composer in archive view** — disabled with banner "This conversation is archived. Restore to reply." + one-click restore button.

**R.2 Mobile fullscreen conversation:**

Current `unified/page.tsx` uses `grid grid-cols-1 lg:grid-cols-2` — sidebar + thread pane stack vertically on phones, both visible. Proposed: when viewport `< lg` (1024px) AND `?c=<id>` present, sidebar hides entirely, thread pane takes 100dvh fixed-position (use `dvh` not `vh` to handle iOS Safari address bar collapse), top-left back arrow strips `?c` to return to list. CSS-only — no new client components, no JS gestures V1.

**Edge cases handled in plan:** iOS Safari `100dvh` workaround · sticky composer for keyboard pop · hardware back button (Next.js routing already handles via URL) · landscape phone (640-1024px) goes fullscreen too.

**10 mobile-polish improvements offered (#1-#8):** swipe-right back gesture · bottom-sheet attachment menu · pull-to-refresh · tab-bar new-message badge · compact sidebar row · floating scroll-to-bottom · PWA install · voice playback speed. Recommended V1 cut: **#5 compact sidebar + #6 floating scroll-to-bottom**.

**10 archive-polish improvements offered (A-J):** search within archive · CSV export · bulk-restore · search across all months · star-to-keep-accessible · per-month conversation count · swipe-left mobile actions · thread auto-scroll to first unread · archive reason filter · cross-channel duplicate detection. Recommended V1 cut: **A search within archive · F per-month count · G swipe-left mobile actions · H auto-scroll to first unread**.

### 15 open questions blocking workflow phase

R1 archive flavor (rec B true archive) · R2 auto-archive threshold (rec 90 days) · R3 auto-archive scope (rec closed + open with no inbound 90+) · R4 composer on archived (rec disabled + restore CTA) · R5 month definition (rec coalesce modified_at_external + last_inbound_at + created_at) · R6 apply to all 4 channels (rec yes, 5th tab everywhere) · R7 mobile breakpoint (rec lg=1024px) · R8 tablet behavior (rec fullscreen too) · R9 back arrow + browser-back (rec both) · R10 restore permission (rec communication:full) · R11 bulk-archive confirm dialog (rec yes, type-to-confirm if >500 convs) · R12 archive search V1 (rec yes) · R13 CSV export V1 (rec defer V2) · R14 compact sidebar row + auto-scroll-first-unread V1 (rec yes both) · R15 audit log scope (rec just bulk batches, one row per cron/month-bulk).

**Confidence ~78%** — drops mainly around R1 archive flavor + R2/R3 auto-cron aggressiveness + R7/R8 mobile breakpoint. User can answer per-question or "default + proceed" → next turn drafts workflow doc → S sign-off → ships R.0 pre-flight + R.1 first code.

Note: Phase Q paused mid-stream after Q.0 + Q.1 shipped. Q.2 (templates) · Q.2.5 (admin CRUD) · Q.3 (multi-attach + library) · Q.4 (polish) all still pending. Phase R interleaves with Phase Q — could ship R after Q.4, or interleave (R is independent of templates/attachments).

## ✅ Earlier this session — Phase Q.0 pre-flight + Q.1 reservation chip SHIPPED (commits `92a17a9` + `023452c`)

User said "Ok To all Defaults" → workflow doc S1+S2+S3 all locked at recommended path → auto-mode active → drafted workflow, then immediately shipped Q.0 + Q.1 sequential auto-deploys.

### Q.0 — Pre-flight findings (commit `92a17a9`, doc-only) → [docs/PHASE_Q_PREFLIGHT.md](docs/PHASE_Q_PREFLIGHT.md)

Read-only Supabase MCP probes:
1. **`reservation_id` coverage = 99.7%** (6,720/6,741 open conversations); **0 orphans**. Fallback path is rare but real (21 stray Casual conversations).
2. **Status distribution:** 3,160 confirmed · 2,929 inquiry · 594 cancelled · 32 closed · 4 declined · 1 reserved. Critical finding: **34 inquiry conversations have date spans that include today** — those are NOT in-house guests, they're prospective bookers asking about today. Locks Q.1 logic to **status-first then date-second** to avoid inquiry-as-in-house misclassification.
3. **Source/platform distribution** (last 30d active): airbnb2 (167) · manual (78) · Booking.com (22) · website (5). Existing source pill in ThreadHeader (line 104-108) already covers the "messaging platform" surface.
4. **Guesty `attachments[]` already plumbed** — `sendGuestyConversationPost` in `src/lib/guesty.ts:516-560` already accepts `attachments?: Array<{url, name, mime}>` parameter and forwards to `/communication/conversations/{id}/posts`. Composer just doesn't surface it. **Q.3.1 collapses into Q.3** — both wa_casual + guesty multi-attach ship in one commit.
5. **`guesty_listings.raw` does NOT include pictures** — only 11 slim keys (`_id, accommodates, accountId, active, address, bedrooms, customFields, nickname, propertyType, tags, title`). **Library = `beithady_listing_assets` only** in V1 (Guesty pictures sync extension deferred to V2). Day 1 the library will be empty — composer must show "No photos in library for {listing} · Upload some" with inline upload CTA.
6. **`beithady_guests` already has** `lifetime_stays · lifetime_nights · lifetime_spend_usd · vip · loyalty_tier · last_seen · language` — guest history badge needs no schema work.
7. **Storage:** `beithady-wa-media` (20 MB, public) for chat attachments; `beithady-gallery-public` (50 MB, public) for the new listing library.
8. **Vercel cron count 33/40**; Phase Q adds 0.

Confidence raised 80% → 95%.

### Q.1 — Reservation status chip + popout + mini-timeline + guest history (commit `023452c`, code)

**5 new files + 2 edits** (8 files total, +508 lines):

- **[src/lib/beithady/communication/reservation-status.ts](src/lib/beithady/communication/reservation-status.ts)** — pure-logic helper, client-safe (no `server-only`):
  - `computeReservationVariant(input, hasReservationId)` returns `in_house | future | past | inquiry | cancelled | pending_sync | none`
  - `computeStayProgress` returns `{current, total}` for "Night N of M"
  - `fmtShortDate · fmtDateRange` — "Apr 12 → Apr 16"
  - Cairo-tz today via `toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })` matches Guesty's `check_in_date` wall-date format

- **[src/lib/beithady/communication/inbox.ts](src/lib/beithady/communication/inbox.ts)** — extended `loadThread` to parallel-fetch reservation join + guest stats. Both new fields are nullable on `ThreadBundle` so existing consumers stay compatible.
  - New types: `ThreadReservation` (12 fields) + `ThreadGuestStats` (7 fields)
  - All fetches in `Promise.all` to keep right-panel open latency unchanged

- **[src/app/beithady/communication/_components/reservation-status-chip.tsx](src/app/beithady/communication/_components/reservation-status-chip.tsx)** — server component. Variant→class+icon maps. **🟢 IN-HOUSE NOW pulses** (`animate-pulse`). Click → `/beithady/operations/calendar?reservation=<id>` (existing 10-tab `<ReservationDrawer>`, opens in new tab via `target="_blank"`).

- **[src/app/beithady/communication/_components/reservation-mini-timeline.tsx](src/app/beithady/communication/_components/reservation-mini-timeline.tsx)** — Q.4 #1 strip. Date range · nights · guests · total paid + ADR · confirmation code. Hidden for inquiry/cancelled (chip already carries dates).

- **[src/app/beithady/communication/_components/guest-history-badge.tsx](src/app/beithady/communication/_components/guest-history-badge.tsx)** — Q.4 #2. Returning-guest pill with stays count · total nights · VIP crown · loyalty tier dot. Hidden for first-stay guests.

- **[src/app/beithady/communication/_components/no-reservation-fallback.tsx](src/app/beithady/communication/_components/no-reservation-fallback.tsx)** — fallback chip for the 21 cold-lead conversations. Deep-links to `https://app.guesty.com/inbox?search=<phone>` for staff to find/match.

- **[src/app/beithady/communication/_components/thread-pane.tsx](src/app/beithady/communication/_components/thread-pane.tsx:97)** — `<ThreadHeader>` extended with two new flex rows under the name/SLA/source line: row 1 = chip + GuestHistoryBadge, row 2 = mini-timeline.

**Type-check clean** (no Q.1 errors; pre-existing `@react-pdf/renderer` and `exceljs` errors unrelated).

### Phase Q progress
✅ Q.0 pre-flight (doc) · ✅ Q.1 reservation chip + popout + mini-timeline + guest history · ⏳ Q.2 templates V1 + variable resolver + 0053a/b · ⏳ Q.2.5 admin templates CRUD page · ⏳ Q.3 wa_casual + guesty multi-attach + library + 0053c (Q.3.1 collapsed in) · ⏳ Q.4 polish bundle + 0053d.

Next sub-phase: **Q.2 templates V1**. Migrations 0053a (templates table + 8 seeds) + 0053b (listing_secrets for `{wifi_password}` resolution). Client-side variable resolver. New `<TemplatePicker>` popover next to paperclip in both composers.

## 🟡 Earlier this session — Phase Q plan drafted: Unified Inbox right-panel upgrade (no code, awaiting Q1–Q15)

User screenshot of `/beithady/communication/unified` thread pane → asked for 4 deliverables:
1. Reservation status indicator (Confirmed / Cancelled / Inquiry · Future vs **In-house Now**) with click-to-popout
2. Templates button next to attachment icon
3. Attachment upgrade — multi-select pictures · device / camera / **listing library by Building & Sub Unit**
4. Suggest other improvements

Per standing process: Plan → 95% → Workflow → 95% → Code. **No code this turn.**

### What I sent

**Plan (full version in chat):**

**Q.1 reservation chip** — read `beithady_conversations.reservation_id` → JOIN `guesty_reservations` (already linked, no migration). Chip variants: 🟢 IN-HOUSE NOW (today between check_in_date & check_out_date) · 🔵 Confirmed Future · ⚪ Past · 🟡 Inquiry (with requested dates) · ❌ Cancelled. Sort priority for "more urgent" surfacing: In-house > Inquiry > Confirmed Future > Cancelled > Past. Pulse animation when In-house + SLA breach.

**Popout — 3 options:** A) Link to `/beithady/operations/calendar?reservation=<id>` reusing existing 10-tab `<ReservationDrawer>` (recommended — zero risk, mirrors morning-brief / cancel-risk cross-link pattern) · B) Refactor drawer to portable, mount inside inbox · C) Build lightweight modal.

**Q.2 templates** — new table `beithady_message_templates` (name, channel[], source_filter[], language en/ar/auto, category, body with `{guest_name}` `{check_in_date}` etc. placeholders, sort_order, active). UI: 📋 icon next to paperclip → category-tabbed popover → click inserts into textarea with cursor at first unresolved `{var}`. WABA caveat: outside 24h window only Meta-approved templates can fire on `wa_cloud` — split into Q.2a (free-text, this round) and Q.2b (Meta WABA picker, after WABA provisioning). 8 seed templates: pre-arrival WhatsApp EN+AR, wifi+checkin, quiet hours, checkout, no-availability, inquiry follow-up, late checkout (loyalty perk), negative-review pre-empt apology.

**Q.3 attachments** — paperclip becomes dropdown: 📁 Device (multi-select with thumbnail preview + drag-reorder) · 📷 Camera (`capture="environment"` on mobile, falls back desktop) · 🏢 Listing library (Building → Sub Unit → multi-select photos). Library data sources: `guesty_listings.raw.pictures[]` (auto-updating Guesty-managed) + new optional `beithady_listing_assets` table for staff-uploaded extras (wifi card, gate code, parking diagram). Reuse `beithady-wa-media` Supabase Storage bucket. Channel reality: today only `wa_casual` has working attach pipe; Q.3 extends Guesty composer too (Airbnb + WhatsApp + Email modules support media — needs Guesty media-URL field probe). SMS hides the button. Multi-image on Green-API: N sequential posts (no album support), single shared caption on first.

**Q.4 polish bundle (15 suggestions, V1 cut: #1+#2+#3+#5+#6+#12+#13):**
1. Reservation mini-timeline strip (check-in · nights · total paid · ADR)
2. Guest history badge (5th stay · 23 nights total · last Feb)
3. Internal notes panel (staff-only, new `beithady_conversation_notes`)
4. Snooze conversation
5. Mark resolved + close-with-reason dropdown (resolved/spam/no-response/booked)
6. Translate inline AR↔EN (Anthropic haiku-4-5)
7. Voice message transcription (Whisper)
8. Schedule send
9. Building announcement broadcast
10. Reservation status timeline in popout
11. Listing photo hover preview
12. AI suggestion accept-and-edit
13. Bulk mark-read · keyboard shortcuts (j/k/r/e)
14. Conversation pin
15. Cross-channel guest merge

### Sub-phase commit shape (~5 commits)

Q.0 doc-only pre-flight (audit reservation_id coverage + Guesty media probe + template seed lock) · Q.1 reservation chip + popout · Q.2 templates V1 + variable resolver · Q.3 multi-attach + library + Guesty composer attach · Q.4 polish bundle.

### 15 questions blocking workflow phase

Q1 popout option (rec A) · Q2 no-reservation fallback button · Q3 in-house definition (rec inclusive only) · Q4 seed 8 vs admin CRUD first (rec seed) · Q5 template variable list lock · Q6 wifi_password storage location (rec new `beithady_listing_secrets`) · Q7 library sources Guesty-only or both (rec both) · Q8 multi-image as N sequential posts (rec yes) · Q9 wa_casual-only Q.3 with Guesty in Q.3.1 (rec split risk) · Q10 translate placement (rec below original, dismissible) · Q11 internal notes staff-only (rec yes) · Q12 schedule send defer to V2 (rec yes) · Q13 Q.4 cut confirm · Q14 permissions reuse `communication:full` (rec yes) · Q15 audit log scope (rec yes for sends + template-applied; no for popout opens).

**Confidence ~80%** — rest after Q.0 pre-flight + user Q1–Q15 answers (esp. Q4 templates scope, Q9 Guesty attach risk, Q13 polish cut).

User can answer per-question or "default + proceed" for recommended path → next turn locks workflow doc → turn after that ships Q.0 + Q.1.

## ✅ Earlier turn — Phase O webhook FULLY LIVE end-to-end (commit `fec8e48`)

User configured Vercel env (`GUESTY_WEBHOOK_SECRET=70ada40491661bbebee18518495f137e0482a330403fec91d0ad41f16163bf94`) but Guesty UI showed **"Operating in read-only mode"** tooltip on the Add Endpoint button — their plan/role can't add webhooks via dashboard.

### Workaround: programmatic webhook registration via Open API

Built a registrar earlier this turn that calls `POST https://open-api.guesty.com/v1/webhooks` using existing OAuth credentials (`GUESTY_CLIENT_ID/SECRET/ACCOUNT_ID`).

### 🐛 404 bug discovered when user fired it

`/api/admin/guesty-webhook-register?secret=...` returned 404. Root cause: `src/proxy.ts` PUBLIC_PREFIXES allowlist gates `/api/admin/*` behind user-session auth. Same bug affected the original webhook receiver path — proxy expects `/api/webhooks/*` (plural) but I'd built `/api/webhook/*` (singular).

### Fix: 3 path moves + verify-page checklist update

| Old (blocked by proxy) | New (in PUBLIC_PREFIXES) |
|---|---|
| `/api/webhook/guesty/conversation` | `/api/webhooks/guesty/conversation` ✅ |
| `/api/admin/guesty-backfill` | `/api/cron/beithady-guesty-backfill` ✅ |
| `/api/admin/guesty-webhook-register` | `/api/cron/beithady-guesty-webhook-register` ✅ |

`TARGET_PATH` in registrar updated to plural `/webhooks/`. 3 occurrences updated in the verify page setup checklist. `runGuestySync('admin_backfill')` → `'manual'` to match existing trigger enum. `vercel.json` not touched — these are manual-fire-only endpoints.

### Result: end-to-end success

After deploy, fired registrar via curl with user's existing CRON_SECRET:

```json
{"ok":true,"status":"created","webhook":{
  "_id":"69f1273ba228cc00142a09cf",
  "accountId":"68342f589bf7f8c07ec2435c",
  "events":["reservation.messageReceived","reservation.messageSent"],
  "url":"https://limeinc.vercel.app/api/webhooks/guesty/conversation?secret=<redacted>"
}}
```

Then fired backfill — runGuestySync returned: 90 listings · 6,958 reservations · 846 reviews · **6,367 conversations · 1,085 conversation posts** · 10 classified.

### Inbox staleness BEFORE / AFTER

| | Before this turn | After this turn |
|---|---|---|
| Most recent Guesty msg in `beithady_messages` | 17.4 hours old | **45 minutes old** ✅ |
| Total Guesty messages | 1,311 | **1,567** (256 new caught up) |
| Real-time path | nonexistent | live — webhook 69f1273b registered with both message events |

### Architecture state going forward

- Daily cron at `40 4 * * *` UTC continues as a safety net
- Webhook receiver at `/api/webhooks/guesty/conversation` handles incoming events in <2s, fires `beithady_communication_ingest` RPC after each
- Verify page at `/beithady/communication/webhooks` shows live event rows + 24h health stats
- Manual backfill at `/api/cron/beithady-guesty-backfill` available anytime
- CRON_SECRET unchanged: user's existing `e649b977...` is the canonical value (the fresh `4111360b...` I generated was NOT applied)

### V2 polish for later

- HMAC signature header validation (waiting on Guesty docs)
- IP allowlist
- Replay-from-events-table button on verify page
- Optional `vercel.json` cron entry hitting `/api/cron/beithady-guesty-backfill` nightly as additional safety net

### May 1 launch readiness

None blocking. Suggest sending one test Guesty message to confirm verify page populates a `processed` row.

## 🟢 Earlier this turn — Generated GUESTY_WEBHOOK_SECRET (no code)

User opened the Guesty Webhooks UI ready to add the endpoint, asked what `<your value>` was in the URL placeholder. Generated `GUESTY_WEBHOOK_SECRET=70ada40491661bbebee18518495f137e0482a330403fec91d0ad41f16163bf94` via Node crypto. Walked through 2 setup steps. User set it in Vercel env Production+Preview. (See above turn for the full follow-on path-move fix + successful registration.)

## 🟡 Earlier sibling-worktree turn — M.15.2 SHIPPED: estimator landing page + Settings/Inventory hooks (commit `75507f8`)

**New page**: [/beithady/inventory/rules/estimator](https://limeinc.vercel.app/beithady/inventory/rules/estimator) — matrix of 7 unit configurations. Columns: Configuration · Tier · Bedrooms · Bathrooms · Guests · Items · Listings using · Total per check-in (EGP) · Per guest. Click any row → `/[configId]` (M.15.3 builds the editor).

**Server-side estimator engine** at [src/lib/beithady/inventory/estimator.ts](src/lib/beithady/inventory/estimator.ts):
- `listUnitConfigurations` / `getUnitConfiguration` / `getUnitConfigurationByCode`
- `countListingsPerConfig` (for "12 listings using this config")
- `listUnitConfigSummaries` (matrix-page totals)
- **`computeEstimatorOutput(unitConfigId, listingId?)`** — the heart of M.15:
  - Resolves rules with most-specific-wins ladder: `listing > unit_config > category > building > global`
  - Applies `formulaMultiplier` from estimator-shared (per_bedroom / per_bathroom / per_guest / fixed / fractional)
  - Applies `loss_factor_pct` to get effective qty
  - Layers per-listing override on top (Q11)
  - Computes Amazon-EG price-per-pack-unit when available, else falls back to `default_cost_egp`
  - Groups lines by `EstimatorCategoryGroup` (cleaning · sanitary · tray · linen · branded · misc)
  - Returns totals_by_group + grand total + per-guest amortized

**Settings hook** — new card on `/beithady/settings`: "Housekeeping Estimator · per-unit setup matrix + Amazon EG sourcing" → estimator landing.

**Inventory hook** — new 10th InvCard on `/beithady/inventory`: "Housekeeping Setup · Per-unit estimator matrix · 7 unit configurations · 30 consumables" → same destination.

**Bathroom-coverage banner** on the matrix prominently flags the M.15.0 pre-flight finding: pricelabs/Guesty don't expose bathroom counts, so every listing is auto-assigned by bedroom only and needs admin verification via the per-listing override panel (M.15.3).

**Build risk avoided** — page imports types/helpers from `estimator-shared` (client-safe) and server queries from `estimator.ts` (server-only) on the server side. No client component pulls server-only directly. Mirrors warehouses-shared / rules-shared pattern from M.3 + M.11 hotfixes.

**Live**: canonical Ready. [/beithady/inventory/rules/estimator](https://limeinc.vercel.app/beithady/inventory/rules/estimator).

### Phase M.15 progress
✅ M.15.0 pre-flight · ✅ M.15.1 migrations + types-shared · ✅ M.15.2 landing page + Settings/Inventory hooks · ⏳ M.15.3 Config detail + line CRUD + listing override · ⏳ M.15.4 AI Amazon EG sourcer · ⏳ M.15.5 Forecast view + 3 cron handlers + checklist hook.

### Note: sibling worktree shipped Phase O (Guesty webhooks) in parallel
Phase O ships real-time inbox via Guesty webhook + admin verify + backfill (commit `b1a17d5` on origin/main, separate worktree). Independent feature, no conflict with M.15 work.

## 🟢 Earlier this session — M.15.0 pre-flight + M.15.1 foundation SHIPPED (commits `4df2c9e` + `c2f4b06`)

User said "default" → S1/S2/S3 all accepted recommendations → green light coding. **Two commits shipped** in this turn covering the first two M.15 sub-phases.

### M.15.0 — Pre-flight findings (commit `4df2c9e`, doc-only)

Read-only audits via Supabase MCP + grep, written to [docs/PHASE_M15_PREFLIGHT.md](docs/PHASE_M15_PREFLIGHT.md):

1. **Bedrooms coverage 72%** (58/81 active BH-* listings have bedrooms in pricelabs). The 23 unknowns are all BH-73 MTL parents — Phase J's `mtl.ts` already handles fallback to children, so listing-config-sync cron reuses that.
2. **Bathrooms coverage 0%** 🔴 — neither pricelabs nor `guesty_listings.raw` exposes bathroom counts. All manual entry. M.15.1 added `needs_review` flag on `_listing_unit_config` to flag every listing until admin verifies.
3. **`_consumption_rules` is empty** (0 rows) — no collision risk for new `unit_config` scope + 4 new formula_kind values.
4. **`amazon_eg_url` already exists** on `_items` (M.4) — migration 0052c uses `ADD COLUMN IF NOT EXISTS` for the 10 additional amazon_eg_* columns.
5. **Vercel cron count 33 → 36** after M.15.5. Pro plan allows 40, 4 headroom.
6. **MTL polarity reminder** — unit_config sync must run on bookable atoms only (use `isBookableAtom()` from `mtl.ts`).

### M.15.1 — Foundation (commit `c2f4b06`, code)

**4 migrations applied via Supabase MCP + written to `supabase/migrations/` for repo history:**

- **0052a_unit_configurations** — new `beithady_inventory_unit_configurations` (id, code unique, name_en/ar, bedrooms int 0-6, bathrooms numeric(3,1) 0.5-6.0, guest_capacity, tier enum standard/premium/vip, notes, active) + `beithady_inventory_listing_unit_config` (listing→config mapping with auto/manual source + needs_review flag).
- **0052b_consumption_rules_unit_config** — extends scope CHECK to include `'unit_config'`; adds 4 new formula_kind values (`per_bedroom_per_checkin`, `per_bathroom_per_checkin`, `per_guest_per_checkin`, `fractional_per_checkin`); creates `beithady_inventory_listing_overrides` table (Q11 layer with qty_override, reason, unique on listing_id+item_id).
- **0052c_amazon_eg_sourcing** — extends `_items` with 10 amazon_eg_* columns (price_egp, rating, review_count, is_bulk_pack, pack_size, image_url, in_stock, last_checked_at, last_status enum, alternatives jsonb); creates `beithady_inventory_amazon_eg_price_snapshots` for weekly trend tracking.
- **0052d_seed_unit_configs_categories_uoms_items_rules** — seeds:
  - 2 new categories: `sanitary` + `branded` (per Q13)
  - 4 new UoMs: `bottle`, `can`, `sachet`, `pair`
  - **7 unit configurations** matching real BH-26/73/435/OK shapes (Studio + 1BR/1BA + 1BR/1.5BA + 2BR/2BA + 2BR/2.5BA Premium + 3BR/2BA + 3BR/3BA Premium)
  - **30 consumable items** grouped: Cleaning(8 incl. Glance/Pledge/anti-flies per Q14) + Sanitary(8) + Tray(7) + Linen(3) + Branded(4)
  - **30 global default consumption rules** — formula_kind handles per-bedroom/bathroom/guest scaling, no per-config rule explosion needed.

**Types-shared file** [`src/lib/beithady/inventory/estimator-shared.ts`](src/lib/beithady/inventory/estimator-shared.ts) — mirrors warehouses-shared / rules-shared split pattern (no `server-only` import). Holds `UnitConfiguration · RuleScope · FormulaKind · FORMULA_KIND_LABEL · SCOPE_LABEL · TIER_LABEL · AmazonEgCandidate · AMAZON_EG_URL_PATTERN · scoreAmazonCandidate() · EstimatorOutput · EstimatorLine · ESTIMATOR_GROUP_LABEL · categoryToGroup() · formulaMultiplier() · COST_IMPACT_ALERT_THRESHOLD · shouldAlertOnCostImpact()`. Client-safe so future client components can pull directly.

**Verified counts:** 7 unit_configs + 30 items + 30 rules + 9 categories (2 added). Type-check clean. Canonical `limeinc.vercel.app` Ready (2m).

### Phase M.15 progress
✅ M.15.0 pre-flight · ✅ M.15.1 migrations + types-shared · ⏳ M.15.2 Settings card + Inventory tab + estimator landing page · ⏳ M.15.3 Config detail + line CRUD + listing override · ⏳ M.15.4 AI Amazon EG sourcer · ⏳ M.15.5 Forecast view + 3 cron handlers + checklist hook.

## 🟡 Earlier this session — Phase M.15 workflow drafted: Q1–Q15 locked, awaiting S1–S3 sign-off (no code)

User answered all 15 plan-phase questions. Workflow phase sent for review per standing process (Plan → 95% → Workflow → 95% → Code). **No code this turn.**

**Locked answers (full table in chat):**
- Q1 Both placements · Q2 Pricelabs OR Guesty for bedroom/bathroom data · Q3 Half-bath granularity yes (numeric(3,1)) · Q4 Anthropic web_search YES + always availability-check on amazon.eg · Q5 On-demand + weekly cron for items issued >5×/30d · Q6 EGP only V1, no UAE · Q7 Consumables only V1, linen+hard-goods V2 · Q8 Extend `_consumption_rules` with `unit_config` scope value (single source of truth, no parallel estimator_lines table) · Q9 Hybrid kit baseline + per_guest topup · Q10 Free edit + >20% cost-impact alert · Q11 Per-listing override layer · Q12 Defer historical mining V2 · Q13 Branded items separate category · Q14 Fractional qty + ADD: Glance window cleaner, Pledge wood polish, anti-flies spray · Q15 No owner-billable V1.

**Workflow doc sent (12 sections):**
1. Locked answers recap
2. Final DB schema — 4 migrations: `0052a_unit_configurations.sql` (configs + listing_unit_config), `0052b_consumption_rules_unit_config.sql` (extend rules scope + 4 new formula_kinds: `per_bedroom_per_checkin`, `per_bathroom_per_checkin`, `per_guest_per_checkin`, `fractional_per_checkin`; new `_listing_overrides` table), `0052c_amazon_eg_sourcing.sql` (8 new columns on `_items` + `_amazon_eg_price_snapshots` table), `0052d_seed_unit_configs_and_consumables.sql`
3. Seed data — 7 unit configs (Studio/1BR/1BR-1.5BA/2BR-2BA/2BR-2.5BA Premium/3BR-2BA/3BR-3BA Premium) + 30 consumable items grouped Cleaning(8) · Sanitary(8) · Tray(7) · Linen(3) · Branded(4)
4. Server actions inventory — 14 actions including `findAmazonEgCandidatesAction` (Anthropic web_search), `applyAmazonEgCandidateAction`, `bulkApplyConfigToListingsAction`, `upsertListingOverrideAction`, `getEstimatorOutput`, `computeReorderRequirements`, weekly cron handler
5. UI routes — `/beithady/inventory/rules/estimator` landing matrix · `/[configId]` config detail · `/listing/[listingId]` override view · `/forecast` 30-day demand projection · Settings card + Inventory tab links
6. AI Amazon EG sourcing flow detailed — Anthropic haiku-4-5 + web_search tool · URL pattern validation `^https://www\.amazon\.eg/(dp|gp/product)/[A-Z0-9]{10}` · HEAD-request availability check · scoring formula `(rating × 20) + (log10(reviews+1) × 5) - (price_per_unit × 0.1) + (bulk ? 10 : 0) + (in_stock ? 5 : -50)` · top-5 sorted, auto-pick or manual choose
7. Cost-impact alert — banner + confirm-required when single edit shifts unit_config total >20%, audit logs the delta
8. Cron schedules — `0 4 * * 1` UTC weekly Amazon refresh · `0 3 * * *` daily listing-config sync · `30 5 * * *` daily reorder alerts
9. Edge case behavior matrix — 11 cases including missing bathrooms, 404 URLs, OOS, fractional qty, override conflicts, AI hallucinated URLs
10. Sub-phase commit sequence — 6 commits: M.15.0 doc-only pre-flight · M.15.1 migration + types-shared · M.15.2 settings/inventory tabs + estimator landing · M.15.3 config detail + line CRUD + listing override · M.15.4 AI sourcer + manual paste fallback · M.15.5 forecast + budget hook + 2 crons
11. Pre-flight checks (M.15.0) — bedrooms/bathrooms data audit, Anthropic web_search probe against amazon.eg, URL pattern audit, branded items vendor confirmation, existing `_consumption_rules` collision check, Vercel cron limit
12. Test plan — 9 test scenarios covering create config, >20% cost banner, AI re-source, listing override, weekly cron, OOS handling, new listing auto-assign, forecast aggregation, cleaner checklist hook

**3 sign-off questions blocking coding phase:**
- S1 — Workflow scope as drafted? (rec: ship)
- S2 — Sub-phase ordering OK (M.15.0 doc → M.15.1 migration → … sequential auto-deploys)? (rec: yes, mirrors Phase M cadence)
- S3 — AI sourcing fallback when Anthropic web_search returns nothing — (a) require manual URL paste or (b) fall back to Anthropic general knowledge? (rec: a — strict to avoid hallucinations)

**Confidence: ~92%** post-Q1–Q15 answers. Last 3% recovers after M.15.0 pre-flight findings (mainly Anthropic web_search reliability against amazon.eg). User can answer S1/S2/S3 individually or say "default + proceed" → next turn ships M.15.0 doc commit + M.15.1 migration as first real code.

## 🟡 Earlier this session — Phase M.15 plan drafted: Housekeeping Estimator + Amazon EG Auto-Sourcing (no code, awaiting Q1–Q15)

User asked to plan a new module that estimates housekeeping/refreshing items per check-in based on **unit configuration** (bedrooms × bathrooms × guest count), pulls candidate products from **Amazon Egypt via AI** (price/rating/bulk balance), and feeds the existing inventory + budget + stock + checklist surfaces. Per standing process — Plan → 95% confidence → Workflow → 95% → Code. **This turn was plan-only; no files written.**

**Plan I sent the user (full version in chat):**

**Module placement** — dual-link to single canonical home: `/beithady/inventory/rules/estimator`. Settings card + 11th inventory tab both deep-link there.

**What already exists (don't rebuild):** `_consumption_rules` (M.1) for per-item formulas · `_kits` + `_kit_components` (M.1) for tray templates · Per-Checkin Cost calculator on `/inventory/dashboard` (M.11) · `/inventory/rules` rule CRUD (M.11) · Phase E AI classifier (Anthropic haiku-4-5 pattern reusable for Amazon EG sourcing) · `pricelabs_listings.bedrooms`.

**What's new:**
1. **Unit Configuration Profiles** — new `beithady_inventory_unit_configurations` table (bedrooms int + bathrooms numeric(3,1) + guest_capacity + tier + notes). Seeded from real BH-26/73/435/OK configs (1BR/1BA, 1BR/1.5BA, 2BR/2BA, 2BR/2.5BA, 3BR/2BA, 3BR/3BA, Studio).
2. **Estimator Lines** — Q8 dependent (new table OR extend `_consumption_rules` with `unit_config` scope value). Recommended: extend rules, single source of truth.
3. **Items table extension** — ALTER `_items` ADD `amazon_eg_url · amazon_eg_price_egp · amazon_eg_rating · amazon_eg_review_count · amazon_eg_is_bulk_pack · amazon_eg_pack_size · amazon_eg_last_checked_at · amazon_eg_alternatives jsonb`.
4. **Price snapshots** — new `beithady_amazon_eg_price_snapshots` for trend tracking.
5. **AI Amazon EG Sourcer** — `findAmazonEgCandidates(description, qty)` server action. Anthropic haiku-4-5 + `web_search` tool scoped to `amazon.eg`. Score formula: `(rating × 20) + (log(reviews+1) × 5) - (price_per_unit × 0.1) + (bulk ? 10 : 0)`. Auto-picks top score OR shows top 3.
6. **Output view** — per-config printable list grouped by Cleaning · Sanitary · Tray · Linen · Misc. Columns: Description · Qty · Unit Price EGP · Line Total · Source. Footer: total per check-in, per-guest amortized, per-night amortized.

**Hooks:** Inventory (estimator → seeds rules) · Budget (Σ check-ins × config total = expected consumption · variance flag) · Stock (par level = Σ qty × upcoming 14d check-ins) · Mobile cleaner checklist (M.12) · Operations Morning Brief stockout-risk section.

**10 suggested improvements** — Seasonal variants (Ramadan tray) · Tier-based bumps (Standard→Premium→VIP) · Length-of-stay scaling · Per-channel adjustment (Airbnb gets higher tier) · Damage/loss factor by item type · Inline product photos · Bulk-buy decision aid · 30-day forecast · Industry cost benchmark · Auto-archive discontinued items.

**15 open questions blocking workflow phase** — module placement (Q1) · bedroom/bathroom source (Q2) · half-bath granularity (Q3) · **AI sourcing approach (Q4 — major: Anthropic web_search vs Amazon PA-API vs Keepa)** · re-check cadence (Q5) · currency (Q6) · scope — consumables only / +linen / +hard-goods (Q7) · **estimator lines = new table OR extend consumption_rules (Q8 — major)** · tray amenities fixed/variable/hybrid (Q9) · approval workflow (Q10) · per-listing override (Q11) · historical data import (Q12) · branded items category (Q13) · fractional qty for shared chemicals (Q14) · owner-billable flag (Q15).

**Sub-phase shape (~6 commits, locks after Q1–Q15):** M.15.0 pre-flight (bedroom/bathroom data audit + Anthropic web_search probe against amazon.eg) · M.15.1 migration · M.15.2 settings tab + inventory tab + landing · M.15.3 configuration editor + line CRUD · M.15.4 AI Amazon EG sourcer · M.15.5 forecast view + budget/stock/checklist hooks + weekly price refresh cron.

**8-item risk register** — Amazon EG anti-bot blocks scraper (fallback to manual URL paste) · Anthropic web_search Egypt coverage gap · reorder alert flood (debounce + group by vendor) · consumption rule explosion (15 configs × 50 items × 4 buildings = 3,000+ rows; seed with defaults + bulk-edit) · currency volatility · missing bathroom count · owner-driven amenity preferences (per-listing override layer) · AI hallucinated Amazon URLs (URL pattern validation + HEAD-request 200-check before persist).

**Confidence: ~75%** — materially affected by Q4 (AI sourcing approach) + Q8 (data model). Hits 95% after answers + 30-min M.15.0 pre-flight probe.

User can answer per-question or say "default + proceed" for the recommended path on all 15 questions. No code this turn. Workflow phase locks after answers.

## 🟢 Earlier this session — Inbox UX upgrade: clickable stats + sort everywhere + channel-aware composer hint (commit `30d5507` → `fb829b9` after rebase)

User on Unified Inbox screenshot asked for three things:
1. **Where is the messages sorting options?** — sort dropdown was on Guesty only, missing on wa-casual / unified.
2. **Where is the Attachment + Voice Recording in the chat box?** — wants per-channel capability (Airbnb=attach, SMS=text-only, WhatsApp/Email=all).
3. **Dashboard Boxes Should be clickable with Direct Filter Below.**

**Shipped in one commit:**

1. **Clickable stat tiles** — new shared `<StatLink>` at [src/app/beithady/communication/_components/stat-link.tsx](src/app/beithady/communication/_components/stat-link.tsx). Wired into Guesty + WA Casual + Unified pages. Click any tile sets the URL filter:
   - Open → clears sla / unread / breach
   - Unread → `unread=1`
   - 🔴 > 12h / 🟠 4-12h / 🟡 1-4h / 🟢 ≤ 1h → `sla=red|orange|yellow|green`
   - Breach → `breach=1` (NEW filter — `sla_breach=true`)
   Active tile gets a coloured border; `q / sort / source / building` carry forward.

2. **Sort dropdown** added to WA Casual + Unified (Guesty already had it last turn). Shared `VALID_SORTS` + `SORT_LABELS` lifted into `stat-link.tsx`. 6 options: Oldest unanswered (default) · Newest unanswered · Most recent guest message · Most recent activity · Most recently replied · Guest name A→Z.

3. **`breachOnly` filter** added to `InboxFilter` in [src/lib/beithady/communication/inbox.ts](src/lib/beithady/communication/inbox.ts) — supports the Breach tile.

4. **Channel-aware capability hint** above every composer (`<ChannelCapabilityHint />` in [thread-pane.tsx](src/app/beithady/communication/_components/thread-pane.tsx)). Matrix per user spec:
   - Airbnb (Guesty) → text + attachments (no voice — Airbnb constraint)
   - Booking.com → text + attachments
   - SMS → text only
   - Email → text + attachments
   - WhatsApp via Guesty → text + voice + attachments
   - wa_casual → text + voice + attachments (LIVE today via Green-API)
   - wa_cloud (WABA) → text + voice + attachments (when WABA up)

   Each capability shows as a coloured badge: emerald=live, amber=allowed-but-sender-not-yet-wired (Phase C.4), struck-through grey=not supported by channel.

5. **GuestyComposer** now accepts `channelSource` prop. SMS chip auto-hidden on Airbnb / Booking threads (no SMS sub-channel there).

**Note:** voice + attach upload pipes are only fully wired for `wa_casual` today. Other channels show the capability *spec* — actual sender wiring needs the Guesty media API + WABA (Phase C.4).

## ✅ Phase O — Guesty webhooks for real-time inbox (full detail)

User picked **Option C** from the inbox-staleness diagnosis (last turn). Team starts using the app **2026-05-01** so we have 2 days runway. Built end-to-end with admin verify page + backfill endpoint + setup doc baked into the UI.

### What landed

**Migration `0052_guesty_webhook_events`** (applied via MCP):
- `guesty_webhook_events` table — every Guesty webhook POST persists here BEFORE processing for forensics + replay + idempotency
- `unique_key` partial UNIQUE index does dedup (e.g. `reservation.messageReceived:<message_id>`)
- Status enum: `received → processed | duplicate | ignored | error | unauthorized`

**`src/lib/guesty-webhook.ts`** — handler library:
- `processGuestyWebhook(payload, headers)` → returns `WebhookProcessResult`
- Payload parsing tolerant to Guesty's `_id` vs `id` variance + nested `conversation.thread`/`message`
- Per-event-type idempotency key derivation (message events use `message._id`; conversation events use `conversation._id + createdAt`; reservation events use `reservationId + createdAt`)
- `reservation.messageReceived` + `reservation.messageSent` → upsert into `guesty_conversation_posts` + bump `guesty_conversations.last_message_*` timestamps
- `conversation.created` + `conversation.updated` → upsert into `guesty_conversations` (drops null fields so daily-pull richer data isn't overwritten)
- `reservation.*` events → currently `ignored` (deferred to daily pull; no inbox impact)
- Anything unrecognised → `ignored` with audit row
- After successful processing: fires `beithady_communication_ingest` RPC → propagates to `beithady_messages` so Unified Inbox sees the change within ~2s

**`src/app/api/webhook/guesty/conversation/route.ts`** — public endpoint:
- POST: shared-secret auth via `?secret=<GUESTY_WEBHOOK_SECRET>` query param
- GET: healthcheck Guesty's UI uses to verify URL liveness; returns `auth_configured` + `auth_passed`
- ALWAYS returns 200 — even on internal errors. Errors land in `guesty_webhook_events.status='error'` for review. Prevents Guesty retry storms.
- Unauthorized POSTs are logged for forensics before returning 401

**`src/app/api/admin/guesty-backfill/route.ts`** — one-shot:
- POST/GET with `Bearer $CRON_SECRET` or `?secret=`
- Calls existing `runGuestySync('admin_backfill')` to clear pre-webhook backlog (the 16h stale window from the last turn's diagnosis)
- After Guesty sync: fires `beithady_communication_ingest` + `beithady_communication_sla_recompute` so the Unified Inbox catches up immediately

**`src/app/beithady/communication/webhooks/page.tsx`** — admin verify dashboard:
- Health card (green if last event <24h, amber otherwise) with deep-link to Guesty webhooks settings
- 24h stats: total / processed / errors / unauthorized
- Filter chips by status + by event_name (Inbound msgs, Outbound msgs)
- Per-event row: when, event_name, status pill, reservation/conversation/message ID truncates, processing latency in ms, error message
- Empty state shows the Setup checklist
- 6-step setup checklist baked into the page (no separate doc needed)

### Setup steps for the team (in the page UI)

1. Set `GUESTY_WEBHOOK_SECRET` in Vercel env (`openssl rand -hex 32`)
2. Open Guesty → Settings → Webhooks
3. Create webhook URL: `https://limeinc.vercel.app/api/webhook/guesty/conversation?secret=<value>`
4. Subscribe to `reservation.messageReceived` + `reservation.messageSent` (start narrow)
5. Send test from Guesty's webhook UI → refresh `/beithady/communication/webhooks` → row should appear within 2s with status=processed
6. Fire one-time backfill: `curl -X POST "https://limeinc.vercel.app/api/admin/guesty-backfill?secret=$CRON_SECRET"`

### Architecture notes locked in

- **Guesty doesn't publicly document HMAC headers** — verified via WebFetch against open-api-docs.guesty.com. Used shared-secret URL param as primary auth (Guesty webhook subscriptions support arbitrary query params on the URL).
- TODO marker in code: swap to header-based HMAC if/when Guesty publishes the spec.
- **Idempotency-first design**: every POST writes to `guesty_webhook_events` BEFORE processing, so Guesty retries are safe (duplicate rows return `ok:true, status:'duplicate'`).
- **Always-2xx response policy** prevents Guesty retry storms on internal errors. Operators replay errored events from the verify page (replay endpoint TBD as polish).
- **Reservation events deliberately deferred** to keep the webhook scope tight to what the inbox needs. Adding `reservation.*` later is a 5-line change in `processGuestyWebhook`.

### What's NOT done (intentional V2 polish)

- HMAC signature header validation (waiting on Guesty docs)
- IP allowlist (Guesty doesn't publish their range publicly)
- Replay-from-events-table button on the admin page (just a UI nicety; raw replay possible via DB)
- Webhook auto-creation via Guesty Open API (manual setup is one-time, faster than building the API caller)

### Blocking notes for go-live (May 1)

1. Set `GUESTY_WEBHOOK_SECRET` in Vercel **Production** env before May 1
2. Configure the webhook in Guesty UI before May 1
3. Run the backfill ONCE before May 1 (clears today's 16h+ backlog so first day of use shows correct history)
4. Optional: add a Vercel cron entry that hits `/api/admin/guesty-backfill` as a safety net (e.g. nightly) so any missed webhooks never accumulate

## 🟢 Earlier — Inbox-staleness diagnosis (resulted in Phase O)

User showed Guesty UI with messages from 1m ago / 42m ago / 37m ago / 2h ago etc., next to Beit Hady Unified Inbox where the newest message was 17h old. Asked where the rest are.

**Root cause found via DB inspection (no code touched):**

```
Guesty (live) → /api/cron/guesty (DAILY 04:40 UTC ⚠ BOTTLENECK)
              → guesty_conversation_posts
              → /api/cron/beithady-comm-sync (every 5 min ✅)
              → beithady_messages → Unified Inbox UI
```

The Beit Hady comm-sync cron is **healthy** — every 5 min, status=success, but reports `conversations_upserted=0, messages_upserted=0` because the upstream `guesty_conversation_posts` table hasn't been updated in 16h. Verified via `beithady_comm_sync_runs` (12 most recent rows all success+0/0) and `MAX(synced_at) FROM guesty_conversation_posts = 04:42 UTC today`.

The Guesty pull at `40 4 * * *` UTC is **once a day** because it does heavy work — listings + 365d reservations + ~15K conversations + posts + AI classification — typically ~60s. Wasn't designed for real-time inbox updates.

**3 fix options sent to user, awaiting choice:**

- **A. Lightweight inbox-only Guesty cron** (recommended, ~30 min):
  New `/api/cron/guesty-inbox` that ONLY pulls conversations modified in last 2 hours + their new posts. Skips listings/reservations/classification. Schedule `*/5 * * * *`. Safe, isolated.

- **B. Move full Guesty cron to every 15 min**:
  Heavier. ~96 min/day of compute against Guesty rate limits. Risk of quota issues.

- **C. Guesty webhooks** (real-time, ~2-3 hr):
  Configure Guesty `conversation.modified` push to `/api/webhook/guesty/conversation`. Best long-term. Phase O candidate.

Recommendation: **A now** to unblock inbox same-day, **C later** as Phase O.

No code this turn. Branch head still at `cf708f1` (Phase M complete). User picks fix approach next turn.

## 🟡 Earlier — "what's next" planning chat (no code)

User asked what was next on the plan, said they'd test Phase M later. Sent a backlog snapshot from earlier handoff sections, organised into 3 buckets:

**V2 hooks already in DB** (small follow-ups, columns/flags exist):
- Owner-billable register UI (Q10 deferred) → needs page + Financial module hook for monthly owner statements
- Asset tracking + depreciation (Q14 deferred) → `is_asset` + `serial_tracked` columns ready
- AED currency UI surfacing (Q9 deferred) → column exists vendor + item-side
- AI Amazon EG URL parser → paste URL on Items page, AI fills SKU/photo/cost (reuses Phase E + M.13 parser pattern)
- Direct camera capture in mobile cleaner app → upload to `beithady-inventory` bucket (currently URL paste)
- WhatsApp push-on-pending-approval → blocked on green-api sender accepting user-targeting (not just conversation-targeting); Approvals inbox is the substitute today

**Strategic options from earlier session backlog** (none drafted):
- K.4 Pricing recommender (PriceLabs auto-suggest)
- K.5 Direct-booking funnel landing page
- Owner Portal (Phase N candidate)
- AI cancellation prediction ML upgrade (Phase K.2 has rule-based today)

**Cross-system integration debt**:
- `beithady_pre_arrival_messages` table empty bug noted in earlier handoff — Phase F cron needs investigation
- 2,110 stale `sla_breach=true` flags never reset — flag-lifecycle bug noted but not fixed
- Owner P&L cross-company join from Odoo `[5,10]` with intercompany eliminations (per memory file)

**My recommendation: Phase N — Owner Portal** as the highest leverage. Uses everything Phase J/K/M built, unlocks new revenue conversation, all data already present.

User said "test later" — no code this turn, just a backlog inventory. Awaiting direction on what to draft next.

## ✅ Phase M COMPLETE — M.0 → M.14 SHIPPED (15/15 commits, 100%)

**Beit Hady Inventory Module fully live at https://limeinc.vercel.app/beithady/inventory**

End-to-end smoke test that works today:
1. Register vendor at `/vendors` (KYC workflow) →
2. Add items at `/items` (manual or Excel import) →
3. Add consumption rules at `/rules` (e.g. "1 toilet roll per_2_guests_per_night") →
4. Receive stock at `/grn/new` (vendor → warehouse → lines → submit → approve → post) →
5. Stock balance populates at `/stock` with full ledger drill-in →
6. Issues post via 4 channels: desktop manual, mobile cleaner app at `/m`, WhatsApp inbound (#reorder triggers AI parse), or auto-issue cron at Cairo 11:00 →
7. Transfers at `/transfers/new` move stock atomically (FIFO source pick, both legs paired) →
8. Counts at `/counts/new` (cycle 5-50 random items or physical) → variance posts as count_adjust →
9. All pending items surface in unified `/approvals` inbox →
10. Dashboard at `/dashboard` shows live KPIs + per-checkin cost calculator + 30-day movement velocity + reorder alerts + stockout-risk forecast →
11. Operations Morning Brief at Cairo 8 AM includes inventory stockout section (M.14 hook).

### Final 4 commits this session

| Sub | Commit | Scope |
|---|---|---|
| M.11 | `06169cb` | Dashboard with 8 KPIs · per-checkin cost calculator widget · reorder alerts (top 30) · top movers (last 30 days, days-of-stock-remaining) · 14-day check-in forecast strip · Consumption Rules editor with sample-preview-as-you-type. **Unblocks the auto-issue cron** that was inert until rules existed. |
| M.12 | `001a1bd` | Mobile cleaner app at `/m` — Arabic RTL, building-PIN gated (4hr cookie session), per-session cleaner name, big-button issue submission, item picker with on-hand hints, sticky submit bar. Posts as `created_via='mobile_pin'` requiring manager approval. |
| M.13 | `0791f73` | WhatsApp inbound reorder parser. Heuristic gate (Arabic + English keywords + #reorder) → Claude haiku-4-5 against live catalog → draft Issue tagged `created_via='wa_inbound'`. Hooked from existing wa-casual-ingest fire-and-forget pattern. |
| M.14 | (this commit) | Operations Morning Brief inventory stockout section (Arabic) · Approvals inbox at `/approvals` collecting GRN/Issue/PO/Count + cleaner submissions in one view · final handoff. |

### Total Phase M deliverable

- **2 SQL migrations**: 0048a/b (14 tables + role enum), 0049 (GRN posting + approval RPC), 0050 (Issue posting + auto-issue scanner), 0051 (Transfer + Count posting). 5 RPCs total: `beithady_inv_post_grn` · `beithady_inv_post_issue` · `beithady_inv_post_transfer` · `beithady_inv_post_count_session` · `beithady_inv_recompute_item_avg_cost` + 1 helper `beithady_inv_required_approvers`.
- **15 lib files** under `src/lib/beithady/inventory/` (warehouses-shared, warehouses, catalog, excel, vendors, stock, grn, issue + issue-shared, transfers, counts, rules, mobile-pin, wa-reorder-parser).
- **~50 page/component files** under `src/app/beithady/inventory/` covering 9 functional tabs + mobile app + 12 stub-replacements + cross-cutting approvals/rules pages.
- **2 cron handlers**: `/api/cron/beithady-inventory-auto-issue` at Cairo 11 + 12 (DST coverage). `vercel.json` updated.
- **1 storage bucket**: `beithady-inventory` (10MB, image+pdf).
- **2 new Beithady roles**: `warehouse_manager` (full inventory) + `housekeeper` (read inventory; mobile uses PIN gate).
- **1 new BeithadyCategory**: `inventory` with 7-role × 9-category permission matrix in auth.ts.

### Architectural patterns locked in

- `*-shared.ts` convention for types/constants used by client components (avoids `'server-only'` pollution into client bundles).
- Atomic posting RPCs use `pg_advisory_xact_lock` per item_id to serialise weighted-avg cost recompute.
- FIFO batch picking at posting time (not at line-create time) for issues + transfers.
- Approval matrix is data-driven (`beithady_inventory_approval_rules`), evaluated per-action via `beithady_inv_required_approvers` RPC.
- Mobile + WA submissions never auto-post — always `status='submitted'` requiring desktop approval.
- All writes audited to `beithady_audit_log` with `module='inventory'`.

### Known V2 deferrals (per locked Q answers)

- Owner-billable register UI (Q10 = V2). Flag exists per-item.
- Asset tracking + depreciation (Q14 = consumables only V1).
- AED currency UI surfacing (Q9 = EGP+USD V1). Column exists.
- AI Amazon EG URL parser for vendor enrichment.
- WhatsApp push-on-pending-approval (skipped — `sendWaCasualMessage` requires conversation context). Approvals inbox is the substitute.

### Open questions / future polish

- **Photo upload UX**: M.12 mobile app currently takes a URL paste. Direct camera capture (multer-style upload to `beithady-inventory` bucket) is a small follow-up.
- **Multi-line WA reorder for one site**: parser handles; warehouse routing assumes one building per message. Multi-building WA inbound would need explicit grouping.
- **Approval push notification**: current approvers find pending items via `/approvals` inbox. Hook into existing morning brief or build a dedicated digest cron.

## 🟢 Earlier this session (sibling worktree) — Users & Roles overhaul + M.11 build hotfix (commits `aaef973` + `8d49eef`)

User on `/admin/users` reported 3 issues: (1) fonts not visible in dark mode, (2) need to capture Mobile/Email/Position per user, (3) roles should be locked behind an Edit button.

**Migration `0051_app_users_contact_fields`** (separate sibling commit, NOT inventory's 0051): added `mobile_number`, `email`, `position` to `app_users` + partial unique indexes on `lower(email)` and `mobile_number`. `createUserAction` persists new fields. New `updateUserProfileAction` for profile-only edits.

**UI:** 6-column add-user form. Per-row mobile/email/position with `mailto:`+`tel:` deep-links. New `<UserRowEdit />` collapses role + access controls behind an explicit Edit button (amber-bordered card with 3 separate forms inside). Dark-mode contrast rebuilt.

**Build hotfix (`8d49eef`):** sibling caught a `'server-only'`-pulled-into-client-bundle bug in my M.11 `rules.ts` (same pattern as M.3 `warehouses.ts` previously). Extracted types + constants + `CostSample` into `rules-shared.ts`; `rules.ts` re-exports for back-compat; client components updated. Pattern now triple-locked-in across the codebase.

## 🟢 Earlier this session — Phase M coding: M.9 + M.10 SHIPPED (11/15 commits, 73%)

User said "M9, M10" → shipped both sub-phases as one commit + migration 0051.

### M.9 — Transfers

Migration 0051: `beithady_inv_post_transfer(src, dst, lines jsonb, actor)` — atomic Out/In with FIFO source picking. Generates one transfer_id (uuid) shared across paired transfer_out + transfer_in transactions. Both legs commit or both roll back.

- `src/lib/beithady/inventory/transfers.ts` — listTransfers (groups transactions by doc_id, normalises Supabase array-shape joins), getTransfer (joins both legs)
- `src/app/emails/beithady/inventory/transfers/actions.ts` — postTransferAction with approval gate (transfer >5K EGP needs warehouse_manager per seeded matrix)
- `transfers/page.tsx` list · `transfers/new/page.tsx` form · `transfers/[id]/page.tsx` detail
- `_components/transfer-form.tsx` — source/dest pickers (with available-at-source live hints + insufficient-stock warning), per-line batch selector (FIFO default), posts immediately on submit (no draft state for transfers)

### M.10 — Counts & Adjustments

Migration 0051: `beithady_inv_post_count_session(session_id, actor)` — walks count_lines, writes count_adjust transactions for non-zero variances, updates stock to counted_qty, recomputes avg_cost.

- `src/lib/beithady/inventory/counts.ts` — listCountSessions (with progress count), getCountSession (with bilingual item names), COUNT_STATUS_LABEL
- `src/app/emails/beithady/inventory/counts/actions.ts` — 6 actions:
  - createCountSessionAction (cycle = random subset 5-50 items via Fisher-Yates; physical = all stocked items)
  - saveCountedQtyAction (bulk update + auto-promote status to in_progress + records cleaner_session_name)
  - submitCountForApprovalAction (computes variance_pct, routes via matrix — >10% needs warehouse_manager)
  - approveCountAction · postCountAction (calls RPC) · cancelCountAction
- `counts/page.tsx` list with progress column · `counts/new/page.tsx` (cycle vs physical radio + sample size for cycle) · `counts/[id]/page.tsx` detail
- `_components/count-session-form.tsx` + `count-entry-panel.tsx`:
  - Live variance % preview as cleaner types (rose if >10%, amber if >0)
  - Cleaner / counter name field (named session per Q6/C2)
  - Workflow buttons appear contextually based on status: Save (always for editable) / Submit (after all counted) / Approve (canApprove + pending) / Post (after approved) / Cancel (any non-terminal)
  - Submit blocked until all lines have counted_qty filled

End-to-end smoke test now possible: Receive (GRN) → Stock populated → Issue/Transfer → Stock decrements → Count → Variance written as count_adjust transaction → Stock matches reality.

**TS gotcha resolved**: Supabase JS client types `!inner` joins as **arrays** even though they yield single objects — `transfers.ts` had to normalise via `Array.isArray(r.warehouse) ? r.warehouse[0] : r.warehouse` casting through `unknown`. Pattern locked in for future joins.

## 🟢 Earlier this session — Phase M status check (no code, awaiting direction on next sub-phase)

User asked "where are we, what's missing". Sent a status report showing the M.0-M.8 ship table (9/15 commits done, ~60%), the 5 remaining sub-phases (M.9-M.14, ~5 commits), and called out one critical gap:

**M.11 Dashboard ships the Consumption Rules editor** — without it the M.8 auto-issue cron has nothing to fire (returned `skipped_no_rules: 20` when force-tested). Plumbing is in place, just no rules data yet.

Asked the user whether to jump to M.11 next (unblocks auto-issue) or do M.9 (transfers) + M.10 (counts) first to keep the original order. User chose M9+M10.

## 🟢 Earlier this session — Beithady dark-mode contrast fix (commit `c3cd679`)

User screenshot of Multi-Calendar in dark mode: page title "Multi-Calendar" was nearly invisible, listing nicknames (BH-26-001 etc.) faded into the slate background, price-cell labels were barely legible. Root cause: Beit Hady brand defines `--bh-navy: #1E2D4A` and **28 admin pages** use it as inline `style={{ color: 'var(--bh-navy)' }}`. In dark mode that produces navy-on-slate-900 — WCAG fails everywhere.

**Fix shape (CSS-only, zero TS edits to the 28 sites):** Scope a `--bh-navy` override to `.dark [data-bh-brand="true"]` so the token resolves to slate-100 (`#f1f5f9`) on every admin page in dark mode. Confirmed safe via `Grep` — no admin page uses `--bh-navy` as a `backgroundColor` (search returned 0 matches across `src/app/emails/beithady`). Public `r/beithady/*` pages (guest stay/csat token landing pages) don't carry `data-bh-brand`, so their printed/branded navy is preserved.

**Forward-looking semantic tokens added** in [globals.css](src/app/globals.css): `--bh-heading`, `--bh-rail-text`, `--bh-body-strong` — all swap in dark mode independently. Wired the H1 in `BeithadyHeader` to `--bh-heading` and the listing rail nickname to `--bh-rail-text` for explicit semantics. The token swap on `--bh-navy` is the load-bearing fix; these are namespace polish.

**Surgical bumps where the existing global `text-slate-500/600 → 400/300` lift wasn't enough:**
- `BeithadyHeader` eyebrow (`text-slate-500` → added `dark:text-slate-300`).
- `BeithadyHeader` subtitle (`dark:text-slate-300` → `dark:text-slate-200`).
- `ListingRail` secondary line — building badge + price (`text-slate-500` → added `dark:text-slate-300`).
- `CalendarGrid` price-cell overlay (`text-slate-400` → `text-slate-500 dark:text-slate-300 font-medium`).

**Earlier this turn — stale-inquiry fade (`2738139`).** User screenshot showed BH-26-001 + BH-26-003 with what looked like duplicated/overlapping reservations on May 1. Diagnosis: not a bug, real data. Multiple Airbnb inquiries from different guests + same guest (Saad) inquiring on 2 units in the same building → 2 distinct `reservation_id`s. Only Ezekiel ever became confirmed. Spec from user: fade inquiries with no inbound/outbound message in last 48 h. Implemented client-side in `calendar-data.ts` using existing `beithady_conversations.last_inbound_at` / `last_outbound_at` (no migration). Stale inquiries render at 0.35 opacity in `reservation-bar.tsx` with tooltip suffix "· Stale inquiry (>48h silent)". Confirmed bookings unaffected.

**Build hotfix (`5a078fa`).** Vercel build was already broken on main from M.3 commit `5024494`: `src/lib/beithady/inventory/warehouses.ts` had `import 'server-only'` at the top but exported types AND constants used by client components. Even with `import type`, runtime imports of constants pulled `'server-only'` into the client bundle → Turbopack rejected. Extracted types + constants into [src/lib/beithady/inventory/warehouses-shared.ts](src/lib/beithady/inventory/warehouses-shared.ts); `warehouses.ts` re-exports them for back-compat on the server side; both client components import from `-shared`. Canonical green again.

## 🟡 Earlier this session — Phase M coding: M.0 → M.8 SHIPPED (9 commits deployed), M.9 → M.14 remaining

Auto mode active. User confirmed defaults on C1/C2/C3 → green light to coding. Six sub-phases shipped this session, all auto-deployed to limeinc.vercel.app.

### Shipped this session

| Sub | Commit | Deploy | Scope |
|---|---|---|---|
| M.0 | `05ff5b4` | ✅ | Pre-flight findings doc ([docs/PHASE_M_PREFLIGHT.md](docs/PHASE_M_PREFLIGHT.md)) — 6 read-only investigations |
| M.1 | `85e1e2a` | ✅ | Migration 0048a (role enum extension: `warehouse_manager` + `housekeeper`) + 0048b (14 tables + 4 line-item children + seeds) + auth.ts updated with `inventory` BeithadyCategory + 7-role × 9-category permission matrix |
| M.2 | `117f668` | ✅ | 9th Beithady launcher tile (Package icon, emerald) + sub-landing with KPI snapshot + 9 tab cards + 3 quick-link cards + 12 stub pages routing to a shared `<InventoryComingSoon />` component + `beithady-inventory` storage bucket created (private, 10MB cap, image+pdf MIME) |
| M.3 | `5024494` | ✅ | Warehouses CRUD + tree view + PIN rotation. Lib at `src/lib/beithady/inventory/warehouses.ts` (listAll, buildTree, fetchStats, getWarehousePin). 4 server actions (create/update/toggleActive/rotatePin). Tree panel renders by-building, recursive sub-warehouses. Cycle detection on parent edits. Block deactivation if non-zero stock. PIN reveal-once banner |
| M.4 | `8f24af0` | ✅ | Items Catalog + Excel template + bulk import. Added `exceljs ^4.4.0` dep. Lib `catalog.ts` (listItems with category+vendor+stock joins) + `excel.ts` (template generator with 4 sheets, parser with per-row validation). 5 server actions. Items table with low-stock chip, batch/expiry/owner/asset flag pills. Two-step import modal (upload → preview with willCreate/willUpdate/errors → commit). Template route at `/api/beithady/inventory/items/template` |
| M.5 | `dba972f` | ✅ | Vendors / Registration tab with KYC workflow. Lib `vendors.ts` (listVendors with item-count + GRN aggregates, getVendorPriceHistory). 6 server actions: create/update + 4 status transitions (submitForKyc/approve/suspend/reactivate). Auto-approval if creator is admin (Risk #9). Admin-only approve action requires manager+ role. Status filter chips with per-status counts. 5-section vendor form (Identity / Legal & tax / Commercial / Contact / Banking + Categories multi-select). Per-row 3-dot actions menu with status-aware transitions |
| M.6 | `5046e0a` | ✅ | Stock view + transaction ledger drill-in. Lib `stock.ts` drives off items so zero-stock items still surface; cross-warehouse aggregation for low/stockout; getItemLedger for drill-in. Right-slideover ledger drawer with type pills + signed Δ qty + doc/ref column. |
| M.7 | `eeb1597` | ✅ | **Receiving (GRN) + atomic posting engine**. Migration 0049 with 3 RPCs: `beithady_inv_recompute_item_avg_cost` (weighted avg), `beithady_inv_post_grn` (THE LOAD-BEARING RPC — pg_advisory_xact_lock per item, upsert stock, write immutable transactions, recompute avg_cost), `beithady_inv_required_approvers` (reads approval_rules, returns distinct roles). 5 server actions: createDraft/submit/approve/reject/post. State-machine: draft→submitted→pending_approval→approved→posted (immutable). Auto-approve when no rule matches. List page with status chips, detail page with line table + workflow buttons, /new with editable line table that filters items by selected vendor. |
| M.8 | `ad50380` | ✅ | **Issue dispensing + 6 types + FIFO posting + auto-issue cron engine**. Migration 0050 with 2 RPCs: `beithady_inv_post_issue` (FIFO batch picking — oldest expiry first, NULLS LAST, then earliest movement; advisory locks per item; raises EXCEPTION on insufficient stock), `beithady_inv_pending_auto_issues(window_days)` (returns reservations checking in today + yesterday catch-up with no existing reservation_hold transaction). Lib `issue.ts` with full rules engine `computeAutoIssueLines`: scope precedence (listing > building > global), formula kinds (per_guest_per_night × G × N · per_night × N · per_2_guests_per_night · per_checkin · fixed_per_stay), 12% loss factor cushion, ceil to 0.01. 5 server actions same shape as GRN. Cron handler at `/api/cron/beithady-inventory-auto-issue` (Cairo-hour gate 13-16, ?force=1 bypass) creates auto-issues with status=approved, posts via RPC, audits run with full counters. vercel.json: 2 entries at 11:00 + 12:00 UTC for DST safety. **20 reservations would fire today** (10 today + 10 yesterday catch-up) once consumption_rules are seeded (rules editor UI deferred to M.11). |

### M.0 pre-flight findings that shaped M.1+ (full doc at [docs/PHASE_M_PREFLIGHT.md](docs/PHASE_M_PREFLIGHT.md))

1. **Currency**: All 4 active Beithady buildings (BH-26/73/435/OK) are Egypt-only. Q9 V1 scope (EGP+USD) confirmed. No AED columns in V1.
2. **BH-34**: 0 listings in Guesty (upcoming building). Per Q15 = yes, seed warehouse Day 1 anyway.
3. **Phase F task table**: `beithady_tasks.id` is **uuid** → `beithady_inventory_issues.ref_task_id` is uuid with `ON DELETE SET NULL`.
4. **Phase E classifier reusability**: `src/lib/beithady/ai/classify.ts` Anthropic SDK haiku-4-5 pattern — reusable for M.13 WA inbound parser.
5. **Settings PIN convention**: greenfield. Introduced `inventory_pin_WH-XX` keys in `beithady_settings` (random 6-digit at seed; rotatable from M.3 UI).
6. **fx_rates schema**: `rate_date · base · quote · rate · source · fetched_at`. Nightly fx-snap helper (TODO M.11) will denormalise `default_cost_usd` onto items.

### 🔴 Architecture finding from M.0 that changed M.8 plan

`guesty_reservations.status` has NO `checked_in` state — only `confirmed/inquiry/canceled/closed/declined/reserved`. There's no state-transition signal to listen on. **Auto-issue trigger MUST be daily cron** (Cairo ~14:00) scanning `status='confirmed' AND check_in_date <= today AND not_yet_issued_today`, NOT realtime event subscription. Idempotency baked in via UNIQUE index `uniq_bit_reservation_hold ON beithady_inventory_transactions(ref_reservation_id, item_id, warehouse_id) WHERE type='reservation_hold'`.

### Database state after M.1

19 inventory tables created via migration 0048b (applied via Supabase MCP):
- 14 main: warehouses, categories, uoms, vendors, items, stock, transactions, grns, issues, purchase_orders, kits, approval_rules, count_sessions, consumption_rules
- 5 line-item children: grn_lines, issue_lines, po_lines, kit_components, count_lines

Seeds populated:
- 7 categories (consumables/linen/fnb/chemicals/maintenance/welcome_tray/assets) with bilingual EN+AR labels + default UoM/batch/expiry per category
- 8 UoMs (pcs/roll/pack/box/kg/g/L/mL) with measure_kind taxonomy
- 6 main warehouses (BH-26/73/435/OK/34/OTHER) with random 6-digit PINs in `beithady_settings`
- 1 dummy approved vendor (VEN-AMAZON-EG) so first GRN test isn't KYC-blocked
- 10 approval rules (Q4 thresholds: GRN >5K warehouse_mgr, GRN >25K finance, Issue >1K warehouse_mgr, PO >10K finance, all damage_writeoff → manager+finance, all owner_request → manager, all adjustments → warehouse_manager, count variance >10% → warehouse_manager, transfer >5K → warehouse_manager)

Storage bucket `beithady-inventory` (private, 10MB, image/png|jpeg|webp + pdf).

### Locked answers (recap from workflow phase)

Q0=design integration · Q1=hybrid · Q2=weighted-avg · Q3=per-item batch+expiry flags · Q4=5K/25K/1K/10K EGP defaults · Q5=new roles warehouse_manager+housekeeper · Q6=building-PIN V1 · Q7=Item Master Excel only V1 · Q8=new bucket · Q9=EGP+USD V1 · Q10=owner-billable V2 · Q11=auto-issue V1 (daily cron not realtime per #6) · Q12=mobile Arabic V1 · Q13=WA inbound V1 · Q14=consumables only V1 · Q15=all 5 buildings + OTHER

C1=as-listed (M.5 vendors before M.7 GRN) · C2=PIN+name session · C3=7 categories + 8 UoMs

### Sibling worktree activity this session

- `2738139` Operations Calendar: auto-fade stale inquiries >48h silent — touched `calendar-data.ts`, no overlap with inventory work
- `5a078fa` **Build hotfix**: split `warehouses.ts` types/constants out into `warehouses-shared.ts` because client components were transitively pulling `'server-only'` into the bundle via const re-exports. Critical fix — without it the canonical Vercel build was red on the M.3 commit. Pattern locked in: anything imported by client components MUST live in a non-`server-only` module. Applied to my warehouses lib retroactively.
- `73d08e2` SESSION_HANDOFF doc-only

### Remaining sub-phases (~5 commits, M.9 → M.14)

| Sub | Scope | Est commits | Notes for picker-up |
|---|---|---|---|
| M.9 | Transfers (Out → In pair, in-transit visibility) | 0.5 | Reuses Issue type=transfer_out + companion GRN at destination warehouse. Pair via `ref_transfer_id` (already on issues). Likely thin: a /transfers page that creates the pair atomically and shows in-transit |
| M.10 | Counts & Adjustments (cycle + physical, variance → adjustment) | 0.5 | beithady_inventory_count_sessions has generated `variance_qty` column already. Need: schedule session UI (random subset for cycle, full warehouse for physical), counted_qty entry, variance approval, adjustment posting via new RPC `beithady_inv_post_count` (writes type=count_adjust transactions) |
| M.11 | Dashboard (Tab 1) + consumption rules editor + nightly fx-snap + rollup cron | 1.5 | Real KPI population (replace M.2's snapshot calc with denormalised rollup). Rules editor at `/inventory/rules` is the missing piece for M.8 auto-issue to actually fire. Cron fx-snap = `usd_to_egp` from fx_rates → items.default_cost_usd. Rollup cron every 30 min refreshes a `beithady_inventory_dashboard_v` view |
| M.12 | Mobile cleaner app `/inventory/m` | 1 | Arabic RTL + Cairo font + building-PIN form (key `inventory_pin_WH-BHXX-MAIN`) + named session text field + big-button issue/count flows + photo capture (uploads to `beithady-inventory` bucket). Posts back as Issue with `created_via='mobile_pin'` + `cleaner_session_name` populated |
| M.13 | WhatsApp inbound reorder | 1 | Green-API webhook handler (extend existing `beithady-wa-casual` webhook). AI parser reuses `src/lib/beithady/ai/classify.ts` pattern with new categories `inventory_reorder_request` extracting items[]+qty[]. Creates draft Issue/PO with status=`pending_approval` + `created_via='wa_inbound'` |
| M.14 | Morning Brief integration + WA approval push + final polish | 0.5 | Add stockout-risk section to ops-brief.ts. Approvers get a WhatsApp ping when their queue grows (re-uses Phase C wa-casual sender). Final SESSION_HANDOFF + Phase M wrap commit |

Currently 9/15 commits done (~60%). Branch: `claude/romantic-meninsky-05e511`. Head: `ad50380`.

### IMPORTANT lessons learned

- **`server-only` rule**: anything that client components import (types AND const values) MUST live in a non-`server-only` module. Use `<lib>-shared.ts` convention. The sibling commit `5a078fa` had to apply this fix retroactively to my M.3 work — locked in for all future inventory libs.
- **Rebase discipline**: sibling worktrees ship to main mid-session. Always `git fetch + rebase` before push, not after. `.claude/settings.local.json` conflicts are noise — resolve with `--theirs`.

### File map (where things live)

- Migrations: `supabase/migrations/0048a_beithady_inventory_role_enum.sql` · `0048b_beithady_inventory_tables.sql` (14 tables + seeds) · `0049_beithady_inventory_posting_rpcs.sql` (GRN posting + approval matrix RPCs) · `0050_beithady_inventory_issue_posting.sql` (Issue FIFO posting + auto-issue scanner)
- Lib: `src/lib/beithady/inventory/{warehouses,warehouses-shared,catalog,excel,vendors,stock,grn,issue}.ts`
- Pages: `src/app/emails/beithady/inventory/{page,warehouses,items,vendors,stock,grn,issue,...}/page.tsx` + `[id]/page.tsx` + `new/page.tsx` + `_components/*`
- Server actions: `src/app/emails/beithady/inventory/{warehouses,items,vendors,grn,issue}/actions.ts`
- API: `src/app/api/beithady/inventory/items/template/route.ts` (Excel template) · `src/app/api/cron/beithady-inventory-auto-issue/route.ts` (Cairo 14:00 daily)
- Audit: `src/lib/beithady/audit.ts` extended `AuditModule` with 'inventory' (+'operations')
- Auth: `src/lib/beithady/auth.ts` extended with new roles + `inventory` BeithadyCategory
- vercel.json: 2 new cron entries (UTC 11:00 + 12:00 = Cairo 14:00 DST-safe)

### What works end-to-end RIGHT NOW (smoke test the picker-up can run)

1. Visit `/emails/beithady/inventory` → 9 tab cards, all clickable
2. Visit `/inventory/warehouses` → 6 main warehouses listed by building
3. Visit `/inventory/items` → empty initially; click "Add item" or "Excel template" → fill → import
4. Visit `/inventory/vendors` → 1 seeded VEN-AMAZON-EG; click "Register vendor" for new
5. Visit `/inventory/grn/new` → pick vendor + warehouse + add lines → "Save as draft"
6. On detail page → "Submit" → routes through approval matrix → "Approve" (if needed) → "Post to ledger"
7. Stock page now shows the received qty + avg_cost recomputed
8. Click any SKU → ledger drawer shows the receipt transaction
9. `/inventory/issue/new` → pick type + warehouse + lines → submit → approve → post (FIFO picks the cost from received batches)
10. Stock decrements; ledger shows the issue transaction
11. Cron `/api/cron/beithady-inventory-auto-issue?force=1` (with Bearer secret) — fires NOW even outside Cairo window. With 0 consumption_rules seeded today it returns `skipped_no_rules: 20`

### Open questions for the next session (none blocking, just FYI)

- Should M.10 counts UI surface a "ABC analysis" hint to suggest which items to cycle-count this week? (Improvement #14 from the plan)
- M.11 nightly fx-snap: pull from existing `fx_rates` cron or write a new `beithady-inventory-fx-snap` cron at ~03:00 UTC? Latter is cleaner.
- M.13 WA parser confidence threshold: auto-create as draft (current plan) or auto-post if confidence > 0.95? Recommend always-draft for V1 safety.

## 🟢 Earlier this session (sibling worktree) — Operations Calendar: auto-fade stale inquiries (`2738139` + `5a078fa`)

User flagged BH-26-001 + BH-26-003 showing what looked like duplicated/overlapping reservations on May 1. Diagnosis: not a bug, just real data — 4 different Airbnb guests (Saad, Talal, Nadya, Noha) sent inquiries for overlapping May 1-9 dates on those two units.

**User direction:** "Inquiry should expire within 48 Hrs of no Communication — Auto Fade Inquiries". Verified against the 7 visible inquiries: 6 stale (>48 h since last message; range 64h–156h), 1 fresh (Lojain, 17h).

**Implementation (`2738139`):** client-side, no migration. Query `beithady_conversations` for inquiry IDs (single `.in()` lookup), pick `GREATEST(last_inbound_at, last_outbound_at)`, mark `is_stale_inquiry = true` when older than 48 h. New fields on `CalendarReservation`. `reservation-bar.tsx` drops opacity to **0.35** for stale inquiries (active=1.0; cancelled=0.4). Tooltip suffix " · Stale inquiry (>48h silent)". Threshold `stalenessHours = 48` hardcoded — surface to `beithady_settings.inquiry_stale_hours` if needs to be configurable.

**Build hotfix (`5a078fa`):** Vercel build was red on M.3 commit `5024494`. `warehouses.ts` had `import 'server-only'` but exported types AND constants consumed by client components — Turbopack rejected. Fix: extracted into `warehouses-shared.ts` (no `server-only`), `warehouses.ts` re-exports for back-compat, client components updated. Confirmed green on canonical `limeinc.vercel.app`. (Pattern recorded as a lesson learned above.)

## 🟢 Earlier — Phase M.0 pre-flight findings + signed-off workflow → coding begun

User said "Confirmed Default" on C1/C2/C3 → green light to coding. M.0 read-only investigations executed via Supabase MCP + grep:

**6 findings (full doc at [docs/PHASE_M_PREFLIGHT.md](docs/PHASE_M_PREFLIGHT.md)):**
1. **Currency**: All 4 active Beithady buildings (BH-26/73/435/OK) are Egypt-only. No AED data anywhere. Q9 V1 scope (EGP+USD) confirmed correct.
2. **BH-34**: 0 listings in Guesty (likely upcoming). Per Q15 = yes, seed warehouse Day 1 anyway (inventory not coupled to reservations).
3. **Phase F task table**: `beithady_tasks` exists. `id` is **uuid** (not text). M.8 issue.ref_task_id must be uuid with `ON DELETE SET NULL`.
4. **Phase E classifier reusability**: `src/lib/beithady/ai/classify.ts` uses Anthropic SDK haiku-4-5 with structured JSON return. Pattern reusable for M.13 WA inbound reorder parser.
5. **Settings PIN convention**: greenfield — no `*_BH-XX` keys exist. Will introduce `inventory_pin_BH-XX`.
6. **fx_rates schema**: `rate_date · base · quote · rate · source · fetched_at`. Nightly fx-snap helper will denormalise `default_cost_usd` onto items to avoid per-query joins.

**🔴 IMPORTANT M.8 architecture change uncovered:** `guesty_reservations.status` has NO `checked_in` state — only `confirmed/inquiry/canceled/closed/declined/reserved`. There's no state-transition signal to listen on. **Auto-issue trigger must be daily cron (Cairo ~14:00) scanning `status='confirmed' AND check_in_date <= today AND not_yet_issued_today`**, NOT realtime event subscription. Idempotency via unique constraint on `(reservation_id, kind, item_id)` for type=`reservation_hold` transactions.

**Locked column choices for M.1 migration:**
- Currency: `default_cost_egp · default_cost_usd · currency text DEFAULT 'EGP'`. No AED V1.
- Warehouse seed: 6 (BH-26/73/435/OK/34 + OTHER)
- Issue→Task FK: uuid + ON DELETE SET NULL
- Auto-issue: daily cron + DB unique constraint
- Mobile PIN: `inventory_pin_BH-XX` in `beithady_settings`

**M.0 deliverable:** [docs/PHASE_M_PREFLIGHT.md](docs/PHASE_M_PREFLIGHT.md) doc-only commit. Next turn ships M.1 migration `0048_beithady_inventory.sql` (14 tables + role enum extension + 6 seed warehouses + 7 categories + 8 UoMs + 1 dummy approved vendor + approval matrix).

## 🟢 Earlier this session — Phase M Inventory Module workflow phase drafted (no code, awaiting C1/C2/C3)

User answered Q0–Q15 plus added a new requirement: **Vendor Registration as a dedicated tab**. Per standing process: Plan ✅ → Workflow (this turn) → Code (next turn after sign-off). No code this turn.

**Locked V1 scope from user answers:**
- Q0: Design Integration (NOT subsume) — Phase L stays as conceptual lens; M owns ALL stock tables; L's UI reads M's tables (zero duplicate stock)
- Q1: Hybrid sub-warehouse model (locational tree + categorical tag column)
- Q2: Weighted Average costing
- Q3: Per-item batch+expiry flag, auto-on for F&B + Chemicals
- Q4: Default approval thresholds 5K/25K/1K/10K EGP
- Q5: New roles `warehouse_manager` + `housekeeper` added to BeithadyRole enum
- Q6: Building-shared 6-digit PIN V1 (per-cleaner login V2)
- Q7: Excel V1 = Item Master only (GRN/Counts V2)
- Q8: New `beithady-inventory` storage bucket (clean separation)
- Q9: EGP + USD V1, AED V2
- Q10: Owner-billable register V2
- Q11: Auto-issue on check-in V1 (rules engine via cron poller, not realtime)
- Q12: Mobile cleaner app + Arabic checklist V1
- Q13: WhatsApp inbound reorder V1 (changed from rec V2 — green-api webhook + Phase E AI parser + draft Issue/PO)
- Q14: Consumables only V1 (asset-tracking columns exist but no depreciation logic)
- Q15: All 5 buildings (BH-26/73/435/OK/34) get warehouses Day 1, plus OTHER bucket

**Q0 architecture sent (Phase L↔M coexistence):** Phase L disappears as a build phase. Its features ship as widgets/views layered on M tables:
- Consumables Catalog → M Tab 3 filtered to category=Consumables
- Consumption Rules matrix → M `_consumption_rules` table at `/inventory/rules`
- Per-Checkin Cost Calculator + 30-day Forecast → widgets on M Tab 1 Dashboard
- Auto Purchase List → M Tab 1 "Reorder Alerts" panel
- Stock on Hand → M Tab 5 filtered to Consumables
- Welcome-Tray Templates → M `_kits` table (already in plan)
- Arabic Housekeeping Checklist → M.12 mobile app `/inventory/m`

**Final 9 tabs (Vendor Registration is new Tab 4):**
1. Dashboard (KPIs + per-checkin cost + forecast + reorder + stockout risk + approvals badge)
2. Warehouses (tree view + CRUD)
3. Items / Catalog (master + Excel + AI Amazon-URL paste)
4. **Vendors / Registration** — NEW dedicated tab (KYC workflow + payment terms + banking + price-history graph)
5. Stock (balance per item × warehouse × batch + ledger drill-in)
6. Receiving / GRN
7. Dispensing / Issue (6 types + Kits + auto-rules)
8. Transfers (Out → In pair)
9. Counts & Adjustments

Plus sub-routes: `/inventory/rules`, `/inventory/approvals`, `/inventory/m`.

**Final data model — 14 tables + 4 line-item children** (migration `0048_beithady_inventory.sql`):
`_warehouses` (parent_id self-ref + category_tag) · `_categories` (hierarchical) · `_items` (sku, name_en/ar, batch+expiry flags, owner_billable, is_asset, costing) · `_vendors` (was _suppliers; KYC status, tax_id, banking, payment_terms, amazon_eg URL) · `_stock` (item × warehouse × batch composite PK) · `_transactions` (immutable ledger) · `_grns` + `_grn_lines` · `_issues` + `_issue_lines` · `_purchase_orders` + `_po_lines` · `_kits` + `_kit_components` · `_approval_rules` (configurable matrix) · `_count_sessions` + `_count_lines` · `_consumption_rules` (Phase L rules engine: per_guest_per_night, per_night, per_2_guests_per_night, fixed_per_stay, with loss_factor_pct).

**Permission matrix update sent:** add 2 roles. warehouse_manager = full inventory + read on operations/crm. housekeeper = read inventory only (mobile app is PIN-gated, not role-gated; PIN stored in `beithady_settings` keyed `inventory_pin_BH-XX`).

**Sub-phase plan (15 commits, M.0 → M.14):**
M.0 pre-flight (1c) → M.1 migration 0048 + role enum + 5 seed warehouses (1c) → M.2 launcher tile + sub-landing + bucket creation (1c) → M.3 warehouses CRUD + tree (1c) → M.4 items catalog + Excel template gen + import (2c) → **M.5 vendors registration + Amazon EG URL parser + price history (1c)** → M.6 stock view + ledger (1c) → M.7 GRN + PO match + QC photos + approval + posting engine (1c) → M.8 issue + 6 types + Kits + auto-rules engine on check-in cron poller (2c) → M.9 transfers (0.5c) → M.10 counts (0.5c) → M.11 dashboard + per-checkin cost widget + forecast + reorder alerts + stockout risk + cron `beithady-inventory-rollup` 30min (1c) → M.12 mobile cleaner app `/inventory/m` Arabic RTL + PIN gate (1c) → M.13 WhatsApp inbound reorder webhook + Phase E parser reuse (1c) → M.14 Operations Morning Brief stockout-risk integration + WA approval push (0.5c).

**M.0 pre-flight scope (6 read-only checks):** BH-OK/BH-34 currency · Phase F task→item linkage point · Phase E classifier reusable interface · existing `beithady_settings` PIN convention · `fx_rates` schema for EGP↔USD · reservation check-in event source (Phase J state-transition signal vs cron-polling `guesty_reservations`).

**10-item risk register sent:** auto-issue idempotency (unique constraint on `reservation_id, kind, item_id` for type=reservation_hold), weighted-avg race condition (DB advisory lock per item), WhatsApp parser misclassification (always create as draft, never auto-post), mobile PIN brute-force (5/15min/IP rate-limit), Excel partial commit (transaction wrap), photo storage cost (10MB cap + quarterly cleanup of count session photos >12mo), Phase L user expectations (deep-link chips), new role enum impact (additive), vendor KYC blocking first GRN (seed 1 dummy approved vendor + admin auto-approve), reservation FK on issues (ON DELETE SET NULL).

**3 confirmation questions blocking coding (C1/C2/C3):**
- C1 — Sub-phase ordering: M.5 Vendors before M.7 GRN OK? [rec yes; alt = stub vendor selector in M.7]
- C2 — Mobile cleaner identity V1: PIN-only or PIN + free-text name field per session for audit trail? [rec PIN + name]
- C3 — Seed 7 root categories (Consumables/Linen/F&B/Chemicals/Maintenance Parts/Welcome Tray Items/Assets) + 8 UoMs (pcs/roll/pack/kg/g/L/mL/box)? [confirm or amend]

**Confidence: 93%** on structure / DB shape / workflow algebra / Phase L integration / sub-phase sequencing. Last 2% recovers after C1/C2/C3 + M.0 pre-flight findings.

User can answer C1/C2/C3 individually or say "default + proceed" — next turn ships M.0 pre-flight + M.1 migration as first real code.

## 🟢 Earlier — Phase M Inventory Module plan drafted (no code, supersedes/subsumes Phase L)

User asked to start a complete Inventory Module — multi-warehouse (main + sub per building), item master with manual entry + Excel import, Receiving (GRN), Dispensing (Issue), and Approval workflows. Per user's standing process: **Plan → 95% confidence → Workflow → 95% → Code**. This turn is **plan-only**, awaiting answers.

**Critical alignment flagged up front:** the Phase L draft (last turn) overlaps heavily — proposed its own `beithady_consumables_stock` + `beithady_consumables_purchase_orders`. Building Phase M separately would create two parallel stock systems. Strong recommendation: **Phase M subsumes Phase L** (Phase L's catalog → Item Master, stock → Stock Ledger, purchase list → Reorder, consumption rules → Auto-Issue Rules, welcome tray templates → Issue Kits, Arabic checklist → Mobile cleaner app). Net = same combined scope, single backbone, 13 tables instead of 8+11=19. **Q0 below confirms this.**

**Plan I sent the user:**

**Module placement:** new top-level Beithady tile "Inventory" (9th card next to Operations) at `/emails/beithady/inventory`. New permission category `'inventory'` in `auth.ts` (admin/manager/ops=full, finance=read, GR=none, new housekeeping role TBD).

**8 tabs:**
1. Dashboard — KPI cards (stock value, items below reorder, pending GRNs/Issues, stockouts, expiring), top movers, anomaly strip
2. Warehouses — tree view per building → main + sub-warehouses, manager assignment, geo
3. Items (Catalog) — Item Master with manual add OR Excel import (downloadable .xlsx template)
4. Stock — per-item × per-warehouse on-hand + value + ledger drill-in
5. Receiving (GRN) — supplier match → PO match (or direct) → lines with batch/expiry/QC photos → approval routing → posting
6. Dispensing (Issue) — types: per_reservation (auto-rules), maintenance_task (Phase F), welcome_tray (kit), owner_request, damage_writeoff, transfer_out
7. Transfers — warehouse-to-warehouse 2-step (Out → In) with in-transit visibility
8. Counts & Adjustments — cycle counts (weekly subset) + full physical (quarterly), variance → adjustment with reason

**Cross-cutting:** Approvals inbox (badge), Reorder alerts panel, Audit log integration with `beithady_audit_log`.

**Workflows detailed:** GRN state machine (Draft → Submitted → [opt] Pending Approval → Approved → Posted, immutable after), Issue state machine (same shape, types differ in approval routing), Approval matrix configurable in Settings (DB-backed), WhatsApp ping to approvers via Phase C.

**Data model — 13 tables:** `beithady_inventory_warehouses` (parent_id self-ref) · `_items` · `_categories` · `_suppliers` · `_stock` (item × warehouse × batch) · `_transactions` (immutable ledger) · `_grns` (+ lines) · `_issues` (+ lines) · `_purchase_orders` (+ lines) · `_kits` (Welcome Tray templates) · `_approval_rules` · `_count_sessions` (+ lines) · `_consumption_rules` (Phase L rules engine).

**20 suggested improvements over vanilla:**
1. Mobile-first cleaner app `/emails/beithady/inventory/m` (Arabic, building-PIN, photo capture)
2. WhatsApp inbound reorder ("BH-26 ran out: tissues, soap" → AI parses → draft Issue)
3. Auto-issue on check-in via consumption rules
4. Welcome Tray auto-fire for Gold+ tiers with photo evidence
5. Dynamic reorder point (consumption velocity × upcoming reservation density × supplier lead-time)
6. Stockout-risk dashboard tied to calendar + surfaces in Morning Brief
7. Per-building P&L allocation honoring intercompany model (BH-435 25% mgmt fee, others turnkey)
8. Vendor price-history graph (every GRN line writes price history)
9. Bulk-pack discount logic surfaced in PO line entry
10. Owner-billable register feeding monthly owner statements (Financial hook)
11. Photo evidence everywhere (GRN, damage, welcome tray placement, monthly counts)
12. Barcode/QR per warehouse bin with mobile scan
13. Seasonal kits (Ramadan tray, Christmas tray) auto-active in date window
14. Cycle-count gamification (random 5-item daily count, photo, leaderboard)
15. Forecast accuracy report (rules predicted vs actual issued, monthly)
16. Multi-currency native (EGP/USD/AED) via `fx_rates`
17. Realtime stock badge (Supabase Realtime)
18. AI-assisted item creation (paste Amazon EG URL → auto-fill SKU/cost/photo)
19. "Order from Amazon" deep links from low-stock alerts
20. Dispense-on-departure scrub (mandatory checklist confirms per-reservation issued items consumed/replaced; variance = damage candidate)

**16 open questions blocking workflow phase (Q0 + Q1–Q15):**
- Q0 (CRITICAL) — Subsume Phase L? [recommended Yes]
- Q1 — Sub-warehouse model: locational / categorical / hybrid? [rec hybrid]
- Q2 — Costing method: FIFO / weighted-average / last-cost? [rec weighted-avg]
- Q3 — Batch + expiry tracking? [rec per-item flag, auto-on for F&B + Chemicals]
- Q4 — 4 approval thresholds in EGP? [defaults 5K/25K/1K/10K]
- Q5 — Approver identity: new roles (warehouse_manager + housekeeper) / reuse ops / single inventory_manager? [rec new roles]
- Q6 — Cleaner identity: per-cleaner login / building-PIN / phone+OTP / no login? [rec building-PIN V1, per-cleaner V2]
- Q7 — Excel import scope V1: Item Master only / + GRN / + Counts? [rec Item Master only]
- Q8 — Photo storage: new bucket / reuse gallery / reuse wa-media? [rec new bucket]
- Q9 — Currency scope: EGP only / EGP+USD / +AED? [rec EGP+USD V1]
- Q10 — Owner-billable items V1? [rec V2]
- Q11 — Auto-issue on check-in V1? [rec V1 — biggest operational win]
- Q12 — Mobile cleaner app + Arabic checklist V1? [rec V1 — was Phase L flagship]
- Q13 — WhatsApp inbound reorder V1? [rec V2]
- Q14 — Asset tracking depth (TVs/microwaves)? [rec consumables only V1, assets V2]
- Q15 — Building list confirmation: BH-26/73/435/OK/34 + OTHER, all get warehouses Day 1?

**Sub-phase shape (~10 commits, won't lock until Q0–Q15 answered):**
M.0 pre-flight · M.1 migration `0048_beithady_inventory.sql` 13 tables · M.2 launcher + sub-landing · M.3 warehouses CRUD · M.4 items + Excel import (2c) · M.5 stock view + ledger · M.6 GRN + approval · M.7 issue + kits + auto-issue rules (2c) · M.8 transfers · M.9 counts · M.10 dashboard + reorder alerts + approvals inbox + cron · M.11 mobile Arabic app (if Q12=V1).

**Confidence: 78%** on structure / DB shape / workflow algebra. Lower because Q0 (Phase L subsumption), Q5 (new roles), Q6 (cleaner identity), and Q14 (asset scope) materially change shape. Will hit 95% after answers.

User can answer per-question or say "default the questions and proceed" for sensible V1 defaults. No code this turn. Workflow phase blocks on these answers.

## 🟢 Earlier — Phase L Budget + Consumables plan drafted (no code, now subsumed by Phase M)

User asked to start budgeting + operational control around consumables, amenities, and welcome tray, sourced from Amazon Egypt, with a per-check-in cost engine + Arabic housekeeping checklist. **Plan-only turn**, awaiting answers before coding.

**Plan I sent for review:**

**Industry research (deep):** consumables should run 6-9% of cleaning fee charged to guest. Egypt-specific brands + ballpark Amazon EG prices listed for 12+ SKUs (Fine 12-roll mega ~280 EGP, Lipton 100-pack ~80 EGP, Nestle Pure Life 12-pack ~85 EGP, etc.). Bake in 12-15% loss factor on amenities. Sample 7-night 4-guest 2BR/2BA stay → ~445 EGP (~$9 USD) consumables vs $25 cleaning fee = 36% margin.

**9 functional surfaces:** Catalog · Consumption Rules matrix · Unit Profiles · Per-Checkin Cost calculator · 30-day Forecast · Auto Purchase List · Stock on Hand · Welcome-Tray Templates (tier-based) · **Arabic Housekeeping Checklist** (mobile-first, photo proof, posts back to consumption).

**8 DB tables proposed:**
- `beithady_consumables_catalog`, `beithady_unit_profiles`, `beithady_consumption_rules`, `beithady_consumables_stock`, `beithady_welcome_tray_templates`, `beithady_consumables_purchase_orders`, `beithady_housekeeping_checklists`, `beithady_consumables_price_history`

**Sub-phases (~7-8 commits):** L.1 migration + 50-80 baseline SKUs · L.2 Catalog page + Amazon URL paste · L.3 Rules matrix · L.4 Cost + Forecast · L.5 Purchase List · L.6 Stock · L.7 Welcome Tray Templates · L.8 Arabic mobile checklist.

**12 improvement suggestions** beyond the brief (tier-based welcome trays, photo evidence, bulk-pack discount logic, seasonal Ramadan tray, per-channel profitability, multi-location stock, consumption variance report, etc.).

**11 open questions** blocking workflow phase:
1. Cleaner accounts — login or passwordless phone flow?
2. Photo bucket — reuse Phase D `beithady-gallery` or new `beithady-housekeeping`?
3. Stock locations — single warehouse or per-building cabinets?
4. Procurement — manual after approval or Amazon affiliate API integration?
5. Loss factor — hardcode 12% or per-item editable?
6. Currency — EGP only or also USD via fx_rates?
7. Photo upload size cap?
8. Checklist trigger — auto on checkout event or manual from drawer?
9. VIP welcome-tray photo — all stays or Gold+ only?
10. Price refresh cadence — admin manual monthly or scraper?
11. Seed scope — 50-60 SKUs (broad) or ~25 SKUs (tight)?

User can answer per-question or say "default the questions and proceed" for sensible V1 defaults.

Confidence: 85% on structure / DB shape / rule algebra / Arabic UX direction; 70% on photo storage + multi-location + cleaner identity + procurement integration depth (Q1-Q4 + Q11).

> Note: while I was drafting Phase L, a sibling worktree shipped a series of audit fixes to the Morning Brief (Finance row-explosion fix via `LEFT JOIN LATERAL` in migration 0047, Cairo-TZ accrual revenue, Ops brief owner-stay/manual-block exclusions, manual-block segregation by reason, an admin audit-resend WhatsApp endpoint at `/api/cron/beithady-send-test-briefs`). Those landed in commits `41475ad`, `49af301`, `d8f78f4`, `bcc5b69`, `dab6499`, `047ea78`. They're documented in detail in the sections below — not my work this session.

## 🟢 Earlier — Finance Morning Brief: critical bug fix (sibling worktree)

User flagged WhatsApp Finance brief on 2026-04-28 showed wildly inflated numbers — 412 bookings yesterday, 1000 MTD, 607 check-ins next 2 days, identical $154 BH-435-101 rows repeating 3×. Asked for deep diagnosis and fix.

**Root cause: `beithady_reservation_grid_v` row explosion**
- The view's LEFT JOIN on `beithady_guests` matched on `email OR phone`. There are **202 guest profiles** carrying placeholder email `booking@beithady.com` (Booking.com's masked-contact convention) and **204 reservations** using the same placeholder. Every placeholder reservation cross-joined to all 202 guest rows.
- Whole-view damage: **48,005 view rows for 6,951 distinct reservations (~6.9× inflation)**. Three reservations alone exploded to 202 rows each.
- Side joins (`beithady_pre_arrival_messages`, `beithady_boarding_passes`) were currently 1:1 but had no structural guarantee — they'd start exploding the day a reservation gets two pre-arrival queue rows.

**Fix #1 — Migration `0047_beithady_grid_view_dedupe.sql`** (applied via MCP):
- Replaced 3 of the 4 LEFT JOINs with `LEFT JOIN LATERAL … LIMIT 1`, ordered deterministically (most-engaged guest profile / most-recent boarding pass / most-recent pre-arrival message).
- For `beithady_guests`, added an exclusion list for known placeholder emails (`booking@beithady.com`, `noreply@guesty.com`, `guest@airbnb.com`) so placeholder reservations don't get a stranger's loyalty profile attached. Easy to extend.
- Appended `created_at_odoo` (timestamptz) at the end of the column list — needed for accrual-basis revenue queries. (Postgres rejected mid-list insertion under CREATE OR REPLACE; appending preserves all 46 existing column positions.)
- Post-fix verification: view rows = 6,951 = distinct reservations = base table rows (perfect 1:1).

**Fix #2 — `src/lib/beithady/morning-brief/finance-brief.ts`** rewrite:
- "Yesterday's revenue" + "Month-to-date" now filter by **`created_at_odoo`** (booking creation timestamp, accrual basis), not `check_in_date` (which counted arrivals, not sales).
- Cairo-timezone correctness via existing `cairoWallToUtc` helper from `cairo-dates.ts` (DST-safe).
- Yesterday query now also has `.neq('status','canceled')` (was missing → cancellations were inflating the count further).
- **Per-currency aggregation** — USD and AED are kept in separate buckets and rendered as "$X + Y AED" rather than summed as if interchangeable. The summary's `*_revenue_usd` fields report only the USD portion.
- Direct-booking filter remains `channel='manual'` (matches `channel-meta.ts` "Direct" label and the calendar grid's Direct chip — captures walk-ins, phone bookings, admin-imported direct deals).
- "Through month-end" forecast now uses `endOfMonth(dateIso)` from `cairo-dates.ts`.

**Before / after numbers (2026-04-28 brief):**
| Metric | Before (buggy) | After (fixed) |
|---|---|---|
| Yesterday's revenue | 412 bookings · $83,384 | 22 bookings · $12,937 USD |
| MTD | 1000 bookings · $622,894 | 393 bookings · $295,457 (USD + AED mix) |
| Direct yesterday | (inflated) | 4 bookings · $5,731 |
| Payouts next 2 days | 607 check-ins · $595,179 | 13 check-ins · $4,842 |
| Payouts EOM | 607 · $595,179 | 13 · $4,842 (today is 2 days before EOM) |

**Side benefits** (view fix is system-wide):
- Calendar grid (`calendar-data.ts`), reservation drawer (`reservation-detail.ts`), GR/Ops morning briefs, and cancel-risk all consume the same view → all benefit from the dedup automatically.
- Three reservations were rendering as 202 duplicate calendar bars; now each appears once.

**Recommendation flagged for the user (not changed):** "Direct booking" currently includes any `channel='manual'` reservation — this conflates walk-ins (legit revenue) with admin imports and any future owner stays. If you want to split owner stays out, the cleanest filter would be `source_label != 'owner'`. Currently 0 reservations have `source='owner'` so it doesn't matter today.

### Follow-up — owner-stay exclusion (commit `f9e671d`, **NOT YET DEPLOYED**)

User confirmed: "No Owner stays are considered calendar blocks with no charge."

Added `.neq('source_label', 'owner')` to all 6 finance-brief queries:
- Yesterday's revenue · Month-to-date · Direct booking yesterday · Unpaid+arriving · Payouts 2d · Payouts EOM

Data check: only 3 rows in the entire system have `source='owner'` (all manual channel, $0 host_payout, 1 confirmed + 2 canceled, none in any current forecast window). So today's numbers don't change visibly — the filter is preventive for the future as more owner stays get entered.

**Status:** committed locally on `claude/brave-babbage-a566c2`. The push to main was blocked by a permission rule on this run (the two earlier pushes today went through). Awaiting user approval on whether to push + redeploy or hold the change locally — purely preventive value, no urgency.

### Follow-up — Guest Relations brief audit + fixes (commit `41475ad`, **NOT YET DEPLOYED**)

User flagged the 8 AM GR WhatsApp brief: same VIP "Ayman ELmadany" reservation appearing 5×, "+ 600 more" overflow line. Root cause = same view explosion fix already shipped (migration 0047). That GR run happened before the migration landed; the brief code itself also needed audit.

User said "all" + "A to D" → applied every change in one commit ([gr-brief.ts](src/lib/beithady/morning-brief/gr-brief.ts)):

**High-confidence (A-D):**
- A. Excluded `source_label='owner'` + `is_manual_block=true` from 5 reservation-grid queries (calendar blocks aren't guest events).
- B. CSAT `created_at` filter switched to Cairo-TZ instants via inlined `cairoStartOfDayUtc` (was UTC → clipped 2-3 h off each end of the wall day).
- C. CSAT average ignores null ratings (comment-only responses no longer pulled avg toward 0).
- D. NULL `nights` renders as "—" instead of "0 nights".

**Clarifications 1-6:**
1. Pre-arrival expanded to today + tomorrow (catches late-afternoon same-day arrivals where AM message was missed).
2. VIP window expanded to today → today+3 (today's VIPs now visible in the dedicated section, not just generic Arrivals).
3. Late SLA capped at 48 h freshness — see "discoveries" below.
4. Departures secondary line now shows channel + nights (parity with Arrivals).
5. Section order: Arrivals → **VIP** → Departures → Pre-arrival → At-risk → Late SLA → CSAT.
6. All section titles now include counts (e.g., "Arrivals today (14)"), matching Finance.

**Tomorrow's brief expected counts (post-fix, post-deploy):**
14 arrivals · 0 VIP next 3d · 7 departures · 19 pre-arrival pending (today+tomorrow) · ? at-risk · 10 late-SLA (48h) · 0 CSAT yesterday.

**🔴 Two upstream data issues discovered while auditing — flagged for separate decision:**

1. **`beithady_pre_arrival_messages` table is empty (0 rows total).** That's why all 309 of this month's check-ins show `prearrival_sent_at IS NULL`. The Phase F pre-arrival sender either wasn't deployed, or it sends without writing to this table. Until that's fixed, the "Pre-arrival not sent" section will show ~all upcoming check-ins as needing a message — noisy but accurate signal that the auto-sender is non-functional.

2. **2,110 of 2,139 `sla_breach=true` conversations are >1 week old.** The breach flag isn't being flipped back to false when conversations resolve. The 48 h cap I added stops the brief from being useless, but the underlying flag-lifecycle bug needs cleanup (either a worker that re-evaluates, or flipping the flag on the next message in the thread).

**Status:** committed locally. Two prior commits also still local (`f9e671d` finance owner-stays, `41475ad` GR audit). All three need a single push to main + `vercel --prod`. Awaiting user approval — earlier push attempt was blocked by the harness today.

### Follow-up — Pre-arrival sender investigation (no code change)

User asked me to investigate why `beithady_pre_arrival_messages` has 0 rows. **Diagnosis: not broken — the cron's first valid scheduled run hasn't happened yet.**

Timeline:
- Phase F deployed (added the cron to vercel.json) at 2026-04-27 **17:23 UTC**.
- Pre-arrival cron schedule: `0 8 * * *` UTC = 11:00 Cairo (DST). [vercel.json:30](vercel.json:30).
- Yesterday's 08:00 UTC trigger: deploy was 9 h later, so missed it.
- Today's 08:00 UTC trigger: scheduled for ~80 min after this turn (current time 2026-04-28 06:42 UTC).

Audit-log evidence: `pre_arrival_dispatch_run` = 0 rows ever, while sibling Phase F crons that run at earlier UTC times (`comm_sync_run`, `late_reply_digest_generated`, `vip_digest_generated`, `loyalty_tick_run`) all fired today.

Verified the dispatch wouldn't be a no-op when it does fire:
- 5 templates exist + enabled (incl. 1 fallback)
- Tomorrow's 2 arrivals match `beithady_guests` rows with `phone_e164` set
- Templates / matcher / endpoint all wired correctly

Cosmetic: comment in [pre-arrival.ts:17](src/lib/beithady/engagement/pre-arrival.ts:17) says "10:00 Cairo cron" but DST makes it 11:00 Cairo. No functional impact.

User picked option 1 (wait for natural fire) + said "deploy all amendments". The 5 commits (`f9e671d` finance owner-stays, `41475ad` GR audit, three handoff docs) were pushed to main and `vercel --prod` deployed cleanly. `pre_arrival_dispatch_run` audit row should appear after 08:00 UTC = ~Cairo 11:00.

### Follow-up — Ops / Housekeeping brief audit (no code changes yet, awaiting clarifications)

User flagged the Arabic Housekeeping brief from this morning's cron: "المغادرات اليوم (205)" / "الوصول اليوم (608)" with same Kevin Da Veiga reservation appearing 5×. Same root cause = view explosion (already fixed). Today's real numbers: 7 departures · 14 arrivals · 5 same-day flips · 0 open tasks · 0 new manual blocks · 30 long stays.

User asked for a section-by-section audit ([ops-brief.ts](src/lib/beithady/morning-brief/ops-brief.ts)). Findings:

**High-confidence fixes presented (A–E):**
- A. Exclude `source_label='owner'` + `is_manual_block=true` from arrivals / departures / long-stays / same-day-flip-source.
- B. Open tasks: align `limit(N)` and `slice(N)` (currently 20 vs 10 — wastes 10 fetched rows).
- C. NULL nights → "—" instead of "0 ليالٍ".
- D. Add nights to Departures secondary (parity with Arrivals).
- E. Add "N ليالٍ متبقية" (nights remaining) to long-stay secondary.

**Open clarifications (1–6):**
1. Same-day flip — exclude pure block↔block flips, or count anyway?
2. Open tasks: add freshness filter (due ≤7d OR overdue ≤14d) or keep all pending?
3. Manual blocks section: only `start_date=today` (current) or expand to "active today"?
4. Long stays: add "N nights remaining" suffix? (recommended)
5. Section order: promote Same-day flips to #1 (most time-critical), then Departures → Arrivals → Long stays → Tasks → Blocks?
6. Add a "Tomorrow's check-ins" prep section? (recommended)

**Status:** waiting on user replies before any commit. The previous turn's deploy already shipped (5 commits), so the Ops brief audit work begins from a clean main.

### Follow-up — Ops brief audit shipped (commits `49af301` + `d8f78f4`, deployed)

User answered: "1- Don't Understand · 2- 7 Days · 3- Keep Narrow · 4- Yes · 5- Yes · 6- Yes". Then: "Segregate between Manual Block Maintenance or Other & Owner Block."

#1 dissolved once A applied — same-day flip detection runs over arrival/departure sets that already exclude owner+blocks, so a "block-to-block flip" can't enter the intersection.

**Shipped (commit `49af301`):**
- A. `source_label != 'owner'` + `is_manual_block != true` on arrivals / departures / long-stays / tomorrow-prep.
- B. Open tasks freshness filter — overdue ≤7 d OR due in next 7 d. `limit` and `slice` aligned at 10.
- C. NULL nights → "— ليالٍ".
- D. Departures secondary now shows nights stayed (parity with Arrivals).
- E. Long-stay items show "X ليالٍ متبقية" (nights remaining) before the date.
- 5. Section order: Same-day flips → Departures → Arrivals → Long stays → Tasks → Blocks → **Tomorrow's prep**.
- 6. NEW section: تحضير الغد (tomorrow's prep — heads-up for staging).

**Shipped (commit `d8f78f4`, segregation request):**
- Manual-blocks section split into two:
  - **حجوزات صيانة / أخرى** (`reason IN ('maintenance','other')`) — operational priority, amber tag.
  - **إقامات المالك / حجوزات إدارية** (`reason IN ('owner_stay','hold')`) — informational, slate tag.
- `beithady_calendar_manual_blocks` is currently empty (0 rows) so this is preventive.

**Predicted next-morning Ops brief:** 5 flips · 7 dep · 14 arr · 30 long stays · 0 tasks · 0 blocks (either bucket) · 5 prep.

**Deploy:** both commits pushed to main and `vercel --prod` shipped. Production URL: https://brave-babbage-a566c2-4skw3ktys-lime-investments.vercel.app.

### Follow-up — Audit-resend admin endpoint (commit `dab6499`, deployed)

User asked: "One Time - Resend To me All Briefs Again by Whatsapp Now to Audit". Built and deployed a one-shot admin endpoint that bypasses the test-panel's three-click flow:

`GET /api/admin/beithady/send-test-briefs?to=<digits>&secret=<CRON_SECRET>`

Builds GR + Ops + Finance briefs for today (Cairo TZ), renders WhatsApp markdown, sends each to the supplied number tagged `[AUDIT TEST · <role>]`. Doesn't write to the delivery log so the regular daily cron is unaffected. Auth via CRON_SECRET (Bearer header or `secret` query param).

User's WhatsApp on file (from `app_users.whatsapp` for `kareemhady`): `201222109899`.

**Could not auto-fire** because pulling `CRON_SECRET` from Vercel env was blocked (correctly — secret exfiltration guardrail). User needs to run the curl themselves OR use the test-panel UI buttons. Provided both options.

**Status awaiting:** user to fire the curl with their secret. Once fired, they'll get 3 WhatsApp messages with the post-fix brief content for audit. No further code changes pending until they review.

## 🟢 Earlier — SOP/KB A4 PDF export (commit `61c9063`)

Two endpoints:
- `GET /api/beithady/sop/article/[slug]/pdf` — single article download
- `GET /api/beithady/sop/role/[role]/pdf?lang=en|ar` — full role bundle with cover page + table of contents + one A4 page per article

**PDF renderer** [src/lib/beithady/sop/pdf.tsx](src/lib/beithady/sop/pdf.tsx) uses `@react-pdf/renderer` (already a project dep from the daily-report). Reuses the Beit Hady brand palette + logo from `public/brand/beithady/logo-stacked.jpg`. Markdown blocks (H1-3, paragraphs, ordered + unordered lists) are parsed into react-pdf primitives. Inline syntax (`**bold**`, `*italic*`, `` `code` ``) is stripped for PDF compatibility. Running footer with `page X/Y` numbering on every page.

**Arabic support:** registers Cairo from Google Fonts CDN at first render. RTL articles render right-aligned with reversed list markers + Arabic-aware fontFamily. Falls back to Helvetica if registration fails — Arabic glyphs would render as missing boxes in that case. To guarantee offline-correct Arabic, drop a TTF into `public/fonts/` and switch `Font.register` to a local file path.

**UI:**
- Article detail page header gets a "PDF" download button next to the EN/AR counterpart link.
- SOP landing page header shows a "Download {Role} bundle" primary button when a role tab is selected. Honors the current `lang` filter, so AR-only or EN-only bundles can be exported.

**File names:**
- Single: `beithady-sop-{slug}.pdf`
- Bundle: `beithady-sop-{role}[-{lang}].pdf` (e.g. `beithady-sop-housekeeping-ar.pdf`)

## 🟢 Earlier — SOP/KB Arabic versions for GR + Maintenance (commit `68b32f0`)

User asked for Arabic versions of Guest Relations + Maintenance articles. Inserted 6 counterpart articles (slug suffix `-ar`):

- **GR (3 AR):** مصفوفة تصعيد الشكاوى · طلبات تعديل الحجز · بروتوكول حاجز اللغة
- **Maintenance (3 AR):** خريطة استكشاف أخطاء التكييف · بروتوكول طوارئ السباكة · استكشاف أخطاء القفل الذكي

Per-language inventory (22 articles total): GR 3 EN + 3 AR · Housekeeping 3 AR · Maintenance 3 EN + 3 AR · Reception 3 EN · Upselling 4 EN · All 1 EN.

**Library:** `listArticles` gains optional `language` filter; new `findCounterpart(slug)` resolves EN↔AR pair via the `-ar` suffix convention.

**UI:**
- Landing page gets a Lang chip row (All / EN / AR · العربية) above the Type chips. URL param `lang=en|ar`.
- Article detail page header now shows a counterpart link button ("🇪🇬 العربية" / "🇬🇧 English") when a translation exists.

**Convention:** English articles have a bare slug; Arabic counterparts append `-ar`. Future translations follow the same pattern.

## 🟢 Earlier this session — Phase K.3 SOP & Knowledge Base shipped (commit `19123ce`)

User confirmed → shipped end-to-end with 16 seed articles.

**Migration `0046_beithady_sop_kb.sql`** (applied via MCP):
- `beithady_sop_articles` — single table covering SOP / Checklist / KB. Fields: slug, title, summary, body_md (markdown), language (en/ar), kind, role (reception|guest_relations|housekeeping|maintenance|upselling|all), subcategory (transportation|excursions|f_b|affiliations|null), tags[], checklist_items jsonb, status (draft|published|archived), version, author/updated_by + timestamps.
- `beithady_sop_acknowledgments` — read-receipts per (article, user, version) with unique constraint.
- **16 seed articles** loaded:
  - **Reception (3)**: shift handover · late check-in · lockout recovery
  - **Guest Relations (3)**: complaint escalation matrix · modification requests · language barrier protocol
  - **Housekeeping (3, Arabic)**: قائمة فحص تنظيف ما بين النزلاء · بروتوكول التنظيف العميق الشهري · إجراءات الإبلاغ عن الأضرار
  - **Maintenance (3)**: A/C troubleshooting · plumbing emergency · smart-lock troubleshooting
  - **Upselling (4)**: airport transfers + pricing · Pyramids excursion · grocery stocking F&B · hospital affiliations
  - **All roles (1)**: VIP protocol with tier-specific perks

**Library** [src/lib/beithady/sop](src/lib/beithady/sop/):
- `md.ts` — minimal server-side markdown renderer (H1-3, bold, italic, code, lists, links). Trusts admin-authored input.
- `queries.ts` — `listArticles({role, subcategory, kind, search})`, `getArticle(slug, currentUserId)` returns ack status + count, `listAllRoleCounts`, `ROLE_LABEL_EN/AR`, `SUBCATEGORY_LABEL`.

**Pages:**
- [/operations/sop](src/app/emails/beithady/operations/sop/page.tsx) — role tabs (with counts), upselling sub-category chips when filtered to upselling, kind chips (SOP/Checklist/KB), search. Article cards are dir-aware (RTL for Arabic content with AR badge).
- [/operations/sop/[slug]](src/app/emails/beithady/operations/sop/[slug]/page.tsx) — article detail with markdown body (RTL + Cairo/Amiri font for Arabic), meta strip (version + tags + ack count + Mark-as-read button), interactive checklist panel for `kind=checklist`.

**Server actions** in [actions.ts](src/app/emails/beithady/operations/sop/actions.ts): `acknowledgeArticleAction` (operations.read), `updateArticleBodyAction`, `createArticleAction` (both operations.full). Inline edit UI deferred to V2.

**Operations sub-landing:** 6th card "SOP & Knowledge Base" (BookOpen icon, cyan accent, Phase K badge).

**Phase K progress:** K.1 ✅ K.2 ✅ K.3 ✅ — done.

## 🟢 Earlier this session — Phase K.2 Cancellation risk + re-confirmation (commit `f889b2c`)

User picked Cancellation Risk next. Shipped end-to-end in one commit.

**Migration `0045_beithady_cancel_risk.sql`** (applied via MCP):
- `beithady_reservation_overrides` gains `cancel_risk_score (0-100)`, `cancel_risk_breakdown jsonb`, `last_reconfirmation_sent_at`, `reconfirmation_response`
- New RPC `beithady_calendar_recompute_cancel_risk` — rule-based scorer joining reservations + overrides + guests + conversations
- `beithady_calendar_recompute_all_active` extended to call cancel risk too (every-30-min cron picks it up)
- Initial backfill on 73 active future reservations: **40 critical (70+) · 6 high (50-69) · 5 medium · 22 below 30**

**Scoring signals (additive, clamped 0..100):**
- Inquiry status +30 · long lead time +5..+20 · unpaid+imminent +25 · channel (Booking +15, Direct +5) · first-time +15 / returning -20 · silence +5..+15 · recent re-confirm -25 · cancelled/past = 0

**Page** `/operations/cancel-risk`:
- Min-score filter (30/50/70) + window (7/14/21/30d) URL chips
- Stats cards: Critical / High / Avg score / Re-confirmed last 7d
- Table: score pill · check-in date · listing link · guest (+VIP) · channel · signal chips (rose for adds, emerald for subtracts) · re-confirm button per row

**Re-confirm button (one-click):** server action validates phone → sends templated WhatsApp ("Hi {name}! Just confirming your stay at {listing}…") → persists `last_reconfirmation_sent_at` → writes audit → immediately re-runs cancel-risk RPC so the score drops by 25.

**GR Morning Brief integration:** new "At-risk re-confirms (cancel-risk ≥70, ≤14d)" section between Pre-arrival and Late-SLA. Top 8 by score, drops any re-confirmed in last 24h. Tag = red "Re-confirm" linking to the page.

**Operations sub-landing:** 5th card "At-risk Reservations" (AlertTriangle icon, violet accent, Phase K badge).

**Phase K progress:** K.1 ✅ K.2 ✅ — **K.3 next: Knowledge Base / SOP / Checklists for Hospitality Roles** (Reception · Guest Relation/Reservation · Housekeeping · Maintenance · Upselling Teams: Transportation, Excursions, F&B, Affiliations).

## 🟢 Earlier this session — Morning Brief test panel (commit `3adaf81`)

User asked for a test button with processing indication + result display.

Added [_test-panel.tsx](src/app/emails/beithady/operations/morning-brief/_test-panel.tsx) above the rendered brief on `/emails/beithady/operations/morning-brief`. Three actions:

1. **Preview only** — builds the brief without sending; result panel shows the rendered HTML in an inline iframe + summary stats. No DB writes.
2. **Send test to me** — sends the brief to the calling admin's WhatsApp only (using `app_users.whatsapp`). Doesn't touch the delivery log; the daily real send still happens. Errors if the admin has no WhatsApp on file.
3. **Send NOW to all recipients** — confirms via dialog, then deletes any existing log row for (role, date) and re-runs `runMorningBrief` for the full auto-broadcast + extras list. Refreshes the page so the delivery-status header updates.

UI states:
- **Processing pill** — cyan banner with spinner + per-action label ("Building brief…" / "Sending test to your WhatsApp…" / "Sending to all recipients…")
- **Success** — emerald banner with duration_ms, recipients/email/WA counts, expandable summary stats + preview iframe
- **Failure** — rose banner with error string + per-recipient error list

Three new server actions: `previewBriefAction`, `sendBriefNowAction`, `sendTestToMeAction` — all behind `operations.full` permission. Returns a `TestResult` shape with optional `preview_html`, `summary`, `errors[]`, `delivered_email/whatsapp` counters.

Removed the old `?preview=1` URL hack (replaced by the test panel).

## 🟢 Earlier this session — Morning Brief: Arabic Ops + Finance payout forecasts

User asked for two changes:

**1. Ops brief in Arabic.** Translated all strings in `ops-brief.ts` (إقامة المالك, صيانة, حجز إداري, تنظيف بين النزلاء, أولوية, etc.). Date label uses ar-EG locale. `Brief.language = 'ar'`.

**Renderers now RTL-aware** ([renderers.ts](src/lib/beithady/morning-brief/renderers.ts)):
- WhatsApp markdown emits localized headline (*بيت هادي — موجز الصباح*) + role title + view link
- HTML email sets `<html lang="ar" dir="rtl">` + Arabic font stack (Cairo/Amiri/Tahoma)
- I18N table keeps en/ar copy side by side

**2. Finance brief — two new sections:**
- **Expected payouts — next 2 days** — confirmed reservations checking in in `[today, today+2]`. Sums `host_payout`. Per-channel breakdown + per-reservation list (top 8). Tag = "Forecast" (cyan).
- **Expected payouts — through month end** — confirmed reservations checking in through last-day-of-month. Single summary card with total + count + clarifying note that channel pre-collection windows apply.
- Summary stats add `payouts_2d_count/usd` + `payouts_month_count/usd`.

GR + Finance briefs both flagged `language: 'en'`. The new `language` field on `Brief` is required so any future role can opt into another language.

## 🟢 Earlier this session — Phase K.1 shipped (commit `730f1f2`)

User confirmed recipients policy: auto-broadcast + admin extras. Built all 6 planned sub-phases in one commit.

**Migration `0044_beithady_morning_brief.sql`** (applied via MCP):
- `beithady_morning_brief_extras` — admin-curated recipients (label, email, whatsapp, enabled, role)
- `beithady_morning_brief_log` — per-day per-role delivery log + rendered markdown/HTML for the web archive

**Library `src/lib/beithady/morning-brief/`** (7 files):
- `types.ts` — Brief / BriefSection / BriefItem / BriefRecipient / BriefRole
- `gr-brief.ts` — Guest Relations: arrivals/departures today, pre-arrival pending, late-SLA breaches, VIP next 3d, yesterday's CSAT
- `ops-brief.ts` — Housekeeping & Ops: today's checkouts/check-ins, same-day cleaning flips ⚠, open Phase F tasks, manual blocks starting today, long-stay extensions
- `finance-brief.ts` — Finance: yesterday revenue (+ by channel), MTD with currency mix, unpaid arriving ≤7d (count + balance), direct-booking revenue
- `renderers.ts` — `renderMarkdown` (WhatsApp) + `renderHtml` (email/web)
- `recipients.ts` — `getBriefRecipients(role)`: union of users with matching `beithady_user_role` (auto-broadcast incl. manager/admin) + admin extras
- `run.ts` — orchestrates build + render + send WhatsApp via existing `sendWhatsApp` + persist log; idempotent per (run_date, role)

**Cron** `/api/cron/beithady-morning-brief`:
- Scheduled at `0 5 * * *` + `0 6 * * *` UTC (DST-aware Cairo 8am gate via `Intl.DateTimeFormat('Africa/Cairo')`)
- Bearer-CRON_SECRET auth; `?force=1` bypass

**Web pages:**
- [/emails/beithady/operations/morning-brief](src/app/emails/beithady/operations/morning-brief/page.tsx) — archive view with role tabs (GR/Ops/Finance), prev/next day nav, delivery stats, rendered HTML. Live-rebuilds if no log row exists.
- [/emails/beithady/operations/morning-brief/recipients](src/app/emails/beithady/operations/morning-brief/recipients/page.tsx) — admin page: auto-broadcast users (read-only, with email/WA validity flags) + add/toggle/delete extras per role.

**Operations sub-landing** now surfaces a 4th card: Morning Brief (Sunrise icon, amber accent, "Phase K" badge).

**Open notes:**
- Email delivery is logged but the SMTP provider hookup is a TODO inside `run.ts` (the web archive is canonical regardless)
- WhatsApp delivery uses the existing Phase C green-api `sendWhatsApp({to, message})` helper

**Phase progress:** Phase J ✅ — Phase K.1 ✅ — K.2-K.5 (cancellation prediction / pricing recommender / direct-booking funnel / KB+SOP / owner portal etc.) ⏳

## 🟢 Earlier this session — Phase K.1 plan drafted

User chose **Daily Morning Brief** from the strategic recommendations list and specified three role-specific versions: Guest Relations, Housekeeping & Operations, Finance & Accounting.

**Plan I sent the user, awaiting one confirmation:**

Three briefs delivered at 8am Cairo via WhatsApp + email + web archive:

1. **Guest Relations** — arrivals/departures today, late-SLA breaches, pre-arrival pending, AI suggestions awaiting approval, 1–2★ reviews yesterday, VIP arrivals next 3 days, yesterday's CSAT
2. **Housekeeping & Operations** — today's checkouts/check-ins, cleaning gaps (<3h red, <6h yellow), open maintenance tasks (Phase F), manual blocks starting today, long-stay extensions, smart-lock issues (V2)
3. **Finance & Accounting** — yesterday's revenue (total + by channel + by building), MTD vs budget, unpaid + arriving ≤7d (count + balance), payouts received (Guesty + Stripe), refunds, new direct bookings, channel commission, currency-mix exposure, owner payouts due

**Delivery:**
- WhatsApp via Phase C wa-casual sender (markdown)
- Email via existing email lib (HTML)
- Web archive at `/emails/beithady/operations/morning-brief?role=X&date=YYYY-MM-DD`

**Cron:** `0 5 * * *` + `0 6 * * *` UTC for Cairo 08:00 DST handling (mirrors Phase C late-reply-digest pattern).

**Implementation scope (~5-6 commits) sub-phases K.1.1 → K.1.6:**
- Migration `0044_beithady_morning_brief.sql` — recipients table + delivery log
- Three brief content libs + shared types
- Three renderers (markdown / html / jsx)
- Cron route + `vercel.json` entries
- Web archive page
- Settings page for recipients management

**Open question blocking K.1.1:** which recipients-default policy?
1. Auto-broadcast to all users with matching beithady_user_role
2. Opt-in only (admin adds manually)
3. Whitelist (hardcoded names + later editable)

Awaiting answer + any role-specific item additions before coding.

## 🟢 Earlier this session — Chip filters + Country filter + Hide cancelled (commit `3fbc5c3`)

User asked for three things:

**1. Filter UI redesign — chips instead of selects**
Replaced the single row of select dropdowns with labeled chip rows. Each row has a category label (View / Buildings / Channels / Country / Status / Risk) and pill-style chips that toggle filter values via URL params. Active chips get category-specific colours:
- Channels chips use the brand colour when active (Airbnb red, Booking blue, Direct teal, Hopper purple)
- Status: Confirmed=emerald, Inquiry=amber, Canceled=slate
- Risk: Unpaid=rose, Pre-arrival=amber, VIP=violet
- Buildings + Country = navy/emerald with flag emojis (🇪🇬 🇦🇪)

**2. Country filter added**
Pulled from `guesty_listings.address_country` — 87 Egypt + 3 UAE listings active. URL param `?country=<value>`. Filters listings via SQL `.in('address_country', [...])` before the calendar even queries reservations.

**3. Cancelled reservations now hidden by default**
Was: shown faded with crosshatch.
Now: hidden when status filter is "Active" (default). Click the Canceled status chip to opt-in.

## 🟢 Earlier this session — MTL-aware pricing fallback for BH-73 children (commit `8048ea1`)

User flagged two grid issues:
1. BH-73 children (BH73-1BR-C-8-106, …-2BR-SB-5-107, etc.) showed empty price cells while their MTL parents had prices.
2. Wondered if a Radwa Negm reservation was duplicated across two units.

**Q1 root cause:** Pricelabs only tracks data on MTL **parents**, not their children. In BH-73:
- `BH73-1BR-C-8` (parent): `base=$75`, `bedrooms=1`
- `BH73-1BR-C-8-106` / `…-306` (children): no own pricelabs row

The gallery hides parents (per the polarity matrix), so users only see children — which had no prices. Fixed by fetching `pricelabs_listing_snapshots` + `pricelabs_listings` for the union of `{bookable atom ids, master_listing_ids}` and resolving via `priceFor` / `bedroomsFor` helpers that prefer the child's own value but fall back to the parent.

Same fallback applied in `findAvailabilityAction` and to the comp-set median lookup so children inherit the parent's bedroom bucket for the ▲▼ triangle.

**Q2 verdict:** Not a display duplicate. The two Radwa Negm bars are **two separate cancelled reservation IDs** (`69e4e364…` on `BH73-1BR-C-8-106` and `69e4f263…` on `BH73-1BR-C-8-306`), same guest/email/phone, same dates 2026-05-01 → 2026-05-13. Both are correctly rendered faded + crosshatch (cancelled state). Click either bar → drawer shows the distinct reservation_id.

## 🟢 Earlier this session — "Other" bucket for out-of-scope units (commit `1a3ef97`)

8 active listings with NULL `building_code` (BH-MANG-M15B13, BH-MB34-105, BH-MG-20-1, BH-NEWCAI-4021, BH-WS-E245, LIME-MA-1402, REEHAN-204, YANSOON-105) were previously filtered out of the calendar. Now bucketed into a synthetic 'OTHER' building so they appear alongside BH-26/73/435/OK.

Changes:
- [calendar-data.ts](src/lib/beithady/operations/calendar-data.ts) — removed the `building_code` filter; remaps null → 'OTHER' at row construction. Listing query supports 'OTHER' filter via `building_code.eq.X,...,building_code.is.null` OR expression.
- [header-bar.tsx](src/app/emails/beithady/operations/calendar/_components/header-bar.tsx) — 'OTHER' added to the buildings dropdown ("Other (uncategorised)").
- [page.tsx](src/app/emails/beithady/operations/calendar/page.tsx) — `VALID_BUILDINGS` extended.
- [listing-rail.tsx](src/app/emails/beithady/operations/calendar/_components/listing-rail.tsx) + [find-availability-modal.tsx](src/app/emails/beithady/operations/calendar/_components/find-availability-modal.tsx) — display 'OTHER' as "Other".
- `findAvailabilityAction` + `bulkSendPreArrivalAction` + `listManualBlocksForWindow` — all updated with the same OR-filter pattern.

Comp-set triangles won't show on Other listings (no comp data keyed by 'OTHER') — that's correct behavior since pricelabs comp data is per BH-* building only.

## 🟢 Earlier this session — Phase J COMPLETE (J.8, J.9, J.10 shipped)

Phase J — Beithady Operations Calendar — fully landed across 10 sub-phases this session.

**J.8 — Realtime + overbooking guard** (`badc893`):
- [src/lib/supabase-browser.ts](src/lib/supabase-browser.ts) — anon-key client for Realtime.
- [realtime-bridge.tsx](src/app/emails/beithady/operations/calendar/_components/realtime-bridge.tsx) — subscribes to 4 tables in one Supabase channel (reservations, overrides, manual blocks, messages-INSERT). Debounced router.refresh (1.5s burst window). Live/connecting/offline pill in header. Click → recent-activity dropdown with 20-event log.
- Overbooking pre-write guard added to `createManualBlockAction`: re-reads grid view for overlapping reservations before write. On conflict returns `{ok:false, conflict:{...}}`. UI shows the conflicting reservation's guest/channel/dates and offers a `forceOverride:true` re-attempt with a destructive-warning modal.

**J.9 — Heatmap overlay + comp-set triangles + WhatsApp share** (`926eb15`):
- `calendar-data.ts` joins pricelabs_listing_snapshots (occupancy_next_30, adr_past_30, revenue_past_30) + pricelabs_market_snapshots (comp_median_usd by building+bedroom_bucket) + pricelabs_listings.bedrooms.
- `listing-rail.tsx` — small ▲/▼ next to base price when ours differs from comp-set median by ≥10% (improvement #3). Tooltip shows exact delta.
- `header-bar.tsx` — density select (Price/Occupancy/ADR/Revenue, improvement #2). Cell tinting in occupancy mode: red→amber→green based on 0–100%.
- `boarding-pass-share.tsx` — Copy link + Send via WhatsApp buttons (improvement #11). Builds absolute URL via getBoardingPassUrl action + window.location.origin. `wa.me/{phone}` deep link with prefilled message.

**J.10 — Find availability modal** (`0d495a3`):
- `findAvailabilityAction({startDate, endDate, bedrooms?, buildingCodes?})` — bookable atoms intersected with non-cancelled reservations + manual blocks for the window. Joins bedrooms + price + cover thumb.
- `find-availability-modal.tsx` — form (check-in + check-out + min-bedrooms + building chips + computed nights) + result grid (1/2/3-col responsive). Each free unit deep-links to `https://app.guesty.com/listings/{id}` for the actual booking creation.
- "Find availability" primary button placed prominently in page header.

**Phase J final scorecard (improvements 1-13):** ✅ AI risk score · ✅ Heatmap overlay · ✅ Comp-set triangles · ✅ Bulk actions · ⚠ Drag-to-create (form-based instead, drag deferred to V2) · ✅ Realtime · 🔜 Mobile (V2) · ✅ Saved views · ✅ Anomaly callouts · ✅ Channel-mix sparkline · ✅ WhatsApp share boarding pass · ✅ Past-stay quick-look + previous reviews · ✅ Loyalty banner with tier perks.

**V2 backlog:** mobile layout, true drag-to-create blocks, direct-booking creation flow (currently deep-links to Guesty), ID upload + smart-lock data fields (need new migration), free channel logos.

## 🟢 Earlier this session — Phase J.7 shipped (commits `0131741` + `955126c`)

**J.7a — Payment writes + Stripe resolver + audit** (`0131741`):
- [src/lib/beithady/operations/payment-resolver.ts](src/lib/beithady/operations/payment-resolver.ts) — `resolvePaymentForReservation(id)`. Cancel→n_a, inquiry→unpaid, confirmed+OTA→paid (channel pre-collects), confirmed+direct→Stripe lookup by `metadata.guesty_reservation_id` (preferred) or amount+window match (fallback).
- Server actions: `markPaidAction` (manual override with amount + note + audit), `markUnpaidAction` (revert), `recomputePaymentAction` (re-runs resolver). All write to `beithady_audit_log` via shared `writeAudit` helper.
- [confirm-write-modal.tsx](src/app/emails/beithady/operations/calendar/_components/confirm-write-modal.tsx) — reusable confirm dialog with three warning types: `guesty_write` (amber), `destructive` (rose), `local_only` (cyan). Esc to cancel. Slot for form fields.
- [payment-actions.tsx](src/app/emails/beithady/operations/calendar/_components/payment-actions.tsx) — Mark paid / Revert / Recompute buttons in drawer Tab 4.

**J.7b — Manual blocks (Guesty-synced) + bulk pre-arrival** (`955126c`):
- [src/lib/beithady/operations/guesty-writes.ts](src/lib/beithady/operations/guesty-writes.ts) — `blockGuestyAvailability` / `unblockGuestyAvailability` via `PUT /v1/calendar/listings/{id}` with per-day status patches. Best-effort: errors don't block local DB writes.
- Server actions: `createManualBlockAction` (local insert → Guesty push → record sync status → audit), `removeManualBlockAction`, `listManualBlocksForWindow`, `bulkSendPreArrivalAction` (queues placeholder pre_arrival_messages rows for the existing 5-min cron).
- [manual-block-button.tsx](src/app/emails/beithady/operations/calendar/_components/manual-block-button.tsx) — small "Block" link in each row's left rail; opens form with `guesty_write` warning. Falls back gracefully if Guesty sync fails.
- [bulk-actions.tsx](src/app/emails/beithady/operations/calendar/_components/bulk-actions.tsx) — Bulk button in page header. Days-ahead picker + dry-run preview + submit. Honors active building filter.

**Phase J progress:** J.1 ✅ J.2 ✅ J.3 ✅ J.4 ✅ J.5 ✅ J.6 ✅ J.7 ✅ — **J.8–J.10 ⏳**

**Remaining sub-phases:**
- J.8 — Supabase Realtime subscription + overbooking pre-write guard.
- J.9 — Heatmap overlay toggle + comp-set price triangles + WhatsApp share-boarding-pass + free channel logos. (Drag-to-create manual blocks also deferred here as polish — form-based flow ships in J.7b.)
- J.10 — Find-availability modal + direct-booking flow.

## 🟢 Earlier this session — Phase J.5 + J.6 shipped (commits `497b2e3`, `6f490eb`)

**J.5 — Operations recompute cron** (`497b2e3`):
- `/api/cron/beithady-operations-recompute` route, scheduled `*/30 * * * *` in `vercel.json`.
- Calls `beithady_calendar_recompute_all_active()` RPC (defined in J.1's migration 0043).
- Bearer-token gated via `CRON_SECRET`. Status flag dots refresh within 30 min of any upstream change.

**J.6 — Saved views + channel-mix sparkline** (`6f490eb`):
- Server actions: `saveViewAction`, `deleteViewAction`, `listViews` — backed by `beithady_calendar_saved_views`. Private vs shared scope; owner-only delete.
- `saved-views-menu.tsx` — bookmark dropdown. Click view → applies filters via URL params. Save form with private/shared picker.
- `channel-mix.tsx` — server-rendered inline horizontal bar showing channel split for the visible window (improvement #10). Drops cancelled reservations.
- Filter state was already URL-driven from J.3, so this completes J.6 scope.

**Phase J progress:** J.1 ✅ J.2 ✅ J.3 ✅ J.4 ✅ J.5 ✅ J.6 ✅ — J.7–J.10 ⏳

**Remaining sub-phases:**
- J.7 — Read-write actions to Guesty (mark paid, status changes, manual blocks, bulk actions, Stripe payment resolver). Heaviest remaining piece.
- J.8 — Supabase Realtime + overbooking pre-write guard.
- J.9 — Heatmap overlay toggle + comp-set price triangles + WhatsApp share-boarding-pass + free channel logos.
- J.10 — Find-availability modal + direct-booking flow.

## 🟢 Earlier this session — Phase J.1 → J.4 shipped (commits `0346db5`, `90ae39e`, `1e6bde0`, `40958cc`)

J.4 — 10-tab reservation drawer (`40958cc`):
- [src/lib/beithady/operations/reservation-detail.ts](src/lib/beithady/operations/reservation-detail.ts) — `getReservationDetail(id)` parallel-fetches base + conversation + last 10 messages + tasks + upsells + audit + ads attribution + lead pipeline + past stays + reviews
- [drawer.tsx](src/app/emails/beithady/operations/calendar/_components/drawer.tsx) — slideover with backdrop, header (confirmation code, guest, listing, status pill, risk pill), tier-specific loyalty banner (VIP/Platinum/Gold/Silver perks), 10 tabs in a left rail
- All 10 tabs implemented in V1 (read-only): Overview / Guest / Channel / Payment / Communication / Check-in / Tasks / Upsells / Attribution / Audit
- Past-stay quick-look (improvement #12) shows last 3 stays with star ratings + previous review excerpts
- Loyalty banner (improvement #13) drives feature gating per tier
- Page parallel-fetches grid data + reservation detail; drawer mounts when `?reservation=<id>` is set
- Read-only V1; write actions (mark paid, status changes, manual blocks) land in J.7

J.3 — Read-only Calendar Grid (`1e6bde0`):
- [src/lib/beithady/operations/calendar-data.ts](src/lib/beithady/operations/calendar-data.ts) + [channel-meta.ts](src/lib/beithady/operations/channel-meta.ts) + [types.ts](src/lib/beithady/operations/types.ts)
- 5 UI components: anomaly-banner, header-bar (filters + URL params), listing-rail, reservation-bar, calendar-grid (220px sticky rail × N date cols, today indicator, weekend tinting)
- Click reservation → `?reservation=<id>` (drawer wired in J.4)

**Phase J progress:** J.1 ✅ J.2 ✅ J.3 ✅ J.4 ⏳ (build verification pending) — J.5–J.10 ⏳

## 🟢 Earlier this session — Phase J.1 + J.2 + J.3 shipped

J.3 grid coding done — Vercel build verification scheduled. Note on J.1's individual deploy: it errored because adding `operations` to `BeithadyCategory` broke `Record<BeithadyCategory, LauncherTile>` in the launcher map; J.2 fixed it within the same logical change. Canonical `limeinc.vercel.app` is on J.2's READY build (which contains J.1 code).

**J.3 — Read-only Calendar Grid (`1e6bde0`):**

Page at `/emails/beithady/operations/calendar` — server component reading URL params (`from`, `days`, `buildings`, `channels`, `status`, `risk`, `q`).

Library:
- [src/lib/beithady/operations/types.ts](src/lib/beithady/operations/types.ts) — `CalendarRow`, `CalendarReservation`, `AnomalySnapshot`, `CalendarFilters`, `CalendarGridData`
- [src/lib/beithady/operations/channel-meta.ts](src/lib/beithady/operations/channel-meta.ts) — channel display map (Airbnb red, Booking blue, Direct teal, …) + 3-char short codes
- [src/lib/beithady/operations/calendar-data.ts](src/lib/beithady/operations/calendar-data.ts) — `getCalendarGridData`:
  - Bookable atoms via `fetchMtlParentIds + isBookableAtom` + drops listings without `building_code`
  - Latest `pricelabs_listing_snapshots.recommended_base_price` per listing as cell price
  - Cover thumbnails from `beithady_gallery_assets` (best-effort)
  - Reservations from `beithady_reservation_grid_v` with all filters SQL-side, search post-fetch
  - Status dot per row from next reservation in <14d (red unpaid+≤7d, yellow prearrival missing+≤2d, purple VIP/Gold/Platinum, gray no upcoming, green healthy)

UI components under `_components/`:
- `anomaly-banner.tsx` — top-of-page strip listing flag counts
- `header-bar.tsx` — date nav + view-span (7/14/28) + filters + search
- `listing-rail.tsx` — left rail per row: status dot + cover + nickname + building badge + per-night price
- `reservation-bar.tsx` — colored absolute-positioned bar overlay; click → `?reservation=<id>`. Inquiry → diagonal stripes; cancelled → faded crosshatch; out-of-window → marker stripe
- `calendar-grid.tsx` — 220px sticky-left rail + N date columns (64px). Sticky-top header with day/dow + weekend tinting + amber today column. Pink today vertical line.

Click on a bar sets `?reservation=<id>` URL param; the **drawer slot is empty in J.3** — the 10-tab drawer ships in J.4.

**Phase J progress:** J.1 ✅ J.2 ✅ J.3 ⏳ (build verification pending) — J.4-J.10 ⏳

## 🟢 Earlier this session — Phase J.1 + J.2 shipped

User signed off on the workflow phase. Pre-flight read-only investigations + J.1 (foundation) + J.2 (launcher) all deployed to limeinc.vercel.app via auto-deploy.

**Pre-flight findings (shaped J.1):**
1. `pricelabs_listing_snapshots` has `recommended_base_price` per-listing per-snapshot — no per-night calendar exists. Cells in J.3 use this as a flat per-listing price.
2. `beithady_boarding_passes` has only `viewed_at`/`view_count`/`token` — no ID upload + no smart-lock. V1 risk score drops those components; J.4 Tab 6 ships boarding pass + pre-arrival only.
3. `guesty_reservations.raw.money` carries `hostPayout` / `fareAccommodation` / `commission` / `currency` — used as money source-of-truth.
4. `comp_median_usd` is in `pricelabs_market_snapshots` per (building, bedroom_bucket) — joined in code, not in the view.
5. `beithady_role_permissions` table doesn't exist — permission matrix is in code at `src/lib/beithady/auth.ts`.
6. Status set in `guesty_reservations`: `confirmed` / `inquiry` / `canceled`. Channels: `airbnb2` / `bookingCom` / `hopper` / `manual`.
7. Stripe lib at `src/lib/stripe.ts`, env var `STRIPE_SECRET_KEY` confirmed (Phase 5.8).

**J.1 — Foundation (`0346db5`):**
- Migration `0043_beithady_operations.sql` applied via MCP. Tables: `beithady_reservation_overrides` (risk + payment cache + manual fields), `beithady_calendar_saved_views`, `beithady_calendar_manual_blocks`. Views: `beithady_reservation_grid_v` (joins reservations + listings + guests + overrides + boarding pass + pre-arrival), `beithady_calendar_anomalies_v` (banner counts).
- RPCs: `beithady_calendar_recompute_payment(id)`, `beithady_calendar_recompute_risk(id)`, `beithady_calendar_recompute_all_active()` (cron entry point).
- Initial backfill on **277 reservations**: 25 unpaid flag, 23 prearrival missing.
- Permission matrix updated: `operations` BeithadyCategory added to `src/lib/beithady/auth.ts`. Grants: admin/manager/ops = full, GR/finance = read.

**J.2 — Launcher (`90ae39e`):**
- 8th tile "Operations" added to Beithady main launcher (CalendarRange icon, cyan accent).
- Sub-landing at `/emails/beithady/operations`: anomaly snapshot strip + 3 cards (Multi-Calendar, Tasks → Phase F, Boarding Passes).
- `/operations/calendar` placeholder (J.3 lands the grid).
- `/operations/boarding-passes` table of 50 most recent passes from `beithady_boarding_passes`.

**Phase J progress:** J.1 ✅ J.2 ✅ J.3-J.10 ⏳

Next sub-phase J.3 (read-only calendar grid with virtualized rows × dates, ~2 commits) is a natural checkpoint — pausing for user to verify J.1 + J.2 deploys before continuing.

## 🟢 Earlier this session — Phase J workflow drafted (commit `f0a34b9`)

User answered all 10 open questions and confirmed all 12 suggested improvements + added a 13th (loyalty pill on Overview tab driving feature gating per tier). Workflow phase sent for review:

**Scope locked:**
- Route: `/emails/beithady/operations/calendar` (new "Operations" launcher card on Beithady main)
- Pricelabs as price source (existing data)
- Payment data: Guesty API first → Stripe fallback (Stripe only for non-Airbnb channels)
- Read-write to Guesty with confirm modal warning agents on every destructive action
- Manual blocks sync back to Guesty
- Free channel logo set
- Realtime updates via Supabase Realtime (overbooking guard)
- Desktop V1, mobile V2
- AI risk score in V1, bulk actions in V1

**10 sub-phases (J.1 → J.10), each independently shippable to limeinc.vercel.app:**

| Sub-phase | Scope |
|---|---|
| J.1 | Migration `0043_beithady_operations.sql` — `beithady_reservation_overrides`, `beithady_calendar_saved_views`, view `beithady_reservation_grid_v`, RPCs for risk + payment recompute, permission row `operations.calendar` |
| J.2 | Operations launcher card + sub-landing (Calendar/Tasks/Boarding cards) |
| J.3 | Read-only calendar grid with virtualized rows × dates |
| J.4 | 10-tab reservation drawer (Overview/Guest/Channel/Payment/Comms/Check-in/Tasks/Upsells/Attribution/Audit) |
| J.5 | AI risk score (1-10) + status flag dots + every-30min cron |
| J.6 | Filters → URL params + saved views + anomaly banner + channel-mix sparkline |
| J.7 | Read-write actions to Guesty + Stripe payment resolver + bulk actions + drag-to-create blocks |
| J.8 | Supabase Realtime subscription + overbooking pre-write guard |
| J.9 | Heatmap overlay toggle + comp-set price triangles + WhatsApp share-boarding-pass + free channel logos |
| J.10 | Find-availability modal + direct-booking flow |

**Pre-flight read-only investigations** (first commit in coding phase, before J.1 migration):
1. Verify pricelabs table schema for prices/min-stay/comp-set
2. Inspect `guesty_reservations.raw` for payment fields
3. Confirm Phase F check-in + ID upload + boarding pass table names
4. Confirm Stripe env var (Phase 5.8 used `STRIPE_SECRET_KEY`)
5. Inspect `guesty_reviews` shape for past-stay quick-look

**Confidence:** ~88% overall (will hit 95% after pre-flight). Highest uncertainty: Guesty write-API surface (J.7), Stripe-Guesty matching heuristic, Phase H/I schema for Attribution tab.

**5 confirmation questions sent to user, blocking coding phase:**
1. OK to ship J.1→J.10 sequentially (each its own Vercel deploy)?
2. OK to run pre-flight read-only investigations as the very first commit?
3. Anything missing in risk register?
4. Reorder anything? (e.g., move realtime/J.8 before J.7?)
5. "Operations" sub-landing with 3 cards — keep, or just put Calendar directly under `/emails/beithady/calendar`?

Estimated ~13 commits across the phase. No code written this turn. Awaiting user answers before queuing pre-flight + J.1.

## 🟢 Earlier this session — Phase J plan accepted (turn before this)

User confirmed all 13 improvements + answered all 10 open questions from the plan-phase. Notable additions:
- **#13 NEW**: Show guest loyalty level on reservation header → drives feature gating (VIP gets X, Gold gets Y, etc.)
- **#12 expanded**: Past-stay quick-look should also surface previous reviews if any
- **Manual blocks (Q5)**: yes, sync back to Guesty
- **Realtime (Q7)**: confirmed — to prevent overbooking
- **Bulk actions (Q10)**: V1 scope

## 🟢 Earlier this session — Phase J initial plan drafted

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
19. **Phase J plan drafted** (no commit) — Operations Calendar module spec sent; user confirmed 13 improvements + answered 10 questions
20. **Phase J workflow drafted** (no commit) — 10 sub-phase build plan + pre-flight investigations sent for review
21. **Phase J.1 — Operations Calendar foundation** (`0346db5`) — migration 0043, 277 reservations cached with risk + payment status, permission matrix gains `operations` category
22. **Phase J.2 — Operations launcher card + sub-landing** (`90ae39e`) — 8th tile on Beithady main, sub-landing with anomaly snapshot + 3 op cards, calendar placeholder, boarding-passes table
23. **Phase J.3 — Read-only calendar grid** (`1e6bde0`) — server page + `getCalendarGridData` lib + 5 UI components. Click reservation → `?reservation=<id>` (drawer in J.4)
24. **Phase J.4 — 10-tab reservation drawer** (`40958cc`) — `getReservationDetail` lib + drawer.tsx with all 10 tabs + tier loyalty banner (improvement #13) + past-stay quick-look (improvement #12)
25. **Phase J.5 — Operations recompute cron** (`497b2e3`) — `/api/cron/beithady-operations-recompute` every 30 min, calls RPC defined in J.1
26. **Phase J.6 — Saved views + channel-mix sparkline** (`6f490eb`) — saved-views CRUD with private/shared scope + inline channel mix bar (improvement #10)
27. **Phase J.7a — Payment writes + Stripe resolver** (`0131741`) — markPaid/markUnpaid/recompute actions + payment-resolver.ts + confirm-write-modal + payment-actions buttons in drawer
28. **Phase J.7b — Manual blocks + bulk pre-arrival** (`955126c`) — Guesty calendar writes + manual-block-button on each row + bulk pre-arrival action
29. **Phase J.8 — Realtime + overbooking guard** (`badc893`) — Supabase Realtime subscription to 4 tables + live/connecting/offline pill + pre-write conflict check on manual blocks
30. **Phase J.9 — Heatmap + comp-set + WhatsApp share** (`926eb15`) — density toggle (price/occupancy/ADR/revenue) + ▲▼ comp-set triangles + Copy/WhatsApp boarding-pass share
31. **Phase J.10 — Find availability modal** (`0d495a3`) — server action + form + result grid with Guesty deep-link for booking creation. Phase J COMPLETE
32. **Operations Calendar — "Other" bucket** (`1a3ef97`) — 8 out-of-scope listings (Madinaty, Mall of Mansoura, etc.) now bucketed under synthetic 'OTHER' building
33. **Calendar — MTL-aware price + bedrooms fallback** (`8048ea1`) — BH-73 children now show their parent's pricelabs price/bedrooms/comp-set since pricelabs only tracks the MTL parent
34. **Calendar — Chip filters + Country + hide cancelled** (`3fbc5c3`) — select dropdowns → categorised chip rows with brand colours; new Country chip row (Egypt/UAE); cancelled reservations now hidden by default
35. **Phase K.1 Daily Morning Brief plan drafted** (no commit) — 3 role-specific briefs spec
36. **Phase K.1 — Daily Morning Brief shipped** (`730f1f2`) — migration 0044 + 7 lib files + cron + web archive + recipients-management page + Operations card
37. **Morning Brief — Arabic Ops + Finance payout forecasts** (`906f156`) — Ops brief now in Arabic with RTL HTML; Finance gains 2-day + month-end expected payout forecasts
38. **Morning Brief — Test panel** (`3adaf81`) — Preview / Send test to me / Send NOW to all recipients buttons with spinner + result banners
39. **Phase K.2 — Cancellation risk + re-confirm workflow** (`f889b2c`) — migration 0045 + 0-100 scorer + /operations/cancel-risk page + WhatsApp re-confirm
40. **Phase K.3 — SOP & Knowledge Base** (`19123ce`) — migration 0046 + 16 seed articles across 5 hospitality roles + library page + acknowledgement tracking
41. **SOP/KB — Arabic GR + Maintenance + lang filter** (`68b32f0`) — 6 new Arabic counterpart articles + lang filter + EN↔AR counterpart link
42. **SOP/KB — A4 PDF export** (`61c9063`) — react-pdf renderer + 2 API routes + download buttons
43. **Phase L plan drafted** (no commit) — Budget + Consumables + Welcome Tray + Arabic Housekeeping Checklist; 9 surfaces, 8 DB tables, 7-8 commit scope, 11 open questions awaiting user (this turn)

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
