# Beithady Module — Comprehensive Audit (2026-05-08)

**Scope:** End-to-end read-only audit of the Beithady module across functional integrity, code bloat, duplication, performance, stability, and brand/theme consistency. **No code was modified.**

**Coverage (487 files, ~22,665 LOC):**
- UI: `src/app/beithady/**` (310 TSX/TS files)
- API: `src/app/api/beithady/**` (51 files / 66 handlers)
- Logic: `src/lib/beithady/**` + `src/lib/beithady-daily-report/**` (140+ modules)
- Cron: 27 `beithady-*` handlers in `src/app/api/cron/`
- Webhooks: `src/app/api/webhooks/guesty/**`, `src/app/api/webhooks/green/**`
- Brand spec: `src/lib/brand-theme.ts`

**Method:** 6 parallel sub-agents, one per audit dimension. Every finding cites `file:line`. Severity: 🔴 critical · 🟠 high · 🟡 medium · ⚪ low.

---

## Executive summary

The Beithady module is **functionally rich but structurally young.** It works, but it carries the cost: fragmented brand identity, copy-pasted business logic, and a thin error-handling layer that will eventually surface as user-visible incidents. There are **no smoking-gun show-stoppers** — but there are several **silent failure modes** (cron auth fails open if `CRON_SECRET` is unset, scheduled-reports drops failed recipients permanently, FX N+1 burns 30–60s per daily report) that should be closed before adding new features.

**Top-line numbers:**

| Metric | Value |
|---|---|
| Files in scope | 487 |
| LOC in `src/lib/beithady/**` | ~22,665 |
| API routes scanned | 66 (across 51 files) |
| API routes missing top-level try/catch | 38 of 51 |
| Cron handlers fail-open if `CRON_SECRET` unset | 17 of 27 |
| Routes leaking raw `error.message` to client | 16 |
| Server actions without Zod validation | 35 of 35 |
| `error.tsx` boundaries under `/beithady` | **0** |
| Anthropic SDK call sites without timeout/retry | 14 of 14 |
| Hard-coded hex codes in Beithady UI | ~380 (~75% off-spec) |
| Distinct "brand navies" coexisting | 3 (`#1E2D4A`, `#003462`, `#1e3a5f`) |
| `<img>` tags instead of `next/image` | 12 |
| Pages with `force-dynamic` and no `revalidate` | 94 of 94 |
| Cron-handler `checkAuth` byte-identical copies | 19 of 27 |
| Estimated deduplicable LOC | ~700–900 |
| Unused public assets (Beithady) | 480 KB |
| Cron handlers in code but missing from `vercel.json` | 5 |

**Three things to fix this week (≤8 hours total):**
1. **Flip the 17 fail-open cron auth checks** (`if (!expected) return true` → `return false`) — single-line edits, eliminates an entire class of silent open-endpoint risk.
2. **Add `src/app/beithady/error.tsx`** — one file closes the entire red-overlay/uncaught-throw class for every Beithady segment.
3. **Hoist FX rate map in `reservations.ts`** — drops 30–60s off every daily-report build.

---

## 1. Functional integrity

### 🔴 Critical
- **17 cron handlers fail open when `CRON_SECRET` is unset.** Pattern: `if (!expected) return true;` in `beithady-morning-brief/route.ts:13`, `beithady-pre-arrival/route.ts:9`, `beithady-comm-sync/route.ts:24`, `beithady-csat-survey/route.ts:9`, `beithady-loyalty-tick/route.ts:9`, `beithady-review-reply-queue/route.ts:9`, `beithady-vip-digest/route.ts:17`, `beithady-ads-insights/route.ts:17`, `beithady-ads-attribution/route.ts:15`, `beithady-amazon-eg-sourcer/route.ts:20`, `beithady-late-reply-digest/route.ts:18`, `beithady-ai-label-queue/route.ts:14`, `beithady-fees-audit-sync/route.ts:20`, `beithady-market-fetch/route.ts:19`, `beithady-operations-recompute/route.ts:14`, `beithady-sla-recalc/route.ts:9`, `beithady-upsell-offer/route.ts:9`, `beithady-boarding-pass/route.ts:9`. `beithady-daily-report/route.ts:10-13` is the only correct fail-closed pattern. **Fix:** invert to `return false` and `console.error('CRON_SECRET unset')`.
- **F&B routes use `requireBeithadyPermission()` which calls `redirect()`/`notFound()`.** Designed for RSC layouts; breaks API JSON contract. ~30 callsites under `src/app/api/beithady/fnb/**`. Unauthorized calls return HTML 404 instead of JSON 403. **Fix:** sibling `assertBeithadyPermissionApi()` returning `NextResponse.json({error:'forbidden'},{status:403})`.

