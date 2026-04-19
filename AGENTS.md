<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Kareemhady — Gmail digest (InboxOps Phase 1)

## What this is
Next.js 16 app that connects Gmail accounts via OAuth, fetches last-24h emails on demand ("Run now") and daily at 9 AM Cairo via Vercel cron, logs metadata to Supabase, displays in a dashboard. Single-tenant (Kareem's 3 mailboxes: `kareem.hady@gmail.com`, `kareem@fmplusme.com`, `kareem@limeinc.cc`). Rules table seeded but not evaluated yet — Phase 3.

## Auto-deploy instructions
After EVERY code change, always:
1. `git add .`
2. `git commit -m "[describe what changed]"`
3. `git push origin main`
4. Run: `vercel --prod`

Never create a new branch. Always commit directly to main and always run `vercel --prod` after pushing.

## Stack
- **Next.js 16** (App Router, TypeScript, Tailwind, Turbopack, `src/` dir)
- **Supabase** (Postgres) — project ref `bpjproljatbrbmszwbov`, URL `https://bpjproljatbrbmszwbov.supabase.co`, region eu-central-1, org "Lime Investments"
- **Gmail API** via `googleapis` + OAuth (offline access, `gmail.readonly` scope)
- **Vercel Pro** deployment + cron

## Key files
- `src/app/page.tsx` — dashboard (accounts, runs, emails)
- `src/lib/gmail.ts` — OAuth client + `fetchLast24hMetadata`
- `src/lib/crypto.ts` — AES-256-GCM for OAuth tokens at rest
- `src/lib/run-daily.ts` — main ingest run (opens a `runs` row, loops accounts, upserts `email_logs`)
- `src/lib/supabase.ts` — `supabaseAdmin()` service-role client
- `src/app/api/auth/google/start/route.ts` + `callback/route.ts` — OAuth flow
- `src/app/api/run-now/route.ts` — manual trigger
- `src/app/api/cron/daily/route.ts` — Vercel cron handler (gates on Cairo 9 AM unless `?force=1`)
- `supabase/migrations/0001_init.sql` — schema: `accounts`, `runs`, `email_logs`, `rules`
- `vercel.json` — two crons at `0 6 * * *` and `0 7 * * *` UTC (handler picks whichever matches Cairo 9 for DST)

## Secrets / env
- `.env.local` has Supabase creds + `TOKEN_ENCRYPTION_KEY` + `CRON_SECRET` filled in, but **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are blank** — Google OAuth app not yet created.
- Vercel env vars must be set separately (Production + Preview + Development) for all 8 variables in `.env.example`.
- Refresh tokens AES-256-GCM encrypted before insert — verify `accounts.oauth_refresh_token_encrypted` column contains base64 gibberish, not plaintext `1//…`.

## Gotchas
- `fmplusme.com` / `limeinc.cc` are Workspace domains user admins — if OAuth "app blocked" on those, fix via Google Admin → Security → API Controls → Manage Third-Party App Access → add as trusted.
- Cron endpoint requires `Authorization: Bearer $CRON_SECRET`; use `?force=1` to bypass Cairo 9 AM gate when testing.
- `unique (account_id, gmail_message_id)` prevents duplicate email rows across multiple Run Now clicks.
- No rule engine, no body fetch, no AI, no error alerting — all deferred to later phases.
- On Windows: `supabase` CLI from `npm i -g supabase` didn't end up on PATH; easiest is to paste SQL into Supabase dashboard → SQL Editor.

## Session continuity
Always update `SESSION_HANDOFF.md` at the end of every turn (Stop hook in `.claude/settings.json` enforces it — blocks if file is >5min stale).

## GitHub repo
https://github.com/kareemhadylime/kareemhady (branch: `main`)
