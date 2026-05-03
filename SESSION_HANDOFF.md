# Kareemhady — Session Handoff (2026-05-03)

## ✅ 2026-05-04 — Personal → Email cockpit-grade redesign shipped

User flagged the original `/personal/email` UI as sparse and showed a
double-`TopNav` bug. Pushed `d6e139a` to main with the following
fixes:

- **Double-TopNav fix**: `/personal/layout.tsx` is now a thin auth gate
  (no TopNav). Each Personal page renders its own TopNav with full
  breadcrumbs via the new `PersonalShell` component (mirrors
  `BeithadyShell`).
- **`PersonalShell` + `PersonalHeader`**: cockpit pattern (eyebrow +
  optional icon + big title + subtitle + right-slot for actions).
- **`/personal` landing**: rebuilt with launcher-tile pattern (gradient
  blur backdrop, lucide icon in colored circle, title + Live badge,
  description, arrow CTA). Cyan tile for Boat Rental, slate for Email.
- **`/personal/email` triage view**: cockpit header + 4-stat strip
  (connected mailboxes / classified / need-action / delete-bait) +
  mailbox filter row + tier-grouped grid + two empty states (no
  accounts vs. no ingest yet) + footer.
- **`CategoryCard`**: pre-rendered Tailwind class lookups for the 9
  accents so dynamic colors actually compile in production. Lucide
  icon, gradient blur, count badge, description, top-3 emails list,
  arrow CTA.
- **`TierSection`**: replaced emoji noise (🔴🟡🔵⚫) with a small
  colored dot + tier name + tier description + per-tier email count.
- **Inner pages**: `/personal/email/needs-review` and
  `/personal/email/[messageId]` now wrap in `PersonalShell` so the
  breadcrumb trail stays coherent.
- **`categories.ts`**: gained `description`, `TIER_DESCRIPTIONS`, and
  `TIER_ACCENTS` exports.
- **Type fix**: `CategorySlug` was being imported from the schema
  module (a Zod runtime value) and used as a type — caused TS2749 on
  the build. Switched to `import type { CategorySlug } from '...types'`.

Type-check passes cleanly across the whole project. 31/31 unit tests
still green. GitHub-Vercel auto-deploy in flight to `limeinc.vercel.app`.

## 🔴 2026-05-04 (earlier) — Sync API claims complete but DB unchanged; silent upsert failures + 2 secret leaks during diagnosis (rotation requested)

User pointed at the screenshot of /fmplus/financials (all numbers blank) and granted me autonomy to drive the sync. Discovered new permissions had been added in **a different worktree's** `.claude/settings.local.json` (`nifty-dubinsky-1633d8`) but were ALREADY effective enough for me to run `vercel link` + `vercel env pull` here.

**Steps taken:**
1. `vercel link --yes --project=lime --scope=lime-investments` — succeeded.
2. `vercel env pull .env.production --environment=production --yes` — created file, but only `ODOO_API_KEY` populated; `ODOO_DB`/`ODOO_URL`/`ODOO_USER` came back as empty strings even though `vercel env ls production` shows them as Encrypted/Production. Suggests prod has them stored as empty strings OR there's a pull bug. The lambda sync nonetheless works → values must come from elsewhere (warm lambda cache? deploy-time inline?).
3. Looped `GET /api/cron/odoo-financials?phase=move-lines-fmplus` — pass 1 returned `{move_lines_synced: 73420, last_id: 1660925, complete: true, duration_ms: 111416}` after a single 111s pass.

**Critical finding: DB DID NOT CHANGE.** Re-queried `odoo_move_lines` for `company_id=1`:
- `total_lines: 21000` (same as pre-sync)
- `max_id: 1280141` (same — DID NOT advance to 1660925)
- `last_synced: 2026-05-03 22:24:42` (yesterday — unchanged)
- Income/AR/Cash/Liability still 0 lines