### 🟠 High
- **16 routes leak raw Postgres `error.message`** (column names, FK constraint text, SQL fragments). Locations: `reports/save/route.ts:50`, `reports/[id]/route.ts:26,55,71`, `reports/[id]/schedule/route.ts:74,94,119`, `reports/[id]/xlsx/route.ts:34`, `reports/[id]/pdf/route.ts:36`, `fnb/buildings/route.ts:11`, `fnb/buildings/[code]/route.ts:21`, `fnb/audit/route.ts:14`, `fnb/inventory-items/route.ts:20`, `fnb/orders/route.ts:40`, `fnb/items/[id]/photo-upload-url/route.ts:27`, `fnb/analytics/timeseries/route.ts:17`, `fnb/photo/route.ts:19`, plus 4 cron routes.
- **Guesty webhook secret travels in `?secret=` query string** (`webhooks/guesty/conversation/route.ts:25-43`). Leaks via referrer, access logs, browser history. Comment at `:28-30` already acknowledges this. **Fix:** migrate to a request header.
- **Zod missing on 4 POST/PUT bodies:** `reports/save/route.ts:25-32` (casts to `ReportConfig` with 2-field check), `reports/[id]/route.ts:41-53` (PUT, no validation), `fees-audit/run/route.ts:18`, `fees-audit/vendor-export/route.ts:17`. Webhook input also unvalidated: `webhooks/guesty/conversation/route.ts:75`, `webhooks/green/[slug]/route.ts:47`.
- **`mark-settled/route.ts:25`** does `throw e;` after handling two known strings — any other failure becomes an uncaught 500 with a stack trace surfaced to the client.

### 🟡 Medium
- **3 outbound `fetch()` sites without timeout:** `wa-casual-ingest.ts:470`, `gallery/ai-label.ts:53`, `inventory/amazon-eg-sourcer.ts:219`.
- **Hardcoded `localhost:3000` fallback** in `setup/actions.ts:201` if both `NEXT_PUBLIC_APP_URL` and `VERCEL_URL` are unset.
- **Anthropic SDK calls in 12 files** rely on the SDK default (no explicit timeout). Cron iterations can hang the whole run on one stuck call.
- **Inconsistent auth-guard style** across API routes: some use `getCurrentUser()` + `hasBeithadyPermission()` returning JSON; others use `requireBeithadyPermission()` (page-style).

### ⚪ Low
- 2 `@deprecated` markers in `morning-brief/country.ts:294,297` — shim block ready for removal.
- `as never` / `as any` casts pending typegen (`fnb/repo.ts:23,280`) — masks future schema drift.
- Browser-spoofing User-Agent + `referer: https://app.guesty.com/` in `communication/guesty-attachment/route.ts:248-290` — Guesty hack that may break unilaterally.

---

## 2. Code bloat & dead weight

### 🔴 Critical
- **5 cron route handlers exist in code but are NOT in `vercel.json`** while UI tells operators they run. Net ~700 LOC that never fires:
  - `beithady-pre-arrival/route.ts` + `lib/beithady/engagement/pre-arrival.ts` (123 lines)
  - `beithady-boarding-pass/route.ts` + `lib/beithady/engagement/boarding-pass.ts` (249 lines)
  - `beithady-csat-survey/route.ts` + `lib/beithady/engagement/csat.ts` (177 lines)
  - `beithady-upsell-offer/route.ts` + `lib/beithady/engagement/upsell.ts` (162 lines)
  - `beithady-review-reply-queue/route.ts` (lib partly used by review UI)
  - `src/app/beithady/settings/templates/page.tsx:143` literally says: *"Cron currently STRIPPED — disabled until templates are reviewed."* But `lib/beithady/automations.ts` lists them as live. **Decide: re-add to `vercel.json` or delete the unused crons + libs.**

### 🟠 High
- **Duplicate brand-image bytes:** `public/brand/beithady/mark.jpg` (57 KB) is byte-identical to `monogram.jpg`. `mark.jpg` is unreferenced.
- **Unused brand assets** (~480 KB recoverable): `Icon-03.png` (340 KB), `logo-fmplus.jpg` (86 KB — spec doc explicitly says "leave file; remove references"), `mark.jpg` (57 KB).

### 🟡 Medium
- **`BEDROOM_BUCKETS`** in `reports/bedroom-buckets.ts` is exported but only referenced inside its own file — dead export.
- **`@deprecated` shim** at `morning-brief/country.ts:288-302` (`CountryCode`, `countryForBuilding`) — ready for removal.
- **`isOutboundPaused()`** in `settings.ts:67-80` — explicit deprecation comment "Schedule for removal once all imports are migrated."
- **`thread-pane.tsx:326`** — comment notes a prop is "Kept on the prop signature (legacy) — no longer used."

### Dependency footprint
| Package | Used in Beithady | Issue | Recommendation |
|---|---|---|---|
| `@react-pdf/renderer` | Yes (3 paths) | Heavy but unavoidable; all consumers wired | Keep |
| `exceljs` | Yes (3 paths) | Single Excel lib | Keep |
| `lucide-react` | Yes (~250 sites) | Named imports → tree-shakes correctly | Keep |
| `recharts` | Yes (2 client paths) | ~300–350 KB min in client bundle | **Wrap in `next/dynamic`** (perf section) |
| `googleapis` | No (Beithady) | Whole-SDK import elsewhere — not Beithady's problem | Out of scope |

