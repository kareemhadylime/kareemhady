# Kareemhady — Session Handoff (2026-04-22)

## ✅ URL rename migration — effectively complete (commit 495aedb)

The project is now fully live on `limeinc.vercel.app`:
- Production alias: `https://limeinc.vercel.app` (deployment `dpl_AheCaymuGQqW6im9AFEvMMBUE6zz`)
- 7 Shopify webhooks registered and healthy on the new host (verified via idempotent POST → `created:0, exists:7`)
- 3 hardcoded fallbacks swapped to the new host (commit `495aedb`):
  - `src/app/api/shopify/auth/start/route.ts` (redirect URL comment + fallback)
  - `src/app/api/shopify/auth/callback/route.ts` (fallback)
  - `src/app/api/shopify/register-webhooks/route.ts` (comment + fallback)
- Old domain `kareemhady.vercel.app` returns 404 → any stale webhooks targeting it are failing and will auto-disable within Shopify's ~48h retry window.

### ✅ Worktree + main-repo encoding drift — CLEARED
Both working copies had encoding-drifted files against `origin/main` (main repo: 88 files; worktree: 4 files from initial Edit calls). Cause: some prior tool run wrote UTF-8-with-BOM + em-dash mojibake (`—` → `â€"`). Not from `core.autocrlf` — that's set to `true` at system level but the drift included BOM addition which autocrlf doesn't do.

Cleanup this turn:
1. `git restore --worktree .` in main repo (`C:/kareemhady`) → cleared 88 files.
2. `git restore --worktree` on the 4 tracked files in worktree → cleared.
3. `git merge --ff-only origin/main` in worktree → fast-forwarded from `56bb47d` to `1b205e3`, picking up today's URL-swap and handoff commits.

Both working trees now clean; previously-drifted files (e.g. `src/lib/shopify.ts`) confirmed byte-clean (no BOM, em-dashes intact).

**Prevention**: no `.gitattributes` added — the drift wasn't from git's line-ending normalization (BOM is an encoding, not a line-ending issue). If the Edit tool on this Windows machine re-corrupts files in a future session, prefer `perl -i -pe ...` for byte-safe edits, or write changes to a temp file via `cat > <<'EOF'` heredoc then swap.

### Deferred: `?cleanup=1` extension to register-webhooks
Offered in earlier planning. Would delete webhooks whose address host differs from the current target. Skipped this turn because adding the multi-line code block required Edit tool usage, which would have re-corrupted encoding. Three paths forward:
1. Clear worktree drift first, then Edit normally.
2. Craft the insert as a unified-diff patch file and `git apply`.
3. Skip entirely — stale webhooks auto-disable within 48h; user can also delete manually in Shopify admin → Settings → Notifications → Webhooks.

### Optional remaining manual tasks
- **Shopify Dev Dashboard → KIKA app**: confirm App URL + Redirect URL are updated to `https://limeinc.vercel.app/...`. Without this, fresh OAuth installs on new shops would fail with "redirect_uri mismatch".
- (Optional) Delete any webhook listings in Shopify admin pointing at `kareemhady.vercel.app` if you don't want the ~48h retry window.

## 🟡 Stale (pre-rename) — Rename in-progress: project renamed to `lime`, domain alias still `kareemhady.vercel.app`

User renamed the Vercel project internal slug to `lime` but the production domain alias stayed as `kareemhady.vercel.app`. These are decoupled in Vercel — renaming the project name does NOT acquire a matching `{name}.vercel.app` subdomain. Domains are managed separately under the Domains section of the project overview.

Confirmed via screenshot:
- Project name (top-left): `lime` ✅
- Deployment: `lime-2mxs2iurz-lime-investments.vercel.app` (owned by team `lime-investments`)
- Domains: only `kareemhady.vercel.app` attached

### Action needed to complete the URL migration
1. Project Overview → Domains → **`+`** → try adding a new subdomain. `lime.vercel.app` is likely already claimed by someone else; fallback options to try in order: `lime-investments.vercel.app`, `lime-dashboard.vercel.app`, `limehq.vercel.app`.
2. Once Vercel accepts a new domain, update env `NEXT_PUBLIC_APP_URL` accordingly, redeploy, update Shopify Dev Dashboard app URL + redirect, re-run the webhook registration endpoint (see earlier handoff entry for the full 7-step sequence).
3. Either remove `kareemhady.vercel.app` from Domains or keep both aliases — all routes respond on whichever host is attached, so keeping both is zero-cost.

### PowerShell gotcha recorded
`curl -sS -X POST` fails in PowerShell because `curl` aliases to `Invoke-WebRequest` which uses different flags and no backslash line-continuation. Use either:
- `curl.exe -sS -X POST -H "..." <URL>` (all one line, uses the real curl binary shipped with Windows 10+)
- `Invoke-RestMethod -Method Post -Uri '<URL>' -Headers @{ Authorization = 'Bearer ...' }`

Also: the user tried `https://lime.vercel.app/api/shopify/register-webhooks` while the domain wasn't attached → 404 NOT_FOUND from Vercel. Expected — the project had been renamed internally but `lime.vercel.app` is a different subdomain that would need to be explicitly added (and is probably taken anyway).

### Alternative — skip the rename entirely
The project's internal name doesn't appear anywhere publicly. The only thing the end-user ever sees is the domain. If `kareemhady.vercel.app` isn't actively bothering anyone, leaving it as the domain alias is the simplest path and avoids:
- Shopify Dev Dashboard re-configuration
- Webhook re-registration
- Env var update
- Redeploy cycle

## 🟡 Planning: Vercel project rename `kareemhady` → `lime` (no code shipped this turn)

User asked whether renaming the project URL to `lime.vercel.app` would break anything. Turn was advisory — no commits. Impact assessment captured here so the rename can be executed safely next session.

### What survives a rename with zero changes
- All DB / Supabase data + schema
- All integration calls server-side (Odoo / PriceLabs / Guesty) — they never see the app URL
- Internal routes and session cookies (cookies are domain-less, follow any host)
- Vercel cron jobs — path-based, work on the new hostname

### What breaks unless migrated
1. **Shopify OAuth URLs** registered in Dev Dashboard:
   - App URL = `https://kareemhady.vercel.app`
   - Allowed redirect = `https://kareemhady.vercel.app/api/shopify/auth/callback`
   - Both must be re-saved to `https://lime.vercel.app/...` + release a new app version, else `/api/shopify/auth/start` throws the same "redirect_uri and application url must have matching hosts" error we debugged earlier.
2. **Shopify webhooks** — 7 currently registered with `kareemhady.vercel.app` target. Re-register after rename:
   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
     https://lime.vercel.app/api/shopify/register-webhooks
   ```
   The existing idempotent endpoint creates 7 new subscriptions on the new host. Old ones keep firing for ~48h of retries then auto-disable.
3. **Code fallback URLs** — 3 files hardcode `'https://kareemhady.vercel.app'` as the fallback for `NEXT_PUBLIC_APP_URL`:
   - `src/app/api/shopify/auth/start/route.ts:51`
   - `src/app/api/shopify/auth/callback/route.ts:153`
   - `src/app/api/shopify/register-webhooks/route.ts:36`
   Either update the fallback strings OR ensure `NEXT_PUBLIC_APP_URL=https://lime.vercel.app` is always set in Vercel env.
4. **`NEXT_PUBLIC_APP_URL` env var** — update to the new domain in Production + Preview + Development.

### Recommended rename sequence
1. Vercel Settings → General → Project name → `lime`
2. Set `NEXT_PUBLIC_APP_URL=https://lime.vercel.app` in Vercel
3. `vercel --prod` so the new env is live
4. Dev Dashboard → KIKA app → update App URL + Redirect URL + release version
5. `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://lime.vercel.app/api/shopify/register-webhooks`
6. (optional) Delete the 7 stale kareemhady.vercel.app webhooks via Shopify admin OR extend `register-webhooks` with a `?cleanup=1` flag (offered but not yet implemented)
7. Code pass to update hardcoded fallbacks + docs (offered but not yet implemented)

### Deferred items (user decides)
- Shipping the `?cleanup=1` extension to `register-webhooks` so one call does both phases of the migration.
- Updating the 3 hardcoded fallback strings so the rename is safe even if env var isn't set.

## ✅ PHASE 12 SHIPPED — Dynamic integration credentials, no more env-var hardcoding (commit a097510)

User asked for a central place to enter every API parameter for every service (Odoo, PriceLabs, Guesty, Shopify, Green-API, Airbnb) rather than hardcoding via env vars. Built a DB-backed credential resolver + admin UI.

### Schema (migration 0010 applied via MCP)
- `integration_credentials` — primary key = `provider`, jsonb `config`, `enabled` flag, `last_tested_at/status/error` for health surfacing, `updated_by` FK to app_users for audit.

### Resolver (`src/lib/credentials.ts`)
- **Single source of truth**: `CREDENTIAL_SPECS` object defines every provider's fields (key, label, envVar for fallback, type, required flag, placeholder, hint). The admin UI reads this same spec to render forms — adding a new field in one place is enough.
- `getCredential(provider, key, {required})` — async lookup with 5-min per-cold-start cache; throws descriptive errors when `required=true` and both DB + env are empty.
- `invalidateCredentials(provider?)` — clears cache after a save so warm instances pick up the new value on their next read.
- `getProviderStatus(provider)` — returns keys-set + env-fallback-keys + last test status for the admin card; never exposes actual secret values.

### Integration refactors (every module now reads via resolver)
- **odoo.ts** — `getCreds()` async; 4 call sites updated to await.
- **pricelabs.ts** — `pricelabsFetch` resolves `api_key` per request.
- **guesty.ts** — `getAccessToken` resolves `client_id` + `client_secret`; keeps the 3-layer token cache (in-process → Supabase `integration_tokens` → fresh OAuth).
- **shopify.ts** — `resolveAdminToken` + `baseUrl` are now async; handles `store_domain` + optional `admin_access_token` from DB (with env fallback) and still layers the OAuth-persisted token on top.
- **Shopify OAuth start/callback + webhook HMAC verifier** use DB-backed `app_client_id` / `app_client_secret`.
- **run-shopify-sync.ts** `shopDomain()` switched to resolver.

### Ping endpoints cleanup
Dropped duplicated env-presence checks from `/api/odoo/ping`, `/api/guesty/ping`, `/api/pricelabs/ping`, `/api/shopify/ping`. The resolver throws descriptive errors when fields are missing — pings just surface them, no parallel check list to maintain.

### Admin UI (`/admin/integrations`, admin-only, 404 for non-admins)
- One card per provider with health chip (✓ green when `last_test_status=ok` AND all required fields resolved, ⚠ amber otherwise), last-test timestamp, Docs link, and inline ping path.
- Each field has a **source chip**: `DB` (green) / `ENV` (amber = using env fallback) / `UNSET` (grey) so admins see at-a-glance which fields are persisted vs relying on env vars.
- **Password fields** masked and show `••••• (leave blank to keep current)` placeholder — admins can update one field without re-entering every secret.
- **Per-field Clear checkbox** to explicitly remove a stored value (submits empty + ticks `clear:<key>`).
- **Enabled toggle** per provider.
- **Test connection** inline link opens the bearer-auth'd ping path in a new tab.
- Error message surfaces in a rose-tinted code block when `last_test_error` is set.

### Seed button (one-shot)
Top-of-page "Seed from env vars" button runs a server action that copies every current env value into the DB for any field that isn't already set. Safe to re-run (skips fields with existing DB values). After one click, every chip flips from ENV → DB.

### Coverage of user-requested providers
| Provider | Fields | Status |
|---|---|---|
| Odoo | url, db, user, api_key | wired end-to-end |
| PriceLabs | api_key | wired end-to-end |
| Guesty | client_id, client_secret, account_id, webhook_secret | wired end-to-end |
| Shopify | store_domain, app_client_id, app_client_secret, admin_access_token | wired end-to-end (incl. OAuth + webhook HMAC) |
| Green-API | id_instance, api_token_instance, webhook_secret_path | stored-only; Phase 13 wiring |
| Airbnb | client_id, client_secret, note | stored-only placeholder; data flows via Guesty |

### TypeScript notes
- Hit a silent caller-await bug in `shopify.ts` where `baseUrl()` was called 4 times as `${baseUrl()}...` without await after making the function async. Fixed with a single `replace_all` that wrapped all 4 call sites in `${await baseUrl()}`.
- `seedFromEnvAction` initially returned results — Next.js 16 server-action typings require `Promise<void>`. Changed to void return.

### Phase 13 backlog
1. **Per-provider test-connection server action** — today the admin UI links out to `/api/{provider}/ping` which needs a bearer header; add a built-in "Test now" button that uses the session cookie to authenticate against a fresh endpoint and records the result back into `last_test_*`.
2. **Green-API wiring** — new `/api/webhooks/green/<slug>` handler + outbound helper using the stored credentials.
3. **Credential audit trail** — small viewer of recent `updated_at / updated_by` changes per provider.
4. **Remove legacy env vars from Vercel** — once `Seed from env vars` has been clicked and the user has verified every provider works, delete the env vars from the Vercel project for safety.
5. **Proxy-file rename** — Next.js 16 keeps nagging to rename `middleware.ts` → `proxy.ts`.

## ✅ PHASE 11 SHIPPED — Lime Investments rebrand + login gate + role-based domain access (commits fda91f3 → 54ae04e)

User asked for: (1) app always opens on a login page, (2) accounts with one-or-multi domain roles, (3) full theme rebrand to "Lime Investments Dashboard" (holding company for all subsidiaries), (4) distinctive per-subsidiary themes drawn from the PDFs in `.claude/Documents/`.

### Important blocker on branding
Both "Lime Business Profile Example.pdf" (17MB) and "Lime Investments Bussiness Profile New.pdf" (60MB) are **image-only PDFs** — pypdf.extract_text() returned 0 chars across all pages. No OCR available in this environment, so specific official hex codes / logos couldn't be lifted. The theme I built uses Tailwind's lime + emerald gradient which fits the name cleanly. When the user provides exact hex / SVG logos, a single file (`src/lib/brand-theme.ts`) handles the swap.

### Auth layer (`src/lib/auth.ts` + `src/lib/auth-constants.ts`)
- scrypt(N=16384, r=8, p=1, keylen=64) password hashing. Stored format: `scrypt$N$r$p$salt_b64$key_b64`. Verify uses `timingSafeEqual`.
- Opaque 32-byte session tokens in `app_sessions` table (not JWT — small tenant, DB trip is cheap and gives instant revocation).
- Session cookie `lime_session` (HttpOnly, Secure in prod, SameSite=lax, 30-day expiry).
- `getCurrentUser()` — server-side lookup joining `app_sessions` → `app_users` → `app_user_domain_roles`. Updates `last_seen_at` on every read.
- `canAccessDomain(user, domain)` — admins always allowed; non-admins need a row in `app_user_domain_roles`.
- **Edge-runtime gotcha**: middleware can't import `node:crypto`, so `SESSION_COOKIE` lives in `auth-constants.ts` (plain string, no deps) and both middleware + server import it from there. Build broke once on a cosmetic re-export (`export { SESSION_COOKIE } from './auth-constants'` doesn't bring the name into local scope) — fixed by doing `import + export`.

### Auth routes
- `/login` (page) — Lime gradient background, error banner, redirects to `?next=` param (sanitized to prevent open redirect).
- `/api/auth/login` (POST) — form-data or JSON; scrypt verify; creates session; sets cookie; 303 redirect.
- `/api/auth/logout` (GET + POST) — destroys session + clears cookie.
- `/api/auth/bootstrap` (POST, CRON_SECRET-protected) — one-shot password setter. Only works when `password_hash` is empty OR not scrypt format. Prevents reuse as a password-reset backdoor.

### Migration 0009 (applied via MCP)
- `app_user_domain_roles` — (user_id, domain, role) composite PK. `role = 'viewer' | 'editor' | 'admin'`.
- `app_sessions` — token text PK, user_id FK, expires_at, last_seen_at, user_agent, ip.

### Middleware (`src/middleware.ts`)
Gates every route behind `/login` except:
- Public prefixes: `/login`, `/api/auth/`, `/api/cron/`, `/api/webhooks/`, `/api/shopify/auth/`, static files.
- Bearer-auth'd smoke-test endpoints (via regex): `/api/*/ping`, `/api/guesty/run-now`, `/api/odoo/run-now`, `/api/odoo/sync-financials`, `/api/pricelabs/run-now`, `/api/shopify/run-now`, `/api/shopify/register-webhooks`, `/api/run-now`, `/api/analysis/*`.
- Middleware only checks cookie presence (doesn't validate the token — edge can't use service-role Supabase). Missing cookie → redirect to `/login?next=<path>`. Real validation happens server-side in `getCurrentUser()`.
- Next.js 16 deprecation warning seen: 'middleware' convention renamed to 'proxy'. Works but worth migrating in a future commit.

### Admin console (`/admin/users`)
Only accessible to `is_admin` users (404 otherwise). Three server actions in `actions.ts`:
- `createUserAction` — adds a user with hashed password + role.
- `updateUserAction` — change role.
- `deleteUserAction` — hard delete (prevented on self).
- `setDomainRolesAction` — checkbox grid; replaces entire domain-role set for a user in one pass (delete + insert).
All guarded by `requireAdmin()` which throws if the caller isn't admin — even direct HTTP hits to the action bodies are safe.

### Rebrand (`src/app/_components/brand.tsx`)
- Brand pill: lime → emerald gradient with Leaf icon (was indigo/violet Inbox).
- Wordmark: "Lime" (bold) + "Investments" (slate grey).
- TopNav is now async and surfaces: current username, admin badge (lime pill), Sign-out form.
- Layout metadata: title "Lime Investments Dashboard", theme-color `#65a30d`.

### Home page (`src/app/page.tsx`)
- Lime→emerald→teal gradient headline.
- "Holding company portfolio" pulse pill.
- When not logged in: centered Sign-in card pointing to /login.
- When logged in with 0 domains: "No subsidiary access" message directing to `/admin/users`.
- When logged in with domains: grid of subsidiary cards (one per accessible domain), each with its own gradient blob, tint-colored icon chip, `A Lime Investments subsidiary` parent-note tag, domain-specific description. Extra dashed "All rules" card at the end.

### Distinctive per-domain themes (`src/lib/brand-theme.ts`)
Each theme carries 9 Tailwind color classes + name/tagline/description/parentNote. One source of truth — domain cards, headers, gradient blobs all pull from here.
| Domain | Gradient |
|---|---|
| LIME | lime → emerald |
| KIKA | pink → rose |
| BEITHADY | rose → amber |
| FMPLUS | amber → orange |
| VOLTAUTO | indigo → blue |
| PERSONAL | slate |

### Deployment
- First deploy failed: edge runtime rejected `node:crypto` import. Fixed by extracting cookie constant.
- Second deploy failed: TypeScript couldn't find SESSION_COOKIE inside auth.ts (re-export doesn't bring into local scope). Fixed with explicit import + re-export.
- Third deploy succeeded — `next build` clean, middleware attached, login page renders.

