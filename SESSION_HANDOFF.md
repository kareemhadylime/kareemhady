## 2026-05-16 — Net Worth Task 24: revolving liability detail (credit card / overdraft) ✅

**Scope:** Real detail page for revolving liabilities — utilization gauge with color tier, statement-timeline strip, pay-card modal with 4 presets (Minimum / Statement / Full / Custom), and a 50-row payment history table.

**Files:**
- New `src/app/api/personal/networth/liabilities/[id]/pay-card/route.ts` — POST handler, Zod-validated body `{ preset: enum, customAmount?: number }`, `getCurrentUser` + `is_admin` gate, `dynamic = 'force-dynamic'` + `runtime = 'nodejs'`. Public API uses `'minimum'`; route translates to `'min'` for `recordCardPayment`.
- New `src/app/personal/networth/_components/liabilities/revolving-detail.tsx` — client component, 4 KPI cards, statement timeline, Pay card button, payment history table. Util color: <30% emerald, 30-70% amber, >70% red.
- New `src/app/personal/networth/_components/modals/pay-card-modal.tsx` — backdrop + `ix-card` modal, 4 preset buttons (active state highlighted indigo), preview "Will pay: …" before submit, error inline.
- Modified `src/app/personal/networth/liabilities/[id]/page.tsx` — replaced revolving stub with real `<RevolvingDetail>`; fetches last 50 payments from `personal_networth_payments`.

**Confirmed `recordCardPayment` signature** at `src/lib/personal/networth/payment.ts:126` — `(liabilityId, appUserId, preset: 'min'|'statement'|'full'|'custom', customAmount?)`. Spec's preset enum used `'minimum'` (the public-API name); I translate in the API route since the lib uses `'min'`.

**Schema note:** Spec referenced `liability_schedule_id` on the payments table, but actual column is `loan_schedule_id` (see `supabase/migrations/0139_personal_networth.sql:148`). Adjusted both the page query and the component prop type accordingly.

**`npx tsc --noEmit`** — clean for all new/modified files. Pre-existing errors in `beithady-daily-report/build-dxb-section.test.ts` + `build-yesterday-summary.test.ts` are unrelated (`fare_accommodation_usd` test fixtures, from the other working-tree changes).

---

## 2026-05-16 — Revenue reconciliation BH dashboard ↔ Guesty Analytics (DIAGNOSED, in progress)

**User report:** BH "Month Revenue (OTB)" = $55.3k vs Guesty Analytics "Revenue" = $59,061 (This Month, Egypt). Couldn't reconcile.

**Root cause** (verified against `guesty_reservations`, May 2026, confirmed, check-in attribution):

| Metric | Value | Source field |
|---|---|---|
| Guesty Analytics Revenue | $60,302 (computed) ≈ $59,061 (shown) | `fare_accommodation` (gross — what guests paid) |
| BH "Month Revenue (OTB)" | $56,723 (computed) ≈ $55.3k (shown) | `host_payout` (net — after channel fees) |
| Gap | $3,579 (~6%) | OTA/channel commissions |

Both share the same attribution (check-in in calendar month, confirmed status, Egypt buildings). Small drift between computed and shown values comes from FX rate variance (we use fallback `EGP=0.0203, AED=0.2723`) and intraday status changes.

**Code reference:** `src/lib/beithady-daily-report/build-buildings.ts:206` uses `r.host_payout_usd`. The 2026-05-04 fix (in the same file, lines 193-205) switched timing from accrual to check-in attribution to match Guesty's "This Month" tile but didn't address gross-vs-net.

**Decision pending:** User asked between (1) switch to gross to match Guesty, (2) keep net + add a second "Gross Revenue" card, (3) document only. Awaiting reply.

**Diagnostic SQL recorded** so anyone who picks this up can re-verify with the same query set.

---

## 2026-05-16 — Closed both deferred follow-ups (rotation persistence + GCP redirect URI) ✅

**Task 1: refresh-token rotation persistence (commit `ee5db106`)** — [src/lib/gmail.ts:38](src/lib/gmail.ts:38) `getGmailClientFromRefresh` now diffs `credentials.refresh_token` against the pre-refresh value and, when Google rotates, writes `encrypt(new)` back to `accounts.oauth_refresh_token_encrypted` keyed off the exact ciphertext that came in. Lookup-by-ciphertext means no callsite changes (none of the ~6 callers pass an account id). Dormant today (Google's default OAuth2 web-server clients don't rotate), but if rotation is ever enabled per-client or becomes default, this avoids the silent self-revoke pattern that would have caused another 2026-05-11-style mass `invalid_grant`.

**Task 2: GCP Console — added `https://app.limeinc.cc/api/auth/google/callback`** — done via Claude-in-Chrome MCP. Project `kareemhady-inboxops`, OAuth 2.0 Client "InboxOps web" (client_id starts `593051355315-b4g0...`, created Apr 19, 2026). Authorized redirect URIs now: 1) `http://localhost:3000/api/auth/google/callback`, 2) `https://limeinc.vercel.app/api/auth/google/callback`, 3) `https://app.limeinc.cc/api/auth/google-youtube/callback` (pre-existing, YouTube), 4) `https://app.limeinc.cc/api/auth/google/callback` (new, Gmail). Google's UI flagged "may take 5 minutes to a few hours for settings to take effect."