### ⚪ Low (clean codebase signals)
- **0 commented-out code blocks >5 lines** in Beithady scope.
- **0 `console.log`/`console.debug` calls** in Beithady client UI/lib/API.
- **0 `.bak`/`.old`/`.copy`/`.tmp`/`*-old.*`/`*-v1.*`/`*-legacy.*` files** in repo.
- **`*-shared.ts` vs `*.ts` pairs are intentional** (server-only vs client-importable; verified).

---

## 3. Duplication & redundancy

### 🔴 Critical
- **Building-code parsers reimplemented in 6 places** with subtle drift: `run-pricelabs-sync.ts:33-74`, `run-odoo-financial-sync.ts:423-442`, `run-guesty-sync.ts:162-179`, `rules/aggregators/beithady-booking.ts:340-354`, `rules/beithady-listings.ts:141-153` (canonical), `lib/beithady-daily-report/units.ts`. Each handles `BH-26/34/73/435/OK/OKAT` slightly differently — Booking.com sub-units handled differently in each. **Home:** `src/lib/rules/beithady-listings.ts` exporting `parseBuildingCode()`.
- **Channel taxonomy bucketing implemented 12 times.** Different per-file behavior for `vrbo`/`expedia`/`agoda`/`website`/`Capital One`. Locations: `lib/beithady-daily-report/{reservations,build-extras,build-no-show}.ts`, `lib/beithady/reports/{channel-taxonomy,build-report}.ts`, `lib/beithady/{guesty-metrics,fees-audit/channel-fees,operations/channel-meta}.ts`, `lib/rules/aggregators/{beithady-payout-api,beithady-booking-api}.ts`, `app/beithady/communication/_components/{composer,thread-pane}.tsx`. **Home:** new `src/lib/beithady/channels.ts`.
- **`BUILDING_CODES` redeclared 4 times** (3 with 5 codes, 1 with 6 — schema drift waiting to happen): `lib/beithady-daily-report/types.ts:8-14`, `lib/beithady/reports/build-report.ts:63-69`, `lib/beithady/inventory/warehouses-shared.ts:31`, `lib/beithady/market/calendar.ts:29`. **Home:** new `src/lib/beithady/buildings.ts`.
- **Cron-handler boilerplate** copy-pasted across 27 routes; `checkAuth()` byte-identical in 19, plus 10+ inline Cairo-hour formatters. **~440 LOC deduplicable.** **Home:** `src/lib/cron-helpers.ts` exporting `assertCronAuth(req)`, `cairoHourGate(window)`, `cronWrapper(handler)`.

### 🟠 High
- **Cairo "today" reimplemented 5+ times** despite canonical `cairoYmd()` existing in `cairo-dates.ts:28`. Callers forgot it: `communication/reservation-status.ts:40`, `fnb/checkout-reminder.ts:61`, `boat-rental/pricing.ts:131`, `beithady-send-test-briefs/route.ts:29`. **Promote `cairoYmd` to `src/lib/cairo.ts`.**
- **`fmtMoney`/`fmtUsd` redeclared 8 times** (3 byte-identical in CRM pages alone): `crm/page.tsx:73`, `crm/[guestId]/page.tsx:34`, `crm/segments/[segmentId]/page.tsx:14`, `operations/calendar/_components/drawer.tsx:627`, `fees-audit/render-pdf.tsx:87`, `analytics/performance/_components/panels/buildings-table.tsx:67`, `lib/beithady/reports/types.ts:171`.
- **`e instanceof Error ? e.message : String(e)`** appears 125 times across 96 files (Beithady ~50). 4 inventory `_form-button` components share a near-identical `try/catch/setError` flow. **Helper:** `src/lib/errors.ts: getErrorMessage(e)` + `useFormAction()` hook.
- **Star-rating normalization splits across files** with inconsistent thresholds (`pipeline/review-replies.ts:55-60` uses 1-10; `build-reviews.ts:107-109` uses 1-5 unclamped; `beithady-review-api.ts:238-241` clamps).
- **Listing-id → nickname/building Map rebuilt inline in 9 files** — same Supabase query, no shared loader.
- **Modal-shell Tailwind string** (`fixed inset-0 z-50 flex … bg-slate-900/50` + inner card) **repeated in 9 inventory `_form-button.tsx` files**. **Home:** `<DialogShell />`.

### 🟡 Medium
- **Date-only UTC midnight parse `Date.parse(x + 'T00:00:00Z')`** appears 11 times.
- **Two parallel `CHANNEL_LABEL` maps** with different keys/colors (`build-extras.ts` vs `operations/channel-meta.ts`).
- **38 of 39 `await recordAudit(...)` calls** unnecessarily await a fire-and-forget operation (already swallows errors).

