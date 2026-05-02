# Communication Module Audit — 2026-05-02

Triggered by: "Research Communication Module deeply and systematically to Debug any inconsistencies."

Methodology: 5 parallel research agents (UI/React state, webhook+ingest integrity, conversation lifecycle, outbound+AI reply pipeline, attachments+media) plus a parallel DB-level integrity scan via Supabase MCP. All findings cross-checked against actual production data.

**Live data state (2026-05-02):**
- 6,836 conversations (5,511 archived; 0 resolved — `markResolvedAction` exists but never used in production yet)
- 2,764 messages (1,615 outbound, 1,149 inbound) — direction values are `'inbound'`/`'outbound'` strings (good)
- 6,815 guesty conversations + 2,729 guesty posts
- **6,598 guesty conversations have NO posts** (96% — Guesty creates inquiry shells without messages)
- **1,089 unarchived beithady conversations have NO messages** (all Guesty channel)
- **111 messages have empty body + no attachments** (95 inbound + 16 outbound, all `airbnb2` module — structured Airbnb cards ingested as messages)
- **1 archived conversation has 5 inbound messages AFTER its `auto_cron_90d` archive timestamp** (`9a8c6d16-29fa-4abb-bb78-0ed89ade9a6f`) — confirms one of the most serious findings
- 0 ai_used_for_auto_send (AI auto-reply not yet exercised in production — bugs there are LATENT)
- 0 listing_assets, 0 listing_secrets (library not yet populated)
- 0 conversation_notes (internal notes not yet used)
- 0 failed deliveries, 0 stuck pending outbounds, 0 dup external_ids, 0 NULL directions, 0 messages without conv FK

Symbols: 🔴 CRITICAL · 🟠 HIGH · 🟡 MEDIUM · ✅ Already fixed in this turn

---

## Summary table

| Severity | Count | Notes |
|---------:|:-----:|-------|
| 🔴 CRITICAL | 16 | Several converge on a single high-leverage fix (`key={header.id}` resolves 10 of them) |
| 🟠 HIGH | 31 | Some require product decisions |
| 🟡 MEDIUM | 23 | Robustness / clarity |
| **Total** | **70** | |

---

## 🔴 CRITICAL — fix soon, high blast radius

### Cluster A: React state leaks across conversation switches (10 bugs, 1 fix)

`<ThreadPane>` is rendered without a stable `key` keyed on the current conversation id, so switching conversations preserves the entire client subtree. Every piece of local state — composer drafts, attachment queues + blob URLs, internal notes, channel-switcher banners, resolve dropdown, watchdog timers — leaks into the next conversation. Type "hello Alice", click Bob → Send delivers Alice's draft to Bob.

| ID | Symptom | File |
|----|---------|------|
| C-A1 | Composer body leaks across convs | [composer.tsx:71](src/app/beithady/communication/_components/composer.tsx:71), [wa-casual-composer.tsx:29](src/app/beithady/communication/_components/wa-casual-composer.tsx:29), [switch-composer.tsx:53](src/app/beithady/communication/_components/switch-composer.tsx:53) |
| C-A2 | Composer body + submitting + unresolvedVars not reset after send | same files |
| C-A3 | AttachmentMenu pending file queue + blob URLs leak | [attachment-menu.tsx:61](src/app/beithady/communication/_components/attachment-menu.tsx:61) |
| C-A4 | Internal notes textarea body leaks | [internal-notes-panel.tsx:28](src/app/beithady/communication/_components/internal-notes-panel.tsx:28) |
| C-A5 | ChannelSwitcher pendingTarget banner leaks | [channel-switcher.tsx:76](src/app/beithady/communication/_components/channel-switcher.tsx:76) |
| C-A6 | ResolveButton dropdown reason leaks | [resolve-button.tsx:30](src/app/beithady/communication/_components/resolve-button.tsx:30) |
| C-A7 | unresolvedVars template warning leaks | composer.tsx:74, wa-casual-composer.tsx:33 |
| C-A8 | AttachmentMenu watchdog timer fires in wrong conv | attachment-menu.tsx:74-81 |
| C-A9 | VoiceRecorder mic stream + tick interval keep running | [voice-recorder.tsx:46-54](src/app/beithady/communication/_components/voice-recorder.tsx:46) |
| C-A10 | SuggestionStrip `busy` state stays "Sending..." forever | [suggestion-strip.tsx:51](src/app/beithady/communication/_components/suggestion-strip.tsx:51) |

**Fix:** `key={header.id}` on `<ThreadPane>` (or each affected child) — collapses all 10 into one change.

### Cluster B: Conversation lifecycle silently loses guest messages

