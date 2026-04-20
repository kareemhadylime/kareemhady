# Kareemhady — Session Handoff (2026-04-20)

## ✅ PHASE 5.4 SHIPPED — mark-as-read uses batchModify (commit 86f981c)

### User question
User pasted a screenshot of the OAuth consent screen showing the app's two granted blocks:
1. "View your email messages and settings" = `gmail.readonly`
2. "Read, compose, and send emails from your Gmail account" (with bullets including "Create, change, or delete your email labels" and "Move new emails to your inbox, labels, spam, and trash") = `gmail.modify`

User asked: "do they have the mark read rights?"

### Diagnosis
**Permissions were fine.** Google's consent-screen copy for `gmail.modify` misleadingly says "compose and send" but the underlying scope only grants label/metadata modification — which is exactly what `removeLabelIds: ['UNREAD']` needs. Confirmed against recent `rule_runs.output` for the Beithady rule:

| started_at | marked | errors | error_reason |
|---|---|---|---|
| 14:05:39 | 21 | 8 | Too many concurrent requests for user. |
| 14:05:13 | 29 | 33 | Too many concurrent requests for user. |
| 12:38:45 (pre-re-auth) | 0 | 62 | (403 scope — now fixed) |

So the user **had** re-authed kareem@limeinc.cc (the 0/62 run was before that; the recent 21/29 rows prove modify is now working). The residual errors were Gmail rate-limiting, not authz.

### Fix — `src/lib/gmail.ts:markMessagesAsRead`
Rewrote to use `gmail.users.messages.batchModify` which accepts up to 1000 ids in a single request. Chunks to 1000 for safety (per-user runs should be well under this anyway). If a chunk's batchModify itself throws, falls back to **serial** per-id modify for that chunk — preserves the "bad id doesn't kill the whole run" behaviour without reintroducing the parallelism that caused the rate-limit.

Before:
```ts
await Promise.all(messageIds.map(async id => {
  await gmail.users.messages.modify({...});
}));
```

After:
```ts
for (let i = 0; i < messageIds.length; i += 1000) {
  await gmail.users.messages.batchModify({
    userId: 'me',
    requestBody: { ids: chunk, removeLabelIds: ['UNREAD'] },
  });
  // fallback to serial modify on chunk error
}
```

### Unchanged
- Scopes in `SCOPES` (still readonly + modify)
- Callers (engine.ts for both Guesty + Airbnb)
- Persisted shape (`marked_read` / `mark_errors` / `mark_error_reason` / airbnb variants)
- UI banners

### Verification
- `npm run build` passes, 14 routes.
- `vercel --prod --yes` deployed; no `--force` needed.
- Next Beithady run should show `marked_read` = full match count and `mark_errors` = 0 for both Guesty and Airbnb batches.

### One byproduct worth calling out
The new batchModify flow **doesn't distinguish** per-id success/failure in the happy path — `batchModify` is "all or nothing" for the chunk. So `mark_errors` will typically be 0, not "N out of M". Only the fallback serial branch produces per-id errors. For the user-facing banners this is fine: a green count when it works, a red banner with a single sample error message when it doesn't.

## ✅ PHASE 5.3 SHIPPED — Airbnb ↔ Guesty reservation reconciliation (commit d15d741)

### User feedback this turn
> "I want you also to check messages from Airbnb Guesty with Reservation Confirmation and cross reference with the Guesty Messages Confirmation and check for any missing reservations"
> "Also Mark all checked Airbnb Reservation Confirmation as read once cross referenced"

### Design
Beithady rule now does two Gmail searches per run, parses both, cross-references by Airbnb confirmation code (HMxxxxx — same as the `booking_id` Guesty already extracts), and surfaces three reconciliation buckets plus mark-as-read on both sets.

### `src/lib/rules/aggregators/beithady-booking.ts`
- **New types**: `ParsedAirbnbConfirmation`, `ReconciliationMissing`.
- **Output type** extended with: `airbnb_emails_checked`, `airbnb_confirmations_parsed`, `airbnb_parse_errors`, `airbnb_parse_failures[]`, `airbnb_matched_in_guesty`, `missing_from_guesty[]`, `guesty_not_in_airbnb`.
- **New Haiku tool** `extract_airbnb_confirmation` (`tool_choice: 'auto'`, not forced) — so non-confirmation Airbnb emails (inquiries, reviews, payout notices) return no tool_use and get silently dropped rather than erroring.
- **`aggregateBeithadyBookings` signature change**: new third param `airbnbBodies` (defaults to `[]`). Existing callers without reconciliation still work.
- **Reconciliation logic**:
  - Parse all Airbnb bodies with `Promise.allSettled`; dedupe by `confirmation_code`.
  - `guestyCodes = Set(parsed.booking_id.toUpperCase())`, `airbnbCodes = Set(confirmation_code.toUpperCase())`.
  - `missing_from_guesty` = Airbnb parsed rows whose code ∉ guestyCodes (the actionable set: Guesty missed the booking).
  - `airbnb_matched_in_guesty` = count of Airbnb rows whose code ∈ guestyCodes.
  - `guesty_not_in_airbnb` = count of Guesty bookings with `channel ∋ 'airbnb'` whose `booking_id` ∉ airbnbCodes. Useful inverse signal.

### `src/lib/rules/engine.ts`
- Inside the `beithady_booking_aggregate` switch case:
  1. Second `searchMessages` call: `fromContains: 'airbnb.com'`, `subjectContains: 'Reservation confirmed'`, same time range (reuses yearStart clamp and Jan-1 cap).
  2. `fetchEmailFull` each Airbnb match.
  3. `aggregateBeithadyBookings(bodies, currency, airbnbBodies)`.
  4. Stores `airbnbMatchIds` for the mark step.
- Mark-as-read now calls `markMessagesAsRead` twice: once for Guesty ids, once for Airbnb ids. Separate counts persisted as `marked_read` / `mark_errors` (Guesty) and `marked_read_airbnb` / `mark_errors_airbnb` (Airbnb). `mark_error_reason` captures the first error from whichever call had one.
- Empty-state branch (no Guesty matches) now also includes all the reconciliation fields with zero values so the UI renders cleanly.