### Top repeated Tailwind class strings
| Pattern | Count | Sample files |
|---|---|---|
| `text-sm text-slate-500` | 351 | thread-pane (12), channel-switcher (11) + 117 others |
| `text-xs text-slate-500` | 124 | crm/page.tsx (5), crm/[guestId]/page.tsx (5) + 66 others |
| `font-mono` | 117 | webhooks/page.tsx (10), vendor-form-button (8) + 56 others |
| `inline-flex items-center gap-…` | 72 | 62 files |
| `border-slate-200 dark:border-slate-800` | 41 | 35 files |

---

## 4. Performance & slowness

### 🔴 Critical
- **FX N+1 in reservation loader** (`lib/beithady-daily-report/reservations.ts:157,168`) — per-row sequential `await toUsd()` × 2 × ~3000 rows = **30–60s wasted** on every daily-report build. Single biggest contributor to the 180s `maxDuration` budget. **Fix:** hoist `Map<currency, rate>` once outside the loop.
- **Engagement crons (pre-arrival, boarding-pass, csat, upsell)** loop sequentially with 5+ DB calls per arrival. 30 arrivals × 1.5s each = ~45s, can spike past Vercel's default 60s. **Fix:** `Promise.all` chunks of 5–8.
- **All 94 Beithady pages declare `force-dynamic`, zero use `revalidate`.** Read-mostly screens (settings, branding, audit log, SOPs) re-run their full query graph on every hit.
- **`build-payouts.ts:108,119,131`** does 3 sequential Stripe API calls (MTD / tomorrow / next-7d) — independent, parallelizable.

### 🟠 High
- **12 files use raw `<img>`** instead of `next/image` (gallery + messaging + ads). Gallery pages render 30–100 photos at full source resolution. **Estimated saving:** 10–20× bandwidth reduction; large LCP improvement on mobile.
  - Files: `gallery/_components/{asset-grid,selectable-asset-grid,unit-folder-card,asset-detail-modal}.tsx`, `communication/_components/{thread-pane,library-picker,attachment-menu,media-placeholder,find-availability-modal,listing-rail}.tsx`, `fnb/menu/items/[id]/_components/photo-form.tsx`, `ads/create/page.tsx`, `gallery/[buildingCode]/page.tsx`.
- **`distribute.ts:247`** awaits per-recipient `count(*)` + send + insert sequentially. 5–10 recipients = 10–20s wall time. **Use `Promise.allSettled`.**
- **Calendar grid: 6+ sequential queries** (`operations/calendar-data.ts:65,83,111,164,181,208`).
- **Morning brief WA loop** sends recipients one by one (`morning-brief/run.ts:80-95`). 6 recipients × 1.5s = 3–9s.
- **`amazon-eg-sourcer` cron will silently truncate** above ~120 items. POOL=4 × 10s × 500 items = 1250s worst case vs `maxDuration=300s`. **Fix:** chunk across daily ticks OR raise POOL OR shard.

### 🟡 Medium
- **Inventory dashboard runs 8 sequential queries** (`inventory/dashboard/page.tsx:18-103`). Several phases independent.
- **`beithady_gallery_assets` cover lookup** pulls all photos to derive 80 cover URLs (`calendar-data.ts:208-216`). Use `DISTINCT ON (listing_id)`.
- **38/39 `await recordAudit()` calls** should be `void recordAudit(...)`. Saves ~50–100ms per server action / cron tick.
- **`fetchMtlParentIds()` recomputed on every request** — should `unstable_cache` (data changes ~1×/day).
- **`getBookableListings`** not cached — fetches all 87 active listings + filters in JS on every fees-audit run.
- **Reviews builder fires 25 parallel Anthropic calls every 30 min** — no cache; same review summarized every cron tick until `delivery_complete=true`.
- **`recharts` imported eagerly in 2 client bundles** (~300–350 KB min). **Wrap in `next/dynamic({ ssr: false })`.**

### Cron handlers — runtime risk profile
| Handler | maxDuration | Risk | Recommended |
|---|---|---|---|
| `beithady-daily-report` | 180s | FX N+1 (~30s) + 6 builders + AI (~5s) + PDF (5–15s); p99 90–150s | **Fix FX → drops to <60s** |
| `beithady-amazon-eg-sourcer` | 300s | 1250s worst case at scale | **Chunk or shard** |
| `beithady-pre-arrival` (+ boarding/csat/upsell) | 60s default | Sequential per-arrival; can exceed | **Parallelize + raise to 120s** |
| `beithady-review-reply-queue` | n/a | Sequential Anthropic in `for` loop | `Promise.all(concurrency=4)` |
| `beithady-morning-brief` | n/a | Sequential WA sends | Parallelize WA send |

---

## 5. Stability & error handling