| ID | What | Files |
|----|------|-------|
| C-B1 | **Auto-archive cron archives convs that are unanswered for >90d** — the highest-priority guest message gets archived | [api/cron/beithady-conversation-archive/route.ts:67-74](src/app/api/cron/beithady-conversation-archive/route.ts:67) |
| C-B2 | **No auto-restore on inbound** — archived convs silently swallow new messages | [guesty-webhook.ts:301-311](src/lib/guesty-webhook.ts:301), [wa-casual-ingest.ts:236-244](src/lib/beithady/communication/wa-casual-ingest.ts:236) |
| C-B3 | **No auto-unresolve on inbound** — resolved convs stay closed even when guest replies | [polish-actions.ts:103](src/app/beithady/communication/polish-actions.ts:103), webhook handlers above |

**DB confirms B2:** conv `9a8c6d16-29fa-4abb-bb78-0ed89ade9a6f` (auto_cron_90d archived 2026-04-29 11:21:55) has 5 inbound messages after archive (last 2026-04-30 04:45:21). Operator cannot see them in active inbox.

**Fix:** add `archived_at: null, archived_reason: null` (B2) AND `resolved_at: null, state: 'open'` (B3) to the conversation update in both ingest paths. Adjust the auto-archive predicate (B1) to require `unread_count = 0 OR last_outbound_at > last_inbound_at` so unanswered threads aren't archived.

### Cluster C: Webhook ingest auth + impersonation

| ID | What | Files |
|----|------|-------|
| C-C1 | **Stored XSS** via Guesty `bodyHtml` rendered with `dangerouslySetInnerHTML`; no sanitizer | [media-placeholder.tsx:169-174](src/app/beithady/communication/_components/media-placeholder.tsx:169) |
| C-C2 | Guesty webhook secret in URL query string + non-timing-safe `!==` | [api/webhooks/guesty/conversation/route.ts:24-30](src/app/api/webhooks/guesty/conversation/route.ts:24), [register/route.ts:80-82](src/app/api/cron/beithady-guesty-webhook-register/route.ts:80) |
| C-C3 | Green-API webhook impersonation: leaked URL slug → fabricate inbound from any phone → AI auto-reply triggers on forged content | [api/webhooks/green/[slug]/route.ts:19-34](src/app/api/webhooks/green/[slug]/route.ts:19), [wa-casual-ingest.ts:255-291](src/lib/beithady/communication/wa-casual-ingest.ts:255) |

**DB confirms:** 0 messages currently have `body_html` set, so XSS is dormant — but the rendering code is vulnerable; the first guest with HTML in their message triggers it.

### Cluster D: Outbound send & AI auto-reply

| ID | What | Files |
|----|------|-------|
| C-D1 | **AI auto-reply has zero per-conv rate limit / loop guard** — 30 inbound bursts → 30 Claude calls + 30 outbounds → WhatsApp anti-spam ban risk | [ai/auto-reply.ts:25-271](src/lib/beithady/ai/auto-reply.ts:25) |
| C-D2 | **AI auto-reply runs on archived/resolved convs** — silent outbound on a "hidden" thread | [ai/auto-reply.ts:64-67](src/lib/beithady/ai/auto-reply.ts:64) |
| C-D3 | **Guesty send retries 5xx without idempotency-key** → guest receives same message twice | [send-guesty.ts:72-78](src/lib/beithady/communication/send-guesty.ts:72) + [guesty.ts:147-171](src/lib/guesty.ts:147) |
| C-D4 | Failed Guesty send fallback URL also duplicates (no check whether underlying post succeeded) | send-guesty.ts:91 |
| C-D5 | Guesty outbound insert is not upsert — second webhook delivery throws 23505 | send-guesty.ts:120-129 |
| C-D6 | WA Casual conversation creation race: SELECT-then-INSERT in plpgsql with no advisory lock; concurrent webhooks → 23505 → silent message loss | [wa-casual-ingest.ts:149-154](src/lib/beithady/communication/wa-casual-ingest.ts:149) + [migration 0035 :64-104](supabase/migrations/0035_beithady_wa_casual.sql) |

### Cluster E: Attachments

| ID | What | Files |
|----|------|-------|
| C-E1 | **Orphan blobs** in `beithady-wa-media` on every multi-attachment partial-failure send (subsequent files already uploaded but loop break never deletes) | [attach-actions.ts:395-486](src/app/beithady/communication/attach-actions.ts:395), [attachment-menu.tsx:147-175](src/app/beithady/communication/_components/attachment-menu.tsx:147) |
| C-E2 | **No server-side mime-type validation** — `.exe` renamed `.jpg` is stored | [attachment-menu.tsx:89-102](src/app/beithady/communication/_components/attachment-menu.tsx:89), [attach-actions.ts:230-255](src/app/beithady/communication/attach-actions.ts:230) |
| C-E3 | **Library asset deletion 404s every past message** that referenced it (URL stored live, not copied) | [attach-actions.ts:539-566](src/app/beithady/communication/attach-actions.ts:539), [library-picker.tsx:84-91](src/app/beithady/communication/_components/library-picker.tsx:84) |

