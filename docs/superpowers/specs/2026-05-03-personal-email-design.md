# Personal → Email — Design Spec

**Status:** Plan-phase approved 2026-05-03 · Awaiting Workflow phase
**Author:** kareem.hady@gmail.com (with Claude)
**Worktree:** `mystifying-clarke-dfacd6`
**Migration target:** `0081_personal_email.sql`

## 1. Purpose

Build a unified inbox-triage dashboard at `/personal/email` that scans
Kareem's three Gmail-shaped accounts (GMAIL, LIME, FM+), classifies
every incoming message into one of nine categories using a
rules-then-AI hybrid pipeline, and applies matching Gmail labels back
to the source mailbox so categorization is visible from the native
Gmail mobile app too.

The module is operator-grade: read + lightweight quick actions in the
dashboard (mark read, archive in Gmail, move to category), but **no**
in-dashboard reply composer in v1 — replies happen in Gmail itself.
This keeps scope tight while still removing the daily friction of
hand-sorting marketing noise from genuine action items.

## 2. Why now

The `personal` domain is already registered in
`src/lib/rules/presets.ts` and `src/lib/brand-theme.ts` (slate accent,
User icon) but has zero UI — the Personal tile on the home page links
nowhere. Three Gmail accounts span Kareem's life (personal, Lime
work, FM+ work) and segregating them mentally every morning is a
real time tax. The existing `rules` engine is for *aggregation* (e.g.
"12 Shopify orders today, total $2,400") — fundamentally different
paradigm from per-email classification, so we cannot reuse it for
this module.

## 3. Decisions locked during plan phase