### 🔴 Critical
- **`beithady-inventory-auto-issue` two-phase write without transaction** (`route.ts:79-114`). Inserts header, then lines, then RPC. Vercel timeout between lines insert and post-issue RPC leaves a partially-posted issue with `status='approved'` and zero/incomplete lines — same legacy-artifact pattern SESSION_HANDOFF describes for `delivery_complete`. **Fix:** wrap all three steps in a single Postgres function (RPC).
- **`vercel-marketing-id` URL leaks plaintext webhook secret** (`beithady-guesty-webhook-register/route.ts:81-82, 94-99`). Secret only redacted in `note` (line 130), not in `error` (line 96). Guesty 4xx body could expose it.
- **Composer localStorage drafts accumulate indefinitely** (`composer.tsx:76-95`). Per-conversation key with no TTL; quota will eventually trip and silently no-op.
- **Latent schema-drift risk:** `fnb/inventory-items/route.ts:12-14` reads `default_cost_usd`, which migration `0068` describes as "dead schema, no callers, no longer refreshed." If a future migration drops it, route silently returns nulls. Same shape as recent `raw_review` bug.

### 🟠 High
- **38 of 51 Beithady API routes have no top-level try/catch.** Any uncaught throw inside `buildReport()`, `quoteStay()`, `renderReportXlsx()`, etc. surfaces as a Next.js framework 500 with stack trace.
- **Server actions throw raw `new Error(string)` to client** (`communication/actions.ts:42,53,55,96,137,153,246,248,252`, `analytics/reviews/actions.ts:23,33,44,95,103,104,125,134,136,189`, `setup/actions.ts:20`, `gallery/actions.ts:25-26`). With **zero `error.tsx` boundaries under `/beithady`**, every uncaught throw triggers Next's red error overlay or a generic 500.
- **35 of 35 server actions** read `String(formData.get(…))` and pass straight to Supabase without Zod. Highest-risk: communication, reviews, gallery, inventory actions.
- **Anthropic SDK: 14 of 14 call sites have no timeout, no retry, no rate-limit handling.** Claude 429 throws straight to caller; cron loops don't distinguish 429 from 5xx.
- **`resp.content[0].type` accessed without checking array length** (`reports/ai-commentary.ts:71`). Crashes on empty content array.
- **Guesty webhook idempotency: payload-hash dedupe absent** (`webhooks/guesty/conversation/route.ts`). Relies entirely on downstream `unique_key` derivation. Green-API has explicit dedupe via unique index — Guesty does not.
- **`scheduled-reports` cron silently drops failed recipients** (`route.ts:144-188`). Per-recipient catch logs and proceeds; `last_fired_at` and `next_fire_at` always advance, so a recipient with an expired Gmail token gets dropped from every future fire.
- **Fire-and-forget promises in HTTP handler** (`fnb/orders/[id]/route.ts:96-103`). `notifyGuestStatus(...).catch(...)` and `sendDeliveredReceipt(...).catch(...)` not wrapped in `waitUntil()` — Vercel may terminate before they resolve.
- **No timeout on `gallery/ai-label.ts:53` fetch** — Storage stall hangs cron worker until Vercel kills it; all 5 jobs in that tick are lost.
- **15 routes leak `error.message`** (already covered in §1).

### 🟡 Medium
- **`scheduled-reports` cron auth non-standard** — raw bearer compare without timing-safe; no `?force=` escape hatch.
- **`beithady-conversation-archive` has no top-level try/catch** — three `Promise.all` blocks unhandled.
- **`Schema.parse()` instead of `safeParse()` in 13+ FnB routes** — bad input crashes route as 500 instead of returning 400.
- **`auto-reply.ts` rate-limit only counts `auto_sent`** — classification storm (30 inbound msgs in <10 min) still triggers 30 Anthropic calls. Soft DoS / cost-attack vector.
- **Optimistic UI without rollback** in `count-entry-panel.tsx:65-72` (and 3 sibling components). User sees counted-qty unchanged even if save was rejected.

### ⚪ Low
- `beithady-comm-sync` swallows orphan-recovery failure into `console.warn`.
- `vendor-export` route has no validation of `vendor` field — silently produces VRBO-shaped CSV for unknown vendors.
- `runDailyReport` PDF render error doesn't tombstone the snapshot — next tick re-enters via `existingPayloadOk=true` short-circuit even though `pdf_bytes IS NULL`.

---

## 6. Brand & theme consistency

### Spec recap (from `src/lib/brand-theme.ts`)
- Navy `#1E2D4A` → `slate-800`
- Wordmark blue `#5F7397` → `slate-500`
- Cream `#F5F1E8` → CSS var `--bh-cream`
- Gold `#D4A93A` → `yellow-600`
- Lime parent uses lime/emerald (must not bleed into Beithady)