### Cluster F: Cross-conversation contamination

| ID | What | Files |
|----|------|-------|
| C-F1 | Direction inferred from `gp.from_type` / `gp.sent_by` — host echo bridged through external channel can appear as inbound and trigger AI auto-reply on our own message | [migration 0062 :104-112](supabase/migrations/0062_beithady_inbound_outbound_from_posts.sql) + [guesty-webhook.ts:140-146](src/lib/guesty-webhook.ts:140) |

---

## 🟠 HIGH — works in normal case, breaks under load / concurrency / unusual flow

### React state (5)
- H-A11 `unresolvedVars` template warning + Send-disabled bit leaks across convs (composer.tsx)
- H-A12 AttachmentMenu watchdog `setStalled(true)` 90s timer leaks across convs
- H-A13 `MediaPlaceholder` blob URL revoke runs on unmount only — invalidates URLs still in DOM (media-placeholder.tsx:270)
- H-A14 Switch-composer template-like warning mis-fires on plain `}` text (switch-composer.tsx:73)
- H-A15 LibraryPicker `selected` Set retains items from previous listing on forward navigation (library-picker.tsx:62-70)

### Webhook + ingest (8)
- H-B4 `unread_count = 1` overwrites on every Green inbound (`= unread_count + 1` would be correct) (wa-casual-ingest.ts:235)
- H-B5 Concurrent webhook race on conv UPDATE — older bumps overwrite newer (guesty-webhook.ts:298-311)
- H-B6 Webhook returns 200 even on internal error → silent loss when Guesty drops from retry queue (route.ts:71-77)
- H-B7 AI auto-reply fired in `void` promise — Vercel kills the lambda on response flush; silent drop (wa-casual-ingest.ts:255-291)
- H-B8 Auto-archive system-notification heuristic title-only + language-fragile (migration 0058 :30-46)
- H-B9 Lazy-create parent on Guesty `messageReceived` — orphan window between INSERT-post and UPSERT-conv (guesty-webhook.ts:215-282)
- H-B10 Cron sync has no high-water mark — re-fetches 50 posts per conversation per run (run-guesty-sync.ts:467-484)
- H-B11 Cross-channel guest threads never merge (guest who texts via WA + via Guesty → 2 separate threads)

### Lifecycle (6)
- H-C2 `bulkRestoreConversationsAction` trusts client-provided IDs without `.not('archived_at', 'is', null)` guard (archive-actions.ts:138-156)
- H-C3 `was_channel_switched` written AFTER row commit (race window where webhook sees default false) (actions.ts:286-294)
- H-C4 `unanswered_first` sort uses `modified_at_external desc` as tiebreaker — Guesty sync re-bumps lift answered above unanswered (inbox.ts:201)
- H-C5 Booking-status view recomputes per-query with `now()` + Cairo TZ — Next.js cache stale through midnight (migration 0064 :30-37)
- H-C6 Green-API direction hardcoded `'inbound'` for every event we accept — operator's out-of-band reply gets misclassified (wa-casual-ingest.ts:215-220)
- H-C7 No edit/delete propagation from Guesty/Green → stale text after guest revokes (no handlers)

### Outbound (4)
- H-D7 Local DB insert of WA Casual outbound discards `error` from destructure → message sent but no row → operator retries → guest gets two (send-wa-casual.ts:103-126)
- H-D8 Kill-switch read once at function entry; flipping ON during in-flight send still lets the message through (send-guesty.ts:37, send-wa-casual.ts:31)
- H-D9 Backup channel can spam guest twice (no de-dup tag, no "originally sent via X" annotation) (actions.ts:304-355)
- H-D10 `acceptSuggestionAction` proceeds past `redirect()` if it ever fails to throw (ai-actions.ts:67-95)

### Attachments + media (8)
- H-E4 `useState(buildingCode)` anti-pattern in library-picker (library-picker.tsx:30-31)
- H-E5 Voice recorder cannot recover from mic-permission-denied (no error UI in idle state) (voice-recorder.tsx:117-128)
- H-E6 Voice recorder discard race — audio gone before parent confirms send/fail (voice-recorder.tsx:109-115)
- H-E7 AttachmentMenu errorMsg stuck — only cleared on successful send (attachment-menu.tsx:64,200-205)
- H-E8 Auto-scroll fires only once per mount; ignores realtime new inbound (auto-scroll-thread.tsx:16-34)
- H-E9 Voice upload + send not atomic — orphan blobs on send failure (actions.ts:107-160)
- H-E10 No composer draft persistence — accidentally Cmd+R loses 500-word reply (composer.tsx:71)
- H-E11 WA media URLs from Green-API CDN expire (~7 days) — old messages 404; not mirrored to durable storage (wa-casual-ingest.ts:174-182)