| # | Decision | Resolution |
|---|----------|------------|
| Q1 | Use case shape | **D — Hybrid Triage Dashboard + Quick Actions** (read + mark-read + archive-in-Gmail + label-sync, NO in-dashboard reply composer in v1) |
| Q2 | Category set | 9 categories in 4 tiers (see §5) |
| Q3 | Classification approach | **Hybrid**: rules first (cheap, deterministic), AI for residue + always-AI categories `action_required` and `personal`. Haiku 4.5 with prompt-cached system prompt. |
| Q4 | Two-way Gmail label sync | **YES** — apply `Lime/<Slug>` namespaced labels to real Gmail messages; user manual edits in Gmail are authoritative at next ingest |
| Q5 | "Need my reply" signal | Hybrid: rule (To/Cc contains my address + sender is human + thread doesn't end with my reply) → if matched OR ambiguous, AI confirms. AI never overrides a strong "no" signal. |
| Q6 | Thread vs message classification | **Per-thread**, latest message decides. One Gmail thread = one row in category view. |
| Q7 | Access control | Admin-only in v1 (just kareem). Multi-user out of scope. |
| Q8 | Account display name | Auto-tagged from authorizing email domain: `@gmail.com`→`GMAIL`, `@lime-investments.*`→`LIME`, `@fmplus.*`→`FM+`. Editable in Setup. |
| Q9 | Ingest cadence | Every 15 min during 6 AM–11 PM Cairo (cron) + manual `↻ Refresh` button. **No** Gmail Pub/Sub watch in v1. |
| Q10 | Body storage | First **8 KB plaintext + headers** in `email_logs.body_excerpt`. Full HTML body fetched on-demand from Gmail API. |
| Q11 | User reclassification feedback loop | One-click "Move to ___" stored in `personal_email_corrections`. AI prompt includes 10 most recent corrections per category as few-shot. |
| Q12 | AI uncertainty | Confidence < 0.7 → `email_logs.needs_review = true` + `?` badge in UI. "Needs Review" filter at top. |
| Q13 | v1 scope cuts | Snooze · in-dashboard reply composer · cross-category bulk move · full-text search · attachment preview · Pub/Sub realtime · per-category notification rules · weekly digest. All deferrable to v2. |

## 4. Routes and navigation

```
/                                   (existing — Personal card already exists, currently unlinked)
└─ /personal                        NEW — landing for Personal subsidiaries
   └─ /personal/email               NEW — main triage view
      ├─ ?category=<slug>           filter to one category
      ├─ /needs-review              AI low-confidence bucket
      ├─ /[messageId]               detail page
      └─ /setup
         ├─ /accounts               3 mailboxes
         ├─ /categories             enable/disable + Gmail label name
         ├─ /rules                  user-editable heuristic rules
         ├─ /ai                     model picker, daily $-cap, recent runs
         └─ /corrections            audit log of manual reclassifications
```

`/personal/boat-rental` already exists at `/emails/boat-rental` and is
explicitly out of scope to relocate. The `/personal` landing page is
designed to host both Email and Boat Rental cards in future.

## 5. Categories (seed data)

| Tier | Slug | Display Name | Default Gmail Label | Icon | Notes |
|------|------|--------------|---------------------|------|-------|
| 1 Act now | `action_required` | Action Required | `Lime/ActionRequired` | Reply | Always-AI category. Must be addressed-to-me + human + open. |
| 1 Act now | `security` | Security | `Lime/Security` | ShieldCheck | 2FA, login alerts, password resets, account changes. |
| 1 Act now | `travel` | Travel | `Lime/Travel` | Plane | Flight/hotel/ride confirmations + itinerary changes. |
| 2 File/track | `bills_receipts` | Bills & Receipts | `Lime/Bills` | Receipt | Invoices, payment confirmations, statements, refunds. Separate so they're findable for taxes. |
| 2 File/track | `personal` | Personal | `Lime/Personal` | Heart | Always-AI category. Real one-to-one human, NOT a list. |
| 3 Skim/skip | `newsletters` | Newsletters | `Lime/Newsletters` | BookOpen | Opted-in editorial (Substack, Stratechery). Distinct from ads. |
| 3 Skim/skip | `notifications` | Notifications / FYI | `Lime/Notifications` | Bell | Automated FYI from services (GitHub, Vercel, Slack daily). |
| 4 Delete-bait | `promotions` | Promotions / Ads | `Lime/Promotions` | Tag | Marketing, discount codes, win-back. |
| 4 Delete-bait | `spam` | Spam / Junk | `Lime/Spam` | XCircle | Auto-mirror of Gmail's `SPAM` system label + AI-flagged junk. |

Tier ordering, slugs, and `Lime/` namespace are all editable from
`/personal/email/setup/categories`.

## 6. Main triage view — `/personal/email`

Default URL = tier-grouped collapsible cards. Top bar:

```
[ Personal · Email ]                   [GMAIL] [LIME] [FM+] [All]   [↻ Refresh]
                                       └─── account filter pills ────┘
```

Layout:

```
🔴 ACT NOW
  ┌─────────────────────────────────────────────────────────┐
  │ ⚡ Action Required          [12]    →                  │
  │   • Sarah · Re: Q2 budget review · 2h ago               │
  │   • Hany · Need approval on BH-435 vendor list · 5h ago │
  │   • + 10 more                                           │
  └─────────────────────────────────────────────────────────┘
  ┌─────────────────────────────────────────────────────────┐
  │ 🔐 Security                 [3]     →                  │
  │   • Google · New sign-in on iPhone · 1h ago             │
  │   • + 2 more                                            │
  └─────────────────────────────────────────────────────────┘
  ┌─────────────────────────────────────────────────────────┐
  │ ✈️  Travel                   [2]     →                  │
  └─────────────────────────────────────────────────────────┘

🟡 FILE / TRACK
  ┌────────────────────────┐ ┌────────────────────────┐
  │ 💳 Bills & Receipts [8]│ │ 👥 Personal       [4]  │
  └────────────────────────┘ └────────────────────────┘

🔵 SKIM / SKIP                                  [collapse all]
  Newsletters [6]   Notifications/FYI [31]

⚫ DELETE-BAIT                                   [▶ Bulk archive 47]
  Promotions/Ads [38]   Spam [9]
```

- Per-row controls: `[checkbox] sender · subject · age · [↻ Move to ▾] [✓ Archive]`
- Bulk-select bar appears when any row is checked: `Mark read · Archive in Gmail · Move to ▾`
- "Needs Review" pill at top-right reveals `?` badged emails when count > 0
- Account-filter pills scope every visible count and list

Counts re-render on every page load (server-side query); no live
websocket polling in v1.

## 7. Detail page — `/personal/email/[messageId]`

```
← Back
  Subject line
  From: ... · To: ... · Received Cairo time
  [GMAIL] [Personal] [↻ Move to ▾] [✓ Archive] [↗ Open in Gmail]

  ┌── AI classification ──────────────────────────┐
  │ Category: Personal  Confidence: 0.92         │
  │ Reason: "One-to-one from real human, casual" │
  │ Method: ai · 2026-05-03 09:14                 │
  └───────────────────────────────────────────────┘

  [Body — first 8KB inline; "Show full body" expands via Gmail API on-demand]
```

`Open in Gmail` links to `https://mail.google.com/mail/u/<idx>/#inbox/<threadId>`
where `<idx>` is resolved from the account's position among connected
Google sessions in the user's browser. We can't know the right index
deterministically (it's per-browser-session), so the default is `/0/`
with a tooltip noting "If wrong account, switch in Gmail's avatar
menu." Acceptable v1 trade-off.

## 8. Setup pages

### 8.1 `/personal/email/setup/accounts`

Lists the three connected mailboxes. Each row shows email address,
display name, last-sync time, label-create status, and
Connect/Reconnect/Disconnect buttons. Reuses the existing
`/api/auth/google/start` OAuth flow; on first connect the post-OAuth
callback creates `Lime/*` labels in that account and seeds
`personal_email_account_labels`.

### 8.2 `/personal/email/setup/categories`

Table of 9 categories with: enabled toggle, display name (editable),
Gmail label name (editable, default `Lime/<Slug>`), tier (read-only,
shown for context), accent (read-only), order (drag-handle within
tier).

Renaming a Gmail label triggers a background `users.labels.update`
call across all 3 accounts. Disabling a category is non-destructive:
already-classified emails keep their `category` value, but the tab
disappears from the triage view. Re-enabling re-shows them
immediately.

### 8.3 `/personal/email/setup/rules`

Table of user-editable heuristic rules ordered by priority (lower =
runs first). Columns: priority, name, account filter (or "All"),
match type, match value, target category, enabled.

Add/edit form fields:

- `priority` int (default 100, 1 = highest)
- `name` short label
- `account_id` dropdown (3 accounts + "All")
- `match_type` enum: `from_domain` | `from_email` | `subject_contains` | `header_present` | `body_contains` | `gmail_label`
- `match_value` text (e.g. `mailchimp.com` or `List-Unsubscribe` or `SPAM`)
- `target_category` dropdown of 9 slugs
- `enabled` toggle

Seeded rules ship with the migration so the system works on day one
(see §10 for the seed list).

### 8.4 `/personal/email/setup/ai`

Read+edit panel for AI knobs:

- Model dropdown (default `claude-haiku-4-5-20251001`)
- Daily cost cap in USD (default `$0.50/day`; classification falls back
  to "rules-only" when exceeded for the rest of the UTC day)
- "View system prompt" toggle (read-only by default; an
  admin-override editor lives behind a `Show advanced` accordion)
- Recent runs table (last 30): timestamp, accounts synced, emails
  seen, rules matched, AI calls, AI cost USD, errors
- "Recompute all" button — clears `category` for a date range
  (default last 7 days) and re-runs the classification pipeline.
  Used after editing rules or system prompt to apply changes
  retroactively.

### 8.5 `/personal/email/setup/corrections`

Audit log of every manual reclassification (`personal_email_corrections`
table). Columns: when, email subject + sender, old category, new
category, who. Read-only. This is the source of truth that feeds
back into the AI few-shot prompt.

## 9. Data model

Migration `0081_personal_email.sql` adds the schema below. Keep
column names lowercase + snake_case to match the rest of the project.

### 9.1 Extend `accounts`

```sql
alter table public.accounts
  add column if not exists domain text,
  add column if not exists display_name text;

create index if not exists idx_accounts_domain on public.accounts (domain);
```

`domain` is nullable for backwards compatibility. Personal mailboxes
will all be set to `'personal'`. `display_name` is the user-visible
label (`GMAIL`, `LIME`, `FM+`).

### 9.2 Extend `email_logs`

```sql
alter table public.email_logs
  add column if not exists category text,
  add column if not exists category_confidence numeric(3,2),
  add column if not exists category_method text,
  add column if not exists category_reason text,
  add column if not exists body_excerpt text,
  add column if not exists last_classified_at timestamptz,
  add column if not exists needs_review boolean default false;

create index if not exists idx_email_logs_category on public.email_logs (category);
create index if not exists idx_email_logs_needs_review on public.email_logs (needs_review) where needs_review = true;
```

`category_method` enum (text-checked at app layer):
`'rule'` | `'ai'` | `'manual'` | `'gmail_label'`.

### 9.3 New `personal_email_categories`

```sql
create table public.personal_email_categories (
  slug text primary key,
  display_name text not null,
  tier int not null check (tier between 1 and 4),
  sort_order int not null default 0,
  gmail_label_name text not null,
  accent_color text not null,
  icon_name text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Seeded with the 9 rows from §5.

### 9.4 New `personal_email_account_labels`

Gmail labels are per-account, so we need a join row per
(account, category) capturing the Gmail label ID.

```sql
create table public.personal_email_account_labels (
  account_id uuid not null references public.accounts(id) on delete cascade,
  category_slug text not null references public.personal_email_categories(slug) on delete cascade,
  gmail_label_id text not null,
  created_at timestamptz not null default now(),
  primary key (account_id, category_slug)
);
```

### 9.5 New `personal_email_rules`

```sql
create table public.personal_email_rules (
  id uuid primary key default gen_random_uuid(),
  priority int not null default 100,
  name text not null,
  account_id uuid references public.accounts(id) on delete cascade,
  match_type text not null check (match_type in (
    'from_domain', 'from_email', 'subject_contains',
    'header_present', 'body_contains', 'gmail_label'
  )),
  match_value text not null,
  target_category text not null references public.personal_email_categories(slug),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_personal_email_rules_priority
  on public.personal_email_rules (priority) where enabled = true;
```

`account_id IS NULL` means "applies to all `domain='personal'`
accounts."

### 9.6 New `personal_email_corrections`

```sql
create table public.personal_email_corrections (
  id uuid primary key default gen_random_uuid(),
  email_log_id uuid not null references public.email_logs(id) on delete cascade,
  old_category text,
  new_category text not null references public.personal_email_categories(slug),
  created_by_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_personal_email_corrections_recent
  on public.personal_email_corrections (new_category, created_at desc);
```

The composite index supports the AI prompt's "10 most recent per
category" few-shot lookup.

### 9.7 New `personal_email_classification_runs`

```sql
create table public.personal_email_classification_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  accounts text[] not null default '{}',
  emails_seen int not null default 0,
  emails_classified int not null default 0,
  rules_matched int not null default 0,
  ai_calls int not null default 0,
  ai_cost_usd numeric(8,4) not null default 0,
  errors jsonb not null default '[]'::jsonb,
  trigger text not null default 'cron'
);

create index if not exists idx_personal_email_runs_started
  on public.personal_email_classification_runs (started_at desc);
```

`trigger` ∈ `'cron'` | `'manual'`. The `ai_cost_usd` rolling sum (per
UTC day across all runs) is the source for the daily cap check.

## 10. Seeded heuristic rules

Shipped with the migration so the system has reasonable behavior on
day 1 without user setup. All have `account_id IS NULL`.

| Priority | Match type | Match value | Target |
|----------|-----------|-------------|--------|
| 10 | `gmail_label` | `SPAM` | `spam` |
| 20 | `from_domain` | `accounts.google.com` | `security` |
| 20 | `from_domain` | `noreply@google.com` | `security` |
| 20 | `subject_contains` | `verification code` | `security` |
| 20 | `subject_contains` | `sign-in attempt` | `security` |
| 20 | `subject_contains` | `password` | `security` |
| 30 | `from_domain` | `booking.com` | `travel` |
| 30 | `from_domain` | `airbnb.com` | `travel` |
| 30 | `from_domain` | `uber.com` | `travel` |
| 30 | `from_domain` | `lyft.com` | `travel` |
| 30 | `from_domain` | `careem.com` | `travel` |
| 40 | `subject_contains` | `invoice` | `bills_receipts` |
| 40 | `subject_contains` | `receipt` | `bills_receipts` |
| 40 | `subject_contains` | `payment confirmation` | `bills_receipts` |
| 40 | `from_domain` | `stripe.com` | `bills_receipts` |
| 50 | `from_domain` | `substack.com` | `newsletters` |
| 60 | `from_domain` | `mailchimp.com` | `promotions` |
| 60 | `from_domain` | `mailgun.org` | `promotions` |
| 60 | `from_domain` | `sendgrid.net` | `promotions` |
| 70 | `header_present` | `List-Unsubscribe` | `promotions` |
| 80 | `from_domain` | `github.com` | `notifications` |
| 80 | `from_domain` | `vercel.com` | `notifications` |
| 80 | `from_domain` | `aws.amazon.com` | `notifications` |
| 80 | `from_domain` | `slack.com` | `notifications` |
| 80 | `from_domain` | `linear.app` | `notifications` |

Notes:

- `from_domain` matches the email-domain part of the `From:` header
  case-insensitively (suffix match, so `noreply@stripe.com` and
  `support@stripe.com` both match `stripe.com`).
- `from_email` is exact-match for the full address.
- `subject_contains` and `body_contains` are case-insensitive
  substring; `body_contains` runs against `body_excerpt` only (not
  full body).
- `header_present` checks any header by name; `match_value` is the
  header name.
- `gmail_label` matches against `email_logs.label_ids[]`.
- First match wins. Priority intent: subject-based bills rules (40)
  catch invoice-shaped emails from any vendor before the
  domain-based notification fallback (80) catches the rest. So a
  Vercel deploy email lands in `notifications`, but a Vercel monthly
  invoice (subject contains "invoice") lands in `bills_receipts`.
  This is why we deliberately do NOT seed broad
  `from_domain: vercel.com → bills_receipts` rules.

Categories `action_required` and `personal` are deliberately not
target-able by seeded rules — they're always-AI by design.

## 11. Classification pipeline

Runs at ingest (cron or manual refresh). Per email:

```
1. Fetch headers + first 8KB body via Gmail API (`format: full`)
2. Compute features:
     from_domain, has_list_unsubscribe, gmail_labels (esp. SPAM,
     IMPORTANT, CATEGORY_*), is_reply_to_my_thread (we're in the
     thread + last sender != me), sender_is_known_human (not on a
     known automated-sender list).
3. RULE PASS — walk personal_email_rules ORDER BY priority ASC,
   first match wins. If matched:
     - If target_category in {action_required, personal}, FALL
       THROUGH to AI to confirm semantically.
     - Otherwise commit category with category_method='rule'.
       SKIP AI.
4. AI PASS (only if rule didn't terminate):
     - Build prompt (see §12).
     - Call Claude Haiku 4.5 with prompt-cached system prompt,
       max_tokens=50, JSON output.
     - If parsing fails → log error, default to 'notifications'
       with needs_review=true.
     - If confidence < 0.7 → set needs_review=true.
     - Commit category with category_method='ai'.
5. PERSIST email_logs row (insert if new, update existing).
6. SYNC Gmail label (only when category changed AND two-way sync
   enabled for the account):
     - Look up gmail_label_id for old + new category from
       personal_email_account_labels.
     - If old category present, batchModify removeLabelIds with old
       label id.
     - addLabelIds with new label id.
7. INCREMENT counters on the active row in
   personal_email_classification_runs.
```

**Daily cost-cap guard:** before step 4, check sum of `ai_cost_usd`
on `personal_email_classification_runs` for current UTC day. If
≥ user's cap, skip AI entirely and commit `category='notifications'`
with `needs_review=true` and `category_reason='ai_budget_exhausted'`.
The "Needs Review" tab will show these for re-classification once
the next day's budget kicks in.

**Per-thread classify-once:** thread classification key is
`(account_id, gmail_thread_id)`. When a new message arrives in an
existing thread, we re-classify the THREAD (latest message decides),
not each message individually. `email_logs` rows older than the
latest in the thread share the thread's category via a view, not via
column updates — keeps writes minimal.

## 12. AI prompt (Haiku 4.5, prompt-cached)

System prompt (~600 tokens, sent with `cache_control: { type: 'ephemeral' }`):

```
You classify emails into one of 9 categories.

Categories:
- action_required: A real human is awaiting MY reply, or has issued a
  request/deadline directly to me. NOT automated. NOT just FYI. The
  TO header lists my address and the sender is expecting action from
  me specifically.
- security: 2FA codes, login alerts, password resets, account changes
  (bank, social, dev tooling, infrastructure providers).
- travel: Flight, hotel, ride-share, car-rental confirmations and
  itinerary changes. Time-sensitive logistics.
- bills_receipts: Invoices, payment confirmations, statements,
  refunds. Financial paper trail that should be findable later.
- personal: One-to-one correspondence from a real human (friend,
  family, contact). NOT a list, NOT automated, NOT a work request.
- newsletters: Opted-in editorial content (Substack, Stratechery,
  curated analysis). Distinguished from promotions by intent: I
  signed up to read this for substance, not deals.
- notifications: Automated FYI from services I use (GitHub PRs,
  Vercel deploys, Slack daily summaries, Calendar reminders, ops
  alerts I want to know about but not act on).
- promotions: Marketing, discount codes, "we miss you", win-back,
  flash sales, product announcements from companies.
- spam: Outright junk, phishing-shaped, or pre-flagged by Gmail's
  SPAM label. Auto-archive candidates.

Recent user corrections (treat as ground truth — they fixed the AI):
{{TOP_10_CORRECTIONS_PER_CATEGORY}}

Output JSON only, no prose:
{"category": "<one of 9 slugs>", "confidence": <0.0-1.0>, "reason": "<≤12 words>"}

If confidence < 0.7, the system will flag this email for human review.
```

User message (~400 tokens, fresh per call):

```
From: {{FROM_HEADER}}
To: {{TO_HEADER}}
Subject: {{SUBJECT}}
Has-List-Unsubscribe: {{yes|no}}
Gmail-Labels: {{COMMA_SEPARATED_LABELS}}
Account: {{DISPLAY_NAME}}

Body excerpt:
"""
{{FIRST_1KB_OF_BODY}}
"""
```

Output: `{ category, confidence, reason }` capped at `max_tokens=50`.
Anthropic SDK call uses `claude-haiku-4-5-20251001`.

**Cost math:**

- Cached system prompt: ~600 tokens at $0.25/MTok cache-read =
  $0.00015 per call.
- User message: ~400 tokens at $1.00/MTok input = $0.0004 per call.
- Output: ~30 tokens at $5.00/MTok output = $0.00015 per call.
- **Per-call total ≈ $0.0007.**
- 200 emails/day × 3 accounts × 30% AI rate × 30 days = 5,400 AI
  calls/month → **≈ $3.78/month**.
- Daily $0.50 cap = ~700 calls/day budget, ~3.5× steady state =
  comfortable headroom for backfill or surge days.

## 13. Two-way Gmail label sync — mechanics

### 13.1 First connect

Post-OAuth callback for a `domain='personal'` account:

1. For each enabled category, call `users.labels.create` with
   `name = personal_email_categories.gmail_label_name`,
   `labelListVisibility: 'labelShow'`,
   `messageListVisibility: 'show'`.
2. If a label with that name already exists (idempotent reconnect),
   `users.labels.list` to find it and reuse.
3. Insert `(account_id, category_slug, gmail_label_id)` into
   `personal_email_account_labels`.

### 13.2 On classification change

Pseudo-code:

```ts
async function syncLabelChange(account, emailLogId, oldCat, newCat) {
  if (oldCat === newCat) return;
  const labelMap = await loadLabelMap(account.id);
  const removeIds = oldCat ? [labelMap[oldCat]] : [];
  const addIds = [labelMap[newCat]];
  await gmail.users.messages.batchModify({
    userId: 'me',
    requestBody: {
      ids: [gmailMessageId],
      removeLabelIds: removeIds,
      addLabelIds: addIds,
    },
  });
}
```

We touch ONLY labels we know are ours (the `Lime/*` ones in
`labelMap`). Any user-applied labels are untouched.

### 13.3 Reconciliation at ingest

When ingesting an existing message, we read its `labelIds` from
Gmail. If our `Lime/*` label set on the message diverges from the
DB-stored category:

- **User added a `Lime/*` label that's different from our category:**
  treat user as authoritative. Update DB to match. Insert a
  `personal_email_corrections` row with
  `category_method='gmail_label'`. This is how
  "right-click in mobile Gmail to fix the AI" works.
- **User removed our `Lime/*` label entirely:** treat as a request
  to re-classify. Mark `needs_review=true` and re-run classification
  on next pass.

### 13.4 Disconnect / opt-out

`/personal/email/setup/accounts` exposes a "Remove all `Lime/*`
labels from this Gmail" button. Implementation:
`users.labels.list` → filter by name prefix `Lime/` → for each label,
`users.messages.batchModify` removing it from every message that has
it (paginated). Then optionally `users.labels.delete` to remove the
labels themselves.

## 14. Cron schedule

Add to `vercel.json`:

```json
{
  "path": "/api/cron/personal-email-ingest",
  "schedule": "0,15,30,45 4-21 * * *"
}
```

`4-21 UTC` covers `6 AM – 11 PM Cairo` year-round (Cairo is UTC+2
standard, UTC+3 DST). The handler gates on local Cairo hour to drop
out-of-window invocations cleanly when DST shifts the boundary.

Handler at `src/app/api/cron/personal-email-ingest/route.ts`:

1. Verify `Authorization: Bearer $CRON_SECRET`.
2. Allow `?force=1` to bypass the Cairo-window gate (for manual
   testing, matching existing project convention).
3. Insert a row into `personal_email_classification_runs` with
   `trigger='cron'`.
4. For each `account WHERE domain='personal' AND enabled=true`:
   - List Gmail messages newer than `account.last_synced_at`
   - For each message: run §11 pipeline.
5. Update the run row with `finished_at`, counters, errors.

The manual `↻ Refresh` button POSTs to the same handler with
`?force=1` and `trigger=manual` query, run via a server action so the
button can show a loading state.

## 15. Access control

`canAccessDomain(user, 'personal')` already exists in
`src/lib/auth.ts`. Behaviour:

- v1: only users with `is_admin=true` can access `/personal/*`.
  Concretely: kareem.hady@gmail.com.
- The Personal card on the home page becomes a real link (it currently
  just renders without an href).
- API routes under `/api/cron/personal-email-ingest` are
  `CRON_SECRET`-gated, not user-gated.
- The OAuth flow at `/api/auth/google/start` already supports
  multi-account via the existing `accounts` table — we just need to
  pass `domain=personal` in the state param so the callback knows to
  set `accounts.domain='personal'` on the new row.

## 16. Out of scope for v1 (v2 backlog)

- **Snooze** — re-surface email tomorrow / on a date.
- **In-dashboard reply composer** — full HTML reply with signatures.
- **Cross-category bulk move** — "select 50 emails across multiple
  categories, move to X." V1 supports bulk only within one category.
- **Full-text search** across categorized emails.
- **Attachment preview / download.**
- **Gmail Pub/Sub watch** for near-real-time ingest.
- **Per-category notification rules** ("ping me on Slack when Action
  Required count > 5").
- **Weekly digest email** summarizing the week's volume + top action
  items.
- **Per-account UX for category overrides.** The schema already
  supports per-account rules (`personal_email_rules.account_id`),
  but the v1 setup UI is global-first; a "this rule applies only to
  LIME" picker is a v2 polish item.

## 17. Risks and mitigations

1. **Real-Gmail mutation bugs** could mislabel real mail.
   - Namespace under `Lime/` so we never touch user's other labels.
   - Disconnect button removes everything cleanly.
   - "Recompute all" button rewrites consistently.
   - Audit log via `personal_email_classification_runs.errors`.
2. **AI cost runaway** on backfill or a thread storm.
   - Daily $-cap with rules-only fallback past cap.
   - Per-thread classify-once (not per-message).
   - Model pinned to Haiku 4.5 (cheapest).
3. **Personal Gmail privacy.** Body excerpts stored in our Supabase
   instance.
   - Accounts are per-user OAuth — supabase service role still has
     access at the DB layer; this is an existing project assumption,
     not new for this module.
   - Onboarding screen at `/personal/email/setup/accounts` calls out
     "Email content is stored in Lime's encrypted database for
     classification."
   - Admin-only access enforces this is single-tenant.
4. **Refresh token expiry.** When Gmail OAuth refresh tokens go
   stale (rare, but happens after extended inactivity or password
   change), classification stops for that account.
   - Setup page surfaces "Reconnect needed" status when refresh
     fails.
   - Existing `decrypt(refresh_token_encrypted)` errors are logged
     and the cron continues with the other accounts.
5. **Gmail API quotas.** Not a real risk at our volume (250 quota
   units/sec/user ceiling, batchModify is 1 unit, ~600 emails/day
   needs 7 calls/min peak). But:
   - Use `batchModify` not per-message `modify`.
   - Exponential backoff on 429s in `gmail.ts` (already implemented
     for some calls; verify all).
6. **Label limits.** Gmail allows 10,000 labels per account; we add
   9. No issue.

## 18. Success criteria for v1

The module is "done" when:

- Three accounts can be connected via the OAuth flow and tagged
  `domain='personal'`.
- Manual `↻ Refresh` correctly classifies the last 24h of mail in
  each account into the 9 categories with ≥85% accuracy on a
  10-email-per-category sanity sample.
- Classification results show in the tier-grouped triage view, with
  account filter pills working.
- Apply/remove `Lime/*` labels on real Gmail messages confirmed
  visible from mobile Gmail app.
- Manual "Move to ___" updates DB and triggers Gmail label sync.
- `/personal/email/setup/corrections` shows the audit log of moves.
- `personal_email_classification_runs` shows ai_cost_usd ≤ $0.10/day
  in steady state.
- 15-min cron is registered and successfully runs in Vercel for 7
  consecutive days with no `errors` rows of severity `error`.

## 19. Out-of-scope clarifications (questions the spec deliberately leaves out)

These came up in plan-phase and are intentionally NOT addressed
because they're not v1 blockers:

- Multi-tenant access (other Lime users connecting their own
  inboxes) — would require `accounts.user_id` and per-row RLS.
- Mobile push notifications when Action Required count rises.
- IMAP fallback for non-Google accounts.
- Bulk export of categorized email metadata to CSV.

If we hit these in implementation, defer to v2.

---

## Implementation handoff

**Next step (after spec review):** invoke `superpowers:writing-plans`
skill to produce the step-by-step implementation plan, broken into
verifiable milestones (e.g. M1 = schema + seed, M2 = ingest pipeline
+ rules, M3 = classification + AI, M4 = triage UI, M5 = setup pages,
M6 = label sync, M7 = cron, M8 = success-criteria validation).