### 🔴 Critical
- **Three competing brand navies coexist** in the same module:
  1. Spec navy `#1E2D4A` (rare in actual code)
  2. Dashboard navy `#003462` — already exposed as `var(--bh-ink)` in `globals.css:60-77`; used heavily in `analytics/performance/**`
  3. Off-spec navy `#1e3a5f` (and gradient companion `#2c4d7a`) — **50+ instances** in `analytics/reports/**` and `setup/SendTestPanel.tsx:29`
  Locations include `analytics/reports/page.tsx:73,90,94,102`, `ReportViewer.tsx:66,87`, `ScheduleEditor.tsx:92,139`, `ReportBuilder.tsx:142,173,240,249,317,355,708`, `charts/index.tsx:29,59,87-88,95,174,377,382,443`, `CrossRefTable.tsx:125,142,293,335,338`, `CellDrillThroughModal.tsx:26,48,77,114`, `ChannelCompareModal.tsx:42,141`, `QuoteCalculator.tsx:47,115,155,156,159`, `AnomalyInspector.tsx:39`, `Heatmap.tsx:92`, `TitleBar.tsx:73`. **Fix:** remap `#1e3a5f` → `var(--bh-ink)`.
- **Subsidiary palettes leaking into Beithady screens:**
  - **Indigo (VOLTAUTO)** as primary CTA on financials: `financials/_components/PeriodControls.tsx:29,101` (`bg-indigo-600 hover:bg-indigo-700`).
  - **Cyan (Boat Rental)** on inventory: `inventory/_components/coming-soon.tsx:28` (`text-cyan-700`), `inventory/m/_components/mobile-pin-login.tsx:35` (gradient `via-slate-800 to-cyan-900`).
- **Beithady launcher uses 7-color rainbow** (`_components/beithady-launcher.tsx:30-40`: `slate | amber | emerald | rose | cyan | violet | indigo | gold`). Beithady should read as monochrome navy + gold; launcher tile diversification should come from iconography. Consumer pages (`analytics/page.tsx`, `crm/page.tsx`, `operations/page.tsx`, `gallery/page.tsx`, `inventory/page.tsx`, `operations/sop/page.tsx`) propagate this rainbow.

### 🟠 High
- **Performance dashboard panels broken in dark mode** — raw `text-[#003462]`/`text-[#6077a6]`/`bg-[#eae9f3]` doesn't flip. ~25 files affected: `top-bar.tsx`, all of `panels/**`, `dashboard-shell.tsx`, `manual-rebuild-button.tsx`, `customize-drawer.tsx`. Labels become low-contrast or invisible.
- **Wordmark loaded as `.jpg`** (`beithady-shell.tsx:73`, `settings/branding/page.tsx:37,40`) — JPG cannot have transparency, visible white halo on dark mode. PNG version (`Wordmark-03.png`) exists but only used by 1 page.
- **Status-color triplet `#15803d / #b45309 / #b91c1c` redeclared 4 times** (`panel-frame.tsx`, `panels/hero-kpi.tsx`, `panels/daily-activity.tsx`, `analytics/reports/fees-audit/_components/KpiStrip.tsx`). **Fix:** hoist to `STATUS_COLORS` token.
- **Banner background palettes hand-coded** (`#fdf3da/#7a5300`, `#fdecec/#9a2828`, `#eef3fb`) across `dashboard-shell.tsx:197-260` and 4 panel files — should be `--bh-banner-{warn,error,info}-*` tokens.
- **Two competing golds:** spec `#D4A93A` vs `#c9a96e` (in `charts/index.tsx:29,54,375,376`).

### 🟡 Medium
- **`text-[Npx]` arbitrary font sizes** appear 421 times across 100 files. `text-[8px]`/`text-[9px]` chips in `panels/reviews-block.tsx:37,38,57` are below readable size on mobile.
- **Border-radius distribution fragmented:** ~150 bare `rounded`, 103 `rounded-md`, 53 `rounded-lg`, 38 `rounded-xl`, 47 `rounded-full`, 29 `rounded-2xl`. Three competing primary radii for similar elements.
- **Shadow distribution fragmented:** 124 `shadow-sm`, 31 `shadow-md`, 35 `shadow-lg`, 7 `shadow-xl`, 17 arbitrary.
- **Heading typography drift:** 3 page-title scales coexist (`text-3xl font-bold` + serif in `BeithadyHeader`; `text-2xl font-semibold` in `top-bar.tsx`; `text-xl font-semibold` in `beithady-launcher.tsx`).
- **`text-red-*` mixed with `text-rose-*`** for danger.
- **`tracking-` value varies:** `tracking-wide`, `tracking-[0.12em]`, `tracking-[0.15em]`, `tracking-[0.18em]`.

### ⚪ Low / RTL
- **Zero `rtl:` Tailwind utilities used** despite Egyptian market. 31 files use `left-*`/`right-*` instead of logical `start-*`/`end-*`. 15 files use `dir=` attribute. Mobile inventory app (`inventory/m/`) is RTL-aware; rest of Beithady is LTR-only.
- `'#fff'` literals — should be `white`.
- Debug `[TEST]` prefix in `morning-brief/actions.ts:229` injected into broadcast body.