---

## 🟡 MEDIUM — robustness / clarity (highlights)

- M-1 ItemsSectionList-style poller `useEffect([sections, router])` rebuilds interval every refresh
- M-2 `Math.random()` for gallery tokens (~70 bits non-CSPRNG) — should use `crypto.randomBytes` (attachment-gallery.ts:24-29)
- M-3 `getAssetBuildingsSummary` loads 50k rows just to count by building_code in JS (listing-assets.ts:34-52)
- M-4 Sidebar list doesn't preserve scroll position across selection
- M-5 SLA pill is server-only — no live ticking, frozen on long-lived tabs (sla-pill.tsx)
- M-6 `firstUnreadId` selector vulnerable to special chars (auto-scroll-thread.tsx:23-25)
- M-7 Guesty webhook unique-key falls through to `Date.now()` — every retry generates fresh key (guesty-webhook.ts:57-85)
- M-8 SQL ingest proc `beithady_communication_ingest` does full-table scan + upsert on every webhook
- M-9 Booking-status view has no index for `booking_status_variant` filter
- M-10 No rate-limit on `/g/:token` gallery viewer
- M-11 Send button no double-click guard between client transition and server redirect
- M-12 Template variable fall-through guard bypassable by manually deleting `{` from template body
- M-13 AI prompt filters `body NOT NULL` so structured Airbnb threads look single-turn (auto-reply.ts:103-113)
- M-14 No `reply_to_message_id` threading on outbound API calls
- ... (more in agent reports)

---

## DB anomalies confirmed

| Finding | Count | Notes |
|---------|------:|-------|
| Archived convs with inbound AFTER archive timestamp | **1** | conv `9a8c6d16…` has 5 inbound after `auto_cron_90d` archive 2026-04-29 — Cluster B2 evidence |
| Empty body + no attachments | **111** | All Airbnb2 module — structured cards we ingest as message rows |
| Unarchived guesty convs with no messages | **1,089** | All Guesty channel — likely shells from Guesty API |
| Guesty convos with no posts | **6,598** | 96% — Guesty creates inquiry shells |
| Failed outbound deliveries | **0** | Healthy |
| Stuck pending outbounds (>1h) | **0** | Healthy |
| Duplicate external message ids | **0** | Unique constraint working |
| Resolved-after-archived | **0** | No state-machine inversion in DB today |
| AI used for auto-send | **0** | Auto-reply not yet exercised in production |

---

## Recommended fix order (smallest blast radius first)

| # | Audit IDs | One-liner |
|---|-----------|-----------|
| 1 | C-A1..C-A10 | `key={header.id}` on ThreadPane (one line, kills 10 React leaks) + AutoScrollThread `fired.current` reset on conversationId change |
| 2 | C-B2 + C-B3 | Auto-restore `archived_at: null` and auto-unresolve `resolved_at: null` on inbound (both Guesty webhook and WA Casual ingest) |
| 3 | C-D2 + C-D1 | AI auto-reply: skip if archived/resolved; per-conv rate limit (max 3 auto-sends per 10 min) |
| 4 | C-C1 | Sanitize Guesty `bodyHtml` (DOMPurify) or render plaintext fallback only — closes the dormant XSS |
| 5 | C-C2 | `crypto.timingSafeEqual` for Guesty webhook secret check |
| 6 | C-D5 + H-D7 | Guesty outbound insert → upsert; WA Casual outbound capture insert error |
| 7 | H-B4 | `unread_count = unread_count + 1` instead of overwrite |
| 8 | C-D6 | WA Casual conv creation: `INSERT … ON CONFLICT DO UPDATE … RETURNING id` |
| 9 | H-C2 | bulkRestore add `.not('archived_at', 'is', null)` guard |
| 10 | C-D3 | Guesty send `Idempotency-Key` header + `retries: 0` for POST |
| 11 | C-B1 | Auto-archive predicate: only archive if answered |
| 12 | C-E3 | Library asset soft-delete (or copy-on-send) |
| 13 | C-E2 | Server-side mime-type sniff |
| 14 | C-E1 + H-E9 | Multi-attach partial-failure cleanup + voice send orphan cleanup |
| 15 | C-C3 | Green-API webhook: enforce IP allowlist + per-phone trust check before AI fires |
| 16+ | (HIGH/MEDIUM cluster) | The remaining ~50 items |
