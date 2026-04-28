# Kareemhady — Session Handoff (2026-04-28)

## 🟢 Latest turn — Finance Morning Brief: critical bug fix

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
42. **SOP/KB — A4 PDF export** (`61c9063`) — react-pdf renderer (brand-styled, A4, RTL-aware) + 2 API routes (per-article, per-role bundle with TOC) + download buttons on article detail + landing pages (this turn)

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