### Logo / asset usage
| Asset | Status | Recommendation |
|---|---|---|
| `wordmark.jpg` | Used in 2 places | Replace with PNG |
| `Wordmark-03.png` | Used in 1 place | **Promote to canonical** |
| `monogram.jpg` | Used in 1 place | Replace with PNG |
| `Icon-03.png` | Unreferenced (340 KB) | Delete or canonicalize |
| `mark.jpg` | Duplicate of monogram (57 KB) | Delete |
| `logo-stacked.jpg`, `logo-fmplus.jpg`, `pattern-bg.png` | Unreferenced | Delete |

### Tokens needing a centralized home
| # | Repeated value | Approx count | Suggested token |
|---|---|---|---|
| 1 | `#003462` deep navy | ~150 | enforce `--bh-ink` |
| 2 | `#6077a6` steel blue | ~120 | enforce `--bh-steel` |
| 3 | `#1e3a5f` off-spec navy | ~50 | **delete + remap** to `--bh-ink` |
| 4 | `#15803d / #b45309 / #b91c1c` status | ~30 × 3 | `--bh-status-{green,amber,red}` |
| 5 | `#fdecec / #9a2828 / #f1bcbc` error banner | 6 sites | `--bh-banner-error-*` |
| 6 | `#fdf3da / #7a5300 / #f1d889` warning banner | 4 sites | `--bh-banner-warn-*` |
| 7 | `#eef3fb` info bg | 3 sites | `--bh-banner-info-*` |
| 8 | `#f0e9d9 / #faf8f3 / #f5f3ec` cream variants | 8 sites | `--bh-cream-{50,100,200}` |

### Note on side-by-side screenshots
The user requested screenshots showing each deviation vs. the brand guideline. **A static audit cannot capture them** — needs `npm run dev` + Chrome MCP / Playwright. Top 5 places where a screenshot would most clearly communicate the deviation:
1. **Beithady launcher (`/beithady`)** — rainbow tile accents (most visible "no coherent brand" moment).
2. **Performance dashboard (`/beithady/analytics/performance`) in dark mode** — labels nearly invisible because raw `text-[#003462]` doesn't flip.
3. **Reports family vs Performance dashboard** — same browser tab side-by-side shows the `#1e3a5f` vs `#003462` navy mismatch.
4. **Financials page-controls (`/beithady/financials`)** — indigo Apply/Export button next to slate-themed cards.
5. **`BeithadyHeader` wordmark tile in dark mode** — JPG halo visible against `dark:bg-slate-900`.

If you want, I can spin up the dev server in a follow-up turn and capture these.

---

## Master prioritized action list

### Quick wins — fix this week (≤2 hrs each)

| # | Fix | Files | Effort | Risk | Dimension |
|---|---|---|---|---|---|
| 1 | Flip 17 cron auth `if (!expected) return true` → `false` + `console.error` | 17 cron handlers | 1h | Trivial | Functional |
| 2 | Add `src/app/beithady/error.tsx` (top-level error boundary) | 1 new file | 30min | Trivial | Stability |
| 3 | Hoist FX rate `Map` in `reservations.ts` (kills N+1) | `reservations.ts:138-205` | 1h | Low | Performance |
| 4 | `error.message` scrub: replace with `'database_error'` in 16 routes | 16 routes | 1h | Trivial | Functional |
| 5 | Add `AbortSignal.timeout(15_000)` to 3 uncovered fetches | 3 files | 30min | Trivial | Stability |
| 6 | Zod-validate 4 unprotected POST/PUT bodies | 4 routes | 1h | Trivial | Functional |
| 7 | Fix `scheduled-reports` to track per-recipient outcomes | 1 file | 1.5h | Low | Stability |
| 8 | Wrap `beithady-conversation-archive` in try/catch | 1 file | 15min | Trivial | Stability |
| 9 | `void recordAudit(...)` — drop awaits across 38 callsites | 15 files | 30min | Trivial | Performance |
| 10 | `Promise.all` the 2 RPCs in `beithady-guesty-backfill` | 1 file | 5min | Trivial | Performance |
| 11 | `next/dynamic` wrap `recharts` in 2 client components | 2 files | 30min | Low | Performance |
| 12 | Delete 480 KB of unused brand assets | `public/brand/beithady/` | 15min | Trivial | Code bloat |
| 13 | Delete `BEDROOM_BUCKETS` export + `@deprecated` shims | 3 files | 30min | Trivial | Code bloat |
| 14 | Remap `#1e3a5f` → `var(--bh-ink)` (regex replace) | ~15 files | 30min | Low | Brand |
| 15 | Hoist `STATUS_COLORS = {green,amber,red}` token | 4 files | 30min | Trivial | Brand |
| 16 | Replace `bg-indigo-*` and `bg-cyan-*` in Beithady (subsidiary colors) | 3 files | 30min | Low | Brand |
| 17 | Switch wordmark from `.jpg` to PNG (already exists) | 3 files | 15min | Trivial | Brand |
| 18 | `Schema.parse` → `Schema.safeParse` across 13 FnB routes | 13 routes | 1.5h | Low | Stability |

**Total quick-wins effort: ~13 hours.** Roughly 2 working days.