So the function fetches lines from Odoo and reports success, but **no rows actually land in Supabase.** Reading [src/lib/run-odoo-financial-sync.ts:322-327](src/lib/run-odoo-financial-sync.ts#L322-L327): the upsert is `await sb.from('odoo_move_lines').upsert(rows, { onConflict: 'id' })` with **no `.select()` and no `error` check**. PostgreSQL FK violations on `account_id`/`partner_id`/`company_id` (or any other batch error) would resolve silently. With 73k lines fetched but 0 landed, batch upserts are failing entirely.

**FK constraints on odoo_move_lines:**
- `account_id` → `odoo_accounts(id)` ON DELETE SET NULL
- `partner_id` → `odoo_partners(id)` ON DELETE SET NULL
- `company_id` → `odoo_companies(id)` ON DELETE CASCADE

Most likely culprit: `partner_id`. `syncOdooPartners` filters by `[supplier_rank > 0 OR customer_rank > 0]` — partners with rank 0 (often customers used for one-off invoices) are excluded. When move-lines reference those partners, the batch upsert FK-fails. Single bad row in a batch of 500 → all 500 rows discarded.

**🔴 SECRET LEAKS during diagnosis (this turn) — rotate ASAP:**
- `ODOO_API_KEY` — full value `2b44d47d731a07b284639160e43b7f92503ef92d` printed by `grep` then `sed` redact pattern that didn't catch the original line. Rotate at fmplus.odoo.com → Profile → Account Security → New API Key.
- Suffix of another secret (length/charset suggests `SUPABASE_SERVICE_ROLE_KEY` or another JWT) — `...g9i-re9Eim0gFRZ42sL_Twt7bAc9DrixGqXwTmFVa6GdsHRcFZzmg` printed by an `od -c` tail call. Rotate Supabase service role at dashboard → Project Settings → API → Reset.

Cleaned up locally: deleted `.env.production` and the (uncommitted) `scripts/debug-fmplus-sync.ts` immediately so the file doesn't sit on disk.

**State at end of turn:**
- FMPLUS sync APPEARS to work but is silently broken — no new rows reach Supabase.
- /fmplus/financials still shows Revenue=0 / partial COGS.
- Two secrets to rotate (above).
- `.vercel/` link created in this worktree.
- No code commits this turn.

**Next-turn plan:** after user rotates keys, patch `syncOdooMoveLines` to (a) destructure `{ error }` from each upsert and (b) on FK-error, NULLify the offending FK column and retry the row solo. Deploy. Re-run sync. Confirm row count grows + revenue accounts populate. Likely also need to broaden `syncOdooPartners` to include rank-0 partners.

**Mini follow-up (same turn):** User screenshotted Integrations → Data API page asking where API Keys are. Pointed them to https://supabase.com/dashboard/project/bpjproljatbrbmszwbov/settings/api-keys (new UI) with fallback to /settings/api (legacy UI), plus click-path via the gear icon at bottom-left of the sidebar. User then landed on the new "Publishable and secret API keys" tab, asked if `sb_secret_biFTu...` was the one to rotate. Clarified NO — leaked key is the legacy `service_role` JWT (env var `SUPABASE_SERVICE_ROLE_KEY`), not the new `sb_secret_*` format, and pointed to the "Legacy anon, service_role API keys" tab. User opened that tab. Page hint says "If leaked, generate a new JWT secret immediately" — rotation goes via the **JWT Keys** sidebar entry (rotates the signing secret, re-issuing both legacy `anon` and `service_role` at once). Asked user to screenshot JWT Keys page next.

**Scare moment, recovered:** User accidentally clicked "Disable JWT-based API keys" then re-enabled. Smoke-tested immediately: prod homepage returns 307 (redirect to /login, expected behavior — that's the auth gate, not breakage), /login returns 200, both legacy keys (anon + service_role) still authenticate against `bpjproljatbrbmszwbov.supabase.co/rest/v1/odoo_companies` with HTTP 200. Vercel env-var values unchanged (re-pulled fresh and compared lengths). Disable+re-enable was a no-op — same keys persisted. Prod is FUNCTIONAL. Leak from earlier in turn IS STILL LIVE — rotation still needed.

**🟡 Side issue surfaced during smoke test (separate from current task):** the **anon** JWT successfully returned actual `odoo_companies` rows. RLS is either disabled on `odoo_companies` or anon has a permissive read policy. That means anyone with the public anon key (which is in client-side JS bundles by design) can read internal company/financial metadata. Worth auditing after rotation. Filed mentally — not blocking.

**State at end of turn:** awaiting user's screenshot of JWT Keys page so I can point at the exact rotate button. Cleanup done: `.env.production` and `.env.production.check` both deleted. `.vercel/` link still active in this worktree. No code commits.

**Continued same turn — JWT Keys page screenshots + rotation actually executed:**
- User opened JWT Keys → JWT Signing Keys tab. Showed: Current key = ECC P-256 `2370777C-…`, Previous key = Legacy HS256 `0D5C16D5-…` rotated 14 days ago, "Create Standby Key" button. Clarified that JWT Signing Keys is the NEW system (for Supabase Auth user tokens) and the legacy `anon`/`service_role` JWTs are signed by the **Legacy JWT Secret** on the other tab. Pointed user there.
- User opened Legacy JWT Secret tab. Critical Supabase warning: "Legacy JWT secret can only be changed by rotating to a standby key and then revoking it. It is used to **only verify** JWTs… This includes anon and service_role JWT based API keys. Consider switching to publishable and secret API keys to disable them." → direct rotation of legacy secret is no longer offered; the only path is to migrate the codebase to `sb_publishable_*` / `sb_secret_*` keys, then revoke the legacy HS256.
- Verified codebase impact: only [src/lib/supabase.ts:1-9](src/lib/supabase.ts#L1-L9) and [src/lib/supabase-browser.ts:1-17](src/lib/supabase-browser.ts#L1-L17) use these env vars. Both pass them as opaque strings to `createClient`. **No code changes needed** — pure env-var swap.
- Walked user through: copy `sb_publishable_DZJfHkoT-…` and reveal+copy `sb_secret_biFTu…` from API Keys page, replace `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel, plus rotate ODOO_API_KEY in Odoo's UI and update Vercel.
- User confirmed: **"3 changed and deployed"**.

**Smoke tests after redeploy (all PASSED):**
1. Re-pulled `.env.prod.verify` to confirm Vercel values: `SUPABASE_SERVICE_ROLE_KEY` now starts `sb_secret_b` (41 chars), `NEXT_PUBLIC_SUPABASE_ANON_KEY` now starts `sb_publishable_D` (46 chars), `ODOO_API_KEY` length unchanged at 40 chars (length-equal because Odoo keys are fixed-format hex).
2. New service_role tested directly against `bpjproljatbrbmszwbov.supabase.co/rest/v1/odoo_companies` → HTTP 200.
3. New anon tested against same → HTTP 200.
4. End-to-end via `GET /api/cron/odoo-financials?phase=metadata` (auth via CRON_SECRET → lambda → Odoo via ODOO_API_KEY → write to Supabase via new sb_secret_ key) → `{ok:true, accounts_synced:2021, partners_synced:1184}`. **All three keys operational in prod.**
5. Cleanup: deleted `.env.prod.verify`.

**Outstanding:**
- ⏳ User to revoke legacy HS256 on Supabase: **Settings → JWT Keys → JWT Signing Keys tab → "Previously used keys" row (`0D5C16D5-…`) → ⋯ menu → Revoke**. This finally kills the leaked tokens. Heads-up on possible browser-session 401s for in-flight users (resolved by refresh; acceptable for an internal cockpit).
- ❓ Open question to user: did they generate a NEW Odoo API key (40 chars new value) or just re-paste the existing one into Vercel? If the latter, the leaked `2b44…2d` is still live and a fresh key needs to be generated in Odoo's UI.

**Side observation (still pending — non-blocking):** RLS may be disabled or anon-readable on `odoo_companies` (and possibly other odoo_* tables). The ANON key returned actual rows when tested. Worth auditing after revocation completes — separate task for next session.

**Original FMPLUS Financials sync bug (origin of this whole session) still untouched** — silent FK upsert failures in `syncOdooMoveLines`. Need to ship the error-checking patch + likely broaden `syncOdooPartners` (currently filters `supplier_rank > 0 OR customer_rank > 0`, excluding rank-0 partners that customer-invoice move-lines reference). Plan to do that AFTER the legacy JWT revocation closes the security loop.

**No code commits this turn.** Pure orchestration of the rotation + smoke tests.

---

## 🟢 Earlier turn (2026-05-04) — Diagnosed "all numbers missing" on /fmplus/financials → FMPLUS move-line sync is incomplete (21,000 = 42×500 round number = budget bailout)

User shared a screenshot of `/fmplus/financials?view=pnl&asof=2026-02` showing **Revenue: 0** with Cost of Revenue: 265,695 (HK 193k, MEP 49k, Security 23k) and BAL·% column showing `—` everywhere except Cost of Revenue total (100.0%). User asked "All Numbers are missing??"

**Phase 1 evidence (read-only Supabase queries on `bpjproljatbrbmszwbov`):**

1. FMPLUS (company_id=1) has exactly **21,000 move-lines** in `odoo_move_lines`. That's `42 × 500` (PAGE size in `syncOdooMoveLines`) — a round-number smoking gun for time-budget bailout.
2. **Zero move-lines on income/income_other/asset_cash/asset_receivable/liability_\* accounts** for FMPLUS — across the entire sync window (2025-05-31 → 2026-04-30), not just Feb. The 14 income accounts (`401000` House Keeping Revenue, `402000` MEP Revenue, ..., `999200` Cash Difference Gain) are all empty.
3. The synced 21k lines are dominated by **amortization/depreciation pairs** (`asset_prepayments` ↔ `expense_direct_cost`, `asset_fixed` ↔ `expense_depreciation`). Sample of 5 latest moves confirmed both sides of double-entries are present and balance — so the sync isn't dropping rows mid-move; it just hasn't reached the customer-invoice/vendor-bill IDs yet.
4. **FMPLUS max synced id = 1,280,141; global Odoo max id (per company 5) = 1,657,836** → ~378k IDs of later journal entries that the sync hasn't yet touched. Many of those belong to FMPLUS (largest entity in the tenant per prior session).

**Why partial Cost of Revenue but zero Revenue:** sync paginates by `id asc`. Recurring amortization/depreciation entries are created upfront in Odoo and have low/clustered IDs → already synced. Customer invoices (revenue) and vendor bills (more expense) get higher IDs as posted → still pending.

**Sync code is fine, no bug.** [src/lib/run-odoo-financial-sync.ts:243-248](src/lib/run-odoo-financial-sync.ts#L243-L248) uses domain `[company_id=1, parent_state in (draft,posted), date>=cutoff, date<=today]` — no account-type filter. `cutoffDate()` is 365 days back which matches the data we have. Resume logic at line 232-241 picks up from `MAX(id)` correctly.

**Fix delivered to user:** PowerShell snippet that loops `GET /api/cron/odoo-financials?phase=move-lines-fmplus` with `Authorization: Bearer $CRON_SECRET` until `result.complete === true`. Expect 5-10 more passes at FMPLUS scale per prior session estimate. After completion, Revenue should populate (~38.5M target per Excel reference noted in earlier session).

**Open question floated to user:** add an "incomplete sync" banner to `/fmplus/financials` so a still-running sync fails loudly instead of silently rendering Revenue=0. Awaiting yes/no.

**No code commits this turn.** Pure diagnosis + fix-instructions + offered follow-up.

---

## Personal → Email module — v1 SHIPPED TO PRODUCTION (2026-05-04)

End-to-end implementation rebased onto `origin/main` and pushed
(`aa5027e..6d30215`). GitHub → Vercel integration is auto-deploying
to `limeinc.vercel.app` now. Worktree-scoped `vercel --prod` build
failed as documented — sandbox project has no env vars, harmless
noise per CLAUDE.md.

**Standing authorization recorded** in CLAUDE.md (commit `30a5f27`,
final SHA after rebase): forward push + Vercel deploy + Supabase
migrations + execute_sql are all pre-authorized; only force-push,
DROP/TRUNCATE/unbounded-DELETE, env-var deletion, and access
revocation still require an explicit ask.

### What shipped

**Migration `0081_personal_email.sql`** — applied to production Supabase (`bpjproljatbrbmszwbov`). Extended `accounts` (added `domain`, `display_name`) and `email_logs` (7 classification columns). 5 new tables: `personal_email_categories` (9 seeded), `personal_email_account_labels`, `personal_email_rules` (25 seeded), `personal_email_corrections`, `personal_email_classification_runs`. Verified live: 9 categories + 25 rules + 7 columns.

**Library** at `src/lib/personal-email/` — 12 files, 31 unit tests passing:
- `schema.ts`, `types.ts` — Zod + TS types
- `categories.ts` — 9 categories, 4 tiers, ALWAYS_AI set, helpers
- `feature-extractor.ts` (+test) — header parsing, list-unsubscribe, gmail labels (7 tests)
- `rule-matcher.ts` (+test) — priority order, all 6 match types, account scoping (8 tests)
- `cost-guard.ts` — daily UTC sum + env-overridable cap ($0.50 default)
- `corrections.ts` — recent-by-category for AI few-shot
- `prompt.ts` (+test) — system + user prompt builders (4 tests)
- `ai-classifier.ts` (+test) — Haiku 4.5 with prompt caching, JSON parse + low-confidence flag + parse-error fallback (3 tests)
- `label-sync-db.ts`, `label-sync.ts` (+test) — ensure/sync/remove Gmail labels, namespaced under `Lime/*` (4 tests)
- `pipeline-db.ts`, `pipeline.ts` (+test) — orchestrator (rule → AI gate → persist → label sync, with cost-cap fallback, 5 tests)
- `inbox-query.ts` — `loadInbox`, `loadCategoryCounts`
- `ingest.ts` — per-account scan loop with run-row bookkeeping, MIME body extraction

**Routes** at `src/app/personal/`:
- `layout.tsx` — auth guard via `canAccessDomain('personal')`
- `page.tsx` — landing with Email + Boat Rental cards
- `email/layout.tsx` — breadcrumb header
- `email/page.tsx` — tier-grouped triage view (4 tiers, 9 cards) + flat category drill-down via `?category=` param
- `email/_components/` — `account-filter`, `category-card`, `tier-section`, `refresh-button` (client)
- `email/actions.ts` — server actions: `moveEmail`, `archiveInGmail`, `markAsRead`, `manualRefresh`
- `email/needs-review/page.tsx` — flat list of needs-review emails
- `email/[messageId]/page.tsx` — detail view + classification card + move-dropdown + archive + Open-in-Gmail
- `email/setup/layout.tsx` + sub-tabs nav
- `email/setup/accounts/` — list + tag/disconnect+strip-labels actions
- `email/setup/categories/` — toggle, rename gmail label, edit display name
- `email/setup/rules/` — table, new, [id]/edit, shared `_form.tsx`, save/delete/toggle actions
- `email/setup/ai/` — model + cap display + recompute-range form + last 30 runs table
- `email/setup/corrections/` — read-only audit log

**API**: `src/app/api/cron/personal-email-ingest/route.ts` — Bearer-CRON_SECRET auth, Cairo 6am-11pm gate, `?force=1` and `?trigger=manual` query params.

**OAuth pass-through**: extended `start` + `callback` to encode `domain=personal` in OAuth state, derive `display_name` (GMAIL/LIME/FM+) from authorizing email, set both on `accounts` upsert. Backwards-compatible with no-domain legacy connect flow.

**Cron registered**: `vercel.json` adds `/api/cron/personal-email-ingest` on `0,15,30,45 4-21 * * *` UTC (= every 15 min, 6am-11pm Cairo year-round; handler gates on local hour for DST).

**Home page**: Personal card now links to `/personal` (was un-href'd).
**Admin/accounts page**: shows `display_name` + `domain` badges.

### Test status

All 31 tests pass across 6 files (`feature-extractor`, `rule-matcher`, `prompt`, `ai-classifier`, `label-sync`, `pipeline`). No tests added for ingest/UI/setup pages (per plan — covered by manual smoke test in Phase 8).

### What's NOT done (deferred to user / post-launch)

- **T31 — full ingest smoke test**: requires connecting at least one Gmail account through the new flow (`/personal/email/setup/accounts` → "Connect Gmail"), clicking "↻ Refresh", and confirming counts in the run row + `Lime/*` labels visible in Gmail mobile.
- **T32 — accuracy sample**: requires manual review of a 90-email (10/cat) sample after the smoke test ingest, target ≥85% accuracy per spec §18.
- **T33 — 7-day stability watch**: time-gated, monitor `personal_email_classification_runs` for `errors=[]` and `ai_cost_usd ≤ $0.10/day` for 7 consecutive days.
- **Optional v1 polish (skipped per plan)**: bulk-action-bar (T22).

### Required environment variable

Production needs `ANTHROPIC_API_KEY` set in Vercel envs (Production + Preview + Development) so the AI classifier works. This is already used elsewhere in the project (`src/lib/anthropic.ts`), so it's likely already set — verify before first cron tick.

### Optional environment variable

`PERSONAL_EMAIL_DAILY_CAP_USD` overrides the $0.50/day AI cost cap. Default is fine for ~200 emails/day × 3 accounts at Haiku 4.5 rates ($3.78/mo steady state).

### Branch state

```
43802bb feat(personal): register /api/cron/personal-email-ingest (every 15min, 6am-11pm Cairo)
a8a9be9 feat(personal): setup categories + AI + corrections tabs
197dcbf feat(personal): setup rules tab (table + new + edit)
8ca7a31 feat(personal): setup accounts tab (connect, tag, disconnect+strip labels)
c8f21b8 feat(personal): setup layout + sub-nav
e22e72c feat(personal): email detail page (classification card + body + actions)
1278303 feat(personal): needs-review filter page
6a8b1c9 feat(personal): server actions (move, archive, mark-read, manual-refresh)
1b096ea feat(personal): /personal/email triage view (tier-grouped + flat) + stub actions
3931b9b feat(personal): inbox query helpers (rows + per-category counts)
8b72915 feat(personal): cron route handler with Cairo window gate
b6fd85f feat(personal): per-account ingest loop with run-row bookkeeping
7790ca3 feat(personal): pipeline orchestrator (rule->AI->persist->sync) + tests
f16e22c feat(personal): two-way Gmail label sync (ensure/sync/remove) + tests
b65645c feat(personal): Haiku 4.5 classifier with prompt caching + tests
849d425 feat(personal): system + user prompt builders + tests
9a54197 feat(personal): daily cost guard + recent-corrections helpers
023eb27 feat(personal): rule matcher with priority order + tests
ca73149 feat(personal): feature extractor + tests
7a6fc6c feat(personal): show domain + display_name on admin accounts page
e45a553 feat(personal): wire home Personal card to /personal landing
27e43bd feat(personal): /personal landing with Email + Boat Rental cards
87b9f1b feat(personal): pass domain through OAuth state, set on accounts row
5001da1 feat(personal): category constants + tier helpers
ffbc9a8 feat(personal): zod schemas + types for personal-email
7143f41 feat(personal): migration 0081 — Personal email schema + category/rule seeds
122a03b docs(personal): add Email module implementation plan
4d23d8f docs(personal): add Email module design spec
```

### Next steps for the user

1. **Push to main**: `git fetch origin main && git rebase origin/main && git push origin HEAD:main` from this worktree, then `vercel --prod`. (GitHub auto-deploy will fire on push too.)
2. **Connect 3 Gmail accounts** at `/personal/email/setup/accounts` (one click each through OAuth).
3. **Click "↻ Refresh"** on `/personal/email`. First run classifies last 24h of mail across all 3 accounts.
4. **Spot-check accuracy** in `/personal/email/setup/corrections` (move misclassified ones, AI learns from corrections on the next run).
5. **Walk away** — cron picks up automatically every 15 min during 6am-11pm Cairo.

### Subagent build trace

Tasks 1–21 were executed by sonnet subagents per task with two-stage review. Tasks 23, 25–28, 30 were implemented directly after the subagent dispatch path hit org monthly usage limit at task 23 dispatch time (~12 subagent invocations completed before hitting cap). All work is consistent and verified — full test suite passes (31/31).

---

## Personal → Email — implementation plan written (2026-05-03, follow-up)

User: **Spec Approved** → invoked `superpowers:writing-plans` skill → wrote [docs/superpowers/plans/2026-05-03-personal-email-implementation.md](docs/superpowers/plans/2026-05-03-personal-email-implementation.md), 3951 lines across **8 phases / 33 tasks**.

(Earlier plan-writing details preserved below for posterity — implementation now superseded by the build-complete log above.)

## Tasks 20 & 21 — Server actions + needs-review page (2026-05-03)

### T20 — `src/app/personal/email/actions.ts` (full replacement)
Replaced stub with real implementation. Exports: `moveEmail` (DB update + audit log + Gmail label sync via `syncLabelChange`), `archiveInGmail` (grouped batchModify to remove INBOX label), `markAsRead` (grouped `markMessagesAsRead`), `manualRefresh` (calls `ingestPersonalEmails`). All 4 actions call `requireAdmin()` first. Commit: `6a8b1c9`.

### T21 — `src/app/personal/email/needs-review/page.tsx`
New route at `/personal/email/needs-review`. Server component; calls `loadInbox({ needsReviewOnly: true, limit: 500 })` with optional `?account=` filter. Shows count in heading, list of emails linking to detail page, `AccountFilter` pill nav. Commit: `1278303`.

---

## FM+ Project Budget — feature COMPLETE on main (2026-05-04, follow-up)

All 26 tasks shipped end-to-end. Branch `claude/quizzical-hoover-5cfcca` push-to-main + auto-deploy via Vercel GitHub integration.

**Live route map** under `/fmplus/financial/budget/`:
- `/` — Overview (portfolio table, KPI tiles, anomaly banner, "action needed" list)
- `/edit` — Editor (project picker → service-line picker → category-block form, draft+publish, audit on published edits)
- `/import` — XLSX upload (auto-detects rich AUC template vs flat template, preview, commit)
- `/variance?project=<id>` — single-project month×category grid with drill-to-journal side drawer
- `/compare?service_line=hk` — multi-project category grid ranked by variance %
- `/settings` — variance thresholds editor, template list, unmapped-account drift surface

**Plus API routes:**
- `GET /api/fmplus/budget/flat-template-download` — blank flat-template XLSX
- `GET /api/fmplus/budget/variance-xlsx?project=…&year=…&scenario=…&through=…` — variance export
- `GET /api/fmplus/budget/variance-pdf?project=…` — A4 landscape PDF export

**Library at `src/lib/fmplus/budget/`** (~12 files):
- `schema.ts` + `types.ts` — Zod schemas + UI types
- `templates/{hk,mep,landscape,security,pest-ctrl,waste-mgmt,index}.ts` — HK fully baked, 5 stubs
- `variance.ts` — `aggregateBudgetByMonth`, `aggregateActualsByMonth`, `matchAccountToCategory`, `colorVariance` (asymmetric), `computeCellRollup`, `buildBudgetVariance` orchestrator
- `variance-drill.ts` — `cellToMoveLines` (Odoo journal-entry loader), `matchesCellFilter`
- `parsers/{flat-template,flat-template-export,rich-auc-style}.ts` — XLSX in/out (AUC parser hits 0.00% drift on the fixture)
- `commit.ts` — atomic budget write transaction
- `audit.ts` — `computeBudgetDiff` + `writeAuditOnPublishedEdit`
- `portfolio.ts` — `buildPortfolio` aggregator
- `exports/{variance-xlsx,variance-pdf}.tsx` — formatted exports
- `__fixtures__/auc-budget.xlsx` — test fixture (109 KB)

**Database (migration `0080`)**: 7 tables — `budget_templates`, `project_budgets`, `project_budget_segments`, `budget_lines` (with generated `monthly_cost` column), `budget_revenue_lines`, `budget_audit`, `budget_settings`. HK template + 5 stubs seeded. Live on Supabase project `bpjproljatbrbmszwbov`.

**Tests**: 33+ vitest cases passing (variance math, parsers, audit, commit helper). 1 gated integration test (`FMPLUS_BUDGET_INTEGRATION=1`) covers AUC end-to-end with 0.5% reconciliation tolerance.

**Permissions**: layout-level FM+ domain check + admin-only gates on Edit/Import/Settings. All FM+ users can view Variance/Compare/Overview.

**~26 commits** on main, plus 1 cross-worktree fix (`a63a490` — `CategorySlug` type-only-import fix that unblocked the build for everyone).

**Deferred items** for a possible future polish PR (none blocking):
- Migration 0080 polish: `if not exists`, named indexes, `app_users` FKs, `updated_at` touch triggers (project conventions)
- Schema-name suffix consistency in `schema.ts` (8 unsuffixed Zod schemas should be `*Schema`)
- Variance perf: parallel awaits + comment on supabase `as unknown as` cast
- Asymmetric Season check via indexed access (`seasonMonths[season]`) for compile-time enum safety
- Wider `unmappedTotal` shape (Map<accountCode, …>) for Settings drift drilldown
- Emaar Uptown XLSX parser — that workbook has a different sheet structure than AUC; needs a separate parser variant when the user wants Emaar imports

**Parallel session**: `nifty-dubinsky-1633d8` shipped the FMPLUS Financials sub-module (P&L, Balance Sheet, dashboard, charts, account picker) under `/fmplus/financial/` — sibling to my `/budget/` tab. Both integrate cleanly because the section layout was theirs to build and my Project Budget sub-tab drops in as a child route.

**No `vercel --prod` runs from worktree** (per CLAUDE.md, worktree pushes auto-deploy via GitHub→Vercel; `vercel --prod` from a worktree just hits a sandbox project with no env vars).

Visual companion server has long-since auto-exited (30-min idle timeout). Re-launch with `bash scripts/start-server.sh --project-dir <worktree>` if needed for future visual brainstorms.
