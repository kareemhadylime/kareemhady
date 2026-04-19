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