### Small refactors — fix this month (½–1 day each)

| # | Fix | Effort | Dimension |
|---|---|---|---|
| 1 | Add `src/lib/cron-helpers.ts` (`assertCronAuth`, `cairoHourGate`, `cronWrapper`); migrate 27 cron handlers | 1 day | Duplication |
| 2 | Add `src/lib/beithady/buildings.ts` + `channels.ts` + `format-money.ts` + `errors.ts` + `cairo.ts`; replace inline duplicates | 1 day | Duplication |
| 3 | Build `assertBeithadyPermissionApi()` + migrate 30 F&B callsites off `requireBeithadyPermission()` | ½ day | Functional |
| 4 | Wrap top-level try/catch around 38 API routes (template-driven) | ½ day | Stability |
| 5 | Centralized `getAnthropic({ timeout, maxRetries })` helper; migrate 14 callsites | ½ day | Stability |
| 6 | Parallelize engagement crons (pre-arrival, boarding-pass, csat, upsell) with `Promise.all` chunking | ½ day | Performance |
| 7 | Resolve 5 unscheduled engagement cron handlers (re-add to `vercel.json` OR delete) | ½ day | Code bloat |
| 8 | Convert 12 `<img>` → `next/image` | ½ day | Performance |
| 9 | Add `revalidate` to ~15 read-mostly Beithady pages | ½ day | Performance |
| 10 | Migrate Guesty webhook secret from query string → header | ½ day | Functional |
| 11 | Add payload-hash dedupe to Guesty webhook idempotency | ½ day | Stability |
| 12 | Build `<DialogShell />` primitive; migrate 9 inventory `_form-button` modals | ½ day | Duplication |

**Total small-refactor effort: ~7 days.**

### Larger refactors — fix this quarter (2–5 days each)

| # | Fix | Effort | Dimension |
|---|---|---|---|
| 1 | Wrap `beithady-inventory-auto-issue` header+lines+post in single Postgres RPC (transaction) | 2–3 days (DB + handler + test backfill) | Stability |
| 2 | Centralize Zod schemas for all 35 server actions; build `parseFormData()` helper | 3 days | Stability |
| 3 | Brand token system: define `--bh-*` for status colors, banners, cream variants; codemod replaces ~380 hex codes | 3–4 days | Brand |
| 4 | Launcher rainbow → monochrome navy + gold; refactor 7 consumer pages | 2 days | Brand |
| 5 | Performance dashboard dark-mode pass (raw hex → `var(--bh-*)` everywhere) | 2 days | Brand |
| 6 | RTL/Arabic readiness: convert `left-*`/`right-*` → `start-*`/`end-*`, add `rtl:` variants where layout flips | 4–5 days | Brand |
| 7 | `amazon-eg-sourcer` cron — chunk-and-resume across multiple invocations | 2 days | Performance |
| 8 | Build review summarization cache (skip re-summarize if `(review_id, public_review_hash)` unchanged) | 2 days | Performance |
| 9 | `getArchiveBuckets` SQL view (`GROUP BY year, month`) instead of pulling all archived rows | 1 day | Performance |

**Total larger-refactor effort: ~22–25 days.**

---

## Estimated total effort

| Phase | Tasks | Wall time |
|---|---|---|
| **Phase A — Quick wins** | 18 fixes | ~13 hours / 2 working days |
| **Phase B — Small refactors** | 12 items | ~7 working days |
| **Phase C — Larger refactors** | 9 items | ~22–25 working days |
| **Total** | 39 items | **~32–35 working days** (~7 calendar weeks at full focus) |

Realistic if Beithady is one of several priorities: **Phase A in the next sprint, B over the following 2 sprints, C scoped into the next-phase planning.**

---

## What's NOT recommended (to avoid scope creep)

The following came up during the audit but are **not worth changing now:**

- **`*-shared.ts` vs `*.ts` server/client splits** — intentional; flagged as confirmed-OK.
- **`@react-pdf/renderer` / `exceljs`** dependency replacement — both are used end-to-end; no lighter alternative justifies the migration cost.
- **`googleapis` whole-SDK import** — exists in `src/lib/gmail.ts` (outside Beithady scope). Worth fixing eventually, not this audit's priority.
- **Replacing `recharts` wholesale** — `next/dynamic` wrap captures most of the win; full migration to `visx`/`chart.js` is XL-effort with diminishing returns.
- **Channel brand colors in calendar** (Airbnb red, Booking.com blue, Hopper purple) — acceptable when they encode channel identity, just need a doc comment explaining the exception.

---

## Open question

**Screenshots:** Section 6 (brand) called out 5 places where a side-by-side screenshot would best communicate the deviation. Capturing them needs the dev server + Chrome MCP. **Do you want me to do that pass next?** (~20–30 min capturing, no code changes.) Otherwise we can align on this static audit's findings first.

---

*Generated 2026-05-08 by 6 parallel read-only sub-agents. No code modified during this audit.*