### `src/app/emails/[domain]/[ruleId]/page.tsx`
- **New icons**: `AlertTriangle`, `GitCompare`, `Plane`. Removed unused `Percent`.
- **New section** "Airbnb ↔ Guesty reconciliation" placed right after "Most reserved" (before "Booking received from"). Rendered by `ReconciliationPanel` component:
  - **4 Stat cards**: Airbnb confirmations (rose, Plane icon) · Matched in Guesty (emerald, CheckCircle2) · Missing from Guesty (amber/emerald, AlertTriangle) · Guesty (Airbnb) not matched (indigo/emerald, GitCompare).
  - **Airbnb mark-as-read banner** when either `marked_read_airbnb > 0` or `mark_errors_airbnb > 0`. Green if fully marked, red if all failed.
  - **Missing-from-Guesty table** (amber header with AlertTriangle) listing: Code · Guest · Listing · Check-in · Check-out · Nights · Payout (USD, integer via `fmt()`). Includes action copy: "Investigate in Guesty: open the reservation by code and confirm it was imported; if not, trigger a manual sync."
  - Fallbacks: all-matched → green banner; no Airbnb emails found → muted placeholder explaining the search pattern.

### Verification
- `npm run build` passes (TS 10.1s, 14 routes).
- Deploy: `vercel --prod --yes` → `dpl_...` aliased to kareemhady.vercel.app.
- Build cache did not need `--force` this time.

### Known caveat (unchanged from 5.2)
Airbnb mark calls will 403 until `kareem@limeinc.cc` is re-Connected at `/admin/accounts` to grant `gmail.modify`. The new red banner variant in Reconciliation Panel surfaces this alongside the existing one on the main view.

## ✅ PHASE 5.2 SHIPPED — USD + integers + building catalog + re-auth banner (commit dd89e8d)

### User feedback this turn
> "All Currency is USD, No Decimal Digits in all"
> "Whats Commission Absorbed ?"
> "We Have Buildings: BH-26, BH-73, BH-435, BH-OK (Scattered Apartments in One Kattameya Compound), BH-MG (Single Apartment in Heliopolis)"
> "Emails are not marked as read in mailbox"

### Diagnosis of mark-as-read
Queried `rule_runs` for the Beithady rule: latest successful run processed 62 emails, `marked_read=0, mark_errors=62` — every mark call 403'd. This is the known re-auth action item from Phase 2.1: `kareem@limeinc.cc`'s OAuth token was issued with `gmail.readonly` only; `gmail.modify` was added to the `SCOPES` array later but the existing refresh token doesn't carry it. User must re-Connect that mailbox at `/admin/accounts`. Can't be fixed in code.

### Changes

#### `src/lib/rules/aggregators/beithady-booking.ts`
- Exported `BEITHADY_BUILDINGS` catalog:
  ```ts
  { 'BH-26': {...}, 'BH-73': {...}, 'BH-435': {...},
    'BH-OK': { description: 'Scattered apartments · One Kattameya compound' },
    'BH-MG': { description: 'Single apartment · Heliopolis' } }
  ```
- `deriveBuildingCode()` normalizes: any `BH<suffix>` from listing code becomes `BH-<suffix>` uppercased. So `BH73-3BR-SB-1-201 → BH-73`, `BHOK-... → BH-OK`.

#### `src/lib/rules/engine.ts`
- After `markMessagesAsRead`, if any errors came back we take the first one, strip the `"<messageId>: "` prefix, and persist the first 300 chars as `output.mark_error_reason`. UI surfaces this so the user sees the actual 403 message, not just a count.

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
- Added `fmt(n)` helper at module scope — rounds to integer and `.toLocaleString()`s. Used everywhere money is displayed.
- `BeithadyView` now hardcodes `const CURRENCY = 'USD';` (ignores the `out?.currency` field).
- Removed commissionAbsorbed computation + Commission Absorbed Stat card.
- Added `avgListRate = mean(bookings[].rate_per_night)` + "Avg list rate/night USD" Stat in its slot.
- Performance KPI strip is now: ADR · Avg list rate/night · Booking pace · Avg lead time.
- Hero stat subtitles use `fmt()`; nights/stay hint shows `avgNights.toFixed(1)` for decimal granularity on a non-money number.
- TrophyCards use `fmt()`; the "Most reserved building" card prepends the catalog description (e.g. "Scattered apartments · One Kattameya compound · 12 nights · 2,450 USD").
- `BuildingTable` rewritten to pre-render all 5 canonical buildings (empty rows dimmed to `text-slate-400` with `—` cells) plus any extra codes discovered. Each row has a two-line cell: mono code on top, 11px gray description below.
- Reservations table: rate + payout cells use `fmt()`; `Bldg` cell passes through `normalizeBuildingCode()` (local helper) so any historical un-normalized codes display canonical format.
- Footer sum uses `fmt()`; mismatch banner uses `fmt()`.
- Dropped `currency` prop from ChannelMix / BucketPanel / CheckInMonthPanel / BucketBars / GuestTable — each now writes "USD" literally.
- New red banner between the parse_errors banner and the view: shows when `(mark_errors > 0 && marked_read === 0)`. Contents: "None of N emails could be marked as read", account email in mono, link to `/admin/accounts`, instruction to re-Connect with `gmail.modify`, sample error line from `mark_error_reason`. Complements the existing green "Marked N · (M errors)" success banner.

#### `src/app/emails/[domain]/page.tsx`
- `BeithadyMini` card: hardcoded "Total payout USD" label, `Math.round` before toLocaleString.

### Known building-code gotcha
Historical rule_runs have `building_code` stored as the raw first-segment (e.g. "BH73"). The new normalize happens at parse time. Until the rule is re-run, the stored `building_code` on old rows stays "BH73". The detail page's Bldg column normalizes on render via `normalizeBuildingCode()`, so the UI is consistent. The aggregator's `by_building` bucket keys on new runs will already be "BH-73"; the BuildingTable also normalizes pre-existing bucket labels when matching against the catalog.

### Verification
- `npm run build` passes (10.9s TS, all 14 routes).
- `vercel --prod --yes` → dpl_DzExo6r5aZ5FUJjvjWUM9aYdK8A3 ready, aliased to kareemhady.vercel.app.
- Stale Vercel build cache issue did NOT recur this time (no `--force` needed after the previous force-build).