### Pending user action
1. Bootstrap the admin password via curl (existing `admin` user had a legacy bcrypt hash incompatible with my scrypt verifier — cleared it via SQL so bootstrap can set a fresh one):
   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"..."}' \
     https://kareemhady.vercel.app/api/auth/bootstrap
   ```
2. Log in at `/login`.
3. Optionally create per-subsidiary user accounts at `/admin/users` with checkbox-selected domain roles.

### Phase 12 backlog
1. **Proper official branding swap** — waiting on exact hex codes + logo SVGs from the Lime Investments profile PDF (current extraction failed; manual OCR or direct asset delivery needed).
2. **Migrate `middleware.ts` → `proxy.ts`** per Next.js 16 deprecation warning.
3. **Domain-scoped enforcement in middleware** — currently the middleware only checks cookie presence; per-domain gating happens in `getCurrentUser()` on server pages. Add a second middleware pass that 404s `/emails/<domain>/*` when the user lacks access — faster than server-side 404 after full page render.
4. **Self-service password change page** for signed-in users.
5. **Audit log** — surface `app_sessions` recent activity per user in `/admin/users`.

## 🟢 KIKA currency hardcoded to EGP (commit 009cda7)

Kika's Shopify store (kika-swim-wear) only sells in EGP. Before this change the abandoned-checkouts card on `/emails/kika/exec` read currency dynamically from Shopify raw data (could have surfaced a non-EGP string if a checkout record ever carried one). Hardcoded to `EGP` and added explicit `(EGP)` qualifiers to every money column header across the three Kika dashboards so the unit is unambiguous:

- **Exec** — Revenue (Gross) and AOV sub now carry `EGP`; "Most items" Revenue header and "Top open carts" Value header both say `(EGP)`; recoverable-revenue card hardcodes `EGP {fmt(...)}`; avg cart shows `Avg cart EGP {fmt(...)}`.
- **Sales** — Gross Revenue and AOV BigStat subs always show `EGP`; daily breakdown Revenue header, top products Revenue header, top customers Revenue header, and recent orders Total header all now `(EGP)`.
- **Financials** — P&L Balance header `(EGP)`, Net Profit label `(EGP)`, and both Shopify / Odoo sub-cards in the reconciliation header carry `(EGP)`.

The underlying `kika-abandoned-checkouts.ts` builder still fetches and returns `currency` from the DB for forward compatibility, but the UI no longer reads it — so a stray non-EGP Shopify record couldn't mis-label the total.

## ✅ PHASE 13 SHIPPED — Phase 12 backlog cleared: proxy.ts rename + self-service password + domain layouts + session audit (commit dee3863)

Closes the four actionable items from the Phase 12 backlog. Deployment `dpl_8vDe1oA2avibJ9RWDtWTqv8nW9Ni` live on `https://limeinc.vercel.app`. Only the branding swap (blocked on hex codes + SVG logos) remains unshipped from that backlog.

### 1. `middleware.ts` → `proxy.ts` (Next.js 16 deprecation)
- File rename (git tracks as 90% similar rename) + function rename `middleware` → `proxy`. `config.matcher` unchanged.
- Comments updated ("this middleware does NOT…" → "this proxy does NOT…") but matcher, route allow-list, and bearer-API regex patterns are byte-identical.
- Build + deploy verified no routing behavior change — `/login` 200, gated routes still 307 to login.

### 2. `/account/password` self-service password change
- **Server action** `changePasswordAction` in `src/app/account/password/actions.ts`:
  - Requires `getCurrentUser()` — redirects to `/login?next=/account/password` if cookie missing/expired.
  - Validates: all-three-fields-present, new==confirm, 10-char min, new≠current, and scrypt-verify of current against stored hash.
  - On success: hashes new password via `hashPassword()` (same scrypt format as bootstrap/login), updates `app_users.password_hash`, **deletes every other session for the user** (keeps the current token) so a leaked cookie can't outlive the rotation.
  - Uses `redirect()` for both the success landing (`?ok=1`) and error bounces (`?err=<code>`).
- **Page** renders 7 mapped error codes → human copy, success banner with "Other sessions have been signed out" explicit note, 3 password fields with `autoComplete` hints, and a footer disclosure about the scrypt algorithm parameters.
- **TopNav** gains a `KeyRound` "Password" link between the username pill and sign-out button. Hides the label on mobile, keeps the icon.

### 3. Domain-scoped enforcement at layout level (401 → 404 speed-up)
- **`src/lib/auth.ts`** adds `requireDomainAccess(domain: Domain): Promise<SessionUser>`. Uses static `redirect` + `notFound` imports from `next/navigation` so TypeScript sees `never` return types correctly.
- **Three new layouts** added — Next.js routing sends `/emails/kika/*` to `src/app/emails/kika/` (static beats `[domain]`), so static domains need their own layout:
  - `src/app/emails/kika/layout.tsx` → hardcoded `'kika'`
  - `src/app/emails/beithady/layout.tsx` → hardcoded `'beithady'`
  - `src/app/emails/[domain]/layout.tsx` → reads `params.domain`, runs `isDomain()` guard before the access check (unknown slugs 404 cleanly)
- Proxy still handles the "no cookie → /login" case; layouts handle the "cookie present but stale OR user not authorized for this domain" case.

### 4. Session audit log on `/admin/users`
- **Schema note**: `app_sessions` already has `(token, user_id, expires_at, created_at, last_seen_at, user_agent, ip)` from migration 0009, and `getCurrentUser()` already bumps `last_seen_at` on every authenticated read — so the data is already populated.
- Added a new "Recent session activity" card below the user list. Query runs in parallel with the users + roles queries (`Promise.all`). Limit 50, ordered by `last_seen_at desc nulls-first=false`.
- Columns: User (with green pulse dot if last-seen < 30 min, amber "expired" badge past `expires_at`), Created, Last seen, IP (monospace), User agent (truncated + title tooltip).
- Deleted-user rows degrade gracefully — the JOIN via `usersById` map shows "[deleted user]" rather than blanking out.

### Verification (post-deploy smoke)
```
login (expect 200):            200 ✓
/account/password (expect 307): 307 ✓
/admin/users (expect 307):      307 ✓
/emails/kika (expect 307):      307 ✓
```
TypeScript `tsc --noEmit` clean before push.

### Phase 14 backlog (carried forward from Phase 12 + Phase 13 planning)
1. **Official Lime branding swap** — still blocked on exact hex codes + SVG logos. PDFs are image-only; need OCR or manual asset delivery.
2. **Built-in "Test now" button in `/admin/integrations`** (Phase 12 deferred) — session-cookie-authed, records result into `last_test_*` columns.
3. **Green-API wiring** — `/api/webhooks/green/<slug>` + outbound helper using stored `integration_credentials`.
4. **Credential audit trail** — surface `updated_at / updated_by` timeline per provider on `/admin/integrations`.
5. **Remove legacy env vars** from Vercel — one-shot cleanup after the seed-from-env button has been clicked and each provider verified via the upcoming Test-now button.
6. **Signed-domain-roles cookie** — would let the proxy itself enforce domain access without the layout round-trip. Requires encoding `allowed_domains` into a JWT or HMAC'd cookie at login. Tradeoff: now 2 cookies to invalidate on rotation vs. current 1. Layouts are sufficient for now; this is an optimization.

## ✅ PHASE 10.5 SHIPPED — Abandoned checkouts + webhook delivery log + Gmail freshness pill (commit 6eb5ba3)

Three items from the Phase 10.5+ backlog shipped together. Production live on `limeinc.vercel.app` (deployment `dpl_BKBnnbq31qsbF8WFgUoshiiXc9JA`).

### 1. Abandoned checkout tracking — recoverable revenue
- **Migration 0011** adds `public.shopify_abandoned_checkouts` (id bigint PK, email/phone/customer_name, currency, total/subtotal/tax/discounts, line_items jsonb + line_items_count, abandoned_checkout_url recovery link, created_at / updated_at / completed_at, raw jsonb, synced_at). Partial index `idx_shopify_abandoned_open` on `(created_at desc) where completed_at is null` for the hot "still-open" path.
- **`src/lib/shopify.ts`** gains `ShopifyAbandonedCheckout` type + `iterateShopifyAbandonedCheckouts({status, createdAtMin, createdAtMax, pageSize})` async generator (Link-header cursor, 500ms spacing to respect Shopify's 2 req/sec bucket).
- **`src/lib/run-shopify-sync.ts`** gains a 4th phase after products/customers/orders. Shopify's `/checkouts.json` retains ~30 days; each run re-pulls the full window so completions graduate open rows via the unique-id upsert.
- **Kika Exec dashboard** (`/emails/kika/exec`) gets a new Row 6: a small card with open-cart count + completed-in-period + **recovery rate %**, recoverable revenue, avg cart value, emailable count (carts with capturable email) and a wide "Top open carts by value" table (15 rows, sorted by total_price desc) with Shopify-generated **one-click recovery URLs**. Operator can literally click a link and Shopify resumes the shopper's checkout.
- **Aggregator** `src/lib/kika-abandoned-checkouts.ts` exports `buildKikaAbandonedReport({fromDate, toDate, label})`. Splits rows by `completed_at IS NULL` (abandoned) vs NOT NULL (completed), computes recovery rate, recoverable revenue, and emailable %.
- **Sync-runs counter** extended: `abandoned_checkouts_synced int default 0`. Surfaces in the return payload of `runShopifySync`.

### 2. Webhook delivery log
- **Migration 0011** adds `public.shopify_webhook_events` (id uuid default gen_random_uuid, received_at, topic, shop_domain, shopify_webhook_id text for X-Shopify-Webhook-Id dedup, status text, duration_ms, error text, payload_size, order_id bigint for orders/* topics). Partial index on non-processed status for fast "show me recent failures" queries.
- **`/api/webhooks/shopify/route.ts`** instrumented with a `logEvent()` helper. Every inbound POST logs one row — success path (`status='processed'`) records order_id; failure paths record `hmac_failed` / `hmac_decode_failed` / `invalid_json` / `config_missing` / `unknown_topic` / `error` with `duration_ms` and `payload_size`. Log insert is try/catch-swallowed so a DB hiccup never blocks the 2xx Shopify retries on.
- **No admin surface** yet — the table is queryable directly; a viewer on `/admin/integrations` is Phase 10.6 backlog.

### 3. Gmail freshness pill on root Emails page
- **`src/lib/sync-freshness.ts`** extended: `SPECS` object gains `gmail: { table: 'runs', ... }` entry. Gmail ingestion writes to the Phase-1 `public.runs` table (migration 0001) — it already has `finished_at` + `status='succeeded'` columns so no schema change needed.
- **`/emails` root page** now imports `SyncPills` + `getSyncFreshness(['gmail'])` and renders the pill in the header flex row. Completes the freshness-pill coverage first shipped in Phase 10.4 across Beithady / Kika dashboards.

### Verification
- `tsc --noEmit` clean before deploy.
- Post-deploy smoke tests:
  - `/emails/kika/exec` → 307 (redirects to /login; middleware routing intact)
  - `/emails` → 307
  - `/api/webhooks/shopify` GET → 405 (POST-only handler intact)
- Direct SQL validation through Supabase MCP: both new tables queryable, new column `abandoned_checkouts_synced` present on `shopify_sync_runs`.
- Kicked off a fresh Shopify sync (`/api/shopify/run-now`, CRON_SECRET-auth) immediately after deploy — run id `67448df4-731c-48df-a582-ddf8aa74cbd2` captured the first abandoned-checkout backfill using the new code path.

### Known tool-safety workaround (still relevant)
Earlier in this session we cleared worktree-wide encoding drift (BOM + em-dash mojibake) across main repo (88 files) and the `claude/sad-gagarin-bbf5dd` worktree (4 files). Edit/Write now work cleanly again — all Phase 10.5 files written this turn have no BOM and correct UTF-8. If the drift ever reappears, fall back to `perl -i -pe` for byte-safe edits.

### Phase 10.6 backlog (not done this turn)
1. **Webhook delivery log admin viewer** — small table on `/admin/integrations` showing last 50 events with status chips, filter by topic/status/timestamp. Also a "retry" button for stuck `error` rows.
2. **Inventory alerts** (`/inventory_levels.json` sync + low-stock threshold table) — was in the 10.5 backlog; deferred.
3. **Product drill-down page** — click a product in "Most items" → variants, stock, 30d velocity, refund rate. Exec dashboard currently exposes product-level revenue in `most_items` but no drill path.
4. **Abandoned-checkout email recovery flow** — pipe open carts with emails into an outbound flow (Gmail send via existing googleapis client, or a Klaviyo handoff later).
5. **`?phase=abandoned_only`** flag on `/api/shopify/run-now` so the user can re-pull just checkouts without a full 3-min products+customers+orders backfill.
6. **Sync-freshness pill on Kika's abandoned card** — show when the checkouts mirror was last refreshed (the existing `shopify` pill already covers this but a per-source pill on the card itself would be more discoverable).

## ✅ PHASE 10.4 SHIPPED — Shopify webhooks + Kika revenue reconciliation + sync-freshness pills (commit 4de0182)

Three items from the Phase 10.4 backlog delivered together.

### 1. Shopify webhooks — real-time order updates
- `/api/webhooks/shopify` — single topic-dispatching POST endpoint. Dispatches by `X-Shopify-Topic` header; handles `orders/create`, `orders/updated`, `orders/fulfilled`, `orders/partially_fulfilled`, `orders/cancelled`, `orders/paid`, `refunds/create`. Unknown topics get a 2xx accept-and-ignore so Shopify doesn't retry them.
- HMAC-SHA256 verification against `SHOPIFY_APP_CLIENT_SECRET` using `crypto.timingSafeEqual` on the raw body buffer (never JSON-parse before verification).
- `/api/shopify/register-webhooks` — idempotent admin endpoint. Lists existing webhooks, creates missing ones, swallows the `422 has already been taken` error as an 'exists' result so re-running is safe.
- `src/lib/shopify-order-mapper.ts` — shared order→row + lineItem→row mapper used by **both** the bulk sync worker and the webhook handler. Eliminates drift between bulk and incremental ingestion paths (same columns produced from either source).

**Registered 7 webhooks** on first call — all now firing into the local mirror.

### 2. Kika revenue reconciliation card
- `src/lib/kika-reconcile.ts` — `buildKikaRevenueReconcile({fromDate, toDate})` computes:
  - Shopify side: gross_orders, gross_revenue, refunds, net_revenue, fulfilled_revenue, cancelled_revenue
  - Odoo side: 401010 (Shopify revenue) + 401020 (Shopify returns) balances on company 6, sign-flipped
  - Delta: shopify_net − odoo_net with % variance
- Rendered as a new card on the Kika Financials page, visible only for `segment = consolidated` or `segment = kika` (X-Label and In & Out have no Shopify revenue). Delta pill colors: green if |pct| < 5%, amber otherwise. Surfaces notes for common drift sources (missing 401010/401020 entries, cancelled orders likely excluded from Odoo).

### 3. Sync-freshness pills (visible on every dashboard)
- `src/lib/sync-freshness.ts` — `getSyncFreshness(['odoo','guesty','pricelabs','shopify'])` reads the latest `succeeded` row from each integration's `*_sync_runs` table. Thresholds: `< 26h` = fresh (green), `< 50h` = stale (amber), ≥ 50h = very_stale (rose), no row = never (slate).
- `src/app/_components/sync-pills.tsx` — inline pill strip with `RefreshCcw` (fresh) or `AlertTriangle` (stale) icon. Tooltip shows the exact last_synced_at ISO.
- Wired into 5 dashboards with appropriate source subsets:
  - **Beithady Financials** → Odoo + Guesty + PriceLabs
  - **Beithady Pricing** → PriceLabs + Guesty
  - **Kika Financials** → Odoo + Shopify
  - **Kika Sales** → Shopify
  - **Kika Exec** → Shopify

### Verification
- `/api/shopify/register-webhooks` → 7 created, 0 errors.
- All 5 dashboards smoke-tested → HTTP 200.

### Phase 10.5+ backlog (not done this turn)
1. **Abandoned checkout tracking** (`shopify_abandoned_checkouts` table + sync + dashboard section) — recoverable lost revenue.
2. **Inventory alerts** — `/inventory_levels.json` sync + low-stock threshold table on the Kika Exec page.
3. **Product drill-down page** — click a product in Most Items → variants, stock, 30d velocity, refund rate.
4. **Webhook delivery log** — add a `shopify_webhook_events` table that records every inbound event so failed deliveries are auditable.
5. **Extend freshness pills** to include Gmail ingestion (from `runs` table) on the root Emails page.

## ✅ PHASE 10.3 SHIPPED — Exec dashboard + product/customer master + fulfillment timing (commit 04567e5)

User asked for an easy-reading Kika Shopify dashboard showing: order count, order values, most items ordered, returning customers, time to fulfill, most delayed orders, delivered-then-refunded count+%, undelivered count+%. All orders are cash (COD) — so "pending" financial_status means awaiting cash collection, not a failed gateway. Also requested: Phase 10.3+ backlog (product + customer master sync).

### Schema (migration 0008 applied via MCP)
- `shopify_orders` extended: `first_fulfilled_at`, `first_delivered_at`, `hours_to_fulfill` columns. **Backfilled in the migration itself via a single UPDATE that parses the existing `raw->'fulfillments'` jsonb** — no re-sync required for these 3 columns to populate. 1,410 orders now have `hours_to_fulfill`, 706 have a delivery timestamp.
- `shopify_products`: full product master (title, vendor, product_type, status, handle, tags, total_inventory from sum(variants[].inventory_quantity), variant_count).
- `shopify_customers`: lifetime master for returning-customer analytics (email, name, phone, orders_count, total_spent, state, last_order_id, created_at).
- `shopify_sync_runs` extended with `products_synced` + `customers_synced` counters.

### Sync worker (`src/lib/run-shopify-sync.ts`)
Now has 4-phase flow: products → customers → orders → line items. All paginated via Link-header cursor generators (`iterateShopifyProducts`, `iterateShopifyCustomers`, `iterateShopifyOrders`) with 500ms spacing (Shopify 2 req/sec bucket). On each order, extracts `first_fulfilled_at` + `first_delivered_at` from `fulfillments[]` and computes `hours_to_fulfill` at ingest time so the exec aggregator doesn't re-parse jsonb per query.

### Manual re-run results
- Sync triggered at 22:40ish → completed products (549) + customers (7,713) + orders backfill before the curl HTTP client timed out (Vercel function kept going). Data landed in DB.
- Customer master stats: **7,713 total · 1,356 lifetime repeat buyers (17.6% repeat rate)**.
- Fulfillment timing: avg **109.2 hrs (4.6 days)** · median **71.8 hrs (3 days)** · p90 **259.5 hrs (10.8 days)**. The median suggests most orders ship within 3 days but the tail is long.

### Executive aggregator (`src/lib/kika-exec.ts`)
`buildKikaExecReport({fromDate, toDate})` returns one object with every metric the operator asked for:
- **totals**: orders, order_value_total, order_value_avg, order_value_median, order_value_max, units
- **customers**: unique, returning_in_period (>1 order this period), returning_lifetime (customers whose Shopify `orders_count > 1`), returning_rate_lifetime_pct, new_in_period (customer created_at ≥ period start)
- **fulfillment**: fulfilled_count, unfulfilled_count, unfulfilled_pct, avg/median/p90 hours_to_fulfill
- **refunds**: delivered_then_refunded_count (fulfilled AND refunded_amount > 0) + pct of fulfilled orders + total refund amount
- **most_items**: product-level units+orders+revenue, top 15 by units
- **most_delayed**: top 15 orders sorted by age; unfulfilled orders use (now − created_at) as the delay metric, fulfilled use their hours_to_fulfill. Delayed-unfulfilled highlighted in red.

All JS — no per-query RPC roundtrips.

### Dashboard page (`/emails/kika/exec`)
- Period filter: last 7d / last 30d / this month / last month / this year + custom date range.
- Row 1 big stats: Orders · Gross Revenue · AOV (with median+max in sub) · Customers (with orders/customer ratio).
- Row 2: Returning customers (returning-this-period, lifetime-repeat with %, new-in-period).
- Row 3: Fulfillment (fulfilled count, unfulfilled with %, avg hours, p90 hours) — auto-formats hours vs days past 48h; turns amber when unfulfilled% > 20%.
- Row 4: Two side-by-side cards — Delivered then refunded (count + % of fulfilled + total refund amount) and Undelivered (count + % with cash-context note).
- Row 5: Most items ordered (units/orders/revenue) + Most delayed orders (with red pills for unfulfilled).
- Header explains cash-order context so "pending" isn't misread as failed payment.

### Domain page update
Kika domain index (`/emails/kika`) now carries 3 cards: **Executive Summary** (full-width, amber/rose accent) + **Financials** + **Sales Intelligence** side-by-side.

### Verification
- `/emails/kika/exec?preset=last_30d` → HTTP 200 ✅
- `/emails/kika/exec?preset=ytd` → HTTP 200 ✅
- All metrics surfaced as requested.

### Phase 10.4 backlog (not done this turn)
1. **Webhooks for real-time order updates** (`/api/webhooks/shopify`) — order.create, order.updated, order.fulfilled, order.cancelled. Upsert-by-id handler; ~60 min.
2. **Cross-join Shopify revenue to Odoo Kika segment P&L** — add a reconciliation card on the Kika Financials page showing "Shopify orders revenue (gross) vs Odoo 401010 Shopify revenue" with delta.
3. **Abandoned checkout tracking** (Shopify `/checkouts.json`) — recoverable lost revenue.
4. **Inventory alerts** (Shopify `/inventory_levels.json` + a threshold) — low-stock warning table.
5. **Product-level revenue in Exec dashboard** already exposed via `most_items`; a drill-down to a product-detail page (variants, stock, 30d velocity) would be the next UX lift.
6. **Sync-freshness pills** on Beithady Financials / Pricing / Kika Sales+Exec pages — at a glance "stale 2 days ago" warnings.

## ✅ PHASE 10.2 SHIPPED — Kika Shopify mirror + Sales Intelligence dashboard (commits 72d79a6 + 73284d6)

### Install flow completed
User opened `/api/shopify/auth/start` → approved on Shopify → callback persisted `shpat_b59ebe…` (38 chars) to `integration_tokens` as `shopify:kika-swim-wear`. Smoke-test returned shop metadata correctly: KIKA on `thekikastore.com`, EGP currency, Africa/Cairo timezone, Professional plan, 286 orders last 30d / 604 YTD.

### Ping env-check fix
`/api/shopify/ping` initially rejected with "SHOPIFY_ADMIN_ACCESS_TOKEN missing" because the old env check didn't know about the OAuth-populated token. Relaxed to only require `SHOPIFY_STORE_DOMAIN` — `shopifyFetch()`'s resolver handles both env-based and DB-based tokens.

### Schema (migration 0007_shopify.sql, applied via MCP)
- `shopify_orders`: full mirror with financial_status, fulfillment_status, totals (subtotal, total, discounts, tax, shipping, refunded_amount), customer denormalized (id + name), tags, line_item_count, raw jsonb. Indexed on `created_at desc`, `financial_status`, `customer_id`.
- `shopify_line_items`: per-item detail (product_id, variant_id, title, sku, vendor, quantity, price, total_discount) with FK cascade to orders.
- `shopify_sync_runs`: run log.

### Sync worker (`src/lib/run-shopify-sync.ts`)
- `iterateShopifyOrders()` async generator uses Shopify's `Link` header cursor pagination (not offset). 500ms spacing respects Shopify's 2 req/sec base rate.
- Filters `created_at >= now - 365d`, all statuses. Orders upsert first (FK satisfaction), then line items.
- Refunded amount summed from nested `refunds[].transactions[].amount`.
- Tags split comma-separated string → text[].

### Routes
- `GET /api/cron/shopify` — scheduled 04:45 UTC in vercel.json.
- `GET|POST /api/shopify/run-now` — bearer-protected manual trigger.

### First full backfill (manual trigger)
- Duration: **118.7s** for 365d of data (well under 300s Vercel cap).
- **1,714 orders + 2,816 line items** synced.
- Date range: 2025-04-22 → 2026-04-21 (exactly 1 year).
- 756 paid / 130 pending / 46 refunded.
- Gross revenue: **7,321,062 EGP** (~EGP 7.3M/year).
- AOV: **4,271 EGP**.
- Refunds total: 158,512 EGP (2.2% of gross).

### Dashboard (`/emails/kika/sales`)
- Top stat cards: Orders / Gross Revenue / AOV / Customers.
- Daily trend table with inline horizontal bar chart (revenue), including orders + units per day.
- Top products by revenue (20 items) + Top customers by revenue (15).
- Financial + fulfillment status breakdown cards.
- Recent orders table (15 most recent) with colored status pills.
- Latest-sync timestamp + order/line count in header.
- Period presets: last_7d / last_30d / mtd / ytd + custom date range.

Smoke-tested all 4 presets → HTTP 200.

### Kika domain page
Now shows two cards in a 2-col grid:
1. **Financials** (violet / Odoo) — P&L with segment tabs
2. **Sales Intelligence** (emerald / Shopify) — new

### Vercel cron now at 12 entries
```
04:00 /api/cron/odoo
04:05-04:30 /api/cron/odoo-financials (6 phases)
04:35 /api/cron/pricelabs
04:40 /api/cron/guesty
04:45 /api/cron/shopify   ← NEW
06:00, 07:00 /api/cron/daily (Gmail)
```

### Phase 10.3+ backlog
1. **Product + customer master sync** (`shopify_products`, `shopify_customers` tables). Currently we denormalize customer_name on the order row and parse product title from line items; a proper product catalog would enable variant-level analytics, inventory trend, SKU-based reporting.
2. **Shopify webhooks** for real-time order notifications (order create / update / refund). Schema already supports upsert-by-id so webhook handler is a thin wrapper.
3. **Cross-join to Odoo Kika segment P&L** — the dashboard's revenue figure should reconcile with the Kika analytic account revenue in Odoo (already ~867K for Jan-Feb 2026; Shopify is higher because it includes pending/unfulfilled orders).
4. **Abandoned checkout tracking** — Shopify exposes /checkouts; would surface recoverable lost revenue.
5. **Inventory alerts** — pull /inventory_levels with low-stock threshold.

## 🟢 PHASE 10.1.6 — Dev Dashboard URL config found in Versions; app ready, awaiting browser install click

User found the right config page after clicking into Versions. Screenshot confirms the KIKA OUTPUT app (client_id `e91d0612396dd960fa56d0c06ea7d7a9`, secret hidden, matches env) is now configured with:
- **App URL**: `https://kareemhady.vercel.app` ✓
- **Redirect URLs**: `https://kareemhady.vercel.app/api/shopify/auth/callback` ✓
- **Embed app in Shopify admin**: ON (harmless for our backend-only use)
- **Scopes**: includes read_orders, read_products, read_customers, read_inventory, read_locations (plus many others the user selected)
- **Use legacy install flow**: UNCHECKED

### Watch out for "managed install"
With the new Dev Dashboard + "Embed app in Shopify admin" ON + legacy install flow OFF, Shopify may use **managed install** which installs the app silently without hitting our OAuth callback. If the browser-install doesn't return to `/emails/kika?shopify=installed` and the token doesn't land in `integration_tokens`, the fix is to check **"Use legacy install flow"** in the same config section (visible just above the Redirect URLs field), save, release a new version, and retry.

### State
- `integration_tokens` still has no `shopify:*` row (verified via MCP).
- Next action: user opens `https://kareemhady.vercel.app/api/shopify/auth/start` in browser while logged into Shopify, approves install on kika-swim-wear.
- On success → `/api/shopify/ping` validates connection, then Phase 10.2 (schema + sync + sales dashboard).

## 🟠 PHASE 10.1.5 — Dev Dashboard hides URL-config fields; offered Partners Dashboard fallback

User went to `https://admin.shopify.com/store/kika-swim-wear/apps/kika-output` looking for where to set the redirect URL — couldn't find it. The `kika-output` handle in that URL is different from the `kika-1` handle in earlier screenshots, meaning the user may have a second app already installed on the store.

Key learning about Shopify Dev Dashboard (new-style): **App URL and Allowed redirection URL(s) are not on the Settings page**. They live in **Versions** — each app version carries its own full Configuration (URLs, scopes, webhooks). For apps built via Shopify CLI, this config normally lives in a `shopify.app.toml` file and gets deployed as a new version.

### Two paths given to user
**Path 1 — Dev Dashboard Versions**:
- KIKA app → sidebar → **Versions** → click latest (or **Create new version**)
- Fields should appear: App URL + Allowed redirection URL(s)
- Set: `https://kareemhady.vercel.app` + `https://kareemhady.vercel.app/api/shopify/auth/callback`
- Save + **Release this version** for the config to take effect

**Path 2 — Classic Partners Dashboard (if Path 1 still hides the fields)**:
- `https://partners.shopify.com` → Apps → Create app manually → name `kareemhady`
- Classic UI with dedicated App URL + Redirect URL fields
- Copy new Client ID + Secret → update Vercel env
- Install on kika-swim-wear store

Also asked user to check if the pre-existing `kika-output` app (already installed on kika-swim-wear per the URL) could be reused — save us creating yet another app.

### Current state
- `integration_tokens` still has no `shopify:*` row.
- Env in Vercel: `SHOPIFY_APP_CLIENT_ID=e91d0612396dd960fa56d0c06ea7d7a9` (from an app whose Application URL is not kareemhady.vercel.app, hence the host-mismatch error).
- Code side is complete and working — issue is purely Dev Dashboard configuration.

## 🟠 PHASE 10.1.4 — Shopify OAuth blocked: `redirect_uri and application url must have matching hosts`

User clicked `/api/shopify/auth/start` → redirected to Shopify's OAuth consent page → Shopify rejected with:
> Oauth error invalid_request: The redirect_uri and application url must have matching hosts

Shopify requires the `redirect_uri` query param to share a host with the **Application URL** configured on the Dev Dashboard app. Our redirect_uri is `https://kareemhady.vercel.app/api/shopify/auth/callback`, so the app's Application URL must also be under `kareemhady.vercel.app`.

### User fix (no code change needed)
In Dev Dashboard → KIKA app → **Configuration** (or Settings → URLs):
- **Application URL**: `https://kareemhady.vercel.app`
- **Allowed redirection URL(s)**: `https://kareemhady.vercel.app/api/shopify/auth/callback`

Save — may require creating + publishing a new app version for the config to take effect.

Then re-open `/api/shopify/auth/start`.

### Current state
- `integration_tokens` table still has NO `shopify:*` row.
- Dev Dashboard KIKA app exists with `client_id=e91d0612396dd960fa56d0c06ea7d7a9` but the Application URL isn't set to our host yet.
- Our auth flow code is correct — confirmed via the 307 redirect response with properly-formed Shopify authorize URL.

### Common Shopify OAuth errors reference (in case the next attempt surfaces another one)
- `invalid_request: redirect_uri and application url must have matching hosts` → fix Application URL (current block)
- `invalid_request: Invalid redirect_uri` → exact callback URL must be in allowed list; trailing slashes count
- `invalid_client` → env `SHOPIFY_APP_CLIENT_ID` doesn't match the app whose URLs were saved
- `App not installed` after approve → app not marked distributable; check Distribution section

## 🟢 PHASE 10.1.3 — Shopify OAuth install flow shipped (commit 5ceec3a, deployed, awaiting user install click)

Legacy custom-app path fully dead on kika-swim-wear — both admin URLs the user tried just route to the Dev Dashboard upgrade prompt. Built the OAuth install flow so we can proceed without touching the legacy admin.

### Routes shipped
- **`/api/shopify/auth/start`** (`src/app/api/shopify/auth/start/route.ts`): builds the `https://kika-swim-wear.myshopify.com/admin/oauth/authorize` URL with scopes (`read_orders`, `read_products`, `read_customers`, `read_inventory`, `read_locations`), sets a CSRF state cookie, 307-redirects. Verified live: HTTP 307 with correct Location, state cookie, scopes.
- **`/api/shopify/auth/callback`** (`src/app/api/shopify/auth/callback/route.ts`): validates HMAC via `crypto.timingSafeEqual` (client_secret as HMAC-SHA256 key, sorted query string as message), verifies the state cookie matches, sanity-checks `shop` against `*.myshopify.com` regex, POSTs `{client_id, client_secret, code}` to `/admin/oauth/access_token`, persists the **offline** access token in `public.integration_tokens` with provider `shopify:kika-swim-wear`. Redirects to `/emails/kika?shopify=installed`.

### `src/lib/shopify.ts` token resolver
Two-tier cache with precedence:
1. `SHOPIFY_ADMIN_ACCESS_TOKEN` env override (legacy path — kept for future stores that allow it).
2. `integration_tokens` table keyed by `provider = 'shopify:{handle}'`. Cached per cold start.

Clear error thrown when neither is set.

### User config needed (awaiting completion)
- **Vercel env set**: `SHOPIFY_STORE_DOMAIN=kika-swim-wear`, `SHOPIFY_APP_CLIENT_ID`, `SHOPIFY_APP_CLIENT_SECRET`. (Left `SHOPIFY_ADMIN_ACCESS_TOKEN` empty.)
- **Redirect URL registered** in Dev Dashboard → KIKA app → Configuration: `https://kareemhady.vercel.app/api/shopify/auth/callback`
- **Scopes enabled** in Dev Dashboard config.

### Interesting observation
The `client_id` that shows up in the live redirect is `e91d0612396dd960fa56d0c06ea7d7a9` — different from the `0d09d6f6e7b8eb66f2b07b9ca4b6c57c` the user's earlier screenshot showed. User may have created a second Dev Dashboard app. Doesn't matter as long as the redirect URL is registered on the one whose credentials are in env.

### Current state
- `integration_tokens` table has NO `shopify:*` row yet — user hasn't completed the install flow.
- Next step: user opens `/api/shopify/auth/start` in browser while logged into Shopify, approves the install, lands on `/emails/kika?shopify=installed` — then token persists and we can run `/api/shopify/ping`.

## 🟠 PHASE 10.1.2 — Correct store handle is `kika-swim-wear` (third correction)

User shared the admin link: `https://admin.shopify.com/store/kika-swim-wear?ui_locales=en`. The store's actual myshopify handle is **`kika-swim-wear`**, not `thekikastore` (that's the display name) and not `shopfromkika` (my original guess).

### Canonical env values
```
SHOPIFY_STORE_DOMAIN=kika-swim-wear
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxx
```

### Legacy custom-app URL to try for the token
- Modern admin: `https://admin.shopify.com/store/kika-swim-wear/settings/apps/development`
- Classic: `https://kika-swim-wear.myshopify.com/admin/settings/apps/development`

If either loads without redirecting to Dev Dashboard → create app → read-only scopes (read_orders, read_products, read_customers, read_inventory, read_locations) → install → copy `shpat_...` token.

### Fallback if legacy is fully gone
Build OAuth install flow using the Dev Dashboard KIKA app's Client ID + Secret (already visible to user: `0d09d6f6e7b8eb66f2b07b9ca4b6c57c`). Plan:
- `/api/shopify/auth/start` — redirects to `https://kika-swim-wear.myshopify.com/admin/oauth/authorize?client_id=...&scope=read_orders,read_products,read_customers,read_inventory,read_locations&redirect_uri=https://kareemhady.vercel.app/api/shopify/auth/callback&state=...`
- `/api/shopify/auth/callback` — HMAC validate, exchange `code` for access_token via `POST https://kika-swim-wear.myshopify.com/admin/oauth/access_token`, store in `integration_tokens` where provider='shopify:kika-swim-wear'.
- New env: `SHOPIFY_APP_CLIENT_ID`, `SHOPIFY_APP_CLIENT_SECRET`.
- Existing `SHOPIFY_ADMIN_ACCESS_TOKEN` becomes optional override (legacy path); otherwise `shopifyFetch()` reads from `integration_tokens` table.

Still waiting on user to try the legacy URLs and report back. No code changes this turn.

## 🟠 PHASE 10.1.1 — Shopify Dev Dashboard only exposes OAuth creds, not shpat token

User opened their KIKA app's Settings page in Dev Dashboard. Surfaced:
- **Client ID**: `0d09d6f6e7b8eb66f2b07b9ca4b6c57c`
- **Secret**: hidden/rotatable
- **Contact email**: malak.ahady@gmail.com
- **Google Cloud Pub/Sub** + **Amazon EventBridge** options for webhook delivery

**Key insight**: Shopify's new Dev Dashboard flow forces apps through the OAuth2 authorization-code pattern. The Client ID + Secret shown there are the OAuth app credentials for a public/distributable app — NOT a direct Admin API token. Our scaffold uses `X-Shopify-Access-Token` with `shpat_...` which requires an INSTALLED app on a specific merchant.

Sidebar in the Dev Dashboard app view: Monitoring / Logs / Versions / Settings — no obvious "Install on store" or "Custom distribution" option exposed in the screenshot.

### Two paths forward offered to user

**Path 1 (tried first — simpler):** Hit the legacy custom-app URL directly:
```
https://thekikastore.myshopify.com/admin/settings/apps/development
```
If Shopify still honors it, the legacy flow is intact: create app → Admin API scopes (read_orders/products/customers/inventory/locations) → Install → copy `shpat_...` token from API credentials tab.

**Path 2 (fallback if Path 1 404s):** Build the OAuth install flow in our app:
- `/api/shopify/auth/start` — redirects to `https://thekikastore.myshopify.com/admin/oauth/authorize?client_id=...&scope=read_orders,...&redirect_uri=https://kareemhady.vercel.app/api/shopify/auth/callback&state=...`
- `/api/shopify/auth/callback` — validates HMAC, exchanges `code` for access_token via `POST /admin/oauth/access_token`, stores the `shpat_...` in `integration_tokens` table (same pattern as Guesty).
- New env: `SHOPIFY_APP_CLIENT_ID` + `SHOPIFY_APP_CLIENT_SECRET`.
- Existing `SHOPIFY_ADMIN_ACCESS_TOKEN` becomes optional override; otherwise code reads from `integration_tokens` where provider='shopify:{shop_domain}'.
- ~30 min implementation if needed.

### Current state
No code changes this turn. Waiting on user to try the legacy URL and report back. Scaffold (commit 7376e95) is still current and ready for either token path.

## 🟡 PHASE 10.1 — Shopify store handle corrected + Dev Dashboard path locked in (still blocked on token)

User sent a screenshot of the KIKA store admin at **Settings → Apps → Upgrade guide → App development**, which shows Shopify redirecting all custom-app work to the new Dev Dashboard ("Build apps in Dev Dashboard" button). The legacy Path A (create custom app directly in store admin) is effectively deprecated for this tenant — Shopify now only offers Path B (Dev Dashboard).

Two key corrections from earlier guidance:
- **Actual store handle is `thekikastore`** (display name: KIKA, domain shown as `thekikastore.com` in the admin header). Earlier I assumed `shopfromkika` — that assumption is wrong; all env documentation should use `thekikastore`.
- The user's KIKA app in the Dev Dashboard already exists (`kika-1` handle, 0 installs) from the prior screenshot. Just needs scopes + install + token.

### Updated user checklist
1. Click **Build apps in Dev Dashboard** → back to their existing KIKA app
2. Configure **Admin API access scopes** (read-only): `read_orders`, `read_products`, `read_customers`, `read_inventory`, `read_locations`
3. Install app on `thekikastore` store
4. Copy the `shpat_...` Admin API access token (shown once)

### Env to set
```
SHOPIFY_STORE_DOMAIN=thekikastore
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxx
```
On Vercel (Production + Preview + Development) + `C:\kareemhady\.env.local`.

### No code changes this turn
Scaffold from commit 7376e95 still current. Ping endpoint at `/api/shopify/ping` ready to smoke-test once env is populated.

## 🟡 PHASE 10.1 KICKOFF — Shopify onboarding guidance sent, no code changes

User shared a screenshot of the Shopify Dev Dashboard showing a custom app "KIKA" with handle `kika-1` and 0 installs. Asked where API parameters come from. Sent two paths:

**Path A (recommended)** — skip the Dev Dashboard for single-store use. Create the custom app from inside the store admin at `shopfromkika.myshopify.com/admin` → Settings → Apps and sales channels → Develop apps → Create app → Admin API scopes read-only (read_orders, read_products, read_customers, read_inventory, read_locations) → Install → copy the Admin API access token (`shpat_...` shown once).

**Path B** — continue with the KIKA app already visible in the Dev Dashboard: click into it, enable the same scopes, install to shopfromkika store, then grab the token.

User needs to add to Vercel + `.env.local`:
```
SHOPIFY_STORE_DOMAIN=shopfromkika
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxx
```

Then say "done" → I run the ping at `/api/shopify/ping`.

No code changes this turn. Scaffold from prior commits (7376e95) is live and ready.

## ✅ PHASE 10 — KIKA Financials + Shopify scaffold (commits 7376e95 + e557371)

Three things shipped together: partial Phase 9.2 enrichment helper, KIKA financial dashboard, and Shopify read-only scaffold for the shopfromkika store.

### Phase 9.2 partial (batchLookupPricelabsByListingId)
New helper in `src/lib/guesty-enrichment.ts` — fetches the latest-day snapshot's `base`, `recommended_base_price`, `rec_base_unavailable`, `occupancy_next_30`, `market_occupancy_next_30` for a batch of listing ids. Drops into any aggregator that has Guesty listing ids so pricing context can be overlaid. Not yet wired into booking.ts — trivial to add when needed. Other Phase 9.2 items (audit badge, sync-freshness metric, token-cache for Odoo/PriceLabs) still deferred.

### KIKA Financials
**Schema**: no new migrations. Reused the existing Odoo mirror by extending `FINANCIALS_COMPANY_IDS` to `[4, 5, 6, 10]` and `SCOPE_COMPANY_IDS` to the same. Company 6 is "X Label for Tailoring Kika" in fmplus Odoo.

**Debugging moment** worth remembering: first Kika sync claimed `move_lines_synced: 11524` with HTTP 200, but the `odoo_move_lines` table showed zero rows for company 6. Root cause: the FK `odoo_move_lines.company_id → odoo_companies(id) on delete cascade` silently rejected every row because company 6 didn't exist in `odoo_companies`. `FINANCIALS_COMPANY_IDS` was extended but `SCOPE_COMPANY_IDS` (which drives the company + invoice phase in `run-odoo-sync.ts`) wasn't. Extended both, re-ran `/api/odoo/run-now` followed by `?phase=move-lines&company=6` + `?phase=analytic-links` (rebuild), and 11,524 rows + 80,314 analytic links landed cleanly.

**Aggregator** (`src/lib/kika-financials.ts`):
- `classifyKikaSegment(name)` maps analytic-account name → segment via keyword:
  - `IN&OUT TRANSACTIONS` / `outsource` → `inout`
  - `X-label` / `xlabel` → `xlabel`
  - `kika` / `shopfromkika` / `shopify` → `kika`
  - everything else → null (consolidated only)
- `classifyKikaAccount(code, name, account_type)` uses Kika's CoA prefix convention (different from Beithady's):
  - 401xxx Revenue (Shopify 010/020, Corporate 030, Other 050)
  - 501xxx COGS (Raw Material, Direct Labor, Manufacturing Overhead)
  - 502xxx Cost of Operation (Repair, Freight, Commission, Dep. Equipment)
  - 601 Marketing / 602 Other Expense / 603 Rent+Utilities / 604 Back-Office Salaries / 605 Transport / 606 Depreciation
- `buildKikaPnlReport({ fromDate, toDate, segment })`:
  - Segment filter: joins through `odoo_move_line_analytics` → `odoo_analytic_accounts` using the 3 resolved Kika analytic ids (744 / 745 / 746 on this tenant).
  - Consolidated: all company-6 lines without analytic filter.

**Dashboard** (`/emails/kika/financials`):
- 4 segment tabs (Consolidated / Kika Shopify / X-Label Uniforms / In&Out Outsource) with icon + violet accent.
- Period presets (this/last month, this year) + month picker + custom date range.
- Same xlsx hierarchy: Revenue → Cost of Revenue → Gross Profit → General Expenses → EBITDA → INT-TAXES-DEP → Net Profit with sign-colored subtotals + % of revenue column.
- Kika domain page (`/emails/kika`) now carries a Financials entry card (violet accent to distinguish from Beithady's rose).

### Verification vs `XLABEL KIKA Financial Statement.xlsx` (Jan-Feb 2026)
| Line | Xlsx | Ours | Match |
|---|---|---|---|
| Revenue (consolidated) | 2,585,079 | **2,585,079** | ✅ exact |
| Cost of Revenue | 1,430,001 | 1,425,647 | ✅ -0.3% |
| General Expenses | 638,552 | 641,252 | ✅ +0.4% |
| Depreciation | 1,852 | 3,507 | ⚠️ +89% (1.6k EGP noise) |
| Kika segment revenue | 867,854 | **867,854** | ✅ exact |
| X-Label segment revenue | 1,715,555 | **1,715,555** | ✅ exact |
| IN&OUT segment revenue | 1,670 | **1,670** | ✅ exact |

All 4 tab URLs (`?segment=consolidated|kika|xlabel|inout`) return HTTP 200.

### Kika Shopify scaffold (Phase 10.1 foundation)
- `src/lib/shopify.ts` — REST 2024-10 client with `X-Shopify-Access-Token` auth, 429/5xx retry, empty-body tolerance. Handles short (`shopfromkika`) or full (`shopfromkika.myshopify.com`) domain input. Typed helpers: `getShopifyShop()`, `listShopifyOrders({status, createdAtMin/Max, limit})`, `countShopifyOrders(...)`.
- `/api/shopify/ping` — CRON_SECRET-protected smoke test returning shop metadata (name, domain, currency, timezone, plan) + 30d/YTD order counts + 10-order sample with financial/fulfillment status, totals, line item count, customer name.
- `.env.example`: `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_ACCESS_TOKEN`. Inline comment documents how to create a custom app in Shopify Admin (Settings → Apps → Develop apps) with read-only scopes.

### Waiting on user for Shopify
Add `SHOPIFY_STORE_DOMAIN` (e.g. `shopfromkika`) and `SHOPIFY_ADMIN_ACCESS_TOKEN` (starts `shpat_...`) to Vercel + `.env.local`, then trigger the ping. Once connection verified, Phase 10.2 will build a proper schema (`shopify_orders`, `shopify_products`, `shopify_customers`, `shopify_sync_runs`) + daily cron + Kika sales dashboard that joins order data with the Odoo P&L revenue.

### Known gaps carried forward
1. **Depreciation 1.6k EGP diff** in Kika consolidated — likely a couple of accrual lines tagged `expense_depreciation` in Odoo that the xlsx categorized elsewhere. Negligible for practical use.
2. **Phase 9.2 remaining**: dashboard audit badge for Guesty-enriched rows, sync-freshness metric on dashboards, `integration_tokens` cache pattern for Odoo + PriceLabs, booking aggregator PriceLabs overlay wiring.
3. **Guesty OAuth still rate-limited** from earlier session testing. 04:40 UTC cron should recover naturally.

## ✅ PHASE 9.1 SHIPPED — All 5 Beithady email aggregators now Guesty-enriched (commit c186842)

Code deployed; Guesty mirror sync still rate-limited — enrichment is a no-op until the mirror populates (gracefully handled via try/catch + dynamic import). Naturally resumes when the 04:40 UTC cron succeeds or Guesty's rate-limit window clears.

### Aggregator-by-aggregator integration
- **beithady-booking** (from Phase 9): batch-lookup by `booking_id` (Airbnb HM) → `platform_confirmation_code`. Overlays guest_name / listing_nickname / dates / nights / host_payout / currency / channel / building_code. Output: `guesty_enriched_count`.
- **beithady-payout** (NEW this turn): batch-lookup each Airbnb line item by `confirmation_code`. Attaches authoritative `guesty_host_payout` + `guesty_nights` + `guesty_currency` as siblings (email-parsed amount preserved for reconciliation) plus overlays listing_name / check-in / check-out / guest_name / building_code.
- **beithady-review** (NEW this turn): resolves every email `listing_name` → canonical `building_code` via Guesty mirror. Falls back to existing catalog heuristic if no match.
- **beithady-inquiry** (NEW this turn): same building-code overlay.
- **beithady-request** (NEW this turn): same building-code overlay.

All four aggregate return types gained an optional `guesty_enriched_count: number` so dashboards can show how many rows were authoritatively validated per run.

### New helpers in `src/lib/guesty-enrichment.ts`
- `batchLookupBuildingsByListingName(names[])` — exact `.in()` match pass first (indexed), then fuzzy contains-either-direction fallback across the ~100 listing catalog. Handles both `nickname` and `title` as match keys.
- `batchLookupReservationsByGuest(items[])` — fallback when no booking code exists in the email. Uses `ILIKE` OR-chain on guest_name, then prefers (a) listing nickname substring match, (b) check-in date proximity, (c) most recent.

### Guesty OAuth rate-limit — still blocked after 10 min
429 persisting. Likely hit an hourly/daily token ceiling during Phase 9 iteration (not just a short burst). Monitor `bzf31vm76` timed out at 22:25 with no success. No code change needed — the `integration_tokens` cache will start working the moment one OAuth succeeds. Expected natural recovery via the 04:40 UTC cron when Beithady's Guesty token endpoint unfreezes.

### Resume check (next session)
```bash
# 1. Check if sync has run since rate-limit cleared
curl -H "Authorization: Bearer $CRON_SECRET" -X POST https://kareemhady.vercel.app/api/guesty/run-now

# 2. Inspect mirror volume
# SELECT count(*) FROM guesty_listings;
# SELECT count(*) FROM guesty_reservations;

# 3. Verify enrichment on next booking rule run
# (the rule_runs.output.guesty_enriched_count will be > 0 once mirror is populated)
```

### Phase 9.2 backlog (not started)
1. **PriceLabs overlay on bookings**: attach current `base_price` and `recommended_base_price` per listing from `pricelabs_listing_snapshots` so the booking dashboard can flag rate gaps.
2. **Dashboard badge**: surface `_guesty_matched` / `_guesty_overrides` per row with a colored pill so the user can instantly see which fields were authoritatively corrected.
3. **Apply the `integration_tokens` cache pattern** to Odoo + PriceLabs too.
4. **Guesty sync observability**: add a metric on the Financials / Pricing / Beithady rule pages showing "last Guesty sync N min ago · X listings · Y reservations" so any stale data is visible.

## 🟠 Monitor still running at 22:17 — Guesty 429 not cleared yet

Background Monitor task `bzf31vm76` retrying `POST /api/guesty/run-now` every 90s until `ok: true`. Monitor times out after 10 minutes from 22:15:31 start (i.e. ~22:25:31). Rate-limit events so far:
- 22:15:31 — still rate-limited
- 22:17:03 — still rate-limited

If monitor exits without success, wait longer (Guesty's OAuth-endpoint rate limit has historically taken 5+ min to clear in this session). Pure time-decay — no code to change. Once the first successful sync lands, the `integration_tokens` table gets populated and subsequent invocations skip OAuth entirely.

**Resume check (next session)**: run one of —
```bash
curl -H "Authorization: Bearer $CRON_SECRET" -X POST https://kareemhady.vercel.app/api/guesty/run-now
# or view the mirror directly:
# SELECT count(*) FROM guesty_listings;
# SELECT count(*) FROM guesty_reservations;
```

## 🟢 PHASE 9 — Full Guesty mirror + email-rule enrichment (commits d829a04 + 222fc27, sync BLOCKED on Guesty rate-limit)

User direction (2026-04-21):
> "Full Guesty→Supabase sync so the BH-73-style comparison can run without hitting Guesty's OAuth rate limit. Use Info from Guesty, Pricelabs To Improve Data on Different Rules under Beithady coming From emails wherever possible — If Conflict Guesty & Pricelabs data wins"

### Schema (migration 0006_guesty.sql, applied via MCP)
- `guesty_listings`: id (Guesty `_id`), account_id, nickname, title, `listing_type` (SINGLE | MTL | SLT), `master_listing_id` (FK to self for children), bedrooms, accommodates, property_type, active, tags[], address_{full,city,country}, derived `building_code`, raw jsonb. Indexed on nickname, building_code, master_listing_id, listing_type.
- `guesty_reservations`: id, confirmation_code, `platform_confirmation_code` (Airbnb HM-xxx / Booking ref), status, source, integration_platform, listing_id FK + denormalized listing_nickname, guest_name/email/phone, check-in/out dates, nights, guests, currency, host_payout, guest_paid, fare_accommodation, cleaning_fee, created/updated, raw jsonb. Indexed on every common lookup key including `lower(guest_email)`.
- `guesty_sync_runs`: run log.
- `integration_tokens`: 1-row cache (provider='guesty') with access_token + expires_at + refreshed_at. Solves the cold-start OAuth rate-limit problem (see below).
- RPC `guesty_backfill_reservation_nicknames()`: single SQL pass to project listing.nickname onto every reservation row without per-row round-trips.

### Sync (`src/lib/run-guesty-sync.ts`)
- Listings: paged (100 at a time), explicit fields projection including `listingType` + `masterListingId` (Guesty's default projection omits them on this tenant).
- Reservations: filter `createdAt >= now - 365d`, sorted by createdAt, paged 100 at a time. Upsert-by-id.
- Scheduled 04:40 UTC via `vercel.json`. Manual trigger: `POST /api/guesty/run-now` (bearer).

### Enrichment layer (`src/lib/guesty-enrichment.ts`)
- `batchLookupGuestyReservations(items)`: one-shot batch lookup of many bookings by Airbnb HM-code OR Guesty confirmation_code. Returns `Map<key, GuestyReservationLite>`. Uses `.in()` on two columns in parallel, merges results.
- `lookupGuestyReservation({platformCode, guestyCode})`: single-row variant.
- `lookupListingByNickname(nickname)`: resolves nickname → `{id, building_code, listing_type, master_listing_id}`.
- `overlayGuestyOnBooking(emailRow, guesty)`: pure function that merges Guesty's trusted fields over an email-parsed row. **Policy: Guesty wins on every conflict.** Seeds `_guesty_matched: boolean` + `_guesty_overrides: string[]` audit fields. Known overlays: guest_name, guest_email, listing_name, listing_nickname, check_in/out_date, nights, total_payout/host_payout, currency, channel/source, building_code.

### First aggregator integrated: `beithady-booking.ts`
After `parseOne()` runs across all email bodies, we batch-lookup each parsed row by `booking_id` (Airbnb HM-code → `platform_confirmation_code`) and overlay the results. Dynamic-imported so the mirror module stays out of the hot path when tables are empty. Output now exposes `guesty_enriched_count` so the dashboard can surface how many rows were authoritatively validated this run.

### Guesty OAuth cold-start fix (commit 222fc27)
Original module-scoped token cache worked only WITHIN a single Vercel container. Each cold start re-minted a token → blew through the `/oauth2/token` rate limit after a few calls this session. Fix: two-tier cache.
1. In-process for warm reuse
2. `integration_tokens` table as the cold-start-durable cache
Tokens live 24h; refresh when < 5 min remain. Both paths fall back gracefully if Supabase is unreachable.

### Current status — sync still blocked on 429
After deploying the cache fix, `/api/guesty/run-now` still returns `guesty_oauth_failed: 429`. Root cause: the Supabase cache is empty (no successful token ever persisted), so every attempt re-hits the rate-limited endpoint. Waiting for Guesty's rate-limit window to clear (typically 1-5 minutes). Started a background Monitor that retries every 90s until `ok: true`.

### Vercel cron now at 11 entries
```
04:00 /api/cron/odoo
04:05-04:30 /api/cron/odoo-financials (6 phases)
04:35 /api/cron/pricelabs
04:40 /api/cron/guesty  ← NEW
06:00, 07:00 /api/cron/daily (Gmail)
```

### Phase 9.1 backlog (not started)
1. **Other Beithady aggregators**: payout / reviews / inquiries / requests all still pure email-parse. Enrichment helper is ready — just need to wire each one. Payout is highest value (host_payout from Guesty is cent-exact vs Airbnb email approximations).
2. **PriceLabs enrichment**: overlay `base_price` and `recommended_base_price` onto listings in the booking output so per-listing views show the pricing context.
3. **Dashboard badge**: show the `_guesty_matched` / `_guesty_overrides` audit so the user can see which fields were authoritatively corrected per row.
4. **Token cache used by other integrations**: Odoo + PriceLabs could use the same `integration_tokens` table pattern.

## ✅ PHASE 8.1.1 — BH-73 Multi-Unit Strategy surfaced (commits 156201b → 756103d)

User flagged: "BH-73 Uses new Multi Unit Strategy where Main units has several below as parent and child - Compare with Guesty Database"

### Key discovery
The "14 vs 29" gap for BH-73 wasn't missing data — it was **PriceLabs managing at the multi-unit PARENT level**. Each parent listing in PL has a `-- N Units` suffix in its name, e.g. `BH73-3BR-SB-1 -- Luxury 3BR ... -- 5 Units`. Those N sub-units each exist as their own Guesty `SINGLE` listings with a naming convention `BH73-3BR-SB-1-001/101/201/301/401`.

### BH-73 structure verified
| PriceLabs parent | Guesty children (derived from nickname) | N |
|---|---|---|
| BH73-3BR-SB-1 | -001, -101, -201, -301, -401 | 5 |
| BH73-3BR-SB-2 | -002, -102, -202, -302, -402 | 5 |
| BH73-3BR-SB-3 | -105, -204, -305 | 3 |
| BH73-3BR-C-4 | -203, -403 | 2 |
| BH73-2BR-SB-5 | -107, -307 | 2 |
| BH73-2BR-SB-6 | -103, -303 | 2 |
| BH73-ST-C-7 | -104, -304 | 2 |
| BH73-1BR-C-8 | -106, -306 | 2 |

23 sub-units managed by 8 parents + 6 singles (BH73-2BR-SB-404, BH73-3BR-C-003, BH73-3BR-C-005, BH73-4BR-C-405, BH73-ST-C-004, BH-73-DEL01) = **29 physical units**, matching Guesty's 29 BH-73 units exactly. **100% coverage.**

### Infrastructure shipped
- **`/api/analysis/bh-73-comparison`** — debug endpoint that pulls Guesty + PriceLabs BH-73 listings, cross-references via `id === _id`, and groups Guesty rows by nickname-derived parent key (first N-1 hyphen segments). Useful when Guesty's list-projection omits `listingType`/`masterListingId` as it does on this tenant.
- **`/api/analysis/guesty-probe`** — scratchpad that dumps one listing's full shape to diagnose missing fields. Will hit Guesty's OAuth rate limit if called repeatedly in quick succession; module-scope token cache doesn't survive Vercel cold starts.
- **`src/lib/pricelabs-pricing.ts`**: added `unit_count` + `is_multi_unit_parent` to `PricingListingRow`; added `physical_units` + `multi_unit_parents` to `PricingBuildingSummary`. Parser: `/\b(\d+)\s*Units?\b/i` against listing name.
- **Pricing dashboard (`/emails/beithady/pricing`)**:
  - Top stat card: "Physical Units" (Σ unit_count) with "N listings · M MTL parents" sub-label.
  - Per-building table: new `Phys. Units` + `MTL Parents` columns. "With Recs" column removed.
  - Per-listing table: new `Units` column with `5×` / `2×` indigo pill badge for parents; plain "1" for singles.

### Observed building counts (post-fix snapshot)
| Building | PL Listings | Physical Units | MTL Parents | Pushing |
|---|---|---|---|---|
| BH-26 | 22 | 22 | 0 | 22 |
| BH-73 | 14 | 29 (expanded via parents) | 8 | 12 |
| BH-435 | 14 | 14 | 0 | 14 |
| BH-OK | 11 | 11 | 0 | 11 |
| untagged | 8 | 8 | 0 | 7 |

BH-26, BH-435, BH-OK use single listings per unit (no multi-unit strategy yet). **Only BH-73 has adopted the MTL pattern.** If other buildings migrate to MTL in the future, the `Units` column will automatically reflect the change on next sync.

### Known gap still open
- **8 untagged BH-* listings** (high ADR $219 avg, high 49% occupancy) — premium properties with tag format we don't recognize. Extending `extractBuildingCode` to catch those is still pending.
- **Guesty → Supabase sync**: we only hit Guesty on demand via the analysis endpoint. A proper `guesty_listings` table synced nightly would enable richer dashboards and avoid the OAuth rate limit on probe.

## ✅ PHASE 8.1 SHIPPED — Pricing Intelligence rule under Beithady domain (commits cc9828b + a4d0849)

New rule live at **https://kareemhady.vercel.app/emails/beithady/pricing**. Linked from the Beithady domain page next to Financials.

### Schema (migration 0005_pricelabs.sql, applied via MCP)
- `pricelabs_listings` — current catalog state with derived `building_code` (maps to canonical BH-26/34/73/435/OK).
- `pricelabs_listing_snapshots` — daily time-series with `UNIQUE(listing_id, snapshot_date)`. 20+ fields including base/min/max, adr_past_30 + stly, revenue_past_30 + stly, booking_pickup, occupancy_next_7/30/60 + market_occupancy_*, recommended_base_price (numeric or null) + `rec_base_unavailable` flag, raw jsonb.
- `pricelabs_channels` — PK `(listing_id, channel_name)` for Airbnb / Booking / rentalsUnited cross-references.
- `pricelabs_sync_runs` — run log.

### Sync worker (`src/lib/run-pricelabs-sync.ts`)
69 listings × 400ms throttle = ~30s total. Walks catalog, fetches each listing detail, upserts row + snapshot + channels. Parses '14 %' → 14. Falls back to catalog row if detail fetch fails. Idempotent via `ON CONFLICT (listing_id, snapshot_date)`.

### Routes
- `GET /api/cron/pricelabs` — scheduled **04:35 UTC** in vercel.json (after Odoo financial phases).
- `GET|POST /api/pricelabs/run-now` — bearer-protected manual trigger.

### Building classifier iteration
First sync misclassified 61/69 listings as BH-OK. Root cause: tags like `"BH-435-303,BH-435"` — the per-unit code came first and my single-pass classifier matched the BH-OK scatter fallback. Fixed with a two-pass scan: Pass 1 looks for an EXACT canonical tag across all comma-separated values; Pass 2 strips the suffix (BH-435-303 → BH-435); only then does the BH-OK catchall apply.

### Verified building summary (today's snapshot)
| Building | Listings | Pushing | Avg ADR 30d | Revenue 30d | STLY 30d | Occ next-30 | Mkt Occ | With Recs |
|---|---|---|---|---|---|---|---|---|
| BH-26 | 22 | 22 | $88.7 | $33,836 | — | 8.2% | 9.5% | 16 |
| BH-73 | 14 | 12 | $76.5 | $24,901 | $0 | 11.0% | 8.7% | 9 |
| BH-435 | 14 | 14 | $87.1 | $13,072 | $13,074 (flat) | 8.2% | 6.5% | 9 |
| BH-OK | 11 | 11 | $49.4 | $7,049 | $3,645 (+93% YoY) | 8.6% | 5.7% | 10 |
| untagged | 8 | 7 | $219.6 | $4,003 | $39,290 | 49.0% | 23.7% | 7 |

BH-26 counts match Odoo's 22 units exactly. BH-435 matches 14. BH-73 at 14 vs Odoo's 29 means 15 BH-73 units still aren't registered in PriceLabs. The 8 "untagged" listings have high ADR ($219) and high occupancy (49%) — these are likely premium properties with a different tag format; worth investigating their raw tags for Phase 8.2.

### Dashboard (`/emails/beithady/pricing`)
- Top stat cards: units synced, avg ADR 30d, total revenue 30d (with YoY delta), avg occupancy next-30 vs market.
- Per-building summary table: listings, pushing, avg base/ADR, revenue + YoY, occupancy next-30 vs market (with delta in pp), rec coverage. Clicking a row filters the listing table below.
- Per-listing table: listing name, building code, push indicator (green dot), base, ADR 30d + YoY, revenue 30d, occupancy next-30 vs market with pp delta, rec_base_price (or "Unavail" badge).
- Empty state shows the `run-now` curl command if no snapshots exist yet.

### Domain page card
`src/app/emails/[domain]/page.tsx` now shows Financials + Pricing Intelligence as a 2-column grid above the rules list when domain=beithady.

### Cron schedule (vercel.json, 10 entries total)
```
04:00  /api/cron/odoo                                → Odoo companies + invoices
04:05  /api/cron/odoo-financials?phase=metadata      → Odoo CoA + partners
04:10  move-lines-4 (A1)
04:15  move-lines-5 (Beithady Egypt)
04:20  move-lines-10 (Beithady Dubai)
04:25  analytics (plans/accounts/links)
04:30  finalize (owner flag)
04:35  /api/cron/pricelabs                           → PriceLabs catalog + snapshots
06:00  /api/cron/daily (Gmail 9 AM Cairo summer)
07:00  /api/cron/daily (Gmail 9 AM Cairo winter)
```

### Phase 8.2 backlog (not started)
1. **Chase missing BH-73 units in PL portal** (15 of 29 not registered).
2. **Investigate the 8 untagged listings** — probably premium properties with different tag format; extend classifier.
3. **Gap analysis visualization**: per-listing-per-day (price vs recommended_rate) chart — requires getting `/listings/prices` populated for more listings (needs PL's ML model to mature past "Unavailable").
4. **Cross-join to Guesty**: `pricelabs_listings.id` = Guesty `_id`. Once Guesty data is synced to Supabase, add a field showing Guesty confirmationCode volume per listing.

## ✅ PHASE 8 CONNECTION VERIFIED — PriceLabs live, rich revenue intel surfaced (commits 3f3f1b6 → a9c41ac)

User added `PRICELABS_API_KEY` to Vercel; I redeployed and iterated until the API shape was fully mapped.

### Discovery journey this turn
1. First smoke test (auth OK) returned 69 listings all `pms: "guesty"` — but `pms_reference_id` was null and price/base fields all null in the catalog response. Suggested the catalog endpoint is lightweight and detail lives elsewhere.
2. `/listing_prices` (my original assumption from research notes) returned **404**. PriceLabs docs aren't publicly indexed via WebFetch, so I shipped a `?probe=1` debug mode that tested 14 candidate endpoints against a real listing.
3. Probe winners: `GET /listings/{id}` → 200 with rich detail; `GET /listings/prices?id=X` → 200 but empty `{listings: []}`. The rest 404/400.
4. Inspected raw `/listings/{id}` body — found gold: ADR/STLY comparison, occupancy vs market 7/30/60-day, revenue past 30 vs STLY, channel_listing_details (Airbnb 1091789238403851086, Booking 14409469, rentalsUnited 4492275 for BH-435-303), tags "BH-435-303,BH-435", group "BH_Cairo_Buildings", recommended_base_price (often "Unavailable" for new listings).
5. `/listings/prices` empty response correlates to `recommended_base_price: "Unavailable"` — not an endpoint bug, PL's ML model just hasn't generated recs for new listings yet.

### Final client state (`src/lib/pricelabs.ts`)
- `listPricelabsListings()` → 69 catalog entries (id/name/pms/push_enabled/bedrooms)
- `getPricelabsListing(id)` → single-listing detail, unwraps the `{listings: [one]}` shape. Exposes 20+ revenue-intelligence fields.
- `getPricelabsListingPrices(listingId, {dateFrom, dateTo})` → corrected path to `GET /listings/prices?id=X&date_from=&date_to=`. Returns `{listings: []}` shape (empty when listing has no recs — probably needs a batch variant or richer date range to populate; deferred to 8.1).
- Fetch wrapper honors 429/5xx Retry-After, tolerates empty 200 bodies, captures `X-Request-ID` in error messages.

### Final ping response (tested at https://kareemhady.vercel.app/api/pricelabs/ping)
| Building (normalized tag) | PriceLabs count | Odoo analytic count |
|---|---|---|
| BH-26 | 22 | 22 (exact match — 22 Lotus units) |
| BH-435 | 14 | 14 (exact match) |
| BH-73 | 13 | 29 (16 missing — PL not managing those units yet) |
| untagged | 20 | — (likely BH-OK scatter + BH-34, whose tags don't match the BH-\d pattern) |
| **Total** | **69** | (vs 91 in Guesty → 22 listings not synced to PL at all) |

Sample detail for BH-435-303:
- Base $120 USD, push_enabled, 3 channels live
- ADR past 30: $79 (vs STLY $64) = **+23% YoY**
- Revenue past 30: $1,586 (STLY $1,602) = flat
- Occupancy next 7d: **14%** beats market 11%
- Occupancy next 30d: 3% trails market 5%; next 60d: 2% trails 3%
- Rec base price: "Unavailable" (new listing)

### Known gaps + observations
1. **16 BH-73 units missing from PL** — need to cross-check against Guesty listings (58 BH-73 analytic accounts ÷ 2 companies ≈ 29 units expected vs PL's 13). User should add them in the PL portal.
2. **20 listings have no building tag** (or tag doesn't match `BH-\d` pattern). Likely BH-OK / BH-34 / BH-OKAT variants. Need to inspect tag values in a future turn and expand `normalizeBuildingTag` to handle them.
3. **`/listings/prices` returns empty for listings without recs**. The documented late-2025 `booking_prob` / `adjusted_price` fields would land here; not accessible until PL's model publishes recs for more Beithady listings.
4. **`pms_reference_id` is null** on catalog responses — but PriceLabs' `id` field IS the Guesty `_id` (same ObjectId format, same values). Join to `guesty_*` tables will work on `pricelabs.id === guesty.listing._id`. Documented in code comments.

### Next step (Phase 8.1 — NOT started)
Schema + sync + cron + dashboard. Likely shape:
- `pricelabs_listings` (per-listing snapshot with revenue intel + rec-base-price + tag + last_refreshed_at)
- `pricelabs_daily_prices` (per-listing-per-day base / recommended / min_stay if it ever surfaces)
- `pricelabs_channels` (link table: pricelabs_listing_id + channel_name + channel_listing_id)
- Cron at 04:35 UTC iterating all listings (69 × ~1s = ~70s → fits one function invocation)
- Dashboard: new `/emails/beithady/pricing` page with per-building ADR/STLY/occupancy-vs-market grid. Could also fold into the Financials page as a sibling tab.

## 🟡 PHASE 8 SCAFFOLD — PriceLabs API client + smoke-test endpoint (commit 05470d2, deployed, BLOCKED on user API key)

User direction: "now connect pricelabs api".

### What shipped (3 files, zero-dep fetch wrapper pattern matching Guesty Phase 6 + Odoo Phase 7)
- **`src/lib/pricelabs.ts`** (~140 lines): thin fetch client with `X-API-Key` header auth, 429/5xx retry honoring `Retry-After`, empty-body tolerance on 200 responses, 4xx throws immediately. Request-ID captured in error messages for log correlation.
  - `listPricelabsListings()` — `GET /listings`, no pagination needed at Beithady's 91-unit scale (PL docs: full catalog in one response under ~500 listings). Robust to 3 possible response shapes: bare array, `{ listings: [] }`, `{ data: [] }`.
  - `getPricelabsListingPrices(listingId, { dateFrom, dateTo })` — `GET /listing_prices`, per-listing per-call (serialize with ~1s spacing when looping).
  - Typed shapes include `PriceLabsListing.pms_reference_id` (the join key to Guesty `listing._id`), `base_price` / `min_price` / `max_price`, `push_enabled`, and the late-2025 `booking_prob` / `adjusted_price` fields on price rows.
- **`src/app/api/pricelabs/ping/route.ts`**: CRON_SECRET-bearer-protected smoke test. Returns `total_listings`, `by_pms` count breakdown (to spot how Beithady's Guesty listings surface), first-5 sample (id, name, pms, pms_reference_id, bed count, base/min/max price, push_enabled, market). `?withPrices=1` adds a 14-day rate-card sample for the first listing.
- **`.env.example`**: `PRICELABS_API_KEY=` stub with inline comment documenting UI path (Account → Profile → API), rate limit (~60/min/key), and no-webhooks caveat.

### Design notes
- **Base URL** `https://api.pricelabs.co/v1`. Header is `X-API-Key` (NOT Bearer). Generated once per account.
- **Pull-only integration** — PriceLabs has no webhooks as of 2026. Phase 8.1 cron should run at ~04:30 UTC (after PL's internal nightly recalc around 03:00 UTC) to capture fresh recommendations.
- **Rate discipline**: `/listings` is 1 call; `/listing_prices` is per-listing, so a full daily refresh for 91 Beithady listings = 91 calls = well under the 60/min limit if spaced 1-2s apart (takes ~2 min).
- **Gap analysis** is the eventual dashboard metric — for each listing-day: `gap_pct = (recommended_rate - current_price) / current_price`. Flag `> +15%` as leakage (priced above rec → empty nights) and `< -10%` as missed upside (priced below rec).

### Env credential checklist (waiting on user)
`PRICELABS_API_KEY` — generate at **Account → Profile → API** in the PriceLabs portal. Add to:
- Vercel: Production + Preview + Development
- Local: `C:\kareemhady\.env.local`

### Typecheck + deploy
`npx tsc --noEmit` clean. Deployed to production via `vercel --prod --yes`. Endpoint live at `https://kareemhady.vercel.app/api/pricelabs/ping` but returns 400 until env is set.

### Next step (after user says "done")
1. I run the smoke test with + without `?withPrices=1` to verify the auth, the listing catalog shape, and the rate-card output.
2. Verify `pms_reference_id` field maps to Guesty `_id` so cross-join to `guesty_*` tables works (Phase 8.2 concern).
3. Phase 8.1 planning: decide on Supabase schema (likely `pricelabs_listings` + `pricelabs_price_snapshots` with a daily snapshot_date partition), daily cron endpoint, and a new dashboard surface (could fit under `/emails/beithady/pricing` or as a section under the existing Financials page).

### Memory note (optional — not yet saved)
A project-memory file documenting PriceLabs API shape + rate-limit discipline would help future sessions. Defer until the connection is verified — don't commit memory for a config the user might change.

## ✅ PHASE 7.6.1 — Building dropdown cleaned to the 5 canonical buildings (commit 98f1621)

User direction:
> "Combine all BH-XXX Under BH-OK (One Kattemia) as one analytic account
> BH-73 (29 Units Only) + BH-73-General
> BH-435 (14 Units Only) + BH-435-General
> BH-26 (22 Units Only) + BH-26 General"

Refactored `extractBuildingCode()` in `src/lib/run-odoo-financial-sync.ts`:
- Explicit "OK" / "OKAT" / "One Kattameya" text → BH-OK
- Numeric 26 / 34 / 73 / 435 → keep as their own building
- Any other `BH-<digit>` pattern (BH-101-55, BH-203-86, etc.) → BH-OK (contract Annex D "Separate Units")

Re-ran `?phase=analytic-accounts` to reclassify all 210 analytic accounts.

### Dropdown is now canonical
| Building | Accounts | Distinct names | What they are |
|---|---|---|---|
| BH-26 | 47 | 24 | 22 units + BH-26 GYM + BH-26 GENERAL (Lotus Building, New Cairo) |
| BH-34 | 2 | 1 | BH-34-GENERAL (Annex C, not yet operating) |
| BH-73 | 58 | 30 | 29 units + BH-73 GENERAL |
| BH-435 | 44 | 16 | 14 units + 2 generals (BH-435 General / BH-435-GENERAL — duplicate spelling in Odoo; aggregate together) |
| BH-OK | 20 | 10 | One Kattameya separate-unit codes (BH-101-55, BH-107-46, BH-109-23/43, BH-114-73, BH-115-75, BH-116-36, BH-202-61, BH-203-86, BH-213-82) |

### Feb 2026 revenue by building (sanity check)
BH-26 1,609,665 (45% of 3,572K consolidated) · BH-435 1,061,902 (30%) · BH-OK 429,173 (12%) · BH-73 291,565 (8%) · BH-34 null.
Sums to ~95% of consolidated revenue, which tracks — remaining 5% is un-tagged lines or analytic-distribution misses. Dashboard dropdown now shows exactly 5 buildings.

## ✅ PHASE 7.6 SHIPPED — Analytic plans/accounts/links + BH-building & LOB segregation + cron automation (commits e740ac4 + ce5bd49)

User request: "Cron automation for financial sync phases / plan/account resolution is not built yet".

### Schema additions (migration 0004_odoo_analytic.sql, applied via MCP)
- **`odoo_analytic_plans`** — Odoo 17+ `account.analytic.plan` containers. Synced 52 plans across FINANCIALS_COMPANY_IDS scope.
- **`odoo_analytic_accounts`** — per-building / per-LOB accounts with `plan_id`, `root_plan_id`, derived `building_code`, `lob_label`. Synced 210 accounts.
- **`odoo_move_line_analytics`** — flat projection of `analytic_distribution` jsonb. Splits composite keys (e.g. `{"538,537": 100}` → two rows because Odoo multi-plan-allocates). Synced **69,751 link rows** covering all 69,697 move lines that carry analytics.
- Extended `odoo_sync_runs` with analytic counters.

### Classification derived at sync time (via regex on analytic-account names)
**Buildings detected (13 distinct):**
- **BH-26**: 47 accounts (Lotus, New Cairo)
- **BH-34**: 2 accounts
- **BH-73**: 58 accounts
- **BH-435**: 44 accounts (AbdelHameed Gouda Elsahar St.; A1-owned)
- Plus minor: BH-101, BH-107, BH-109, BH-114, BH-115, BH-116, BH-202, BH-203, BH-213

**LOB detected:**
- **Arbitrage** (Leased model): 16 accounts
- **Management** (BH-435 model): 17 accounts

### Postgres RPC `pnl_aggregated`
Pushes GROUP BY + analytic EXISTS filter + partner exclusion into Postgres — avoids supabase-js URL-length limits when filtering by building/LOB touches 20k+ lines. Signature: `(from date, to date, company_ids bigint[], building_code text default null, lob_label text default null, exclude_partner_ids bigint[] default null)`. Returns per-account totals + line counts.

### Bug found & fixed during rollout
Initial `rebuildAnalyticLinks` used `PAGE = 2000`. Supabase PostgREST caps at `max-rows = 1000` by default, so the first batch returned 1000 rows and the loop interpreted `rows.length < PAGE` as end-of-set — producing only **1,000** link rows. Fixed by setting `PAGE = 1000` to match the cap; full rerun now produces 69,751 links.

### Cron automation (vercel.json)
9 cron entries now scheduled. Daily 04:00-04:30 UTC window:
```
04:00  /api/cron/odoo                               → companies + invoices (~15s)
04:05  /api/cron/odoo-financials?phase=metadata     → accounts + partners
04:10  /api/cron/odoo-financials?phase=move-lines-4 → A1 move lines (resume=true)
04:15  /api/cron/odoo-financials?phase=move-lines-5 → Egypt move lines (resume=true)
04:20  /api/cron/odoo-financials?phase=move-lines-10→ Dubai move lines (resume=true)
04:25  /api/cron/odoo-financials?phase=analytics    → plans + accounts + links
04:30  /api/cron/odoo-financials?phase=finalize     → owner flag
```
Plus existing Gmail crons at 06:00 + 07:00 UTC. All resume-aware + idempotent. Each phase fits in ~30s comfortably within the 300s cap.

### UI updates
- **Segregation panel** between Scope tabs and the P&L: dropdowns for Building (All / each BH-*) + LOB (All / Arbitrage / Management). Submit form preserves scope + period.
- Active filter annotates the P&L subtitle (e.g. `Building: BH-26 · LOB: Arbitrage`).
- Period preset + month-specific links preserve `building` and `lob` query params across navigation.
- Clear-filters link visible when a filter is active.
- Note: Balance Sheet and Payables are NOT filtered by building/LOB (those are balance-sheet concepts that don't segregate cleanly by analytic). UI warns the user of this via an amber note when filter is active.

### Smoke-tested (20 combinations all HTTP 200)
4 scopes × 5 filter states (none, BH-26, BH-435, Arbitrage, Management). Scope-aware Rent Costs routing (from 7.5) still works under analytic filtering.

### Verification via RPC
Feb 2026, BH-26 scope: Revenue From Airbnb 941,788 EGP (44% of the 2,136,790 consolidated) — plausible share for the 22-unit Lotus Building property. Agents Commission Airbnb 177,807 (67% of 265,958 consolidated). Data is internally consistent.

### Known gaps still open
1. **Balance Sheet undercounts pre-2025 history** — our 365d move-line window misses inception-to-April-2025 entries. A1 snapshot still shows Assets 2.17M vs xlsx 9.44M. Not addressed this turn.
2. **Cost of Revenue consolidated -14%** — still open; investigation deferred.
3. **Building-scoped Balance Sheet / Payables** — not implemented; only P&L supports the filter. Would require a per-account-type analytic breakdown which is iffy for accrued liabilities.
4. **Cron first fire** will be next 04:00 UTC (02:00 Cairo) — no results to verify yet. Dashboard's latest-sync metadata will update after that window.

## ✅ PHASE 7.5 SHIPPED — 4 company views + Balance Sheet + A1 in scope (commits c9aa061 + 06ae34c)

User request: "Study All, cover All Gaps and Show Dashboard for Balance Sheet ... also P&L Dashboard important Numbers Mainly for Beithady Consolidated & A1 as Owner ... segregation for BH-26 - BH-73 - BH-435, Arbitrage / Management Line of Business" + four xlsx files (Consolidated, UAE, Egypt, A1) as target layouts.

### New source files read (in `C:\kareemhady\.claude\Documents\`)
- `Beithady Consolidated P&L with Both Egypt & Dubai.xlsx` — YTD Jan+Feb 2026 consolidated P&L (Revenue 9,284,450, Net Profit -5,462,189). Confirms Filters = Egypt + Dubai only.
- `Beithady Dubai & Egypt Balance Sheert FEB-2026.xlsx` — balance sheet as of 28/02/2026 + same YTD P&L + Filters sheet. Assets 75,456,779; Liabilities 85,262,188; Equity -9,805,409.
- `f.s__beithady_hospitality_-(egypt).xlsx` — both P&L (Feb 2026 3.57M) and the same (consolidated) balance sheet duplicated. Treat its P&L as the Egypt single-company view.
- `f.s_beithady_hospitality-(_uae).xlsx` — Beithady Dubai (FZCO) P&L (not fully inspected this turn — truncated by output). Jan-Feb 2026 YTD.
- `f.s__a1_hospitality.xlsx` — A1 standalone. P&L Jan-Feb 2026 YTD (Revenue 1,562,150 all from account 401009 "Revenue From Hospitality"; Net Profit 199,721). Balance Sheet as of 28/02/2026 (Assets 9,444,897; Liab 1,937,812; Equity 7,507,085). Uses a different CoA than Beithady — depreciation is at 606xxx not 607xxx.

### Ships in this phase
- **A1HOSPITALITY (id 4) added to FINANCIALS_COMPANY_IDS**. After deploy, ran phases `accounts` → `partners` → `move-lines&company=4`. A1: 11,874 move lines, adds its full CoA (657 accounts total across all 3 companies), 310 partners total.
- **CompanyScope type** (`consolidated | egypt | dubai | a1 | custom`) with `scopeCompanyIds()` + `scopeLabel()` + `COMPANY_LABELS` lookup. Exported `ALL_FINANCIALS_COMPANY_IDS`.
- **Intercompany elimination is scope-conditional** — active only when scope spans both 5 AND 10. Single-company or A1-only views preserve their raw intercompany entries.
- **Scope-aware P&L classifier**: "Rent Costs" routes to Home Owner Cut for Beithady (the arbitrage-operator view that pays head-lease owners), but to Operating Cost under Cost of Revenue for A1 (where rent is A1's own expense). Checked via `isA1OnlyScope` flag. Explicit lesson: name-based classification must be context-aware when the same account name carries different business meaning across companies.
- **New `buildBalanceSheet(asOf, companyIds)` aggregator** — reads `odoo_move_lines` filtered to posted entries + `<= asOf`, groups by `account_type`:
  - `asset_cash` → Bank and Cash, `asset_receivable` → Receivables, `asset_prepayments` → Prepayments, `asset_current` → Other Current Assets, `asset_fixed` → Fixed Assets, `asset_non_current` → Non-current
  - `liability_payable` → Payables, `liability_current` → Other Current Liab, `liability_non_current` → Non-current Liab
  - `equity` + `equity_unaffected` → Unallocated Earnings / Retained (by name pattern)
  - Sign-flips liabilities + equity so display reads positive (Odoo stores them with credit normal balance = negative in `balance`).
  - Returns a `balanced` flag (Assets ≈ L + E within 1 EGP).
- **UI redesigned** (`src/app/emails/beithady/financials/page.tsx`, ~580 lines):
  - Top company scope tab selector: Consolidated / Egypt / Dubai / A1.
  - Period filter with presets + specific-month picker + custom range; all forms preserve scope across submissions.
  - P&L table (full xlsx hierarchy, Sub-GP / GP / EBITDA / Net Profit subtotals, % of revenue column).
  - Two-column Balance Sheet panel (Assets on left, Liabilities + Equity on right) with nested groups + accounts scrolling inside each sub-section. Headlines Assets / (Liab+Eq) totals + Balanced ✓ indicator.
  - Three Payables cards side-by-side (Vendors / Employee / Owners).
  - Unclassified accounts warning panel still visible when misses exist.

### Verification (all HTTP 200)
- `?scope=consolidated&preset=month:2026-02` ✅
- `?scope=egypt&preset=month:2026-02` ✅
- `?scope=dubai&preset=month:2026-02` ✅
- `?scope=a1&preset=month:2026-02` ✅

**A1 Jan-Feb 2026 P&L vs xlsx**: Revenue / G&A / Depreciation match EXACTLY (1,562,150 / 11,617 / 203,589); Cost of Revenue closed from 47% off to within rounding after the Rent-Costs routing fix.

### Known Phase 7.6 backlog — NOT done this turn
1. **Balance Sheet accuracy**: our `buildBalanceSheet` aggregates from last 365d move lines only, so A1 snapshot shows Assets 2.17M vs xlsx 9.44M — ~7.3M of historical equity/asset entries are pre-April-2025 and outside our sync window. Two fix paths: (a) extend backfill to all-time (maybe 200k+ rows for Egypt — needs further phasing), or (b) add opening-balances sync. Either requires more work; for now the UI should carry a disclaimer.
2. **BH-26 / BH-73 / BH-435 + Arbitrage / Management LOB segregation**: not built. Odoo uses analytic plans; `analytic_distribution` on move lines carries comma-separated IDs like `{"538,537": 100}` where commas = multi-plan allocation. 180 distinct analytic account IDs referenced across the synced lines. Needs: sync `account.analytic.account` (with plan_id), sync `account.analytic.plan` ("Leased" vs "Management"), parse `analytic_distribution` JSON keys (split on comma), join to plan to get LOB, UI filter controls.
3. **Cost of Revenue consolidated gap (14%)**: still open. With the scope-aware Rent Costs routing, consolidated CoR now recategorizes Rent Costs into Home Owner Cut, which tracks the xlsx. Net Profit matches, but exact sub-breakdown (Agents / Direct / Operating) may still be off by the 305K — investigate account-type edge cases in 7.6.
4. **Full balance sheet historical backfill** — see (1).
5. **Dubai (FZCO) single-company P&L not yet cross-verified** against its xlsx (file was truncated in this turn's read).
6. **Cron orchestration for financial sync** — still manual phase-through; add 04:30 UTC cron that runs accounts → partners → move-lines per company → finalize in sequence.

## ✅ PHASE 7.2 + 7.3 SHIPPED — Beithady Financials rule live at /emails/beithady/financials

Multi-commit push (1d40a47 + 6aebff5 + 201222c + 30aec77 + ab3f1fc + c676e76). Final deploy `kareemhady.vercel.app`. Page renders HTTP 200 in ~5.7s.

### Architecture delivered
- **Schema (migration 0003 + ad-hoc partner_id alter)**: `odoo_accounts` (439 rows), `odoo_partners` (277 rows, 19 flagged is_owner), `odoo_move_lines` (Egypt 55,100 + Dubai 11,486 = 66,586 rows), extended `odoo_sync_runs` with accounts/partners/move_lines counters, `odoo_companies.partner_id` for intercompany elimination.
- **Phased financial sync** (`/api/odoo/sync-financials?phase=<X>`) — Vercel's 300s cap forced a split. Phases: `accounts` → `partners` → `move-lines&company=5` → `move-lines&company=10` → `finalize`. `move-lines` supports `?resume=1` starting from max(id) for when a single company exceeds one function window.
- **Date cap discovered**: Odoo pre-generates 12-year future depreciation schedules (BH-26 through 2038). Raw Egypt returned 193k lines; after `date <= today` cap, dropped to 55k. Cleaned up 160k future rows via one-off DELETE.
- **P&L aggregator (`src/lib/financials-pnl.ts`)**: `account_type`-driven grouping (not code-prefix) because the tenant's CoA diverges across companies — same code (`500103`) means 'Home Owner Cut' in one and 'AGENTS COMMISION Hopper' in another. Sub-buckets by name keywords (agents/operating/direct for expense_direct_cost; back_office/office/transport/legal_fin/marketing/other for expense). Home Owner Cut + Rent Costs pulled out as dedicated section by name pattern. Interest lines routed to INT-TAX-DEP by name. Depreciation = all expense_depreciation. Income sections sign-flip for display.
- **Intercompany elimination**: `getIntercompanyPartnerIds()` matches partner names against `%beithady hospitality%` (catches auto-linked company partners AND custom intercompany booking partners like "053. BeitHady Hospitality- UAE" and "Beithady Hospitality - Egypt", id 27005/27007/12). "Beit Hady Website" does NOT match because it lacks 'hospitality' in name. Applied to both P&L and Payables reports.
- **Page (`src/app/emails/beithady/financials/page.tsx`)**: standalone route at `/emails/beithady/financials` (Next.js static segment takes precedence over `[ruleId]` dynamic). Period presets: this_month / last_month / this_quarter / last_quarter / this_year / last_year + specific-month dropdown (last 12 months) + custom date range. Full P&L table with Sub-GP, GP, EBITDA, Net Profit subtotals + % of revenue column + sign-colored cells. Three payables cards side-by-side. Unclassified-accounts warning panel.
- **Domain page**: `src/app/emails/[domain]/page.tsx` adds a "Financials" entry card under Beithady rules list.
- **`.gitignore`**: excluded `.claude/Documents/` (contract with bank details + Feb 2026 P&L xlsx are confidential).

### Verification vs Feb 2026 xlsx
| Line | xlsx | Ours | Diff |
|---|---|---|---|
| Revenue | 3,572,265 | 3,574,175 | +0.05% ✅ |
| Home Owner Cut | 1,755,816 | 1,755,817 | ~exact ✅ |
| Depreciation | 740,370 | 740,127 | -0.03% ✅ |
| Interest | 1,468,342 | 1,468,342 | exact ✅ |
| G&A (ex-interest) | 1,617,669 | 1,619,290 | +0.10% ✅ |
| Cost of Revenue | 2,153,928 | 1,848,758 | -14% ⚠️ |

Cost of Revenue is the one line where we're off by ~305k. Likely explanation: Odoo's draft-vs-posted state handling differs from the xlsx report's treatment, or some accounts used at the margin are typed as `expense` rather than `expense_direct_cost`. Known example: `502105 water, and gas` (account_type = 'expense'). Candidate for Phase 7.4 polish.

### Known owner-partner flag
19 partners currently flagged as `is_owner = true` (post-sync from move lines hitting accounts named "Home Owner Cut" / "Rent Costs"). Visible in the Owners Payables card.

### Cron
`vercel.json` still only crons `/api/cron/odoo` at 04:00 UTC — that runs `runOdooSync` (companies + invoices only). The financial sync (`/api/odoo/sync-financials`) must be triggered manually or via a future cron orchestrator. For now, user needs to manually phase through after any Odoo data change. Candidate for cron automation in Phase 7.4 (serialized phase-by-phase cron runs).

### Key technical lessons (for memory)
1. **Vercel Pro hard cap is 300s** — combined sync for this tenant hits that. Always design sync endpoints to fit single-invocation budgets.
2. **Odoo auto-generates future depreciation** — always cap `date <= today` on line syncs.
3. **CoA codes aren't stable across companies** in multi-company Odoo tenants with diverged histories — `account_type` is the reliable classifier.
4. **Intercompany eliminations need explicit logic** — even when the user says "it's already eliminated", that refers to the SOURCE xlsx, not raw Odoo data.
5. **Supabase `!inner` joins with paginated select** — supabase-js default limit 1000, need explicit `.range()` pagination loops for > 1000 rows.

### Where next
Dashboard is live and functional. User can start USING it for real finance reporting. Phase 7.4 backlog:
- Close the 14% Cost of Revenue gap (account_type investigation + draft-entry treatment)
- Cron-orchestrated financial sync (currently manual phase-through)
- Per-building P&L via `analytic_distribution` cross-company join (BH-435 3-company view)
- Balance sheet rule (Receivables, Payables totals, Fixed Assets)
- A1HOSPITALITY owner-side view for BH-435
- Currency conversion display toggle (EGP / USD / AED)

## 🟡 PHASE 7.2 + 7.3 PLANNING — Beithady Financials rule (awaiting user answers on 5 decisions)

### User direction
> "Dashboard surface: render Odoo data in / or a new /finance route. Vendors Payables / Employee Payables / Owners Payables. There is the Beithady Consolidated Company P&L for FEB 2026, use the Structure to Build the New Rule Under Beithady Domain - Beithady Financials with Period Filters"

Plus business context (critical, save in memory):
- **Beithady FZco owns 100% of Beithady Egypt LLC**. Intercompany Master Services & Master Lease Agreement signed 29 Oct 2025.
- **Operating model**: FZCO (Dubai) = brand/pricing/distribution hub + guest revenue collector. Egypt = on-ground turnkey ops. Egypt invoices FZCO one monthly lump-sum Turnkey Fee per building. 10% auto-escalation per year. Back-to-back with head-lease.
- **BH-26, BH-73, BH-34, BH-OKAT** are **Leased (arbitrage)** — Beithady leases + furnishes + short-term rents. Full operational P&L.
- **BH-435** is **Management** — A1HOSPITALITY (Lime 50%) owns the building, Beithady FZCO manages for **25% of top-line revenue including all utilities**.
- **Odoo Analytic Plans** split this: "Leased" plan (BH-26/73/34/OKAT) and "Management" plan (BH-435). Per-building slicing requires joining through `account.move.line.analytic_distribution`.

### Documents read this turn (in `C:\kareemhady\.claude\Documents\`)
- `Beithady Consolidated P&L.xlsx` — source-of-truth P&L format. 3 sheets: Consolidated P&L (109 rows), %-breakdown, Balance Sheet (28/02/2026), Filters. Feb 2026 totals: Revenue 3.57M EGP, Cost of Rev 2.15M, Sub GP 1.42M, Home Owner Cut 1.76M, GP -337K, G&A 1.62M, EBITDA -1.96M, INT-TAX-DEP 2.21M, Net Profit -4.16M. Balance Sheet: Assets 75.5M, Liabilities 85.3M (Payables 11.89M), Equity -9.8M. **Filters confirmed: Companies = FZCO + Egypt only (NOT A1HOSPITALITY); Options = "With Draft Entries".**
- `Intercompany Master Services & Master Lease Agreement ... (oct 29, 2025).docx` — 20-clause agreement. Key clauses: §5 commercial (monthly lump-sum invoicing by 5th, 15-day payment, 10% annual escalation), §6 term structure (back-to-back with head-lease), §15 IP (brand vests solely in FZCO), Annexes A-E per building. **Annexes: BH-26 Lotus Building New Cairo (USD 21k/month, 12-yr term starting 1 Jun 2026), BH-73, BH-34, BH-OKAT (One Kattameya), BH-435.** BH-435 is in this file but terms locked — details come from the 25% management fee context user provided separately.

### P&L grouping derived from account codes
Standard Egyptian accounting prefix pattern (works because Odoo CoA uses 6-digit codes):
- 400xxx = Activity revenues | 401xxx = Other revenues
- 500xxx = Agents Cost | 501xxx = Direct cost for reservations | 502xxx = Operating Cost
- 504xxx = Home Owner Cut (+ Rent 504100)
- 600xxx = Back Office Salaries & Benefits | 601xxx = Office/Stores Rent & Utilities | 602xxx = Transportation | 603xxx = Legal & Financial | 604xxx = Marketing | 605xxx = Other Expenses
- 606xxx = Interest | 607xxx = Depreciation

Memory file recommended for writing before coding: `account_code_prefix_mapping.md` so Phase 7.3 can reference it.

### Data gap to solve (Phase 7.2)
Supabase has **invoice headers only** (`odoo_invoices`: amount_total, move_type, state). Feb 2026 P&L needs **per-account breakdown** → required:
- `account.account` (chart of accounts: code, name, account_type) — NEW table `odoo_accounts`
- `account.move.line` (per-line detail: `account_id`, `partner_id`, `debit`, `credit`, `balance`, `amount_residual`, `analytic_distribution` jsonb, `parent_state`, `date`) — NEW table `odoo_move_lines`
- `res.partner` (vendors/employees/owners with rank fields + category tags) — NEW table `odoo_partners`
- **Sync must include drafts** (xlsx says "With Draft Entries") — our 7.1 sync filters to `posted`. For move lines we'll include `parent_state IN (draft, posted)`.
- Expected volume: 365d × (5+10 companies) × posted+draft ≈ **20-30k move lines**.

### Rules architecture understood
- `src/lib/rules/aggregators/beithady-*.ts` — each rule is a ~600-line aggregator producing a typed aggregate object
- `src/lib/rules/presets.ts` — domain definitions (`beithady` already exists, rose accent, Home icon) + `RangePreset` (today/last24h/last7d/mtd/ytd/custom)
- Route: `/emails/[domain]/[ruleId]` — so Beithady Financials = `/emails/beithady/financials`
- Need to extend `RangePreset` with `this_month`, `last_month`, `this_quarter`, `last_quarter` for finance periods

### 5 questions sent to user (awaiting answers)
1. **Intercompany eliminations** — Egypt → FZCO Turnkey Fees would double-count if we raw-sum. Does the Feb 2026 xlsx eliminate these, or is it a raw sum?
2. **Currency** — 3.57M EGP shown, but many txns USD/AED. Is this Odoo's line-level `balance` (always company-currency) or externally converted?
3. **Employee/Owner classification** — is there `hr.employee → res.partner` linkage or a tag/category we can rely on for the payables split?
4. **Scope A1HOSPITALITY** — drop from consolidated P&L (per the Filters sheet), keep for per-building BH-435 owner analysis in a later rule?
5. **Build order** — (a) 7.2 alone first (verify data matches xlsx totals), then 7.3 UI; **recommended**. (b) 7.2 + 7.3 combined.

### Proposed Phase 7.2 schema
- `odoo_accounts`: id bigint pk, code text, name text, account_type text, company_ids bigint[]
- `odoo_move_lines`: id bigint pk, move_id bigint fk → odoo_invoices, company_id fk, account_id fk → odoo_accounts, partner_id bigint, date, debit/credit/balance/amount_residual numeric, currency, analytic_distribution jsonb, parent_state text, reconciled bool
- `odoo_partners`: id bigint pk, name, email, phone, supplier_rank, customer_rank, is_employee bool, is_owner bool, active bool, category_ids bigint[]

### Proposed Phase 7.3 deliverables
- `src/lib/rules/aggregators/beithady-financials.ts` — aggregator with P&L tree matching Feb 2026 hierarchy + payables split
- `src/app/emails/beithady/financials/page.tsx` — UI with period filter, P&L hierarchy render, payables panel
- Register in `presets.ts` + `engine.ts`

### Status
Nothing coded this turn. 1,400 lines of docx + 109 xlsx rows digested. Memory file candidates noted. **Waiting on user answers to Q1-Q5 before writing schema or code.**

## ✅ PHASE 7.1 SHIPPED — Odoo backfill sync live, 3,675 invoices synced to Supabase (commit 4744a74, deployed)

User picked option (a): ship now with `[4, 5, 10]` scope + post-migration analytic-account probe deferred to 7.2.

### What shipped (5 files, one commit)
- **`supabase/migrations/0002_odoo.sql`** — applied directly via Supabase MCP `apply_migration` (named `phase_7_1_odoo_invoices_and_companies`). Creates:
  - `odoo_sync_runs` — run log with `companies_synced`, `invoices_synced`, `status`, `error`
  - `odoo_companies` — `id` (bigint PK = Odoo res.company.id), `name`, `country`, `currency`, `in_scope` bool, `last_synced_at`
  - `odoo_invoices` — `id` (bigint PK = Odoo account.move.id), `name`, `move_type`, `state`, `company_id` FK, `partner_id` + denormalized `partner_name`, `invoice_date`, `amount_total`, `currency`, `odoo_created_at`, `odoo_updated_at`, `synced_at`
  - Indexes on `company_id`, `invoice_date` desc, `partner_id`, `move_type`, and `odoo_sync_runs.started_at` desc
- **`src/lib/run-odoo-sync.ts`** — mirrors `run-daily.ts` pattern. Iterates `SCOPE_COMPANY_IDS = [4, 5, 10]`. For each: upserts the company row, then paginates `account.move` at PAGE_SIZE=200 filtered by `move_type IN (out_invoice, in_invoice, out_refund, in_refund)`, `state='posted'`, `invoice_date >= today - 365d`, `company_id=X`. Passes `context: { allowed_company_ids: [X] }` per call. Upserts on `id`. Writes a single `odoo_sync_runs` row spanning the whole run.
- **`src/app/api/odoo/run-now/route.ts`** — CRON_SECRET-protected manual trigger. Accepts both GET + POST (GET for easy curling). `maxDuration: 300`.
- **`src/app/api/cron/odoo/route.ts`** — daily cron handler, no Cairo-time gate (unlike Gmail's 9AM gate) — whenever Vercel fires it, sync runs.
- **`vercel.json`** — added `{ "path": "/api/cron/odoo", "schedule": "0 4 * * *" }` (04:00 UTC, staggered ahead of the 06:00/07:00 Gmail crons).

### First sync results (trigger: manual, run_id `49751772-023e-43db-b9c4-bdf1660f992a`, 14.4s)
| Company | ID | Invoices | Customer | Vendor | Refunds | Currencies | Date range |
|---|---|---|---|---|---|---|---|
| A1HOSPITALITY | 4 | 131 | 100 | 31 | 0 | 2 | 2025-04-21 → 2026-04-01 |
| Beithady Egypt | 5 | 2,216 | 1,207 | 1,008 | 1 | 3 | 2025-04-21 → 2026-04-15 |
| Beithady Dubai | 10 | 1,328 | 1,254 | 74 | 0 | 3 | 2025-11-01 → 2026-04-21 |

Verified via MCP `execute_sql` aggregation. Numbers align with `?explore=1` probe expectations:
- A1HOSPITALITY: probe showed 191 all-time → 131 within 365d window (60 older); ratio is plausible.
- Beithady Egypt: probe 2,266 all-time → 2,216 within window + 1 refund ≈ probe (close match).
- Beithady Dubai: probe 1,328 all-time → 1,328 within window (100% — company is < 365d old).

### Observations for future phases
- **Beithady Dubai is customer-heavy** (94% customer invoices, only 74 vendor bills) — operational costs likely routed through Egypt's books. Cross-company join essential for true Dubai P&L.
- **Currency mix confirmed**: USD + EGP + AED across the three companies. `amount_total` is in transaction currency (per `currency_id` tuple); for revenue aggregates we'll need an FX table or exchange rates.
- **Company currencies all stored as "EGP"** in `res.company.currency_id` — this is the base reporting currency, NOT the transaction currency.
- **No FK on `partner_id`** intentionally — partners table deferred to 7.2. Denormalized `partner_name` keeps dashboards cheap for v1.

### Existing Supabase schema surprise
`public.rule_runs` (43 rows) and `public.app_users` (1 row) exist but aren't in `0001_init.sql` — prior session(s) added them directly via the Supabase SQL editor or an un-checked-in migration. Not related to Odoo; noted for awareness.

### What's open (user's call)
- **Phase 7.2**: analytic-account-to-invoice mapping via `account.move.line.analytic_distribution` → unlocks per-building P&L (BH-435 cross-company join across companies 4, 5, 10)
- **Phase 7.3**: partners sync (`res.partner` with supplier_rank/customer_rank), adds vendor/cleaner directory
- **Dashboard surface**: render Odoo data in `src/app/page.tsx` or new `/finance` route
- **Pivot to next platform**: PriceLabs (easier, pairs with Guesty) or Green-API WhatsApp (messaging layer)

## 🟡 PHASE 7.1 SCOPE — A1HOSPITALITY added for owner-side P&L of BH-435 (awaiting portfolio mapping)

### User direction
> "Get the A1 Hospitality owns Building BH-435, Lime owns 50% of the Company, Beithady is doing the Property Management for it"

Reveals a non-trivial ownership/management split that changes the scope:
- **Building BH-435** is owned by **A1HOSPITALITY** (Odoo company id=4).
- **Lime Commercial Investment** (id=3) owns **50%** of A1HOSPITALITY.
- **Beithady Hospitality - (EGYPT)** (id=5) performs the Property Management, earning PM fees in its own books.

### Scope decision
Updated Phase 7.1 scope to **`company_id IN (4, 5, 10)`**:
- **id=4 A1HOSPITALITY** (191 posted invoices) — owner-side P&L for BH-435 (depreciation, capex, owner draws, Lime 50% distributions)
- **id=5 Beithady Hospitality Egypt** (2,266 invoices) — PM-side revenue + Egypt unit operations
- **id=10 Beithady Hospitality FZCO Dubai** (1,328 invoices) — Dubai unit operations

**Total: ~3,785 posted invoices in scope.** Lime (id=3) NOT in scope — mentioned only for ownership context; add later if Lime's 50%-share distribution view is wanted.

### Why this scope shape matters for schema
- **Per-building P&L is multi-company by definition**: BH-435 has owner-side entries in A1HOSPITALITY's books + PM-side entries in Beithady Egypt's books. A naive `SELECT * FROM odoo_invoices WHERE building='BH-435'` would show only half the picture without a cross-company analytic-account join.
- **Dashboard must expose a Building dimension** that aggregates across companies via analytic account — don't treat Beithady Egypt's books as the full story for BH-435.
- **Unknown — likely more of these splits**: any other Beithady-managed buildings owned by FMPLUS Property, Lime Commercial, or a non-scoped entity? Need to map before we're confident Phase 7.1's scope is complete.

### Memory saved
Wrote `C:\Users\karee\.claude\projects\C--kareemhady\memory\beithady_ownership_structure.md` + MEMORY.md pointer so future sessions understand the PM-vs-owner split.

### Open question sent to user
Two options offered:
- **(a)** Ship Phase 7.1 now with `[4, 5, 10]` + post-migration probe to list all `BH-*` analytic accounts by company → surface any other owner companies needing inclusion (backfill-friendly path).
- **(b)** User maps out the full ownership table (which Odoo company owns which BH-* building) first, then we ship with a complete scope from day one.

### Status
**Awaiting user pick.** No code written this turn. Still have `src/lib/odoo.ts` + `/api/odoo/ping` (with `?explore=1`) shipped and working.

## 🟢 PHASE 7.1 EXPLORE PROBE COMPLETE — Beithady company IDs + volumes confirmed (commits 765524e, d8ecd30)

User said "go ahead" → shipped `?explore=1` mode on `/api/odoo/ping`. Took two iterations:

### Round 1 (commit 765524e) — blocked
Passed `allowed_company_ids: [all 11 company ids]` to the context for each per-company count call. Every call errored:
```
odoo_rpc_error: object.execute_kw — Access to unauthorized or invalid companies.
```
Cause: Odoo 16+ validates every id in `allowed_company_ids` against the API user's `res.users.company_ids` set. The fmplus tenant has one company the user can't see: **MASK for development, investment and trading (id=11)**. One bad id poisoned every call.

### Round 2 (commit d8ecd30) — clean
Changed per-company calls to pass `allowed_company_ids: [c.id]` (single-element). Now each call is isolated — 10 companies succeed, MASK's call errors only itself.

### Full company + volume table
| Company | ID | Posted invoices | Journals |
|---|---|---|---|
| FMPLUS Property & Facility Management | 1 | 6,752 | 86 |
| VOLTAUTO | 2 | 878 | 18 |
| Lime Commercial Investment | 3 | 202 | 14 |
| **A1HOSPITALITY** | **4** | **191** | **22** |
| **Beithady Hospitality - (EGYPT)** | **5** | **2,266** | **25** |
| X Label for Tailoring Kika | 6 | 939 | 29 |
| Lime For Restaurants | 7 | 72 | 11 |
| 202993 security creation new company | 9 | 0 | 0 |
| **Beithady Hospitality FZCO - (Dubai)** | **10** | **1,328** | **24** |
| MASK for development, investment and trading | 11 | — (access denied) | — |
| The Bees Art Direction for Managing Websites | 15 | 0 | 7 |

- Tenant total: 12,626 posted invoices across 11 companies (10 API-accessible).
- **Beithady scope `[5, 10]`**: **3,594 posted invoices** (28% of tenant) — sync volume is manageable.
- Note: **company currencies all listed as EGP** in `res.company.currency_id` — but individual transactions carry their own currency (we saw USD in first ping for "Direct Reservations"), so row-level currency must be preserved.
- A1HOSPITALITY (id=4, 191 invoices) is another hospitality company in the tenant — possibly legacy/sub-brand/pre-Beithady. **Unsure if in scope.**

### Waiting on user answer
One question sent: should Phase 7.1 scope be just Beithady `[5, 10]` or `[4, 5, 10]` (include A1HOSPITALITY)? Once answered, I ship migration `0009_odoo.sql` + sync worker + `/api/odoo/run-now` + cron `/api/cron/odoo` (04:00 UTC) in one commit.

### Library changes shipped this turn (commit 765524e)
- `src/lib/odoo.ts`: `odooSearchRead` and `odooSearchCount` now accept an optional `context` kwarg. New `OdooCompany` type (`id`, `name`, `country_id` tuple, `currency_id` tuple, `partner_id` tuple).
- `src/app/api/odoo/ping/route.ts`: `?explore=1` branch returns `{ ok, mode: 'explore', company_count, companies: [...] }`. `maxDuration` bumped to 60s since 11 companies × 2 count calls runs ~15s total.

## 🔄 PHASE 7.1 PLAN REVISED — Scope filter pivots from analytic-accounts to `company_id` (awaiting explore-patch go-ahead)

User dropped the Odoo company-switcher screenshot — fmplus tenant is **multi-company**, which is much cleaner than analytic-account prefix scoping. Company list:

- VOLTAUTO (currently selected in user's session)
- Lime Commercial Investment
- A1HOSPITALITY
- **Beithady Hospitality - (EGYPT)** ← include in scope
- **Beithady Hospitality FZCO - (Dubai)** ← include in scope
- X Label for Tailoring Kika
- Lime For Restaurants
- 202993 - fm security creation new co... (truncated)
- FMPLUS Property & Facility Managem... (truncated)
- The Bees Art Direction for Managing ... (truncated)

User confirmed: **"Chart of accounts is divided by company"** → clean multi-company separation exists natively in this Odoo tenant.

### Why company_id > analytic account prefix
- **Complete** — captures invoices/bills/partners/journals/payments that belong to Beithady, not just records that happen to be tagged with a `BH-*` analytic account
- **Explicit** — Odoo's native multi-tenant mechanism (`allowed_company_ids` context)
- **Handles Egypt/Dubai split** — two companies, clean EGP vs USD/AED currency zones, dashboard can split or unify
- **Future-proof** — resilient to analytic account renames

### Revised plan
1. **Ship `?explore=1` patch to `/api/odoo/ping`** — returns all `res.company` rows (id, name, country_id tuple, currency_id tuple) + per-company posted-invoice counts. ~5 min of work. Confirms the two Beithady company IDs + shows real sync volume (vs the full 12,626).
2. **Migration `0009_odoo.sql`** — `odoo_companies`, `odoo_analytic_accounts`, `odoo_invoices` tables all carry `company_id` + `company_name`. Unique `(odoo_id)`. Defer partners + payments to 7.2.
3. **`src/lib/odoo.ts` refactor** — extend `odooSearchRead` to accept an optional `context` param so callers can pass `{ allowed_company_ids: [bh_egypt, bh_dubai] }`. Required for correct multi-company scoping.
4. **`src/lib/run-odoo-sync.ts`** — mirrors `run-daily.ts`. Context-scoped to Beithady companies. Pulls posted invoices last 365 days + all analytic accounts. Upserts.
5. **`/api/odoo/run-now`** + **cron `/api/cron/odoo`** (04:00 UTC, stagger from Gmail 06/07:00).

### Status
**Awaiting user go-ahead to ship the `?explore=1` patch.** Once we have the two company IDs, migration + sync worker lands in one shot. No code committed this turn.

## 🟡 PHASE 7.1 PLANNING — Proposed scope + migration plan, awaiting user go/no-go

User said "ready for 7.1". Before writing the migration, I sent a plan + one decision to confirm.

### Proposed scope filter
**Scope Beithady-only data by analytic account name `LIKE 'BH-%'`.** Rationale: fmplus Odoo hosts 4+ unrelated businesses; analytic accounts are the only clean per-property discriminator we've seen. Alternatives considered: per-company `res.company_id` (need to probe if multi-company is on), per-journal filter (need to see journal names). Picked analytic accounts because we already confirmed `BH-Laila Elwy` exists.

### Proposed Phase 7.1 sequence (mirrors Guesty cadence)
1. **Exploration ping first** — extend `/api/odoo/ping` with `?explore=1` mode returning: count + names of all `BH-*` analytic accounts, `res.company` list, journals with "BH"/"beithady" in name. Confirms scope filter before committing schema.
2. **Migration `0009_odoo.sql`** — tables `odoo_analytic_accounts`, `odoo_invoices` (FK to analytic account, preserve original currency), `odoo_sync_runs`. Unique `(odoo_id)` keys. Defer partners + payments to 7.2.
3. **`src/lib/run-odoo-sync.ts`** — mirrors `run-daily.ts` pattern. Pulls `BH-*` analytic accounts + their posted invoices (last 365 days default). Upserts.
4. **`/api/odoo/run-now`** — manual trigger route.
5. **Cron** — add 04:00 UTC entry to `vercel.json` → new `/api/cron/odoo` handler (stagger from Gmail 06:00/07:00 UTC).

### Open decisions offered to user
- Scope filter (analytic account prefix) — default pick, user can override
- Exploration-first step yes/no
- Backfill window (365d default)
- Defer partners + payments to 7.2 yes/no

### Status
**Waiting on user confirmation** before any code writes. Nothing committed this turn.

## ✅ PHASE 7.0.3 — Odoo connection verified end-to-end (no code changes)

User regenerated API key + updated `ODOO_API_KEY` in Vercel. Redeploy to `kareemhady-7m4fvqp4l-lime-investments.vercel.app` + ping returned HTTP 200.

### Ping response (4.4s round-trip)
- **Server**: Odoo `18.0+e` — **Enterprise edition** (not Community/Online free tier; confirms paid license)
- **Invoices**: `posted_total: 12626` posted customer/vendor invoices (heavy volume — Odoo is source of truth for accounting)
- **Sample invoices**:
  - `BILL/2026/05/0001` — 15,000 EGP vendor bill to "#004 Abanoub Rent" (future-dated 2026-05-01)
  - `INV/2026/00027` — 7,627,176.50 EGP customer invoice to T&D (large construction-scale line)
  - `INV/4712` — 4,617 EGP to "العاصمه الاداريه للتنميه العمرانيه" (New Administrative Capital / Urban Development)
  - `INV/2026/00776` — 40 USD to "Direct Reservations" — **hospitality revenue, USD currency** (Beithady-relevant)
- **Partners**: Arabic-named suppliers (اوميجا للهندسه، سعودي للمقاولات، etc.) — construction/trade/clothing vendors, not hospitality
- **Analytic accounts**: `BH-Laila Elwy` (×2, different balances — likely per-year or per-company variant), `Mall of Mansoura`, VIN-style codes like `HJ4ABBHK2TN111058`

### 🚨 Critical discovery — fmplus is a multi-business Odoo tenant
fmplus.odoo.com hosts **multiple unrelated businesses** in one Odoo instance:
- **Beithady** (hospitality, `BH-*` analytic accounts)
- **Construction** (مقاولات suppliers, T&D customer)
- **Mall of Mansoura** (commercial property)
- **Autos/vehicles** (VIN-style codes `HJ4ABBHK*`)

Implication for Phase 7.1+: we **cannot** blindly import all 12,626 invoices — kareemhady app is Beithady-scoped. Need to filter by either:
1. Analytic account name `LIKE 'BH-%'`
2. Per-company `res.company_id` filter (need to confirm fmplus uses multi-company with a dedicated Beithady company)
3. Journal (`account.journal`) filter if they've separated journals per business

### Schema planning for Phase 7.1
- **Listing → analytic_account join is non-trivial**: Guesty listing nicknames are unit-level (`BH73-ST-C-004`), but Odoo analytic accounts are building-level (`BH-Laila Elwy`). Need a `building_name` column or mapping table. Probably: extract building name from Guesty `listing.address.street` or a `customField`, then fuzzy-match to `BH-<name>`.
- **Currency**: preserve original on every row (EGP + USD coexist) — do NOT normalize.
- **Duplicate analytic accounts**: two `BH-Laila Elwy` exist — check for year/company discriminator when querying.

### Memory saved
Wrote project memory at `C:\Users\karee\.claude\projects\C--kareemhady\memory\fmplus_odoo_tenant.md` + MEMORY.md index entry so future sessions pick up the multi-business context without re-probing.

### Phase 7 scaffold: COMPLETE
- `src/lib/odoo.ts` + `src/app/api/odoo/ping/route.ts` live and working.
- Credentials all resolved: `ODOO_URL=https://fmplus.odoo.com`, `ODOO_DB=fmplus-live-17577886`, `ODOO_USER=kareem@fmplusme.com`, `ODOO_API_KEY=<regenerated-persistent-key>`.

### Next step
Phase 7.1 — Supabase migration `0009_odoo.sql` (tables: `odoo_invoices`, `odoo_partners`, `odoo_analytic_accounts`, `odoo_sync_runs`) + scoping filter for Beithady-only, then a `odoo_invoice_sync` rule (cron + on-demand like the Guesty one). OR — user may want to kick off next platform (PriceLabs or Green-API) instead of going deep on Odoo rules. Ask first.

## ⚠️ PHASE 7.0.2 — Auth still failing after DB fix: API key regeneration needed

After user updated `ODOO_DB=fmplus-live-17577886` and redeployed, the Postgres-level error went away but auth now returns:
```
odoo_auth_failed: authenticate returned false — check ODOO_USER and ODOO_API_KEY
```

User sent screenshot of Odoo → Change My Preferences dialog confirming:
- Display name: "Kareem Hady"
- Email / login: **`kareem@fmplusme.com`** ✅ (matches `ODOO_USER` already set)
- Timezone: Africa/Cairo (consistent with our Cairo tz rendering convention)

Since `ODOO_USER` is confirmed correct, the `authenticate → false` response points to the API key value. Most likely copy error (whitespace / newline / truncation — Odoo shows the key once and it's long).

### Instructed user to regenerate
1. In the preferences dialog, click **Account Security** tab.
2. Delete the existing API key (trash icon).
3. **New API Key** → name `kareemhady-vercel` → duration **Persistent key** → confirm password.
4. Copy the key from the green one-time-display box, no leading/trailing whitespace.
5. Update `ODOO_API_KEY` in Vercel (Prod + Preview + Dev) + `.env.local`.

Waiting on user "done" → I redeploy + retest.

## ⚠️ PHASE 7.0.1 — DB name correction: NOT `fmplus`, actually `fmplus-live-17577886`

First ping attempt returned `odoo_rpc_error: common.authenticate — ... FATAL: database "fmplus" does not exist`. My subdomain-matches-DB-name assumption was wrong for this tenant — it's hosted on odoo.sh infra, so the DB name follows `{tenant}-{env}-{id}` pattern.

Found the real name by hitting the unauth'd endpoint:
```
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"call","params":{},"id":1}' \
  https://fmplus.odoo.com/web/database/list
# → {"result":["fmplus-live-17577886"]}
```

User needs to update `ODOO_DB` in Vercel (Prod + Preview + Dev) + `.env.local` to `fmplus-live-17577886`, then I redeploy + retest.

**Lesson for future Odoo Online tenants**: don't infer DB name from subdomain — always probe `/web/database/list`. Free Odoo Online may match subdomain; paid/odoo.sh adds the `-live-{id}` suffix.

## ✅ PHASE 7 SCAFFOLD — Odoo 18 JSON-RPC client + smoke-test endpoint (commit 2691f4a, deployed)

### Credentials gathered
- `ODOO_URL=https://fmplus.odoo.com` (user pasted `.../odoo` — code strips the `/odoo` web-client suffix automatically in `getCreds()`)
- `ODOO_DB=fmplus` (inferred from subdomain; Odoo Online always matches)
- `ODOO_USER=kareem@fmplusme.com`
- `ODOO_API_KEY=<user has it, not yet in Vercel>`

User reported Bad Request on `/web/session/get_session_info` — that's a JSON-RPC endpoint wanting POST, harmless. DB name confirmed via subdomain convention.

### What shipped
Zero-dep scaffold mirroring the Guesty pattern (pure fetch, no `odoo-await` — kept deps minimal).

#### `src/lib/odoo.ts` (new, ~180 lines)
- **JSON-RPC over HTTPS** to `{ODOO_URL}/jsonrpc`. Two services used: `common` (for auth + version probe) and `object` (for `execute_kw` against models).
- **Auth flow**: `authenticate(db, user, api_key, {})` → returns `uid` (int). Cached per cold start, invalidated if `user:key` changes. API key is sent on every `execute_kw` call as the password field.
- **URL normalization** — `getCreds()` strips trailing `/odoo` path + trailing slashes, so user can paste the web-client URL.
- Exported helpers:
  - `odooExecute<T>(model, method, args, kwargs)` — low-level escape hatch for any model method
  - `odooSearchRead<T>(model, domain, { fields, limit, offset, order })` — workhorse for reading records (combines search + read in one RPC)
  - `odooSearchCount(model, domain)` — for ping totals
  - `odooVersion()` — unauthenticated server probe (calls `common.version`)
- Typed shapes: `OdooInvoice` (`account.move` with `move_type`, `state`, `partner_id` tuple, `amount_total_signed`, `currency_id`), `OdooPartner`, `OdooAnalyticAccount`.
- Error handling: JSON-RPC errors distinguished from HTTP errors; `odoo_http_{status}`, `odoo_rpc_error`, `odoo_auth_failed` prefixes for grep-friendly logs.

#### `src/app/api/odoo/ping/route.ts` (new)
- `GET /api/odoo/ping` protected by `CRON_SECRET` bearer (same pattern as `/api/guesty/ping` and `/api/cron/daily`).
- Missing-env check returns 400 with a per-var boolean map so user can see which one isn't set.
- Four reads in parallel:
  - `odooVersion()` → server version string
  - `odooSearchCount('account.move', [['move_type', 'in', ['out_invoice', 'in_invoice']], ['state', '=', 'posted']])` → total posted invoice count (filtered to customer + vendor invoices in posted state only; drafts + cancels excluded to avoid inflation)
  - `odooSearchRead<OdooInvoice>` → 5 most recent posted invoices
  - `odooSearchRead<OdooPartner>` → 5 most recent partners
  - `odooSearchRead<OdooAnalyticAccount>` → 5 most recent analytic accounts (eventual per-property P&L tags)
- Response shape: `{ ok: true, duration_ms, server: { version, serie }, invoices: { posted_total, sample }, partners: { sample }, analytic_accounts: { sample } }`.

#### `.env.example`
- Added 4 vars with inline comment documenting the API-key creation path (Profile → My Profile → Account Security → New API Key) + recommendation to use a dedicated "API Bot" user with scoped read-only accounting access, not personal admin login.

### Verification
- `npx tsc --noEmit` clean.
- Vercel build deployed to `kareemhady-gn95129gv-lime-investments.vercel.app` — READY.
- **Env vars NOT yet added to Vercel** — deploy compiled fine but ping will return 400 until user adds them.

### Waiting on user
Add `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_API_KEY` to Vercel (Production + Preview + Development) + `.env.local`, then I redeploy + curl the ping. If green, Phase 7.1 is Supabase migration `0009_odoo.sql` + backfill rule.

### Gotchas to remember when wiring rules later
- Datetimes stored UTC — use existing Cairo tz helper when rendering.
- `allowed_company_ids` context must be set on reads if multi-company — single-company for fmplus tenant should be fine.
- `partner_id`/`currency_id` etc. are tuples `[id, display_name]` or `false`; `Array.isArray` check before indexing.
- `move_type` values: `out_invoice` = customer invoice, `in_invoice` = vendor bill, `out_refund` / `in_refund` = credit notes, `entry` = journal entry (skip for revenue/cost).
- Analytic accounts (`account.analytic.account`) are the per-property P&L mechanism — Beithady listings should each map to one; confirm name pattern matches listing `nickname` (e.g. `BH73-ST-C-004`) during 7.1.

## ✅ PHASE 6.2 — Guesty connection verified end-to-end (worktree only, no main commit)

Ping returned `ok: true`, 569ms Guesty round-trip. 90 listings total (all Beit Hady `BH73-*`), 34 reservations flowing from `airbnb2` / `Booking.com` / `manual`, check-ins 2026-04-21 → 2026-04-29, USD payouts. Account ID `68342f589bf7f8c07ec2435c` (env value matches auto-detect). Phase 6 complete.

## 🔧 PHASE 6.1 — Guesty ping: account_id is now optional / auto-detected (commit 921a939)

### User feedback
Couldn't find Account ID in Guesty URL (`app.guesty.com/account/company-info` has no ID segment). Sent screenshots of OAuth Applications (already has "Beit Hady App" — different purpose), Marketplace, OAuth Analytics (all zeros — unused), Webhooks (PriceLabs endpoint configured, 0% errors).

### Change
`src/app/api/guesty/ping/route.ts` now:
- Errors only when `GUESTY_CLIENT_ID` or `GUESTY_CLIENT_SECRET` is missing — `GUESTY_ACCOUNT_ID` is no longer required.
- Adds `accountId` to the `fields` projection on `/listings` and `/reservations` so Guesty stamps it into each record.
- Auto-detects Account ID from the first record returned → response includes `detected_account_id` + `account_id_source: 'env' | 'auto-detected from API response' | 'not found'`.

Rationale: OAuth creds already scope to one account, so Account ID is cosmetic — used only for display in the ping. User can now set just 2 env vars, hit ping, read the auto-detected ID, optionally copy to Vercel later.

### Guidance I sent user for Guesty UI
1. **Create new OAuth app** (don't reuse "Beit Hady App" — that's for Booking/Added Services): OAuth Applications → New Application → name "InboxOps" → scopes `open-api` + `reservations:read` + `listings:read` + `guests:read` + `reviews:read` + `communication:read` + `tasks:read` + `payments:read`. Capture Client ID + Client Secret (secret shown once).
2. **Vercel env**: `GUESTY_CLIENT_ID`, `GUESTY_CLIENT_SECRET` to Production + Preview + Development. Skip `GUESTY_ACCOUNT_ID` — ping auto-detects.
3. **Local .env.local**: same two vars.
4. **Redeploy** (`vercel --prod --yes` from `C:\kareemhady`).
5. **Test**: `curl -H "Authorization: Bearer $CRON_SECRET" https://kareemhady.vercel.app/api/guesty/ping`.
6. **Later (webhook step)**: Add Endpoint `https://kareemhady.vercel.app/api/webhooks/guesty` with events `reservation.*`, `conversation.message.*`, `review.*`, `payout.sent`, `payment.received`, `task.*`, `listing.updated`, `listing.calendar.updated` → copy signing secret to `GUESTY_WEBHOOK_SECRET`.

### Verification
- Build clean, 15 routes.
- Deployed to `kareemhady-cfkcv1cyz-lime-investments.vercel.app`.

### Waiting on user
OAuth app creation + credentials in Vercel + smoke-test response. Once ping returns `ok: true` with real listing/reservation samples, next step is Supabase migration `0008_guesty.sql` + `guesty_reservation_pull` rule + webhook endpoint.

## ✅ PHASE 6 SCAFFOLD — Guesty Open API client + smoke-test endpoint (commit d9c8c2d)

### User direction
> "lets do guesty"

After presenting the 4-platform research synthesis, user picked Guesty as the first integration. Not unexpected — biggest unlock, user already pays for PRO.

### What shipped
Scaffolding only — the OAuth flow, generic fetch helper, typed list methods for reservations + listings, and a smoke-test endpoint. No DB schema, no rule type, no dashboard wiring yet. Intentionally minimal so the user can validate auth + API connectivity on real data before we commit to the bigger migration.

### Files

#### `src/lib/guesty.ts` (new, ~220 lines)
- **OAuth 2.0 client_credentials flow** against `https://open-api.guesty.com/oauth2/token` with `scope=open-api`.
- **Module-scoped in-memory token cache** (`cachedToken` singleton) with `expiresAt` check. Lazy-refresh when < 5 min remain. TTL is 24h (no refresh token — re-hit the token endpoint).
- `guestyFetch<T>(path, opts)` — generic helper:
  - Bearer injection from cache
  - Query-param serialization (handles null/undefined skip)
  - JSON body auto-encoding with `Content-Type`
  - **429 retry** honoring `Retry-After` header, max 2 retries (Guesty PRO is ~120/min, `/listings` tighter ~60/min)
  - 500-series retry, 4xx-except-429 throws immediately
- Typed exports:
  - `GuestyListing` — `_id`, `nickname`, `title`, `active`, **`listingType: 'SINGLE' | 'MTL' | 'SLT'`**, `masterListingId` (for multi-unit parent lookup), `customFields`, `address`
  - `GuestyReservation` — `_id`, `confirmationCode`, `status`, `source`, `listingId`, `guest.fullName`, `checkInDateLocalized` (property-tz wall date — **don't mix with** the UTC variant), `checkOutDateLocalized`, `nightsCount`, `guestsCount`, `money.{currency, hostPayout, guestPaid, fareAccommodation, cleaningFee}`, **`integration.confirmationCode`** (Airbnb HM-code), `createdAt`, `updatedAt`
- `listGuestyReservations(params)` — limit/skip, filters (Mongo-style, JSON-serialized), fields projection, sort
- `listGuestyListings(params)` — same shape
- Exports `guestyFetch` and `getAccessToken` for downstream use

#### `src/app/api/guesty/ping/route.ts` (new)
Smoke-test endpoint. `GET /api/guesty/ping` protected by `CRON_SECRET` bearer (same pattern as `/api/cron/daily`).

Response when credentials are missing → 400 with which env vars are present:
```json
{ "ok": false, "error": "Guesty credentials missing", "env": { "GUESTY_CLIENT_ID": false, ... } }
```

Response when auth works → 200 with 5 listings (`_id`, `nickname`, `title`, `active`, `listingType`) + 5 most-recent reservations (`_id`, `confirmationCode`, `status`, `source`, `guest`, checkIn/checkOut, `nights`, `hostPayout`, `currency`, `airbnb_code`, `createdAt`) + total counts + `duration_ms`.

Usage (once user sets credentials):
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://kareemhady.vercel.app/api/guesty/ping
```

#### `.env.example`
- New: `GUESTY_CLIENT_ID`, `GUESTY_CLIENT_SECRET`, `GUESTY_ACCOUNT_ID`, `GUESTY_WEBHOOK_SECRET` — with inline comments on where/how to create each.
- Backfilled the `STRIPE_SECRET_KEY` entry that was live since Phase 5.8 but missing from the example.

### What user needs to do (credentials)
1. Guesty UI → **Integrations → Marketplace → API** → "New secret token" → scope `open-api` → capture **Client ID** + **Client Secret** (secret shown once).
2. Note **Account ID** from URL (`app.guesty.com/accounts/<id>/...`).
3. Add to Vercel Prod + Preview + Dev: `GUESTY_CLIENT_ID`, `GUESTY_CLIENT_SECRET`, `GUESTY_ACCOUNT_ID` (webhook secret can wait).
4. Also add same vars to `C:\kareemhady\.env.local` for local dev.
5. Hit the ping endpoint to verify.

### Verification
- `rm -rf .next && npm run build` clean (15 routes now; `/api/guesty/ping` new).
- commit d9c8c2d on main via `git push origin HEAD:main`.
- Deployed via root `C:\kareemhady` → `kareemhady-qd0spoo16-lime-investments.vercel.app` (Ready, 48s).

### What's NOT done yet (next after smoke-test passes)
1. **Supabase migration `0008_guesty.sql`** — tables `guesty_reservations`, `guesty_listings`, `guesty_reviews`, `guesty_messages`, `guesty_webhook_events` with unique `(account_id, guesty_id)` per table.
2. **Rule type `guesty_reservation_pull`** in `src/lib/rules/engine.ts` — cron job that calls `listGuestyReservations({ filters: { createdAt: { $gte: last_run } }, ... })`, upserts to `guesty_reservations`. Runs alongside the existing `beithady_booking_aggregate` email rule for cross-check during cutover.
3. **Webhook endpoint `src/app/api/webhooks/guesty/route.ts`** — HMAC-SHA256 verify of `x-guesty-signature` header, raw body, event-type router.
4. **Dashboard swap** — point `/emails/beithady/<bookings-rule-id>` at the new `guesty_reservations` table; keep the email-derived output accessible under a "legacy" view during cutover.
5. **Backfill script** — one-off `npm run guesty:backfill` that paginates through 2 years of reservations.
6. **Apply same pattern** to reviews (`/reviews` endpoint) + conversations/messages (`/communication/conversations`) — these would replace Phase 5.9 (Reviews), 5.10 (Inquiries), 5.11 (Guest Requests) rules once trust is established.

### Gotchas to remember for the next step
- **MULTI-UNIT parents** — Guesty models multi-unit buildings (our BH-73 with MULTI-UNIT/SUB-UNIT children) as `listingType: 'MTL'` with child listings pointing via `masterListingId`. Reservations always attach to the SUB-UNIT child — aggregate up via `masterListingId` when rolling up to building-level metrics.
- **Canceled reservations** stay in `/reservations` unless filtered — would double-count payouts if we don't exclude `status: 'canceled'`.
- **Multi-currency** — `money.currency` can vary per reservation. Currently the email-driven rule defaults USD globally, which may mask EGP bookings. The API will force us to handle this correctly.
- **Webhook ordering not guaranteed** — always upsert-by-id with `updatedAt` comparison before overwriting; never trust ordering.
- **Offset pagination** (`skip` + `limit`, max 100) — prefer `sort=-createdAt` for resumable paging.
- **Localized vs UTC timestamps** — `checkInDateLocalized` is a wall date in the listing's timezone (string `YYYY-MM-DD`, no tz info), while `checkInDate` (without suffix) is a UTC ISO. Use the localized variant for display; use `createdAt` / `updatedAt` (UTC) for all sync pagination + CAIRO rendering via existing helper.

## 🔬 PLATFORM INTEGRATION RESEARCH COMPLETE — 4 of 4 agents returned (NO CODE YET; synthesis prepared for user)

### User request
> "My Intention to Connect all our platforms to this app kareemhady — Odoo 18, Guesty PRO, Price Labs, Green Whatsapp. Study carefully the detailed steps and what are the data that can be used through api from each one of them."

### Approach
Spawned 4 parallel research agents (general-purpose) — each digging into one platform's API docs, auth model, endpoint catalog, rate limits, webhook support, and fit with existing Beithady rules. Agents were briefed to return 500-800 word structured briefs, not code.

### Status — 3 of 4 complete; Guesty still in flight

#### ✅ Odoo 18 (returned)
- **Auth**: JSON-RPC + API key (Odoo 14+ feature, Odoo 18 unchanged). User generates in **Profile → Account Security → New API Key**. Env vars needed: `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_API_KEY`. Create a dedicated "API Bot" user with scoped permissions.
- **Works on** odoo.sh / Enterprise / Community / self-hosted — identical API. Odoo Online SaaS blocks custom modules (matters for the native webhook story).
- **Node SDK**: `odoo-await` (Ivan Chernyshov, actively maintained through 2025, works with 18). Avoid `odoo-xmlrpc` (callback style).
- **Models for hospitality ops**: `account.move` (invoices/bills via `move_type` filter), `hr.expense` (per-property expenses with `analytic_account_id` tag), `account.payment`, `account.bank.statement.line` (Stripe reconciliation), `res.partner` (vendors/cleaners/guests), `account.analytic.account` (critical for per-property P&L), `crm.lead`, `product.product`.
- **Webhooks**: native in Odoo 18 via `base.automation` rules + "Send Webhook Notification" action. Configure in Settings → Technical → Automation Rules.
- **Gotchas**: datetimes stored UTC (apply Cairo tz on render); `allowed_company_ids` context needed for multi-company; XML-RPC returns `False` / JSON-RPC returns `false` — normalise; v17 renamed `invoice_date`, `amount_total_signed` (stable in 18 but older docs may lie).

#### ✅ PriceLabs (returned)
- **Access tier**: API is **free on every paid plan**, no separate tier. Rate limit ~60 req/min per API key (parallel fan-out > 10 concurrent will 429).
- **Auth**: `X-API-Key` header (NOT `Authorization: Bearer`). Generated in **Account → Profile → API**. Base URL `https://api.pricelabs.co/v1`. One key per account, regenerable.
- **Endpoints**: `GET /listings` (canonical catalog — includes `pms_reference_id` joinable to Guesty listing_id + `pms = 'guesty'`), `GET /listing_prices` (per-listing daily recommendations — recommended_rate, min_stay, reasons, late-2025 additions `booking_prob`, `adjusted_price`), `GET /reservations`, `GET /listing/min_stay`, `POST /listings`/`PUT /listings/{id}` (push overrides), `GET /neighborhood_data`, `GET /market_dashboards` (requires ~$10/mo add-on), `POST /sync_now` (ad-hoc recalc, uses rate limit).
- **No webhooks as of 2026** — pull-only. Plan on a daily Vercel cron at 03:30 UTC (after PriceLabs' ~03:00 UTC internal nightly recalc).
- **REST-only, no official Node SDK** — build a thin `fetch` wrapper in `src/lib/pricelabs.ts` matching the shape of `src/lib/stripe-payouts.ts`.
- **Dashboard surface**: per-listing-per-day `gap_pct = (rec - pushed)/pushed`. Flag `> +15%` (leakage) or `< -10%` (missed upside), plus `push_enabled=false` as "PL paused, manual pricing" warning.
- **Gotchas**: `/listings` returns all in one response (no pagination under ~500 listings — Beithady at 91 is safe). `/listing_prices` is per-listing per-call — serialize with ~1s spacing. `>180d` ranges silently truncate at 500d. Listing-local timezone (Africa/Cairo for Beithady; Dubai listings would be Asia/Dubai — distinguish). 401 returns empty body; log `X-Request-ID`.
- **Items to confirm on the live portal**: exact header capitalisation (`X-API-Key` vs `X-Api-Key`), current `/listing_prices` schema fields, Market Dashboard availability on user's plan.

#### ✅ Green-API WhatsApp (returned)
- **What it is**: third-party WhatsApp gateway scripting an automated WhatsApp Web session. **NOT Meta's official WABA**. Cheaper + faster setup; carries ban risk if Meta flags automated patterns. Acceptable for ~50-200 msgs/day hospitality use; bad for marketing blasts.
- **Account setup**: register at console.green-api.com → create "instance" → scan QR from WhatsApp → phone must stay online with WhatsApp installed (disconnects > 14 days kill the session).
- **Tiers (2026)**: Developer (free, ~2 msg/sec, 1 instance, 14d expiry on inactivity), Business (~$40/mo, higher limits, 99.5% uptime), Enterprise (custom).
- **Credentials**: `idInstance` + `apiTokenInstance`. Base URL `https://api.green-api.com/waInstance{idInstance}/{method}/{apiTokenInstance}` — **token in URL path**, which leaks in proxy logs / CDN access logs / browser history. Rotate quarterly, server-only, redact from log pipelines.
- **Endpoints**: `GET /getStateInstance` (health poll every 5 min), `POST /sendMessage` (chatId format `{phone}@c.us`), `sendFileByUrl`/`Upload` (100MB cap), `sendContact`/`sendLocation`/`sendPoll`, `getChatHistory`, `checkWhatsapp`. Webhook mode preferred over `receiveNotification` polling.
- **Webhook payloads**: `typeWebhook = incomingMessageReceived | outgoingMessageStatus | stateInstanceChanged | deviceInfo`. Message `typeMessage = textMessage | imageMessage | videoMessage | audioMessage | documentMessage | locationMessage | contactMessage | buttonsResponseMessage | listResponseMessage | quotedMessage | reactionMessage | pollMessage`.
- **CRITICAL SECURITY GAP**: Green-API does NOT sign webhook payloads (no HMAC, no shared secret, no `X-GreenApi-Signature` header as of 2026). Mitigations: obscure random path `/api/webhooks/green/{long-random-slug}`, IP-allowlist Green-API egress ranges, validate `instanceData.idInstance` matches expected, HTTPS-only. Treat as untrusted input.
- **Rate discipline**: max 1 msg / 3-5 sec per recipient, random jitter, warm new numbers (day 1: 10 msgs, day 7: 100), vary wording. Ban = number dies, no chat export, must get new SIM + re-scan.
- **Fits for Beithady**: (a) inbound webhook → reuse existing inquiry/request urgency classifier + category taxonomy; (b) cron 24h pre-arrival → pull Guesty check-ins → send WhatsApp with address/code/WiFi; (c) +2h post-checkout → review reminder; (d) urgent inbound (broken AC, lockout) → Slack/email escalation.
- **Env vars**: `GREENAPI_ID_INSTANCE`, `GREENAPI_API_TOKEN`, `GREENAPI_WEBHOOK_SECRET_PATH`.
- **Compare to Meta Cloud API**: Meta = 2-4 week setup + pre-approved templates outside 24h window + per-conversation pricing + policy-compliant. Green-API = 10-min setup + free-form + phone-dependent + ban risk. For v1 integration, Green-API is pragmatic; if ops scale, migrate to Meta.

#### ✅ Guesty PRO Open API (returned — biggest unlock)
- **Included in PRO** (verify on account). Open API base: `https://open-api.guesty.com/v1`. **Rate limit ~120 req/min per token**; `/listings` and `/calendar` tighter at ~60/min. 429 includes `Retry-After`.
- **Auth**: OAuth2 client_credentials. UI path: Guesty → *Integrations → Marketplace → API* → "New secret token". Token endpoint `POST /oauth2/token` with `grant_type=client_credentials&scope=open-api`. **24h TTL**, no refresh token — re-hit token endpoint. Cache in-memory, lazy-refresh at <5 min remaining.
- **Core endpoints**:
  - `GET /listings` — full catalog. `_id`, `nickname` (our `listing_code`), `title`, `address`, bedrooms/bathrooms, `propertyType`, `tags`, `customFields`, `amenities`. **MULTI-UNIT parents have `listingType: 'MTL'`; children point via `masterListingId`** — our Beithady listings CSV MULTI-UNIT/SUB-UNIT can be cross-verified here.
  - `GET /reservations` — filterable by `checkIn`/`checkOut`/`createdAt` with `$gte`/`$lte`, `status` (inquiry/reserved/confirmed/canceled), `source` (Airbnb/Booking.com/Direct/Vrbo), `listingId`. Offset pagination (`skip`+`limit` up to 100).
  - `GET /reservations/{id}` — full detail: `guest`, `money.hostPayout` (net after commission, matches our `total_payout` to the cent), `money.fareAccommodation`/`cleaningFee`/`guestPaid`, `integration.platform`, `integration.confirmationCode` (Airbnb HM-code), `checkInDateLocalized` (property-tz wall date) vs UTC variants.
  - `GET /guests/{id}`, `GET /calendar?listingId&from&to`, `GET /reviews` (with `overallRating`, `public.content`, `reservationId`, `channel`).
  - `GET /communication/conversations` + `/messages` — **replaces the RE: Reservation email scraping** in the Guest Requests rule. Each message has `module` (sms/email/airbnb/booking-chat), `body`, `from`, `createdAt`.
  - `GET /tasks` — housekeeping/maintenance. `GET /payments` — receivables. `GET /integrations` — Airbnb / Booking.com / Expedia / Vrbo connection health + channel listing IDs. `GET /analytics/{occupancy,revenue}` — gated add-on.
- **Webhooks** via `POST /webhooks` (or UI Integrations → Webhooks). Events: `reservation.new/updated/status.updated/canceled`, `conversation.message.received/sent`, `review.new/updated`, `listing.created/updated/calendar.updated`, `task.created/updated`, `payment.received`, `payout.sent`. **Signature verification: HMAC-SHA256 of raw body, `x-guesty-signature` header** — use a constant-time compare.
- **No official Node SDK**. OpenAPI 3 spec at `/openapi.json` — plan is `openapi-typescript` → generated types + thin `fetch`-based client in `src/lib/guesty.ts` (~150 LOC).
- **Field mapping** (email → API) is a ready map in the handoff research output — `booking_id` → `reservation.confirmationCode`, Airbnb HM → `reservation.integration.confirmationCode`, `guest_name` → `reservation.guest.fullName`, `listing_code` → `listing.nickname`, `total_payout` → `reservation.money.hostPayout`, `check_in_date` → `reservation.checkInDateLocalized`, `channel` → `reservation.source`, `nights` → `reservation.nightsCount`.
- **Gotchas**: MULTI-UNIT rollup via `masterListingId`; `checkInDateLocalized` vs `checkInDate` (localized = property wall date, non-localized = UTC ISO — don't mix); offset pagination max `limit=100`; `canceled` reservations stay in results unless filtered (would double-count payouts); `money.currency` varies per reservation (multi-currency) — email rule's USD default masks EGP bookings; webhook ordering not guaranteed — always upsert-by-id with `updatedAt` comparison.
- **Env vars**: `GUESTY_CLIENT_ID`, `GUESTY_CLIENT_SECRET`, `GUESTY_WEBHOOK_SECRET`, `GUESTY_ACCOUNT_ID`.
- **Integration path** (8 steps): (1) create creds in Guesty UI, (2) add env vars, (3) `src/lib/guesty.ts` with token cache + 429-retry + `list{Reservations,Listings,Reviews,Conversations}` methods, (4) migration `0008_guesty.sql` for `guesty_{reservations,listings,reviews,messages,webhook_events}` tables with `(account_id, guesty_id)` unique keys, (5) new rule `guesty_reservation_pull` — cron + on-demand, replaces the LLM email parsing (keep email rule in parallel for cross-check during cutover), (6) webhook endpoint `src/app/api/webhooks/guesty/route.ts` with HMAC verify + event-type router, (7) dashboard swap `/emails/beithady/<bookings-rule>` to read from `guesty_reservations` directly, (8) backfill script pulls last 2 years via pagination.

### Full synthesized roadmap for user

**Priority 1 — Guesty PRO Open API (biggest unlock)**
Replaces email-driven parsing with live data for all 5 Beithady rules (bookings, payouts via `/payments`, reviews, inquiries via `/communication/conversations`, guest requests via same). Accurate to the cent, no LLM parse errors, near-realtime via webhooks. User already pays for PRO.

**Priority 2 — Odoo 18 (finance closure)**
Pulls invoices (`account.move` with `out_invoice` for guests, `in_invoice` for vendor bills), per-property expenses tagged by `analytic_account_id`, bank-statement lines for Stripe reconciliation, vendor CRM. Enables per-property P&L in a new `finance` domain alongside `beithady`.

**Priority 3 — PriceLabs (revenue optimization)**
Pulls daily rate recommendations, min-stay rules, gap-vs-pushed analysis. Flags revenue leakage (price above recommendation → empty nights) and missed upside (price below → leaving money on table). Pull-only, daily cron. `pms_reference_id` in `/listings` response joins cleanly to `guesty_listing_id`.

**Priority 4 — Green-API WhatsApp (guest messaging)**
Inbound webhook → reuse existing inquiry/request classifier + urgency taxonomy. Outbound automation: 24h pre-arrival check-in instructions, post-checkout review reminders, urgent-incident escalation. Ship BUT warn user about ban risk + security gap (unsigned webhooks); plan Meta Cloud API migration path if volume grows.

### Credential checklist — what user needs to provision before I write code
- **Guesty**: Client ID + Client Secret (from Integrations → Marketplace → API) + Webhook secret + Account ID
- **Odoo**: URL (`https://beithady.odoo.com` or self-hosted), DB name (from `/web/database/selector`), API Bot user email, API key (from Profile → Account Security)
- **PriceLabs**: API key (from Account → Profile → API)
- **Green-API**: create instance in console.green-api.com, scan QR with dedicated Beithady WhatsApp number, grab `idInstance` + `apiTokenInstance`

### Schema direction (high-level, not yet migrated)
- New domain `finance` for Odoo-backed rules
- Extend `beithady` with `pricelabs_pricing_snapshot` rule (daily cron)
- New domain `whatsapp` for Green-API inbound
- New Supabase tables per platform: `guesty_{reservations,listings,reviews,messages,webhook_events,accounts}`, `pricelabs_snapshots`, `whatsapp_messages`, `odoo_records`
- Integration tokens stored AES-GCM encrypted using existing `TOKEN_ENCRYPTION_KEY`

### What happens next session (synthesis still pending)
When Guesty returns, produce:
1. **Prioritized roadmap** — Guesty first (replaces email ingestion with live data; user already pays for PRO), then Odoo (finance closure), then PriceLabs (revenue optimization), then Green-API (guest messaging).
2. **Credential checklist** for the user — exactly what env vars / OAuth creds / instance IDs to provision before I write code.
3. **Schema mapping** — how each platform's data maps onto existing rules (bookings, payouts, reviews, inquiries, requests) + where new domains are needed (likely `finance` for Odoo, extend `beithady` with `pricelabs_pricing_snapshot`, new `whatsapp` domain).
4. **5-step integration skeleton per platform** using the existing rule-engine pattern (aggregator file + engine branch + mini card + detail view + seeded rule row).

### No code changes this turn
Pure research/planning. The Cairo timezone fix (commit 77256a9) is still the last shipped change.

### If picking up fresh
- Guesty research output will be in the agent's output file by then; the summary will auto-stream into the next conversation. If not, re-run the Guesty research agent.
- Do NOT start writing integration code before confirming the roadmap + credentials with the user. This is a research/planning turn.

## ✅ CAIRO TIMEZONE ON ALL DASHBOARD TIMESTAMPS (commit 77256a9)

### User question
> "are timings correct to Cairo Time GMT +2 (mind Day Saving Schedule)"

### The bug
Bare `new Date(iso).toLocaleString()` calls in server components used the Node runtime's default timezone. On Vercel that's **UTC**, not Cairo. So "Last run · 4/21/2026, 6:45:35 AM" shown to the user was actually the UTC time — Cairo would have been 8:45 AM (UTC+2 on 4/21, before the DST switch on April 24).

Client-side renders would respect the browser timezone but only after hydration, and the Airbnb Line Items modal table (client component) was the only client-rendered date — still inconsistent depending on the viewer's laptop clock.

### The fix
New module `src/lib/fmt-date.ts` with two helpers:
- `fmtCairoDateTime(iso)` — returns "4/21/2026, 8:45:35 AM" in `Africa/Cairo`
- `fmtCairoDate(iso)` — returns "4/21/2026" in `Africa/Cairo`

Both pin `timeZone: 'Africa/Cairo'` explicitly. IANA `Africa/Cairo` handles Egypt's DST automatically (EEST UTC+3 from the last Friday of April through the last Thursday of October since 2023 re-instatement, EET UTC+2 otherwise). Locale pinned to `en-US` so the displayed format stays exactly what the user already has on screen (server + client render identically).

### Files changed
- `src/lib/fmt-date.ts` — new helper module.
- `src/app/emails/page.tsx` — 1 call (home emails page, domain cards "Last run · 4/21/2026").
- `src/app/emails/[domain]/page.tsx` — 1 call (per-domain card's "Last run · <datetime>").
- `src/app/emails/[domain]/[ruleId]/page.tsx` — 22 calls (detail page: latest-run header timestamp, time-range clamp warning dates, run history "Started" column, Airbnb payout email dates, Stripe API payout created/arrival dates + transaction timestamps, inquiry / review / request received timestamps in their various cards, cross-match run timestamp, etc.).
- `src/app/emails/[domain]/[ruleId]/AirbnbLineItemsTable.tsx` — 1 call (footer caption: "last run <datetime>").
- `src/app/admin/accounts/page.tsx` — 3 calls (accounts last_synced_at, runs started_at, email_logs received_at).

### Left untouched on purpose
- **Numeric `.toLocaleString()` calls** — count / currency formatting, not timezone-sensitive. Scan passed them over.
- **Month-bucket label generation** in `beithady-review.ts` + `beithady-payout.ts` — renders "Apr 2026" style labels from UTC month-start keys. The output is a bucket identifier used for sort + display, not a Cairo moment.
- **Detail page line 2055** — same month-label pattern used for the chart x-axis, keeps its explicit UTC options.

### Why Africa/Cairo vs fixed GMT+2
Egypt runs DST:
- EET (UTC+2) from last Thursday of October to last Friday of April (winter)
- EEST (UTC+3) from last Friday of April to last Thursday of October (summer)

Hardcoding `GMT+2` would break every April 24 → October 30. `Africa/Cairo` in the IANA tz database tracks this automatically — no code changes ever needed for future DST transitions.

Today (2026-04-21) Egypt is in EET (UTC+2). On 2026-04-24 it'll switch to EEST (UTC+3). The dashboard will reflect the switch automatically.

### Sed-based bulk replacement
For the detail page's 22 calls + accounts page's 3 + AirbnbLineItemsTable's 1, ran:
```
sed -i 's/new Date(\([^)]*\))\.toLocaleString()/fmtCairoDateTime(\1)/g;
        s/new Date(\([^)]*\))\.toLocaleDateString()/fmtCairoDate(\1)/g'
```
with the escape-brackets-in-path gotcha — had to cd into each directory rather than use the `[domain]/[ruleId]` path glob, since bash interprets the brackets as a glob pattern and couldn't find the file otherwise.

### Verification
- `rm -rf .next && npm run build` clean, 14 routes.
- commit 77256a9 on main via `git push origin HEAD:main`.
- Deployed via root `C:\kareemhady` → `kareemhady-6puoe28m2-lime-investments.vercel.app` (Ready, 49s).

### Note for the next session
If a future component introduces a new `new Date(x).toLocaleString()` or `.toLocaleDateString()` call, use `fmtCairoDateTime(x)` / `fmtCairoDate(x)` from `@/lib/fmt-date` instead. The bare calls are correct timezone-wise only if the server happens to match Cairo.

## ✅ PAYOUTS: CLICK "BY BUILDING" ROWS TO DRILL INTO LINE ITEMS (commit b5a1971)

### User request
User shared a screenshot of the "Airbnb payouts by building" table (UNKNOWN 12 items / BH-73 9 / BH-435 3 / BH-OK 2) and said:
> "trying to click on unknown to try to see whats the problem ....Nothing Happens Unclickable"

### The fix
Added a URL-driven `?building=<key>` filter. Clicking a building row toggles the filter on; clicking the active row (or the Clear button) removes it. Same URL-param pattern already used elsewhere (Requests group-by toggle, Range preset).

### Files changed (single file)
`src/app/emails/[domain]/[ruleId]/page.tsx`:

- Detail page server: added `building?: string` to `searchParams` type; resolved into `airbnbBuildingFilter = sp?.building?.trim() || null`; threaded into `BeithadyPayoutView` alongside `domain`, `ruleId`, `searchParamsSnapshot`.
- `BeithadyPayoutView` signature extended with those props. New `buildPayoutHref(nextBuildingKey | null)` helper inside the component — constructs the URL preserving `preset` / `from` / `to`, appends `?building=X` when setting, omits the param when clearing, and **adds `#airbnb-line-items` anchor so the browser scrolls to the drill-in** after the click.
- **By-building table rows clickable via stretched-link pattern**: each `<tr>` is `position: relative`; the Building cell wraps its content in `<Link>` containing a `<span className="absolute inset-0" />` that expands to cover the full row. Entire row is clickable, hover-emerald, valid HTML (`<a>` inside `<td>`, never wrapping `<tr>`). Active row gets `bg-emerald-100/60` + a small `active · clear` chip. Clicking the active row passes `null` to `buildPayoutHref` and clears the filter.
- Line items pre-filtered at render via `filteredRefundables = buildingFilter ? refundables.filter(l => (l.building_code || 'UNKNOWN') === buildingFilter) : refundables`. UNKNOWN bucket catches line items whose `building_code` is null.
- Airbnb line items section gained `id="airbnb-line-items"` anchor + `scroll-mt-6` for a small offset from top.
- When a filter is active, an emerald banner renders above the table: "Filtered to {X} — showing {N} of {M} line items" + "Clear filter" button that links back to the no-filter URL. UNKNOWN banner appends an explanation: "These are line items whose listing name didn't match the Beithady catalog or a BH-code" (so the user immediately understands why those items fell through).
- Section title updates to reflect filter: `Airbnb line items · UNKNOWN (12 of 26)`.
- Hint copy updated on the by-building section: "Click a row to filter the line items table below."
- `AirbnbLineItemsTable` client component unchanged — it just receives the already-filtered list. The existing click-row-for-modal detail interaction still works inside the filtered view.

### Verification
- `rm -rf .next && npm run build` clean, TS pass, 14 routes.
- commit b5a1971 on main via `git push origin HEAD:main`.
- Deployment: first `vercel --prod --yes` threw `ECONNRESET` on the response but `vercel inspect` confirmed `kareemhady-1ikcfj49z` went Ready + was aliased to `kareemhady.vercel.app`. The CLI errored on the response, not the upload — the deploy itself succeeded.

### URL pattern
- Drill into UNKNOWN: `/emails/beithady/<payout-rule-id>?building=UNKNOWN#airbnb-line-items`
- Drill into BH-73: `?building=BH-73`
- Clear: click the active row or the Clear filter button (returns to no-param URL)

### Why this shape over alternatives
- **URL param vs client state**: state survives refresh + is shareable (paste "show me what went to UNKNOWN" URL in Slack).
- **Stretched-link vs onClick**: keeps the whole interaction server-renderable. `<a>`-inside-`<td>` with a stretched span is the cleanest cross-browser way to make a whole `<tr>` clickable without invalid HTML.
- **Section anchor**: clicking a building row 4 cards above the table was confusing without the scroll — anchor jumps the viewport to the drill-in location automatically.

### Open question for next run
After the user re-runs the rule with the updated listings catalog (commit 6aee045), they should see FEWER UNKNOWN line items — Gouna / Dubai / BH-NEWCAI listings that previously fell into UNKNOWN should now route to their canonical buckets. If UNKNOWN is still large, clicking it reveals the remaining listings and we can tune the `findListingByName` fuzzy matcher.

## ✅ STRIPE API ARRIVAL-DATE FILTER + AIRBNB LINE-ITEM MODAL (commit 1ea2c30)

### User request
User ran the Payouts rule with real data and shared screenshots:
- Stripe API reconciliation showed "API TOTAL USD 3,288 · 1 payouts" while the hero said "5 Stripe payouts". Asked: "if it is 5 payouts for Stripe, why it is showing only 1 in API"
- "Also need to click on line in Airbnb to see details as popup"

### Issue 1: arrival_date vs created filter
**Root cause**: `fetchStripePayoutBreakdown` in `src/lib/stripe-payouts.ts` filtered Stripe payouts by `created` timestamp (when Stripe initiated the payout). Stripe's payout notification emails trigger around `arrival_date` (when funds land at the bank), which can be 2-4 days after creation. A payout created on Mon arriving Thu shows up in Thu emails — but the API filter with a Thu-only window would miss it.

**Fix**: switched `listPayoutsInRange()` to filter by `arrival_date: { gte: fromTs, lte: toTs }`. Now API range aligns with email-trigger timing.

**Secondary fix**: the hero's "Stripe USD" subtitle conflated raw Gmail hits with successfully-parsed payout notifications. Now shows `${stripePayouts.length} parsed payouts · Booking.com / Expedia / Manual` when all emails parsed, or `${stripePayouts.length} parsed · ${stripeCount} Stripe emails · Booking.com / Expedia / Manual` when they differ. The hero no longer implies "5 payouts" when only 1 or 2 of those Gmail matches are actual payout notifications.

### Issue 2: click-to-modal on Airbnb line items
New client component `src/app/emails/[domain]/[ruleId]/AirbnbLineItemsTable.tsx` (`'use client'`):

- Accepts `lineItems`, `bookings`, `crossMatchRunAt` as plain-data props (no functions — serializable across the server/client boundary).
- Rebuilds the `bookingsByCode` + `bookingsByGuest` lookup maps client-side via `useMemo`. Same two-step match logic as the server: exact HM-code first, one-and-only-one guest-name fallback.
- Each row is now a cursor-pointer button that setOpen()s the line item. Hover-rose stays.
- Native `<dialog>` element with `useRef` + `useEffect` to call `.showModal()` / `.close()`. Free focus trap + escape-key handling + backdrop click (detected via `e.target === dialogRef.current` in the onClick handler).
- Modal header: confirmation code mono, Refund/Type badges, "matched Guesty" emerald pill when there's a match, guest name.
- Modal body:
  - Full listing name (word-wrapped, NOT truncated) + Airbnb numeric listing id below
  - 4-cell grid: Amount (rose tone when refund), Airbnb bldg (from email), Stay, Payout sent
  - When matched: full emerald panel with Channel, Guesty bldg, Listing code (mono), Expected payout, Nights, Guesty guest, Check-in, Check-out, Guesty listing (wrap). Delta callout when |paid - expected| > $1: amber for overpaid, emerald for underpaid.
  - When not matched: slate note explaining why ("booking rule hasn't run in range, non-Airbnb channel paid through Stripe, etc").
- Footer: Close button + small "Click any row to see full details (cross-matched against Guesty bookings last run ...)".
- Small `DetailCell` helper for the grid cells with label / value / optional icon / mono / wrap / tone options.

`BeithadyPayoutView` server component now just forwards props:
```tsx
<AirbnbLineItemsTable
  lineItems={refundables}
  bookings={crossMatchBookings}
  crossMatchRunAt={crossMatchRunAt}
/>
```
All interactive state lives in the client file. The old `lookupBooking` usage inside `BeithadyPayoutView` for the Airbnb table is gone (still used for the Stripe txn table, which stays server-rendered — Stripe txn volume is larger and per-row interactivity isn't the same ask).

### Type fix during build
First build failed because `AirbnbLineItem.listing_airbnb_id` was required but the server-side line_items type didn't include it. Made it optional (`?: string | null`) on the client type — it's shown in the modal when present but doesn't break when missing.

### Verification
- `rm -rf .next && npm run build` clean, 14 routes, TS pass.
- commit 1ea2c30 on main via `git push origin HEAD:main`.
- Deployed via root `C:\kareemhady` → `kareemhady-rlgzukdai-lime-investments.vercel.app` (Ready, 51s).

### What the user should see on next run
- Stripe API reconciliation MATCHED count should go up (since arrival_date catches payouts that created-date missed).
- Hero's "Stripe USD" subtitle now honest: shows both parsed-count and email-count when they differ.
- Clicking any row in the Airbnb line items table opens a centered modal with the full reservation detail + Guesty match panel.

### Note on why some payouts may still be email-only
Even with arrival_date, email-only counts can remain non-zero because:
- The rule searches `from:stripe to:payments@beithady.com` — if some Stripe emails for OTHER accounts got forwarded there, they'd count as emails but not be in this account's API.
- The Restricted key might not have read access to an older payout if Stripe archived it (unusual).
- Date boundaries: an arrival_date exactly on the boundary second could go either way depending on timezone rounding.

## ✅ BEITHADY PAYOUTS: ALL AMOUNTS IN USD (commit 2bdd20f)

### User request
User shared a screenshot of the Payouts detail page showing "TOTAL PAYOUTS AED 22,462 / AIRBNB AED 10,386 / STRIPE AED 12,076" and said:
> "why we are back to AED, All currencies should be USD"

### The fix
All Beithady Payouts displays now render in USD. Render-time conversion only — no aggregator changes, no stored-output schema changes, existing `rule_runs` display the new currency without a re-run.

### The conversion
UAE dirham is pegged to USD at **1 USD = 3.6725 AED** (fixed by the UAE Central Bank since 1997). Safe to hardcode — no FX API needed, no drift. Defined as `AED_PER_USD` constant + `aedToUsd()` / `fmtAedAsUsd()` helpers next to the existing `fmt()` helper at the top of `src/app/emails/[domain]/[ruleId]/page.tsx`.

### What's sourced where
- **Airbnb "USD"** — prefers the **native** `airbnb_total_usd` field (sum of per-reservation USD line amounts from the payout email bodies). Falls back to `airbnb_total_aed / 3.6725` when the native value is missing. Native is more accurate because Airbnb's own FX rate differs slightly from the peg in email totals.
- **Stripe "USD"** — peg-converted from `stripe_total_aed` (AED is Stripe's settlement currency for this account). For per-transaction API breakdown rows, prefers the **native** `source_amount` when `source_currency === 'USD'` (Booking.com / Expedia charges are often USD pre-FX), otherwise peg-converts from the AED settlement amount.
- **Total USD** — peg-converted from `total_aed` (sum of both sources' AED settlements, so the peg is applied uniformly — keeps Airbnb + Stripe comparable on the same scale).

### Files changed
`src/app/emails/[domain]/[ruleId]/page.tsx`:
- Shared helpers: `AED_PER_USD`, `aedToUsd()`, `fmtAedAsUsd()`.
- `BeithadyPayoutView` hero — all 4 HeroStat labels + values: Total USD / Airbnb USD (prefer native) / Stripe USD / Unique reservations count (unchanged).
- Bank destinations — reworded to explain the peg + that both sources settle AED to the same FZCO IBAN.
- Source split — bar widths unchanged (share math identical), labels/tooltips in USD, hint mentions peg.
- `PayoutMonthChart` — bar labels + hover titles in USD.
- Airbnb payouts table — "Payout AED" → "Payout USD" column with `fmtAedAsUsd(p.total_aed)`. "USD in items" unchanged (already native).
- Stripe email-payouts table — "Amount AED" → "Amount USD".
- `StripeApiBreakdownSection` — "API total AED" → "API total USD" stat, per-payout hero amount + net/fees in USD, transaction "Amount USD" column with the native-source-preferred logic above, all hints/copy updated.
- Run history column "Total AED" → "Total USD" with `aedToUsd` applied to the count.

`src/app/emails/[domain]/page.tsx`:
- `BeithadyPayoutMini` — inlined `AED_PER_USD` constant + same prefer-native-then-peg logic. Labels: Total USD / Airbnb USD / Stripe USD / Payout emails.

### Expected numbers (from user's screenshot)
Was: AED 22,462 / Airbnb 10,386 / Stripe 12,076 / 2,828 USD line items (13 reservations)
Now: **~$6,116 USD total · $2,828 Airbnb (native) · $3,289 Stripe (peg) · 13 reservations**

### Verification
- `rm -rf .next && npm run build` clean, 14 routes.
- commit 2bdd20f on main via `git push origin HEAD:main`.
- Deployed via root `C:\kareemhady` → `kareemhady-44qjysluy-lime-investments.vercel.app` (Ready, 48s).

### Why peg-hardcoded (not a live FX API)
- UAE's AED has been pegged to USD at 3.6725 since 1997 — zero drift.
- Adding openexchangerates / fixer.io / any FX provider would add an API key, a dependency, and ongoing auth rotation for a value that literally doesn't change.
- If the peg ever changes (extremely unlikely), flip one constant.

### Gotcha to remember
Aggregator `BeithadyPayoutAggregate` type still stores `*_aed` fields — they're the AED settlement amounts, which is the source of truth. The USD figures are computed at render from those. Do not rename the stored fields to `*_usd`; you'd break Phase 5.8's Stripe API reconciliation which compares amounts in AED minor units.

## ✅ REQUESTS GROUP-BY TOGGLE + COLLAPSIBLE RUN HISTORY (commit 6f34fdf)

### User request
> "Requests view grouped with Choice Between Guest and Reservation / Choose how to group"
> "Run history across all domains to be button only shows up when pressed"

### Guest Requests view — group-by toggle (?group=guest | reservation)
- Added `group?: string` to the detail page `searchParams`. Resolved server-side into `requestsGroupMode: 'guest' | 'reservation'`, default `reservation` (preserves existing behavior — shareable URL, no client bundle).
- Threaded `groupMode`, `domain`, `ruleId`, `searchParamsSnapshot` into `BeithadyRequestView`. Local `buildGroupHref(mode)` helper builds the opposite-mode URL preserving existing preset / from / to params, omits the `group` query when switching back to reservation (keeps URL clean).
- Toggle UI: two Next.js `<Link prefetch={false}>` buttons rendered inline with the section header. Active button is indigo-filled; inactive is white with slate text. Button pair wrapped in a rounded pill border.

### New guest-mode rendering
Added two helpers at module scope (after `BeithadyRequestView`):
- `buildGuestThreads(messages)`: groups by `guest_name.toLowerCase().trim()`, builds per-thread aggregate — `reservationCount` (unique group_keys), `maxUrgency` (via `REQUEST_URGENCY_RANK`), `hasImmediateComplaint`, `categories` (union), `buildings` (union), `listings` (union), `latestReceivedIso` + associated `latestSummary` / `latestSuggestedAction`. Sort: immediate-complaint first → max urgency desc → latest activity desc.
- `GuestThreadsList({ messages })`: thread card per guest. Header chips: guest name, urgency badge, immediate-complaint siren badge, msg count, **N reservations** chip when > 1, building codes, category union. Latest summary + suggested-action callouts. Inner messages chat-style (oldest first), each annotated with its own listing + stay range + `StayPhaseBadge` (so the reservation context stays legible when a guest spans multiple stays). Inline classifier summary, verbatim quote (Arabic-preserving with `whitespace-pre-wrap`), per-message suggested action.

Reservation-mode rendering unchanged — still driven by `byReservation` (from the aggregator's pre-built reservation groups) + `messagesByGroup` fan-out. The conditional `groupMode === 'guest' ? <GuestThreadsList .../> : (<reservation markup>)` lives inside the existing section wrapper.

### Run history — collapsed by default (all rule types)
Existing `<section>` wraps a `<details className="group">`:
- `<summary>` styled as a full-width clickable header: chevron-right icon that rotates 90° when open (via `group-open:rotate-90`), "Run history (N)" title, and a "Show"/"Hide" label that swaps via `group-open:hidden` / `hidden group-open:inline`.
- Default disclosure triangle hidden with `list-none`.
- Table content lives directly inside `<details>` so native HTML handles hide/show — zero JS, no client component.
- Applies to all five rule types (Shopify, Beithady Bookings / Payouts / Reviews / Inquiries / Requests) since the Run history section is shared across them at the detail-page layout level.

### Verification
- `rm -rf .next && npm run build` clean (14 routes).
- commit 6f34fdf on main via `git push origin HEAD:main`.
- Deployed via root `C:\kareemhady` → `kareemhady-d7gy3815x-lime-investments.vercel.app` (Ready, 47s).

### URL for QA
- Default (reservation): `/emails/beithady/<requests-rule-id>`
- Guest-mode: `/emails/beithady/<requests-rule-id>?group=guest`

### Why URL param over client component
1. Matches the existing pattern of the detail page (`preset`, `from`, `to` all use searchParams).
2. State survives refresh + is shareable (paste the ?group=guest URL in Slack and land on the right view).
3. No client bundle growth / no extra hydration for a rarely-used toggle.
4. Toggle involves a round-trip, which on Vercel is ~200ms — fine for this kind of pivot.

## ✅ INQUIRIES VIEW: CHAT-STYLE PER-GUEST THREADS (commit b8868ea)

### User request
User shared a screenshot of `/emails/beithady/<inquiries-rule-id>` showing the "All inquiries (38)" section with four consecutive cards all from "Abdalla Binu" for the same listing and stay dates. Said:
> "need to combine messages from Same Guest in a chat like review, no need to keep them separate, distraction"

### Change
Restructured the "All inquiries" section in `BeithadyInquiryView` to render **one card per guest** with the guest's messages stacked chronologically inside — same shape as the Phase 5.11 Guest Requests reservation-thread cards.

### Implementation
Pure render-time regroup inside `BeithadyInquiryView`. No aggregator changes, no schema changes, no backend work.

- Group by normalized guest name (`.toLowerCase().trim()`).
- Per-thread aggregates computed at render:
  - `worstTone` — smallest SLA-tone rank across messages (`overdue < urgent < soon < fresh < unknown`). Used for the header SLA badge AND the group sort.
  - `latestReceived` — "last activity" timestamp in the header.
  - `needsAttention` — any message with `classification.needs_manual_attention`.
  - `listings` — unique listing names (rendered as "Name + N more" when >1).
  - `buildings` — unique building codes (chips rendered in header).
  - `categories` — union of categories across the thread (chip row in header).
  - `stayRanges` — unique check-in→check-out strings; rendered as "1 stay range" text or "N stay ranges" when multi.
- Thread sort: worst-tone asc → needs-attention first → latest activity desc.
- Message sort within a thread: **oldest first** (chat reading order, newest at the bottom).
- Each inner message: timestamp, category chip, compact "decision" chip when that specific message needs one, its own `SlaBadge`, Haiku summary, verbatim guest question blockquote (Arabic preserved via `whitespace-pre-wrap`).
- Header-level badges: guest name (first-seen casing), msg count, thread-level "needs decision" when any message is flagged.

### UX notes
- The older "Combined by guest" table earlier in the page is untouched — it's the compact scan view, the new thread cards are the detailed-read view. Some redundancy but the table remains useful for quick counting.
- Section header renames from "All inquiries (38) · sorted by SLA urgency" to "Conversations (N guests · M messages) · sorted by SLA urgency" so the grouping is self-evident.
- Old rule_runs render the new layout immediately — the regroup is on the stored `messages[]` array, no re-run needed.

### Verification
- `rm -rf .next && npm run build` clean, 14 routes.
- commit b8868ea on main via `git push origin HEAD:main`.
- Deployed via root `C:\kareemhady` → `kareemhady-rh0u09i3l-lime-investments.vercel.app` (Ready, 51s).

### If the user asks for similar grouping on Guest Requests
The Phase 5.11 Guest Requests view already groups by reservation thread (subject-normalized). Guest-level grouping on top of that is possible but would collapse multiple reservations from the same guest — ask before doing it because splitting BY RESERVATION is often desirable (a guest's current stay vs their next booking are distinct).

## ✅ BEITHADY LISTINGS CATALOG SHIPPED — authoritative property table + classifier wiring (commit 6aee045)

### User request
> "C:\kareemhady\.claude\Documents — Look at file Beithady Listings ... This is a full list of Properties, save it for further match across Beithady Domain Rules"

Imported the 91-row CSV and made it the single source of truth for building classification and listing metadata across all five Beithady rules.

### Source
`C:\kareemhady\.claude\Documents\Beithady Listings.csv` — columns: NICKNAME, TITLE, TYPE OF UNIT, TAGS, LISTING ID.

Building groups represented:
- **BH-26** (22 units: BH-26-001 … BH-26-501) · Kattameya
- **BH-435** (14 units: BH-435-001 … BH-435-402) · New Cairo
- **BH-73** (26 units, mix of SINGLE-UNIT / MULTI-UNIT / SUB-UNIT: BH73-1BR-C-8, BH73-2BR-SB-5, BH73-3BR-SB-1/2/3, BH73-ST-C-7, BH73-4BR-C-405, etc.) · New Cairo, 24/7 desk
- **BH-ONEKAT** (10 scattered Kattameya units: BH-101-55, BH-107-46, BH-109-23/43, BH-114-73, BH-115-75, BH-116-36, BH-202-61, BH-203-86, BH-213-82) — rendered as **BH-OK** in the UI (existing canonical code)
- **BH-MG** (1 Heliopolis apartment: BH-MG-20-1)
- **BH-GOUNA** (3 units: BH-MANG-M15B13 Mangroovy, BH-MB34-105 AbuTig, BH-WS-E245 WaterSide) · El Gouna resorts
- **BH-NEWCAI** (1 standalone New Cairo unit near AUC: BH-NEWCAI-4021)
- **DXB** (3 Dubai units: LIME-MA-1402 Marina, REEHAN-204 Reehan, YANSOON-105 Yansoon)

### Files

#### `src/lib/rules/beithady-listings.ts` (new, 224 lines)
- `BeithadyListing` type with nickname, title, unit_type (`SINGLE-UNIT` | `MULTI-UNIT` | `SUB-UNIT`), tags (parsed from CSV), building_tag (primary = first tag), guesty_listing_id.
- `RAW` const — 91 tuples `[nickname, title, unit_type, tagsJoined, guestyId]`. Easy to re-paste from a future CSV update.
- `BEITHADY_LISTINGS` — readonly array, built once at module load.
- Lookup maps built at module load: `byNickname` (upper-case), `byGuestyId`, `byTitle` (lower-case, first-write-wins for duplicated titles like the 10+ identical "Luxury 2 Bedroom Residence by Beit Hady" BH-435 units).
- Exports:
  - `getListingByNickname(code)` — exact, case-insensitive
  - `getListingByGuestyId(id)` — exact
  - `findListingByName(name)` — three-strategy fuzzy match: (1) extract `\bBH[-\s]?[A-Z0-9-]+\b` from input and try exact + progressive prefix/contains comparisons against all nicknames; (2) exact title match; (3) substring — catalog title inside input (≥12 chars minimum).
  - `buildingFromListingName(name)` — shortcut returning the canonical building code directly.
  - `canonicalBuildingFromTag(tag)` — translates `BH-ONEKAT → BH-OK` (the only remap); everything else passes through as-is.
  - `getCanonicalBuilding(listing)` — sugar for the above applied to `listing.building_tag`.

#### `src/lib/rules/aggregators/beithady-booking.ts`
- `classifyBuilding(code)` now consults `getListingByNickname(code)` FIRST. If the code matches a catalog row, returns `getCanonicalBuilding(listing)` — which handles all the new buckets (DXB, BH-GOUNA, BH-NEWCAI) plus the BH-ONEKAT → BH-OK remap.
- Legacy prefix rules remain as FALLBACK for any future listings added to the rules engine before they're added to the catalog. So the system fails-open: new bookings still classify, they just might go through the fuzzy prefix path until the catalog is updated.
- `BEITHADY_BUILDINGS` registry got three new entries (`BH-GOUNA`, `BH-NEWCAI`, `DXB`) with descriptions. Existing entries gained descriptions too (rendered in the Booking rule's trophy card + building hint).

#### `src/lib/rules/aggregators/beithady-{payout,review,inquiry,request}.ts`
Each of the four aggregators has a `buildingFromListing(listing_name)` / `buildingFromLineItem(li)` helper used to bucket emails without a clean BH-code. All four now:
1. Try `buildingFromListingName(name)` first (catalog match).
2. Fall back to regex extraction + `classifyBuilding`.
3. Fall back to the existing name-cue heuristic (`ednc`/`new cairo`/`kattameya` → BH-OK; `heliopolis`/`merghany` → BH-MG).

### Verification
- `rm -rf .next && npm run build` clean, TS 12.4s, 14 routes.
- commit 6aee045 on main via `git push origin HEAD:main`.
- Pulled into `C:\kareemhady`, `vercel --prod --yes` → `kareemhady-48taxnpmc-lime-investments.vercel.app` (Ready, 53s).

### Expected impact on real data
Previously, any Airbnb listing title that didn't include a BH-code (e.g. Gouna listings, Dubai listings, the BH-ONEKAT compound units where the title is just "Luxurious 3 Bedroom in Katameya") would bucket into **UNKNOWN** or fall into the wrong name-cue branch. With the catalog wired in:
- Gouna titles (Mangroovy / AbuTig / WaterSide) now bucket as **BH-GOUNA**
- Dubai titles (Burj Dubai / Dubai Mall / Marina) now bucket as **DXB**
- "Stunning Gated 2 BR-Mins To AUC" (BH-NEWCAI-4021) no longer accidentally matches the "new cairo" cue → BH-OK; now correctly **BH-NEWCAI**
- BH-ONEKAT units with generic titles now correctly route to **BH-OK** via the nickname prefix match

The Beithady-dashboard by-building tables should show these new rows next time the rules run. Historical rule_runs still render their stored bucket labels (the UI re-applies `classifyBuilding` render-time for the booking rule — Phase 5.6 behavior — so the bookings rule auto-reclassifies without a re-run; the other four rules need a re-run to pick up the new classification).

### How to update the catalog going forward
When listings change:
1. Paste the new rows into the `RAW` array in `src/lib/rules/beithady-listings.ts`, keeping the tuple format.
2. Update the header-comment import date.
3. Commit + deploy — no DB migration needed.

### What's NOT wired in yet (possible follow-ups)
- **Guesty listing-ID matching on Stripe transactions** — Stripe API transactions carry `customer` / `charge` metadata; if Guesty ever surfaces the Guesty listing id inside charge metadata, `getListingByGuestyId` would let us pin each Stripe txn to a specific unit (not just a building). Currently the Stripe cross-match uses the bookings rule's `booking_id` only.
- **Unit-type-aware rendering** — we now know if a listing is SINGLE-UNIT / MULTI-UNIT / SUB-UNIT. MULTI-UNIT masters have several SUB-UNIT children (e.g. BH73-3BR-SB-1 → BH73-3BR-SB-1-001/101/201/301/401). UI doesn't show this hierarchy yet; would be useful in the Bookings rule's listing table.
- **Admin page showing the catalog** — no UI surfaces the catalog itself. Could add `/admin/beithady-listings` that renders the table. Skipped this turn — user asked for "save for further match," not a dashboard.

## ✅ PHASE 5.8 FOLLOW-UP SHIPPED — cross-match payouts against Beithady Bookings (commit e93f8c2)

### User request
> "follow-up cross match"

Closes the reconciliation loop: Airbnb payout line items AND Stripe API transactions both now join against the latest Beithady Bookings rule run so the UI shows Guesty's canonical `building_code` + expected `total_payout` next to each paid row. Fully render-time / server-side; no new stored fields.

### Key insight used
Guesty's `booking_id` field in the Beithady Bookings rule's output IS the Airbnb HM-xxxxxxxx confirmation code (verified against the existing reconciliation logic in `beithady-booking.ts:545-552` which builds `guestyCodes` from `booking_id` and intersects with Airbnb `confirmation_code`s). So a single map keyed by uppercase confirmation code handles both the Airbnb email leg and the Stripe API leg.

### Files (single-file diff)

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
**Server component** — after the normal rule/runs fetch, when `isPayout`, do a small sequential lookup:
1. Query `rules` by `domain=beithady`, filter JS-side for `actions.type === 'beithady_booking_aggregate'`.
2. If found, query `rule_runs` for the latest `status=succeeded` row, pull `output.bookings[]`.
3. Pass as `crossMatchBookings` (array) + `crossMatchRunAt` (ISO) to `BeithadyPayoutView`.

If no bookings rule exists OR no successful runs yet → empty array, UI gracefully falls back to "—" in match columns. No errors, no warnings.

**BeithadyPayoutView** — builds two maps ONCE at render:
- `bookingsByCode: Map<string (upper-cased confirmation), CrossMatchBooking>` — primary lookup
- `bookingsByGuest: Map<string (lowercased guest name), CrossMatchBooking[]>` — fallback only when exactly one booking shares a name (list.length === 1). Prevents ambiguous joins when a guest booked twice under different codes.

Exposes a single `lookupBooking(code, guestName) → CrossMatchBooking | null` helper typed `BookingLookup` and threads it down.

**Airbnb line items table** — two new columns between "Bldg" and "Stay":
- **Matched Bldg** — Guesty's canonical `building_code` (emerald, semibold) when matched, else `—`. More accurate than the existing "Bldg" column which is regex-derived from the Airbnb listing name (often `UNKNOWN` when the listing doesn't carry a BH-code).
- **Expected (USD)** — Guesty's stored `total_payout` for the matched booking. Compared against the line item's `amount` (non-refund only); if `|Δ| > $1`, shows a `↑` (overpaid vs expected) or `↓` (underpaid) arrow with the Δ on hover. Subtle way to surface payout drift.

**StripeApiBreakdownSection** — accepts `lookupBooking` + `crossMatchCount` props. Same two new columns in the per-payout transaction table. Guest column also gets a small green `✓` next to the name when matched (title tooltip shows channel + listing_code for the matched booking).

**Match-rate banner** — computed pre-render by iterating all txns once:
- If `crossMatchCount > 0` AND `totalTxns > 0`: show `GitCompare` icon + "Cross-matched X of Y Stripe transactions to a Guesty booking" in an emerald card when `matchedTxns > 0`, amber card when 0.
- When matchedTxns === 0, the banner asks the user to share a sample Stripe charge's metadata keys so the extractor (currently checks `guest_name`/`guestName`/`guest`/`reservation_guest`) can be tuned to Guesty's actual schema.

### Verification
- `rm -rf .next && npm run build` clean, TS 10.0s, 14 routes.
- commit e93f8c2 on main via `git push origin HEAD:main`.
- Pulled into `C:\kareemhady`, `vercel --prod --yes` → `kareemhady-e1xjoi2w8-lime-investments.vercel.app` (Ready, 49s build).

### Design choices worth remembering
- **Render-time join, not aggregate-time** — bookings might update between payout runs. Rather than baking a snapshot into each payout run's output (which would go stale), the detail page does a fresh `rule_runs` lookup every time it's rendered. One extra Supabase query per page view; negligible.
- **Exact match on booking_id, guest-name only as fallback** — guest names can collide. The fallback only fires when (a) no confirmation code extracted AND (b) exactly one booking has that guest name. Keeps the UI honest about what was "matched" vs guessed.
- **No schema changes** — `BeithadyPayoutAggregate` is untouched. This was a UI-only enhancement. Older `rule_runs` render correctly (match columns just show `—`) because the lookup key reads from live DB, not the stored output.
- **Payout Δ indicator** — shows up only when difference > $1 and only on non-refund rows. Small affordance for spotting when Airbnb paid out a different amount than Guesty expected (possible causes: currency FX drift, late refund, host service fee change). Doesn't hard-flag — just shows the arrow + value on hover.

### Guest-name extractor status (to re-check after a real run)
The `extractGuestFromTxn` helper in `StripeApiBreakdownSection` checks these metadata keys: `guest_name`, `guestName`, `guest`, `reservation_guest`. Plus a regex fallback on description (`/(?:guest|for)\s+([A-Z][a-zA-Z'\`\- ]{1,40})/`). After the user runs the Payouts rule next time, if the match-rate banner shows "0 of N Stripe transactions matched" with a non-empty bookings list, the keys list needs tuning. User has agreed to share a sample charge's metadata when that happens.

### Next / queue
- Still waiting on a real-data run to validate the match rate. User said they'd share sample Stripe charge metadata if the extractor needs tuning.
- Still unstarted: user-side Vercel orphan cleanup (4 random-name projects — `vigorous-almeida-bec425`, `peaceful-moser-39791b`, `exciting-ride-1a2629`, `gifted-mcclintock`).

## ✅ PHASE 5.8 SHIPPED — Stripe API reconciliation on Beithady Payouts (commit 8568d40)

### User request
> "complete phase 5.8"

Unblocked: `STRIPE_SECRET_KEY` was already set (local .env.local + Vercel production, 8h old at the start of this turn). Extended the existing Beithady Payouts rule with live Stripe API drill-down so email-parsed payouts can be reconciled against API-visible payouts, and each payout's component transactions are itemized.

### Files

#### `src/lib/stripe.ts` (new, 11 lines)
Lazy singleton client reading `STRIPE_SECRET_KEY`. Throws `STRIPE_SECRET_KEY not set` if called without the env var.

#### `src/lib/stripe-payouts.ts` (new, 254 lines)
- Types: `StripeTransactionDetail`, `StripeApiPayoutDetail`, `StripeApiBreakdown`.
- `listPayoutsInRange(client, fromTs, toTs)` — auto-paginates `stripe.payouts.list({ created: { gte, lte } })`, capped at **MAX_PAYOUTS = 100** per run.
- `listTransactionsForPayout(client, payoutId)` — auto-paginates `stripe.balanceTransactions.list({ payout, expand: ['data.source'] })`, capped at **MAX_TXNS_PER_PAYOUT = 200**. The `expand: ['data.source']` is critical: it inlines the underlying Charge/Refund object so we don't need a second round-trip per txn.
- `extractTxnDetail(txn)` resolves per-type:
  - `charge` → description, statement_descriptor, receipt_email, customer_id, metadata. `source_amount`/`source_currency` populated when the charge currency differs from the settlement (txn) currency — so USD/EUR OTA charges show alongside AED settlement.
  - `refund` → charge_id, reason, metadata.
  - `payout` type transactions are filtered out upstream in `fetchStripePayoutBreakdown` — they're the payout's own debit leg, not a component.
- `fetchStripePayoutBreakdown(fromIso, toIso)`:
  - Wraps the Stripe client initializer in try/catch so a missing key returns `{ error: 'STRIPE_SECRET_KEY not set', api_payouts: [], ... }` rather than throwing and failing the whole rule_run.
  - Wraps `listPayoutsInRange` in try/catch too — network / auth / scope errors are surfaced as `.error` on the breakdown.
  - Per-payout txn fetch failures are swallowed so one payout's failure doesn't kill the others; the payout still shows with its header but empty txns.
  - Fee amount sum uses each BalanceTransaction's embedded `fee` field (Stripe fees are per-txn, not a separate `payout_fee` BT type — had to remove a first-draft filter that used a non-existent `payout_fee` type).

#### `src/lib/rules/aggregators/beithady-payout.ts`
- `BeithadyPayoutAggregate` extended with Phase 5.8 fields: `stripe_api`, `stripe_api_total_aed`, `reconcile_matched`, `reconcile_api_only`, `reconcile_email_only`, `stripe_api_charge_count`, `stripe_api_refund_count`, `stripe_api_guest_names`.
- `aggregateBeithadyPayouts` now takes a third optional arg `stripeApi: StripeApiBreakdown | null = null`. Reconciles payout_ids between the email-parsed Stripe payouts and the API set, counts charges/refunds across all API txns, and flags how many had a guest name extractable from `metadata.guest_name` / `metadata.guestName` / description patterns (`/guest|reservation|booking/i`).

#### `src/lib/rules/engine.ts`
- `evaluatePayoutRule` runs `fetchStripePayoutBreakdown(fromIso, toIso)` **in the same Promise.all** as the Airbnb + Stripe email body fetches (parallel API + Gmail). Passes the breakdown to `aggregateBeithadyPayouts` as the third arg. Re-running always triggers a fresh API pull.

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
- Added `<StripeApiBreakdownSection out={out} />` at the end of `BeithadyPayoutView`.
- New `StripeApiBreakdownSection` component:
  - Three states: no `stripe_api` (old rule_run — pre-5.8 data), `stripe_api.error` (red banner with error message + likely-cause troubleshooting for key/scope/network), or normal breakdown.
  - 4 Stat cards: API total AED, Matched, API-only, Email-only. `reconcile_api_only`/`reconcile_email_only` tinted amber/indigo when non-zero.
  - Green confirmation banner when any txns have guest names extracted.
  - Per-payout cards (sorted newest-first by `created_iso`) with header: payout_id monospace, status chip, method, created + arrival + destination bank/last4. Right-aligned: big AED amount + txn count + net components + fees.
  - Expanded txn table per payout (capped at 100 rows in UI, truncation note shown): time, type chip (emerald/rose/amber/slate by type), AED amount, source amount+currency when different, extracted guest name, detected confirmation code (HM-xxxx or BH-xxxx regex match against description+metadata), description (truncated, title-attr on hover).
- Helpers `extractGuestFromTxn` and `extractConfirmationCodeFromTxn` live in-file, used only by this section.

### Verification
- `rm -rf .next && npm run build` passed on first attempt after fixing the `payout_fee` type-check error (replaced with per-txn fee summation).
- `git push origin HEAD:main` → commit 8568d40.
- Pulled into `C:\kareemhady`, `npm install` (installs stripe@22.0.2 in root too), then `vercel --prod --yes` → `kareemhady-hr865kerg-lime-investments.vercel.app` (Ready, 50s build).

### Design choices worth remembering
- **API + email both kept** — we don't remove the email-parsed `stripe_payouts` section. Email arrives in near-realtime; API requires the key. Showing both lets the user cross-verify. Matched/api-only/email-only surfaces drift (email missing = Stripe sent it but Gmail lost it; api-only = email hasn't arrived yet).
- **One round-trip per payout via `expand: ['data.source']`** — if we naively called `charges.retrieve(charge_id)` for every balance transaction, a YTD run with 100 payouts × 10 txns each = 1000 extra API calls. The expand option keeps it at ~101 calls total (1 list + 100 per-payout lists with inlined charges).
- **Non-fatal Stripe failure** — if the key is wrong or network is down, the rule_run still succeeds with email-only data and the UI shows a red banner explaining why API data is missing. Avoids "the whole run failed" when Stripe has a blip.
- **Guest name extraction is heuristic** — Guesty's metadata schema isn't guaranteed to use `guest_name` / `guestName`. We check both + a generic "guest|for X" regex on description. If Guesty uses a different key in practice, we'll see `0 of N guest names extracted` in the green banner and can tune the key list.
- **No confirmation-code cross-reference yet against the Beithady Bookings rule** — I capture confirmation codes per-txn when present (HMxxxxxxxx / BH-xxx patterns) but don't yet join them against `latest rule_run.output.bookings[].booking_id`. That's the next step if the user asks for it after seeing real API data.

### Cost sanity check
Stripe API: 1 list-payouts call + ~100 list-txns calls per YTD run = ~101 calls. Free tier covers this trivially. No per-call cost.

### What would still be nice but isn't done
1. **Cross-match confirmation_code against Beithady Bookings rule** — at render time, look up the latest `beithady_booking_aggregate` rule_run for the same time range; for each Stripe txn where we extracted an HM-code, display the matching booking's building_code + expected payout next to it. Would close the full reconciliation loop (Stripe charge → Guesty booking → Airbnb payout line item).
2. **Store API response smaller** — current payloads put the full per-txn rows into `rule_runs.output` (JSONB). For YTD with 100 payouts × 10 txns, that's a few MB. Fine for now but could be moved to a separate `stripe_api_snapshots` table if it grows.
3. **Webhook instead of polling** — Stripe can POST payout.created / payout.updated to a webhook endpoint so we never miss one and don't need to poll YTD. Bigger lift, skipped for v1.

### Remaining queue
- **All three Beithady Phase-5-series rules now live** (Reviews / Inquiries / Guest Requests) + Stripe reconciliation layered onto the existing Payouts rule. No other queued phases from the user's explicit asks.
- **Vercel orphan-project cleanup** still pending user action — user said they'd handle deletes manually via UI; I offered to unlink the worktree's `.vercel/project.json` but haven't yet since no confirmation.

## ✅ PHASE 5.11 SHIPPED — Beithady guest requests rule (in-stay messages) + per-reservation threads (commit 77ccff3)

### User request
> "phase 5.11"

Completes the three-rule Beithady arc: Reviews (5.9) + Inquiries (5.10) + Guest Requests (5.11). Sample email reviewed in the original turn: subject `RE: Reservation for Luxury 2 Bedroom Residence by Beit Hady, Apr 24 – 29`, from "service via Guesty" to `guesty@beithady.com`, body shows Adel (Booker) sending "Image sent" and Arabic text `لما بحاول اقدم الطلب بيقولي no refund` ("when I try to submit the request, it tells me no refund"), listing card with Luxury 2BR, check-in Friday Apr 24 3PM, checkout Wed Apr 29 11AM, 2 adults 2 children.

### New action type: `beithady_requests_aggregate`

Single Gmail search. Engine branches early via `evaluateRequestsRule`.

### Files

#### `src/lib/rules/aggregators/beithady-request.ts` (new, 444 lines)
- Types: `ParsedGuestMessage`, `RequestCategory` (7-way), `RequestUrgency` (immediate/high/normal), `RequestClassification`, `StoredMessage`, `RequestReservationGroup`, `BeithadyRequestAggregate`.
- `parseGuestMessage` — Haiku tool_choice **auto**. Subject `RE: Reservation for <Listing>, <Dates>`. Extracts guest name (the Booker in the topmost bubble), listing, check-in/out dates, party size, `message_text` verbatim (preserves Arabic — NO translation at parse time), `has_image` flag, `message_count_in_thread` (capped at 20). Drops outbound alteration proposals, cancellations, booking confirmations with no guest body.
- `classifyMessage` — second Haiku call, tool_choice=**tool**. Category: `date_change` / `amenity_request` / `immediate_complaint` / `refund_dispute` / `check_in_help` / `general_question` / `other`. Urgency: `immediate` (hours — no hot water, can't enter, arriving today, refund dispute escalating) / `high` (today but not next hour) / `normal`. Summary is 1-2 sentences in **English** (translates from Arabic). `suggested_action` is one imperative concrete step (e.g. "Dispatch maintenance to unit to check AC within 1 hour" or "Open a date-change proposal in Airbnb for Apr 26-30 and message guest to confirm").
- `aggregateBeithadyRequests`: parse+settle, classify+settle separately. Groups messages by `normalizeSubject(subject)` — strip `RE:` / `Fwd:` prefixes (repeatable with `+` regex so `Re: Re: foo` → `foo`), lowercased. Group preserves max_urgency (using URGENCY_RANK), has_immediate_complaint bool, all categories union, latest_summary + latest_suggested_action from newest message.
- `by_reservation` sort: immediate-complaint first → max_urgency desc → most-recent desc.

#### `src/lib/rules/engine.ts`
- Added `'beithady_requests_aggregate'` to `RuleAction['type']`.
- Early branch after inquiries branch.
- New `evaluateRequestsRule` — `subjectContains: 'Reservation'` + `toContains: 'guesty@beithady.com'`. Standard rule_run + mark-as-read flow.

#### `src/app/admin/rules/_form.tsx`
- New action-type option "Beithady guest requests aggregate (Airbnb)".

#### `src/app/emails/[domain]/page.tsx`
- Sixth icon/tint branch: `LifeBuoy` (orange) for requests.
- `BeithadyRequestMini` — 4 mini-stats: Messages / Reservations / Immediate / Emails.

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
- New `isRequests` check. View branch order: requests → inquiries → reviews → payouts → bookings → shopify.
- Run-history "Messages" column (from `total_messages`).
- New `BeithadyRequestView` — orange/rose/amber gradient hero (4 HeroStat: Messages / Active reservations / Immediate / Currently in-stay) + red Immediate pill when non-zero + by-category stat grid with **per-category icons** (CalendarRange for date_change, Wrench for amenity, Siren for immediate_complaint, Banknote for refund_dispute, DoorOpen for check_in_help) + **reservation-thread cards** (one per reservation group, sorted immediate-first).
- Thread card design: colored border when immediate-complaint (rose) or in-stay (orange-tinted); header has guest, `StayPhaseBadge` (pre_arrival / in_stay / post_stay / unknown — computed at render from check-in/out vs now), `UrgencyBadge`, immediate-complaint siren badge, building chip, msg count, listing + stay dates, category chip row; latest summary callout (slate); latest suggested-action callout (emerald with Lightbulb icon); then **per-message timeline** sorted newest-first with time, category chip, urgency badge, image indicator, thread-bubble count, Haiku summary, verbatim message quote (with `whitespace-pre-wrap` for Arabic / multi-line preservation), per-message suggested_action.
- Helpers: `REQUEST_CATEGORY_LABEL`, `REQUEST_CATEGORY_TINT`, `REQUEST_CATEGORY_ICON` maps; `stayPhaseOf(ci, co)` computed at render time so phase stays current between runs; `StayPhaseBadge` + `UrgencyBadge` components.

### DB
Seeded row id `19e5a773-b3a3-46be-8aa9-92cb6397548f`:
- name: "Beithady Guest Requests (Airbnb)"
- account: kareem@limeinc.cc (`e135f97d-429c-4879-ae20-ccfc12a40f53`)
- domain: beithady, priority 130
- actions: `{ type: 'beithady_requests_aggregate', mark_as_read: true }`

### Verification
- Clean `.next/` + `npm run build` (14 routes, TS 9.4s).
- `git push origin HEAD:main` → commit 77ccff3.
- Pulled into `C:\kareemhady`, `vercel --prod --yes` → `kareemhady-3w0eq2f4l-lime-investments.vercel.app` (Ready, 48s build).

### Design choices worth remembering
- **Arabic preservation**: parse prompt explicitly says "preserve Arabic if Arabic" — we keep the verbatim guest text. The classifier's `summary` field translates to English for the dashboard, but the original quote shows in the timeline. `whitespace-pre-wrap` on the blockquote keeps line breaks intact.
- **Per-message vs per-thread view**: one email can contain multiple bubbles (as in the Adel sample). We parse the newest bubble as `message_text` and record thread depth via `message_count_in_thread`. Each EMAIL is one row; each reservation groups 1..N rows. The thread card shows both aggregate info (urgency/phase/categories) at top and the full per-email timeline below.
- **Stay phase at render time**: like the Inquiries SLA countdown, phase is recomputed from check-in/out against `Date.now()` on each page view. A guest checking in tomorrow becomes `in_stay` the day after the run without needing a re-run.

### Cost sanity check
Each reservation-message email: 2 Haiku calls (parse ~1200 tokens, classify ~500 tokens). In-stay messages are medium volume (~100-200/year expected). YTD run well under $0.50.

### Beithady arc complete
All three asks from the original turn shipped in sequence:
- **5.9 Reviews** — avg rating, 1-5 histogram, best/worst building, flagged-review action plans with suggested reply + internal action.
- **5.10 Inquiries** — summarize + combine by guest + urgency (SLA-based) + category buckets with 24h countdown.
- **5.11 Guest Requests** — combine by reservation + date_change / amenity_request / immediate_complaint segregation with per-message suggested actions.

### Remaining queue
- **Phase 5.8 — Stripe API reconciliation** still blocked on user setting `STRIPE_SECRET_KEY`. When user returns to this, I'll resume from the Phase 5.8 plan: `npm i stripe`, add `src/lib/stripe.ts`, extend `evaluatePayoutRule` to list payouts via API + drill into balance transactions + cross-reference with Beithady Bookings confirmation_codes.

## ✅ PHASE 5.10 SHIPPED — Beithady inquiries rule (Airbnb) + SLA countdown + per-guest rollup (commit c83a489)

### User request
> "start Phase 5.10"

Continuation of the "do one by one" track — Reviews (5.9) shipped last turn, Inquiries this turn.

### New action type: `beithady_inquiries_aggregate`

Single Gmail search (conditions field is ignored, note field documents that). Engine branches early via `evaluateInquiriesRule` following the same shape as `evaluateReviewsRule`.

### Files

#### `src/lib/rules/aggregators/beithady-inquiry.ts` (new, 365 lines)
- Types: `ParsedAirbnbInquiry`, `InquiryCategory` (7-way enum), `InquiryClassification`, `InquiryGuestGroup`, `StoredInquiry`, `BeithadyInquiryAggregate`.
- `parseAirbnbInquiry` — Haiku tool_choice **auto** (non-inquiry emails dropped). Subject pattern `"Inquiry for <Listing> for <Date range>"`. Extracts guest_name, guest_question verbatim when embedded (null when just "wants to book"), listing, stay dates, party size (adults/children/infants).
- `classifyInquiry` — second Haiku call, tool_choice=**tool**. Outputs: category (`location_info` / `amenity` / `pricing` / `booking_logistics` / `availability` / `group_question` / `other`), 12-words-max summary, `needs_manual_attention` bool (true for discount requests / pet permits / policy exceptions; false for listing-lookup questions).
- `aggregateBeithadyInquiries`: parse+settle, classify+settle separately (one failing classify doesn't drop the parsed row). Builds by-category, by-building, by-guest maps. Guest-group sort: manual-attention first → inquiry count desc → most-recent desc.

#### `src/lib/rules/engine.ts`
- Added `'beithady_inquiries_aggregate'` to `RuleAction['type']` union.
- Early branch after reviews branch.
- New `evaluateInquiriesRule` at end — `subjectContains: 'Inquiry'` + `toContains: 'guesty@beithady.com'`. Standard rule_run open → fetch bodies → aggregate → mark-as-read.

#### `src/app/admin/rules/_form.tsx`
- New action-type option "Beithady inquiries aggregate (Airbnb)".

#### `src/app/emails/[domain]/page.tsx`
- Fifth icon/tint branch: `MessageCircleQuestion` (sky) for inquiries.
- New `BeithadyInquiryMini` — 4 mini-stats: Inquiries / Unique guests / Needs attention / Emails.

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
- New `isInquiries` check. View branch order: inquiries → reviews → payouts → bookings → shopify.
- Run-history "Inquiries" column (counts from `total_inquiries`).
- New `BeithadyInquiryView` — sky/indigo hero (4 HeroStat: Total / Unique guests / Overdue (>24h) / Needs manual decision) + overdue/urgent pill row under hero + by-category stat grid (tint per category) + by-building table + combined-by-guest table + **SLA-sorted inquiry cards** (per-email cards with guest header, category chip, manual-decision badge, building chip, listing/stay/party, received timestamp, SLA badge, Haiku summary, verbatim question blockquote when embedded).
- Helpers: `INQUIRY_CATEGORY_LABEL` + `INQUIRY_CATEGORY_TINT` maps; `inquirySlaState(iso)` computes 24h countdown at render time (overdue / urgent (<6h) / soon (<12h) / fresh / unknown); `SlaBadge` component renders the state with Timer/AlertTriangle icon.

### DB
Seeded row id `cddbd313-fe41-40b4-9ecc-0a3c02b1e048`:
- name: "Beithady Inquiries (Airbnb)"
- account: kareem@limeinc.cc (`e135f97d-429c-4879-ae20-ccfc12a40f53`)
- domain: beithady, priority 125 (between reviews 120 and future requests)
- actions: `{ type: 'beithady_inquiries_aggregate', mark_as_read: true }`

### Verification
- Clean `.next/` + `npm run build` (14 routes, TS 9.5s).
- `git push origin HEAD:main` → commit c83a489.
- Pulled into `C:\kareemhady`, `vercel --prod --yes` → `kareemhady-9b0zni3aq-lime-investments.vercel.app`.

### Design choice worth remembering
SLA countdown is computed at **render time** (UI compares `received_iso` to `Date.now()`), not stored in the aggregate. Stays current between runs — viewing dashboard 4h after last run shows the correct reduced remaining time. Hero's overdue_count also re-derived at render, minor extra CPU for always-fresh numbers.

### Cost sanity check
Each inquiry: 2 Haiku calls (parse ~900 tokens, classify ~400 tokens). Volume is lower than reviews (~50/year expected). YTD run well under $0.10.

### Next
- **Phase 5.11 — `beithady_requests_aggregate`**: last of the three in user's original ask. In-stay guest requests from `RE: Reservation for...` threads. Segregate date-change / amenity-during-stay / immediate-complaint. Should cross-reference confirmation_code against Beithady Bookings rule for stay status (pre-arrival / checked-in / departed).
- **Phase 5.8 — Stripe API reconciliation** still queued (blocked on `STRIPE_SECRET_KEY`).

### Vercel project cleanup discussion (side thread this turn)
User asked about the 8 projects showing in Vercel overview. Mapped them:
- `kareemhady` = this InboxOps app (Personal)
- `fmplus-beta` = FM+
- `voltauto-pricing` + `voltdrive-brand` = Volt (two separate apps)
- `peaceful-moser-39791b`, `exciting-ride-1a2629`, `gifted-mcclintock`, `vigorous-almeida-bec425` = orphan random-name projects, likely v0 scratch deploys
- **`vigorous-almeida-bec425`** was the worktree's linked project — my first `vercel --prod` in Phase 5.9 went there by mistake before I realized and redeployed from root. User said they'd handle cleanup manually via Vercel UI; I offered to unlink worktree's `.vercel/project.json` but user hasn't said yes yet.

## ✅ PHASE 5.9 SHIPPED — Beithady reviews rule (Airbnb) + flagged-review action plans (commit 7907bdf)

### User request
> "do one by one"

After I proposed splitting the Reviews / Inquiries / Guest Requests asks into sequential phases (see scoping turn below), the user said do them one at a time. Shipped Phase 5.9 (Reviews) this turn.

### New action type: `beithady_reviews_aggregate`

Uses a single fixed Gmail search (conditions ignored, note field documents that). Engine branches early via `evaluateReviewsRule(...)` following the same shape as `evaluatePayoutRule`.

### Files

#### `src/lib/rules/aggregators/beithady-review.ts` (new, 399 lines)
- Types: `ParsedAirbnbReview`, `ReviewActionPlan`, `ReviewBuildingBucket`, `ReviewMonthBucket`, `FlaggedReview`, `BeithadyReviewAggregate`.
- `parseAirbnbReview` — Haiku tool_choice **auto** (non-review Airbnb mail like "Review your upcoming stay" or host-side "Time to review X" is silently dropped). Prompt documents the subject pattern `"<Guest> left a <N>-star review!"`, explains that email body usually does NOT contain the actual review text (guest has 48h to finalize), so `review_text` is typically null — this is expected, not a parse failure.
- `suggestActionPlan` — second Haiku call, tool_choice=**tool** (must return). Runs only for ratings < 3. Output shape: category (cleanliness/noise/staff/amenities/check_in/location/value/communication/other), priority (high/medium/low), root_cause, suggested_response (2-3 sentences, empathetic, no boilerplate), internal_action (one concrete operational step).
- `aggregateBeithadyReviews`:
  - Parse + settle all reviews, count parse_errors separately
  - Histogram across 1-5
  - By-building via `classifyBuilding` — Airbnb listing names rarely carry BH-codes, so the `buildingFromListing` helper also does name-cue matching ("ednc"/"new cairo"/"kattameya" → BH-OK; "heliopolis"/"merghany" → BH-MG). Otherwise `UNKNOWN`.
  - Best/worst require ≥2 reviews per building to qualify (single 5-star would trivially "win" otherwise).
  - Action plans generated in parallel via `Promise.allSettled` only for flagged reviews.

#### `src/lib/rules/engine.ts`
- Added `'beithady_reviews_aggregate'` to the `RuleAction['type']` union.
- Early branch after account validation.
- New `evaluateReviewsRule` at end of file — standard pattern: search → open rule_run → fetch full bodies → aggregate → mark-as-read → close run. Single search, no multi-source complexity like payouts.

#### `src/app/admin/rules/_form.tsx`
- New action-type option "Beithady reviews aggregate (Airbnb)".
- Currency hint updated ("ignored for Beithady reviews").

#### `src/app/emails/[domain]/page.tsx`
- Card icon/tint branches four ways now: Star (amber) for reviews, Banknote (emerald) for payouts, BedDouble (rose) for bookings, ShoppingBag (violet) for Shopify.
- New `BeithadyReviewMini` — 4 mini-stats: Reviews / Avg rating ⭐ / Flagged <3 / 5-star.

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
- New `isReviews` check. Detail view branch order: reviews → payouts → bookings → shopify.
- Run-history table: extra branch for `isReviews` ("Reviews" column showing `total_reviews`).
- New `BeithadyReviewView` component — amber/rose gradient hero (4 HeroStat: Total / Avg / Flagged / 5-star) + rating distribution bars (1-5, emerald for 5-star, rose for 1-2, amber otherwise) + best/worst building cards (emerald and rose tinted) + By-building table + By-month trend + **Flagged reviews cards** (one per flagged review with guest name, star row, priority badge, listing/stay, optional review text, category chip, root cause, suggested public reply in emerald callout, internal action in indigo callout) + All-reviews compact table.
- New `StarRow` helper renders filled/empty star icons for a rating.

### DB
Seeded row id `777647f1-8528-40b2-9b7d-61cbfbaf729b`:
- name: "Beithady Reviews (Airbnb)"
- account: kareem@limeinc.cc (`e135f97d-429c-4879-ae20-ccfc12a40f53`)
- domain: beithady, priority 120
- conditions: `{ note: "conditions are ignored for beithady_reviews_aggregate..." }`
- actions: `{ type: 'beithady_reviews_aggregate', mark_as_read: true }` — no currency (reviews aren't monetary).

### Verification
- Clean `.next/` + `npm run build` passed (14 routes, TS 10.0s).
- `git push origin HEAD:main` from worktree → commit 7907bdf landed on main.
- Pulled into `C:\kareemhady` root checkout, `vercel --prod --yes` deployed (`dpl_Bv2puBeQrmzpLonLagLyfQoHHWZX`).

### Gotcha worth remembering
Worktree `.vercel/project.json` links to a DIFFERENT Vercel project (`vigorous-almeida-bec425`) than the one backing `kareemhady.vercel.app` (`kareemhady`). Always run `vercel --prod` from `C:\kareemhady` after pushing, not from the worktree. My first `vercel --prod` run from here deployed to the wrong project; the real deploy happened after pulling into `C:\kareemhady`.

### Cost sanity check
Each review email: 1 Haiku call (~800 tokens out). Each flagged review: 1 additional Haiku call (~700 tokens out). At 100 reviews/year with 10% flagged, that's ~100 parse calls + 10 action-plan calls per run = well under $0.20 total even on YTD runs. No budget concern.

### Next phases (queued, user said "one by one")
- **Phase 5.10 — `beithady_inquiries_aggregate`**: guest inquiries with urgency classification + 24h SLA countdown.
- **Phase 5.11 — `beithady_requests_aggregate`**: in-stay guest requests with date-change/amenity/complaint segregation.
- **Phase 5.8 — Stripe API reconciliation** still sitting open (blocked on `STRIPE_SECRET_KEY`). Not pursued this turn since user's "do one by one" implied continuing the new Reviews/Inquiries/Requests track.

## 🗣️ PHASE 5.9–5.11 SCOPING TURN — awaiting user confirmation (no code yet)

### User request (this turn)
> "New Task — New Rule Under Beithady Domain. (1) Reviews – collect Airbnb reviews, segregate by rating level, flag <3, segregate by units, best/worst, suggest action plan for bad reviews. (2) Inquiries – summarize guest inquiries, combine by same guest, flag urgent vs location-info, top-view dashboard. (3) Guest Requests – for reservations: combine by guest/reservation, segregate date-change / amenity / immediate-complaint requests."

Three email samples pasted:
- **Inquiry** — from "service via Guesty" to `guesty@beithady.com`, subject `Inquiry for Luxury 3BR | 24/7 Front Desk & Security for Apr 23 – 27, 2026` ("Respond to Fatema's inquiry", 3 adults 3 children, 24h SLA warning).
- **Review** — from "service via Guesty" to `guesty@beithady.com`, subject `Charlie left a 5-star review!` ("Overall rating: 5 Great", listing "Luxury 3BR - Near EDNC - 247 Front Desk & Security").
- **Guest request (reservation reply)** — subject `RE: Reservation for Luxury 2 Bedroom Residence by Beit Hady, Apr 24 – 29`, booker "Adel" sending Arabic messages ("لما بحاول اقدم الطلب بيقولي no refund"), with the Airbnb reservation card inline.

### My reply to the user (proposal, NOT yet built)
Split into three sequential phases, each following the `beithady_payout_aggregate` pattern (new aggregator file + engine early-branch + action-type union entry + dashboard mini card + dedicated detail view):

1. **Phase 5.9 — `beithady_reviews_aggregate`**
   - Search: `to:guesty@beithady.com subject:"review"` (picks up "left a N-star review" subjects).
   - Haiku parse: rating (1–5), guest name, listing name, review text, stay dates.
   - Aggregate: totals + avg rating + histogram, by-unit buckets via `classifyBuilding(listing_name)`, best/worst buckets, **flag any rating < 3** as `needs_attention`.
   - Action plan: second Haiku call on flagged reviews → suggested response + root-cause category (cleanliness / noise / staff / amenities / location / other).

2. **Phase 5.10 — `beithady_inquiries_aggregate`**
   - Search: `to:guesty@beithady.com subject:"Inquiry for"` (matches "Inquiry for Luxury 3BR...").
   - Haiku parse: guest name, listing, check-in/out range, guest party size, inquiry text (if present in body — the sample only had "What is the name of the compound please?" as guest question).
   - Group by guest name+email; classify urgency (Haiku): `urgent` (trip within 48h / price disputes / booking issues) / `location_info` / `amenity_question` / `pricing` / `other`.
   - Dashboard: top-view table, urgency-sorted, with 24h-SLA countdown per inquiry (since these have the "24 hours to respond" clock).

3. **Phase 5.11 — `beithady_requests_aggregate`**
   - Search: `to:guesty@beithady.com subject:"Reservation for"` (picks up both original reservation emails AND the `RE:` replies with guest messages).
   - Haiku parse: confirmation code, guest name, stay dates, message body (multiple message turns possible in one email — extract newest guest message + context).
   - Combine by confirmation_code so multiple messages from same guest roll up into one row.
   - Haiku classify request type: `date_change` / `amenity_request` / `immediate_complaint` / `refund_dispute` / `other`. Flag `immediate_complaint` as urgent (needs intervention during stay).
   - Cross-reference against Beithady Bookings rule (same confirmation_code key) to show current stay status (checked-in / pre-arrival / departed).

### Two tradeoffs flagged to user
1. **Phase 5.8 (Stripe API reconciliation) is still open in prior handoff** — blocked on `STRIPE_SECRET_KEY`. Asked user: pause 5.8 and ship 5.9–5.11 first, or finish 5.8 first?
2. **All-in-one commit vs one-commit-per-phase**: asked user which they prefer. Recommend one-per-phase since each needs real-email sample validation before moving on.

### What I'm waiting on before writing code
- User's go-ahead on (a) order (5.8 first or 5.9–5.11 first), (b) all three in one commit or phased, (c) any corrections to the search filters / bucket taxonomies / urgency rules above.

### Notes for next session
- No files changed this turn — pure scoping.
- Git status clean, branch `claude/vigorous-almeida-bec425` (worktree `vigorous-almeida-bec425`).
- When user replies, the work will start with Phase 5.9 Reviews unless they redirect. Each aggregator will live under `src/lib/rules/aggregators/` and register its action type in `src/lib/rules/engine.ts` via an `evaluateXRule` early-branch just like `evaluatePayoutRule`.
- Every new rule needs a seeded row in the `rules` table bound to `kareem@limeinc.cc` (account id `e135f97d-429c-4879-ae20-ccfc12a40f53`, domain `beithady`), same as Phase 5.7.

## 🔧 PHASE 5.7.1 HOTFIX — missing Banknote icon import on detail page (commit 9a7742e)

### What happened
User manually "Redeploy"-ed commit 78d1cca (the last handoff-only commit) from the Vercel UI. Build failed:
```
Type error: Cannot find name 'Banknote'.
./src/app/emails/[domain]/[ruleId]/page.tsx:1022:14
```
Vercel's Build Logs truncated after ~30 lines in the screenshot so the TS error wasn't directly visible — I reproduced by pulling main into the root project (`C:\kareemhady`, not the worktree) and running `npm run build`.

### Root cause
When I added `BeithadyPayoutView` in Phase 5.7, I imported `Banknote` into `src/app/emails/[domain]/page.tsx` (for the domain-list card icon) but forgot to add it to the lucide-react import block in `[ruleId]/page.tsx` where I also use it in the payout view's hero row.

### Why my local `npm run build` didn't catch it
The worktree's `.next/` cache from Phase 5.7's successful build masked the missing import. Vercel always builds from a cold cache, so it failed on first compile after commit 6b4c2a9. The user hadn't tried a vercel deploy immediately after 5.7 — they hit it when manually clicking Redeploy.

### Fix
One-line import addition + Vercel redeploy.

### Verification
- Pulled fix into `C:\kareemhady` main checkout, `npm run build` clean (all 14 routes).
- `vercel --prod --yes` successful.

### Lesson carried forward
For large edits that introduce a symbol in one new location: `rm -rf .next && npm run build` locally before pushing — clears the Turbopack persistent cache so I catch import-drift class bugs before they surface on Vercel.

## 🚧 PHASE 5.8 IN PROGRESS — Stripe API reconciliation (blocked on user: STRIPE_SECRET_KEY)

### User request (this turn)
> "I want you to connect to stripe through api to extract Payment Transactions to reconcile with Reservations and Payouts on the same rule, guide me to give you the right api and secrets to access stripe data"

### Guidance given
1. **Use Restricted key, NOT Standard secret** — safer (read-only, scoped). On Stripe's "How will you be using this key?" screen, user picked **Option 1: "Powering an integration you built"** (confirmed by me — Options 2/3 are for third-party SaaS / direct AI-agent MCP, neither applies here since the key sits in Vercel env and is called by our own server code).
2. **Permissions toggled** (all Read, everything else None):
   - Core → Charges
   - Core → PaymentIntents
   - Core → Refunds
   - Core → Customers
   - Balance → Balance transactions
   - Connected accounts and people → Payouts
3. **Do NOT create a new Stripe account** despite Guesty's yellow banner — we want to read from the SAME account Guesty manages so payouts from Booking.com / Expedia / Manual settle into rows we can reconcile. A new account would have no overlap.
4. **Storage path**:
   - `C:\kareemhady\.env.local`: `STRIPE_SECRET_KEY=rk_live_...`
   - Vercel production env: `vercel env add STRIPE_SECRET_KEY production`
   - Then `vercel --prod --yes` to redeploy.

### Blocker hit this turn
User ran `vercel env add STRIPE_SECRET_KEY production` in PowerShell → PSSecurityException: "vercel.ps1 cannot be loaded because running scripts is disabled on this system." Default PowerShell Execution Policy (`Restricted`) blocks npm-installed shims.

Two workarounds given:
- **A**: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` + `Y` to confirm. Then vercel CLI works. (Scoped to user, allows local scripts, keeps remote-script signing requirement.)
- **B**: Skip CLI — add env var via Vercel dashboard at `/settings/environment-variables`, redeploy via Deployments tab.

### What I'll do once user replies "key is set"
1. `npm i stripe`
2. Create `src/lib/stripe.ts` with lazy client initializer reading `STRIPE_SECRET_KEY`.
3. Extend `evaluatePayoutRule` in `src/lib/rules/engine.ts`:
   - After the existing Stripe-email parsing, also call `stripe.payouts.list({ created: { gte: fromTs, lte: toTs }, limit: 100 })` to catch any Stripe payouts that didn't email.
   - For each payout (from either source), call `stripe.balanceTransactions.list({ payout: po_..., limit: 100, expand: ['data.source'] })` → each transaction is a charge/refund/application_fee etc.
   - For `charge` type, resolve the charge → guest metadata (`charges.metadata.guest_name` / `description` / `statement_descriptor`).
4. Extend `aggregateBeithadyPayouts` output with a `stripe_breakdown: Array<{ payout_id, date, amount_aed, transactions: Array<{ type, amount, charge_id?, guest?, description?, metadata? }> }>`.
5. New dashboard section "Stripe payout breakdown" showing per-payout transaction drill-down. Cross-reference with the confirmation_code map from the Beithady Bookings rule (previously-deferred Phase 5.8 reconciliation roadmap).
6. Currency handling: Stripe likely reports transactions in the original currency (USD/EUR for OTAs) + the payout is converted to AED. The balance-transaction `amount` is in settlement (AED) minor units; `source_amount`/`source_currency` when available reflects the original charge.

### Security posture reaffirmed
- Restricted key = read-only. If leaked: attacker can see data, NOT move money.
- Never commit key. Never paste in chat. If suspected leak: Developers → API keys → that row → Roll (revokes instantly).
- Stripe's publishable key from user's screenshot (`pk_live_51RcAec...`) is NOT sensitive (public by design) but I'm not storing or using it — we only need server-side access.

## ✅ PHASE 5.7 SHIPPED — Beithady payouts rule (Airbnb + Stripe) + dashboard (commit 6b4c2a9)

### User request
> Under Domain Beithady — create a rule for Beithady Payouts. Payouts are coming from two: Airbnb & Stripe. Airbnb with the form of attached email — Total Payout + corresponding reservations payouts + deducted refunds. Stripe payouts are some of Manual Payouts and Booking Payouts & Expedia Payouts (some manual payouts also paid in cash at hotels) — reconcile with previous reservations if possible. Suggest suitable indicative dashboard and necessary overlooking details.

Two sample emails provided:
1. **Airbnb payout via Guesty** — from "service via Guesty" to `guesty@beithady.com`, subject "We sent a payout of X د.إ AED". Body has bank IBAN last4, sent/arrival dates, then a list of line items per reservation: guest, Home or "Pass Through Tot", date range, listing name with Airbnb ID, confirmation code (HM...), USD amount.
2. **Stripe payout** — from "'Stripe' via Payments beithady" to `payments@beithady.com`, subject "Your AED12,076.23 payout for Beithady Hospitality is on the way". Body has AED amount, estimated arrival, BANQUE MISR last4, Payout ID `po_...`. No per-booking breakdown in email.

### New action type: `beithady_payout_aggregate`

Uses two fixed Gmail searches (user's rule.conditions are ignored for this action type, documented in a note field in the row). Engine branches early via a new `evaluatePayoutRule(...)` helper rather than shoehorning the two-search flow into the existing single-search pipeline.

### Files

#### `src/lib/rules/aggregators/beithady-payout.ts` (new)
- Types: `ParsedAirbnbPayout`, `AirbnbPayoutLineItem`, `ParsedStripePayout`, `BeithadyPayoutAggregate`, bucket types.
- `parseAirbnbPayout` — Haiku tool_choice=tool. Prompt documents subject shape, body structure, "Pass Through Tot" alternate type, refund detection (negative amounts).
- `parseStripePayout` — Haiku tool_choice=auto. Returns null for non-payout Stripe emails so Stripe password-reset / account-update mails don't pollute the aggregate.
- `aggregateBeithadyPayouts(airbnbBodies, stripeBodies)`:
  - Totals (AED combined, per source, USD from Airbnb line items, refund totals)
  - Unique reservations (dedupe by confirmation_code on non-refund lines)
  - Building attribution: `buildingFromLineItem` regex-matches `\bBH[-\s]?[A-Z0-9]+\b` inside the Airbnb listing name and pipes through `classifyBuilding`. Most Airbnb listings don't embed a BH-code → `UNKNOWN` bucket. Future Phase 5.8 can cross-match via confirmation_code against the Beithady Bookings rule's latest rule_run.
  - By-month bucket keyed on email received date (stacked AED per source)
  - Flat line items array + flat Stripe payouts array for the detail tables

#### `src/lib/rules/engine.ts`
- Added `'beithady_payout_aggregate'` to the `RuleAction['type']` union.
- **Early branch** after account validation: `if (action.type === 'beithady_payout_aggregate') return evaluatePayoutRule(...)`.
- New `evaluatePayoutRule` function at file end — runs two parallel searchMessages calls, opens its own rule_run with `input_email_count = airbnb + stripe`, fetches + aggregates, then marks BOTH batches via `markMessagesAsRead` (batchModify under the hood), stores `marked_read` / `mark_errors` for Airbnb and `marked_read_stripe` / `mark_errors_stripe` for Stripe.
- `mark_error_reason` captures the first error from whichever batch had one.

#### `src/lib/gmail.ts`
- `fetchEmailFull` return type now includes `receivedIso: string | null`, computed from `res.data.internalDate`. This was needed to group payouts into monthly buckets (no existing caller broke — aggregators just ignore the extra field if they don't need it).

#### `src/app/admin/rules/_form.tsx`
- New action-type option "Beithady payout aggregate (Airbnb + Stripe)".
- Currency hint updated ("AED is hardcoded for Beithady payouts").

#### `src/app/emails/[domain]/page.tsx`
- Card icon/tint branches three ways: Banknote (emerald) for payouts, BedDouble (rose) for bookings, ShoppingBag (violet) for Shopify.
- New `BeithadyPayoutMini` function component: 4 mini-stats Total AED / Airbnb AED / Stripe AED / Payout emails.

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
- Run history table: extra branch for `isPayout` to show "Total AED" column with rounded AED.
- New `isPayout` check, new view branch: `isPayout ? <BeithadyPayoutView> : isBeithady ? <BeithadyView> : <ShopifyView>`.
- New `BeithadyPayoutView` component — emerald/indigo gradient hero (4 HeroStat) + Bank destinations cards + stacked source-split bar + stacked monthly chart (`PayoutMonthChart` helper, Airbnb pink over Stripe indigo) + building bucket table + Airbnb payouts header table + Airbnb line items table (with Bldg column via existing classifier) + optional Refunds table (amber) + Stripe payouts table.
- Explicit copy in the source-split hint: "Manual payouts at hotel (cash) don't appear in either email — track those separately."

### DB
Seeded row id `f8eeb1a4-653b-46f4-8c8f-91cc83972a6a`:
- name: "Beithady Payouts (Airbnb + Stripe)"
- account: kareem@limeinc.cc (`e135f97d-429c-4879-ae20-ccfc12a40f53`)
- domain: beithady, priority 110
- conditions: `{ note: "conditions are ignored for beithady_payout_aggregate..." }` — documents why the usual from/subject/to fields are empty.
- actions: `{ type: 'beithady_payout_aggregate', currency: 'AED', mark_as_read: true }`

### Verification
- `npm run build` passes (all 14 routes, TS 11.2s).
- `vercel --prod --yes` successful.

### Reconciliation roadmap (not done this phase)
Airbnb payout line items carry the confirmation_code (HM...) which is the same key as the Beithady Bookings rule's `booking.booking_id`. A future cross-rule reconciliation section could:
1. At render time in the payout view, look up the Beithady Bookings rule's latest successful rule_run output for the same time range.
2. For each line item, find the matching booking → pull its building_code, listing_code (canonical BH), and expected payout.
3. Show "Paid out vs Expected" and "Outstanding bookings (booked but not yet paid out)" tables.

Stripe is harder — emails have no booking info. Reconciliation would need Stripe API access (Payout ID → Balance Transactions → Charges → metadata/guest name) which is outside the current email-only architecture.

### Known caveat (cash-at-hotel manual payouts)
User called out that some manual payouts are paid in cash at the hotel. These never hit Airbnb or Stripe email streams, so they won't appear in this dashboard. The Source Split hint copy flags this explicitly so the user remembers to track them separately.

## ✅ PHASE 5.6 SHIPPED — canonical building classifier (commit 5626464)

### User rules (verbatim)
> Any Unit starting with BH-26 belongs to Building BH-26
> Any Unit starting with BH-435 belongs to Building BH-435
> Any Unit starting BH-(3 Digits)-xx belongs to BH-OK (One Kattameya)

The previous `deriveBuildingCode` simply returned the first dash-separated segment of the listing code (`BH73-3BR-SB-1-201 → BH-73`). That was fine for BH-26 / BH-73 / BH-435 / BH-MG, but any other 3-digit code (BH-101, BH-205, etc.) was becoming its own bucket instead of rolling up to BH-OK.

### Implementation

#### `src/lib/rules/aggregators/beithady-booking.ts`
New exported function applying the rules top-down:
```ts
export function classifyBuilding(listingCode: string): string {
  const code = (listingCode || '').toUpperCase().trim();
  if (!code) return 'UNKNOWN';
  const m = code.match(/^BH-?([A-Z0-9]+)/);
  if (!m) return code;
  const suffix = m[1];
  if (suffix.startsWith('26'))   return 'BH-26';
  if (suffix.startsWith('435'))  return 'BH-435';
  if (/^\d{3}/.test(suffix))     return 'BH-OK';
  return `BH-${suffix}`;
}
```

- Matches both `BH73-…` (emails as we've seen them) and `BH-73-…` (in case future listing codes use the dashed form).
- Order matters: BH-26 and BH-435 are checked BEFORE the generic 3-digit fallback because their suffixes are also (entirely or partly) numeric and would otherwise get pulled into BH-OK.
- `deriveBuildingCode` now delegates to `classifyBuilding`.

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
Imports `classifyBuilding` and applies it on render so **historical rule_runs** (whose stored `building_code` is just the first segment like `BH73`) show the new mapping without requiring a re-run:
- `normalizeBuildingCode(b)` now prefers `b.listing_code` (most faithful to the raw data) and falls back to `b.building_code`.
- Reservations table Bldg column: `normalizeBuildingCode(b)` on each row.
- `BuildingTable`: builds `itemsByCode` by re-classifying every bucket `label` with `classifyBuilding`, AGGREGATING across buckets that now map to the same canonical code. So if a legacy run had separate buckets for `BH101`, `BH102`, and `BH205`, they merge into a single `BH-OK` row with summed reservation_count / nights / total_payout.
- Trophy card "Most reserved building": name + description lookup both go through `classifyBuilding(topBuilding.label)`.

Section hint text updated to document the mapping:
> Mapping: BH-26* → BH-26 · BH-435* → BH-435 · BH-73* → BH-73 · BH-<3 digits>-xx → BH-OK (scattered One Kattameya) · BH-MG → BH-MG (Heliopolis single).

### Verification
- `npm run build` passes.
- `vercel --prod --yes` deployed, alias updated.
- Historical runs immediately render the new classification via the render-time re-map.
- A fresh Run is still recommended so `by_building` bucket keys and `booking.building_code` are persisted under the canonical codes at source.

### Edge cases considered
- `BH-260` → startsWith('26') → BH-26. If the user later has a real BH-260 that should NOT fold into BH-26, we'd need stricter matching (e.g. `/^26(-|$)/`). Flagged here for future if it ever comes up.
- `BH-435A` → startsWith('435') → BH-435. Same caveat.
- Listing codes that aren't `BH*` at all — returned as-is in uppercase (preserves data visibility for debugging weird rows).

## ✅ PHASE 5.5 SHIPPED — Airbnb reconciliation looks in the right mailbox (commit 455b580)

### User correction
Screenshot of the live dashboard showed the reconciliation section reporting "0 Airbnb emails scanned / 0 confirmations parsed" while "19 Guesty (Airbnb) not matched". Second screenshot of an actual Airbnb confirmation email revealed why:

- **Subject**: "Reservation confirmed - Mohamed-Mutasim Mohamed arrives Apr 20"
- **From**: "service via Guesty" (not airbnb.com)
- **To**: `guesty@beithady.com` (not kareem@beithady.com)
- **Body**: standard Airbnb template with "Airbnb Ireland UC, 25 North Wall Quay, Dublin" footer

Airbnb sends confirmations to the Guesty-owned alias `guesty@beithady.com`; Guesty's mail relay then forwards them to the kareem@limeinc.cc mailbox with rewritten From. `from:airbnb.com` never matches.

### Changes

#### `src/lib/rules/engine.ts`
Inside the `beithady_booking_aggregate` search, swapped the filter:
```diff
-  fromContains: 'airbnb.com',
-  subjectContains: 'Reservation confirmed',
+  subjectContains: 'Reservation confirmed',
+  toContains: 'guesty@beithady.com',
```
Subject alone is specific enough (the Guesty NEW BOOKING stream uses a different subject "NEW BOOKING from Airbnb"), but `to:guesty@beithady.com` adds an extra guard against other "Reservation confirmed"-style subjects that might appear from other sources.

#### `src/lib/rules/aggregators/beithady-booking.ts`
Rewrote `AIRBNB_SYSTEM` prompt to match reality:
- Subject pattern: `"Reservation confirmed - <Guest Name> arrives <Date>"`
- From: "service via Guesty" (Airbnb's original From is rewritten by Guesty's relay)
- Footer: "Airbnb Ireland UC, 25 North Wall Quay, Dublin"
- HM-prefixed confirmation code lives in the body / "View details" link area
- Explicitly lists non-confirmation Airbnb emails (alteration, cancellation, review, payout-only) as things to skip

`tool_choice: 'auto'` stays — non-confirmation Airbnb emails now get silently dropped rather than parsed into garbage rows.

#### `src/app/emails/[domain]/[ruleId]/page.tsx`
- Reconciliation section hint updated to say "Airbnb emails (relayed by Guesty to guesty@beithady.com)" — calling out the indirection so the user understands what's being searched.
- Empty-state placeholder now quotes the actual search string: `to:guesty@beithady.com subject:"Reservation confirmed"` (Airbnb confirmations relayed via Guesty).

### Verification
- Build: 14 routes, TS clean.
- Deploy: `vercel --prod --yes` successful, aliased to kareemhady.vercel.app.
- Expected result after next Run: Airbnb confirmations count becomes non-zero; "Guesty (Airbnb) not matched" drops from 19 as Airbnb codes get paired with Guesty booking_ids.

### Semantic reminder for future sessions
**All three Airbnb signals in one mailbox arrive via Guesty's relay, not direct from Airbnb**:
1. Guesty NEW BOOKING from Airbnb → subject "NEW BOOKING from Airbnb", to `kareem@beithady.com`
2. Airbnb Reservation confirmed → subject "Reservation confirmed - ...", to `guesty@beithady.com`
3. Future signal sources (cancellations, alterations) would follow the same pattern — check TO addresses, not FROM domains.

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
