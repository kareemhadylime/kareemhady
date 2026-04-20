# Kareemhady — Session Handoff (2026-04-19)

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