**Two-step caveat for user testing app.limeinc.cc → Connect Gmail:**
1. Wait for Google's propagation (≥5 min from 2026-05-16) — otherwise the OAuth step returns `redirect_uri_mismatch`.
2. **app.limeinc.cc still serves the OLD code** until kareem updates the alias (per [vercel_lime_alias_quirk.md](file://C:/Users/karee/.claude/projects/C--kareemhady/memory/vercel_lime_alias_quirk.md)) — `vercel alias set <latest-deploy-url> app.limeinc.cc`. Without the alias bump, app.limeinc.cc still hard-codes redirect_uri to limeinc.vercel.app and the new URI never gets exercised. **limeinc.vercel.app works right now** (new code + URI both live).

**Alias bump done:** ran `vercel alias set lime-72yjh0f8q-lime-investments.vercel.app app.limeinc.cc` — app.limeinc.cc now serves the latest deploy that includes the OAuth host-aware fix, rotation persistence, select-all-in-category, and sort dropdown. Both hosts (limeinc.vercel.app + app.limeinc.cc) now have working Connect Gmail flows end-to-end. Offered to permanently fix the alias quirk by setting app.limeinc.cc as a Production Domain in Vercel dashboard (deferred — user can ask later).

---

## 2026-05-16 — SHIPPED: BH Ads Insights V3 (19/19 tasks) ✅

**Scope:** Time/patterns (D1 heatmap, D2 pacing, D3 period delta) + Optimization (E1 top-ads, E2 top-assets, E3 anomaly banner, E4 AI narrative). Spec [docs/superpowers/specs/2026-05-16-bh-ads-v3-time-optimize-design.md](docs/superpowers/specs/2026-05-16-bh-ads-v3-time-optimize-design.md), plan [docs/superpowers/plans/2026-05-16-bh-ads-insights-v3.md](docs/superpowers/plans/2026-05-16-bh-ads-insights-v3.md). Executed task-by-task via subagent-driven-development (implementer + spec reviewer + code-quality reviewer per task).

**What landed on `/beithady/ads/`:**
- **Main page (`/beithady/ads`)**: `<AiSummaryCard />` at top (Generate-button gated to 20 calls/day, renders 3-paragraph Claude narrative), `<AnomalyBanner />` after per-building filter (auto-hides when no anomalies, amber/rose by severity), `<SpendPacingCard />` after FRT card (SVG sparkline + per-campaign EGP cap bars + EOM projection warnings), and `<PeriodDeltaBadge />` on Spend/Leads/CPL/Bookings/Revenue KPI cards (current vs prior comparison).
- **Audience page (`/beithady/ads/audience`)**: two new tabs — **Time** (7×24 day×hour heatmap with Lead-density / Meta-hourly-spend URL-toggle) and **Optimize** (top-ads sortable table by leads/CTR/CPL + top-creative-assets table with thumbnails).

**Infrastructure:**
- Migration **0140** `ads_hourly_metrics` (campaign × date × hour) applied. Table empty until next insights cron run populates it from Meta `hourly_stats_aggregated_by_advertiser_time_zone` breakdown.
- Cron `beithady-ads-insights` extended with per-campaign Meta hourly fetch (wrapped in own try/catch — failure here does NOT break daily flow).
- Cron `beithady-ads-anomaly-alert` refactored to call shared `detectAnomalies()` from new `src/lib/beithady/ads/anomalies.ts` — behavior identical, dedup metadata preserved.
- New libs: `hourly.ts`, `pacing.ts`, `top-ads.ts`, `top-assets.ts`, `anomalies.ts`, `ai-summary.ts`. New `getDashboardKpisWithCompare()` in `reporting.ts` returns `{current, prior|null}` for D3 delta.
- AI summary uses `@/lib/anthropic` SDK wrapper with `HAIKU = 'claude-haiku-4-5-20251001'`, on-demand only (no cron), ~$0.01/call, 20/day cap via `beithady_audit_log` count.

**Commit chain** (18 V3 commits + 1 final handoff, all on `origin/main`, all auto-deployed):
`e72e6d2` migration · `8edc81f` hourly.ts · `1a58ac0` extend insights cron · `eedb1ca` anomalies.ts · `170d808` refactor anomaly cron · `28934e7` pacing.ts · `6b9b681` top-ads.ts · `fa3cd13` top-assets.ts · `05b6211` ai-summary.ts · `c7b34b3` reporting.compare · `7297234` generateAiSummaryAction · `5fa5a24` AnomalyBanner · `67804a5`+`a611976` SpendPacingCard · `4b07a87` AiSummaryCard · `960c046` TimeTab · `c5f89aa` OptimizeTab · `f1af1d2` wire main page · `c3771e8` wire audience page.

**Verification:** `npx vitest run` → **922 passed / 22 skipped / 0 failed** (+73 new tests vs V2's 849). `npx tsc --noEmit` → clean. Migration 0140 present in `schema_migrations` (version `20260516133547`).

**Smoke checklist for kareem (manual UI):**
- [ ] Open `/beithady/ads` — confirm AI summary card renders (will show "Generate AI summary" button; first click costs ~$0.01).
- [ ] Confirm Spend pacing card shows sparkline + per-campaign cap bars (will be empty if no `ads_campaigns.monthly_budget_cap_usd` set — that's expected, not a bug).
- [ ] Confirm PeriodDeltaBadge appears on KPI cards (only when prior period has data).
- [ ] Open `/beithady/ads/audience?tab=time` — confirm 7×24 heatmap renders with Lead density default, toggle to Meta spend.
- [ ] Open `/beithady/ads/audience?tab=optimize` — confirm top-ads sortable + top-assets thumbnails.
- [ ] Wait for next `beithady-ads-insights` cron tick (Cairo 8am) to populate `ads_hourly_metrics` so the Meta-spend heatmap mode has data.

**Known followups (not blocking V3):**
- Per-building filter on V1's geo/demo/device rollups uses campaign-level approximation (filters to campaigns with attributable leads to that building, not row-level attribution). Documented in V2 spec § "limitations".
- Anomaly cron now calls shared `detectAnomalies()` but still maintains legacy `{kind, detail}` metadata shape for dedup compatibility with existing `bh_ads_alerts` rows.

---

## 2026-05-16 — Session wrap (3 things shipped, 1 user task pending)

This session's full sequence (newest at top below):
1. **Inbox bulk-all + sort dropdown** — pushed `2806d662`, live after auto-deploy.
2. **Gmail OAuth host-aware redirect_uri fix** — pushed `168a3a11` + handoff `a12d807f`, live. **Pending user action:** add `https://app.limeinc.cc/api/auth/google/callback` as an Authorized redirect URI in the same Google Cloud Console OAuth 2.0 Client that has `https://limeinc.vercel.app/api/auth/google/callback`. Without it, app.limeinc.cc connects will fail with `redirect_uri_mismatch` (a clear error, not the old `invalid_state`). limeinc.vercel.app works right now.
3. **Diagnosed 3 mailbox `invalid_grant` mass-revoke** — no code, user action is to click Connect Gmail on each mailbox. Recommended doing from `limeinc.vercel.app/personal/email/setup/accounts` until GCP redirect URI is added.

Open follow-up flagged but not implemented: persist rotated refresh tokens in `getGmailClientFromRefresh` ([src/lib/gmail.ts:38](src/lib/gmail.ts:38)). Dormant today; would matter if Google ever enables rotation by default. YouTube OAuth ([google-youtube/start/route.ts:22](src/app/api/auth/google-youtube/start/route.ts:22)) hard-codes `app.limeinc.cc` — symmetric to the Gmail bug just fixed; not blocking anyone today.

---

## 2026-05-16 — Personal email category drill-down: select-all-in-category + sort dropdown (DONE)

**User asked for two things on `/personal/email?category=<slug>`:**
1. A way to act on every email in the category, not just the visible 500.
2. Sort by sender or date in either direction.

**Implementation:**
- `loadCategoryTotal({accountId, category})` added to [src/lib/personal-email/inbox-query.ts](src/lib/personal-email/inbox-query.ts) — count query mirroring loadInbox's default filters (personal domain, INBOX-only).
- 3 new server actions in [src/app/personal/email/actions.ts](src/app/personal/email/actions.ts): `archiveAllInCategory`, `markAllReadInCategory`, `moveAllInCategory`. Shared `resolveCategoryRows` helper groups by account-token; Gmail batchModify chunked at 1000. `moveAllInCategory` skips auto-rule creation (bulk gesture would spawn N from_domain rules — moveEmail single-row path still creates them).
- [src/app/personal/email/page.tsx](src/app/personal/email/page.tsx) `CategoryFlatView` fetches totalCount in parallel and passes it + accountId to DrillDownView.
- [src/app/personal/email/_components/drill-down-view.tsx](src/app/personal/email/_components/drill-down-view.tsx):
  - Gmail-style "Select all N in <Category>" banner appears when page checkbox selects all 500 AND `totalCount > rows.length`. Clicking switches to selectAllInCategory mode where the bulk actions call the new server actions.
  - BulkBar count label disambiguates ("1,847 selected · all in Beithady").
  - SortDropdown (compact native `<select>`) at the right of the header bar. Modes: Date ↓/↑, Sender A→Z/Z→A. Priority-tier-on-top behavior preserved — sort applies as within-tier tiebreaker.
- Sender sort key: display-name when present, falls back to email; case-insensitive.

`npx tsc --noEmit` clean. needs-review surface unaffected (omits totalCount → banner doesn't render).

---

## 2026-05-16 — BH Ads V3 Task 17: Wire 3 new cards + D3 delta into main page (DONE, commit f1af1d2e)

**Changes to `src/app/beithady/ads/page.tsx`:**
- Added imports: `AiSummaryCard`, `AnomalyBanner`, `SpendPacingCard`, `PeriodDeltaBadge`, `getDashboardKpisWithCompare`, `supabaseAdmin`
- Switched KPIs fetch from `getDashboardKpis` to `getDashboardKpisWithCompare` (returns `{ current, prior }`)
- Added Supabase queries for most-recent AI summary row + daily call count for `<AiSummaryCard />` usage gate
- Rendered `<AiSummaryCard />` at very top (above `<AdsTabs />`)
- Rendered `<AnomalyBanner />` after `<PerBuildingFilter />` (before platform-status row)
- Rendered `<SpendPacingCard />` after `<FrtCard />` and before `<AudienceSummaryWidget />`
- Extended inline `Stat` component to accept `delta?: { current, prior, reverseColor? }` and renders `<PeriodDeltaBadge />` when present
- Applied delta to Spend, Leads, CPL (reverseColor), Bookings, Revenue KPI cards; Active + Drafts left unchanged (snapshots, not period totals)
- tsc: 0 errors. Test suite: 918 passed, 22 skipped, 0 failed. Pushed to origin main.

## 2026-05-16 — Personal-email mailboxes all showing "refresh token invalid — reconnect" (DIAGNOSIS ONLY, no code change)

**User asked why the 3 personal mailboxes (FM+, GMAIL, LIME) all show the reconnect badge.**

**Confirmed via SQL on `personal_email_classification_runs`:**
- All 3 are returning `invalid_grant` from Google's token endpoint on every 15-min cron tick.
- FM+ first failed **2026-05-04 07:45 UTC** (alone). GMAIL + LIME first failed together at **2026-05-11 11:15 UTC**.
- Last successful classify: ~2026-05-11 11:00 UTC for all three.
- Run counts since: FM+ 365, GMAIL 351, LIME 351.

**Why this isn't a code/config bug:**
- The 7-day staggered split (FM+ alone, then GMAIL+LIME together) rules out encryption-key rotation, client-secret change, or a code regression — those would have killed all three simultaneously.
- Tokens were issued 2026-04-19 and lasted 15+22 days, so Google's "OAuth consent screen Testing mode → 7-day expiry" is NOT the cause either.
- Leading explanations: user revocation at myaccount.google.com/permissions on May 11 (paired death), and an FM+ workspace admin restriction or manual revoke on May 4.

**Action for user:** click Setup → reconnect each mailbox. `accounts` row is upserted on `email` ([api/auth/google/callback/route.ts:55](src/app/api/auth/google/callback/route.ts:55)) so no data loss; the 1,000 already-classified emails stay.

**Follow-up worth flagging (offered as a separate task):** [src/lib/gmail.ts:38](src/lib/gmail.ts:38) `getGmailClientFromRefresh` calls `refreshAccessToken()` but never writes the (possibly rotated) refresh token back to `accounts.oauth_refresh_token_encrypted`. Dormant today (Google's default OAuth2 web-server config doesn't rotate), but if rotation is ever enabled, every refresh silently revokes the stored token — exact symptom would look like this incident.

**Then user hit `{"error":"invalid_state"}` on `/api/auth/google/callback`.** First-pass diagnosis (timing/two-tabs/refresh) was wrong; retries kept failing. **Actual root cause = host mismatch:** user clicks Connect Gmail from `app.limeinc.cc/personal/email/setup/accounts`. Setup link is relative ([src/app/personal/email/setup/accounts/page.tsx:29](src/app/personal/email/setup/accounts/page.tsx:29)) so [start/route.ts:15](src/app/api/auth/google/start/route.ts:15) runs on app.limeinc.cc and sets `oauth_state` cookie there. But `GOOGLE_OAUTH_REDIRECT_URI` is hard-coded to `https://limeinc.vercel.app/api/auth/google/callback`, so Google redirects to limeinc.vercel.app — cookie is stranded on the other host, callback sees no cookie, returns `invalid_state`. Deterministic, not a timing issue.

**Workaround given:** open https://limeinc.vercel.app/personal/email/setup/accounts directly (not the app.limeinc.cc bookmark) and click Connect Gmail from there.

**Permanent fix IMPLEMENTED (commit `168a3a11`):** `getAuthUrl` and `exchangeCode` in [src/lib/gmail.ts](src/lib/gmail.ts) now accept an optional `redirectUri`; [start/route.ts](src/app/api/auth/google/start/route.ts) and [callback/route.ts](src/app/api/auth/google/callback/route.ts) compute it from `new URL(req.url).origin` so cookie and callback always land on the same host. Matches the pattern Google Ads already uses ([google-ads/start/route.ts:15-16](src/app/api/auth/google-ads/start/route.ts:15)). `npx tsc --noEmit` clean.

**Requires GCP Console action (user task):** add `https://app.limeinc.cc/api/auth/google/callback` to Authorized redirect URIs on the OAuth client that currently has `https://limeinc.vercel.app/api/auth/google/callback`. Until that's done, Google will reject the redirect from app.limeinc.cc with `redirect_uri_mismatch` (a clear error, distinct from `invalid_state`).

**Out of scope (separate follow-ups):**
- YouTube OAuth flow ([google-youtube/start/route.ts:22](src/app/api/auth/google-youtube/start/route.ts:22)) has the inverse bug — hard-codes `app.limeinc.cc` via `NEXT_PUBLIC_APP_URL`, so a user starting from `limeinc.vercel.app` would hit the same symptom but in the other direction. Not blocking anyone today since the user is on app.limeinc.cc anyway.
- `app.limeinc.cc` Vercel alias doesn't auto-update on deploy (per memory `vercel_lime_alias_quirk.md`), so this fix won't be live on app.limeinc.cc until the alias is manually updated via `vercel alias set <deploy-url> app.limeinc.cc`. Works on limeinc.vercel.app immediately.

---

## 2026-05-16 — payment.ts code review fixes (DONE)

Applied 2 fixes from code review to `src/lib/personal/networth/payment.ts`:
1. **Correctness bug**: `recordPaymentForRecurringTemplate` — template `next_run_date` update now captures `{ error }` and throws on failure; previously swallowed silently which would cause the cron to re-fire and create a duplicate payment row.
2. **Correctness bug**: `recordCardPayment` `'min'` preset — throws `Error` when `min_payment_pct` is `null` instead of silently falling back to 5%; responsibility pushed to the form layer.

1/1 tests still pass. `tsc --noEmit` clean. Commit `06c44e30`.

---

## 2026-05-16 — Task 11: payment.ts — recordPayment + variants (DONE)

**Created:**
- `src/lib/personal/networth/payment.ts` — 4 exports: `recordPayment` (generic insert into `personal_networth_payments`), `recordPaymentForSchedule` (reads schedule row, inserts payment, marks schedule paid, updates balance), `recordPaymentForRecurringTemplate` (reads template, inserts payment, advances `next_run_date`, optionally marks next unpaid schedule row), `recordCardPayment` (credit-card/overdraft preset-based payment with min/statement/full/custom amounts, validates amount > 0).
- `src/lib/personal/networth/payment.test.ts` — smoke test (1/1 pass).

**TDD:** red → green confirmed. `tsc --noEmit` clean on payment files (2 pre-existing unrelated errors in `insights-demo.test.ts`). Added `ScheduleWithLiability` local type to handle Supabase join result inference. Commit `7e1117c`.

---

## 2026-05-16 — BH Analytics Performance redesign (DONE)

Implemented the four follow-ups to the gross-revenue card work:

1. **Gross card now on the Performance page too.** Was previously only on the landing pulse. Added `hero-mtd-revenue-gross` to `panel-registry.ts` (defaultVisible: true) and a matching HeroKpi block in `dashboard-shell.tsx` between net-OTB and RevPAR.
2. **Auto-shrink long values.** `hero-kpi.tsx` now picks a font size based on value-string length: ≥9 chars → text-base/lg/xl, ≥7 chars → text-lg/xl/2xl, else text-xl/2xl/3xl. So "$60.1k" sits cleanly and "$1,234.5k" wouldn't overflow either.
3. **Persistent MoM sub-line on every tile.** New optional `mom?: Delta` prop on `HeroKpi` renders a tiny "▲ +X% vs last month" below the existing delta, in green/red. Dashboard-shell + landing-pulse both load a same-day-last-month snapshot independently of the compare-mode selector (window ±5 days for tolerance) via `loadNearestSnapshot(computePriorDate(date, 'last-month'), 5)`. Each tile computes its own `mom` via `momPp` / `momPct` / `momAbs` helpers; returns `undefined` when the prior is missing or zero so noisy "+∞%" is hidden.
4. **Grid redesign.** Switched both pages from `lg:grid-cols-5 xl:grid-cols-5` (which gave 5+5+1 orphan after gross card landed) to `lg:grid-cols-4 xl:grid-cols-4`. 11 tiles render as 4+4+3 — balanced, no orphan row.

**On the "active-listings-only occupancy" request:** verified existing code already does this. `src/lib/beithady-daily-report/units.ts:85` `isPhysicalUnit` returns false when `row.active === false`. DB has 87 active + 3 inactive listings; snapshot total_units = 77 (= 87 active − 10 MTL parents/DXB). No code change needed; added confidence comment instead. The gap with Guesty's occupancy (39.8% vs 41.69%) comes from different numerator definitions (likely DXB inclusion / inquiry-vs-confirmed), not denominator scope.

**Files touched:**
- `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx` — added lastMonth props, momPp/momPct/momAbs helpers, gross card, mom prop on all 11 tiles, grid → 4 cols
- `src/app/beithady/analytics/performance/_components/panels/hero-kpi.tsx` — new mom prop, sizeClassFor() auto-shrink
- `src/app/beithady/analytics/performance/_lib/panel-registry.ts` — hero-mtd-revenue-gross panel id
- `src/app/beithady/analytics/performance/page.tsx` — load lastMonth snapshot via existing computePriorDate + loadNearestSnapshot
- `src/app/beithady/_components/landing-pulse.tsx` — mirror lastMonth load + momPp/momPct/momAbs + mom on tiles + grid → 4 cols

**Status:** build clean.

---

## 2026-05-16 — BH Analytics Performance redesign request (SUPERSEDED — see entry above)

User flagged that the new Gross Revenue card was added to the Beit Hady landing (Today's Pulse) but **NOT to `/beithady/analytics/performance`** — the analytics page still shows only the 9 original tiles in a 5×2 grid plus one orphan ($0m response-time tile). Also asked for four further changes:

1. **Active-listings-only occupancy** — all occupancy calculations should exclude inactive listings (currently inactive listings are counted in the denominator → drags occupancy % down)
2. **Net Payout tile font shrink** — "$56.5k" label overflows; reduce font so the tile size stays consistent with neighbors
3. **MoM comparison sub-line on every tile** — small font + colored up/down arrow showing last-month value (green up / red down)
4. **Grid redesign** — current 5×2 + orphan row looks awkward; need a balanced layout for 10–11 tiles

Status: posted model-suggester (`/model opus recommended for best output`, score 4 — multi-page, multi-system, cross-cutting design + data work). **Standing by for user's `continue` or `/model opus` switch before touching code.**

Files likely to touch when work resumes:
- `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx` (page that's missing the gross card)
- `src/app/beithady/analytics/performance/_lib/panel-registry.ts` (where Hero KPIs are registered)
- `src/app/beithady/analytics/performance/_components/panels/hero-kpi.tsx` (per-tile rendering — font + MoM sub-line)
- `src/lib/beithady-daily-report/build-buildings.ts` (occupancy denominator — restrict to active listings)
- `src/lib/beithady-daily-report/types.ts` (add `*_prev_month_usd` / `*_prev_month_pct` twin fields for MoM)
- `src/lib/beithady-daily-report/build.ts` (compute MoM by querying snapshot for first-of-prev-month or by re-running build for prev month range)

---

## 2026-05-16 — Reconcile BH dashboard revenue with Guesty Analytics (DONE)

**User question:** "I can't match the Analytic Revenues between BH app & guesty" — Guesty Analytics → General Overview showed $59,061 for May 2026 / Egypt; Today's Pulse "Month Revenue (OTB)" showed $55.3k.

**Root cause:** BH dashboard sums `host_payout` (net of channel commissions). Guesty Analytics "Revenue" tile sums `fare_accommodation` (gross — what guests paid for accommodation). Verified directly via Supabase for May 2026, confirmed-only, check-in attribution, Egypt scope:
- host_payout sum = $56,723 ≈ BH's $55.3k (residual drift = today's cancellations/inquiries flipping)
- fare_accommodation sum = $60,302 ≈ Guesty's $59,061 (residual drift = FX rate differences)
- The ~6% gap = OTA commissions on Airbnb/Booking.com

Side-by-side per-building check-in / confirmed-only, May 2026:
| Bld | n | host_payout | fare_accom |
|---|---:|---:|---:|
| BH-26 | 67 | $22,807 | $24,845 |
| BH-73 | 48 | $14,473 | $15,050 |
| BH-435 | 34 | $11,785 | $11,788 |
| BH-OK | 14 | $4,171 | $4,258 |
| Other | 12 | $3,487 | $4,361 |
| **Egypt total** | **175** | **$56,723** | **$60,302** |

**Fix (option 2 — keep net + add gross card):**
- `src/lib/beithady-daily-report/reservations.ts`: load `fare_accommodation` from Guesty, convert to USD via fx_rates_usd
- `src/lib/beithady-daily-report/types.ts`: optional `revenue_mtd_gross_usd?` / `revenue_mtd_gross_actual_usd?` on BuildingBucket (older snapshots → undefined → 0)
- `src/lib/beithady-daily-report/build-buildings.ts`: sum fare_accommodation into accumulator alongside host_payout; emit gross fields per-building + accAll
- `src/app/beithady/_components/landing-pulse.tsx`: add "Month Revenue (Gross)" hero KPI card next to the existing net "Month Revenue (OTB)" card; relabeled net card sub-text to "net payout · incl. confirmed → EOM" for clarity

**Cron rebuild flag (commit 59fa632c):** also added `?rebuild=1` to `/api/cron/beithady-daily-report` so we can force a snapshot regen without waiting for the next morning tick whenever a new payload field ships. Passes `forceRebuild: true` to `runDailyReport`, same Bearer-CRON_SECRET auth.

**Verified live:** triggered `?force=1&rebuild=1`, the resulting `daily_report_snapshots` row for 2026-05-16 now carries:
- `revenue_mtd_usd`: **$56,512.57** (net payout, OTB)
- `revenue_mtd_gross_usd`: **$60,112.60** (gross) → matches Guesty's **$59,061** within 2% (residual = FX rate differences between our `fx_rates_usd` table and Guesty's internal rates)
- `revenue_mtd_actual_usd`: $40,198.56
- `revenue_mtd_gross_actual_usd`: $41,345.20

Dashboard now shows both cards side-by-side on the Beit Hady landing — net for owner economics, gross for Guesty parity.

**Commits:** e9ca504c (feature) + 59fa632c (rebuild flag).

---

## 2026-05-16 — YouTube OAuth redirect URI host derive (DONE)

**Bug:** Inverse of the 168a3a11 Gmail fix — YouTube OAuth start + callback both built `redirectUri` from `NEXT_PUBLIC_APP_URL` (with `.trim()` + a hard-coded `https://app.limeinc.cc` fallback). If a user clicks Connect YouTube from a host other than NEXT_PUBLIC_APP_URL (e.g. `limeinc.vercel.app`), the `oauth_yt_state` cookie is set on the source host, but Google sends the consent to the env-var host — cookie missing on callback → `invalid_state`. Wasn't blocking anyone today; pre-emptive cleanup.

**Fix:** mirror Gmail's approach. Both `src/app/api/auth/google-youtube/start/route.ts` and `.../callback/route.ts` now compute `redirectUri = \`${url.origin}/api/auth/google-youtube/callback\``. Since start and callback run on the same host (Google echoes whatever redirect_uri start sent), the two `url.origin` values agree and the cookie roundtrips cleanly. Every host used must be registered as an Authorized redirect URI in the YouTube OAuth client in Google Cloud Console.

**Verification:** build clean. No runtime test triggered — first real Connect YouTube click from either host will exercise the path.

---

## 2026-05-16 — Pause/Activate button missing for Google campaigns (DONE)

**Bug:** Live Google campaigns (status='ENABLED') had no Pause button on either the campaign-detail page or the campaigns list page. The UI gate `upperStatus === 'ACTIVE' || upperStatus === 'PAUSED'` only matched Meta/TikTok dialects; Google stores `'ENABLED'`. Backend dispatcher in `status.ts` already translates `'ACTIVE'`→`'ENABLED'` correctly, so this was a UI-only blocker.

**Fix:**
- `src/lib/beithady/ads/platforms.ts`: added `isRunningCampaignStatus`, `isPausedCampaignStatus`, `isFlippableCampaignStatus`, `nextFlipStatus` helpers — recognize `ACTIVE`/`ENABLED`/`ENABLE` as running and `PAUSED`/`DISABLE`/`DISABLED` as paused
- `src/app/beithady/ads/campaigns/[id]/page.tsx`: replaced inline `'ACTIVE'`/`'PAUSED'` checks with helpers
- `src/app/beithady/ads/campaigns/page.tsx`: same fix in three places (gate, value, label/icon)

---

## 2026-05-16 — Google audience breakdowns: end-to-end fix (DONE)

**Bug:** Campaign-detail Audience snapshot showed "No data yet" for all three breakdowns on Google campaigns. `ads_insights_geo|demo|device` had **zero** Google rows.

**Five distinct issues uncovered by iterative cron triggering:**

1. **missing_credentials** — cron called `loadGoogleAdsCredentials()` without the per-account refresh-token fallback. `integration_credentials.google_ads.config` has no `refresh_token`; the only Google OAuth token lives on `ads_accounts.google_refresh_token` (which spend-sync already passes through).
2. **Wrong URL-path customer** — cron used `acct.google_login_customer_id || creds.login_customer_id` (MCC parent), not the leaf customer that owns the campaign.
3. **BAD_NUMBER for drafts** — draft `external_id="draft_..."` → NaN in `campaign.id = NaN`.
4. **PROHIBITED_SEGMENT_IN_SELECT_OR_WHERE_CLAUSE** — GAQL used `segments.geo_target_country/city`, `segments.gender`, `segments.age_range` — Google v24 rejects these for geographic_view / gender_view / age_range_view. Correct fields: `geographic_view.country_criterion_id`, `ad_group_criterion.gender.type`, `ad_group_criterion.age_range.type`.
5. **Postgres "ON CONFLICT DO UPDATE cannot affect row a second time"** — geographic_view emits one row per (date, country, location_type ∈ {LOCATION_OF_PRESENCE, AREA_OF_INTEREST}). Both share the (campaign, date, country) upsert key. Filtered query to `location_type = 'LOCATION_OF_PRESENCE'` — also fixes double-counting.

**Files changed:**
- `src/lib/beithady/ads/google-client.ts` — new `getEffectiveGoogleCustomerIds()` helper; fixed geo/gender/age GAQL; LOCATION_OF_PRESENCE filter
- `src/lib/beithady/ads/insights-geo.ts` — `normalizeGoogleGeoRows` reads `geographicView.countryCriterionId`
- `src/lib/beithady/ads/insights-demo.ts` — `normalizeGoogleDemoRows` reads `adGroupCriterion.{gender,ageRange}.type`
- `src/lib/beithady/ads/insights-geo.test.ts` + `insights-demo.test.ts` — fixtures updated, 12 tests pass
- `src/app/api/cron/beithady-ads-breakdowns/route.ts` — credentials hoisted with refresh-token fallback; MCC expansion; skip drafts; iterate effective customers; capture geo+demo+device errors (not just geo); audit log records per-campaign `failures[]`

**Verification:** Manual cron trigger returned `{campaignId:4, ok:true}`. DB now has 24 rows in `ads_insights_geo` for Google campaign 4 — all SA (3,976 clicks / 69,378 imps over 24 days). Demo + device returned 0 rows; this Search campaign doesn't have explicit demographic targeting (gender/age views also unavailable for PMax). Error-capture improved so future failures will surface in the audit log without redeploys.

**Commits:** f35c567, 1876f03, 0ee84997, 79e551fe.

---

## 2026-05-16 — liability.ts code review fixes (DONE)

Applied 3 fixes from code review to `src/lib/personal/networth/liability.ts`:
1. **Critical**: validate amortizing required fields (`principal`, `aprPct`, `termMonths`, `startDate`) before generating schedule — throws descriptive error instead of silently passing `undefined` as NaN. Removes all `!` non-null assertions. Adds atomicity comment (V1 two-step write trade-off).
2. **Important**: parent insert error now uses codebase pattern `throw new Error(\`createLiability insert failed: ${...}\`)` instead of re-throwing raw Supabase error.
3. **Important**: schedule insert error uses same pattern `throw new Error(\`createLiability schedule insert failed: ${...}\`)`.

1/1 tests still pass. tsc clean on `liability.ts` (5 pre-existing errors in unrelated `anomalies.test.ts`). Commit `9f4db43`.

---

## 2026-05-16 — Task 10: liability.ts — createLiability + updateBalance + markScheduleRowPaid (DONE)

**Created:**
- `src/lib/personal/networth/liability.ts` — 3 exports: `createLiability` (inserts liability row + auto-generates amortization schedule for `amortizing_loan`/`bnpl` kinds), `updateBalance` (for revolving balances), `markScheduleRowPaid` (links a schedule row to a payment).
- `src/lib/personal/networth/liability.test.ts` — smoke test (1/1 pass).

**TDD:** red → green confirmed. `tsc --noEmit` clean. Commit `5d2b486`.

---

## 2026-05-16 — snapshot.ts code-quality polish (DONE)

**4 fixes applied to `src/lib/personal/networth/snapshot.ts`:**
1. Round `stocksEgp` via `Math.round(* 100) / 100` before pushing to lines (consistency with all other lines).
2. `console.warn` on `currentRes.error` before defaulting `stocksEgp=0` (silent failure was invisible).
3. Comment above the two-step parent→lines write documenting the orphan-parent V1 trade-off.
4. `cutoff.setDate(1)` before `setMonth()` in `listSnapshotsForChart` to prevent JS day-overflow bug on month-end call dates.

**Tests:** 2/2 pass. `tsc --noEmit`: clean. Only `snapshot.ts` in commit.
**Commit:** `38eeff1`

---

## 2026-05-16 — Task 9: networth snapshot.ts + snapshot.test.ts (DONE)

**What:** Created `src/lib/personal/networth/snapshot.ts` and `snapshot.test.ts`.
- `takeSnapshot(appUserId, kind)` — pulls active assets + liabilities + `v_personal_networth_current.stocks_pipe_egp`, converts all to EGP via `ratesAsOf()`, writes parent row to `personal_networth_snapshots` then N child rows to `personal_networth_snapshot_lines`. Returns `{snapshotId, netWorthEgp}`.
- `listSnapshotsForChart(appUserId, months)` — returns last N months of snapshots ordered ascending for the hero sparkline.
- `SnapshotKind` type exported (`'monthly_auto' | 'manual'`).
- Negative stocks values included (`stocksEgp !== 0`, not `> 0`) — handles margin-account debit scenarios.
- Smoke tests: 2/2 pass. `tsc --noEmit`: clean.
- Commit: `0b6f9f5` — `feat(networth): snapshot + listSnapshotsForChart`

**Next:** Task 10 onward (remaining Phase B business logic).

---

## 2026-05-16 — Task 8 code-review fix: ratesAsOf one-query + latestRate date filter (DONE)

**What:** Applied two code-quality fixes to `src/lib/personal/networth/fx.ts`:
- **Fix 1 (ratesAsOf):** Replaced N+1 query loop (1 currencies query + N per-currency queries) with a single `personal_networth_fx_rates` query, sorted `(currency_code asc, as_of_date desc)`, deduped in a JS loop. One DB round-trip regardless of currency count.
- **Fix 2 (latestRate):** Added `.lte('as_of_date', today)` guard using `new Date().toISOString().slice(0,10)` (UTC date) so future-dated rates are ignored. Semantically consistent with `convertToEgp`.
- **Tests:** Updated mock to add a `then` handler (Promise-like) so the array-returning `ratesAsOf` query resolves to `{data:[], error:null}` while `maybeSingle()` still resolves to `{data:{rate_to_egp:48.2}}`. Added 2 new tests: `latestRate returns 1 for EGP` and `ratesAsOf always includes EGP=1`. 4/4 pass. `tsc --noEmit` clean.
- Commit: `086b73d` — `fix(networth): ratesAsOf one-query rewrite + latestRate filters by today`

**Next:** Task 9 (`snapshot.ts`) — uses `ratesAsOf` to freeze FX into the snapshot's jsonb column.

---

## 2026-05-16 — Task 8: networth fx.ts + fx.test.ts (DONE)

**What:** Created `src/lib/personal/networth/fx.ts` and `fx.test.ts` following TDD.
- Wrote `fx.test.ts` first (2 tests under `describe('convertToEgp')`), confirmed failure (module not found).
- Implemented `fx.ts` with 3 exports: `convertToEgp`, `latestRate`, `ratesAsOf`.
- `convertToEgp` returns discriminated union `{egp, rate, rateAsOf} | {error: 'missing_rate', currency, asOfDate}`.
- `latestRate` and `convertToEgp` have EGP early-return paths (no DB query needed).
- Tests: 2/2 pass. `tsc --noEmit`: clean.
- Commit: `6fdc985` — `feat(networth): fx conversion helpers (convertToEgp, latestRate, ratesAsOf)`

**Next:** Task 9 (`snapshot.ts`) — uses `ratesAsOf` to freeze FX into the snapshot's jsonb column.

---

## 2026-05-16 — Fix Google Ads spend EGP double-conversion + add bar labels (DONE)

**Bug 1 — Spend × FX rate:** Campaign detail page (`/beithady/ads/campaigns/[id]`) was showing `EGP 720,863` over 23 days — actual native sum was ≈ EGP 14,650. Root cause: `ads_accounts.currency` for the "Beithady Google Ads" account row (id=3) was stored as `'USD'`, but Google Ads' `metrics.cost_micros` is in the customer's local currency (EGP for this account). `convertManyToEgp` then multiplied by 1/EGP→USD ≈ 49.26.

**Bug 2 — No visible bar amounts:** Daily-spend chart only had HTML `title=` tooltip; no on-screen values.

**Fixes:**
- DB: `UPDATE ads_accounts SET currency='EGP' WHERE id=3` (Beithady Google Ads)
- `src/lib/beithady/ads/google-sync.ts`: after detecting manager/leaf, query `customer.currency_code` on the first effective customer and update `ads_accounts.currency` — keeps it in sync going forward, prevents recurrence for any new Google account
- `src/app/beithady/ads/campaigns/[id]/page.tsx`: added compact (`Intl.NumberFormat notation: 'compact'`) value labels above each bar, container grew from `h-24` → `h-32` to fit labels

**Verification:** `npm run build` clean, no TS/lint errors.

---

## 2026-05-16 — BH Ads V3 brainstorm: § 2 per-feature design awaiting approval

**Status:** Mid-brainstorm. § 1 ✅ approved (kareem: "ok"). § 2 (per-feature data queries + AI prompt) just presented, awaiting kareem's response before § 3 (UI structure + testing).

**§ 2 covered the actual queries per feature:**
- **D1 hourly heatmap:** Two functions in `hourly.ts` — `getLeadDensityHeatmap` (Cairo-local day×hour aggregation on `ads_leads.created_at`) + `getMetaHourlyHeatmap` (reads new `ads_hourly_metrics` table). Cron extension fetches `hourly_stats_aggregated_by_advertiser_time_zone` for last 24h per Meta campaign.
- **D2 spend pacing:** `getSpendPacing({range})` → `{ daily: sparkline, campaigns: per-campaign bars with monthly_budget_cap_egp, projected_egp_eom, pct_of_cap, auto_paused }`. Highlights >80% cap.
- **D3 period-delta on KPIs:** Add `getDashboardKpisWithCompare()` to `reporting.ts` — calls `getDashboardKpis()` twice when `?compare=1`. Main page wraps each `<Stat>` with V1's existing `<PeriodDeltaBadge />` (reverseColor for CPL).
- **E1 top ads:** `getTopAds({sortBy: 'cpl'|'ctr'|'leads'})` joins `ads_ads × ads_daily_metrics` filtered by `ad_id IS NOT NULL`, EGP-converted.
- **E2 top assets:** Thin wrapper over existing V1 `ads_asset_performance` view + optional `buildingCode` filter.
- **E3 anomaly:** Extract from existing `beithady-ads-anomaly-alert` cron into shared `anomalies.ts` lib (`detectAnomalies({today, lookbackDays})` returns spend_spike / zero_leads / low_roas events). Cron handler refactors to call the new lib. Banner returns null when empty.
- **E4 AI narrative:** Claude haiku-4-5 wrapper. Prompt = "You are an ad-ops analyst for Beit Hady…3 paragraphs: what's working / what's not / one action." Audit-logged per call. Daily cap = 20 calls (~$0.20/day).

**Locked design decisions (running):**
- Q1 scope = all 7 V3 features
- Q2 D1 = lead density now + Meta hourly cron + new ads_hourly_metrics table (migration 0140)
- Q3 E4 = on-demand button only (Claude haiku-4-5)
- Q4 E3 = re-compute at page load via shared `anomalies.ts` (no new table)
- Approach 2 = cluster into 2 new audience tabs (?tab=time, ?tab=optimize) + 3 main-dashboard cards + KPI delta extension

**Next:** Kareem replies to § 2 → § 3 (UI mockups for each new surface + testing strategy) → write spec → kareem reviews → writing-plans skill.

**Spec destination:** `docs/superpowers/specs/2026-05-16-bh-ads-v3-time-optimize-design.md`
**Roadmap:** [docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md](docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md)
**V1 + V2 shipped:** Both complete (849 tests passing).

---

## 2026-05-16 — Personal NetWorth Task 6: amortization.ts TDD (DONE)

**Commit:** 34c3fbd — `feat(networth): generateSchedule amortization with full test coverage`

**Files created:**
- `src/lib/personal/networth/types.ts` — 6 exported types: `LiabilityKind`, `AssetKind`, `PaymentCategory`, `AmortizationInput`, `ScheduleRow`, `EarlyPayoffResult`
- `src/lib/personal/networth/amortization.test.ts` — 7 vitest specs (TDD: written before implementation, confirmed failing, then passing)
- `src/lib/personal/networth/amortization.ts` — `generateSchedule(input: AmortizationInput): ScheduleRow[]` with `round2` and `addMonths` helpers

**Results:** 7/7 tests pass, `tsc --noEmit` clean, strict TypeScript, no `any`.

## 2026-05-16 — Personal NetWorth Task 7: earlyPayoffProjection code-review fixes (DONE)

**Commit:** 1da5c33 — `fix(networth): guard earlyPayoffProjection against negative inputs + tighten test 2`

**Fixes applied:**
1. **Input guard (critical):** Added `if (extraMonthlyAmount < 0) throw` before any mutation — prevents silently corrupted balance state when the loop's `principalPart <= 0` break fires post-mutation.
2. **Input guard (suggestion #6):** Added `if (paidInstallmentCount < 0) throw` for defensive completeness.
3. **Test 2 strengthened:** Replaced `toBeGreaterThan(0)` assertions with exact `monthsSaved: 1`, `newPayoffDate: '2026-12-01'`, and a tight `60 < totalInterestSaved < 75` band (actual value: 67.24).
4. **2 new throw tests:** `throws on negative extraMonthlyAmount` and `throws on negative paidInstallmentCount`.

**Results:** 15/15 tests pass (10 generateSchedule + 5 earlyPayoffProjection), `tsc --noEmit` clean.

## 2026-05-16 — Personal NetWorth Task 7: earlyPayoffProjection TDD (DONE)

**Commit:** a986c81 — `feat(networth): earlyPayoffProjection for amortization`

**Files changed:**
- `src/lib/personal/networth/amortization.ts` — Appended `earlyPayoffProjection(schedule, paidCount, extraMonthly, aprPct): EarlyPayoffResult`; updated import to include `EarlyPayoffResult` from types. Reused existing `addMonths` shared helper (refactored approach, no duplication).
- `src/lib/personal/networth/amortization.test.ts` — Updated import to include `earlyPayoffProjection`; added 3-test `describe('earlyPayoffProjection', ...)` block.

**Results:** 13/13 tests pass (10 generateSchedule + 3 earlyPayoffProjection), `tsc --noEmit` clean, strict TypeScript, no `any`.

---

## 2026-05-16 — Personal NetWorth Task 6: amortization.ts code-review fixes (DONE)

**Commit:** 2c0eb24 — `fix(networth): clamp addMonths day-of-month + guard monthlyOverride against negative principal`

**Files changed:**
- `src/lib/personal/networth/amortization.ts` — Fixed 2 important issues:
  1. `addMonths`: now clamps day via `new Date(year, month, 0).getDate()` — prevents invalid dates like `2026-02-31` when start day is 29/30/31
  2. `generateSchedule`: guard after `monthly` constant — throws if `monthlyOverride <= firstInterest` to prevent negative `principal_portion` corrupting data
- `src/lib/personal/networth/amortization.test.ts` — Added 4 new tests (3 test cases in the "throws on invalid inputs" test, clamping test, and override-too-low test)

**Results:** 10/10 tests pass, `tsc --noEmit` clean.

---

## 2026-05-16 — BH Ads V3 brainstorm: § 1 architecture awaiting approval

**Status:** Mid-brainstorm. § 1 (architecture + file structure) just presented, awaiting kareem's response before § 2 (per-feature data design + AI prompt).

**Locked so far:**
- **Q1 — Scope:** All 7 V3 features (D1 heatmap, D2 pacing, D3 period-delta, E1 top-ads, E2 top-assets, E3 anomaly, E4 AI narrative).
- **Q2 — D1 heatmap source:** Both — lead density (from `ads_leads.created_at` Cairo-local hour) NOW + Meta hourly cron added (new `ads_hourly_metrics` table + extend `beithady-ads-insights` cron to fetch `hourly_stats_aggregated_by_advertiser_time_zone`). Heatmap UI toggles between modes.
- **Q3 — E4 AI narrative:** On-demand button only (Claude haiku-4-5 ~$0.01/call). No scheduled runs, no new table.
- **Q4 — E3 anomaly:** Re-compute at page load via shared `anomalies.ts` lib (extract from existing `beithady-ads-anomaly-alert` cron). NO new table; cron keeps firing for off-hours WhatsApp alert.
- **Approach 2 chosen:** Cluster into 2 new audience tabs (`?tab=time`, `?tab=optimize`) + 3 new main-dashboard cards (`<AiSummaryCard />`, `<AnomalyBanner />`, `<SpendPacingCard />`) + extend KPI cards with `<PeriodDeltaBadge />` for D3.

**Pre-brainstorm context discovery:**
- E3 anomaly cron `/api/cron/beithady-ads-anomaly-alert` ALREADY EXISTS (sends WhatsApp on spike/zero-leads/low-ROAS). V3 just surfaces those signals visually.
- E2 asset performance: `ads_asset_performance` view already shipped (migration 0109). V3 just builds a tab.
- D2 pacing data: `ads_campaigns.monthly_budget_cap_usd` + `auto_paused_at`/`auto_paused_reason` already exist (migration 0104).
- D1 hourly: NO existing data source; needs new table + cron extension.

**§ 1 architecture presented:**
- ~17 new source files + colocated tests (~35 new tests)
- 5 modified files: `beithady-ads-insights` cron (hourly extension), `beithady-ads-anomaly-alert` cron (refactor to shared lib), main page, audience page, `reporting.ts` (prior-period KPI helper for D3)
- ONE new table: `ads_hourly_metrics` (migration 0140) — campaign_id × metric_date × hour
- ONE cron extension (not new cron)
- ONE external API: Claude haiku-4-5 (~$0.01/call, on-demand only)
- Estimated ~25 TDD tasks

**Awaiting:** Kareem's reply on § 1 — then § 2 covers actual data queries per feature (heatmap aggregation, AI prompt structure, anomaly detection rules, top-ads ranking).

**Spec destination (planned):** `docs/superpowers/specs/2026-05-16-bh-ads-v3-time-optimize-design.md`
**Roadmap:** [docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md](docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md)
**V1 + V2 shipped:** Both complete (849 tests passing).

---

## 2026-05-16 — Personal Net Worth: Task 5 — lift recurring.ts to shared lib (commit b81c20d)

**Status:** DONE. Lifted `computeNextRunDate` + `RecurringFrequency` out of `src/lib/boat-rental/recurring.ts` into a new shared `src/lib/recurring.ts`. Verbatim copy — no logic changes.

- Deleted `src/lib/boat-rental/recurring.ts` and `src/lib/boat-rental/recurring.test.ts` via `git rm`.
- Created `src/lib/recurring.ts` and `src/lib/recurring.test.ts` (byte-identical content, import path adjusted in test).
- Updated 2 importers to `@/lib/recurring`: `src/app/api/cron/boat-rental/generate-recurring-expenses/route.ts` and `src/app/emails/boat-rental/owner/money/recurring/actions.ts`.
- Tests: **15/15 passing**. `tsc --noEmit` clean.

---

## 2026-05-16 — Personal Net Worth: Task 4 code-review fix (commit d473dfc)

**Status:** DONE. Applied 3 code-review fixes to `supabase/migrations/0139_personal_networth.sql` and the live Supabase views (CREATE OR REPLACE).

- **Issue 1 (Important):** `v_personal_networth_current` re-anchored on `personal_networth_settings` — now always returns 1 row per user with a settings row, even with no assets/liabilities. Old FULL OUTER JOIN of two empty sets → 0 rows bug is gone.
- **Issue 2 (Suggestion):** Added explanatory comment on the CROSS JOIN single-user broadcast in `v_personal_networth_current`.
- **Issue 3 (Suggestion):** Added `and li.kind in ('amortizing_loan','bnpl')` defensive filter to `v_personal_networth_upcoming` schedule branch WHERE clause.

**Verification:** Inserted temp settings row for user `c9e43267…` → view returned 1 row with `total_liabilities_egp = 0` and `stocks_pipe_egp` populated from live stocks. Cleaned up temp row. `v_personal_networth_upcoming limit 0` queries without error. Migration `0139_personal_networth_part4_fix_v_current_anchor` applied successfully.

**File changed:** `supabase/migrations/0139_personal_networth.sql` only. No other files touched.

---

## 2026-05-16 — SHIPPED: BH Ads Insights V2 (17/17 tasks complete) ✅

**Status:** All 17 V2 plan tasks shipped to `main`. Vercel auto-deploys via GitHub integration. NO migrations, NO crons, NO schema changes — pure read-side. Tests: **849 passing / 22 skipped / 0 failures** (up from V1's 795 → +54 new tests). `tsc --noEmit` clean.

**Plan:** [docs/superpowers/plans/2026-05-16-bh-ads-insights-v2.md](docs/superpowers/plans/2026-05-16-bh-ads-insights-v2.md)
**Spec:** [docs/superpowers/specs/2026-05-16-bh-ads-v2-funnel-quality-design.md](docs/superpowers/specs/2026-05-16-bh-ads-v2-funnel-quality-design.md)
**Roadmap:** [docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md](docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md)

### What's live

- `<FrtCard />` on `/beithady/ads` main — median / p95 / over-1h-SLA% / unresponded + worst-campaign link; hides when no leads in range; emerald/slate/rose tone on SLA cell.
- `<PerBuildingFilter />` chip row on `/beithady/ads` + `/beithady/ads/audience` — All / BH-26 / BH-73 / BH-435 / BH-OK / BH-34 / Unattributed. URL: `?building=BH-26`.
- `/beithady/ads/audience`: 6 tabs (Geo / Demo / Device + **Funnel / Quality / Cohort** NEW)
  - **Funnel tab:** 5-stage SVG bars (impressions → reach → clicks → leads → bookings) + drop-off labels + summary table. Per-building hint when filter active (impressions/reach/clicks are campaign-aggregate).
  - **Quality tab:** Two stacked tables — lead quality % per campaign (C2) + response speed per campaign with SLA tone (C3).
  - **Cohort tab:** 6×5 matrix (last 6 complete Cairo-local ISO weeks × lag W+1..W+5plus). Cell colors slate→emerald by % bucket. Ignores date filter (inherently rolling); honors per-building.
- V1 tabs (Geo / Demo / Device) now honor `?building=` filter (approximate: filters to campaigns with ≥1 attributable lead in window).
- V1 polish closed inline: `insights-utils.ts` shared `asInt`/`asMicros` (MIN-1), `backfillAdsBreakdownsAction` checks `res.ok` (MIN-2), `query*Rollup` logs Supabase errors (MIN-3).

### Per-building attribution (the key V2 rule)

`attributeLeadToBuilding(lead) = matched_reservation_building ?? lead.building_interest ?? 'Unattributed'`

Lookup path for booked building: `ads_leads.matched_reservation_id` → `guesty_reservations.listing_id` → `guesty_listings.building_code`. Done in TS via `buildingMapForLeads(sb, rows)` shared helper in `funnel.ts`.

Spend share uses proportional split: a campaign with `building_codes=['BH-26','BH-73']` → 50% spend to each. Currencies converted to EGP via `convertManyToEgp` (V1).

### Commits (17, in plan order)

| # | SHA | Task |
|---|---|---|
| 1 | `f755a49` | buildings.ts (BH-* code list) |
| 2 | `47f80fb` | insights-utils.ts (closes V1 MIN-1) |
| 3 | `a1a7cdf` | per-building.ts (attribution + breakdown) |
| 4 | `e571180` | funnel.ts |
| 5 | `cac0918` | lead-quality.ts |
| 6 | `efa31b4` | frt.ts |
| 7 | `7075d04` | cohort.ts (Cairo TZ DST-safe) |
| 8 | `6124cb0` | query*Rollup accepts buildingCode? |
| 9 | `db86961` | V1 polish (MIN-2 + MIN-3) |
| 10 | `d17e59e` | <PerBuildingFilter /> |
| 11 | `e0f3fef` | <FrtCard /> |
| 12 | `38fe438` | wire main /beithady/ads page |
| 13 | `4bacd82` + `df55c50` | <FunnelTab /> (+ tidy) |
| 14 | `68ee7c1` | <QualityTab /> |
| 15 | `6c1848f` | <CohortTab /> |
| 16 | `04732b9` | wire 3 new tabs + extend V1 tabs |
| 17 | (this) | smoke + handoff |

### Verification

- `npm run test` → **849 passing / 22 skipped / 0 failures** (153 test files)
- `npx tsc --noEmit` → 0 errors
- Per-feature test counts: buildings 5 + insights-utils 8 + per-building 5 + funnel 3 + lead-quality 3 + frt 7 + cohort 11 + rollup buildingCode 1 + backfill action 1 + PerBuildingFilter 3 + FrtCard 2 + FunnelTab 2 + QualityTab 1 + CohortTab 2 = **54 new tests**

### Manual smoke (operator action)

Walk live prod after GitHub auto-deploy:

1. `/beithady/ads/?preset=7d` — `<FrtCard />` renders if leads exist, hides cleanly otherwise.
2. Click building chip `BH-26` → URL `?building=BH-26`. Per-platform cards unchanged (campaign-level), audience widget unchanged in V2.
3. `/beithady/ads/audience` → 6 tabs visible. Click **Funnel** → 5-stage bars + drop-off %s render.
4. Toggle `?building=BH-26` on Funnel tab → leads/bookings shrink, hint appears below bars.
5. Click **Quality** → both tables render. SLA cells tinted (emerald < 10% / slate 10-20% / rose > 20%).
6. Click **Cohort** → 6×5 matrix renders. Cell colors tint by conversion bucket. Tooltip on hover shows raw counts.
7. `<FrtCard />` worst-campaign link → `/beithady/ads/audience?tab=quality&campaign=<id>` (campaign param plumbed but Quality table doesn't yet filter by it — V2.5 polish).

If `app.limeinc.cc` is stale: `vercel alias set <new-deploy-url> app.limeinc.cc` (alias doesn't auto-update on lime project).

### Architectural notes

- **NO new tables, NO new crons, NO migrations.** All 5 new features query existing tables (`ads_daily_metrics`, `ads_leads`, `ads_lead_funnel` view, `ads_campaigns`, `guesty_reservations`, `guesty_listings`).
- Per-feature aggregator pattern mirrors V1's `insights-{geo,demo,device}.ts` exactly — pure TS, in-process aggregation, no DB views.
- `buildingMapForLeads(sb, rows)` shared helper in `funnel.ts` does the 3-hop join once per query; reused by funnel + lead-quality + frt + cohort.
- The `query*Rollup` per-building filter is APPROXIMATE — it filters to campaigns with attributable leads, not per-row. Documented in the spec.

### Roadmap progress

V1 ✅ V2 ✅ shipped. Next per roadmap: **V3 (Time/Patterns + Optimization)** — 7 features (D1 hourly heatmap, D2 spend pacing, D3 period-delta as cross-cutting, E1 top-performing ads, E2 top creative assets, E3 anomaly detection, E4 AI narrative summary). Estimated ~20 TDD tasks. Awaiting kareem's go.

V2.5 follow-ups (small polish if anything surfaces in practice):
- Tunable SLA threshold (currently hardcoded 60min)
- Per-building × per-platform cross-table
- Cohort granularity toggle (weekly ↔ monthly)
- Quality tab campaign filter via `?campaign=<id>` (the FrtCard already links with the param)

---

## 2026-05-16 — Personal Net Worth: migration 0139 part 4 (3 views)

**Status:** DONE — commit `3475b86`

**What shipped:** Appended 3 views to `supabase/migrations/0139_personal_networth.sql`, completing the entire schema (11 tables + 1 function + 3 views). Views: `v_personal_networth_current` (stocks pipe-in via CROSS JOIN on `v_personal_stock_positions` + `v_personal_stock_account_balance`, FULL OUTER JOIN assets/liabilities), `v_personal_networth_loan_summary` (GROUP BY liability with FILTER aggregates for paid/remaining/YTD interest, kind IN ('amortizing_loan','bnpl')), `v_personal_networth_upcoming` (UNION ALL of schedule installments due ≤30d + active recurring templates due ≤30d, ORDER BY due_date). Applied via Supabase MCP `apply_migration` (`0139_personal_networth_part4`). Verified: all 3 views query without error (0 rows each — no seed data yet; `v_personal_networth_current` returned 0 rows, stocks CROSS JOIN produced no row since stock positions table is also empty).

**Files changed:** `supabase/migrations/0139_personal_networth.sql` (+110 lines)

**Next:** Phase B begins — Task 5 starts TypeScript business logic.

---

## 2026-05-16 — Personal Net Worth: migration 0139 part 3 (snapshots + fx_lookup)

**Status:** DONE — commit `072f6c3`

**What shipped:** Appended 2 snapshot tables + `fx_lookup()` function to `supabase/migrations/0139_personal_networth.sql`. Tables: `personal_networth_snapshots` (kind CHECK: monthly_auto/manual, fx_rates_used jsonb) + `personal_networth_snapshot_lines` (line_type CHECK: asset/liability/stocks_pipe, `on delete cascade` from snapshot). Function: `fx_lookup(p_currency text, p_as_of date) returns numeric language sql stable` — EGP hardcoded to 1, all others do a descending `as_of_date <= p_as_of` lookup in `personal_networth_fx_rates`. Applied via Supabase MCP `apply_migration` (`0139_personal_networth_part3`). Verified: EGP=1, USD two-point test (on_jan1=47.5, mid_q1=47.5, may1=48.2) all exact.

**Files changed:** `supabase/migrations/0139_personal_networth.sql` (+54 lines)

---

## 2026-05-16 — BH Ads V2 Task 9: backfill res.ok check + rollup error logging

**Status:** DONE — commit `db86961`, pushed to main.

**What shipped:**
- `backfillAdsBreakdownsAction` now returns `{ ok: boolean; error?: string }` instead of `Promise<void>`. Wraps fetch in try/catch, checks `res.ok`, logs and returns `{ ok: false, error: "cron_returned_${status}" }` on HTTP failure.
- New test: `backfill-ads-breakdowns-action.test.ts` — added "returns ok=false on cron failure" case (500 mock → `r.ok === false`, `r.error` contains "500"). Suite: 839 passed, 22 skipped.
- `queryGeoRollup`, `queryDemoRollup`, `queryDeviceRollup`: changed `const { data }` to `const { data, error }` + `if (error) console.error(...)` (MIN-3).
- `page.tsx`: wrapped form `action` in void inline server action to satisfy strict tsc (action now returns a value, form prop must be `Promise<void>`).
- Step 3 WAS needed — Task 8 had not handled these lines.

**Files changed:** `backfill-ads-breakdowns-action.ts`, `backfill-ads-breakdowns-action.test.ts`, `insights-geo.ts`, `insights-demo.ts`, `insights-device.ts`, `page.tsx` (6 files).

---

## 2026-05-16 — Personal Net Worth: migration 0139 part 2 (core entities)

**Status:** DONE — commit `f656952`

**What shipped:** Appended 5 new tables to `supabase/migrations/0139_personal_networth.sql` inside the existing `begin;…commit;` block: `personal_networth_assets`, `personal_networth_liabilities` (with `amortizing_required_fields` + `revolving_required_fields` CHECK constraints), `personal_networth_liability_schedule`, `personal_networth_payments`, `personal_networth_recurring_templates`. Plus 2 cross-FK ALTER TABLE statements (`schedule_payment_fk`, `payments_recurring_template_fk`) added after both tables exist. Applied new SQL only via Supabase MCP `apply_migration` (`0139_personal_networth_part2`). Verified 9 tables + 2 FKs in DB.

**Files changed:** `supabase/migrations/0139_personal_networth.sql` (+132 lines)

---

## 2026-05-16 — Personal Net Worth: migration 0139 part 1 (lookup tables + seed)

**Status:** DONE — commit `6791952`

**What shipped:** Created `supabase/migrations/0139_personal_networth.sql` with 4 lookup tables: `personal_networth_currencies` (5-row seed: AED/EGP/EUR/SAR/USD, EGP=base), `personal_networth_fx_rates` (with composite unique + desc index), `personal_networth_lenders`, `personal_networth_settings`. Applied via Supabase MCP `apply_migration` against project `bpjproljatbrbmszwbov`. Verified 5-row currency seed. File ends in `commit;` — Tasks 2-4 will extend it.

**Files changed:** `supabase/migrations/0139_personal_networth.sql` (60 lines, new file)

---

## 2026-05-16 — BH Ads V2 Task 8: query*Rollup buildingCode? filter

**Status:** DONE — commit `6124cb0`, pushed to main.

**What shipped:** Added `buildingCode?: string` to opts type of `queryGeoRollup`, `queryDemoRollup`, `queryDeviceRollup`. Each function now calls a local `campaignsAttributableToBuilding()` helper (duplicated across 3 files per spec) that resolves campaign IDs from `ads_leads` using the `attributeLeadToBuilding` + `buildingMapForLeads` join, then filters breakdown rows via `.in('campaign_id', campaignIds)`. Returns `[]` immediately if no campaigns match.

**Tests:** 17/17 pass (16 existing + 1 new shape test in `insights-geo.test.ts`). `tsc --noEmit` clean.

**Files changed:** `insights-geo.ts`, `insights-geo.test.ts`, `insights-demo.ts`, `insights-device.ts`.

---

## 2026-05-16 — BH Ads V2: plan written, awaiting execution-mode choice

**Status:** V2 spec ✅ + plan ✅ both committed and pushed. Awaiting kareem's execution-mode choice (subagent-driven vs inline) before shipping.

**Spec:** [docs/superpowers/specs/2026-05-16-bh-ads-v2-funnel-quality-design.md](docs/superpowers/specs/2026-05-16-bh-ads-v2-funnel-quality-design.md) — commit `55f02e5`, 446 lines
**Plan:** [docs/superpowers/plans/2026-05-16-bh-ads-insights-v2.md](docs/superpowers/plans/2026-05-16-bh-ads-insights-v2.md) — commit `80aa12b`, 2637 lines, 17 TDD tasks

**V2 features (5):** C1 funnel, C2 lead-quality %, C3 WhatsApp FRT, C4 per-building breakdown, C5 lead→booking cohort matrix. Per Q1-Q4 locked decisions: 3 new audience sub-tabs (`?tab=funnel|quality|cohort`) + FRT card on main + per-building chip row everywhere. NO new tables/crons/migrations.

**Per-building attribution rule:** `matched_reservation_building (via lead→reservation→listing→building_code TS join) ?? lead.building_interest ?? 'Unattributed'`.

**V1 polish closed inline:** MIN-1 (extract `asInt`/`asMicros` to `insights-utils.ts`), MIN-2 (backfill action checks `res.ok`), MIN-3 (rollups log Supabase errors).

**Test target:** +51 new tests → ~846 passing / 22 skipped, zero regressions, `tsc --noEmit` clean.

**Next:** Kareem picks execution mode. First task ships `buildings.ts` (single source of truth for BH-* codes).

---

## 2026-05-16 — Personal Net Worth module — plan written, awaiting execution choice

**Status:** Spec approved by kareem ✅. **Implementation plan written and self-reviewed: 3,962 lines, 32 tasks across 8 phases (A–H), 0 placeholders, type consistency verified.** Awaiting kareem's execution-mode choice (subagent-driven recommended vs inline) before starting.

**Plan:** [docs/superpowers/plans/2026-05-16-personal-networth.md](docs/superpowers/plans/2026-05-16-personal-networth.md)
**Spec:** [docs/superpowers/specs/2026-05-16-personal-networth-design.md](docs/superpowers/specs/2026-05-16-personal-networth-design.md)

**Phase summary:**
- **A (Tasks 1–4):** Migration 0139 — 11 tables, 3 views, `fx_lookup()` SQL helper, seed currencies.
- **B (Tasks 5–14):** Lift `computeNextRunDate` to shared lib; business logic (`amortization`, `fx`, `snapshot`, `liability`, `payment`, `queries`) all TDD; typecheck checkpoint.
- **C (Tasks 15–17):** 2 cron routes (bearer auth + DST-safe Cairo-9-AM gate + `?force=1` escape) + register in `vercel.json` + 2 manual trigger routes.
- **D (Tasks 18–20):** `NetWorthShell`/`NetWorthHeader`/tab nav + new `Net Worth` tile on `/personal` (indigo accent) + `/setup` page (FX, lenders, settings).
- **E (Tasks 21–25):** `/assets`, `/liabilities` list, `/liabilities/[id]` dual-mode (amortizing vs revolving) + edit/close actions + KPI strips.
- **F (Tasks 26–28):** `/recurring` (Templates + Payment Log tabs, CSV export) + `/reports` (monthly + 12-month stacked-area chart + PDF export via `@react-pdf/renderer`).
- **G (Tasks 29–31):** Overview dashboard — hero KPI + 3-card totals + sparkline + asset/liability donuts + upcoming-payments table + charity YTD + loan payoff + quick-entry strip + 4 quick-entry modals (Payment/Liability/Asset/Recurring).
- **H (Task 32):** End-to-end smoke pass — sample data entry, cron triggers via `?force=1`, dashboard verification.

**Migration roadmap:** `0139_personal_networth.sql` is the main migration (applied in 4 logical parts but can ship as one file). A possible follow-up `0140_personal_networth_upcoming_liability_id.sql` is called out in Task 30 to add `liability_id` to `v_personal_networth_upcoming` so the dashboard "Mark paid" inline button works.

**Crons added to `vercel.json` (Task 17):** 4 entries (snapshot ×2, recurring ×2 — DST-safe Cairo 9 AM double-registered).

**Locked product decisions (8):**
1. **Currency:** Multi-currency, totals rolled up to EGP via a manually-maintained `personal_networth_fx_rates` table.
2. **Stocks integration:** Hybrid pipe-in — `/personal/stocks` live data feeds the current dashboard; monthly snapshot freezes the value into `snapshot_lines`.
3. **Loan model:** Full amortization schedule auto-generated (per-month principal/interest split, payoff projection, early-payoff calculator).
4. **Snapshots:** Auto monthly on the 1st (Cairo 9 AM, DST-safe) + manual "Snapshot now" button.
5. **Charity:** Recurring-payment category with a prominent dashboard widget (YTD vs absolute yearly EGP goal). No Zakat / hijri-calendar logic.
6. **Module shape:** Multi-route stocks-style — 6 top-level routes under `/personal/networth/{overview, liabilities, liabilities/[id], assets, recurring, reports, setup}`.
7. **Loans + liabilities unified:** one `personal_networth_liabilities` table with a `kind` discriminator (`amortizing_loan` / `bnpl` / `credit_card` / `overdraft` / `other`). Loan + card columns nullable on the same row.
8. **Dashboard layout A:** Hero + grid (big KPI hero, 3-card totals, mix donuts, upcoming-payments table beside charity/payoff stacked cards, bottom quick-entry strip).

**Schema:** 11 new tables in migration `0139_personal_networth.sql`, 3 views (`v_personal_networth_current`, `v_personal_networth_loan_summary`, `v_personal_networth_upcoming`), 1 SQL helper function (`fx_lookup(currency, date)`).

**Crons:** 2 new in `vercel.json` — `personal-networth-snapshot` (monthly on the 1st) + `personal-networth-recurring` (daily). Both DST-safe double-registered, gated on Cairo 9 AM.

**Visual companion:** Running at `http://localhost:64114` (session dir `27655-1778924263`). 3 dashboard wireframes shown; Kareem picked Layout A. Server idle now; will auto-exit after 30 min of inactivity.

**Next:** wait for spec review → invoke `writing-plans` skill → multi-task implementation plan (estimate ~30-40 TDD tasks) → execute.

---

## 2026-05-16 — V2 brainstorm in progress (Funnel + Quality)

**Status:** Mid-brainstorm. § 1 (architecture + file structure) just presented, awaiting kareem's approval before § 2 (per-feature data queries).

**Locked so far:**
- **Q1 — Surface:** Extend `/beithady/ads/audience/` with 3 new sub-tabs (Funnel/Quality/Cohort). FRT card on `/beithady/ads` main. Per-building filter chip row applied everywhere.
- **Q2 — Per-building attribution (C4):** Booked → `matched_reservation.building_code`; unbooked → `lead.building_interest`; else "Unattributed".
- **Q3 — FRT (C3, assumed default since user didn't override AskUserQuestion):** median + p95 + %>1h SLA card on main, per-campaign table in Quality tab.
- **Q4 — Cohort granularity (C5, assumed default):** weekly buckets, lag weeks 1-4.
- **Approach 2 — Pure TS aggregators per feature** (mirrors V1's `insights-*` pattern, no new DB views).

**§ 1 architecture presented:**
- ~13 new files: `funnel.ts`, `lead-quality.ts`, `frt.ts`, `per-building.ts`, `cohort.ts`, `insights-utils.ts` (shared asInt/asMicros — closes V1 MIN-1), `buildings.ts`, 4 new audience tab components, `<FrtCard />`, `<PerBuildingFilter />`, colocated tests.
- ~6 modifications: `audience/page.tsx`, `ads/page.tsx`, the 3 V1 tabs (accept `buildingCode?` filter), `insights-{geo,demo,device}.ts` (import shared utils).
- NO new tables — all existing data sources (`ads_daily_metrics`, `ads_leads`, `ads_lead_funnel` view, `ads_campaigns`, `bh_reservations`).
- Estimated ~20 TDD tasks (vs V1's 25).

**✅ § 1 approved** (kareem: "move on").

**§ 2 presented — per-feature data queries:**
- **C1 Funnel:** 5 stages (impressions/reach/clicks/leads/bookings), each a focused query against existing tables. Per-building filter applies to leads/bookings only.
- **C2 Lead quality:** `ads_lead_funnel` joined to `ads_campaigns`, grouped by campaign_id. `quality_pct = booked/leads * 100`.
- **C3 FRT:** Pulls `created_at + first_response_at` from `ads_leads`. Computes median/p95/over-1h-pct in TS. 1h SLA threshold.
- **C4 Per-building attribution helper:** `matched_reservation.building_code ?? lead.building_interest ?? 'Unattributed'`. Spend share uses `campaign.building_codes` proportional split.
- **C5 Cohort:** 6 rolling Cairo-local ISO-week cohorts × 5 lag columns (W+1 through W+5plus). Cell colors slate→emerald by % bucket.

**✅ § 2 approved** (kareem: "next").

**§ 3 presented — UI structure:**
- `<FrtCard />` compact card on `/beithady/ads` main (median/p95/over-1h-SLA, hides when no leads).
- `<PerBuildingFilter />` chip row on main + audience page (URL `?building=BH-26`, emerald active).
- Funnel tab: server-rendered SVG horizontal bars + drop-off labels + summary table.
- Quality tab: two stacked tables (lead quality % per campaign with delta badge + response speed per campaign with cell-tinted SLA col).
- Cohort tab: 6×5 matrix (no date filter — inherently rolling).
- Tab nav extended: `[Geo][Demo][Device][Funnel][Quality][Cohort]` (emerald active).

**Awaiting:** Kareem's response on § 3 — then § 4 covers testing strategy + done criteria (short), then write spec to `docs/superpowers/specs/2026-05-16-bh-ads-v2-funnel-quality-design.md`, self-review, then kareem reviews spec, then invoke writing-plans skill.

**Spec destination (planned):** `docs/superpowers/specs/2026-05-16-bh-ads-v2-funnel-quality-design.md`
**Roadmap:** [docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md](docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md)

**Spec destination (planned):** `docs/superpowers/specs/2026-05-16-bh-ads-v2-funnel-quality-design.md`
**Roadmap:** [docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md](docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md)

---

## 2026-05-16 — SHIPPED: BH Ads Insights V1 (25/25 tasks complete) ✅

**Status:** All 25 plan tasks shipped to `main`. Vercel auto-deploys via GitHub integration. Migration `0138` applied to Supabase (project `bpjproljatbrbmszwbov`). Cron `beithady-ads-breakdowns` registered, runs every 6h. Tests: **795 passing / 22 skipped / 0 failures** (up from 704 baseline → +91 new tests). `tsc --noEmit` clean.

**Spec:** [docs/superpowers/specs/2026-05-16-bh-ads-v1-filter-audience-design.md](docs/superpowers/specs/2026-05-16-bh-ads-v1-filter-audience-design.md)
**Plan:** [docs/superpowers/plans/2026-05-16-bh-ads-insights-v1.md](docs/superpowers/plans/2026-05-16-bh-ads-insights-v1.md)
**Roadmap:** [docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md](docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md) (V1/V2/V3/V4 phases)

### What's live

- **Migration `0138`:** three new tables — `ads_insights_geo` (15 cols), `ads_insights_demo` (14), `ads_insights_device` (15). NULLS NOT DISTINCT unique indexes per spec spine + per-campaign+date and per-account+date supporting indexes.
- **Platform fetchers:** `fetchMetaInsightsBreakdown` (meta-client.ts), `fetchGoogleGeoView` / `fetchGoogleDemoView` / `fetchGoogleDeviceView` (google-client.ts), `fetchTikTokIntegratedReport` (tiktok-client.ts) — all paginated, all unit-tested with mocked fetch.
- **Per-dimension libs** (`insights-{geo,demo,device}.ts`): platform normalizers + Supabase upsert (using `NULLS NOT DISTINCT` onConflict) + rollup query helpers. Throw typed `InsightsBreakdownFetchError` / `InsightsUpsertError`.
- **Cron `/api/cron/beithady-ads-breakdowns`:** rolling 7-day window every 6h. Per-campaign isolation (one failure doesn't abort the batch). `maxDuration=800`. Audit logged via `recordAudit({ module:'ads', action:'breakdowns_cron' })`.
- **Admin Backfill 90d button** on `/admin/integrations` — same-host POST to the cron with `?force=1&secret=$CRON_SECRET&from=…&to=…`.
- **Reporting layer:** `getDashboardKpis()` + `listOverviewByDay()` now accept `RangeArg = number | { from, to }` (backward compat). New `normalizeRangeArg()` helper.
- **UI primitives:** `<PeriodDeltaBadge />` (emerald/rose/slate tones, `reverseColor` for CPL-style metrics), `<DateRangeFilter />` (preset chips + custom range + compare toggle, URL-state driven), `<AudienceSummaryWidget />` (server component, top-3 per dimension card with optional `campaignId` filter).
- **Main `/beithady/ads/` page:** Audience tab added to `<AdsTabs />`; date filter + audience widget wired in; `getDashboardKpis` consumes the range.
- **`/beithady/ads/campaigns/[id]/`:** date filter + per-campaign audience widget.
- **`/beithady/ads/performance/`:** date filter.
- **`/beithady/ads/audience/` (NEW page):** `<BeithadyShell>` + `<BeithadyHeader>` + 3 sub-tabs (Geo / Demographics / Device & Placement).
  - **Geo tab:** Country rollup table with impressions/clicks/CTR/spend (EGP)/leads + Δ-clicks column when `?compare=1`.
  - **Demo tab:** Age × Gender horizontal stacked bars (emerald female / slate male) + detail table.
  - **Device tab:** Device stacked bar (emerald-to-slate graduated) + Meta-only placements list + per-platform detail table.

### UI conventions held

Every BH ads page wraps in `<BeithadyShell>` + `<BeithadyHeader>` + `<AdsTabs />`. Cards = `ix-card`. Buttons = `ix-btn-primary|secondary|ghost`. Inputs = `ix-input`. **Active state = emerald only** (matches `ads-tabs.tsx`); everything else stays slate. No raw Tailwind palette outside that sanctioned color (per kareem's memory note: BH surfaces must theme through ix-* utilities + emerald accent).

### Commits (25, in order)

| # | SHA | Task |
|---|---|---|
| 1 | `63da355` | Migration 0138 (geo/demo/device tables) |
| 2 | `f10d7d0` | date-range.ts |
| 3 | `a7a5261` | period-delta.ts |
| 4 | `c3e9218` | insights-errors.ts |
| 5 | `a4e9f6d` | fetchMetaInsightsBreakdown |
| 6 | `b5ff53c` | fetchGoogleGeoView |
| 7 | `82a1a75` | fetchGoogleDemoView |
| 8 | `da85f53` | fetchGoogleDeviceView |
| 9 | `62e1ffa` | fetchTikTokIntegratedReport |
| 10 | `56945f2` | insights-geo.ts (normalize/upsert/rollup) |
| 11 | `367e1bc` | insights-demo.ts |
| 12 | `a85d027` | insights-device.ts |
| 13 | `efa8e33` | cron beithady-ads-breakdowns + vercel.json |
| 14 | `5798d4f` | admin Backfill 90d button + action |
| 15 | `5c3aaa1` | reporting.ts `{from,to}` refactor |
| 16 | `0febe0f` | <PeriodDeltaBadge /> |
| 17 | `8eb6bca` | <DateRangeFilter /> |
| 18 | `d48a2ef` | <AudienceSummaryWidget /> |
| 19 | `6256742` | wire main /beithady/ads + Audience tab |
| 20 | `1ce1fd7` | wire campaigns/[id] + performance |
| 21 | `ea04a9f` | <AudienceFilters /> |
| 22 | `34f9583` | audience page shell + GeoTab + tab stubs |
| 23 | `f6cab5f` | DemoTab real |
| 24 | `2d08c1c` | DeviceTab real |
| 25 | (this) | smoke + handoff |

### Verification

- `npm run test` → **795 passing / 22 skipped / 0 failures** (141 test files)
- `npx tsc --noEmit` → 0 errors
- DB tables verified live via MCP execute_sql
- vercel.json cron entry confirmed at line 34: `0 */6 * * *`

### Manual smoke (operator action required)

The new tables are EMPTY until the cron runs (next quarter-hour mark) OR until kareem clicks **Backfill 90d ads breakdowns** on `/admin/integrations`. Recommended first action:

1. Visit `/admin/integrations` → click "Backfill 90d ads breakdowns" → wait ~60s
2. Verify rows landed via Supabase MCP: `select platform, count(*) from ads_insights_geo group by platform;`
3. Visit `/beithady/ads/?preset=7d` → confirm date filter chips work, audience widget renders top-3
4. Visit `/beithady/ads/audience` → switch Geo/Demo/Device tabs
5. Toggle `?compare=1` → confirm delta badges appear in geo+demo+device tables

If kareem hits `app.limeinc.cc` and sees stale code, re-alias: `vercel alias set <new-deploy-url> app.limeinc.cc` (per memory: this alias does NOT auto-update on the lime project).

### Roadmap progress

V1 ✅ shipped. Next per roadmap: **V2 (Funnel + Quality)** — funnel chart, lead quality %, WhatsApp first-response time, per-building breakdown, lead→booking cohort attribution. Estimated ~15 TDD tasks. Waiting on kareem's go-ahead.

---

## 2026-05-16 — Beithady Guesty implementation: Step 1 ✅ DONE, Step 2 in progress

**Step 1: Schema — COMPLETE ✅**
- Custom LodgingBusiness + AggregateRating (4.85★ × 1500) JSON-LD pasted in Home → Header HTML
- Guesty native LocalBusiness schema fixed:
  - Address: Dubai → **El Shrefen Street, Cairo, EG** ✅
  - Geo: Dubai coords → **Cairo coords (30.047558, 31.241106)** ✅
  - Phone: malformed → **+201501010103** ✅
  - areaServed: Egypt, Cairo, New Cairo, Sheikh Zayed, Dubai ✅
  - Hours: 24/7 added ✅
  - priceRange: 30-200$ ✅
- Rich Results Test: **2 valid items, Local businesses = clean (no errors)** ✅

**Step 2: Meta titles + descriptions — IN PROGRESS**
- Problem: Homepage title is "Airbnb Rental | Beithady Hospitality | Egypt, Dubai, SA" — positions as Airbnb listing, not a direct brand. Description is generic, no Cairo/Gouna keywords, no trust signals.
- Awaiting kareem to update Home page meta:
  - **New title:** `Serviced Apartments in Cairo & Gouna | Beit Hady` (49 chars)
  - **New description:** `4.85★ from 1,500+ guests. Boutique serviced apartments in New Cairo, Kattameya, El Gouna & Dubai. Hotel comfort, home privacy. WhatsApp us to book.` (148 chars)
- Path: Pages → Home → ··· → Page Settings → Page SEO → manually paste (do NOT use AI generate)
- After Home confirmed, will give remaining 11 pages in one batch

**Steps 3-8 still queued:**
- Step 3: Fix misspelled URLs `/2-badroom`, `/3-badroom`, `/4-badroom` → `bedroom` + auto-301
- Step 4: GTM + GA4 + Search Console
- Step 5: WhatsApp click → Meta `Lead` event
- Step 6: UTM `wa.me` redirector page
- Step 7: Domain Not Unified DNS fix
- Step 8: Dynamic Pages for 79 properties
- ✅ AggregateRating (4.85★ × 1500) confirmed absent from Guesty native schema → custom JSON-LD is essential, keep it

**Guesty native Local Business Schema — issues found & fixes pending:**
- Type: `LocalBusiness` → needs to change to `LodgingBusiness` (if field allows in Business Info)
- Address: `Khalid Bin Al Waleed Street, Dubai, AE` → **wrong** — primary market is Egypt; change to `One Kattameya, New Cairo, Cairo Governorate, Egypt`
- Phone: `+20 150-10-10-10-3` → **malformed** — change to `+201501010103`
- sameAs missing: TikTok, LinkedIn, Snapchat (only has YouTube, Facebook, Instagram)
- **Location**: CMS → Business Data → **Business Info** tab (not Business Text where kareem accidentally navigated)

**Awaiting kareem:** navigate to CMS → Business Data → Business Info → fix phone + address + type → republish → confirm

**Step 2 queued (meta descriptions):** once Step 1 confirmed done
- Homepage title: "Airbnb Rental | Beithady Hospitality | Egypt, Dubai, SA" → rewrite to remove "Airbnb", add Cairo/Gouna/Dubai + 4.85★ × 1500
- 12 pages total (site has 12, not 9 as originally estimated — News page exists)
- Path: Pages → [page] → ··· → Page Settings → Page SEO → title + description fields

**Steps 3-8 queued (in order):**
- Step 3: Fix misspelled URLs `/2-badroom`, `/3-badroom`, `/4-badroom` → `bedroom` with auto-301
- Step 4: GTM container setup + GA4 + Search Console verification meta tag
- Step 5: WhatsApp click → Meta `Lead` event in GTM
- Step 6: UTM-tagged `wa.me` redirector page
- Step 7: Domain Not Unified — DNS fix
- Step 8: Dynamic Pages for 79 properties (biggest unlock — one template → 79 indexed URLs)

---

## 2026-05-16 — Beithady.com SEO/ads/reservations audit + Guesty implementation playbook (no code change)

**Scope:** kareem asked for a deep audit of beithady.com for reservations, ads readiness, SEO; compare vs Prime Hospitality + other Egypt competitors. Then asked to implement every action item via Guesty Websites UI. Step-by-step with confirmations.

**Audit findings (live fetch via WebFetch + WebSearch):**
- beithady.com is a 9-URL brochure on Guesty Websites (Advanced plan, published, "Domain Not Unified")
- **0 individual property pages** (79 PMS units, none on public site)
- Missing: viewport meta, `lang=`, canonical, schema (LodgingBusiness/AggregateRating), GA4, GTM, TikTok/Snapchat pixels
- Meta Pixel installed (ID `1649553085729228`) but fires only `PageView` — no `Lead`/`ViewContent`/`InitiateCheckout`
- **Misspelled URLs**: `/2-badroom`, `/3-badroom`, `/4-badroom` (should be `bedroom`)
- Single conversion path: WhatsApp deep-link to +20-1501010103
- 4.85★ × 1500 guests headline stat is real — schema goldmine, unused

**Competitor benchmarks (Egypt):**
- [stayatprime.com](https://stayatprime.com) — same SEO gaps, but 30+ property pages, 9-destination nav, OTA partner badges (Agoda/TripAdvisor/Flipkey), 5 brand tiers
- [hostprimeeg.com](https://hostprimeeg.com) — package bundles (Premium/Value/Standard) + Egypt excursions
- [theblueground.com Cairo](https://www.theblueground.com/furnished-apartments-cairo-egypt) — international corporate benchmark (8 langs, filter UX, price-behind-dates)
- [thesqua.re](https://www.thesqua.re/cairo/serviced-apartments), [silverdoor.com](https://www.silverdoor.com), Booking/Airbnb aggregators

**Action plan delivered in chat (not file):**
- §5.1 Quick wins (today, ~8hr): schema, meta descriptions, viewport, fix misspelled URLs, OG, GTM+GA4+pixels, WhatsApp `Lead` event, UTM `wa.me` redirector
- §5.2 Medium (30d): Dynamic Pages (auto property pages from PMS), neighborhood pages, Arabic i18n, Booking Engine widget, CTWA campaigns, Meta CAPI, newsletter, OTA badges
- §5.3 Strategic (90d): blog content engine, package bundles, B2B page, owner-acquisition revamp, programmatic SEO, close-the-loop attribution via Guesty webhook → Meta/Google CAPI, GBP per building

**Guesty Advanced Website capabilities confirmed:**
- Native: GA4, GTM, Meta Pixel fields; SEO/AEO panel (Site Audit, Page SEO, Image Alt Text, Internal/External Links, Blog SEO); per-page Header HTML; Dynamic Pages from PMS collections; Booking Engine widget; IndexNow auto-submission; multi-language (30 langs incl Arabic via Google Translate); AI SEO generator (sparkle icon); auto LocalBusiness schema; auto OG image
- Custom code: Head HTML, Body End HTML (global) + per-page Header HTML
- Limits: TikTok/Snapchat via GTM only; no native Meta CAPI (use Stape.io); multi-language edits don't sync across langs (translate last)

**Step 1 (in progress):** Add LodgingBusiness + AggregateRating JSON-LD to homepage Header HTML.
- kareem pasted the JSON-LD block (Guesty Header HTML editor confirms it's in)
- Discovered Guesty already auto-enables LocalBusiness schema + meta tags + OG image (Site Audit screenshot)
- **Awaiting kareem**: (A) click "View Details" on Local Business Schema in Site Audit — report whether it exposes editable AggregateRating fields; (B) republish + Rich Results Test screenshot

**Next steps queued:**
- Step 2: rewrite meta descriptions for 12 pages (current Guesty auto-version says "Airbnb rentals" — bad for direct-brand positioning; need to inject Cairo/Gouna/Dubai + 4.85★ × 1500)
- Step 3: fix `/2-badroom` → `/2-bedroom` slugs (×3) with auto-301
- Step 4: GTM + GA4 + Search Console verification
- Step 5: WhatsApp `Lead` event in GTM
- Step 6: Dynamic Pages template for 79 properties (biggest unlock)

---

## 2026-05-16 — STYLE: KIKA nav pages now max-w-[1800px] for ultrawide displays

**User report:** Reporting page still looked narrow after the earlier `max-w-6xl → max-w-7xl` bump. kareem appears to be on a ~2597px-wide display (likely a 5K monitor scaled), where even 1280px (`max-w-7xl`) leaves ~50% of the viewport as side-margin.

**Fix:** Bumped all 7 KIKA nav pages from `max-w-7xl` (1280px) to arbitrary `max-w-[1800px]`. Commit `f9c1e66`.
- Pages: exec, sales, financials, inventory, inventory/raw-materials, reporting, reporting/picker
- On the 2597px viewport: content utilization goes from 49% → 69%
- On laptop screens (≤1800px), nothing changes — the cap never kicks in
- Setup and history pages still use `max-w-5xl` (different `<div>` shells, less data-dense)

If 1800 still feels narrow, options noted to kareem: `max-w-[2000px]` (77%), `max-w-[2200px]` (85%), or `max-w-full` (100% / full-bleed). Awaiting confirmation post-deploy.

---

## 2026-05-16 — Task 14: Admin Backfill 90d ads breakdowns button

**Commit:** `5798d4f`

**Files:**
- Created `src/app/admin/integrations/backfill-ads-breakdowns-action.ts` — `'use server'` action that issues same-host GET to `/api/cron/beithady-ads-breakdowns?force=1&secret=…&from=…&to=…` (90-day window), then revalidates `/admin/integrations`, `/beithady/ads`, `/beithady/ads/audience`.
- Created `src/app/admin/integrations/backfill-ads-breakdowns-action.test.ts` — 1 test, 1 PASS.
- Modified `src/app/admin/integrations/page.tsx` — added "Backfill 90d ads breakdowns" button in the page header alongside "Seed from env vars", wrapped in `<form action={…}>`.
- Created `src/__mocks__/next-cache.ts` — shim for `next/cache` in Vitest (revalidatePath/revalidateTag are no-ops outside Next.js context).
- Modified `vitest.config.ts` — added `'next/cache'` alias pointing at the shim.

**Status:** DONE. 1/1 tests pass, tsc clean, pushed to main.

---

## 2026-05-16 — BRAINSTORM IN PROGRESS: Personal Net Worth module

**User request:** Add a 4th tile to the `/personal` cockpit for net-worth tracking — assets / liabilities / loans / credit cards / cars / overdraft / Valu, loan details (principal, term, interest, monthly payment), monthly charity, payment report, recurring payments, dashboards.

**Status:** Brainstorming skill invoked. Visual companion server at `http://localhost:64114` (session dir `27655-1778924263`). 5 clarifying questions answered + module shape locked in. **Sections 1 (schema) and 2 (routes & UX) both presented and approved.** Awaiting user feedback on Section 2 before moving to Section 3 (cron jobs & business logic).

**Locked decisions:**
1. **Currency:** Multi-currency, totals rolled up to EGP via manually-maintained FX rate table.
2. **Stocks integration:** Hybrid pipe-in — live `/personal/stocks` data feeds the current dashboard; monthly snapshot freezes the value so historical net-worth charts are stable.
3. **Loan model:** Full amortization schedule auto-generated (per-month principal/interest split, payoff projection).
4. **Snapshots:** Auto monthly via Vercel cron on the 1st (Cairo 9 AM, DST-safe double-registration) + manual "Snapshot now" button.
5. **Charity:** One of the recurring-payment categories, with a prominent "Charity YTD" dashboard widget (no Zakat / hijri-calendar logic).
6. **Module shape:** Multi-route stocks-style — **6 routes** under `/personal/networth/{overview, liabilities, liabilities/[id], assets, recurring, reports, setup}`. Loans are NOT a separate route — they live in `liabilities` (a `kind=amortizing_loan` row). Schedule table renamed to `personal_networth_liability_schedule` to reflect BNPL using it too.
7. **Parent tile:** New 4th card on `/personal` — title "Net Worth", icon `Wallet`, indigo accent (slate/emerald/cyan already taken), badge "Live".
8. **Liability detail page** is dual-mode — amortizing layout (schedule + early-payoff calculator + interest YTD) vs revolving layout (utilization gauge + statement timeline + payment history).
9. **Quick-entry tile** lives on the overview page: 4 buttons (`+ Payment`, `+ Liability`, `+ Asset`, `+ Recurring`).
10. **Shared shell:** new `NetWorthShell` + `NetWorthHeader` mirroring `PersonalShell`. Top-nav tabs on every networth page.

**Schema proposal currently in front of user (Section 1):**
- 4 lookup tables: `personal_networth_currencies`, `personal_networth_fx_rates`, `personal_networth_lenders`, `personal_networth_settings`
- 2 core entities: `personal_networth_assets`, `personal_networth_liabilities` (one-table-many-kinds: amortizing_loan / bnpl / credit_card / overdraft / other, with nullable loan + card columns)
- 1 generated schedule: `personal_networth_loan_schedule`
- 2 payments/recurring: `personal_networth_payments`, `personal_networth_recurring_templates` (mirror of boat-rental templates)
- 2 snapshots: `personal_networth_snapshots`, `personal_networth_snapshot_lines`
- 3 views: `v_personal_networth_current`, `v_personal_networth_loan_summary`, `v_personal_networth_upcoming`
- Migration slot: `0139_personal_networth.sql`

**Next steps after schema approval:** Section 2 (routes & UX) → Section 3 (cron jobs) → Section 4 (dashboard widgets, will use visual companion for layout) → Section 5 (tests) → write spec to `docs/superpowers/specs/2026-05-16-personal-networth-design.md`.

**Open questions still TBD:**
- Single-user vs multi-user (currently leaning single-user with `app_user_id` column for cheap future-proofing).
- Whether daily cron handles both snapshot-on-1st and recurring-payment generation, or two crons.
- FX rate source (manual rows for v1, possibly auto-pull later).

---

## 2026-05-16 — STYLE: widen all KIKA nav pages to max-w-7xl

**User report:** Sales page looked too narrow on wide screens — lots of unused whitespace on the right.

**Cause:** Every KIKA nav page used `max-w-6xl` (1152px), leaving ~25% of a wide viewport as side-margin.

**Fix:** Bumped all 7 nav pages to `max-w-7xl` (1280px) in one commit (`8e9a232`):
- [exec](src/app/emails/kika/exec/page.tsx) · [sales](src/app/emails/kika/sales/page.tsx) · [financials](src/app/emails/kika/financials/page.tsx) · [inventory](src/app/emails/kika/inventory/page.tsx) · [inventory/raw-materials](src/app/emails/kika/inventory/raw-materials/page.tsx) · [reporting](src/app/emails/kika/reporting/page.tsx) · [reporting/picker](src/app/emails/kika/reporting/picker/page.tsx)

**Left untouched:** `/emails/kika/setup` and `/emails/kika/history` still use `max-w-5xl` — they're settings/admin pages with `<div>` shells rather than `<main>`, less data-dense. Can bump on request.

Vercel auto-deploying.

---

## 2026-05-16 — STYLE: widen KIKA Reporting hub to match sibling pages

**User report:** The new `/emails/kika/reporting` hub looked too narrow next to the rest of KIKA — content was wrapping early.

**Cause:** The hub was using `max-w-5xl` (1024px) while every other KIKA page — Exec, Sales, Picker — uses `max-w-6xl` (1152px). The Task 3 code-quality reviewer had flagged this as a Minor inconsistency at the time; the visible mismatch made it worth fixing now.

**Fix:** [src/app/emails/kika/reporting/page.tsx](src/app/emails/kika/reporting/page.tsx) — one-character change, `max-w-5xl` → `max-w-6xl`. Commit `d156a66`, pushed to main, auto-deploying via Vercel.

---

## 2026-05-16 — FIX: Manufacturing PDF now preserves the on-screen sort

**User report:** Sorted by Product name on the on-screen Manufacturing drill-down, exported the PDF, and the PDF came back in the default order (net_to_make desc).

**Root cause:** Sort state lived only in the client component. The "Export A4 PDF" link passed `from`/`to`/`label` but not the sort key/direction, and the route ran `buildKikaManufacturingReport` which returns rows in the default sort.

**Fix:**
- New module [src/lib/kika-manufacturing-sort.ts](src/lib/kika-manufacturing-sort.ts) — shared sort logic (`sortManufacturingRows`, type exports `ManufacturingSortKey` / `ManufacturingSortDir`, plus `isManufacturingSortKey` / `isManufacturingSortDir` guards). Lives outside `kika-manufacturing.ts` so the client drill-down can import it without dragging `server-only` into the client bundle.
- [src/app/emails/kika/exec/_components/manufacturing-drilldown.tsx](src/app/emails/kika/exec/_components/manufacturing-drilldown.tsx) — drops the inline sort comparator, re-uses `sortManufacturingRows` via `useMemo`, and appends `&sort=<key>&dir=<dir>` to `pdfHref` so the export reflects the user's current click state.
- [src/app/api/kika/manufacturing-report/route.ts](src/app/api/kika/manufacturing-report/route.ts) — reads `sort`/`dir` from query string, validates with the two guards, and applies `sortManufacturingRows` to `report.rows` before handing off to the PDF.

**Verification:** `tsc --noEmit` clean. No new tests (pure refactor of existing comparator + 3-line route addition).

---

## 2026-05-16 — Task 19: Wire DateRangeFilter + AudienceSummaryWidget into /beithady/ads

**Commit:** `6256742`

**Files changed:**
- `src/app/beithady/ads/_components/ads-tabs.tsx` — added `Globe2` to lucide-react imports; inserted `{ slug: 'audience', label: 'Audience', href: '/beithady/ads/audience', icon: Globe2, group: 'main' }` after the `performance` tab.
- `src/app/beithady/ads/page.tsx` — added `DateRangeFilter`, `AudienceSummaryWidget`, `parseDateRange` imports; extended `searchParams` type to include `from/to/preset/compare`; added `parseDateRange()` call after `const sp = await searchParams;`; changed `getDashboardKpis(30)` → `getDashboardKpis({ from: range.from, to: range.to })`; rendered `<DateRangeFilter />` immediately after `<AdsTabs active="overview" />`; rendered `<AudienceSummaryWidget range={...} />` between the platform-status section and the KPI grid.

**Verification:** `tsc --noEmit` — 0 errors. Full suite: 789 passed / 22 skipped (140 test files).

**Widget placement:** `<AudienceSummaryWidget />` sits between `</section>` (platform-status row) and the KPI `<section>` grid — after the gap/no-platform banners, before the spend/leads/CPL stats.

---

## 2026-05-16 — Task 20: Wire date filter into campaign detail + performance pages

**Commit:** `1ce1fd7`

**Files changed:**
- `src/app/beithady/ads/campaigns/[id]/page.tsx` — added `DateRangeFilter`, `AudienceSummaryWidget`, `parseDateRange` imports; extended `searchParams` type to include `from/to/preset/compare`; added `parseDateRange()` call after `const sp = await searchParams;`; rendered `<DateRangeFilter />` immediately after `<AdsTabs active="campaigns" />`; rendered `<AudienceSummaryWidget campaignId={campaignId} range={range} />` between the closing KPI section and the Live Meta insights section.
- `src/app/beithady/ads/performance/page.tsx` — added `DateRangeFilter`, `parseDateRange` imports; extended `searchParams` type to include `from/to/preset/compare`; added `parseDateRange()` call; changed `getDashboardKpis(days)` → `getDashboardKpis({ from: range.from, to: range.to })` and `listOverviewByDay(days)` → `listOverviewByDay({ from: range.from, to: range.to })`; rendered `<DateRangeFilter />` immediately after `<AdsTabs active="performance" />`.

**Widget placements:**
- Campaign detail: `<DateRangeFilter />` below `<AdsTabs>`, `<AudienceSummaryWidget>` between KPI section and Live Meta insights section.
- Performance: `<DateRangeFilter />` below `<AdsTabs>`, no audience widget (not per-campaign context).

**Verification:** `tsc --noEmit` — 0 errors. Full suite: 789 passed / 22 skipped (140 test files).

---

## 2026-05-16 — V1 PLAN WRITTEN: BH Ads Insights V1 (date filter + audience breakdowns)

**Status:** Spec approved by kareem. Implementation plan written + committed (`48b01ed`). Awaiting kareem's choice on execution mode (subagent-driven vs inline).

**Plan:** [docs/superpowers/plans/2026-05-16-bh-ads-insights-v1.md](docs/superpowers/plans/2026-05-16-bh-ads-insights-v1.md) — 25 TDD-sized tasks, ~3,944 lines
**Spec:** [docs/superpowers/specs/2026-05-16-bh-ads-v1-filter-audience-design.md](docs/superpowers/specs/2026-05-16-bh-ads-v1-filter-audience-design.md) (511 lines)
**Roadmap:** [docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md](docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md) (V1-V4 phases)

**V1 task summary (25 tasks):**
1. Migration 0138 — `ads_insights_{geo,demo,device}` tables
2-4. Pure helpers — `date-range.ts`, `period-delta.ts`, `insights-errors.ts`
5. Meta — `fetchMetaInsightsBreakdown`
6-8. Google — `fetchGoogleGeoView` / `fetchGoogleDemoView` / `fetchGoogleDeviceView`
9. TikTok — `fetchTikTokIntegratedReport`
10-12. Per-dimension libs — `insights-geo.ts` / `insights-demo.ts` / `insights-device.ts` (normalize + upsert + rollup)
13. Cron `beithady-ads-breakdowns` (every 6h, maxDuration 800) + `vercel.json`
14. Admin Backfill 90d button + server action
15. `reporting.ts` refactor to `{ from, to }` overload
16. `<PeriodDeltaBadge />` inline tone badge (jsdom)
17. `<DateRangeFilter />` client component (presets + custom + compare)
18. `<AudienceSummaryWidget />` server component
19. Wire date filter + widget into `/beithady/ads/` + add Audience tab
20. Wire date filter into `/campaigns/[id]` + `/performance`
21. Audience page shell + `<AudienceFilters />`
22. `<GeoTab />` + ship audience page + stub other tabs
23. `<DemoTab />` real implementation
24. `<DeviceTab />` real implementation
25. Manual smoke (7 checks) + final handoff

**UI conventions baked into plan:** Every UI task uses `ix-card` / `ix-btn-*` / `ix-input` / `ix-link` (BH theme utilities) wrapped in `<BeithadyShell>` + `<BeithadyHeader>` + `<AdsTabs />`. Active state = emerald (matches existing `ads-tabs.tsx` pattern). NO raw Tailwind palette outside that one sanctioned color.

**Test target:** +72 new tests → ~765 passing / 22 skipped, 0 regressions. `tsc --noEmit` clean.

**Next:** kareem picks subagent-driven (recommended) or inline execution → first task ships migration 0138.

---

## 2026-05-16 — SHIPPED: KIKA Reporting module + Picker Report (8/8 tasks complete)

**Status:** Feature complete. All 8 tasks landed on `main`. Pushing to origin in this same turn — Vercel auto-deploys via the GitHub integration.

**Plan:** [docs/superpowers/plans/2026-05-16-kika-reporting-picker.md](docs/superpowers/plans/2026-05-16-kika-reporting-picker.md)
**Spec:** [docs/superpowers/specs/2026-05-16-kika-reporting-picker-design.md](docs/superpowers/specs/2026-05-16-kika-reporting-picker-design.md)

**What's live:**
- `/emails/kika/reporting` — new hub page (6 link cards to Exec / Sales / To Manufacture / Delayed / Daily / Financials + featured Picker Report card)
- `/emails/kika/reporting/picker` — Picker Report: scope filter chips (All open / Older than 7d / Older than 14d / This week), 4 headline stats, expandable buckets table (1/2/3/4+ lines), expandable common-items table (products → variants). Order clicks open the existing order detail modal.
- `/api/kika/picker-report` — A4 PDF endpoint streaming `application/pdf` inline. Header strip, totals strip, per-bucket order rows (with line items), most-common-items table, page numbers in footer.
- 6th tile on `/emails/kika` linking to Reporting

**Builder (`src/lib/kika-picker.ts`):**
- Three pure helpers (`resolveScope`, `bucketKey`, `netRemaining`) with 16 Vitest unit tests passing
- `resolveScope` returns full ISO timestamps with Cairo-local (`+03:00`) Monday for `this_week` (review-driven improvement over the plan's date-only stub)
- Partial-fulfillment netting via `raw.fulfillments[].line_items[]` (mirrors the Manufacturing builder's approach)

**Reviewer-driven refinements applied during the run:**
- Cairo-local week boundary (Important — DST-aware, see CLAUDE.md)
- ISO timestamp precision on date bounds (Important — prevents sub-day silent drift)
- `force-dynamic` removed from static hub page (perf)
- Keyboard a11y on clickable rows: `tabIndex`/`onKeyDown`/`role="button"`/`aria-expanded`/`aria-label`/focus-visible ring (Important — applied to both BucketsBlock and CommonItemsBlock)
- `aria-current` on active scope chip
- 365-day cap on `oldest_age_days` rendering (per spec §9)
- `SCOPE_IDS` Set memo + `as string[]` cast eliminated
- Dark-mode `Thumb` classes restored
- A4 PDF column widths corrected to fill ~539pt usable width

**Verification:**
- `npx tsc --noEmit` — clean
- `npx vitest run src/lib/kika-picker.test.ts` — 16/16 passing
- `npx next build` — clean; all 4 new routes registered (`/emails/kika/reporting`, `/emails/kika/reporting/picker`, `/api/kika/picker-report`, modified `/emails/kika`)

**14 picker-related commits** since the plan commit `f5594c1`:
- `b824d9f` `a7a6916` `fe93254` — Task 1 (helpers + tests)
- `1cb9ba3` `b075f9b` — Task 2 (full builder)
- `d84e240` `fe38927` — Task 3 (hub + 6th tile)
- `9677d73` `5d736f1` — Task 4 (picker page shell)
- `0a05f47` `10df43e` — Task 5 (BucketsBlock)
- `f88a648` `75652cd` — Task 6 (CommonItemsBlock)
- `951699d` `fa092dd` — Task 7 (PDF + API route)

**Post-deploy smoke (manual):**
1. `/emails/kika` should show 6 cards including the new "Reporting" tile
2. `/emails/kika/reporting` renders the hub
3. `/emails/kika/reporting/picker` renders buckets + common items; filter chips switch the data
4. "Export A4 PDF" opens a real PDF inline with the right contents
5. Order# clicks anywhere open the existing order-detail modal

---

## 2026-05-16 — EXECUTION: KIKA Reporting + Picker Report (mid-flight, 3.5/8 tasks done, NOT pushed)

**Status:** Plan from earlier today (`docs/superpowers/plans/2026-05-16-kika-reporting-picker.md`) is being executed via `superpowers:subagent-driven-development`. Three full tasks landed locally on `main` with passing tsc + tests + reviews. **Nothing has been pushed to remote yet** — push happens in Task 8 (final).

**Tasks complete:**
- **Task 1** ✅ — Picker builder pure helpers + Vitest tests
  - `b824d9f` initial · `a7a6916` review fix (full ISO timestamps + Cairo-local week boundary) · `fe93254` minor nits (weekday lookup throw, test name)
  - Files: `src/lib/kika-picker.ts` (helpers + types), `src/lib/kika-picker.test.ts` (16 tests passing)
- **Task 2** ✅ — Full `buildKikaPickerReport` implementation
  - `1cb9ba3` initial · `b075f9b` style fix (hoist `supabaseAdmin` import to top)
  - File: `src/lib/kika-picker.ts` (now ~440 lines, mirrors `kika-manufacturing.ts` structure)
  - Delta from plan text: builder passes `range.fromDate`/`range.toDate` directly (no `T00:00:00Z` concatenation) because Task 1's review fix made `resolveScope` return full ISO timestamps
- **Task 3** ✅ — Reporting hub page + 6th tile on KIKA module hub
  - `d84e240` initial · `fe38927` perf fix (drop `force-dynamic` from static hub)
  - New: `src/app/emails/kika/reporting/page.tsx`
  - Modified: `src/app/emails/[domain]/page.tsx` (added 6th Reporting tile in `d === 'kika'` block + `ClipboardList` import)

**Task 4 ✅ — Picker page server shell + review fixes:**
- `9677d73` — page shell; `5d736f1` — 4 review fixes (a11y + age cap + Set lookup)
- File: `src/app/emails/kika/reporting/picker/page.tsx`
- Fixes applied: SCOPE_IDS Set (no per-request array alloc), fmtAge capping >365d to "365+d", aria-current on active scope chip, aria-hidden on BigStat decorative icons
- tsc: clean; PDF button links to Task 7 route (not yet built)

**Task 5 ✅ — BucketsBlock client component:**
- `0a05f47` — feat(kika-picker): BucketsBlock with expandable order lists
- Created: `src/app/emails/kika/reporting/picker/_components/buckets-block.tsx`
- Modified: `src/app/emails/kika/reporting/picker/page.tsx` (import + replaced TODO comment)
- Used `React.Fragment key={b.key}` (not bare `<>`) to avoid React 19 key warning on fragment-in-map
- tsc: clean

**Task 6 ✅ — CommonItemsBlock client component:**
- `f88a648` — feat(kika-picker): CommonItemsBlock with expandable variants
- Created: `src/app/emails/kika/reporting/picker/_components/common-items-block.tsx`
- Modified: `src/app/emails/kika/reporting/picker/page.tsx` (import + replaced TODO Task 6 comment)
- Same `React.Fragment key={p.product_id}` pattern as Task 5 (proactive fix per instructions)
- Full a11y on clickable rows: tabIndex, onKeyDown, role="button", aria-expanded, aria-label, focus-visible ring, aria-hidden chevron column
- Thumb sub-component: image with ring/rounded or fallback Package icon div
- tsc: clean (no output)

**Code-review fixes on BucketsBlock ✅ — keyboard a11y + stable line keys:**
- `10df43e` — refactor(kika-picker): keyboard a11y on bucket rows + stable line keys
- Fix 1: clickable `<tr>` now has `tabIndex={0}`, `role="button"`, `aria-expanded`, `aria-label`, `onKeyDown` (Enter/Space), and `focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500`
- Fix 2: line-item `key` changed from index-only to composite `sku+title+index`
- tsc: clean

**Task 7 ✅ — A4 PDF document + GET /api/kika/picker-report:**
- `951699d` — feat(kika-picker): A4 PDF document + GET /api/kika/picker-report
- Created: `src/lib/kika-picker-pdf.tsx` (KikaPickerPdf React-PDF component)
- Created: `src/app/api/kika/picker-report/route.ts` (GET handler with scope param)
- Pattern mirrors `kika-manufacturing-pdf.tsx` exactly: indigo header strip, 4-card totals, bucket+order list, sticky common-items table, page-number footer
- tsc: clean (no output); 16/16 tests still passing
- "Export A4 PDF" button on the picker page now returns a real PDF (no longer 404s)

**Tasks remaining:**
- Task 8 — final tsc + `npx next build` + push to main + SESSION_HANDOFF entry for the shipped feature

**To resume:** Dispatch the code quality reviewer for Task 4 commit `9677d73` (baseline `fe38927`), then continue task-by-task per the plan. Subagent-driven-development skill is the active workflow.

**Conventions reminder for future agents:**
- No worktree, no PR — push straight to main (per CLAUDE.md). Task 8 includes the push.
- TDD only the pure helpers — pages, components, and PDF docs in this codebase don't have tests (matches `kika-manufacturing.ts` pattern).
- Pre-commit hook emits a harmless "null byte" warning — ignore.

---

## 2026-05-16 — CommonItemsBlock dark-mode + truncation cleanup

**Commit:** `75652cd` — refactor(kika-picker): restore dark-mode on Thumb + drop redundant truncation

**Fix 1 — Thumb dark-mode classes restored:**
- Added `dark:bg-slate-800` to placeholder div, `dark:ring-slate-700` to both placeholder ring and img ring — matching `manufacturing-drilldown.tsx` source.

**Fix 2 — Redundant JS truncation removed:**
- Dropped `slice(0, 140)` + manual `…` from `short_description` render — `line-clamp-2` already handles CSS ellipsis; the JS was redundant and could collide.

**tsc:** clean (no output)

---

## 2026-05-16 — Investigated phantom LandingPulse on /beithady/gallery (no code change)

**User report:** Dashboard with "Currently staying" tile + occupancy KPI cards was rendering at the bottom of `app.limeinc.cc/beithady/gallery`. Hard refresh made it disappear.

**Verification (no code changed):**
- `LandingPulse` is imported only at [src/app/beithady/page.tsx:159](src/app/beithady/page.tsx#L159) — wrapped in `<Suspense fallback={null}>`. Not in gallery page, gallery layout, beithady layout, BeithadyShell, error.tsx, or any portal/iframe.
- Server-side `curl` of `/beithady/gallery` returns 0 occurrences of "Currently staying" / "MTD OCCUPANCY" / "LandingPulse" — production HTML is correct.
- Vercel: `app.limeinc.cc` aliased to latest deploy 14m ago (no stale-alias issue this time).
- Service worker `/sw.js` uses network-first for HTML — not the culprit either.

**Diagnosis:** Client-side soft-navigation glitch. User had navigated from `/beithady` (where LandingPulse renders) to `/beithady/gallery`; the Suspense boundary's DOM lingered under the new page content instead of unmounting. Hard refresh wiped client router cache → no recurrence.

**Action:** None. One-off rendering hiccup. If it recurs reliably, candidate fixes are giving the Suspense boundary a stable `key` tied to route, or removing the Suspense wrap entirely.

---

## 2026-05-16 — V1 ads-insights spec committed (809da68); awaiting kareem review

**Status:** All 6 design sections approved. Spec written, self-reviewed, committed + pushed at `809da68`. Awaiting kareem's go-ahead before invoking writing-plans.

**Spec:** [`docs/superpowers/specs/2026-05-16-bh-ads-v1-filter-audience-design.md`](docs/superpowers/specs/2026-05-16-bh-ads-v1-filter-audience-design.md) (~511 lines)

**Roadmap parent:** [`docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md`](docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md) (V1-V4 multi-phase)

**Self-review applied:** No placeholders found. Internal consistency verified across § 1-6 (schemas ↔ query patterns ↔ cron upsert ↔ UI tabs). 5 period-delta edge cases all enumerated. Done criteria 12 checkboxes.

**Spec snapshot (V1 scope):**
- 3 new tables (`ads_insights_geo`, `ads_insights_demo`, `ads_insights_device`) — migration `0138`
- Cron `beithady-ads-breakdowns` every 6h with rolling 7d window
- Admin button at `/admin/integrations` for one-shot 90d backfill
- Date filter component (presets + custom + compare toggle) reused on 4 pages
- Main dashboard audience summary widget + dedicated `/beithady/ads/audience/` page with 3 tabs
- Period-delta badges everywhere when `?compare=1`
- ~12 new files + ~7 modified
- Test target: ~765 passing (V1.2 baseline 704 + ~60 new)

**Next step:** Awaiting kareem review. On approval → invoke writing-plans skill to break into ~25 TDD-sized implementation tasks.

---

## 2026-05-16 — V1 ads-insights design § 1-4 presented; § 4 awaiting kareem approval

**Design progress (6 sections planned):**
- ✅ § 1 — Architecture overview (12 new files + 7 modified; cron `beithady-ads-breakdowns` every 6h)
- ✅ § 2 — Database schema (3 tables: `ads_insights_geo`, `ads_insights_demo`, `ads_insights_device`; UNIQUE indexes with `NULLS NOT DISTINCT` for Postgres 15+; migration `0138`)
- ✅ § 3 — Data fetching: Meta `breakdowns=country/age,gender/device_platform`; Google GAQL on `geographic_view`/`gender_view`/`age_range_view`/`device_view`; TikTok `report/integrated/get/` with dimensions; rolling 7d window per cron run; one-shot 90d backfill button at `/admin/integrations`; quota math fits <1% of limits
- ⏳ § 4 — UI (PRESENTED, awaiting approval):
  - `<DateRangeFilter>` — URL-state preset chips + custom date input + compare toggle (`?from=&to=&compare=1`)
  - `<AudienceSummaryWidget>` — compact card on main dashboard with top-3 per dimension + "Open full report →"
  - Dedicated `/beithady/ads/audience/` page with 3 tabs (Geo / Demographics / Device & Placement)
  - GeoTab: country table + city drill-down + period-delta badges
  - DemoTab: age × gender bars (left=imps, right=clicks) + detail table
  - DeviceTab: device pie + Meta-only placement bar + per-platform table
  - `<PeriodDeltaBadge>` reusable: ↑22% green / ↓8% red / → gray, with `reverseColor` prop for "lower is better" metrics like CPL
- ⏳ § 5 — Error handling (pending)
- ⏳ § 6 — Testing + done criteria (pending)

After § 6 approval: write spec at `docs/superpowers/specs/2026-05-16-bh-ads-v1-filter-audience-design.md`, self-review, kareem reviews, then writing-plans skill.

---

## 2026-05-16 — V1 brainstorm all 4 questions locked; design sections in progress

**All V1 locked decisions:**
- Q1: Main dashboard summary widget + dedicated `/beithady/ads/audience/` page
- Q2: All three platforms (Meta + Google + TikTok)
- Q3: D — Presets + custom range + period comparison toggle (absorbs V3's D3)
- Q4a: Campaign + adset-level drill-down
- Q4b: 90-day historical backfill on V1 deploy
- Architecture: **Approach 2 — per-dimension tables** (`ads_insights_geo`, `ads_insights_demo`, `ads_insights_device`)

**V1 task estimate:** ~25.

**Design sections approved:**
- ✅ § 1 — Architecture overview (5 dimensions × 3 platforms; new cron `beithady-ads-breakdowns` every 6h; ~12 new files + 7 modified)
- ✅ § 2 — Database schema:
  - 3 tables with shared spine (`account_id, campaign_id, ad_set_id, platform, metric_date, impressions, clicks, spend_micros, reach, leads, fetched_at`) + dimension-specific columns
  - Each gets UNIQUE indexes with `NULLS NOT DISTINCT` (Postgres 15+) so campaign-level + adset-level rows don't collide
  - Per-platform normalization done in app code (country ISO-2, age buckets, gender enum, device_platform enum)
  - Migration `0138_bh_ads_insights_breakdowns.sql`
  - Storage estimate: ~8,100 rows total over 90d for current portfolio (<1MB + indexes)

**Sections remaining:**
- § 3 — Data fetching (Meta/Google/TikTok client extensions + cron + 90d backfill mechanism)
- § 4 — UI (date filter component + audience summary widget + dedicated audience page + 3 tab components + period-delta badge)
- § 5 — Error handling
- § 6 — Testing + deployment + done criteria

After § 6 approval: write spec to `docs/superpowers/specs/2026-05-16-bh-ads-v1-filter-audience-design.md`, self-review, kareem reviews, then writing-plans skill.

---

## 2026-05-16 — V1 brainstorm Q1+Q2 locked; Q3 awaiting

**Locked decisions:**
- Q1: UI placement — main dashboard shows audience SUMMARY; clicking opens dedicated `/beithady/ads/audience/` page with full breakdowns + filters
- Q2: Platform coverage — ALL THREE (Meta + Google + TikTok). V1 task count rises to ~20.

**Q3 awaiting:** Date filter UX
- A. Presets only (7d/30d/90d/Lifetime)
- B. (Recommended) Presets + custom range picker
- C. Calendar only
- D. Presets + custom + period comparison (folds V3's D3 into V1)

URL pattern: `?from=YYYY-MM-DD&to=YYYY-MM-DD` for shareable/bookmarkable links.

**Remaining V1 questions:**
- Q4: Data storage strategy — new `ads_insights_breakdowns` table vs JSONB column vs per-dimension tables
- Q5: Cron refresh cadence — daily vs hourly vs on-demand
- Q6: Drill-down level — campaign → adset → ad? Or just campaign?
- Q7: Chart types per dimension — pie/bar/treemap/map
- Q8: Historical backfill — 90d on V1 deploy?

After clarifying questions: propose 2-3 approaches, present design sections, write V1 spec, then writing-plans.

---

## 2026-05-16 — BH ads insights roadmap committed; V1 brainstorm starting

**Status:** Roadmap doc committed `684c0ce`. V1 clarifying questions started.

**Roadmap:** `docs/superpowers/specs/2026-05-16-bh-ads-insights-roadmap.md`
4-phase carve of the 17 brainstormed insights:
- V1 (next, ~15 tasks): Date filter + B1 Geo + B2 Demo + B3 Device/Placement breakdowns
- V2 (~15): C1 Funnel + C2 Lead quality + C3 WhatsApp FRT + C4 Per-building + C5 Cohort attribution
- V3 (~20): D1 Heatmap + D2 Spend pacing + D3 Period delta + E1 Top ads + E2 Top creatives + E3 Anomaly flags + E4 AI narrative
- V4 (~6): F1 PDF export + F2 Tokenized share link

**V1 Q1 presented:** Where does the audience report live in the UI?
- A. Main dashboard `/beithady/ads/` only (aggregated)
- B. Campaign detail page only (per-campaign drill-down)
- C. (Recommended) Both — dashboard rollup + campaign detail breakdown
- D. New dedicated `/beithady/ads/audience/` page

**Awaiting kareem's pick on Q1.** Once locked, remaining V1 questions:
- Data sourcing: store breakdowns in new DB table (allows date filtering) vs on-demand API (no history)
- Platform coverage: Meta + Google + TikTok all in V1? Or just Meta first?
- Date filter UX: presets (7d/30d/90d) + custom range picker
- Drill-down level: campaign → adset → ad? Or just campaign?
- Chart types: pie/bar/treemap/map per dimension

After Q1-Q5: propose approaches, present design sections, write V1 spec at `docs/superpowers/specs/2026-05-16-bh-ads-v1-filter-audience-design.md`, then writing-plans.

---

## 2026-05-16 — Ads page insights brainstorm in progress (paper only, no code)

**Status:** Brainstorming a new ads-page enhancement phase. Picked up after V1.2 YouTube cross-post landed + ad-spend EGP conversion fixed. No code yet.

**User asks (explicit):**
1. Date period filter (currently `getDashboardKpis(30)` is hardcoded; `date` searchParam exists but unused)
2. Audience report per campaign — where impressions/clicks come from (geo/demo/device/placement)

**Open invitation:** brainstorm more insights to add.

**Q1 menu presented to kareem** (scope decision):
- A. Just the two explicit asks (date filter + audience B1/B2/B3) — ~10 tasks
- B. (Recommended) A + C1 funnel chart + C4 per-building breakdown + D3 period-over-period delta + E1 top-ads-in-campaign — ~18 tasks
- C. Everything (17 ideas) — ~40 tasks, would split V1+V2

**Brainstormed insight catalog** (will live in eventual spec):
- B1 Geo (country/city), B2 Demo (age/gender), B3 Device/placement
- C1 Funnel chart, C2 Lead quality %, C3 WhatsApp first-response time, C4 Per-building breakdown, C5 Lead→booking cohort attribution
- D1 Day-of-week / hour heatmap, D2 Spend pacing vs cap, D3 Period delta
- E1 Top ads in campaign, E2 Top creative assets, E3 Anomaly flags, E4 AI narrative summary
- F1 PDF export, F2 Tokenized share link

**Data model gaps:**
- `ads_daily_metrics` has aggregated impressions/clicks/spend/leads — no demographic dimensions
- `fetchMetaCampaignInsights` currently fetches lifetime totals without `breakdowns=` param
- Need new tables OR on-demand API fetches to get geo/demo/device. Likely a new `ads_insights_breakdowns` table (or per-dim tables) populated by an extended cron.

**Awaiting kareem's pick on Q1 scope.** Brainstorming skill requires user approval at each stage; no spec/plan/code until scope locked.

---

## 2026-05-16 — YouTube V1.2 ad-spend currency conversion + final session state

**Status:** V1.2 code phase DONE (17 of 17 code tasks + 3 post-deploy currency fixes shipped). Manual smoke (Tasks 18-21) awaiting kareem.

### Session V1.2 commits (chronological)

**Spec + plan:**
- `d20ace1` spec: YouTube V1.2 (Picker / cross-post) design (~520 lines)
- `0a35c5a` plan: 21 TDD-sized tasks across 6 phases

**Code (17 tasks shipped via subagent-driven-development):**
1. Foundation — `6d007a6` migration 0137 ads_youtube_cross_posts, `5c7cbd2` typed errors (PickerSourceUnavailableError, MetaVideoUploadError, TargetPlatform), `e6d9a2d` recordCrossPost best-effort helper
2. Picker module — `7a57b81` (hybrid DB + YouTube API source merger + 5min in-memory cache + 10 unit tests covering computeIsShorts, computeActions, dedupeByVideoId)
3. Picker UI — `54520e6` PickerFilters, `b1d0ca7` PickerRow, `f40db48` page + grid, `d283c61` EmbeddedPicker + YouTubeSourceBanner (Lucide `Youtube` → `Video` substitution applied — same V1.1 lesson)
4. Google PMax — `de4d19d` extended google-pmax-publish for YOUTUBE_VIDEO asset attachment (used `agResource` actual var name, real `gadsMutate(customerId, endpoint, ops, creds, accessToken)` signature, v24 camelCase JSON), `25e650f` page wiring with banner + embedded picker + recordCrossPost before redirect
5. IG/TikTok — `773f02e` IG Reels page, `a84a51e` TikTok organic action (page is curated embed gallery — action-only wiring), `e6622ff` TikTok paid page
6. Meta video ad NEW pipeline — `69e14bd` steps 1-3 (uploadMetaVideo + pollMetaVideoStatus + createMetaCampaign + 7 tests), `50d715c` steps 4-6 + orchestrator publishMetaVideoAd. Implementer caught 5 plan-vs-real API divergences: real `loadMetaCredentials()` returns `{ok, creds: {token, businessId, adAccountId, fbPageId}}` nested, `metaPost(path, params, token)` 3-arg, `recordAudit({module, action, target_type, target_id, actor_user_id, metadata})`, `ads_campaigns.objective`/`daily_budget_micros` not `campaign_objective`/`daily_budget_usd`, test mock shapes
7. Boost page fork — `4e3bd2a` Source: YouTube branch + publishMetaVideoAdAction (uses real `selectedAccount.id`, mirrors sibling action patterns)
8. Gallery landing link — `5c78cad`

**Currency display fixes (post-deploy):**
- `78bb26b` initial fix: USD → EGP labels + `$` → `EGP` on 4 dashboard pages (4 files, 28 edits). Implementer flagged that "Bookings revenue" + ROAS "Revenue" col still had USD-converted numbers but EGP labels (lying display).
- `cd1d539` proper revenue conversion: added `convertToEgp`, `convertManyToEgp`, `getFxToEgp` to `src/lib/fx-rates.ts` (math: amount * rate_to_usd[src] / rate_to_usd['EGP']). Replaced `convertManyToUsd` → `convertManyToEgp` in `getDashboardKpis` + `listCampaignRoas` + `campaigns/[id]` page (renamed `attributedRevenueUsd` → `attributedRevenueEgp`).
- `f5ceedd` ad-spend conversion: replaced currency-blind `ads_overview_daily` query in `getDashboardKpis` with `ads_daily_metrics` + `ads_accounts.currency` join (groups per-currency, batches convertManyToEgp, sums). Added `account_currency` to `listCampaignRoas`'s ads_campaign_performance select + per-row conversion. campaigns/[id] now pre-converts daily metrics to EGP for totals + sparkline + tooltip consistency. ads/page.tsx PlatformStatusCard + campaigns table show EGP-converted spend.

### Outstanding for V1.3 follow-up (flagged by implementer)
- Live Meta Insights card on `campaigns/[id]/page.tsx` lines 313-326: Spend/CPM/CPC from Meta Insights API are in account currency (USD) but labelled EGP — still wrong
- `listAssetPerformance` reads currency-blind `ads_asset_performance` view (assets tab if exists)
- `listOverviewByDay` still uses `ads_overview_daily` (currency-blind) — wherever this renders is wrong
- Other USD references in publish form labels (`google/publish`, `google/pmax`, `create`) not touched — kareem deferred to separate scope decision
- Schema columns `monthly_budget_cap_usd`, `daily_budget_micros`, code vars `dailyBudgetUsd` etc. — naming refactor deferred
- V1.2 TikTok organic page is currently a curated public-URL embed gallery (not a publish form). `publishTikTokReelAction` got the YT cross-post wiring action-side, so future TikTok publish UI gets it for free.

### Manual smoke pending (Tasks 18-21)
- Task 18: picker loads + IG Reel cross-post → audit row
- Task 19: Google PMax with YT video asset → asset visible in Ads Manager
- Task 20: Meta video ad pipeline → campaign+adset+creative+ad PAUSED
- Task 21: "Already posted" badges + full coverage

### Vercel alias status
- Last manual alias update: pointed at `lime-janf7atie` (Task 17 deploy, age ~4 min at the time)
- Subsequent commits `78bb26b`, `cd1d539`, `f5ceedd` triggered new builds. Alias was updated for `cd1d539` (lime-ians2zrjy). For `f5ceedd` (deploy `lime-95x6jm1l4`) the build was still in-flight at session end — scheduled wakeup pending to point alias once Ready.

### Test target
V1.1 baseline 617 → V1.2 ~704 passing / 22 skipped. Zero regressions. `tsc --noEmit` clean throughout (pre-existing parallel-session errors in `PayablesBlock.tsx` + `tiktok/organic/actions.ts` are NOT from this work).

---

## 2026-05-16 — DONE: kika-picker Task 4 — Picker page server shell (commit 9677d73)

**What changed:**
- Created `src/app/emails/kika/reporting/picker/page.tsx` — async server component at `/emails/kika/reporting/picker`.
- Features: `TopNav` breadcrumb (KIKA → Reporting → Picker Report), "Export A4 PDF" button (links to `/api/kika/picker-report?scope=…`, 404 until Task 7), four scope filter chips (indigo-active / white-bordered style), four headline stat cards (open orders, total lines, total units, oldest backlog age), two TODO comments for Tasks 5+6, footer with scope label + generation timestamp.
- `dynamic = 'force-dynamic'` and `maxDuration = 60` set.
- `tsc --noEmit` clean. No push (per task spec).

---

## 2026-05-16 — DONE: kika-picker Task 3 — Reporting hub page + 6th KIKA tile (commit d84e240)

**What changed:**
- Created `src/app/emails/kika/reporting/page.tsx` — static hub page at `/emails/kika/reporting`. Features a "Featured: Picker Report" card (indigo, links to `/emails/kika/reporting/picker`) and a 2-col grid linking to existing dashboards (Exec, Sales, To Manufacture, Delayed, Daily Report, Financials).
- Modified `src/app/emails/[domain]/page.tsx` — added `ClipboardList` to the lucide-react import and appended a 6th tile (Reporting, indigo accent) to the `d === 'kika'` grid after the Inventory card.
- `tsc --noEmit` clean. No push (per task spec).

---

## 2026-05-16 — DONE: kika-picker style fix — hoist supabaseAdmin import to top (commit b075f9b)

**What changed:**
- `src/lib/kika-picker.ts` — moved `import { supabaseAdmin } from './supabase'` from mid-file (line 169) to immediately after `import 'server-only'` at the top, matching codebase convention.
- `tsc --noEmit` clean. 16/16 tests pass. No push (per task spec).

---

## 2026-05-16 — DONE: kika-picker Task 2 — full buildKikaPickerReport builder (commit 1cb9ba3)

**What changed:**
- `src/lib/kika-picker.ts` — appended the full async `buildKikaPickerReport` function plus 4 private helpers (`stripHtml`, `pickPrimaryImage`, `pickVariantTitle`, `pickVariantSku`) and `OPEN_FULFILLMENT` set.
- Removed stub `export { ISO_DATE_RE }` line and unused `ISO_DATE_RE` const (no longer needed).
- Builder: paginated open-order fetch → partial-fulfillment netting → line-item + product lookups → bucket grouping → common-items rollup → `PickerReport` return.
- Dates passed to Supabase comparisons are full ISO timestamps from `resolveScope` (no `T00:00:00Z` concatenation).
- `tsc --noEmit` clean. 16/16 tests pass.

---

## 2026-05-16 — DONE: kika-picker Task 1 review nits (commit fe93254)

**What changed:**
- `src/lib/kika-picker.test.ts` Fix 1: corrected test description from "01:00 Cairo" to "00:30 Cairo" to match the actual `Date` value `2026-05-10T21:30:00Z`.
- `src/lib/kika-picker.ts` Fix 2: replaced `WEEKDAY_INDEX[weekday] ?? 0` with explicit `undefined` check that throws `Error("cairoMondayIso: unrecognized weekday abbreviation …")` instead of silently defaulting to Monday.
- 16/16 tests pass. `tsc --noEmit` clean.

---

## 2026-05-16 — DONE: kika-picker review fixes (commit a7a6916)

**What changed:**
- `src/lib/kika-picker.ts` — replaced `resolveScope` + helpers with ISO-timestamp version:
  - `toDate` is now required (not optional); `all` branch returns `{ fromDate: null, toDate: null, … }`
  - `older_than_7d` / `older_than_14d` return full `Z`-suffixed ISO strings (`.toISOString()`)
  - `this_week` uses Cairo-local Monday via `Intl.DateTimeFormat` (`cairoLocalParts`, `cairoOffsetSuffix`, `cairoMondayIso`)
  - Dropped dead `toIsoDate` helper
- `src/lib/kika-picker.test.ts` — replaced 4 original `resolveScope` tests with 6 new ones covering full ISO timestamps and the Cairo-UTC edge case
- **All 16 tests pass. `tsc --noEmit` clean.**
- Cairo offset: `+03:00` (EEST) confirmed for May 2026 — no surprises.

---

## 2026-05-16 — PLAN: KIKA Reporting module + Picker Report (ready to execute)

**Status:** Spec approved by kareem. Implementation plan written at [docs/superpowers/plans/2026-05-16-kika-reporting-picker.md](docs/superpowers/plans/2026-05-16-kika-reporting-picker.md). Awaiting kareem's choice of execution strategy (subagent-driven vs inline).

**Plan structure — 8 tasks:**
1. Picker builder pure helpers + Vitest unit tests (`resolveScope`, `bucketKey`, `netRemaining`)
2. Full `buildKikaPickerReport` implementation in `src/lib/kika-picker.ts`
3. Reporting hub page + 6th tile on KIKA module hub
4. Picker page server-component shell (filter chips, headline stats, "Export PDF" button)
5. BucketsBlock client component (expandable per-bucket order lists)
6. CommonItemsBlock client component (expandable products→variants)
7. A4 PDF document (`kika-picker-pdf.tsx`) + GET `/api/kika/picker-report` route
8. Final type-check, build, vitest, push to main

**Self-review pass:** spec coverage complete (every spec section maps to a task), no placeholders, type names consistent across tasks.

**Conventions noted in plan (override default skill steps):**
- No worktree — this project commits straight to `main`, no PRs.
- No `lint` script; gates are `tsc --noEmit` and `next build`.
- TDD only the pure helpers (matching existing project rhythm — `kika-manufacturing.ts` has no tests).

**Companion server** still running at http://localhost:52835.

---

## 2026-05-16 — BRAINSTORM (spec written): KIKA Reporting module + Picker Report

**Status:** Spec drafted at [docs/superpowers/specs/2026-05-16-kika-reporting-picker-design.md](docs/superpowers/specs/2026-05-16-kika-reporting-picker-design.md). Awaiting kareem's spec review before invoking `superpowers:writing-plans`.

**All sections approved during brainstorming:**
- Section 1: Reporting hub page layout (card hub with featured Picker tile + 6 link cards; "To Manufacture" and "Delayed" cards deep-link into Exec via `?focus=`)
- Section 2: Picker Report page layout (filter chips, headline stats, bucket table with expandable order lists, expandable product→variants common-items table)
- Section 3: A4 PDF format (KIKA-brand header, totals strip, per-bucket order rows with inline line items, common-items section, page numbers)

**Decisions captured in spec §2:**
1. Workflow: print/export PDF only — no in-app fulfilling
2. Bucket definition: distinct line items (1-line, 2-line, 3-line, 4+ buckets)
3. Stock filter: include all open orders regardless of stock
4. Most-common items grouping: product list with expandable variants
5. Time scope: default all open backlog + chips for Older than 7d / 14d / This week only
6. Page structure: card hub (Approach A)
7. Theme: reuse existing KIKA tokens — no new colors

**Spec self-review pass:** clarified "Total lines" definition (sum, not distinct count) in §4 and replaced vague "begins on a new line" with concrete `wrap={false}` behavior in §5. No other placeholders or contradictions found.

**Companion server** still running at http://localhost:52835. Last screen pushed: `06-waiting.html`.

**Next step (after kareem says "approved"):** invoke `superpowers:writing-plans` to create the implementation plan. **Hard gate active**: no code/scaffolding until then.

---

## 2026-05-16 — UX FIX: order modal line-items table — Qty + Price cells were colliding

**Status:** Visual Companion accepted. Hub-page design (Section 1 of 3) now on screen, awaiting kareem's review before moving to Section 2.

**Companion server:** running at http://localhost:52835 (PID owned by `start-server.sh`, content dir `C:\kareemhady\.superpowers\brainstorm\17422-1778910086\content`, state dir `…\state`). Auto-shuts after 30 min idle — restart with `"C:/Users/karee/.claude/plugins/marketplaces/superpowers-dev/skills/brainstorming/scripts/start-server.sh" --project-dir "C:/kareemhady"` if needed.

**Decisions locked in (via AskUserQuestion):**
1. **Workflow for the new report:** "Print/export a pick list" — no in-app fulfilling, just printable PDF (+ probably CSV).
2. **Bucket definition:** "1 line item" = 1 distinct SKU on the order, regardless of qty. An order with 1 line × qty 3 is in the 1-line bucket. An order with 2 lines × qty 1 each is in the 2-line bucket.
3. **Stock filter:** Include ALL open orders regardless of stock. KIKA's negative inventory makes a "fulfillable now" filter unreliable.
4. **Most-common items list:** Both — product list with expandable variants underneath (click product to drill into per-variant breakdown).
5. **Time scope:** Default to all open backlog. Optional filter at the top of the page lets ops narrow (e.g. "older than 7d", "this week").
6. **Hub structure:** Approach A — card hub. Featured purple hero card for the new Picker Report + 6 link cards underneath for existing dashboards (Exec / Sales / To Manufacture / Delayed / Daily / Financials). "To Manufacture" and "Delayed" cards are deep-links into Exec with `?focus=` pre-applied.

**Screens pushed so far** (in `…\content\`):
- `01-context.html` — current KIKA hub + placeholder for the 6th tile
- `02-approaches.html` — 3 layout approaches (Card hub / Tabs / Long scroll) — kareem picked A
- `03-hub-design.html` — Section 1/3 design: full mockup of the new Reporting hub

**Next concrete step:** if kareem approves the hub layout, push Section 2 — the Picker Report page itself: bucket table, expandable most-common-items table, period filter, "Export A4 PDF" button. After that Section 3 covers the PDF format + technical/implementation outline. Then write spec to `docs/superpowers/specs/2026-05-16-kika-reporting-picker-report-design.md`, kareem reviews, then I invoke `superpowers:writing-plans`.

**Hard gate active:** no code, no scaffolding, no implementation skill calls until kareem approves the written spec.

---

## 2026-05-16 — UX FIX: order modal line-items table — Qty + Price cells were colliding

**Status:** Brainstorming phase, awaiting user. No code this turn.

**User asked for two things:**
1. **Create a Reporting module under KIKA** — a new top-level tab on `/emails/kika` that **groups existing dashboards** (Sales, Fulfillment, Delayed, To Manufacture, etc.) with no new functionality, just links/cards.
2. **Brainstorm a new ops report** that surfaces (a) which orders can be fulfilled with 1 item / 2 items / etc. (cut-and-release by item count), and (b) most common items in unfulfilled orders.

**Where things stand:**
- I invoked `superpowers:brainstorming`. Per the skill flow I must explore project context → offer visual companion (own message) → ask clarifying questions one at a time → propose 2-3 approaches → present design → write `docs/superpowers/specs/YYYY-MM-DD-…-design.md` → user reviews → invoke `superpowers:writing-plans`. **Hard gate**: no code until the user approves a written design.
- Explored: confirmed `/emails/kika` hub lives at `src/app/emails/[domain]/page.tsx` (parametrised by domain), with existing cards for Setup / Exec / Financials / Sales / Inventory. The new Reporting card would slot in there as a 6th module. KIKA pages under `/emails/kika/`: `exec`, `financials`, `history`, `inventory` (with `raw-materials` subtab), `sales`, `setup`.
- I just sent the Visual Companion offer message (own message per skill rule). Waiting on the user's yes/no before asking clarifying questions.

**Next concrete step (whenever the user replies):** start clarifying questions. The first one I'm planning: "What does Operations actually do with the 1-item / 2-item bucket report — pick a bucket and ship the whole bucket at once, or just see the count and triage manually?" — that's the question that drives whether this report needs bulk-action buttons (mark fulfilled / print picking slip / export to delivery sheet) or is read-only.

**Other open questions queued up:**
- Item-count buckets: by total units (qty sum) or by line-item count? They differ when one line has qty=2.
- "Most common items" — variant level or product level (same call we made on the Mfg report)?
- Cut-off period: this report keyed to the dashboard period filter, or always "all open backlog"?
- PDF export? Print-friendly? Or screen-only?

Nothing committed or deployed this turn.

---

## 2026-05-16 — UX FIX: order modal line-items table — Qty + Price cells were colliding

**Status:** Pending commit + push.

**Bug:** In the order-detail modal's Line items table, "Qty 1" and "Price 2,800" were rendering with no horizontal padding between them, so `1 2,800` read as `12,800`. Right-aligned `tabular-nums` cells were butted up directly against each other.

**Fix:** Added `px-3` to Qty / Price (header + body), explicit widths (`w-14` Qty, `w-20` Price + Line total), `whitespace-nowrap` so digits never wrap mid-number, and `px-2` to the Product cell so its description text doesn't crash into the Qty column either. Line total keeps `pl-3 pr-0` so it stays flush to the table edge.

**Verification:** `tsc --noEmit` clean. Visual fix only — no logic change.

---

## 2026-05-16 — FEATURE: KIKA Mfg drill-down — click Orders count → popup → order detail

**Status:** Pending commit + push.

**User ask:** "When I click on orders on this screen, need a popout with the order numbers and details, then click one of the order numbers to open the specific order with previously designed specific order details."

**What I built:**
- Each manufacturing row now carries a `VariantOrder[]` list of the actual orders behind its count: order id, order name, customer, email, created_at, age_days, and the remaining qty of this variant in that order (post partial-fulfillment netting).
- The "Orders" column in [src/app/emails/kika/exec/_components/manufacturing-drilldown.tsx](src/app/emails/kika/exec/_components/manufacturing-drilldown.tsx) is now a clickable indigo number. Click → opens a centred modal listing every order that contains that variant, oldest first.
- New [src/app/emails/kika/exec/_components/variant-orders-popup.tsx](src/app/emails/kika/exec/_components/variant-orders-popup.tsx) renders the popup: product thumbnail + title + variant + SKU header, then a table of (Order, Customer, Placed, Age, Qty) rows. Each order number uses the existing `<OrderNumberButton>` so clicking it stacks the full order-detail modal on top. Two levels of modal — close the order one → drop back to the orders list; close the orders list → drop back to the manufacturing table. ESC closes whichever is on top.

**Builder changes in [src/lib/kika-manufacturing.ts](src/lib/kika-manufacturing.ts):**
- Pulls `name`, `customer_name`, `email` on the orders select.
- `Bucket.order_ids: Set<number>` → `Bucket.qtyByOrderId: Map<number, number>` so the same variant on two line items in the same order sums correctly.
- New `VariantOrder` exported type; each row now exposes `orders: VariantOrder[]` (and `order_count` is now `orders.length`, kept for the PDF/header summary).

**Verification:** `tsc --noEmit` clean. No data-layer changes (additive projection only).

---

## 2026-05-16 — FIX: KIKA Mfg report — net out partially fulfilled line items

**Status:** Pending commit + push.

**Issue:** Even after the negative-stock clamp, an order with `fulfillment_status = 'partial'` was contributing the *entire* original `line_item.quantity` to Open qty / Net to make. So if a 2-piece order had 1 unit already shipped, we were still telling production to make 2.

**Fix:** [src/lib/kika-manufacturing.ts](src/lib/kika-manufacturing.ts) now reads `raw.fulfillments[].line_items[]` off each open order and builds a `{ line_item_id → already_shipped_qty }` map. For each `shopify_line_items` row, `remaining = max(0, quantity − already_shipped)`. Lines whose remaining is 0 are skipped entirely (so a partially-fulfilled order with one fully-shipped + one untouched line item now only contributes the untouched line). Fulfillments with `status ∈ {cancelled, failure}` are ignored.

**Implementation notes:**
- Added `raw` to the order select so we can mine `fulfillments[]` without an extra trip.
- Added `id` to the line-items select so the line-item PK can key into the fulfilled-by-id map.
- Updated the docstring at the top of the lib to spell out both the partial-netting rule and the negative-stock clamp.

**Net effect** on the dashboard's "501 net to make" / "116 open units" headline numbers: both drop a bit further, by exactly the qty already shipped on partial orders in the period (zero in most cases since KIKA mostly ships orders all-or-nothing, but won't overstate when partials do happen).

**Verification:** `tsc --noEmit` clean.

**Still not handled (deferred — flag for kareem):** the order-detail modal's Line items table still shows `quantity` rather than `remaining qty / fulfilled qty`. If you want that surfaced per line item inside the modal, easy next change — same data source.

---

## 2026-05-16 — FIX: KIKA Mfg report — clamp negative stock to zero

**Status:** Pending commit + push.

**Decision:** kareem chose "consider all stock below zero to be zero, don't count negative quantities" — which is option (1) from the Q&A I posted last turn. The current formula was double-counting demand because Shopify decrements `inventory_quantity` on order placement (not fulfillment), so a negative stock value is usually the same units already living inside Open qty.

**Change:** [src/lib/kika-manufacturing.ts](src/lib/kika-manufacturing.ts) — `pickVariantStock()` now returns `Math.max(0, inventory_quantity)`. That single helper feeds both the `in_stock` field on the response rows AND the `net_to_make = max(0, open - in_stock)` computation, so clamping in one place fixes both. With the new behaviour:

- Black Luna Dress · SMALL · open=4, raw stock=−5 → reported stock=0, net to make=4 (was 9).
- Sunset Goddess · MEDIUM · open=3, raw stock=−10 → reported stock=0, net to make=3 (was 13).
- Sunset Goddess · SMALL · open=3, raw stock=−9 → reported stock=0, net to make=3 (was 12).

Also dropped the now-dead `in_stock < 0` styling branches in [manufacturing-drilldown.tsx](src/app/emails/kika/exec/_components/manufacturing-drilldown.tsx) (rose text) and [kika-manufacturing-pdf.tsx](src/lib/kika-manufacturing-pdf.tsx) (warn colour), since stock can no longer be negative.

**Verification:** `tsc --noEmit` clean. No data-layer changes (pure projection-layer fix).

---

## 2026-05-16 — Q&A: explained Mfg formula, flagged it's likely double-counting

**Status:** No code change this turn. Answered kareem's question about how Open / In stock / Net to make are computed in the new KIKA Manufacturing drill-down.

**What I explained:**
- **Open qty** = sum of `quantity` over line items belonging to open orders (not cancelled, not voided, fulfillment_status null/unfulfilled/partial) in the dashboard period.
- **In stock** = `shopify_products.raw.variants[i].inventory_quantity` — same value Shopify Admin shows. Can go negative when oversold past zero.
- **Net to make** today: `max(0, open_qty − in_stock)`. With Black Luna SMALL (open=4, in_stock=−5) this yields 9.

**Gotcha I flagged:** Shopify decrements `inventory_quantity` on order placement (not on fulfillment). So when In stock goes negative, those oversold units are usually **already inside Open qty**, meaning the current formula double-counts them. The cleaner formula is `max(0, open − max(0, in_stock))` → Black Luna SMALL would become 4, not 9.

**Open decision for kareem to make next turn:**
1. Switch to `net = max(0, open − max(0, in_stock))` + add a small "oversold by N" cue when in_stock < 0 (my recommendation — probably matches their reality).
2. Keep current formula (only right if they manually rebuild negative inventory_quantity to zero after restocking).
3. Show both numbers side-by-side.

**Also flagged for future:** today's calc doesn't subtract `fulfilled_quantity` on partials. If a line item is partially fulfilled, the whole line item qty counts as Open. Doesn't matter for KIKA's current operating pattern (mostly all-or-nothing orders).

Nothing committed or deployed this turn.

---

## 2026-05-16 — FEATURE: KIKA modal parity + thumbnails + Manufacturing tile/report

**Status:** Pending commit + push.

**User asks (3 things in one turn):**
1. "Make the two the same" — i.e. retire the old Sales-page modal and have everything reuse the cleaner Exec modal I built yesterday.
2. Add product thumbnails to the line-items table in that modal.
3. Add a 5th tile on the Exec dashboard for "products in unfulfilled orders" with a sortable drill-down + A4 PDF export.

User chose, via clarifying questions: both **Open qty + Net to make** columns side-by-side (subtracting current Shopify inventory), description column = **variant + SKU + short description**, tile metric = **total units to manufacture**, time scope = **matches dashboard period filter**.

**Phase 1 — modal merge + thumbnails:**
- Extended [src/app/emails/kika/exec/_components/order-detail-types.ts](src/app/emails/kika/exec/_components/order-detail-types.ts) `KikaOrderDetail.line_items[]` with `product_id`, `variant_id`, `variant_title`, `image_url`, `product_description`.
- [src/app/api/kika/orders/[id]/route.ts](src/app/api/kika/orders/[id]/route.ts) now joins related `shopify_products` rows by line-item product_id, resolves the best image (variant `image_id` → product's `raw.images[]`, falls back to `raw.image`), pulls variant title from option1/2/3 or pre-built variant `title`, and strips `body_html` to plain text for the description column. New helpers: `stripHtml`, `pickLineItemImage`, `pickVariantTitle`.
- [src/app/emails/kika/exec/_components/order-detail-modal.tsx](src/app/emails/kika/exec/_components/order-detail-modal.tsx) renders a 40×40 `<Thumb>` per line item (plain `<img loading="lazy">` — Shopify CDN already serves right-sized images; skipping `next/image` saves ~150ms first-paint per row at 40px). Product cell now shows title (bold) + `Variant · SKU` line + 2-line truncated description.
- [next.config.ts](next.config.ts) `images.remotePatterns` extended to allow `cdn.shopify.com` and `cdn.shopifycdn.net` (future-proof if someone switches the modal to `<Image>`).
- [src/app/emails/kika/sales/page.tsx](src/app/emails/kika/sales/page.tsx) retired the inline 313-line URL-driven `OrderDetailModal` (+ `TotRow` + `MetaRow`). `RecentOrdersBlock` now just drops `<OrderNumberButton orderId orderName>` into the order cell. Removed `?order=ID` plumbing from `searchParams`, `buildQs`, and the data fetch (`fetchKikaOrderDetail` still exists in `kika-sales.ts` but is now unreferenced — left for safe rollback).

**Phase 2 — Manufacturing tile + drill-down + PDF:**
- [src/lib/kika-manufacturing.ts](src/lib/kika-manufacturing.ts) — `buildKikaManufacturingReport({fromDate, toDate, label})` aggregates per (product_id, variant_id) across open unfulfilled non-cancelled orders in the window. Pulls `inventory_quantity` from `shopify_products.raw.variants[].inventory_quantity`, computes `net_to_make = max(0, open_qty - in_stock)`. Returns rows + totals (`total_open_units`, `total_net_to_make`, `distinct_variants`, `distinct_products`, `open_order_count`). Default sort = net_to_make desc, then oldest_age_days desc.
- [src/app/emails/kika/exec/_components/manufacturing-drilldown.tsx](src/app/emails/kika/exec/_components/manufacturing-drilldown.tsx) — client component. Sortable headers (Product / Variant / SKU / Open qty / In stock / Net to make / Orders / Oldest age). Renders thumbnail + bold product title + 2-line description, variant pill, SKU mono. "Export A4 PDF" button links to the new PDF route. Default sort = net_to_make desc; click toggles direction.
- [src/lib/kika-manufacturing-pdf.tsx](src/lib/kika-manufacturing-pdf.tsx) — `@react-pdf/renderer` A4 layout with KIKA-branded header strip, 4-card totals row, full sortable-by-builder table (#/Product/Variant/SKU/Open/Stock/Net/Oldest), and fixed footer with auto page numbers (`render={({pageNumber,totalPages})=>...}`).
- [src/app/api/kika/manufacturing-report/route.ts](src/app/api/kika/manufacturing-report/route.ts) — GETs `from=YYYY-MM-DD&to=YYYY-MM-DD&label=...`, rebuilds the report server-side, streams `application/pdf` via `renderToBuffer`. Auth = `requireDomainAccess('kika')`.
- [src/app/emails/kika/exec/page.tsx](src/app/emails/kika/exec/page.tsx) — widened `Focus` union to include `'manufacturing'`, narrowed `FocusDrilldown` prop to `Exclude<Focus,'manufacturing'>` so it doesn't need a stub for the new case. Row 4 grid is now `md:grid-cols-3 lg:grid-cols-5` to fit the 5th tile. New tile uses indigo accent + `Factory` icon, shows total_net_to_make as the headline and "across N variants" as sub. Page-level Promise.all now fetches manufacturing report in parallel.

**Improvements baked in (user asked me to suggest):** variant-level granularity (not product-level), oldest backlog age column for prioritisation, cancelled/voided excluded from rollup, A4 PDF includes branded header + totals strip + page numbers.

**Verification:** `npx next build` green; `.next/server/app/api/kika/{orders,manufacturing-report}` both emitted. tsc clean.

---

## 2026-05-15 — FEATURE: KIKA Executive — clickable order numbers open detail modal

**Status:** Pending commit + push (auto-deploy via GitHub→Vercel).

**User request:** "In KIKA module, need to be able to click the order number to get a popup with all order details."

**Surfaces touched:** [src/app/emails/kika/exec/page.tsx](src/app/emails/kika/exec/page.tsx) — the two tables on the KIKA Executive page that list order numbers (the focus drill-down `FocusDrilldown` for Undelivered / Delayed / Refunded / Cancelled, and the "Most delayed orders" mini-table). Both now wrap `o.name` in a `<OrderNumberButton>` instead of plain text.

**New components / route:**
- `src/app/api/kika/orders/[id]/route.ts` — GETs a single order. Pulls `shopify_orders` (header + `raw` jsonb) and `shopify_line_items` in parallel, projects to a stable `KikaOrderDetail` JSON shape (totals breakdown, shipping address from raw, line items with computed line totals, fulfillments with tracking, discount codes, payment gateways, note). Gated through `requireDomainAccess('kika')`.
- `src/app/emails/kika/exec/_components/order-detail-types.ts` — Shared `KikaOrderDetail` + `ShopifyAddress` types. Lives in a neutral module so the client modal can import the types without dragging the `server-only` route into the client bundle.
- `src/app/emails/kika/exec/_components/order-detail-modal.tsx` — Client slide-over modal (`fixed inset-0 z-50`, backdrop click + ESC to close, body-scroll lock). Fetches `/api/kika/orders/{id}` on open with `cache: 'no-store'`. Renders: status pills + tags, customer card (name / email / phone with mailto+tel links), shipping-address card, line items table with qty × price − discount → line total, totals breakdown card (subtotal, discounts, shipping, tax, total, refunded), discount codes + payment gateways, fulfillment list with tracking links, customer note. Has loading + error states. Direct "Open in Shopify admin" link.
- `src/app/emails/kika/exec/_components/order-number-button.tsx` — Tiny client button that renders the order name as an indigo underlined link and toggles the modal open state. Used in both tables on the exec page.

**Verification:** `npx next build` is green; new route emitted under `.next/server/app/api/kika/orders/[id]`. tsc clean.

---

## 2026-05-15 — UX FIX: signed Total sort on Payables (downpayment vs payable)

**Status:** `84c3950` pushed.

**User feedback:** Sorting Total by `Math.abs(amount)` mixed positive entries (downpayments TO a vendor — partner owes us, asset-like) with negative entries (we owe the vendor — actual liability) by magnitude. That's meaningless on a Payables view where +/- has clear business semantics.

**Fix:** Both `PayablesDetailModal` and `PayablesBlock` now sort Total by SIGNED amount (`a.amount - b.amount`) instead of `|amount|`.
- `'asc'` = most-negative at top = biggest payable first (typical operator intent on Payables).
- `'desc'` = largest positive at top, most-negative last.

Click convention unchanged (first click sets desc, second click toggles to asc). Arrow icons unambiguously reflect the numeric direction. Applied to vendors / owners / employees cards on both the on-page preview AND their modals.

Verification: `tsc --noEmit` clean. 704 / 22 skipped. No data-layer changes.

**Open question for kareem:** should the default first-click on Total on the Payables screen flip to `asc` (most-payable-first) since that's the most common operator intent? Currently first click = desc (positives at top), consistent across the codebase. If they want screen-specific override, will revisit.

---

## 2026-05-15 — UX FIXES: Payables modal + preview list — sortable + clean names

**Status:** Two commits shipped (`9e43b6d`, `baf5c83`). Vercel auto-deploying.

**User requests (in order):**
1. **Sort by name / total due** on the Payables aging modal.
2. **Strip leading "NNN."** prefixes from vendor + owner names.
3. **Sort on the main screen** (preview cards on `/beithady/financials/payables`), not just the modal.
4. Some Arabic names still showed prefixes after first deploy — turns out the digit code is typed at the END of Arabic strings ("هيتيك (شيماء عبدالحكيم).145"), so the trailing strip was missing.

**Commit `9e43b6d` — sortable Payables modal + leading prefix strip:**
- Added `cleanPartnerName(raw)` helper in `PayablesDetailModal.tsx`. Initially stripped only leading `^\d+\.\s*`.
- Applied to (a) modal table body, (b) print HTML, (c) the 40-row preview list in `PayablesBlock.tsx`. Hover `title` attr keeps the original raw name.
- Added `sortKey: 'name' | 'total' | null` + `sortDir: 'asc' | 'desc'` state in the modal. Clickable Name + Total headers with `ArrowUp` / `ArrowDown` / `ArrowUpDown` indicators. Default order unchanged (parent-supplied, `|amount|` desc). Print/email use the current sort order.
- Sort by total = `|amount|` (biggest payable surfaces regardless of sign). Sort by name = `localeCompare` on the cleaned name.

**Commit `baf5c83` — trailing suffix strip + sort on preview list:**
- `cleanPartnerName` now also strips trailing `\s*\.\d+\s*$` (catches Arabic names where the code lives at the end of the string in memory, regardless of how RTL bidi renders it). Both passes run, defensively. Result with empty string falls back to raw.
- `PayablesBlock.tsx` becomes `'use client'`; added the same sort state + arrow headers to the on-page preview list (the 3 Vendors / Employee / Owners cards). UX matches the modal: click Name to sort A→Z, click Amount to sort by `|amount|`, second click toggles direction.

**Verification:** `tsc --noEmit` clean. Full suite 704 / 22 skipped (no regressions). No data-layer changes.

**Heads-up to user:** if the leading prefixes still appear after deploy, it's likely browser cache — hard refresh (Ctrl+Shift+R).

---

## 2026-05-15 — YouTube V1.2 · Task 16 — boost page Source: YouTube fork + publishMetaVideoAdAction

**Status:** DONE. Commit `4e3bd2a` pushed to main. `tsc --noEmit` exit 0.

**Files modified:**
- `src/app/beithady/ads/instagram/boost/page.tsx` — Source: YouTube fork. When `?yt_video_id` is set + `?ads_yt_video_id` resolves a local `ads_youtube_videos` row, the page now renders the `YouTubeSourceBanner` + a brand-new "New Meta video ad from YouTube" form (title, body, daily budget, CTA, landing URL, age min/max) instead of the existing IG-boost selector. When no YT param is set, the page shows the existing `BoostSelector` PLUS an "Or pick a YouTube video to create a fresh video ad" embedded section using `EmbeddedPicker` with `platform="meta_video_ad"`. The `account_id` for the form comes from the existing `selectedAccount` (Meta IG-resolved account).
- `src/app/beithady/ads/actions.ts` — Added `publishMetaVideoAdAction` server action: validates input, calls `publishMetaVideoAd` orchestrator, writes `recordCrossPost({ target_platform: 'meta_video_ad', target_campaign_id })` row BEFORE the success redirect, and redirects to `/beithady/ads/campaigns/{id}?created=meta_video_ad`. On failure, redirects back to boost page with `?error&step`. Imports `publishMetaVideoAd` + `MetaVideoAdInput` from `@/lib/beithady/ads/meta-video-ad-publish`.

**Picker items loading:** mirrors the same `listPickerVideos(ytAccountId)` pattern used in IG Reels / TikTok pages — finds the first `ads_accounts` row with `platform='youtube'` and lists its videos.

**Existing UI hidden when in ytMode:** the entire `BoostSelector` + embedded picker section is wrapped in `{!ytMode && (...)}`. Operator can return to default mode via the banner's "Switch source" link (which clears the query params). The account switcher remains visible in both modes.

**No divergences from plan** beyond fully-qualified relative imports (e.g. `../../../gallery/youtube/picker/_components/...` since the page sits 3 deep under `src/app/beithady/`), and accepting `actor_user_id` as a number for `recordAudit` (matching the rest of the file) while passing `user.id ? String(user.id) : null` to `recordCrossPost` (which expects `string | null`).

---

## 2026-05-15 — UX FIX: rail auto-collapse mouse handlers (BH dashboard shell)

**Status:** Fix pushed in `7438ba6`. Vercel auto-deploy in flight. User reported: rail never auto-collapses on financials sub-pages even after a long idle.

**Root cause:** `bh-dashboard-shell.tsx` bound `onMouseEnter` / `onMouseLeave` to the outer GRID div (which spans rail + main content). Moving the cursor from the rail into the main content area kept it "inside" the grid bounds, so `onMouseLeave` never fired and the 3 s `useRailCollapse` idle timer never started. The behavior affected all 7 `<BHDashboardShell>` consumers (Analytics Performance, Fees Audit, Financials Performance, Balance Sheet, Payables, Ledgers, Reconciliation), but went unnoticed on Analytics Performance because operators move the cursor off-page often there.

**Fix:** moved the handlers down one level — bound to the **rail wrapper div** itself rather than the parent grid. Now the timer starts when the cursor leaves the rail and enters the main content, matching the operator's expectation ("rail disappears ~3 s after I move off it, hover brings it back").

**Verification:** all 26 dashboard-shell tests still pass. `tsc --noEmit` clean. 1 file changed, 11 ins / 3 del.

**Lesson for future BHDashboardShell evolution:** mouse-tracking for rail UX belongs on the rail element, not the layout container. The container's only job is column-width math.

---

## 2026-05-15 — HOTFIX: BH financials sub-pages crashing on prod ('use client' boundary)

Earlier this hour: server pages were calling `parseFinXState` from `'use client'` hook files, which Next.js 16 treats as illegal client→server invocation. Fix `61554f7` split each of the 5 typed URL hooks into a non-client pure-helpers sibling + a re-exporting client hook. All 5 server pages now import from the pure modules. 24 hook tests still pass.

(See full entry below for details.)

---

## 2026-05-15 — YouTube V1.2 · Tasks 11/12/13 — publish-page wiring (IG Reels, TikTok organic, TikTok paid)

**Status:** DONE_WITH_CONCERNS (Task 12 partial — see below). 3 commits pushed.

**Commits (all `tsc --noEmit` exit 0):**
- `773f02e` Task 11: `src/app/beithady/ads/instagram/reels/page.tsx` + `actions.ts` — `?yt_video_id` pre-fill (video_url, caption from title+desc, hashtags from tags, building_code), embedded YouTube picker section (hidden when source already selected), banner above form, hidden inputs (`yt_video_id` + `ads_yt_video_id`), `recordCrossPost({ target_platform: 'instagram_reel', target_post_id })` in `publishInstagramReelAction` before redirect.
- `a84a51e` Task 12: `actions.ts` only (action-side audit on `publishTikTokReelAction`). **Page-side N/A:** `/beithady/ads/tiktok/organic` is a curated public-URL embed gallery (oEmbed-based — TikTok + Instagram URLs), NOT a TikTok-API publish form. The page uses `addReelAction` from `./actions` (single `url` field). `publishTikTokReelAction` lives in `actions.ts` but is currently not wired to any UI page. Action-side audit is in place so any future caller/UI gets V1.2 cross-post tracking for free.
- `e6622ff` Task 13: `src/app/beithady/ads/tiktok/paid/page.tsx` + `actions.ts` — full pattern: `?yt_video_id` pre-fill (video_url, building_codes), embedded picker, banner, hidden inputs, `recordCrossPost({ target_platform: 'tiktok_paid', target_campaign_id })` in `publishTikTokPaidAction` before redirect.

**V1.1 schema note (verified):** `ads_youtube_videos` (migration `0134`) has `source_url` only — no `storage_bucket`/`storage_path`. So no `signedUrlFor` re-signing — pages use `source_url` directly as the `video_url` default.

**Push:** `git push origin main` → `77f8b9c..e6622ff main -> main`. Vercel auto-deploys.

**Self-review:** 3 commits ✓ · 3 × `tsc --noEmit` exit 0 ✓ · pushed ✓ · banner + embedded picker render correctly on IG Reels + TikTok Paid · Task 12 page-side flagged (curated-URL page, not publish UI).

**Task 12 follow-up needed (parent agent decision):** Either (a) restore the TikTok-API publish form at `/beithady/ads/tiktok/organic` (or a sibling route) wiring `publishTikTokReelAction`, or (b) accept that the "TikTok organic" V1.2 cross-post path is action-only and document the page is intentionally a curated-embed gallery.

---

## 2026-05-15 — HOTFIX: BH financials sub-pages crashing on prod ('use client' boundary)

**Status:** Fix pushed in `61554f7`. Vercel auto-deploy in flight. User reported "Something went wrong" (ref 1651615459 + variants) on every financials tile click; landing rendered fine.

**Root cause (Next.js 16 strict boundary):** Every export from a `'use client'` module is treated as a client reference. The P1 + P2 server `page.tsx` files imported and CALLED `parseFinXState()` from `'use client'`-marked hook files. `npm run build` did NOT catch this; it threw at runtime: `Error: Attempted to call parseFinPerfState() from the server but ...` Vercel runtime logs confirmed on `/beithady/financials/performance` (and presumably all sibling sub-pages by extension).

**Fix:** Split each typed URL hook into two files:
- `<feature>-url-state.ts` (no `'use client'`) — pure types, `parseFinXState`, `serializeFinXState`, `buildFinXUrl`, defaults. **Server pages import from here.**
- `use-<feature>-url-state.ts` (`'use client'`) — re-exports the pure helpers + adds the React `useXUrlState()` hook. **Client Shells import from here.**

Five hooks split (per audit P1 + P2):
1. `perf-pnl-url-state.ts` + `use-perf-pnl-url-state.ts`
2. `bs-url-state.ts` + `use-bs-url-state.ts`
3. `payables-url-state.ts` + `use-payables-url-state.ts`
4. `ledgers-url-state.ts` + `use-ledgers-url-state.ts`
5. `reconciliation-url-state.ts` + `use-reconciliation-url-state.ts`

Five server `page.tsx` files (performance, balance-sheet, payables, ledgers, reconciliation) updated to import `parseFinXState` from the pure modules.

**Test files untouched** — they keep importing from the `use-*` hook files which re-export everything. All 24 hook tests still pass.

**Verification:** `tsc --noEmit` clean. `vitest run src/app/beithady/financials/_hooks/` → 24/24 pass. `npm run build` succeeds. Backward-compat preserved: same parse behavior, same URL contract, same A1 handling.

**Lesson for future migrations:** when adding a typed URL hook for a new dashboard page, declare the pure helpers in a non-client file from the start. The hook file ONLY contains `'use client'` + `useXUrlState()` + a re-export of pure helpers. Document this in the BHDashboardShell spec under "URL state hook setup" so the pattern propagates to downstream consumers (analytics/calendar-heatmap, market-intel, inventory dashboards, ads/performance, ops, hr, communication inbox migrations still ahead).

**Diff:** 15 files changed (5 new pure modules + 5 rewritten hook re-exports + 5 page imports), 434 ins / 318 del.

---

## 2026-05-15 — YouTube V1.2 · Picker UI components (Tasks 5–8)

**Status:** DONE. Pushed.

**What landed (6 new files, 4 commits, all `tsc --noEmit` clean):**
- `54520e6` Task 5: `src/app/beithady/gallery/youtube/picker/_components/picker-filters.tsx` — client component, URL-state-driven format / building / search / sort controls. Mutates `useSearchParams` via `router.push` with `scroll: false`.
- `b1d0ca7` Task 6: `src/app/beithady/gallery/youtube/picker/_components/picker-row.tsx` — thumbnail + metadata + 5 per-platform action buttons. Disabled buttons render with `⊗` glyph + `title` tooltip carrying the `reason` from `computeActions()`. `already_cross_posted` summary line.
- `f40db48` Task 7: `picker-grid.tsx` + `page.tsx` (standalone picker route at `/beithady/gallery/youtube/picker`). `requireBeithadyPermission('ads', 'full')`. Looks up the singleton `ads_accounts` row where `platform='youtube'`, redirects to `/beithady/ads/accounts?need_connect=youtube` if absent. **Lucide-react v1.8.0 has no `Youtube` export — used `Video as YouTubeIcon`** as the plan specified (V1.1 hit the same).
- `d283c61` Task 8: `embedded-picker.tsx` + `youtube-source-banner.tsx` — reusable across publish pages (filtering by `actions[platform].available` to only show compatible items; banner renders source attribution + "Switch source" / "Open on YouTube" links).

**Imports verified before write:** `PickerItem`, `listPickerVideos`, `TargetPlatform`, `requireBeithadyPermission('ads', 'full')`, `supabaseAdmin`, `fmtCairoDate`, `BeithadyShell` + `BeithadyHeader` all resolved cleanly.

**Push:** `git push origin main` → `34931f7..d283c61 main -> main`. Vercel auto-deploys on push.

**Self-review:** 4 commits ✓ · 4 × `tsc --noEmit` exit 0 ✓ · 6 files created ✓ · pushed ✓.

**Next (queued, not started by this session):** YouTube V1.2 plan continues with Tasks 9-21 (publish-page integration, audit hookups, cron entry, etc.). Owned by parent agent.

---

## 2026-05-15 — BH Ads · Reels post-ship: alias re-pointed, backfill skipped

**Status:** DONE. No new code.

**What happened in this turn:**
- Confirmed GitHub→Vercel auto-deploy of `3cbfe24` (origin/main HEAD) succeeded at 18:11 UTC. Latest Ready prod deploy is `https://lime-cu1sg25dt-lime-investments.vercel.app`. Includes reels v1.1, financials final-review fix (`isCompanyScope` guard removal in Payables), and the YouTube picker module from the other session.
- **Re-aliased `app.limeinc.cc` → `lime-cu1sg25dt-...vercel.app`** via `vercel alias set`. Prior alias was `lime-gfageuh9v` (reels v1.0, TikTok-only). The lime project doesn't auto-update the custom-domain alias on deploy — has to be manual each time (existing known quirk; saved memory).
- **Backfill action: not needed.** Queried `bh_marketing_reels` via SQL: 0 rows. The planned "refresh metadata for pre-0136 rows" task was hypothetical — no test reels were actually added during v1.0. Skipped building the admin action since it'd be dead code today. If real reels accumulate later and a `thumbnail_url`-is-null row appears, the simplest fix is delete + re-add through the form (action runs oEmbed at insert). A bulk `Refresh metadata` admin action can be added on demand.

**Smoke test still pending the operator:** paste a real Beit Hady TikTok and a real Beit Hady IG reel URL through the add form at `/beithady/ads/tiktok/organic`. Confirm:
1. TikTok: thumbnail poster shows immediately, caption auto-populates from oEmbed if left blank, author handle appears on the card.
2. Instagram: blockquote hydrates into the IG iframe via `instagram.com/embed.js`.

**Next (queued, not started):** none. The reels feature thread is closed pending real-content smoke test. Open follow-ups elsewhere in the repo (YouTube V1.2 § 1 approval, P3 setup/pricing shells, P2 §8 non-financials data dashboards) are owned by other sessions.

---

## 2026-05-15 — BH Ads · Reels v1.1: Instagram support + TikTok oEmbed auto-fetch

**Status:** DONE. Pushing now.

**Builds on:** `982f263` (Reels v1.0, TikTok-only embed-in) + `d4e0627` (.vercelignore). This pass adds the two enhancements kareem picked off the "what's next" menu: Instagram reels (schema already supported it via `platform` col) and TikTok oEmbed auto-fetch (kills the "Loading TikTok…" flash with a thumbnail poster, defaults the caption).

**What landed:**
- `supabase/migrations/0136_bh_marketing_reels_metadata.sql` — adds `thumbnail_url`, `author_name`, `author_url` columns to `bh_marketing_reels` (idempotent `add column if not exists`). Applied to Supabase via MCP.
- `src/lib/beithady/instagram-url.{ts,test.ts}` — parser for `/reel/{code}`, `/p/{code}`, `/tv/{code}`, and the newer `/{user}/reel/{code}` form. 15 tests.
- `src/lib/beithady/social-url.{ts,test.ts}` — `parseSocialUrl(input)` dispatcher: detects tiktok.com vs instagram.com (incl. `m.` subdomains) and routes to the right parser. Returns a discriminated union (`platform: 'tiktok'|'instagram'`) so the action gets normalized fields (`externalId`, `canonicalUrl`, plus platform-specific extras). 7 tests.
- `src/lib/beithady/tiktok-oembed.{ts,test.ts}` — server-only `fetchTikTokOEmbed(url)` calling `tiktok.com/oembed`. 5s AbortController timeout, swallows errors → empty fields (never blocks the insert). Returns `{ title, author_name, author_url, thumbnail_url }`. 5 tests with mocked fetch.
- `actions.ts` — `addReelAction` now uses `parseSocialUrl`, dispatches metadata fetch by platform (TikTok only in v1; IG would need a Meta Graph token). User-supplied caption wins over oEmbed title. Audit `action` field is platform-aware on add (`tiktok_reel_added` / `instagram_reel_added`) and platform-agnostic on subsequent ops (`marketing_reel_updated`/`_shown`/`_hidden`/`_deleted`).
- `_components/tiktok-embed.tsx` — accepts optional `thumbnailUrl` + `authorName`. Renders the thumbnail as a 9:16 poster inside the blockquote's `<section>` fallback so users see the right frame instantly; TikTok's embed.js swaps the whole blockquote for the iframe when ready.
- `_components/instagram-embed.tsx` — IG's official blockquote (instagram-media class, data-instgrm-permalink with the required `?utm_source=ig_embed&utm_campaign=loading` suffix appended at render time).
- `_components/social-embed.tsx` — server-side dispatcher: `<SocialEmbed reel={...} />` picks the right platform embed.
- `_components/reel-card.tsx` — uses SocialEmbed, shows platform badge (Music2/Camera icon + label, rose/fuchsia accent), shows author_name on cards that have it, platform-aware "Open on X" tooltip + delete-confirm copy.
- `page.tsx` — drops the hardcoded `platform: 'tiktok'` list filter; title is now "Curated Reels" with TikTok + IG subtitle. Adds a 3-button platform filter (All / TikTok / Instagram) preserving the `show_hidden` + `building` query params on switch. Loads both `tiktok.com/embed.js` AND `instagram.com/embed.js` via `next/script` (lazyOnload). URL stays at `/beithady/ads/tiktok/organic` for tab/bookmark compat.
- `add-reel-form.tsx` — placeholder updated to "TikTok or Instagram URL" + tooltip with full examples.
- `marketing-reels.ts` — `MarketingReel` row type extended with the new metadata fields.

**Verification:**
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` (parser + oembed suite) → 42/42 passing (15 TT URL + 15 IG URL + 7 social-url + 5 oEmbed)

**Known limitations (out of scope for v1):**
- Instagram oEmbed not wired (requires Meta Graph access token). User can hand-fill caption; embed itself carries it anyway.
- TikTok short URLs (`vm.tiktok.com`, `vt.tiktok.com`, `/t/`) and IG `/share/...` redirects still rejected with helpful messages — server-side HEAD-follow to resolve them not built.
- No backfill action for existing TikTok rows added before this migration — their `thumbnail_url`/`author_*` cols are NULL until re-added. Cheap fix later: one-off SQL `update bh_marketing_reels set thumbnail_url = ... from (select ...)`. Not bothering since only test reels exist so far.

**Files in this commit:**
- New: `supabase/migrations/0136_*`, `src/lib/beithady/{instagram-url,social-url,tiktok-oembed}.{ts,test.ts}`, `_components/{instagram-embed,social-embed}.tsx`
- Modified: `marketing-reels.ts`, `actions.ts`, `tiktok-embed.tsx`, `reel-card.tsx`, `page.tsx`, `add-reel-form.tsx`

**Next:** Re-alias `app.limeinc.cc` once the new build is verified (currently still points at `lime-gfageuh9v` pre-IG). Smoke test: paste a real Beit Hady IG reel URL through the form, confirm the IG embed renders.

---

## 2026-05-15 — BH audit P2 financials cleanup SHIPPED: 7 pages migrated + FinancialsFilterStrip deleted

**Status:** All 11 tasks complete. 8 commits pushed to main (`35813e9` → `e7f1c06`). Vercel auto-deploy in flight.

**What landed:**
- **Phase 1** (`35813e9`): extracted `FinScope` + `VALID_FIN_SCOPES` to `src/app/beithady/financials/_hooks/url-state-types.ts`. Updated `use-perf-pnl-url-state.ts` + `use-bs-url-state.ts` to import from shared module (kept `FinPerfScope`/`FinBSScope` aliases for backward-compat).
- **Phase 2 — Payables** (`c3ee8bf`): `usePayablesUrlState` (4 vitest assertions) + `PayablesShell.tsx` + page rewrite. Rail: Scope + As-of date. **Last consumer of `FinancialsFilterStrip` migrated.**
- **Phase 3 — Ledgers** (`307484a`): `useLedgersUrlState` (6 assertions covering kind defaults + invalid-kind fallback) + `LedgersShell.tsx` + page rewrite. Rail: Scope + Kind (7 pills: supplier/owner/customer/landlord/employee/noteholder/all) + As-of date. Promoted `LedgerReport` from inline return type to named export in `src/lib/beithady/financials/ledgers.ts`.
- **Phase 4 — Reconciliation** (`8167233`): `useReconciliationUrlState` (3 assertions) + `ReconciliationShell.tsx` + page rewrite. Rail: single-section Snapshot dropdown picker. Empty-state branch (no frozen snapshot) uses `BeithadyShell` (not dashboard chrome). `ReconciliationReport` was already exported.
- **Phase 5 — Snapshots** (`3953937`): list + [id] detail shell swaps. Status pill colors inlined as semantic hex literals (frozen=green / draft=amber / other=neutral). Detail page's existing Export-xlsx action button relocated to `BeithadyHeader right=` slot.
- **Phase 6 — Import** (`c9e00ed`): wizard + [upload_id] detail shell swaps. Body content preserved verbatim (TARGET_ACCOUNTS, upload form, KIND_LABEL/KIND_COLOR semantic palette, kind chips, commit form). Plan referenced `parseResult.target_account_code` but correct field is `up.account_code` — implementer adapted correctly.
- **Phase 7** (`e7f1c06`): deleted `FinancialsFilterStrip.tsx` + `.test.tsx` (−152 lines). All callers migrated.

**Verification:** Final suite 657 passing / 22 skipped (Phase 4 hit 660; Phase 5/6 unchanged; Phase 7 dropped 3 strip-test assertions). `tsc --noEmit` clean. `npm run build` succeeds.

**Architecture milestone:** 10/12 audit "wrong-shell offenders" resolved. Only `/setup` and `/pricing` remain (P3, low traffic). `BHDashboardShell` (P0-2) now has 7 consumers — Analytics Performance, Fees Audit, Financials Performance, Balance Sheet, Payables, Ledgers, Reconciliation. `useBHUrlState<T>` (P0-2) has 5 typed consumers.

**Audit progress:** P0-1 ✅ (A1 removal) + P0-2 ✅ (BHDashboardShell + 2 consumers) + P1 ✅ (Financials landing/Performance/Balance Sheet) + P2 ✅ (remaining 7 financials + strip deletion). Remaining audit backlog: P2 §8 rows #7–12 (non-financials data dashboards — analytics/calendar-heatmap, market-intel, inventory dashboards, ads/performance, ops surfaces, hr dashboards, communication inbox) + §7.2 brand-var sweep + P3 setup/pricing.

**Final reviewer outcome:** ✅ READY TO SHIP. 2 Important + 4 Minor non-blocking findings:
- **I1 (deferred-as-documented):** Payables + Ledgers hooks use a `makeXDefaults()` factory function rather than the spec's "module-scope const DEFAULTS" pattern. Defensible — `asof` must reflect today at hook invocation, not module load. The Reconciliation hook (which has no date) correctly uses a static const. Inline comments in both Payables + Ledgers hooks document the rationale. Spec wording should be updated to allow factory defaults for time-sensitive state.
- **I2 (attempted, reverted by user):** Redundant `isCompanyScope` guard at line 13–14 of `financials/payables/page.tsx`. Reviewer flagged it as duplicated validation work that `parseFinPayablesState` already does. Controller attempted an inline cleanup (replace with `state.scope as CompanyScope`, matching Ledgers pattern); user/linter reverted the edit, keeping the guard. Harmless duplication, kept as-is per the revert signal.
- **Minors (deferred to follow-up):** Reconciliation empty-state branch uses BeithadyShell vs happy-path BHDashboardShell (chrome inconsistency); `MatchConf` type declared at bottom of import detail page; spec test-count target was ~639 but actual is 657; minor breadcrumb formatting style. None block production.

**Working-tree state at end of session:** `git status` shows kareem's parallel TikTok/Instagram/Reels work in progress (unrelated to P2 — `parseTikTokUrl` ImportError in `tiktok/organic/actions.ts`, plus new untracked files for instagram-url, social-url, tiktok-oembed, youtube/picker-errors, migration 0136). One local-only commit `6d007a6` (kareem's YouTube migration 0137 cross-posts audit table). NONE of this is from my P2 work; my P2 commits all pushed cleanly. The TikTok tsc error does not affect any of my pushed migrations.

---

## 2026-05-15 — BH Financials P2 Phase 6 (Task 9): Import wizard + detail → BeithadyShell

**Status:** DONE. Commit `c9e00ed`. Not pushed (per plan instructions).

**What landed:**
- `src/app/beithady/financials/import/page.tsx` — shell-swap only. Removed `TopNav`, `ChevronLeft`, `ChevronRight`, `Link` imports; added `BeithadyShell` + `BeithadyHeader`. `TARGET_ACCOUNTS` const, Supabase queries (snap + existing + haveSet), target-account picker grid, upload form, submit button all preserved verbatim. Subtitle is dynamic: shows `Target snapshot: ${snap.period_end}` when frozen snap exists, else `No frozen snapshot — import will create one`.
- `src/app/beithady/financials/import/[upload_id]/page.tsx` — shell-swap only. Removed `TopNav`, `ChevronLeft`, `ChevronRight` imports (kept `Link` — used in committed-state body for Reconciliation/Ledgers links). Added `BeithadyShell` + `BeithadyHeader`. Breadcrumb includes `upload_id.slice(0, 8) + '…'` label. `KIND_LABEL`, `KIND_COLOR`, classification logic, kind chips, unmatched-row yellow highlighting, commit form with kind breakdown, parsed rows table all preserved verbatim. KIND_COLOR semantic palette (blue/purple/emerald/amber/cyan/rose/slate) left intact per plan spec.

**Verification:**
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 660 passed (no new tests, no regressions)
- `npm run build` → succeeded

**Deviations from plan:** None. Note: plan spec referenced `parseResult.target_account_code` / `target_account_name` fields that don't exist on the upload row — used `up.account_code` (the actual DB field) for title/subtitle, which is correct.

---

## 2026-05-15 — BH Financials P2 Phase 5 (Task 8): Snapshots list + detail → BeithadyShell

**Status:** DONE. Commit `3953937`. Not pushed (per plan instructions).

**What landed:**
- `src/app/beithady/financials/snapshots/page.tsx` — shell-swap only. Removed `TopNav`, `ChevronLeft`, `ChevronRight` imports; added `BeithadyShell` + `BeithadyHeader`. Status pill colors inlined as hex literals (`#dcfce7`/`#166534` frozen-green, `#fef3c7`/`#854d0e` draft-amber, `var(--bh-cream)`/`var(--bh-steel)` other). `byPeriod` grouping + list body preserved verbatim.
- `src/app/beithady/financials/snapshots/[id]/page.tsx` — shell-swap only. Removed `TopNav`, `ChevronLeft`, `ChevronRight`, `Link` imports; added `BeithadyShell` + `BeithadyHeader`. Action button (Export xlsx with `Download` icon) preserved via `right=` prop on `BeithadyHeader`. Breadcrumb includes `{period_end} v{version}` label. Accounts table, partners table, all body logic preserved verbatim.

**Verification:**
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 660 passed (no new tests, no regressions — matches Phase 4 baseline exactly)
- `npm run build` → succeeded

**Deviations from plan:** None.

---

## 2026-05-15 — BH Financials P2 Phase 4 (Tasks 6-7): Reconciliation → BHDashboardShell

**Status:** DONE. Commit `8167233`. Not pushed (per plan instructions).

**What landed:**
- `src/app/beithady/financials/_hooks/use-reconciliation-url-state.ts` — TDD hook: exports `FinReconciliationUrlState` (`snapshot_id: string | undefined`), `parseFinReconciliationState`, `serializeFinReconciliationState`, `buildFinReconciliationUrl`, `useReconciliationUrlState`. URL param name is `snapshot` (matches existing contract).
- `src/app/beithady/financials/_hooks/use-reconciliation-url-state.test.ts` — 3 assertions (omits ?snapshot= when undefined, writes ?snapshot=<id>, parse handles missing param). All 3 pass.
- `src/app/beithady/financials/reconciliation/_components/ReconciliationShell.tsx` — `'use client'` shell. Single-section rail (Snapshot `<select>`). Threads rail state to BOTH `<BHDashboardShell>` AND `<BHLeftRail>` per P0-2 contract. Title bar: title="Reconciliation", subtitle="Account balance vs. partner ledger totals", Snowflake chip. Actions: Export xlsx + Back to Financials. Body: BH-var-themed summary chips (green/red semantic) + variance table (preserved logic from original).
- `src/app/beithady/financials/reconciliation/page.tsx` — server component rewrite. Fetches all frozen consolidated snapshots for rail picker. Resolves: explicit URL → use it; else latest frozen. Empty-state (no snapshot) uses `<BeithadyShell>` not BHDashboardShell. Otherwise renders `<ReconciliationShell>`.

**`ReconciliationReport` export needed?** No — already exported at line 15 of `src/lib/beithady/financials/reconciliation.ts`.

**Verification:**
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 660 passed (660 vs ~657 baseline = +3 new hook tests)
- `npm run build` → `✓ Compiled successfully`, `✓ Generating static pages (43/43)`, route `ƒ /beithady/financials/reconciliation` listed. (Windows Turbopack ENOENT on `.tmp` manifest rename is a known transient race; build output confirmed clean.)

**Deviations from plan:** None.

---

## 2026-05-15 — BH Ads · TikTok Reels (organic) replatformed from publish-out → embed-in

**Status:** DONE. Pushing now.

**Why:** TikTok dev-app rejection — "Beit Hady Dashboard" was rejected for production with the reviewer note: *"App will not be approved for personal or company internal use… Not acceptable: Display posts from the TikTok account(s) you or your team manage on your website."* The original publish-out flow (Content Posting API → state machine in `ads_tiktok_posts`) is unreachable without a working dev app. Pivoted to embed-in using TikTok's public embed.js (no API access required).

**What landed:**
- `supabase/migrations/0135_bh_marketing_reels.sql` — new `bh_marketing_reels` table (platform check 'tiktok'/'instagram' for future IG support, `url`, `external_id`, optional caption/building_code/sort_order, `is_visible`, audit cols, RLS open with single-policy). UNIQUE(platform, external_id) prevents dup adds. Applied to Supabase via MCP.
- `src/lib/beithady/tiktok-url.ts` + `tiktok-url.test.ts` — URL parser accepting canonical `tiktok.com/@user/video/{id}` (incl. `www`, `m.`, no-www, with trailing slash, query strings), rejects short links (`vm.tiktok.com`, `vt.tiktok.com`, `/t/`) with helpful messages. 15/15 tests pass.
- `src/lib/beithady/marketing-reels.ts` — `listMarketingReels({ visibleOnly?, platform?, building? })` server-only helper.
- `src/app/beithady/ads/tiktok/organic/page.tsx` — **rewritten**: was the broken publish-out form; now the embed-in gallery. Gated on `requireBeithadyPermission('ads','full')`. Shows AddReelForm + filterable grid of ReelCards; loads `tiktok.com/embed.js` once via `next/script` (lazyOnload).
- `src/app/beithady/ads/tiktok/organic/actions.ts` — `addReelAction`/`updateReelAction`/`toggleReelVisibilityAction`/`deleteReelAction`. All gated on `'ads','full'`, all write to `beithady_audit_log` via `recordAudit`, all `revalidatePath` and redirect back with `?error=`/`?added=`/`?updated=`/`?deleted=`.
- `_components/tiktok-embed.tsx` — official `<blockquote class="tiktok-embed">` markup (server-renderable).
- `_components/add-reel-form.tsx` — client form with URL/caption/building/sort_order, optimistic disable while pending.
- `_components/reel-card.tsx` — client card with embed + collapsible inline edit, Hide/Show toggle, Delete (with `confirm()`), Open-on-TikTok link.

**Retained but now unused:** `publishTikTokReelAction`, `pollTikTokPostAction`, `src/lib/beithady/ads/tiktok-organic-publish.ts`, `ads_tiktok_posts` table — kept in case a future TikTok dev-app re-application (different angle) succeeds. AdsTabs `tt-organic` tab already pointed at this URL, so no nav changes needed.

**Verification:**
- `npx tsc --noEmit` → 0 errors
- `npx vitest run src/lib/beithady/tiktok-url.test.ts` → 15/15 pass
- `npm run build` → blocked locally by Windows + Turbopack `.tmp` rename quirk (`ENOENT: no such file or directory, open '.next/static/…/_buildManifest.js.tmp.*'`); Vercel/Linux build expected clean.

**Files committed in this session:**
- `supabase/migrations/0135_bh_marketing_reels.sql`
- `src/lib/beithady/{tiktok-url.ts, tiktok-url.test.ts, marketing-reels.ts}`
- `src/app/beithady/ads/tiktok/organic/{page.tsx, actions.ts, _components/{tiktok-embed.tsx, add-reel-form.tsx, reel-card.tsx}}`

Pre-existing dirty files (financials reconciliation page + hooks + components, YouTube V1.2 spec) deliberately left out — owned by other sessions.

**Next:** Watch Vercel deploy on `limeinc.vercel.app`. Verify embed.js loads + at least one real Beit Hady TikTok URL renders in the gallery.

---

## 2026-05-15 — BH Financials P2 Phase 3 (Tasks 4-5): Ledgers → BHDashboardShell

**Status:** DONE. Commit `307484a`. NOT pushed (controller pushes at plan end).

**What landed:**
- Created `use-ledgers-url-state.ts` hook (TDD: test-first fail confirmed, 6/6 passing after)
- Created `use-ledgers-url-state.test.ts` (6 assertions: defaults omit scope+kind, kind round-trip, scope+kind combo, A1 compat, missing kind→supplier, invalid kind→supplier)
- Created `ledgers/_components/LedgersShell.tsx` — `'use client'` shell, rail state threaded to both `BHDashboardShell` AND `BHLeftRail`, 3 rail sections (Scope + Kind + As of), 3 scope pills + 7 kind pills + date input, Calendar + Users chips
- Rewrote `ledgers/page.tsx` as thin server component using `parseFinLedgersState`
- Added `export type LedgerReport` to `src/lib/beithady/financials/ledgers.ts` (was inline return type only)
- Verification: tsc clean (0 errors), 642/642 tests pass (+6 new = 21 total in hooks folder), build succeeded (ledgers route appears as `ƒ /beithady/financials/ledgers`)

**LedgerReport export added:** YES

**Next:** Phase 4 Tasks 6-7 (Reconciliation hook + shell) or controller-directed push

---

## 2026-05-15 — BH Financials P2 Phase 2 (Tasks 2-3): Payables → BHDashboardShell

**Status:** DONE. Commit `c3ee8bf`. NOT pushed (controller pushes at plan end).

**What landed:**
- Created `use-payables-url-state.ts` hook (TDD: test-first, 4/4 passing)
- Created `use-payables-url-state.test.ts` (4 assertions: asof always written, scope omission, A1 compat, asof override)
- Created `payables/_components/PayablesShell.tsx` — `'use client'` shell, rail state threaded to both `BHDashboardShell` and `BHLeftRail`, 2 rail sections (Scope + As of), Calendar chip, Back to Financials action
- Rewrote `payables/page.tsx` as thin server component using `parseFinPayablesState`
- Verification: tsc clean, 636/636 tests pass (+4 new in hooks folder = 15 total), build compiled successfully in 42s

**Next:** Phase 2 Tasks 4–6 (Ledgers + Reconciliation) or controller-directed push

---

## 2026-05-15 — YouTube V1.2 (Picker / cross-post) brainstorm started

**Status:** Brainstorming, no code yet. Context loaded.

**Locked Q1:** Scope = **D — all three platforms**. Operator picks a published YouTube video and can:
- Organic cross-post to IG Reel + TikTok (download YT bytes → re-upload via existing publish pipelines)
- Add as video asset to Google Ads (PMax / Demand Gen — pass `youtube_video_id` directly, no download needed)
- Create Meta paid video ad (boost or new video ad campaign)

**Integration surface (5 existing publish pages):**
- `/beithady/ads/instagram/reels` — organic IG (+ cross-post to TikTok flag)
- `/beithady/ads/tiktok/organic` — organic TikTok
- `/beithady/ads/instagram/boost` — paid Meta boost
- `/beithady/ads/tiktok/paid` — paid TikTok
- `/beithady/ads/google/pmax` — paid Google PMax (YT video as asset)

**All 4 clarifying questions answered:**
- ✅ Q1 — Scope: **D (all three platforms)** — organic IG/TikTok + Google PMax + Meta paid video ad (folded TikTok paid in via the 5-publish-page surface).
- ✅ Q2 — Picker location: **C (both standalone + embedded)** — standalone at `/beithady/gallery/youtube/picker`, embedded "Source: YouTube" tab on each of the 5 publish pages.
- ✅ Q3 — Picker source: **B (hybrid)** — `ads_youtube_videos` rows merged with channel videos via `playlistItems.list` on stored `youtube_uploads_playlist_id`. Action availability auto-degrades for YT-only rows (no Supabase bytes → only Google PMax works).
- ✅ Q4 — Format gating: **A (auto-hide incompatible)** — vertical Shorts get all 5 actions; horizontal long-form hides IG Reel + organic TikTok (keeps PMax + Meta paid + TikTok paid).

**Approach picked: Approach 1 (per-platform deep-link, lightweight).** 5 publish pages each gain a ~30-line YT-source branch + embedded picker tab. One NEW lib `meta-video-ad-publish.ts` (Meta has no existing path for fresh video ad from arbitrary bytes; existing boost-publish.ts only boosts existing organic IG posts).

**Design § 1 of 6 — Architecture overview — presented and awaiting kareem's approval.** Covers:
- New files (8): picker lib, picker grid/row/embedded components, picker page, meta-video-ad pipeline, migration `0135_ads_youtube_cross_posts.sql`, optional channel-sync cron.
- Modified files (5 publish pages ~30 LOC each + google-pmax-publish.ts extension).
- New schema: `ads_youtube_cross_posts` audit table linking `yt_video_id → target_platform → target_post_id` with unique constraint for "already posted to X" UX hints.

**Remaining sections to present:** § 2 picker module, § 3 cross-post flows per platform (5), § 4 UI structure, § 5 error handling, § 6 testing.

**No code yet. Estimated total V1.2 scope: ~25 tasks (similar to V1.1).**
- Google Ads target: new PMax campaign creation vs add-asset to existing campaign
- Whether picker should also include channel videos not yet in `ads_youtube_videos` (i.e. videos uploaded directly to YouTube outside our app)

**Files explored:** `ig-to-tiktok.ts`, `instagram-publish.ts`, `tiktok-organic-publish.ts`, `google-publish.ts`, `google-pmax-publish.ts`, `boost-publish.ts`, full list of publish pages.

**Approach so far:** Picker will read from `ads_youtube_videos` WHERE status='published'. Per-action paths will branch on platform. For Google Ads, the `youtube_video_id` we already store from V1.1 is the direct input — no extra work. For IG/TikTok, we'll need to fetch bytes from the YT watch URL OR retain the original Supabase signed URL we stored.

---

## 2026-05-15 — YouTube V1.1 — template polish + MCC linkage guidance (commit `0348528`)

**Status:** Template enhancements shipped + pushed. MCC ↔ channel linkage is operator-action on Google's side.

**Template patch — `0348528` "always include Beithady in title + WhatsApp URL in description":**
- All 8 title_templates now prefixed `Beithady · ...`. Internal-staff-intro changed `Beit Hady team` → `Beithady team`.
- Both `SHORTS_DESC` + `LONGFORM_DESC` helpers + internal-staff-intro description now render `📞 Reserve on WhatsApp → {whatsapp_url}` followed by `🌐 Book direct → {booking_url}`.
- New `WHATSAPP_URL` constant in `ai-metadata.ts` = `https://wa.me/201501010103?text=Hi%20I%27d%20like%20to%20book%20at%20Beithady`. WhatsApp +20-150-10-10-10-3 prefilled with booking message.
- Renamed `substituteBookingUrl` → `substitutePlaceholders` (now does both URLs in one pass). Old name kept as alias.
- AI prompt updated: Claude must keep "Beithady" verbatim in titles and preserve BOTH placeholders verbatim in descriptions.
- `bh26-longform-tour` feature.max_length lowered 60 → 50 to keep total under YouTube 100-char cap after new prefix.
- Tests: 22/22 pass. New assertions: every title contains "Beithady", every description contains `{whatsapp_url}`, `substitutePlaceholders` replaces both in one pass.

**Operator-action — switch @beithady channel's linked Google Ads account from personal FZCO (424-355-4501) to Beithady MCC (395-304-4686):**
- Guided kareem through YouTube Studio → Settings → Channel → Advanced → Google Ads account linking.
- Current state observed (screenshot): 3 linked accounts — Promotions 109-284-9441, Beithady Ads A... 424-355-4501, Google Ads link... 568-826-0497. None is the MCC.
- Next steps for kareem: Unlink 424-355-4501 → Link account → paste 395-304-4686 → switch to MCC in Google Ads → approve pending request. Optional hygiene: unlink Promotions 109-284-9441 and 568-826-0497 if unrecognized.
- This is unrelated to V1.1 (OAuth upload-only); it's setup for V1.2's cross-post / video ads pipeline.
- **DONE — kareem confirmed MCC ↔ channel link is now Linked** with permissions: View counts / Remarketing / Engagement (since 2026-05-15, 1 channel / 23 subscribers / 23 videos).

**Follow-up Q from kareem: "Can I do ads through this MCC account?"**
- Answer: No — MCC accounts can't run ads directly. Manager-only. Campaigns live in child accounts.
- Recommended path: bring existing FZCO Ads (424-355-4501) under Beithady MCC as a sub-account. MCC = billing + reporting + YouTube link umbrella; FZCO = actual campaigns. Channel and remarketing audiences propagate down automatically once linked.
- Steps given: MCC → Admin → Account access → Sub-account settings → Link existing account → enter FZCO ID → approve from FZCO side. Alternative: create new sub-account under MCC if fresh start preferred.
- For V1.2 cross-post pipeline, the actual API integration point will be the child account, not the MCC.
- **DONE — FZCO is now a sub-account under Beithady MCC** (confirmed by Sub-account settings screenshot: Direct manager = "Beithady MCC (This manager) 395-304-4686", Active status). 4,533 impressions running today in FZCO.

**Ads setup complete — final state:**
- ✅ YouTube channel @beithady linked to BOTH FZCO (424-355-4501) and MCC (395-304-4686), permissions: View counts / Remarketing / Engagement.
- ✅ FZCO is a child account under MCC (hierarchy: MCC → FZCO).
- ✅ Stale channel links cleaned up (Promotions 109-284-9441 and Google Ads link 568-826-0497 unlinked earlier).
- Campaigns continue running in FZCO; MCC has umbrella billing/reporting + channel audience access.
- Ready for V1.2 cross-post pipeline when we ship it.

**No new code beyond `0348528`. Test suite remains green.**

---

## 2026-05-15 — BH audit P2 financials brainstorm in progress (full block: 7 page.tsx files)

**Status:** Brainstorming, no code yet. Picks up after P1 final-review cleanups (`2e57ffc`).

**Scope (user-confirmed):** Full P2 financials block — migrate all 5 remaining financials pages (7 page.tsx files counting [id] details). One PR. After this lands, `FinancialsFilterStrip.tsx` becomes unreferenced and gets deleted in the same PR.

**Per-page architecture (presented to user, awaiting nod):**

**`<BHDashboardShell>` + LeftRail (3 pages, each gets a new typed URL hook + Shell wrapper):**
- **Payables** — rail = Scope (3 pills) + As of (date). New `usePayablesUrlState` → `{ scope, asof }`. Same shape as BalanceSheetShell — near copy-paste.
- **Ledgers** — rail = Scope + Kind (7 pills: Suppliers/Owners/Customers/Landlords/Employees/Noteholders/All) + As of. New `useLedgersUrlState` → `{ scope, kind, asof }`.
- **Reconciliation** — rail = Snapshot picker (dropdown). New `useReconciliationUrlState` → `{ snapshot_id }`.

**`<BeithadyShell>` only (4 pages — no rail needed):**
- **Snapshots** (list grouped by period — no filter, hardcoded `scope: 'consolidated'`)
- **Snapshots [id]** (detail)
- **Import** (xlsx upload form/wizard)
- **Import [upload_id]** (commit-review detail)

**Cleanup in same PR:** delete `FinancialsFilterStrip.tsx` (Payables was the only remaining consumer). Closes 10/12 of the audit's wrong-shell offenders; only `/setup` and `/pricing` remain (P3 in the audit, low traffic).

**Constraints carried over from P1:** A1 stays in type guards for URL backward-compat; module-scope parse/serialize/basePath per `useBHUrlState<T>` stability contract; body components (`PayablesBlock`, `PartnerLedgerTable`, etc.) untouched.

**Effort estimate:** L (~1,500 LOC net). Bulk is mechanical replays of the P1 pattern; 3 new URL hooks × ~5 assertions each ≈ +15 tests. Predicted final test count ~643.

**Next step on kareem's nod:** write spec to `docs/superpowers/specs/2026-05-15-bh-financials-p2-cleanup-design.md`, then plan, then subagent-driven execution.

---

## 2026-05-15 — BH audit P1 SHIPPED: Financials landing + Performance + Balance Sheet migrated

**Status:** All 11 plan tasks complete. 5 commits pushed to main (`75e8f95` → `ca513bf`). Vercel auto-deploy in flight.

**What landed:**
- **Phase 1 — Landing** (`75e8f95`): `financials/page.tsx` migrated to `<BeithadyShell + BeithadyHeader + BeithadyLauncher>` matching analytics/operations/communication landings. New `StatusPreStrip.tsx` renders the 3 status cards with BH-themed chrome (Active snapshot in BH cream + gold; Open variance + Next snapshot due keep semantic red/amber as inherited hex literals tracked under audit §7.2 follow-up). Deleted bespoke `CockpitTile.tsx`. 7 launcher tiles preserved.
- **Phase 2 — Performance** (`e0c3992` + `6faee70` type-narrowing cleanup): New typed URL hook `usePerfPnlUrlState` (7 vitest assertions covering preset/month/scope/building/lob/A1-backward-compat). New `PerformanceShell.tsx` client wrapper composing `<BHDashboardShell>` with three rail sections: Scope (3 pills) + Period (6 preset pills + `<input type="month">` styled with BH vars) + Building (6 pills). Page.tsx becomes a thin server component (parse search params → fetch → render shell). **Real month picker shipped** — user's loudest complaint from the original audit now resolved.
- **Phase 3 — Balance Sheet** (`fee3920`): Same pattern. New typed URL hook `useBSUrlState` (4 vitest assertions). New `BalanceSheetShell.tsx` with rail sections: Scope + As-of date input + Building. `asof` is always written to URL so bookmarks reproduce day-of.
- **Phase 4 — Cleanup** (`ca513bf`): Deleted obsolete `PeriodControls.tsx` (rail composition replaces it).

**Verification:** 628 passing / 22 skipped (baseline 617 + 7 Perf hook + 4 BS hook = 628). Zero regressions. `tsc --noEmit` clean. `npm run build` succeeds.

**Out of scope (untouched):** `FinancialsFilterStrip.tsx` stays alive (Payables still uses it — migration is P2 #6 in the audit). `PnlSection`, `BalanceSheetSection`, `PayablesBlock`, body components, data layer in `financials-pnl.ts` (including `CompanyScope` type with `'a1'` per P0-1 UI-hide-only strategy) all preserved.

**Pattern reuse confirmed.** P0-2's composition-over-configuration architecture proves out a third time. Same `<BHDashboardShell>` shell now serves Analytics Performance + Fees Audit + Financials Performance + Financials Balance Sheet (4 consumers). Each page provides its own filter rail; URL state is opt-in via `useBHUrlState<T>`.

**Audit progress:** P0-1 ✅ (A1 removal) + P0-2 ✅ (BHDashboardShell extraction + 2 consumers) + P1 ✅ (3 financials pages). Remaining backlog: **P2** — Payables/Ledgers/Snapshots/Reconciliation/Import migrations + non-financials data dashboards (calendar-heatmap, market-intel, inventory/dashboard, ads/performance, ops surfaces, hr dashboards, communication inbox).

---

## 2026-05-15 — BH audit P1 Tasks 7-9 DONE: Balance Sheet migrated to BHDashboardShell

**Commit:** `fee3920` — `feat(bh-financials): migrate Balance Sheet to BHDashboardShell`

**What shipped:**
- Created `src/app/beithady/financials/_hooks/use-bs-url-state.ts` — typed URL hook with `useBSUrlState`, `parseFinBSState`, `serializeFinBSState`, `buildFinBSUrl`. State: `{ scope: FinBSScope, asof: 'YYYY-MM-DD', building: FinBSBuilding }`. Defaults: scope='consolidated', asof=today, building='all'. `asof` is ALWAYS written to URL (reproducible across days). A1 preserved in type for backward-compat, omitted from UI.
- Created `src/app/beithady/financials/_hooks/use-bs-url-state.test.ts` — 4 assertions (TDD: red→green). Tests: asof always written, scope omission/inclusion, building inclusion, A1 backward-compat. All 4 pass.
- Created `src/app/beithady/financials/balance-sheet/_components/BalanceSheetShell.tsx` — `'use client'` wrapper composing `<BHDashboardShell>`. Rail state threaded to BOTH `<BHDashboardShell>` (railCollapsed/onRailEnter/onRailLeave) AND `<BHLeftRail>` (collapsed/pinned/onTogglePin/collapsedIcons). Three rail sections: Scope (3 pills), As of (`<input type="date">`), Building (6 pills). Back-to-Financials link in title bar actions.
- Replaced `src/app/beithady/financials/balance-sheet/page.tsx` — thin server component. Parses searchParams (Promise per Next.js 16) via `parseFinBSState()`. Calls `buildBalanceSheet({ asOf, companyIds })` unchanged. Renders `<BalanceSheetShell>`.

**Verification:** tsc clean, 4/4 hook tests, 628/22 full suite (+4 new, no regressions), build succeeded.

**NOT pushed** — controller pushes at end of full P1 (after Task 10 PeriodControls cleanup).

**Next:** Task 10 — delete `PeriodControls.tsx` + Task 11 final push.

---

## 2026-05-15 — BH audit P1 Tasks 4-6 DONE: Performance migrated to BHDashboardShell + month picker

**Commit:** `e0c3992` — `feat(bh-financials): migrate Performance to BHDashboardShell + add month picker`

**What shipped:**
- Created `src/app/beithady/financials/_hooks/use-perf-pnl-url-state.ts` — typed URL hook with `usePerfPnlUrlState`, `parseFinPerfState`, `serializeFinPerfState`, `buildFinPerfUrl`. Discriminated union `FinPerfPeriod = { kind:'preset'; id } | { kind:'month'; ym }`. Defaults: scope='consolidated', period=last_month, building='all'. A1 preserved in type for URL backward-compat, omitted from UI.
- Created `src/app/beithady/financials/_hooks/use-perf-pnl-url-state.test.ts` — 7 assertions (TDD: red first, then green). Tests: defaults, preset serialization, month serialization, scope+building+lob combo, A1 backward-compat, parse defaults, parse-prefer-month-over-preset. All 7 pass.
- Created `src/app/beithady/financials/performance/_components/PerformanceShell.tsx` — `'use client'` wrapper composing `<BHDashboardShell>`. Rail state threaded to BOTH `<BHDashboardShell>` (railCollapsed/onRailEnter/onRailLeave) AND `<BHLeftRail>` (collapsed/pinned/onTogglePin/collapsedIcons) — P0-2 regression prevention. Three rail sections: Scope (3 pills), Period (6 preset pills + month input), Building (6 pills). One type-narrowing fix needed for `state.period.id` access (cast to preset variant).
- Replaced `src/app/beithady/financials/performance/page.tsx` — thin server component. Parses searchParams via `parseFinPerfState()`. Legacy `?from=&to=` still works via `resolveFinancePeriod`. Renders `<PerformanceShell>`.

**Verification:** tsc clean, 7/7 hook tests, 624/22 full suite (no regressions), build succeeded.

**Did NOT need to add type exports:** `PnlReport` and `BalanceSheetReport` were already exported from `src/lib/financials-pnl.ts`.

**NOT pushed** — controller pushes at end of full P1 (after Tasks 7-10 in Phase 3).

**Next:** Phase 3 (Tasks 7-9) — `useBSUrlState` hook + `BalanceSheetShell.tsx` + balance-sheet/page.tsx rewrite.

---

## 2026-05-15 — BH audit P1 Tasks 1-3 DONE: Financials landing migrated to BeithadyShell + BeithadyLauncher

**Commit:** `75e8f95` — `feat(bh-financials): migrate landing to BeithadyShell + BeithadyLauncher; re-theme status cards`

**What shipped:**
- Created `src/app/beithady/financials/_components/StatusPreStrip.tsx` — 3-card status row (Active snapshot / Open variance / Next snapshot due) using BH brand vars (`--bh-cream`, `--bh-mute`, `--bh-ink`, `--bh-gold`, `--bh-steel`) on chrome; semantic red/amber hex literals preserved on variance+due cards per §7.2 follow-up.
- Replaced `src/app/beithady/financials/page.tsx` — raw `<TopNav>` + bespoke `<CockpitTile>` grid swapped for `<BeithadyShell + BeithadyHeader + BeithadyLauncher>` canonical pattern. `loadCockpitData()` preserved byte-for-byte. 7 `LauncherTile[]` entries with matching hrefs/titles/icons/badges.
- Deleted `src/app/beithady/financials/_components/CockpitTile.tsx` — confirmed zero remaining references before removal.

**Verification:** tsc clean, 617/22 passing (no regressions), build succeeded.

**NOT pushed** — controller pushes at end of Phase 4.

**Next:** Phase 2 (Tasks 4-6) — `usePerfPnlUrlState` hook + `PerformanceShell.tsx` + performance/page.tsx rewrite.

---

## 2026-05-15 — BH audit P1 brainstorm in progress: Financials Performance + Balance Sheet + landing migration

**Status:** Brainstorming, no code yet. Picks up the P1 block of the BH design audit after P0-2 shipped (`096aba6`).

**Scope (confirmed):** Full P1 — migrate all THREE pages in one PR.
1. **`/beithady/financials`** (landing) — swap raw TopNav for `<BeithadyShell + BeithadyHeader + BeithadyLauncher>` (matches analytics/operations/communication landings). Keep the 3-card status pre-strip (Active snapshot / Open variance / Next snapshot due) but re-theme with `--bh-*` brand vars (current `bg-indigo-50/40` etc. violate the brand-only rule).
2. **`/beithady/financials/performance`** — adopt `<BHDashboardShell>` from P0-2. Rail sections: **Scope** (Consolidated/Egypt/Dubai) + **Period** (preset pills + month picker side-by-side) + **Building** (All/BH-26/BH-73/BH-435/BH-OK/Other). LOB stays URL-only (YAGNI). Typed URL state via `useBHUrlState<FinPerfUrlState>`. `period: { kind: 'preset'; id } | { kind: 'month'; ym }` discriminated union.
3. **`/beithady/financials/balance-sheet`** — same shell. Rail sections: Scope + As-of date input + Building. Typed via `useBHUrlState<FinBSUrlState>`.

**Out of scope:** Payables, Ledgers, Snapshots, Reconciliation, Import — they stay on `FinancialsFilterStrip` for now. Payables migration is P2 #6 in the audit backlog. We KEEP `FinancialsFilterStrip` alive (still used by Payables).

**User decisions captured:**
- Q1 scope: option 3 (full P1 sweep, all three pages in one PR).
- Q2 month picker UX: option 1 (preset pills + month picker side-by-side — operators get fast common-case + arbitrary-month flexibility).
- Q3 rail sections: option 2 (Scope + Period + Building — LOB stays URL-only as YAGNI).

**Design progress (presented inline to user, awaiting nod between sections):**
- ✅ § 1 — per-page architecture (presented, user said "1continue" = approved + advance).
- ⏳ § 2 — URL state shapes (`FinPerfUrlState` discriminated period + `FinBSUrlState` as-of + stability contract reminder + adapter to existing `buildPnlReport` / `buildBalanceSheet` signatures). Presented, awaiting nod.
- ⏳ § 3 — month picker styling (BH-themed `<input type="month">`).
- ⏳ § 4 — cleanup (status card re-theme; FinancialsFilterStrip stays alive — only delete when Payables migrates in P2).
- ⏳ § 5 — testing strategy.

**Spec to write:** `docs/superpowers/specs/2026-05-15-bh-financials-p1-migration-design.md` (paper deliverable). Then writing-plans for the multi-task implementation plan.

**Architectural reuse:** all three pages compose from the just-shipped `src/app/beithady/_components/dashboard-shell/` package (P0-2). Performance + Balance Sheet use `BHDashboardShell + BHTitleBar + BHLeftRail + BHRailPill + BHMobileFilterSheet`. Landing uses `BeithadyShell + BeithadyHeader + BeithadyLauncher` (pre-existing primitives that were never in the financials cockpit).

**No commits this session beyond the prior P0-2 work** (`0782d29` was the last handoff commit). This entry is the only artifact so far.

---

## 2026-05-15 — YouTube V1.1 — OAuth smoke (Task 27) BLOCKED on Google Cloud config

**Status:** Code is live (commits up through `7ad28cd`). Kareem hit "Access blocked: Authorization Error / Error 400 invalid_request" on first Connect attempt at `/beithady/ads/accounts`. App name in dialog shows **"InboxOps"** (original Phase-1 brand on the reused OAuth client). User was signed in as kareem.hady@gmail.com, so it's not a test-user/sign-in issue — it's a request-validation rejection.

**Diagnosis sent to kareem (most likely → least likely):**
1. **OAuth consent screen missing the new YouTube scopes** — the reused OAuth client was originally declared for Gmail + Google Ads scopes only. Adding `youtube.upload` + `youtube.readonly` requires editing the consent screen → Scopes → Add or Remove → check both → Update. Without this, Google rejects the auth request with invalid_request.
2. **YouTube Data API v3 not enabled** on the project (precondition for declaring the scopes).
3. **Redirect URI not yet added** — `https://app.limeinc.cc/api/auth/google-youtube/callback` must be in the OAuth client's Authorized Redirect URIs list, exact match.

**Asked kareem to:** click the **error details** link on the dialog to see the exact rule that failed (typically `invalid_scope`, `redirect_uri_mismatch`, or `app not configured for scope`), and report back the text so I can confirm which of (1)/(2)/(3) it is.

**No code changes this turn.** Plan-side issue, fixable in Google Cloud Console.

**Progress on the unblock (multi-turn):**
- ✅ YouTube Data API v3 enabled on the `kareemhady-inboxops` project (status: Enabled, service `youtube.googleapis.com`).
- ✅ Scopes added via the new **Google Auth Platform → Data Access** page (replaces the old OAuth consent screen wizard — Google moved the UI; "Edit App" no longer exists, scopes now live as a standalone sidebar item). Kareem added `youtube.upload`, `youtube.readonly` (the two our code requests) plus several extras (`youtube`, `youtube.force-ssl`, `youtubepartner`, `youtubepartner-channel-audit`, `youtube.channel-memberships.creator`, `youtube.third-party-link.creator`) — extras are harmless since our OAuth start route only requests `youtube.upload` + `youtube.readonly`.
- ⏳ Still to verify: redirect URI `https://app.limeinc.cc/api/auth/google-youtube/callback` is in the OAuth client's Authorized redirect URIs (left sidebar → **Clients** → InboxOps OAuth client). Asked kareem to confirm/add this.
- ⏳ Then retry Connect from `/beithady/ads/accounts`.

**UI mapping note for future-Claude:** Google migrated `OAuth consent screen` UI to a new "Google Auth Platform" surface. Mapping:
- Old "App information" step → **Branding** sidebar item
- Old "Scopes" step → **Data Access** sidebar item
- Old "Test users" step → **Audience** sidebar item
- Old `Credentials → OAuth 2.0 Client IDs` → **Clients** sidebar item (still also accessible under APIs & Services → Credentials)
- No more "Edit App" wizard — each settings group is its own page now.

**Detour (recoverable):** Kareem clicked "Create client" instead of editing the existing one and created a duplicate OAuth client. He saw the secret-once dialog, closed it without copying, then deleted that new client. Existing InboxOps web client (Client ID `593051355315-b4g0...`, Apr 19 2026) is the only client now and is the one our app's `GOOGLE_CLIENT_ID` env var points to — good.

**Side effect of the detour:** the redirect URI was added to the new (now-deleted) client, NOT to the existing InboxOps web client. So Google's `invalid_request` returned on retry with details: `redirect_uri=https://app.limeinc.cc/api/auth/google-youtube/callback` — Google is rejecting it as unauthorized because the URI is missing from the existing client's Authorized redirect URIs list.

**Round 1 unblock asked:** open Clients → InboxOps web → add `https://app.limeinc.cc/api/auth/google-youtube/callback` to Authorized redirect URIs → save → retry Connect.

**Done by kareem:** redirect URI added to InboxOps web client. URIs 1-3 now: localhost gmail, limeinc.vercel.app gmail, app.limeinc.cc google-youtube. "OAuth client saved" toast confirmed.

**Verified:** Audience → Test users already contains `kareem.hady@gmail.com` + `kareem@fmplusme.com` + `kareem@limeinc.cc` (3/100 cap, Testing mode). YouTube account picker confirms `kareem.hady@gmail.com` owns @Beithady brand channel (23 subs) + personal "Kareem Hady" + VOLTAUTO EV CARS — same Google account, multiple brand channels.

**Still blocked:** retry (even in incognito) → same "Access blocked / Error 400 invalid_request". Decoded the `authError=` protobuf in the URL → Google's error links to https://developers.google.com/identity/protocols/oauth2/policies#secure-response-handling and identifies the failing field as `redirect_uri`. Per that policy, the **registrable domain `limeinc.cc`** must be in the OAuth consent screen's **Authorized domains** list, separate from the client's per-redirect-URI list. Google auto-adds it for new clients but NOT reliably for edits to existing clients — that's the suspected hole.

**Round 2 unblock asked:** open https://console.cloud.google.com/auth/branding?project=kareemhady-inboxops → scroll to "Authorized domains" → add `limeinc.cc` (registrable domain only, NOT `app.limeinc.cc`) → save → retry Connect.

**Done by kareem (round 2):** added `limeinc.cc` as Authorized domain 3 (now: kareemhady.vercel.app, limeinc.vercel.app, limeinc.cc). Also filled in App home page (`https://app.limeinc.cc`), privacy (`https://app.limeinc.cc/legal/privacy`), terms (`https://app.limeinc.cc/legal/terms`) — those legal pages exist from last week's TikTok audit work. Saved.

**Still blocked round 2:** read Google's redirect URI validation rules (HTTPS only, no raw IP, public-suffix TLD, no userinfo, no path traversal, no fragment, no wildcards) — our URI passes ALL of them cleanly. Conclusion: the failure isn't about URI shape; it's almost certainly that **`youtube.upload` is classified as a Restricted scope** and Google quietly requires app verification even for test users (despite their docs saying otherwise).

**Round 3 diagnosis:** gave kareem two pre-built incognito OAuth URLs to isolate the issue:
- Test 1 — `scope=youtube.readonly` only (sensitive, NOT restricted)
- Test 2 — both scopes (the restricted `youtube.upload` + `youtube.readonly`)

Expected: Test 1 succeeds, Test 2 fails → confirms restricted-scope verification is the blocker.

**Test 2 result: SUCCESS** (unexpected/lucky). Kareem's incognito paste of Test 2 (with `youtube.upload`) went all the way through — brand-account picker showed Beithady Hospitality + Kareem Hady + VOLTAUTO, "Google hasn't verified" warning → Continue, consent screen with both scopes pre-checked → Continue, callback hit our `/api/auth/google-youtube/callback` and returned `{"error":"invalid_state"}` (correct — manually-crafted `state=test` doesn't match a CSRF cookie). So the OAuth flow works end-to-end. Restricted scope is NOT the blocker.

**Real culprit identified:** the ONLY difference between the working test URL and our app's URL was **`include_granted_scopes=true`** in our start route. Google rejects the combo of `include_granted_scopes=true` + restricted YouTube scopes when the same OAuth client has previously granted unrelated scopes (Gmail/Google-Ads) to the user. The bundling trips the "secure-response-handling" policy and surfaces as Access blocked / invalid_request.

**Fixed by commit `dbd5713`:** dropped the `include_granted_scopes` parameter from `src/app/api/auth/google-youtube/start/route.ts`. The flag was non-essential — V1.1 doesn't do incremental authorization, there are no previously granted YouTube scopes to merge. Pushed to main → Vercel auto-deploying.

**Round 3 fix didn't unblock either.** Retry from app still hit Access blocked even after `dbd5713` + alias update.

**ACTUAL root cause finally found via Chrome DevTools Network tab:** the live `auth?client_id=...` request from our app had:
```
redirect_uri=https%3A%2F%2Fapp.limeinc.cc%0A%2Fapi%2Fauth%2Fgoogle-youtube%2Fcallback
```
`%0A` is URL-encoded **newline**. The Vercel env var `NEXT_PUBLIC_APP_URL` has a trailing `\n` (paste-from-clipboard hazard). Code did `${NEXT_PUBLIC_APP_URL}/api/auth/google-youtube/callback` → host\n/path → malformed URI → Google rejected as "doesn't comply with OAuth 2.0 policy".

Also explains why manual paste-in-incognito Test 2 succeeded — kareem typed the URL by hand, no newline. The `secure-response-handling` policy link in the protobuf was a red herring; the actual rule violated was just **valid URI format**. The `include_granted_scopes` removal from `dbd5713` didn't matter for this bug but kept removed regardless (no business being there).

**Round 4 fix shipped at `ab623f7`:** both `start/route.ts` and `callback/route.ts` now `.trim()` `NEXT_PUBLIC_APP_URL` before concatenating. Defensive code so trailing whitespace in env var can't break the flow. Pushed → Vercel built deploy `lime-fz7jyysew` → `vercel alias set` ran (per `vercel_lime_alias_quirk` memory).

**Follow-up worth doing later (NOT V1.1 blocker):**
- Fix the env var itself in Vercel (rm + add without trailing newline) so OTHER consumers of `NEXT_PUBLIC_APP_URL` don't trip on it. `grep -r NEXT_PUBLIC_APP_URL src/` to find all callsites.
- Consider trimming all env vars at app boot or moving to a typed env loader.

**TASK 27 ✅ — OAuth round-trip works.** Kareem retried after the `.trim()` fix landed and Vercel alias was repointed. Accounts page now shows YouTube row: identity `@beithady`, currency EGP, status ACTIVE, Live ✓. Tokens encrypted in `ads_accounts` row, channel handle + uploads playlist ID captured on callback.

**TASK 28 ≈ ✅ — first publish succeeded end-to-end** (technically went async path, not pure sync — see note below, but functionally identical result):
- Kareem clicked Publish on a 41.5 MB BH-73 Shorts video.
- Server action validated input, `decideUploadPath` returned `async` (because Gallery row's `duration_sec` was NULL — see follow-up below).
- Row #1 inserted into `ads_youtube_videos` with status='queued', AI-generated metadata (`ai_generated=true`, `ai_cost_usd=$0.003157`, title "Beithady BH-73 Cairo · Modern Bedroom Tour", template `bh73-shorts-tour`).
- Banner shown: "⏳ Queued upload #1 — async path (long-form). Cron will upload in chunks."
- `youtube-uploader` cron picked up within 20s: `queued → uploading → processing`.
- All 41.5 MB chunks uploaded in <30s of cron pickup. Total submit-to-bytes-on-YT: ~30 seconds.
- YouTube video ID: `9fmAI8RJRr8`. Watch URL: https://youtu.be/9fmAI8RJRr8. 0 retries. 0 errors.
- Status `processing` (YouTube transcoding); cron will flip to `published` once YouTube returns `uploadStatus='processed'`.

**Pipeline proven end-to-end:** OAuth → AI metadata (Claude haiku-4-5 vision, $0.003) → server action → DB insert → cron init resumable session → chunk loop via Supabase Range fetch → YouTube videos.insert → processing poll. Every piece worked first try once OAuth was unblocked.

**Follow-ups (NOT V1.1 blockers, queued for V1.2 polish):**
- `duration_sec` not populated in Gallery for that asset → `decideUploadPath` falls through to async. Either populate `duration_sec` in Gallery on upload, or have `decideUploadPath` use `is_shorts` as a proxy when duration is unknown.
- Fix the Vercel env var `NEXT_PUBLIC_APP_URL` itself (rm + add without trailing newline) so OTHER consumers don't trip on it. `.trim()` defends the YT routes; other call sites might not.
- Move the manual `vercel alias set` step into a deploy hook so it's automatic per `vercel_lime_alias_quirk` memory.

**Remaining tasks:**
- Task 29 — async upload smoke (3-5 min long-form video) → really just a longer version of what just happened; should pass.
- Task 30 — verify stats sync 6h cron populates `view_count`/`like_count`/`comment_count` on the published row(s) once 6 hours have passed and YouTube has accumulated some impressions.

V1.1 is functionally shipped. Just waiting for time to elapse on Task 30.

---

## 2026-05-15 — YouTube V1.1 (Upload-out) — ALL 25 CODE TASKS SHIPPED

**Status:** All 25 code tasks done + pushed. Vercel auto-deploy in flight. 5 remaining tasks (26-30) are **manual operator steps** for kareem (Google Cloud setup + OAuth + 3 smoke tests).

**Verification:** Full test suite **617 passing / 22 skipped** (baseline 585 + 32 new YouTube tests, includes Tasks 3, 4-5, 9, 10, 14). 0 regressions. `tsc --noEmit` clean.

**All commit SHAs (in order pushed to main):**
1. `986ab74` Task 1 — migration 0134 (renumbered from 0123 — slot taken)
2. `5823d36` Task 2 — types.ts (Zod + error classes)
3. `35dbfc4` Task 3 — templates.ts + 8 templates
4. `0564610` Task 4 — youtube-client.ts (token refresh + cache)
5. `1ee1c61` Task 5 — invalid_grant test
6. `8c0fe05` Task 6 — OAuth start route
7. `f5a2b2d` Task 7 — OAuth callback route
8. `c0bbb32` Task 8 — accounts page YouTube row
9. `896a9c3` Task 9 — ai-metadata.ts (Claude vision)
10. `7c74bc6` Task 10 — publish helpers + initResumableSession
11. `a135aea` Task 11 — publishSync (sync path)
12. `43e75bd` Task 12 — sendChunksUntilBudget (chunk loop)
13. `aa09069` Task 13 — pollProcessing
14. `89d91c6` Task 14 — computeNextRetry + tests
15. `db1256c` Task 15 — cron youtube-uploader
16. `7c9f6c6` Task 16 — cron youtube-stats-sync
17. `06dcf7a` Task 17 — vercel.json (2 new schedules)
18. `7c2425f` Task 18 — VideoSourcePicker
19. `71be8ad` Task 19 — AIAssistButton
20. `4c5bf42` Task 20 — server actions (publish + generateMetadata + retry)
21. `11c07a0` Task 21 — PublishForm
22. `4c20077` Task 22 — RecentUploadsTable
23. `f66aec3` Task 23 — publish page
24. `cad3614` Task 24 — Gallery landing tile
25. `e1c0259` Task 25 — asset modal Publish-to-YouTube button

**Deviations from plan (all defensible):**
- Migration `0123` → `0134` (slot already used by HR work)
- FK `users(id)` → `auth.users(id)` (matches Supabase Auth)
- FK `bh_gallery_assets(id)` → `beithady_gallery_assets(id)` (correct table name)
- Lucide `Youtube` icon → `Video` (lucide-react@1.8.0 doesn't ship `Youtube`)
- Server action `generateMetadataAction` widened to accept `building_code: string | null` for PublishForm prop compat
- Added `'youtube'` to `AD_PLATFORMS` + `ORGANIC_PLATFORMS` arrays in `platforms.ts` for Record type satisfaction

**What's NOT done yet (Tasks 26-30 — kareem's manual work):**
- **Task 26:** Google Cloud Console — Enable YouTube Data API v3 + add OAuth redirect URI `https://app.limeinc.cc/api/auth/google-youtube/callback` to the existing OAuth client
- **Task 27:** Open `/beithady/ads/accounts` → click Connect on the YouTube row → grant consent → verify channel info appears
- **Task 28:** Upload a ≤60s vertical clip via `/beithady/gallery/youtube/` (sync path smoke)
- **Task 29:** Upload a ~3min long-form via same page (async path smoke — verify cron picks it up)
- **Task 30:** Wait 6h, verify view/like counts populate (stats-sync cron)

**Spec:** [`docs/superpowers/specs/2026-05-15-youtube-v1.1-upload-out-design.md`](docs/superpowers/specs/2026-05-15-youtube-v1.1-upload-out-design.md)
**Plan:** [`docs/superpowers/plans/2026-05-15-youtube-v1.1-upload-out.md`](docs/superpowers/plans/2026-05-15-youtube-v1.1-upload-out.md)

---

## 2026-05-15 — BH audit P0-2 SHIPPED: BHDashboardShell extracted, Analytics Performance + Fees Audit migrated

**Status:** All 15 plan tasks complete, pushed to main (latest commit `c2c9bb2` + parallel YouTube work brought HEAD to `7c74bc6`). Vercel auto-deploy in flight.

**What landed:**
- **Phase A** (4 commits): new shared package at `src/app/beithady/_components/dashboard-shell/` (8 component/hook files + 7 colocated tests + barrel). Exports `BHDashboardShell`, `BHTitleBar`, `BHLeftRail`, `BHRailPill`, `BHMobileFilterSheet`, `BHCustomizeDrawer`, `useBHUrlState<T>`, `useRailCollapse`. Added 26 new vitest assertions. Code review caught 4 Important issues (railPinned dead prop, useMemo dep bug, raw hex inheritance docs, name rail constants) — all fixed in `6f04597`. Plus a doc-only correction in `57cbb34`.
- **Task 10** (`5a5a8ca`): `usePerfUrlState` rewritten as a 6-line wrapper around `useBHUrlState<PerfUrlState>`. Existing 3-assertion `use-url-state.test.ts` continues to pass unchanged.
- **Task 11** (`ebadbf5` + `20cb197` fix): rewrote `analytics/performance/_components/dashboard-shell.tsx` to compose from the shared primitives. Final-review caught two DOM regressions (pin toggle + collapsed icon strip dropped because `BHDashboardShell` was internally owning `useRailCollapse`; `aria-label` drift on customize drawer). Fixed via consumer-owned rail state + new `ariaLabel` prop on `BHCustomizeDrawer`. Pin toggle restored, collapsed icons (📅 🏢 ⇄) visible again, aria-label preserved.
- **Task 12** (`cf450aa`): deleted 6 obsolete shell files from `analytics/performance/_components/` + `_hooks/` (`title-bar.tsx`, `left-rail.tsx`, `mobile-filter-sheet.tsx`, `customize-drawer.tsx`, `top-bar.tsx`, `use-rail-collapse.ts`). −661 lines.
- **Task 13** (`fcdd7a2`): migrated `FeeAuditDashboard.tsx` outer wrapper to `<BHDashboardShell titleBar={<BHTitleBar/>} rail={<Sidebar/>}>`. Sidebar internals UNCHANGED (preserves auto-collapse 2s + open-on-hover 250ms + 9-group fee-category nav + filters). All 4 modals (CellDrillThroughModal / ChannelCompareModal / VendorExportDialog / TaxStackTester) and the warnings block preserved.
- **Task 14** (`c2c9bb2`): deleted fees-audit's bespoke `TitleBar.tsx` (replaced by `<BHTitleBar>`). −137 lines.

**Verification:** 607 passing / 22 skipped (559 baseline + 26 Phase A + 8 Task 11-fix tests + ~14 from kareem's parallel YouTube work). `tsc --noEmit` clean. `npm run build` succeeds.

**Composition wins.** Spec §3 picked composition over configuration. The architecture proves out: `<BHDashboardShell>` takes JSX slots (titleBar/rail/mobileFilterSheet/drawer/children), URL state is opt-in via `useBHUrlState<T>`. Analytics Performance uses the full happy path (BHLeftRail w/ Period/Building/Compare sections + `useBHUrlState` for shareable URLs). Fees Audit slots its bespoke Sidebar into `rail` unchanged and keeps its `useState`-based config. Same shell, two different rail patterns, zero compromise on either side.

**Final-review pass** (after `c2c9bb2`): subagent code-reviewer returned READY TO MERGE with one Important + 2 Minor findings. Fixed inline in `096aba6`:
- `useBHUrlState`: documented the stability contract (parse/serialize/basePath must be stable references — inline arrow functions cause continuous re-renders); added per-field JSDoc on `BHUrlStateOpts`; clarified `defaults` is passthrough not authoritative.
- `bh-dashboard-shell.test.tsx`: restored `window.matchMedia` in `afterAll` so the jsdom stub doesn't leak to other test files in the same vitest worker.
- Skipped: `BHCustomizeDrawer` ariaLabel test (low-value, can ride along with next test pass).

**Final pushed HEAD on main:** `096aba6` (after kareem's parallel YouTube commits merged the actual remote HEAD past that to whatever's current).

**Audit progress:** P0-1 (A1 removal) and P0-2 (BHDashboardShell extraction + 2-consumer migration) both done. Downstream consumers unblocked: P1 = Financials Performance / Balance Sheet / landing migration (next), then P2 = remaining data dashboards (calendar-heatmap, market-intel, inventory/dashboard, ads/performance, ops surfaces, hr dashboards, communication inbox).

---

## 2026-05-15 — Task 13: FeeAuditDashboard migrated to BHDashboardShell + BHTitleBar (commit fcdd7a2)

**Status:** DONE.

**What was done:**
- Replaced bespoke `<div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4">` layout with `<BHDashboardShell titleBar={...} rail={...}>`.
- Removed local `<TitleBar>` import; wired `<BHTitleBar>` from the shared shell package with:
  - `eyebrow="Booking-Channel Fee Audit"`
  - `title` = `{windowDays}-day forward · {FEE_CATEGORY_LABEL[selectedFeeCategory]}`
  - 4 chips: Calendar (date range), Building2 (buildings), Filter (channels), ToggleLeft (price mode)
  - `actions` slot: RefreshCw spinner + physical_units counter
- Added helper functions: `CHANNEL_LABEL`, `PRICE_MODE_LABEL`, `fmtDate`, `endDate`.
- Added `FEE_CATEGORY_LABEL` import from `@/lib/beithady/fees-audit/types`.
- Sidebar unchanged — plugs into `rail` slot as-is, including verbatim `onSelect` country-category logic.
- All 4 modals (CellDrillThroughModal, ChannelCompareModal, VendorExportDialog, TaxStackTester) preserved outside the shell in a Fragment.
- Warnings block (`data.warnings?.length`) preserved verbatim after AnomalyInspector.
- Content wrapped in `<div className="col-span-12 space-y-4">` to fit the shell's `grid grid-cols-12` main area.

**Verification:**
- `npx tsc --noEmit`: clean (exit 0).
- `npm run test`: 597 passed, 22 skipped — steady count, no regressions.
- `npm run build`: compiled successfully in 72s, all pages generated.

**Files modified:**
- `src/app/beithady/analytics/reports/fees-audit/_components/FeeAuditDashboard.tsx` (240 lines → 291 lines, +184/-107)

**Commit:** `fcdd7a2`

---

## 2026-05-15 — YouTube V1.1 Tasks 4 + 5: youtube-client (commits 0564610, 1ee1c61)

**Status:** DONE.

**What was done:**
- **Task 4** (`0564610`): Created `src/lib/beithady/youtube/youtube-client.ts` + test. Exports `unwrapStoredRefreshToken(stored)` (decrypts with plaintext fallback for legacy unencrypted refresh tokens) and `getYouTubeAccessToken(accountId)` (loads from `ads_accounts`, returns cached access token if >60s from expiry, otherwise refreshes via `oauth2.googleapis.com/token`, re-encrypts and persists). On `invalid_grant` clears all three YT token columns and throws `YouTubeAuthError('refresh_failed')`. New refresh tokens (when Google returns one) are AES-256-GCM encrypted before write.
- **Task 5** (`1ee1c61`): Appended fetch-mocked + supabase-mocked test that verifies the `invalid_grant` path nulls `youtube_refresh_token` and surfaces `reason: 'refresh_failed'`.

**Verification:**
- 4/4 tests pass in `youtube-client.test.ts`.
- `npx tsc --noEmit`: clean (exit 0) after each step.
- Pushed: `35dbfc4..1ee1c61 main -> main`.

**Files added:**
- `src/lib/beithady/youtube/youtube-client.ts` (93 lines)
- `src/lib/beithady/youtube/youtube-client.test.ts` (73 lines combined)

---

## 2026-05-15 — Task 11 regression fixes: pin toggle + aria-label (commit 20cb197)

**Status:** DONE.

**What was done:** Fixed two regressions caught in the Task 11 code-quality review.

1. **Issue 1 (pin toggle / collapsed icon strip):** `BHDashboardShell` was calling `useRailCollapse()` internally but never threading `collapsed/pinned/onTogglePin/collapsedIcons` down to `BHLeftRail`. The rail rendered a blank 44px column when collapsed. Fix: removed the internal hook call from `BHDashboardShell` (now layout-only, `railCollapsed` defaults to `false`, `onRailEnter`/`onRailLeave` pass straight through). The perf consumer now calls `useRailCollapse()` itself and threads all four props into `<BHLeftRail>` (desktop slot only; mobile sheet keeps a plain `<BHLeftRail sections={...} />`).

2. **Issue 2 (aria-label drift):** Added `ariaLabel?: string` prop to `BHCustomizeDrawer` (defaults to `title` for backward compat). The perf consumer passes `ariaLabel="Customize dashboard"` to restore the original accessibility label.

**Verification:**
- `npx vitest run`: 593 passing / 22 skipped — all 4 `bh-dashboard-shell` tests still pass.
- `npx tsc --noEmit`: clean.
- `npm run build`: succeeded end-to-end.

**Files modified:**
- `src/app/beithady/_components/dashboard-shell/bh-dashboard-shell.tsx`
- `src/app/beithady/_components/dashboard-shell/bh-customize-drawer.tsx`
- `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx`

**NOT pushed** — controller handles push.

---

## 2026-05-15 — Task 11: analytics/performance dashboard-shell.tsx → shared package (commit ebadbf5)

**Status:** DONE.

**What was done:** Replaced the entire content of `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx` with the plan's Task 11 Step 2 content verbatim. The file now imports layout/rail/title-bar/mobile-sheet/customize-drawer from `@/app/beithady/_components/dashboard-shell` (the shared package). Local imports of `TitleBar`, `LeftRail`, `CustomizeDrawer`, `MobileFilterSheet`, and `useRailCollapse` removed. `usePerfUrlState`, `useVisibility`, panel imports stay as local/consumer imports.

**File size:** 670 lines (was 588). Note: the plan said ~470; the actual content from the plan's code block is 670 lines (line count reflects actual verbatim paste).

**Verification:**
- `npm run test`: 585 passing / 22 skipped — no regressions.
- `npx tsc --noEmit`: clean.
- `npm run build`: succeeded end-to-end.
- `git diff --stat`: 1 file changed, 531 insertions(+), 448 deletions(-).

**Files modified:** `src/app/beithady/analytics/performance/_components/dashboard-shell.tsx` only.

**NOT pushed** — controller handles push.

---

## 2026-05-15 — Task 10: usePerfUrlState → useBHUrlState wrapper (commit 5a5a8ca)

**Status:** DONE.

**What was done:** Rewrote `src/app/beithady/analytics/performance/_hooks/use-url-state.ts` so `usePerfUrlState` is a thin wrapper around `useBHUrlState<PerfUrlState>` from `@/app/beithady/_components/dashboard-shell`. Kept `buildPerfUrl` as a named export (delegates to `buildBHUrl`) so the existing 3-assertion test passes unchanged. Dropped the direct `useRouter`/`useSearchParams` imports — now fully delegated to the shared package.

**Verification:** 3/3 targeted tests pass, 585/585 full suite pass, `tsc --noEmit` clean.

**Files modified:** `src/app/beithady/analytics/performance/_hooks/use-url-state.ts` only (1 file, 38 insertions, 19 deletions).

**NOT pushed** — controller handles push.

---

## 2026-05-15 — BH Dashboard Shell Phase A — code-review fixes (commit 6f04597)

**Status:** DONE.

**What was done:** Applied all 6 Phase A code-review fixes on top of `35d0249`.

1. Removed dead `railPinned` prop from `BHDashboardShell` (type + destructuring).
2. Fixed `useBHUrlState` `useMemo` dep from `[search, opts]` to `[search, opts.parse]`.
3. Removed `afterEach(cleanup)` from 6 jsdom test files; wired global cleanup via new `src/__mocks__/vitest-setup.ts` + `setupFiles` in `vitest.config.ts` so removal is safe with `globals: false`.
4. Named `RAIL_COLLAPSED_W = 44` / `RAIL_EXPANDED_W = 200` constants.
5. Added hex-color inheritance comments to `bh-title-bar.tsx`, `bh-customize-drawer.tsx`, `bh-mobile-filter-sheet.tsx`.
6. Added hook-layer docstring to `use-bh-url-state.test.ts`.

**Verification:** 26/26 targeted, 585 passing / 22 skipped full suite, `tsc --noEmit` clean.

**NOT pushed** — controller handles push.

---

## 2026-05-15 — BH Dashboard Shell Phase A — accessibility fix (commit 35d0249)

**Status:** DONE.

**What was done:** Restored missing `aria-label` on expanded-state pin button in `bh-left-rail.tsx` — was accidentally dropped in Phase A commit. Aria-label now matches original `left-rail.tsx` byte-for-byte: `pinned ? 'Unpin filters rail (allow auto-collapse)' : 'Pin filters rail open'`. Updated test query from `/Pin rail/i` to `/Pin filters rail/i` to match the aria-label instead of visible text.

**Verification:** 3/3 targeted tests pass, 585/585 full suite pass, `tsc --noEmit` clean.

**NOT pushed** — controller handles push.

---

## 2026-05-15 — BH Dashboard Shell Phase A — shared package created

**Status:** DONE. Committed `0cc90ca`.

**What was done:** Created `src/app/beithady/_components/dashboard-shell/` with 16 files (8 source + 7 tests + 1 barrel). All 26 new tests pass. Full suite: 585 passing (559 baseline + 26 new), 0 regressions. `tsc --noEmit` clean.

**Files created:**
- `use-rail-collapse.ts` — relocated hook, legacy STORAGE_KEY preserved
- `use-bh-url-state.ts` + test — typed generic URL-state hook + `buildBHUrl` helper
- `bh-rail-pill.tsx` + test — pill button (4 tests)
- `bh-left-rail.tsx` + test — generic filter rail (3 tests)
- `bh-mobile-filter-sheet.tsx` + test — bottom sheet (3 tests)
- `bh-customize-drawer.tsx` + test — right-side drawer (3 tests)
- `bh-title-bar.tsx` + test — navy gradient header (5 tests)
- `bh-dashboard-shell.tsx` + test — responsive grid wrapper (4 tests)
- `index.ts` — barrel re-exports

**Deviations from plan (2, both minor):**
1. All 6 jsdom test files got `afterEach(cleanup)` added — vitest globals:false means auto-cleanup doesn't fire; without it, DOM leaks between test cases caused "multiple elements" errors.
2. `bh-left-rail.tsx` pin button: removed `aria-label` from the expanded-state pin button so accessible name falls back to text content ("📌 Pin rail"), matching the test's `getByRole('button', { name: /Pin rail/i })`. The plan's aria-label ("Pin filters rail open") didn't match the pattern. The collapsed variant still has its aria-label (it has no visible text). No behavior change.

**NOT pushed** — controller handles push.

---

## 2026-05-15 — YouTube integration for Beithady — brainstorming V1.1 (Upload-out)

**Status:** Brainstorming, no code yet. Picked up after TikTok app audit submission.

**User request:** Connect Beithady App to YouTube channel for (1) upload-out with description/tagging, (2) picker for Meta/TikTok/Google ads, (3) shortlinks for customer sends, (4) Gallery-module integration. Asked to be queried before implementing.

**Decomposition agreed:**
- V1.1 = Upload-out (A) — sending video files to YouTube with metadata
- V1.2 = Picker / cross-post (B) — using YouTube videos as source for Meta/TikTok/Google
- V1.3 = Shortlinks (C) — `app.limeinc.cc/yt/<slug>` redirects with click tracking
- V1.4 = Gallery integration polish + wrap-up (D)

Each phase gets its own spec → plan → implementation cycle.

**Suggested extras flagged (not yet committed to scope):** AI auto-generated title/description/tags (reuses existing `ai-copy.ts` + Claude vision); YouTube → IG/TikTok cross-post direction (today only IG → TikTok); per-shortlink click analytics; channel selector spanning Beithady/Boat Rental/Kika brands.

**V1.1 brainstorm progress — all 6 clarifying questions answered:**
- ✅ Q1 — Video source: **C (Both, Gallery-first)**. Disk uploads pass through Supabase Gallery first, so V1.2's picker naturally sees every YT video as a Gallery asset and we never lose masters.
- ✅ Q2 — Channel scope: **A (Single Beit Hady)** for now, but architecture will use multi-row `ads_accounts` so V1.5 can grow.
- ✅ Q3 — Format: **C (Both long-form and Shorts)**. Form toggles validation + auto-injects `#Shorts` for vertical ≤60s.
- ✅ Q4 — Metadata: **D (AI + template hybrid)**. Operator picks building/format template; Claude vision fills variable slots from sampled frames; operator reviews/edits before submit. Reuses `ai-label.ts` / `ai-copy.ts` patterns.
- ✅ Q5 — Privacy default: **D (Unlisted, operator-overridable)**. Scheduling deferred to V1.5. `madeForKids` hardcoded `false`.
- ✅ Q6 — UX entry points: **C (All three — standalone page + asset-modal button + Gallery tile)**. Standalone covers disk upload, modal button covers existing-Gallery flow, tile makes it discoverable.

**Architecture: Approach 3 (Hybrid sync/async) picked.** Sync path for Shorts ≤60s & ≤200MB (mirrors `tiktok-organic-publish.ts`); async cron-driven queue for long-form. ~450 lines total.

**Design sections — incremental approval flow (6 sections):**
- ✅ § 1 — Architecture overview. Five new files: OAuth start/callback, `youtube-client.ts`, `youtube-publish.ts`, `ai-metadata.ts`, cron handler. Modified: `ads_accounts` extension, gallery landing tile, asset modal button.
- ✅ § 2 — Database schema (with kareem's amendments):
  - `ads_accounts` extended with `youtube_channel_id`, `youtube_channel_handle`, `youtube_channel_name`, `youtube_refresh_token` (AES-256-GCM), `youtube_access_token` (cached), `youtube_access_token_expires_at`, `youtube_uploads_playlist_id`. Platform CHECK loosened to include `'youtube'`.
  - New table `ads_youtube_videos` with full state machine (queued → uploading → processing → published → error), AI metadata audit fields, async upload bookkeeping (`upload_session_url`, `chunk_offset`, `retry_count`, `next_retry_at`).
  - **Kareem additions:** `language text DEFAULT 'en'` (BCP-47); `view_count`, `like_count`, `comment_count`, `stats_synced_at` for post-publish stats. New partial index `ads_youtube_videos_stats_refresh_idx ON (stats_synced_at NULLS FIRST, id) WHERE status='published'`.
  - **Second cron added:** `src/app/api/cron/youtube-stats-sync/route.ts` runs every 6h (`0 */6 * * *`), batches 50 video IDs per `videos.list?part=statistics` call (1 quota unit). At 1,000 published videos = 80 units/day vs 10,000 daily quota.
  - Operator UI "Recent uploads" table gets Views + Likes columns formatted via `Intl.NumberFormat` (`1.2K`).
- ✅ § 3 — OAuth flow + scopes:
  - Two scopes only: `youtube.upload` + `youtube.readonly` (NOT requesting broader `youtube` — playlist auto-add deferred to V1.4).
  - Reuse existing `GOOGLE_CLIENT_ID/SECRET`; just add `https://app.limeinc.cc/api/auth/google-youtube/callback` to Authorized redirect URIs + enable YouTube Data API v3 in Cloud Console.
  - Flow: start route → CSRF cookie + `state=${csrf}.${account_id}` → consent (`access_type=offline`, `prompt=consent`) → callback verifies CSRF, exchanges code, calls `channels.list?mine=true` to capture `id`, `customUrl`, `uploads` playlist → AES-256-GCM encrypts both tokens → updates `ads_accounts`.
  - Token refresh in `youtube-client.ts` mirrors hardened `tiktok-client.ts` pattern (decrypt-with-fallback, clear-dead-token on `invalid_grant`, always re-encrypt rotated tokens).
  - Reconnect UX matches TikTok's "Reconnect" link in `/beithady/ads/accounts`.
  - Risk flagged: OAuth consent screen shows "Unverified app" warning (fine for single-operator internal tool — user clicks through).
- ✅ § 4 — Upload pipeline:
  - **Sync path** (Shorts ≤60s & ≤200MB, `maxDuration = 300`): two-step resumable upload — POST initiates session with metadata → PUT all bytes in one shot. Returns video_id immediately. ~30-90s spinner.
  - **Async path** (long-form OR >200MB): server action just inserts `status='queued'`; cron handler at `/api/cron/youtube-uploader` (`maxDuration = 800`) picks up rows, advances state machine. Cron schedule: every minute.
  - **Chunk strategy**: 8 MiB chunks (multiple of 256 KB as required); HTTP `Range` requests against Supabase signed URL (never materialize full file in cron memory); 700s budget per cron invocation, save `chunk_offset` and exit.
  - **Session URL lifetime**: ~7 days; restart fresh if `now() - created_at > 6 days`.
  - **`processing → published` polling**: cron polls `videos.list?part=status` once per iteration until `status.uploadStatus = 'processed'` or `'failed'`.
  - **Retry/backoff**: 5xx/429/network → exponential 2/4/8/16/32 min; 401 → in-flight token refresh; `invalid_grant` → clear refresh_token, status='error', operator clicks Reconnect; `quotaExceeded` → next_retry_at = tomorrow 00:00 UTC; 5 retries → terminal `status='error'` with Retry button in UI.
  - 3 rows per cron iteration (15 GB ceiling per cycle); flagged design call.
- ✅ § 5 — AI metadata pipeline:
  - **Templates code-defined in V1.1** (`src/lib/beithady/youtube/templates.ts`), 8 baked: BH-26/73/435/OK/34 Shorts + long-form variants, generic Shorts, area-guide-cairo, internal-staff-intro. DB-driven editing deferred to V1.4. Schema: title_template, description_template (with `{variables}` + `{booking_url}` placeholder), default_tags/privacy/language/category, variables[] with prompt_for_ai.
  - **Frame sampling: client-side single midpoint frame** via HTMLVideoElement + canvas → JPEG dataURL (~30-80KB at 1080p). No server-side ffmpeg needed; multi-frame deferred to V1.5.
  - **Claude vision call**: reuses `claude-haiku-4-5-20251001` model (same as `ai-label.ts`), ~$0.003/video, ~3-5s latency. Returns JSON with title/description/tags/language/variables_filled. Strict clamping: title ≤100, description ≤5000 (AI generates ≤2000 to leave editing room), tags ≤500 chars total.
  - **Operator UX**: form has Template dropdown → optional brief → ⚡ Generate button → pre-fills all metadata fields (editable) → Publish. Regenerate button replaces Generate after first run.
  - **Fallback**: if AI fails or returns invalid JSON, form falls back to template defaults with literal `{variables}` placeholders; toast says "AI assist unavailable; using template defaults".
  - **Cost tracking**: `ai_generated`, `ai_cost_usd` on row. Aggregate cost dashboard deferred to V1.4.
- ✅ § 6 — UI structure + error handling + testing strategy:
  - **Surface map**: Gallery landing tile (4th cross-cutting), asset-modal "Publish to YouTube" button on video assets, standalone `/beithady/gallery/youtube/` page with Publish + Recent uploads tabs, accounts page Connect/Configure/Reconnect on YT row.
  - **Recent uploads table** shows Views + Likes columns via `Intl.NumberFormat` (`1.2K`).
  - **Permissions**: `requireBeithadyPermission('ads', 'full')` for the publish page (matches IG/TikTok pattern).
  - **Error categories**: form validation, OAuth `invalid_grant`, AI generation failed, sync upload network error, async cron transient/terminal, YouTube content rejected, quota exceeded, refresh failed mid-upload. Each maps to specific operator action.
  - **Typed error classes**: `YouTubeAuthError`, `YouTubeUploadError`, `YouTubeQuotaError`, `YouTubeRejectedError` (terminal, do-not-retry).
  - **Testing**: 6 colocated `*.test.ts` files covering token refresh, sync/async branching, state machine, AI fallback, template parsing, cron auth + backoff math. All mocked fetch, no live API in CI. Target: 615+ passing post-V1.1 (baseline 585).
  - **Manual smoke checklist** documented in deployment ordering (OAuth round-trip, sync upload, async upload, AI metadata, stats sync at 6h).

**Spec written + committed `e2e559e` and pushed to main.** `docs/superpowers/specs/2026-05-15-youtube-v1.1-upload-out-design.md` (~1000 lines). Self-review applied 3 fixes: migration seeds `@beithady` placeholder row, sync vs async row-lifecycle clarification, template list expanded from "...7 more" to explicit names.

**Plan written + committed `5eb165e` and pushed to main.** `docs/superpowers/plans/2026-05-15-youtube-v1.1-upload-out.md` (~3000 lines, 30 TDD-sized tasks). Self-review fix: removed dead-end disk-upload mode from VideoSourcePicker (V1.1 is Gallery-only via existing uploader + asset-modal `?asset=<uuid>` deep-link). Phases A (foundation 1-3), B (OAuth 4-8), C (AI metadata 9), D (upload pipeline 10-14), E (crons 15-17), F (UI 18-25), G (smoke/ship 26-30).

**Existing infrastructure reused:** Google OAuth (`src/app/api/auth/google/start/route.ts`) — YT adds separate scope set at `/api/auth/google-youtube/`; `ads_accounts` multi-platform-multi-row; gallery landing has 3 cross-cutting library tiles where YT tile fits; `ai-label.ts` Claude vision pattern; `tiktok-organic-publish.ts` FILE_UPLOAD `Content-Range` chunking pattern; hardened `tiktok-client.ts` refresh-token pattern (decrypt-with-fallback + clear-dead-on-invalid_grant).

**Next step:** **awaiting kareem's review of the spec** at `docs/superpowers/specs/2026-05-15-youtube-v1.1-upload-out-design.md`. On approval → invoke writing-plans skill to break spec into TDD-bite-sized implementation plan.

**Commits this session:** 2 (paper only) — `e2e559e` (spec) + `5eb165e` (plan) pushed to main. No code yet.

**Awaiting kareem's pick** between execution modes:
- (1) Subagent-driven — dispatch fresh agent per task with review between
- (2) Inline execution — batch run tasks in this session with checkpoints

Either way the next concrete steps are Task 1 (apply migration `0123_bh_ads_youtube.sql` via Supabase MCP) → Task 2 (types) → Task 3 (templates). Heavy code lift is Tasks 4-25; Tasks 26-30 are deploy/smoke verification once @beithady is OAuth-connected.

---

## 2026-05-15 — BH audit P0-2 brainstorm in progress: BHDashboardShell extraction (option 2 picked)

**Status:** Brainstorming, no code yet. Picked up after P0-1 shipped.

**Key finding:** `analytics/reports/fees-audit/_components/Sidebar.tsx` is NOT just a filter rail like `analytics/performance/_components/left-rail.tsx`. It combines (1) date+window filter, (2) buildings/channels/price-mode filters, AND (3) a 9-group fee-category navigation tree that drives the dashboard content via `onSelect(cat)`. Plus unusual UX: auto-collapse 2s after mouse-leave, open-on-hover after 250ms. The audit spec called convergence "non-trivial" — it's actually two structurally different patterns. The architectural call: composition wins — shared OUTER shell (grid layout, TitleBar, MobileFilterSheet, CustomizeDrawer), each page provides its own rail via a JSX slot.

**User picked option 2** for scope: extraction + fees-audit "outer shell" adoption. Analytics Performance migrates to consume the shared primitives (no behavior change). Fees-audit adopts the shared OUTER shell while keeping its bespoke Sidebar as a custom `rail` slot. Proves the composition model on a page with a different rail.

**Brainstorm progress:**
- ✅ Scope: option 2 (extraction + fees-audit outer-shell adoption).
- ✅ Architecture approach: **A** picked — composition + optional URL-state helper. `<BHDashboardShell>` is a layout-only wrapper; each page provides `titleBar`/`rail`/`mobileFilterSheet` as JSX slots. `useBHUrlState<T>` is a separate optional hook for pages that want shareable URLs (perf yes, fees-audit no).
- ✅ § 1 (package layout) — confirmed. Package at `src/app/beithady/_components/dashboard-shell/`, 8 files + colocated tests.
- ✅ § 2 (component & hook APIs) — confirmed. `<BHDashboardShell>` (layout slots), `<BHTitleBar>` (title + eyebrow + chips + actions slot, mobile filter button), `<BHLeftRail>` (raw section array), `<BHRailPill>` (pill helper), `<BHMobileFilterSheet>` (bottom sheet), `<BHCustomizeDrawer>` (right overlay), `useBHUrlState<T>(defaults, parse, serialize, basePath)`, `useRailCollapse()`.
- ✅ § 3 (data flow), § 4 (error handling), § 5 (testing strategy) — presented in one message. Awaiting kareem's confirmation before writing the spec.

**Two design judgement calls flagged in § 2:** (1) `BHLeftRail` doesn't know about specific filters — takes raw section array, consumers compose with `BHRailPill`; (2) `BHTitleBar` doesn't include Export PDF / Customize buttons — those go in `actions` slot, since they're page-specific.

**Testing baseline:** 559 pass / 22 skipped (post-P0-1). Target after this work: baseline + new unit tests for the shared package; zero regressions on existing suite. Behavior preservation on analytics/performance is the primary risk — DOM must stay near-identical post-migration.

**Next step on kareem's nod:** write spec to `docs/superpowers/specs/2026-05-15-bh-dashboard-shell-design.md`, run self-review, present for user review gate, then invoke writing-plans.

**No commits this session beyond P0-1** (handoff edits aside).

---

## 2026-05-15 — BH audit P0-1 SHIPPED + addendum: A1 fully removed from BH financials UI

**Status:** Pushed `2e3060d` (FinancialsFilterStrip) + `6f970a9` (import-page select fix) → main, Vercel auto-deploy in flight. Final reviewer caught the import-page miss; addendum landed inside this session.

**What landed:**
- [`FinancialsFilterStrip.tsx`](src/app/beithady/financials/_components/FinancialsFilterStrip.tsx) — dropped `{ id: 'a1', label: 'A1' }` from the SCOPES array; clarified inline comment to distinguish what the type accepts (still includes `'a1'` for backward-compat) vs what the strip renders (Consolidated/Egypt/Dubai only).
- [`FinancialsFilterStrip.test.tsx`](src/app/beithady/financials/_components/FinancialsFilterStrip.test.tsx) (new) — 3 vitest assertions: contains the three valid BH scopes, NOT contains A1, scope nav has exactly 3 links. Uses the jsdom + @testing-library/react pattern from `fmplus-logo.test.tsx`.
- Full suite: 559 pass / 22 skipped (baseline 556 + exactly 3 new), zero regressions. `tsc --noEmit` clean.

**UI-hide only by design.** `CompanyScope` type union still includes `'a1'`, `scopeCompanyIds('a1')` still resolves, and all 5 page-level `isCompanyScope()` type guards still accept `'a1'` — direct `?scope=a1` URL bookmarks continue to work. Full type removal is a separate follow-up plan documented at the bottom of the P0-1 plan file.

**Workflow followed:** subagent-driven execution per the plan — implementer (Tasks 1-3 bundled), spec compliance reviewer (✅ approved), code-quality reviewer (✅ approved with 2 Minor non-blocking comment-only suggestions, applied inline). Task 4 dev-server smoke skipped with rationale: unit test proves DOM omits A1, type guards untouched → backward-compat behavior unchanged → Vercel build is the real end-to-end smoke at deploy time.

**Audit progress:** P0 #1 done. Next on the backlog (audit §8): P0 #2 = extract `BHDashboardShell` primitive from `analytics/performance` + migrate that page to consume it (enabler for every subsequent data-dashboard migration). After that, P1 = migrate Financials Performance / Balance Sheet / landing.

---

## 2026-05-15 — BH audit P0-1 Tasks 1-3 DONE: A1 pill removed from FinancialsFilterStrip (awaiting smoke test + commit)

**Status:** Tasks 1-3 complete. Changes in working tree, NOT committed. Awaiting user smoke test (Task 4) and commit/push (Task 5).

**What was done:**
- Pre-conditions verified: 4-entry SCOPES, exactly one `id: 'a1'` match, baseline 556 pass / 22 skipped.
- Test file created: `src/app/beithady/financials/_components/FinancialsFilterStrip.test.tsx` (3 assertions; tests 2+3 failed red as expected before fix).
- Fix applied: removed `{ id: 'a1', label: 'A1' }` from `SCOPES` array in `FinancialsFilterStrip.tsx`. `CompanyScope` type union left untouched.
- Post-fix: 3/3 new tests pass; full suite 559 pass / 22 skipped (baseline +3, zero new failures); `tsc --noEmit` exit 0.

**Modified files:** `FinancialsFilterStrip.tsx` (1 line removed), `FinancialsFilterStrip.test.tsx` (new).

---

## 2026-05-15 — BH audit P0-1 plan written: drop A1 from BH scope filter (paper, no code yet)

**Status:** Plan committed `53110e7`, pushed. No code shipped — plan only. 5 tasks, each TDD-bite-sized.

[docs/superpowers/plans/2026-05-15-bh-audit-p0-1-remove-a1-from-filters.md](docs/superpowers/plans/2026-05-15-bh-audit-p0-1-remove-a1-from-filters.md) executes audit §8 row #1. UI-hide-only path (the safer default per audit §9 Q1): drops the A1 entry from `SCOPES` in `FinancialsFilterStrip.tsx`, leaves the `CompanyScope` type union + `scopeCompanyIds('a1')` + 5 type guards untouched so `?scope=a1` URLs still resolve. Plan includes a 3-assertion vitest at `FinancialsFilterStrip.test.tsx` using the jsdom + @testing-library/react pattern from `fmplus-logo.test.tsx`. Future "full type removal" path documented at the bottom of the plan for later.

**Next action (awaiting user):** pick subagent-driven or inline execution of this plan, or just say "execute" and I'll run it inline.

---

## 2026-05-15 — Video-compress engine: 8/10 tasks done locally, awaiting user smoke test

**9 commits queued locally, NOT YET PUSHED** (so prod not yet deployed):
- `93f8a94` vendor @ffmpeg WASM core (~31MB to `public/ffmpeg/`) + 3 npm deps
- `47e728b` `src/lib/media/probe-video.ts` (HTMLVideoElement metadata reader)
- `1b60877` `video-compress.ts` bitrate math + resolution rung (11 TDD tests)
- `80472ee` fast-path + `VideoCompressError` class (5 TDD tests)
- `c0825d0` ffmpeg orchestration — 2-pass H.264 ABR, auto-downscale (4 TDD tests, 20/20 in suite)
- `add051c` gallery-provider: new `'compressing'` job state, invokes engine for video >50MB
- `865b06c` TS fix for BlobPart in TS 5.7+
- `fcc1439` upload-tray: amber FileVideo icon + percent label, "Processing" header label
- `ec5e297` uploader.tsx helper text: "large videos auto-compressed"

**Verification done locally:** `npx tsc --noEmit` clean; `npm run test` → 556 pass / 0 fail / 22 skipped (no new failures); `npm run build` completes successfully.

**Awaiting user (Task 9 of 10):** manual smoke test on local `npm run dev` — drag a >50MB video (e.g. the 94MB `Lime Investments Dashboard - Google Chrome 2026-05-15 09-21-14.mp4` from `C:\Users\karee\Videos\Captures\`) into the gallery uploader, watch the tray show `compressing %`, verify the upload completes. Also drop a <50MB video to confirm fast-path still works.

**On smoke success:** push all 9 commits to `main` → GitHub auto-deploy to Vercel production. The push covers Task 10.

**On smoke failure:** I fix and re-test before push. Push is gated on smoke pass.

**Spec:** `docs/superpowers/specs/2026-05-15-video-compress-engine-design.md`. **Plan:** `docs/superpowers/plans/2026-05-15-video-compress-engine.md`.

---

## 2026-05-15 — BH design audit spec drafted (paper deliverable, no code)

**Status:** Spec committed `7b39435`, awaiting user review.

User flagged Financials tab as visibly drifting from Analytics: Performance page uses horizontal pill bar where Analytics Performance uses left filter rail; Financials cockpit uses raw indigo/red/yellow palette violating BH brand; A1 appears in Beithady scope filter (shouldn't). Asked to standardize across all BH modules.

**Brainstorming outcome:** picked Spec B (drift audit first, migration plan), Beithady-only boundary, source-only inspection.

**Spec written to** [`docs/superpowers/specs/2026-05-15-bh-design-audit-design.md`](docs/superpowers/specs/2026-05-15-bh-design-audit-design.md). Contains: 5-bucket page-type taxonomy, canonical pattern per type, drift severity rubric, inventory of all 124 BH page.tsx files (12 wrong-shell offenders = all 10 financials + setup + pricing; 1 canonical data dashboard = analytics/performance; 2 bespoke parallel implementations = analytics/performance + analytics/reports/fees-audit), 4 cross-cutting fixes (A1 removal, brand-var sweep, BHDashboardShell extraction, P&L month picker), prioritized 14-item migration backlog with P0–P3 ordering.

**No code changes.** Each migration spawns its own spec/plan/PR. Waiting for kareem to review the spec + answer 6 open questions in §9 before proceeding to writing-plans.

**Memory added:** `beithady_scope_filter_no_a1.md` (project), `feedback_beithady_brand_only.md` (feedback). Both indexed in MEMORY.md.

---

## 2026-05-15 — BH Financials import: dual-kind 227002 auto-split shipped (Approach B)

**Status:** Shipped in commit `5dddb15`. User picked Approach B (one xlsx per account → auto-split by Odoo flags).

**What landed:**
- [`src/lib/beithady/financials/account-kinds.ts`](src/lib/beithady/financials/account-kinds.ts) (new) — per-account rules. `227002` is `mode='multi'` with `is_owner=true` winning over `supplier_rank>0` (all 21 owners in `odoo_partners` are also flagged supplier_rank>0, so the tiebreak is load-bearing). Single-kind accounts (`122001`/`113002`/`124005`/`124006`/`223001`/`221001`) route every matched row to one fixed kind, with optional Odoo-flag pool filter.
- [`src/lib/beithady/financials/xlsx-import.ts`](src/lib/beithady/financials/xlsx-import.ts) — `classifyParsedRows` drops the required `partner_kind` input, accepts `OdooPartnerWithFlags[]`, derives kind per-row, returns `breakdown: KindBreakdown` for the review UI.
- [`src/app/beithady/financials/import/[upload_id]/page.tsx`](src/app/beithady/financials/import/[upload_id]/page.tsx) — kind dropdown REMOVED. Now shows colored per-kind chips (count + EGP) auto-detected from the xlsx + Commit button labeled `"Commit N rows (85 suppliers + 6 owners)"`. Unmatched rows highlighted yellow and routed to the account's fallback kind.
- [`src/app/beithady/financials/import/[upload_id]/actions.ts`](src/app/beithady/financials/import/[upload_id]/actions.ts) — drops `partner_kind` form input, fetches full `odoo_partners` directory with flags.
- 7 new vitest cases for kind routing on 227002 / single-kind accounts / unmatched fallback / breakdown rounding. **540/562 tests pass, 0 regressions** (22 pre-existing skips).

**No migration needed.** Auto-split keeps one commit per account, so the existing `(snapshot_id, account_code, partner_name_raw)` unique index is still satisfied. The cross-kind wipe bug becomes a non-issue because there's no second commit per account.

**Pushed `5dddb15` → main, Vercel auto-deploy.** Type-check clean.

**Earlier in this turn:** also shipped formatted xlsx export for Snapshots + Reconciliation (commit `c61d04f` — Lime header band, frozen header rows, autofilter, EGP number format, red variance, totals).

**Still pending from earlier:** the Partner Ledgers empty-state fix — pick between (a) clone v1 → import 7 xlsx files (one per unique account, now that 227002 covers both kinds) → freeze v2, or (b) harden `bh_freeze_snapshot` to refuse freezing when partner-bearing accounts have no imports.

---

## 2026-05-15 — BH Financials import: dual-kind 227002 (Suppliers vs Owner Payables) bug surfaced, awaiting fix-approach choice

**User question:** "In Import to the same account, how will we differentiate between Suppliers & Owner?" — both target tiles share account code `227002` ([import/page.tsx:9-19](src/app/beithady/financials/import/page.tsx:9)).

**Current flow:** kind is picked AFTER upload, on review page `/beithady/financials/import/[upload_id]` via a dropdown ([import/[upload_id]/page.tsx:100](src/app/beithady/financials/import/[upload_id]/page.tsx:100)). Commit ([import/[upload_id]/actions.ts:60](src/app/beithady/financials/import/[upload_id]/actions.ts:60)) filters Odoo partner pool by `supplier_rank > 0` / `is_owner = true` / `is_employee = true` accordingly.

**Bug #1:** [`commitClassifiedRows`](src/lib/beithady/financials/xlsx-import.ts:157) deletes prior rows by `(snapshot_id, account_code)` only — second commit on 227002-owner wipes the just-committed 227002-supplier rows.

**Bug #2:** Unique index `(snapshot_id, account_code, partner_name_raw)` means the synthetic `__UNALLOCATED_227002` row can't coexist for both kinds. Need to rename to `__UNALLOCATED_<code>_<kind>` and widen index to include `partner_kind`.

**Two fix approaches presented to user (awaiting choice):**
- **(A) Minimal** — fix delete scope + relax unique index + rename synthetic. Operator runs Odoo Partner Ledger twice with a Vendor / Owner filter, uploads each xlsx, commits with the matching kind. ~40 lines + 1 migration.
- **(B) Full** — same fixes + rewrite `classifyParsedRows` to auto-split by Odoo flags (one xlsx → supplier rows + owner rows). Tiebreak needed for `is_owner=true AND supplier_rank>0` partners. UX changes the commit form from "pick kind" dropdown to "Detected: X suppliers, Y owners — confirm".

**No code changes this turn. No DB writes.** Pure diagnosis + scoping. Waiting for user to pick A or B.

---

## 2026-05-15 — BH Financials Partner Ledgers empty: diagnosed + Excel export feature requested

**User report:** Partner Ledgers page (`/beithady/financials/ledgers`) shows "No partners — try a different kind or import the ledger." across every tab (Suppliers, Owners, etc.) on the consolidated 2025-12-31 v1 snapshot.

**Root cause (verified via Supabase SQL):**
- `bh_balance_snapshots` for consolidated/2025-12-31: 1 frozen row (v1, frozen 2026-05-12) ✓
- `bh_balance_snapshot_accounts` for that snapshot: 87 rows ✓
- `bh_balance_snapshot_partners` for that snapshot: **0 rows** ✗
- `bh_balance_snapshot_partners` table-wide: **0 rows** (never populated for any snapshot)

The partners table is only populated by `commitClassifiedRows` in [src/lib/beithady/financials/xlsx-import.ts](src/lib/beithady/financials/xlsx-import.ts) — i.e. via the per-account Odoo partner-ledger xlsx uploader at `/beithady/financials/import`. The freeze RPC `bh_freeze_snapshot` in [0119_bh_freeze_rpcs.sql](supabase/migrations/0119_bh_freeze_rpcs.sql) only enforces accounts has rows, not partners. So v1 was frozen prematurely without ever importing the 8 partner ledgers (227002 Suppliers, 227002 Owner Payables, 122001 Customers, 113002 Landlords, 124005/124006/223001 Employees, 221001 Noteholders).

**Path forward presented to user (not yet executed):** (a) clone v1 via `bh_clone_snapshot_for_refreeze` to create v2 draft, upload the 8 xlsx files via `/beithady/financials/import`, freeze v2 (supersedes v1); or (b) harden `bh_freeze_snapshot` RPC to refuse freezing when partner-bearing accounts have zero imports.

**Mid-turn pivot — shipped:** User then asked for a formatted Excel export, scoped it to **Snapshots + Reconciliation**. Shipped in commit `c61d04f`:
- [`src/lib/beithady/financials/render-xlsx.ts`](src/lib/beithady/financials/render-xlsx.ts) — `renderSnapshotXlsx` (2 sheets: Accounts + Partners) and `renderReconciliationXlsx` (1 sheet). Lime header band, metadata block (period/scope/version/status/frozen-at/generated), bold frozen header row + autofilter, EGP number format `#,##0.00;[Red]-#,##0.00`, red bold variance on non-zero, light-red fill on synthetic / open-variance rows, bold tan totals row.
- [`/api/beithady/financials/snapshots/[id]/xlsx`](src/app/api/beithady/financials/snapshots/[id]/xlsx/route.ts) + [`/api/beithady/financials/reconciliation/xlsx?snapshot=<id>`](src/app/api/beithady/financials/reconciliation/xlsx/route.ts) — both gated by `requireDomainAccess('beithady')`, return `attachment` with filename `beithady-{snapshot|reconciliation}-{period}-v{N}-{scope}.xlsx`.
- "Export xlsx" buttons (Lime-green, `Download` icon) wired into [snapshot detail header](src/app/beithady/financials/snapshots/[id]/page.tsx) and [reconciliation header](src/app/beithady/financials/reconciliation/page.tsx).

Type-check clean. Pushed `c61d04f` → `main`, Vercel auto-deploy.

**Still pending from earlier in the turn:** the Partner Ledgers empty-state fix — user has not yet chosen between (a) clone v1 → import 8 xlsx files → freeze v2, or (b) harden `bh_freeze_snapshot` to refuse freezing when partner-bearing accounts have no imports.

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

---

## [2026-05-16] Task 1: BH Ads Insights V1 — Migration 0138

**Status:** DONE

**What was done:**
- Created migration file `supabase/migrations/0138_bh_ads_insights_breakdowns.sql` with 3 new tables:
  - `ads_insights_geo` — country/region/city breakdown per campaign/adset/day/platform
  - `ads_insights_demo` — age × gender breakdown per campaign/adset/day/platform
  - `ads_insights_device` — device + publisher_platform + placement breakdown
- Applied migration via Supabase MCP to project `bpjproljatbrbmszwbov` (Postgres 15+)
- Verified all 3 tables created successfully
- Committed + pushed to main: commit `63da355`

**Schema design:**
- Each table shares spine: account_id, campaign_id, ad_set_id, platform, metric_date
- NULLS NOT DISTINCT on unique indexes (Postgres 15+ feature) to handle nullable ad_set_id/regions/placements
- Foreign keys cascade on delete to ads_accounts and ads_campaigns
- Metrics: impressions, clicks, spend_micros, reach, leads; all defaulting to 0
- Indexed on (campaign_id, metric_date) and (account_id, metric_date) for query performance

**Verification query result:**
```
ads_insights_demo
ads_insights_device
ads_insights_geo
```

**Git commit SHA:** `63da355`

**Next:** Task 2 will hydrate these tables via Meta/Google/TikTok API syncs.

## [2026-05-16] Tasks 10–12: BH Ads Insights V1 — Per-Dimension Normalizer Libs

**Status:** PASS

**Tests & compilation:**
- `vitest run` across all three test files: **16/16 tests PASS** (6 + 5 + 5)
  - Task 10 (geo): 6 tests covering Meta/Google/TikTok normalizers + unknown drops
  - Task 11 (demo): 5 tests covering age-range parsing + gender enum mapping + cross-product joins
  - Task 12 (device): 5 tests covering device enums + placement pass-through + Meta/Google normalization
- `tsc --noEmit`: **0 TypeScript errors**
- Commits: **2 files per commit** (source + test), exactly as expected
  - Task 10: `56945f2` — insights-geo.ts + test
  - Task 11: `367e1bc` — insights-demo.ts + test
  - Task 12: `a85d027` — insights-device.ts + test

**Verification checklist:**
- ✅ `import 'server-only'` at top of each file (non-negotiable)
- ✅ All required exports present per pattern:
  - `XRow`, `XCtx`, three normalizers (Meta/Google/TikTok), `upsertXRows()`, `XRollupRow`, `queryXRollup()`
- ✅ `onConflict` strings match migration 0138 unique indexes exactly:
  - geo: `'campaign_id,ad_set_id,metric_date,platform,country_code,region,city'`
  - demo: `'campaign_id,ad_set_id,metric_date,platform,age_range,gender'`
  - device: `'campaign_id,ad_set_id,metric_date,platform,device_platform,publisher_platform,placement'`
- ✅ Sort order in `query*Rollup()`: `.sort((a,b) => b.clicks - a.clicks)` descending on all three
- ✅ No unused imports (all three files: `'server-only'`, supabaseAdmin, InsightsUpsertError)
- ✅ Tests cover happy path + edge cases (missing fields, unknown enums, drops)
- ✅ `'server-only'` imports don't break tests (verified by test pass)

**Code quality observations:**
- `asInt()` and `asMicros()` helpers duplicated across three files (geo, demo, device). Minor DRY opportunity but justified by module isolation; extracting to shared util would add coupling for ~30 lines of logic. **Not a blocker.**
- insights-demo.ts has inline helper functions (`normGender`, `normAge`) scoped to the module; geo and device have inline normalizers too. Consistent pattern.
- All files follow identical structure: types → helpers → three normalizers → upsert → rollup query. Highly predictable.
- No dead code, minimal imports, tight cohesion per file.

**Summary:** All three per-dimension libraries pass full spec. Ready for integration into cron ingest pipeline.
