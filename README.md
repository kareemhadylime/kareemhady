# InboxOps

Phase 1: Connect Gmail accounts via OAuth, fetch last-24h emails on demand or via Vercel cron at 9 AM Cairo, log to Supabase, display in dashboard.

## Local dev
1. Copy `.env.example` to `.env.local` and fill in all values
2. `npm run dev`
3. Visit http://localhost:3000

## Cron schedule
`vercel.json` has two entries (6:00 and 7:00 UTC). The handler gates on Cairo local hour == 9, which handles the DST transition (EET/EEST) without manual edits.

## Security
- OAuth refresh tokens are AES-256-GCM encrypted at rest using `TOKEN_ENCRYPTION_KEY`
- Cron endpoint requires `Authorization: Bearer $CRON_SECRET`
- Deploy behind Vercel Deployment Protection (Pro feature) until Phase 2 adds Supabase Auth