### Remaining user action
**Re-Connect kareem@limeinc.cc at [/admin/accounts](https://kareemhady.vercel.app/admin/accounts)** so OAuth grants `gmail.modify`. Until then, every Beithady run will show the red "62/62 failed" banner. Kika works because `kareem.hady@gmail.com` was already re-authed earlier.

## ✅ PHASE 5.1 SHIPPED — Beithady dashboard redesigned as hospitality view (commit 84b8039, force-deployed)

### User feedback this turn
Screenshot from `/emails/beithady/<id>` showed:
1. **Failed run**: `unknown_action_type: beithady_booking_aggregate` — the Vercel bundle was stale, engine didn't know the new action type yet.
2. **Complaint**: "you copied the dashboard of kika, this is not the info I need, customize as per my rule request, every rule has to have its own output based on the business and the info I want to see"

The Phase 5 view used the same 4-stat + bar-card pattern as KIKA, just with different labels — the user perceived it as a template clone, not a property dashboard.

### Fix 1 — force-redeploy
`vercel --prod --force --yes` → dpl_BTxNHRrL2uEoiDDfFps4bXDBXXA1 ready, aliased to kareemhady.vercel.app. Bundle now contains the `beithady_booking_aggregate` branch in engine.ts. Next Run click on the rule will succeed.

### Fix 2 — full BeithadyView rewrite (`src/app/emails/[domain]/[ruleId]/page.tsx`)
Replaced the Stat-strip-with-bar-cards pattern with a purpose-built hospitality dashboard:

- **Rose/pink gradient hero band** — 3 oversized KPIs in a single card (Reservations / Total payout / Nights reserved). Distinct visual identity vs the KIKA plain white cards.
- **"Most reserved" trophy trio** — 3 themed cards (apartment rose / building indigo / bedroom-count violet) matching the user's explicit 3-metric ask. Each has a `TrophyCard` with chip-tagged rank, Lucide icon, mono listing code, primary count, secondary nights+payout.
- **"Booking received from"** — new `ChannelMix` component with a single stacked horizontal bar (100%-width, one segment per channel) + per-channel legend pills. Colored `ChannelBadge` (Airbnb rose, Booking.com blue, Vrbo/Expedia amber, Direct emerald, other slate).
- **"Reservations in each building" table** — proper tabular breakdown with columns: Building · Reservations · Share % (inline bar) · Nights · Avg nights/res · Total payout · Avg payout/res.
- **Performance KPI row** — ADR (payout/nights), Booking pace (res/day over range days), Commission absorbed (Σ rate×nights − payout), Avg lead time.
- **Length-of-stay distribution** — bucketed Short ≤2 / Mid 3-7 / Long 8-14 / Extended 15+.
- **Lead-time distribution** — bucketed last-minute <1 / short 1-7 / medium 8-30 / far 31-90 / distant 90+, computed client-side from check-in vs time_range.from.
- **Check-ins by month** — vertical bar chart (rose→pink gradient) grouped by YYYY-MM.
- **Check-in weekday mix** — 7-bar chart with count + share% per weekday (indigo→violet gradient).
- **Top listings** — BucketBars top 15.
- **Reservations table** — rose-themed header/hover, mono booking id in rose-700, colored ChannelBadge cell, sub-total row summing nights/guests/payout + mismatch warning.
- **Guests repeat-visitor table** — unchanged shape, rose-themed header.

### New helper components (same file)
`HeroStat`, `SectionHeader`, `TrophyCard`, `ChannelBadge`, `ChannelMix`, `BuildingTable`, `BucketPanel`, `CheckInMonthPanel`, `CheckInWeekdayPanel`, `BucketBars`, plus client-side bucketers `bucketStayLengths`, `bucketLeadTimes`, `groupByCheckInMonth`, `groupByCheckInWeekday`.

### Dead code removed
`HighlightCard` and `BucketCard` helpers + `Star` / `Globe2` icon imports. Added icons: `DoorOpen`, `Percent`, `Hourglass`, `BookOpen`, `CalendarDays`.

### Architecture note for future rules
The user wrote: "every rule has to have its own output based on the business and the info I want to see". Going forward, each new action type should get its own `XxxView` component that's visually and structurally distinct — not just relabelled stats. Current setup:
- `ShopifyView` → KIKA (shopify_order_aggregate)
- `BeithadyView` → Beithady (beithady_booking_aggregate)
- Future Lime / FMPlus / VoltAuto rules each need their own view when rule action types are added.

### Verification
- `npm run build` passes (Turbopack 25.2s compile, TS 2.9min).
- `vercel --prod --force --yes` completed successfully; alias updated.
- User was told to click Run on the rule to populate data (the stale "failed" run history row is left as-is — will be superseded by the next successful run).

### Rule row (unchanged from Phase 5)
- id: `587ab03f-0b90-4b0a-a562-4858609e0839`
- name: "Beithady Guesty Bookings"
- account: kareem@limeinc.cc (`e135f97d-429c-4879-ae20-ccfc12a40f53`)
- conditions: `from_contains: guesty`, `subject_contains: NEW BOOKING`
- actions: `type: beithady_booking_aggregate, currency: USD, mark_as_read: true`

## ✅ PHASE 5 SHIPPED — Beithady Guesty Bookings rule + reservation dashboard

### What's new
- **New aggregator**: `src/lib/rules/aggregators/beithady-booking.ts` — uses Claude Haiku tool-use to extract Guesty booking notifications (channel, listing, listing_code, guest, dates, nights, guests, rate, total_payout, booking_id). Derives `building_code` (first dash-segment of listing_code) and `bedrooms` (regex `\dBR`). Dedups by booking_id, computes buckets by channel/building/bedrooms/listing, totals, averages, unique guests, optional lead-time (days from email received → check-in).
- **Engine**: `src/lib/rules/engine.ts` action union extended with `beithady_booking_aggregate`. Empty-run stub now branches on action type so Beithady runs with zero matches still render valid dashboard shape.
- **Admin form**: `_form.tsx` Type select now offers "Beithady booking aggregate (Guesty)" alongside Shopify. Currency hint added (EGP for KIKA, USD default for Beithady).
- **Domain list page** (`/emails/[domain]`): cards branch on action type. Beithady cards show Reservations / Total payout / Nights / Buildings; Shopify cards unchanged. Beithady icon is `BedDouble` with rose tint.
- **Detail page** (`/emails/[domain]/[ruleId]`): refactored to share header + time range + banners + run history, then branches to `ShopifyView` or `BeithadyView`. Beithady view includes:
  - 4 primary KPIs: Reservations / Total payout / Nights reserved / Buildings
  - 4 derived KPIs: Avg payout / Avg rate per night / Avg nights per booking / Avg lead time
  - 4 Top-highlight cards: Top apartment / Top building / Top bedroom count / Top channel
  - 4 breakdown bar-charts: by channel / building / bedroom count / listing
  - Full reservations table with Booking / Channel / Listing / Bldg / Guest / Check-in / Check-out / Nights / Guests / Rate / Payout columns + subtotal row + KPI mismatch warning
  - Guest repeat-visitor table grouped by guest name, sorted by bookings then payout
  - Run history "Orders" column becomes "Reservations" when Beithady rule
- **Rule row inserted** in DB for kareem@limeinc.cc:
  - id: `587ab03f-0b90-4b0a-a562-4858609e0839`
  - name: "Beithady Guesty Bookings", domain: `beithady`, account: kareem@limeinc.cc (`e135f97d-429c-4879-ae20-ccfc12a40f53`)
  - conditions: `from_contains: guesty`, `subject_contains: NEW BOOKING`
  - actions: `type: beithady_booking_aggregate, currency: USD, mark_as_read: true`
  - enabled: true, priority: 100

### Period filters
Same presets as KIKA (today/last24h/last7d/mtd/ytd/custom), same Jan-1 clamp, same preset chips auto-run, same ranged custom form — all shared infrastructure reused verbatim.

### Mark-as-read
Rule has `mark_as_read: true`. After each run, Guesty booking emails get UNREAD label removed in kareem@limeinc.cc Gmail (assuming the account was re-authed with `gmail.modify` scope — same action item as KIKA).

### Lead-time caveat
Gmail's message metadata for `received_at` is not currently threaded into the aggregator (we pass `receivedAtByIndex` as optional parameter but engine currently passes only `bodies`). Lead-time KPI is therefore `null` in v1 runs. Wire-up is a one-line follow-up if desired: capture `internalDate` from `gmail.users.messages.get` and pass through.



## Status: Phase 1 scaffold pushed, Google OAuth blank, Part C user-owned
Commit `b9a4251` pushed to `main` at https://github.com/kareemhadylime/kareemhady (16 files, 1263 insertions). Project moved out of the VoltAuto worktree into its own home at `C:\kareemhady` with its own `CLAUDE.md`, `.claude/settings.json` (Stop-hook for handoff continuity), and this handoff file.

## What was done 2026-04-19
- **Directory:** `C:\kareemhady` (scaffolded via `npx create-next-app@latest . --ts --tailwind --app --src-dir --no-eslint --import-alias "@/*" --use-npm --turbopack`)
- **Deps added:** `@supabase/supabase-js`, `googleapis` (103 packages total with Next 16 scaffold defaults)
- **Files written (14):** `.env.example`, `.env.local` (gitignored), `vercel.json` (two crons 6/7 UTC), `supabase/migrations/0001_init.sql`, `src/lib/{crypto,supabase,gmail,run-daily}.ts`, `src/app/api/auth/google/{start,callback}/route.ts`, `src/app/api/run-now/route.ts`, `src/app/api/cron/daily/route.ts`, `src/app/page.tsx`, `README.md`. Default branch renamed from `master` → `main`.
- **`.gitignore` fix:** scaffold had `.env*` (too aggressive — would exclude `.env.example`). Replaced with `.env` / `.env.local` / `.env.*.local` pattern.
- **Secrets generated via Node `crypto.randomBytes`** (written to `.env.local` only, NOT committed):
  - `TOKEN_ENCRYPTION_KEY=SrzTf+8P5KLCBro/zHjU14Ft8teEKk5JEIZnlzqija8=`
  - `CRON_SECRET=e649b97787c27e1692364581cf22eba8d3a2e8a9b9dbfbca678aa88184365ad4`
- **Supabase creds populated in `.env.local`:**
  - URL: `https://bpjproljatbrbmszwbov.supabase.co`
  - anon + service_role JWT keys (old-style — spec expects these, NOT the new `sb_publishable_*`/`sb_secret_*` keys).
  - Project ref: `bpjproljatbrbmszwbov`
  - Org: "Lime Investments", region eu-central-1, Nano tier

## CLI installation state (2026-04-19)
- ✅ Node 24.14.1
- ✅ Vercel CLI — authed as `kareem-2041`
- ✅ `gh` installed via `winget install GitHub.cli` → v2.90.0. **Not yet authed.** If you need it: `gh auth login`. Wasn't needed for the initial push — git used cached Windows credentials.
- ⚠️ Supabase CLI — `npm i -g supabase` exited 0 but `supabase` binary not on bash PATH. Options: open a fresh terminal, use `scoop install supabase`, or skip CLI entirely and paste the migration SQL into Supabase dashboard → SQL Editor.

## ✅ DONE: Google OAuth app created, creds in `.env.local`
1. ✅ GCP project: `kareemhady-inboxops`, project number `593051355315`, no org
2. ✅ Gmail API enabled
3. ✅ OAuth consent (new "Google Auth Platform" UI — Branding/Audience/Data Access/Clients replaced old wizard)
4. ✅ OAuth Web Client created — `593051355315-b4g0mm67eqhq041gajatba2hj1ohr8d9.apps.googleusercontent.com`. Redirect URI: `http://localhost:3000/api/auth/google/callback` (prod URI to add after Vercel deploy).
5. ✅ Client ID + Secret written to `C:\kareemhady\.env.local` (NOT the worktree — `.env.local` lives in the main project root).

### ⚠️ Action items for user
- **Rotate client secret** — user pasted it in chat. After Phase 1 working, go to Clients → InboxOps web → reset secret, update `.env.local` + Vercel env.
- **Trim scopes** — user accidentally added `gmail.modify` and `gmail.compose` in Data Access. Only `gmail.readonly` is needed (read-only Phase 1). Told user to remove modify/compose. Keep: `gmail.readonly`, `userinfo.email`, `userinfo.profile`, `openid`.
- **Test users in Audience** — confirm all 3 mailboxes added (`kareem.hady@gmail.com`, `kareem@fmplusme.com`, `kareem@limeinc.cc`).

**Project naming nit:** spec said `kareemhady`, actual is `kareemhady-inboxops`. Cosmetic only.

## ✅ Path B (Vercel-first deploy) executed
User chose deploy-to-Vercel. Done this turn:
1. ✅ Supabase migration `init_inboxops_schema` applied via Supabase MCP — 4 tables created (`accounts`, `runs`, `email_logs`, `rules`), all empty, RLS disabled (fine for single-tenant w/ service-role key).
2. ✅ Vercel project linked: `lime-investments/kareemhady` (`.vercel/` created in `C:\kareemhady\`, gitignored).
3. ✅ Env vars added — **production + development**. **Preview SKIPPED** due to Vercel CLI plugin bug: `vercel env add NAME preview --value V --yes` fails with `git_branch_required` regardless of syntax (passing `main` as branch hits `branch_not_found: Cannot set Production Branch "main" for a Preview Environment Variable`). Preview env not needed for single-tenant prod app — fine to skip.
4. ✅ First deploy: `vercel --prod --yes` → built in 31s → assigned `https://kareemhady.vercel.app` (alias) + `https://kareemhady-20a4ooras-lime-investments.vercel.app` (deployment URL).
5. ✅ Updated `GOOGLE_OAUTH_REDIRECT_URI` and `NEXT_PUBLIC_APP_URL` in Vercel prod env from localhost → `https://kareemhady.vercel.app/...` (rm + re-add).
6. ✅ Redeployed → `https://kareemhady-hipc9na5r-lime-investments.vercel.app` (alias `kareemhady.vercel.app` updated).

## ✅ PHASE 1 COMPLETE — verified end-to-end at https://kareemhady.vercel.app
3 accounts connected, 4 manual runs all succeeded (158 emails each), tokens AES-encrypted (base64 prefix verified, not plaintext `1//…`). All cron jobs configured. User saw stale dashboard at first — hard refresh fixed it (Next.js `dynamic = 'force-dynamic'` works server-side; browser was just cached).

## ✅ PHASE 2 SHIPPED — modular UI + rule engine + Claude parsing (commits c1e8c69, f1d764e, e4f7226)
- **Landing → 2 cards: Admin / Emails** with branded TopNav, gradient hero, lucide-react module icons (background flourish)
- `/admin/accounts` — Connected Emails UI moved here + ingest runs + recent emails
- `/admin/rules` — full CRUD (list / new / [id] edit / delete / run)
- `/emails/output` — list of rule cards w/ KPI snapshot
- `/emails/output/[ruleId]` — **dashboard layout**: 4 KPI cards (Orders / Total / Products / Emails matched), top-products with horizontal bar charts, orders table, run history
- New libs: `src/lib/anthropic.ts`, `src/lib/rules/engine.ts`, `src/lib/rules/aggregators/shopify-order.ts` (Claude Haiku extracts order data per email via tool use; aggregates client-side)
- New table: `rule_runs` (id, rule_id, started_at, finished_at, status, input_email_count, output jsonb, error)
- KIKA rule seeded: `from_contains: kika`, `subject_contains: Order`, `time_window_hours: 24`, action `shopify_order_aggregate` currency `EGP`, account `kareem.hady@gmail.com`
- Shared UI components: `src/app/_components/{brand,module-card,stat}.tsx`
- Visual palette: indigo/violet on slate-50 base, gradient body bg, ix-card / ix-btn-primary utility classes in globals.css
- Server actions in `src/app/admin/rules/actions.ts` (createRule, updateRule, deleteRule, runRuleAction) — no API routes for CRUD; forms call actions directly
- Dynamic params use Next 16 `params: Promise<{...}>` pattern (verified against `node_modules/next/dist/docs/`)

### Mark-as-read (Phase 2.1)
- Scope expanded: `gmail.readonly` + **`gmail.modify`** in `src/lib/gmail.ts` SCOPES
- New `markMessagesAsRead(refreshTokenEncrypted, ids)` removes UNREAD label after rule processes
- Engine calls it post-aggregation; output gets `marked_read` + `mark_errors` counts
- Failures are caught (won't fail the run); user sees green/amber banner on detail page

### ⏳ User action items (still pending from Phase 2.1)
- **Add `gmail.modify` scope in Google Cloud → Data Access** (not done yet — user only granted readonly originally)
- **Re-Connect each of 3 Gmail accounts** at `/admin/accounts` so OAuth picks up the new scope (existing tokens lack `gmail.modify`; mark calls return 403 until re-auth)
- Test KIKA rule run after re-connect → confirm "Marked N email(s) as read" banner shows on detail page

## ✅ PHASE 3 SHIPPED — domain tabs, date-range filter, mark-as-read toggle, no $ symbols (commit c0ac86d)

### DB
- Migration `add_domain_to_rules_and_mark_read_default` — added `rules.domain` text column + `idx_rules_domain` index. Updated KIKA seed: `domain='kika'`, `actions.mark_as_read=true`.

### New lib
- `src/lib/rules/presets.ts` — exports `DOMAINS` (`personal | kika | lime | fmplus | voltauto | beithady`), `DOMAIN_LABELS`, `RANGE_PRESETS` (today/last24h/last7d/mtd/ytd), `resolvePreset(preset)` returns ISO from/to, `dateInputValue(iso)` formats for `<input type="date">`.

### Engine changes
- `evaluateRule(ruleId, range?)` — optional `EvalRange` overrides default `time_window_hours`
- Mark-as-read now **conditional** on `rule.actions.mark_as_read === true` (not unconditional)
- Output JSON now embeds `time_range: { from, to, label? }` so detail page shows what range was used

### UI changes
- Rule form: Domain select + Mark-as-read checkbox (with rationale about gmail.modify scope)
- Rules list: shows domain badge + "MARK READ" badge per rule
- `/emails/output`: tab strip filters by `?domain=...` (counts shown per tab); each rule card shows domain badge
- `/emails/output/[ruleId]`: new "Time range" section with preset chips + custom from/to date inputs + two Run buttons (custom range vs preset). Run history now includes a "Range" column showing `from → to` per past run.
- `runRuleAction` server action accepts `preset` or `from`/`to` form fields; `rangeFromForm()` helper resolves to EvalRange

### No more $ symbols
- `DollarSign` icon replaced with `Wallet` (lucide-react) on output detail Stat
- Currency rendered as plain text suffix (e.g. "Total EGP", "3,100 EGP") — never a `$`

### ⚠️ Build gotcha
- **Always `cd /c/kareemhady && npm run build` (or `vercel --prod`)** — running from inside the worktree directory (`C:\kareemhady\.claude\worktrees\dazzling-vaughan-ac37b7`) builds the worktree's stale Phase 1 checkout (only 6 routes), not the main project's code. The Bash tool's cwd may reset to the original worktree path between sessions.

### Latest production deployment after Phase 3
Commit `c0ac86d` deployed; smoke tests passed: `/`, `/emails/output`, `/emails/output?domain=kika`, `/admin/rules/new` all returned 200.

## ✅ PHASE 4 SHIPPED — domain landing + per-domain rule pages (commit 490ad53)

### Routing change
- **`/emails`** is no longer "Reports & outputs" with one sub-card; it's now **6 domain cards** (+ "Other" card auto-appears if any rule has `domain IS NULL`). Each card shows label, description, icon, rule_count, last_run timestamp.
- **`/emails/[domain]`** (NEW) — list of rule boxes under that domain. Validates domain via `isDomain()` or === 'other'.
- **`/emails/[domain]/[ruleId]`** (MOVED from `/emails/output/[ruleId]`) — same dashboard, but now validates that the rule's domain matches the path domain (404 otherwise). Breadcrumbs are `Emails › <Domain> › <Rule>`.
- **DELETED:** `/emails/output/page.tsx` and `/emails/output/[ruleId]/page.tsx`.

### Engine / actions
- `runRuleAction` now looks up the rule's domain and redirects to `/emails/{slug}/{id}` (slug = rule.domain or 'other').
- `revalidatePath` calls updated to `/emails`, `/emails/{slug}`, `/emails/{slug}/{id}`.

### New presets metadata + helpers (`src/lib/rules/presets.ts`)
- `DOMAIN_DESCRIPTIONS` — one-liner per domain
- `DOMAIN_ACCENTS` — color accent per domain (slate/violet/emerald/amber/indigo/rose)
- `DOMAIN_ICON_NAMES` — lucide icon name per domain
- `isDomain(s)` — type guard

### New component
- `src/app/_components/domain-icon.tsx` — `<DomainIcon domain={...} />` maps Personal→User, KIKA→ShoppingBag, LIME→Citrus, FMPLUS→Building2, VOLTAUTO→Zap, BEITHADY→Home, other→Layers.

### Form copy
- Domain field now has hint text: "Where this rule appears under Reports & outputs."
- Empty option label: "— Other (no domain) —"

### Smoke tests after deploy
- `/`, `/emails`, `/emails/kika`, `/emails/personal`, `/admin/rules/new` → all 200
- `/emails/foobar` → 404 (correctly rejected)

## ✅ PHASE 4.1 SHIPPED — preset chips auto-Run + time_window_hours removed (commit b07c36e)

### Bug user reported
Picking a preset chip (e.g. "Month to date") only changed the URL searchParam — it didn't trigger evaluateRule, so the dashboard kept rendering the previously-cached 24h run. Looked like the range filter "reverted to 24h."

### Fix
- Preset chips on `/emails/[domain]/[ruleId]` are now `<form>` buttons (one per preset) that POST to `runRuleAction` with `preset=<id>`. Clicking immediately re-evaluates and the page renders the new run.
- `runRuleAction` now appends `?preset=<id>` to the redirect URL so the chosen chip stays highlighted after the run.
- The redundant secondary "Run preset: X" button was removed (chips themselves are the run trigger).

### Per user request: removed `time_window_hours` field from the rule
- Form: removed the "Default time window (hours)" `<input>`
- Server action: stopped writing `conditions.time_window_hours`
- UI: removed the "· last Nh" hint from `/admin/rules` and `/emails/[domain]` cards (no longer meaningful since UI controls the range)
- Engine **kept** `(cond.time_window_hours || 24) * 3600 * 1000` as a defensive fallback for any callers that don't pass a range (e.g. a future cron). Existing seeded KIKA rule still has `time_window_hours: 24` in conditions; harmless because all UI buttons now pass an explicit range.

### Cosmetic note for Kareem
- KIKA rule's name `KIKA Shopify Orders (last 24h)` still has the literal "(last 24h)" text — just a string. Edit in `/admin/rules` if it's misleading now that range is dynamic.

## ✅ PHASE 4.2 SHIPPED — rule eval now queries Gmail directly (commit f8e6fd5)

### The real bug user hit
After Phase 4.1, picking "Month to date" / "Year to date" still returned the same 8 orders as "Last 24h". User reported: "still report reverts to 24hr results, no effect on changing dates."

### Root cause
Rule engine was filtering `public.email_logs`. The daily ingest (`src/lib/gmail.ts:fetchLast24hMetadata`) only fetches emails `newer_than:1d` — so email_logs is a **24-hour rolling cache**. Confirmed via SQL: 8 KIKA emails in the cache, ALL from 2026-04-19. Widening the date filter found the same 8 rows because older emails were never ingested.

### Fix
- New `searchMessages(refreshTokenEncrypted, opts)` in `src/lib/gmail.ts` — builds a Gmail query string from the rule's conditions + date range (e.g. `from:kika subject:Order after:2026/04/12 before:2026/04/20 -in:spam -in:trash`), pages through up to 500 results. Gmail's `after:`/`before:` are day-granular, so we pad by ±1 day and let the aggregator be the source of truth.
- `evaluateRule` no longer touches `email_logs`. It requires `rule.account_id` (throws `account_or_token_missing` if null) and calls `searchMessages` directly. This guarantees the eval always sees fresh data for whatever range the UI passes.
- `email_logs` is now only used by the dashboard's "recent emails" view on `/admin/accounts` — it remains a shallow 24h cache for display.

### Timeout
- Added `export const maxDuration = 60;` to `/emails/[domain]/page.tsx` and `/emails/[domain]/[ruleId]/page.tsx`. YTD runs on a large mailbox could otherwise hit Vercel's default 10s timeout; Vercel Pro allows up to 60s.

### Implication for rules without an account
- Rules with `account_id IS NULL` (the "All accounts" option in the form) will now throw when run — the engine can only pick one account's OAuth token at a time. Phase 1 seeded KIKA rule has `account_id` set so it works. If needed in future: loop over accounts in engine.

## ✅ PHASE 4.3 SHIPPED — Jan 1 of current year is the earliest search floor (commit 373fdd9)

### Change requested by user
"Lets do it always the limit up to Year start — so 2026 will be back up to 1-JAN-2026, not to search the full library of emails."

### Implementation
- `evaluateRule` computes `yearStartMs = new Date(new Date().getUTCFullYear(), 0, 1).getTime()` and clamps `fromIso = max(requestedFromIso, yearStartMs)`. All Gmail searches are floored at this value.
- `output.time_range` now carries `clamped_to_year_start?: boolean` and `requested_from?: string` so the UI can tell when a clamp happened.
- Detail page shows an amber banner: "Requested start date X was clamped to Jan 1 (Jan 1 cap)."
- Both date inputs (`From`, `To`) get `min={yyyy-01-01}` so the native picker hints the floor visually.
- Preset section helper text updated: "Searches are always capped at Jan 1, {current year} at the earliest."

### Behaviour per preset
- Today / Last 24h / Last 7 days / MTD — all well within the cap, no change
- YTD — already uses Jan 1, no change
- Custom: if From predates Jan 1 of this year, it's silently clamped + user sees amber banner

## ✅ PHASE 4.4 SHIPPED — split "Total paid" vs "Product revenue"; show all products (commit 44fa251)

### Bug user hit
"Filter 7 Days — These Don't Match the Total of 375K ????" — product bars summed to ~166K but Total KPI said 373,918.86.

### Root cause
Two different numbers were labelled as "Total":
- `order.total_amount` from Claude extraction = **final customer charge** (incl. shipping + tax, after discounts)
- `line_item.total` from Claude extraction = **list price × qty** (pre-discount, pre-shipping, pre-tax)
Per-product revenue was the sum of line items; the KPI was the sum of order totals. For KIKA, large "Custom discount" lines (seen earlier: 3100 list → 142.50 paid) make these wildly different.

Also: product chart was capped at `products.slice(0, 12)`, so 57 of 69 products were invisible.

### Fix
- Aggregator (`shopify-order.ts`) now emits a separate `line_items_subtotal` alongside `total_amount`.
- Detail page KPI strip renamed:
  - "Total paid EGP" (Wallet icon, emerald) — with hint "Final customer charges (incl. shipping + tax, after discounts)"
  - "Product revenue EGP" (Package icon, indigo) — with hint "Sum of line items (list price × qty)"
  - "Emails matched" demoted into the "Products" card's hint line to free a slot.
- Product list now renders **all** products (removed the `.slice(0, 12)` cap); heading reads "Products (N)" with a clarifying line.

### Schema implications
- No DB changes. `rule_runs.output` is JSONB so the new `line_items_subtotal` field appears on new runs only; historical runs still render fine (subtotal treated as 0 if missing, which is honest).

### Retry note
The user needs to click a preset / Run to get a new run whose output carries `line_items_subtotal`; older rule_runs still show 0 for "Product revenue" until re-run.

## ✅ PHASE 4.5 SHIPPED — parse_failures detail + preset auto-highlight (commit ef823a6, force-deployed)

### User's three complaints this turn
1. "Still total is not correct" + screenshot showing old TOTAL EGP / EMAILS MATCHED cards — Phase 4.4 labels weren't visible.
2. "Parsing error" — 12 of 193 KIKA emails failed to parse; no way to see which ones.
3. "When i go out cache clears and the default is 9am to previous 24hrs" — returning to the detail page resets chip to Last 24h even though the displayed data was MTD/YTD.

### Diagnosis of #1
- `git log` on main shows `44fa251 Phase 4.4` deployed. `curl https://kareemhady.vercel.app/emails/kika/<id>` returned HTML containing "Total paid" / "Product revenue" and none of "TOTAL EGP" / "EMAILS MATCHED" → **Phase 4.4 is actually live; user's browser was cached**. Needed hard refresh.
- `rule_runs.output` on recent runs (10:11:04 / 10:11:36) was missing `line_items_subtotal`. Suspected Vercel build cache holding an older aggregator bundle. **Fix: `vercel --prod --force --yes`** to invalidate build cache.

### Fix for #2 (parse_failures)
- `aggregateShopifyOrders` now emits `parse_failures: [{subject, from, reason}]` alongside the numeric `parse_errors` count.
- Reason is either `String(rejection.message)` (Promise rejected — Claude API error/network) or `'no_tool_output'` (Claude returned no tool_use block).
- Detail page's amber "N email(s) could not be parsed" banner is now a `<details>` element — clicking it expands a list of up to 50 failed emails with subject/from/reason. Gives user visibility into whether the filter is catching non-order emails.

### Fix for #3 (preset auto-highlight)
- `EvalRange` now carries `presetId?: string`. `rangeFromForm` in `actions.ts` injects it (either the resolved preset id or the literal `'custom'`).
- Engine persists it as `time_range.preset_id` in the output JSONB.
- Detail page now resolves `activePreset = urlPreset || lastRunPreset || 'last24h'` — so returning to the page with no `?preset` query shows the chip matching the last run that was actually executed.

### Deployment note for future
- Vercel's build cache appears to have held an older bundle of `src/lib/rules/aggregators/shopify-order.ts` after Phase 4.4. **If new JSONB fields don't show up in `rule_runs.output`, force-redeploy with `vercel --prod --force --yes`.**

## ✅ PHASE 4.6 SHIPPED — fallbacks so historical rule_runs render correctly (commit e9ad08c)

### User confusion this turn
Screenshot showed:
- Product Revenue EGP = 0 (expected a number)
- Chip stuck on "Last 24h" even though "Last run covered 4/1 → 4/20 (Month to date)"
- User hadn't clicked anything

User asked "Why old cache is persistent" — really asking why a stale-looking snapshot shows on page load.

### Design clarification (not a bug)
- `rule_runs` is an append-only table of run snapshots.
- Detail page reads `WHERE rule_id=X ORDER BY started_at DESC LIMIT 1` and renders that one row. No auto-run on load (would burn Claude API on every visit).
- So "cache" really = the latest stored snapshot. Runs created before a new field was added simply lack that field.

### Fix: two client-side fallbacks on detail page
1. `subtotal = out.line_items_subtotal ?? sum(products[].total_revenue)` — computes Product Revenue on the fly for Phase <4.4 runs, since the per-product `total_revenue` totals are already stored.
2. `activePreset` chain expanded to `urlPreset || lastRunPreset || labelFallbackPreset || 'last24h'`. The label fallback matches `time_range.label` against `RANGE_PRESETS` (e.g. "Month to date" → `mtd`) for Phase <4.5 runs that predate `preset_id`.

### No schema/migration change
- Fallbacks are pure render-layer. Existing rule_runs JSONB untouched.
- New runs continue to persist `line_items_subtotal` and `time_range.preset_id` natively (Phase 4.4/4.5 still in effect).

## ✅ PHASE 4.7 SHIPPED — domain-list cards now match detail-page labels (commit fada7e9)

### User reported
Screenshot from `/emails/kika` still showing "TOTAL EGP" (and no Product Revenue) even after hard refresh. Phase 4.4's rename only touched the DETAIL page (`/emails/[domain]/[ruleId]`), not the LIST page (`/emails/[domain]`).

### Fix
Applied the same change to `src/app/emails/[domain]/page.tsx` rule cards:
- "Total EGP" → "Total paid EGP"
- Added "Product revenue EGP" mini-stat with the same fallback (`line_items_subtotal ?? sum(products[].total_revenue)`)
- Mini-stats grid bumped from 3 to 4 columns

### Verification
`curl https://kareemhady.vercel.app/emails/kika | grep` confirms the page now serves "Total paid" and "Product revenue", no "TOTAL EGP".

## (Original Phase 1 — kept for reference, no longer blocking)

### ✅ Production redirect URI added to Google
User added `https://kareemhady.vercel.app/api/auth/google/callback` to OAuth client (initial typo `callbackS` corrected to `callback`).

### 🐛 Fixed two Vercel issues that caused 404 on https://kareemhady.vercel.app
1. **Vercel SSO Protection** (`ssoProtection.deploymentType: "all_except_custom_domains"`) was enabled by default on the new project — `kareemhady.vercel.app` is a Vercel subdomain (not a custom domain) so it was protected. Disabled with `vercel project protection disable kareemhady --sso`. Project state now: `ssoProtection: null`.
2. **`framework: null`** on the project — Vercel auto-detect didn't fire (likely because project was created via `vercel link --yes` from CLI, not from GitHub import). Build correctly used Next.js 16.2.4 and produced all routes, but Vercel's edge wasn't routing through Next.js. Fixed by adding `"framework": "nextjs"` to `vercel.json` and redeploying.

After both fixes: `curl https://kareemhady.vercel.app/` returns 200, dashboard HTML serves correctly.

### Latest production deployment
`dpl_Bk6BpTdvsfQ6fpfsQeNz6hfZn5AR` → `kareemhady-ayndz3ft5-lime-investments.vercel.app` (alias `kareemhady.vercel.app`).

### Notes for future debugging
- `vercel alias rm` + `vercel alias set` did NOT fix the 404 on its own — only the framework fix did. If you see Vercel 404s in the future where build succeeded, check `framework: null` first.
- SSO Protection is NOW DISABLED. Anyone who can guess the URL can see the dashboard. For Phase 1 this is fine (no email content shown publicly without OAuth flow). Re-enable later if needed (would need a callback bypass mechanism).

## Vars known to env (stored in `.env.local` + Vercel; never commit secret values to git)
- `GOOGLE_CLIENT_ID` — public, prefixed `593051355315-...apps.googleusercontent.com`
- `GOOGLE_CLIENT_SECRET` — secret; user pasted in chat → **rotate after Phase 1 working** (Cloud → Clients → InboxOps web → reset)
- `ANTHROPIC_API_KEY` — secret; user pasted in chat → **rotate after Phase 2 working** (console.anthropic.com → API Keys → recreate)
- Vercel project ID stored in `.vercel/project.json` at `C:\kareemhady\`

## Remaining Part C steps (user-owned)
1. ✅ Apply migration (done via MCP)
2. ✅ `vercel link` (done)
3. `vercel env add` for each var in `.env.example` — pick Production + Preview + Development for each
4. `vercel --prod`
5. After first deploy: add `https://<deployed-url>/api/auth/google/callback` to Google Cloud OAuth redirect URIs, update `GOOGLE_OAUTH_REDIRECT_URI` + `NEXT_PUBLIC_APP_URL` in Vercel env, redeploy
6. Connect the 3 mailboxes at the deployed URL
7. Workspace gotcha: if OAuth "app blocked" on `fmplusme.com` / `limeinc.cc` — Google Admin → Security → API Controls → Manage Third-Party App Access → add as trusted
8. Click "Run now" to verify end-to-end
9. Lock down with Vercel Pro Deployment Protection

## Verification checklist (Part D) to run post-deploy
- 3 mailboxes under Connected accounts with fresh `last_synced_at`
- At least one `succeeded` run with non-zero `emails_fetched`
- Supabase `accounts.oauth_refresh_token_encrypted` column contains base64 gibberish (NOT plaintext `1//…` — if plaintext, encryption broken, STOP)
- Vercel cron jobs visible at `0 6 * * *` and `0 7 * * *`
- Dashboard URL requires Vercel Deployment Protection auth

## Spec reference
Full Phase 1 spec: `C:\Users\karee\Downloads\inboxops-phase1-build.md` (user's local file, not in repo). Future phases preview:
- Phase 2: Supabase Auth (email magic link), rules CRUD UI, rule evaluator, `ai_summarize` Claude action, `actions_taken` in email log
- Phase 3: Rule matching engine
- Phase 5: WhatsApp error alerts
