<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (Next.js 16 + React 19 + Tailwind v4) has breaking changes —
APIs, conventions, and file structure may all differ from your training
data. Read the relevant guide in `node_modules/next/dist/docs/` before
writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Lime Investments Dashboard

Single-tenant operations cockpit for **Lime Investments**. The repo
started life as "InboxOps" — a Phase-1 Gmail-digest tool — and has
grown into a multi-domain platform covering:

- **Beithady** — short-term-rental / hospitality ops (CRM, comms inbox,
  ads, gallery, operations, inventory, pricing, financials, AI replies,
  loyalty, market intel, morning brief, …)
- **Boat Rental** — bookings, payments, expenses, recurring expenses,
  skipper roster, owner-blocks, cancellation requests
- **Kika** — Shopify swimwear storefront (sales, raw materials,
  abandoned checkouts, daily report)
- **FMPLUS / VoltAuto** — additional subsidiaries surfaced through
  the same dashboard
- **Integrations** — Gmail, Guesty, Odoo, PriceLabs, Shopify, Stripe,
  Anthropic, WhatsApp (Green-API)

This file is the standalone source of truth. The previous `AGENTS.md`
described only the Phase-1 Gmail piece and was retired during the
2026-05-03 cleanup.

## Tech stack

- **Next.js 16** — App Router, Turbopack, `src/` dir, server actions
- **React 19**
- **TypeScript** strict mode (`tsconfig.json`); path alias `@/*` → `./src/*`
- **Tailwind v4** via `@tailwindcss/postcss` — there is **no**
  `tailwind.config.*` (v4 is config-by-convention)
- **Supabase** Postgres — project `bpjproljatbrbmszwbov`, region
  eu-central-1, org "Lime Investments". Service-role client in
  [src/lib/supabase.ts](src/lib/supabase.ts), browser client in
  [src/lib/supabase-browser.ts](src/lib/supabase-browser.ts).
- **Vercel Pro** — hosting, edge config, ~40 cron schedules in
  [vercel.json](vercel.json)
- **Vitest** — unit tests, colocated `*.test.ts`
- **PWA** — service worker at `/sw.js`, manifest, install prompt,
  offline IndexedDB queue ([src/lib/offline/](src/lib/offline/))
- Notable libs: `googleapis`, `@anthropic-ai/sdk`, `stripe`, `zod`,
  `recharts`, `@react-pdf/renderer`, `exceljs`, `@dnd-kit/*`,
  `lucide-react`

## npm scripts

```
npm run dev          # next dev (Turbopack)
npm run build        # next build
npm run start        # next start
npm run test         # vitest run
npm run test:watch   # vitest (watch mode)
```

There is **no `lint` script** wired up. There is no local CI step;
deploys go through `vercel --prod` after a push (see "Deploy").

## Repo layout

```
src/
  app/                 # App Router routes
    _components/       # Shared UI primitives (toast, theme, brand, sw-register, …)
    api/               # Route handlers
      auth/            # Google OAuth + login/logout/bootstrap
      cron/            # Vercel cron handlers (one folder per job)
      webhooks/        # Inbound webhooks (Guesty, Stripe, etc.)
      run-now/         # Manual trigger for the Gmail ingest
      <domain>/        # beithady, boat-rental, guesty, odoo, pricelabs,
                       # shopify, leads, analysis
    beithady/          # Beithady operator UI
    admin/             # Admin console (accounts, users, integrations, rules)
    account/, login/, emails/, g/, r/   # Misc routes
  lib/
    <domain>/          # beithady/, boat-rental/, whatsapp/, rules/, offline/
    run-*.ts           # Cron/job entry points (run-daily, run-guesty-sync, …)
    supabase.ts        # supabaseAdmin() — service-role
    supabase-browser.ts
    crypto.ts          # AES-256-GCM for OAuth refresh tokens
    auth.ts, auth-constants.ts, credentials.ts
    <integration>.ts   # gmail, guesty, odoo, pricelabs, shopify, stripe,
                       # anthropic, …
supabase/migrations/   # Numbered SQL (0001_init.sql → 0078_…); 97 files
docs/                  # PHASE_*_PREFLIGHT.md, plans/, specs/
public/                # Static assets, PWA manifest, service worker
```

## Conventions

- **File naming**: kebab-case throughout (`run-daily.ts`, `fmt-date.ts`,
  `module-card.tsx`, `bottom-sheet.tsx`).
- **Path alias**: `@/*` → `./src/*` ([tsconfig.json](tsconfig.json)).
- **TypeScript**: `strict: true`. Validate any external data (webhooks,
  third-party API responses, form input) with Zod.
- **App Router**:
  - `_components/` (underscore prefix) is Next's convention for
    non-routable folders.
  - Keep route handlers thin — business logic lives in
    `src/lib/<domain>/`.
  - Server-only modules import from `src/lib/supabase.ts`
    (service-role); client modules from `src/lib/supabase-browser.ts`.
- **Cron handlers**: each is `src/app/api/cron/<name>/route.ts`; the
  schedule is registered in [vercel.json](vercel.json). Cron requests
  must carry `Authorization: Bearer $CRON_SECRET`.
- **DST-safe schedules**: jobs that should fire at "Cairo 9 AM" are
  registered twice in UTC (e.g. `0 6 * * *` and `0 7 * * *`) and the
  handler gates on `Cairo local hour == 9` so DST flips don't require
  redeploys. Use `?force=1` to bypass the gate when manually testing.
- **Migrations**: numbered, append-only, in `supabase/migrations/`.
  Apply via Supabase dashboard → SQL Editor (the CLI is unreliable on
  Windows; see Gotchas).
- **Tests**: colocated `*.test.ts` next to the module
  (e.g. [src/lib/boat-rental/recurring.test.ts](src/lib/boat-rental/recurring.test.ts)).
- **Styling**: Tailwind v4. Dark-mode toggle via
  [theme-provider.tsx](src/app/_components/theme-provider.tsx); the
  theme class is applied pre-paint in [layout.tsx](src/app/layout.tsx)
  to avoid a flash.
- **Image uploads**: prefer direct-to-Supabase signed URLs. Server
  Actions are capped at 15 MB ([next.config.ts](next.config.ts)) for
  the few paths that still upload through the server (boat receipts,
  Beithady gallery uploader handling iPhone HEIC bursts).
- **Legacy redirects**: `/emails/beithady/*` → `/beithady/*` is wired
  in [next.config.ts](next.config.ts). Don't remove without auditing
  outstanding bookmarks.

## Deploy

Workflow is **commit straight to `main` and run `vercel --prod`** —
no PRs, no feature branches.

```
git add .
git commit -m "<what changed>"
git push origin main
vercel --prod
```

## .claude/ harness configuration

Audited 2026-05-03.

### settings.json (committed)

- Plugin enabled: `superpowers@superpowers-dev`.
- **Stop hook** enforces session continuity: at the end of every
  assistant turn it checks the mtime of `SESSION_HANDOFF.md`. If the
  file exists and was modified more than **300 seconds** ago, the hook
  emits `{"decision":"block","reason":"…"}` and the turn cannot end
  until the file is freshened. The hook is silent (exit 0) when
  `SESSION_HANDOFF.md` is absent.

### settings.local.json (gitignored)

Pre-approved permissions (no prompt):

- `Bash(git add *)`
- `Bash(git push *)`
- `Bash(vercel --prod --yes)`
- `mcp__…__execute_sql` (Supabase MCP)
- `mcp__…__apply_migration` (Supabase MCP)
- `Bash(git commit -m ' *)` — **likely typo:** the pattern starts
  with a single quote, so only single-quoted commit messages skip the
  prompt. Double-quoted commits (which is the form used everywhere
  else in this project) still prompt. Probably should be `Bash(git commit -m *)`.

## Critical things future Claude must NOT do

1. **Don't trust your Next.js training data.** Read
   `node_modules/next/dist/docs/` (or the relevant package docs)
   before writing routing/caching/server-action code. Next 16 + React
   19 + Tailwind v4 have all moved on from older patterns.
2. **Don't create branches or open PRs** — push to `main`, then
   `vercel --prod`. If you think a branch is genuinely warranted,
   ask first.
3. **Don't skip `SESSION_HANDOFF.md` updates.** The Stop hook will
   block your turn from ending if the file is >5 minutes stale.
   Append a summary of what you did before stopping.
4. **Don't write OAuth refresh tokens in plaintext.** Always go
   through AES-256-GCM in [src/lib/crypto.ts](src/lib/crypto.ts);
   `accounts.oauth_refresh_token_encrypted` should be base64
   gibberish, never `1//…`.
5. **Don't bypass cron auth.** Handlers must check
   `Authorization: Bearer $CRON_SECRET`. Use `?force=1` only to
   bypass the Cairo-9-AM gate when manually testing locally.
6. **Don't break the `/emails/beithady/*` → `/beithady/*` redirects**
   in [next.config.ts](next.config.ts) — old bookmarks rely on them.
7. **Don't push uploads through Server Actions** above 15 MB. Use the
   direct-to-Supabase signed-URL path instead.
8. **Don't rely on the Supabase CLI on Windows.** It often isn't on
   PATH after `npm i -g supabase`. Paste SQL into the Supabase
   dashboard SQL Editor.
9. **Don't assume Phase-1-only scope.** The repo is multi-domain now
   (Beithady, Boat Rental, Kika, plus integrations). Unless the file
   path clearly scopes you to the Gmail/email-logs ingest, assume
   broader context.
10. **Don't commit `.env.local`.** Vercel env vars must be set
    separately (Production + Preview + Development) for every key
    in [.env.example](.env.example).

## Pointers

- Repo: https://github.com/kareemhadylime/kareemhady (branch `main`)
- Supabase project: `bpjproljatbrbmszwbov` (eu-central-1, "Lime Investments")
- Phase planning docs: [docs/](docs/) — `PHASE_*_PREFLIGHT.md`
- Rolling session log: [SESSION_HANDOFF.md](SESSION_HANDOFF.md)
- Recent audits in repo root: `COMMUNICATION_AUDIT_2026_05_02.md`,
  `INVENTORY_AUDIT_2026_05_02.md`
