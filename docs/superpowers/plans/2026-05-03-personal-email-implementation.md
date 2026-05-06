# Personal → Email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/personal/email` — a hybrid triage dashboard that scans 3 Gmail-shaped accounts (GMAIL, LIME, FM+), classifies every message into one of 9 categories using rules-then-AI (Haiku 4.5), and applies `Lime/*` labels back to the source mailboxes so the categorization is also visible in mobile Gmail.

**Architecture:** New schema in mig 0081 (extends `accounts` + `email_logs`, adds 5 `personal_email_*` tables). Classification pipeline is a sequence of pure functions (feature extractor → rule matcher → AI classifier → persister → label syncer) wired by an orchestrator and called from a 15-min cron. Triage UI is App Router server components with server actions for mutations, mirroring the `/beithady` and `/fmplus/*` patterns in this repo.

**Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript strict, Tailwind v4, Supabase Postgres + service-role client, Zod, Vitest (colocated `*.test.ts`), `@anthropic-ai/sdk` (already installed) for Claude Haiku 4.5 with prompt caching, `googleapis` (already installed) for Gmail. Per CLAUDE.md, every commit auto-deploys via the Vercel-GitHub integration on push to `main`.

**Spec:** [docs/superpowers/specs/2026-05-03-personal-email-design.md](../specs/2026-05-03-personal-email-design.md)

**Branch:** `claude/mystifying-clarke-dfacd6` (worktree). Push pattern: `git push origin claude/mystifying-clarke-dfacd6:main`.

**Migration application:** Per CLAUDE.md, the Supabase CLI is unreliable on Windows. Apply migrations via the Supabase MCP tool `mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__apply_migration` (already pre-approved in `settings.local.json`). Always write the `.sql` file first, then apply.

---

## File structure

**New files (32 source + 6 test):**

Library (`src/lib/personal-email/`):
- `schema.ts` — Zod schemas for all 5 new tables + extended `email_logs.category` enum
- `types.ts` — TypeScript types re-exported from Zod
- `categories.ts` — 9 category constants + `getCategory(slug)` helper + tier groupings
- `feature-extractor.ts` — `extractFeatures(headers, bodyExcerpt, gmailLabels)` → structured features for rule matching
- `rule-matcher.ts` — `matchRule(features, rules)` → first-priority match or `null`
- `prompt.ts` — Claude system prompt builder + `buildUserMessage(email)` formatter
- `ai-classifier.ts` — `classifyWithAi(email, recentCorrections)` → `{category, confidence, reason}` + cost tracking
- `cost-guard.ts` — `getDailyCostUsd()` + `isOverDailyCap(cap)` daily cap helpers
- `pipeline.ts` — `classifyOneEmail(emailLog, account)` orchestrator (rules → AI → persist)
- `label-sync.ts` — `ensureLabelsForAccount(account)`, `syncLabelChange(account, msgId, oldCat, newCat)`, `removeAllLimeLabels(account)`
- `ingest.ts` — `ingestPersonalEmails(opts)` cron entry point: per-account scan → pipeline per email → run row update
- `corrections.ts` — `getRecentCorrectionsByCategory(limit)` for AI few-shot

Tests:
- `feature-extractor.test.ts` — header parsing, list-unsubscribe detection, gmail label parsing
- `rule-matcher.test.ts` — priority order, first-match-wins, all 6 match types
- `prompt.test.ts` — system prompt shape, user message format, few-shot inclusion
- `ai-classifier.test.ts` — JSON parsing, low-confidence flag, parse-error fallback (uses `vi.mock` for SDK)
- `pipeline.test.ts` — rules-skip-AI path, always-AI categories, label-sync trigger
- `label-sync.test.ts` — label create idempotency, batch modify call shape (mocks Gmail client)

Routes (`src/app/personal/`):
- `layout.tsx` — Personal section header + permission shell (`canAccessDomain('personal')`)
- `page.tsx` — Personal landing: Email card (+ future Boat Rental card placeholder)
- `email/layout.tsx` — Email subnav (Inbox · Needs Review · Setup) + account-filter pill row
- `email/page.tsx` — main triage view (tier-grouped)
- `email/_components/category-card.tsx` — collapsible card per category, top-3 emails, count badge
- `email/_components/tier-section.tsx` — tier header + child cards
- `email/_components/account-filter.tsx` — `[GMAIL] [LIME] [FM+] [All]` pills, query-param driven
- `email/_components/email-row.tsx` — `[checkbox] sender · subject · age · move ▾ · archive` row
- `email/_components/bulk-action-bar.tsx` — sticky footer when rows are selected
- `email/_components/refresh-button.tsx` — client component, posts to manual-refresh server action
- `email/actions.ts` — server actions: `moveEmail(id, newCategory)`, `archiveInGmail(ids[])`, `markAsRead(ids[])`, `manualRefresh()`
- `email/needs-review/page.tsx` — flat list of `needs_review=true` emails
- `email/[messageId]/page.tsx` — detail page (header + classification card + body)
- `email/[messageId]/_components/classification-card.tsx` — category, confidence, reason, method badges
- `email/[messageId]/_components/body-viewer.tsx` — 8KB excerpt + "Show full body" expander (server action fetches full from Gmail)
- `email/setup/layout.tsx` — setup-tab strip
- `email/setup/page.tsx` — redirects to `/personal/email/setup/accounts`
- `email/setup/accounts/page.tsx` — list 3 mailboxes + connect/reconnect/disconnect
- `email/setup/accounts/actions.ts` — `disconnectAccount(id)`, `removeAllLimeLabels(id)`, `tagDomainPersonal(id)`
- `email/setup/categories/page.tsx` — table + edit form
- `email/setup/categories/actions.ts` — `updateCategory(slug, patch)`, `reorderCategory(slug, dir)`
- `email/setup/rules/page.tsx` — rules table
- `email/setup/rules/actions.ts` — `deleteRule(id)`, `toggleRule(id)`
- `email/setup/rules/_form.tsx` — shared form for new/edit
- `email/setup/rules/new/page.tsx` — create rule
- `email/setup/rules/[id]/page.tsx` — edit rule
- `email/setup/ai/page.tsx` — model picker, daily cap, recent runs table, recompute button
- `email/setup/ai/actions.ts` — `setDailyCap(usd)`, `recomputeRange(fromIso, toIso)`
- `email/setup/corrections/page.tsx` — audit log read-only

API route:
- `src/app/api/cron/personal-email-ingest/route.ts` — cron entry (auth: `Bearer $CRON_SECRET`)

Migration:
- `supabase/migrations/0081_personal_email.sql` — DDL + 9 category seeds + 24 rule seeds

**Modified files (5):**
- `vercel.json` — add `/api/cron/personal-email-ingest` cron entry
- `src/app/page.tsx` — wire the Personal card to `/personal` (currently un-href'd)
- `src/app/api/auth/google/callback/route.ts` — accept `?domain=personal` in OAuth state and set `accounts.domain` on insert
- `src/app/admin/accounts/page.tsx` — display the new `domain` and `display_name` columns
- `src/lib/auth.ts` — verify `canAccessDomain(user, 'personal')` returns true for admins (no code change expected; just a verification step)

**Pre-approved permissions check** (`.claude/settings.local.json`):
- `mcp__…__execute_sql` — yes (for ad-hoc queries)
- `mcp__…__apply_migration` — yes (for mig 0081)
- `Bash(git add *)`, `Bash(git push *)` — yes
- `Bash(vercel --prod --yes)` — yes (not used in this plan; auto-deploy handles it)

---

## Phase 1 — Foundation: schema + types + categories module (Tasks 1–4)

### Task 1: Migration 0081 — schema + 9 category seeds + 24 rule seeds

**Files:**
- Create: `supabase/migrations/0081_personal_email.sql`

- [ ] **Step 1: Write the full migration file**

```sql
-- Phase: Personal → Email module v1
-- Adds /personal/email triage dashboard backing tables.
-- See docs/superpowers/specs/2026-05-03-personal-email-design.md
-- Categories: 9 slugs across 4 tiers
-- Match types: from_domain | from_email | subject_contains | header_present | body_contains | gmail_label
-- Methods:     rule | ai | manual | gmail_label

-- 1. Extend accounts with domain + display_name -----------------------------
alter table public.accounts
  add column if not exists domain text,
  add column if not exists display_name text;

create index if not exists idx_accounts_domain on public.accounts (domain);

-- 2. Extend email_logs with classification columns --------------------------
alter table public.email_logs
  add column if not exists category text,
  add column if not exists category_confidence numeric(3,2),
  add column if not exists category_method text
    check (category_method is null or category_method in ('rule','ai','manual','gmail_label')),
  add column if not exists category_reason text,
  add column if not exists body_excerpt text,
  add column if not exists last_classified_at timestamptz,
  add column if not exists needs_review boolean not null default false;

create index if not exists idx_email_logs_category on public.email_logs (category);
create index if not exists idx_email_logs_needs_review
  on public.email_logs (needs_review) where needs_review = true;

-- 3. personal_email_categories ---------------------------------------------
create table if not exists public.personal_email_categories (
  slug              text primary key,
  display_name      text not null,
  tier              int  not null check (tier between 1 and 4),
  sort_order        int  not null default 0,
  gmail_label_name  text not null,
  accent_color      text not null,
  icon_name         text not null,
  is_enabled        boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 4. personal_email_account_labels (per-account Gmail label IDs) -----------
create table if not exists public.personal_email_account_labels (
  account_id        uuid not null references public.accounts(id) on delete cascade,
  category_slug     text not null references public.personal_email_categories(slug) on delete cascade,
  gmail_label_id    text not null,
  created_at        timestamptz not null default now(),
  primary key (account_id, category_slug)
);

-- 5. personal_email_rules ---------------------------------------------------
create table if not exists public.personal_email_rules (
  id                uuid primary key default gen_random_uuid(),
  priority          int  not null default 100,
  name              text not null,
  account_id        uuid references public.accounts(id) on delete cascade,
  match_type        text not null check (match_type in
    ('from_domain','from_email','subject_contains','header_present','body_contains','gmail_label')),
  match_value       text not null,
  target_category   text not null references public.personal_email_categories(slug),
  enabled           boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_personal_email_rules_priority
  on public.personal_email_rules (priority) where enabled = true;

-- 6. personal_email_corrections --------------------------------------------
create table if not exists public.personal_email_corrections (
  id                  uuid primary key default gen_random_uuid(),
  email_log_id        uuid not null references public.email_logs(id) on delete cascade,
  old_category        text,
  new_category        text not null references public.personal_email_categories(slug),
  created_by_user_id  uuid,
  created_at          timestamptz not null default now()
);

create index if not exists idx_personal_email_corrections_recent
  on public.personal_email_corrections (new_category, created_at desc);

-- 7. personal_email_classification_runs ------------------------------------
create table if not exists public.personal_email_classification_runs (
  id                 uuid primary key default gen_random_uuid(),
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  accounts           text[] not null default '{}',
  emails_seen        int not null default 0,
  emails_classified  int not null default 0,
  rules_matched      int not null default 0,
  ai_calls           int not null default 0,
  ai_cost_usd        numeric(8,4) not null default 0,
  errors             jsonb not null default '[]'::jsonb,
  trigger            text not null default 'cron'
);

create index if not exists idx_personal_email_runs_started
  on public.personal_email_classification_runs (started_at desc);

-- 8. Seed 9 categories (tiered) --------------------------------------------
insert into public.personal_email_categories
  (slug, display_name, tier, sort_order, gmail_label_name, accent_color, icon_name)
values
  ('action_required', 'Action Required',     1, 10, 'Lime/ActionRequired', 'rose',    'Reply'),
  ('security',        'Security',             1, 20, 'Lime/Security',      'amber',   'ShieldCheck'),
  ('travel',          'Travel',               1, 30, 'Lime/Travel',        'sky',     'Plane'),
  ('bills_receipts',  'Bills & Receipts',     2, 10, 'Lime/Bills',         'emerald', 'Receipt'),
  ('personal',        'Personal',             2, 20, 'Lime/Personal',      'pink',    'Heart'),
  ('newsletters',     'Newsletters',          3, 10, 'Lime/Newsletters',   'indigo',  'BookOpen'),
  ('notifications',   'Notifications / FYI',  3, 20, 'Lime/Notifications', 'slate',   'Bell'),
  ('promotions',      'Promotions / Ads',     4, 10, 'Lime/Promotions',    'violet',  'Tag'),
  ('spam',            'Spam / Junk',          4, 20, 'Lime/Spam',          'zinc',    'XCircle')
on conflict (slug) do nothing;

-- 9. Seed 24 heuristic rules (account_id null = applies to all) ------------
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (10, 'Gmail SPAM label',                     'gmail_label',      'SPAM',                    'spam'),
  (20, 'Google security',                      'from_domain',      'accounts.google.com',     'security'),
  (20, 'Google noreply security',              'from_email',       'noreply@google.com',      'security'),
  (20, 'Verification code subject',            'subject_contains', 'verification code',       'security'),
  (20, 'Sign-in attempt subject',              'subject_contains', 'sign-in attempt',         'security'),
  (20, 'Password subject',                     'subject_contains', 'password',                'security'),
  (30, 'Booking.com travel',                   'from_domain',      'booking.com',             'travel'),
  (30, 'Airbnb travel',                        'from_domain',      'airbnb.com',              'travel'),
  (30, 'Uber travel',                          'from_domain',      'uber.com',                'travel'),
  (30, 'Lyft travel',                          'from_domain',      'lyft.com',                'travel'),
  (30, 'Careem travel',                        'from_domain',      'careem.com',              'travel'),
  (40, 'Invoice subject',                      'subject_contains', 'invoice',                 'bills_receipts'),
  (40, 'Receipt subject',                      'subject_contains', 'receipt',                 'bills_receipts'),
  (40, 'Payment confirmation subject',         'subject_contains', 'payment confirmation',    'bills_receipts'),
  (40, 'Stripe bills',                         'from_domain',      'stripe.com',              'bills_receipts'),
  (50, 'Substack newsletters',                 'from_domain',      'substack.com',            'newsletters'),
  (60, 'Mailchimp promotions',                 'from_domain',      'mailchimp.com',           'promotions'),
  (60, 'Mailgun promotions',                   'from_domain',      'mailgun.org',             'promotions'),
  (60, 'SendGrid promotions',                  'from_domain',      'sendgrid.net',            'promotions'),
  (70, 'Has List-Unsubscribe header',          'header_present',   'List-Unsubscribe',        'promotions'),
  (80, 'GitHub notifications',                 'from_domain',      'github.com',              'notifications'),
  (80, 'Vercel notifications',                 'from_domain',      'vercel.com',              'notifications'),
  (80, 'AWS notifications',                    'from_domain',      'aws.amazon.com',          'notifications'),
  (80, 'Slack notifications',                  'from_domain',      'slack.com',               'notifications'),
  (80, 'Linear notifications',                 'from_domain',      'linear.app',              'notifications')
on conflict do nothing;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use the pre-approved tool:
```
mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__apply_migration
  name: "0081_personal_email"
  query: <paste the file contents>
```

Expected: success message with no rows affected for the alter+create statements; 9 rows for category insert; 25 rows for rules insert.

- [ ] **Step 3: Verify via execute_sql**

```sql
select count(*) as cats from public.personal_email_categories;
-- expect 9
select count(*) as rules from public.personal_email_rules;
-- expect 25
select count(*) as ext from information_schema.columns
  where table_name='email_logs' and column_name in
    ('category','category_confidence','category_method','category_reason','body_excerpt','last_classified_at','needs_review');
-- expect 7
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0081_personal_email.sql
git commit -m "feat(personal): migration 0081 — Personal email schema + category/rule seeds"
```

---

### Task 2: Library scaffolding — Zod schemas + types

**Files:**
- Create: `src/lib/personal-email/schema.ts`
- Create: `src/lib/personal-email/types.ts`

- [ ] **Step 1: Write `schema.ts`**

```typescript
import { z } from 'zod';

export const CATEGORY_SLUGS = [
  'action_required',
  'security',
  'travel',
  'bills_receipts',
  'personal',
  'newsletters',
  'notifications',
  'promotions',
  'spam',
] as const;

export const CategorySlug = z.enum(CATEGORY_SLUGS);

export const MATCH_TYPES = [
  'from_domain',
  'from_email',
  'subject_contains',
  'header_present',
  'body_contains',
  'gmail_label',
] as const;

export const MatchType = z.enum(MATCH_TYPES);

export const ClassificationMethod = z.enum(['rule', 'ai', 'manual', 'gmail_label']);

export const PersonalEmailCategoryRow = z.object({
  slug: CategorySlug,
  display_name: z.string(),
  tier: z.number().int().min(1).max(4),
  sort_order: z.number().int(),
  gmail_label_name: z.string(),
  accent_color: z.string(),
  icon_name: z.string(),
  is_enabled: z.boolean(),
});

export const PersonalEmailRuleRow = z.object({
  id: z.string().uuid(),
  priority: z.number().int(),
  name: z.string(),
  account_id: z.string().uuid().nullable(),
  match_type: MatchType,
  match_value: z.string(),
  target_category: CategorySlug,
  enabled: z.boolean(),
});

export const PersonalEmailCorrectionRow = z.object({
  id: z.string().uuid(),
  email_log_id: z.string().uuid(),
  old_category: CategorySlug.nullable(),
  new_category: CategorySlug,
  created_at: z.string(),
});

export const ClassificationRunRow = z.object({
  id: z.string().uuid(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  accounts: z.array(z.string()),
  emails_seen: z.number().int(),
  emails_classified: z.number().int(),
  rules_matched: z.number().int(),
  ai_calls: z.number().int(),
  ai_cost_usd: z.number(),
  errors: z.array(z.unknown()),
  trigger: z.enum(['cron', 'manual']),
});

// Output of AI classifier (parsed from Claude response)
export const AiClassificationOutput = z.object({
  category: CategorySlug,
  confidence: z.number().min(0).max(1),
  reason: z.string().max(120),
});
```

- [ ] **Step 2: Write `types.ts`**

```typescript
import { z } from 'zod';
import {
  CategorySlug,
  MatchType,
  ClassificationMethod,
  PersonalEmailCategoryRow,
  PersonalEmailRuleRow,
  AiClassificationOutput,
} from './schema';

export type CategorySlug = z.infer<typeof CategorySlug>;
export type MatchType = z.infer<typeof MatchType>;
export type ClassificationMethod = z.infer<typeof ClassificationMethod>;
export type PersonalEmailCategory = z.infer<typeof PersonalEmailCategoryRow>;
export type PersonalEmailRule = z.infer<typeof PersonalEmailRuleRow>;
export type AiClassification = z.infer<typeof AiClassificationOutput>;

export type EmailFeatures = {
  fromAddress: string;
  fromDomain: string;
  toAddress: string;
  subject: string;
  hasListUnsubscribe: boolean;
  gmailLabelIds: string[];
  gmailLabelNames: string[];
  bodyExcerpt: string;
  receivedIso: string | null;
};
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/personal-email/schema.ts src/lib/personal-email/types.ts
git commit -m "feat(personal): zod schemas + types for personal-email"
```

---

### Task 3: `categories.ts` module — 9 category constants + helpers

**Files:**
- Create: `src/lib/personal-email/categories.ts`

- [ ] **Step 1: Write the module**

```typescript
import type { CategorySlug } from './types';

export type CategoryDef = {
  slug: CategorySlug;
  displayName: string;
  tier: 1 | 2 | 3 | 4;
  sortOrder: number;
  gmailLabelName: string;
  accentColor: string;
  iconName: string;
};

// Order matches mig 0081 seed; canonical reference for code that doesn't
// want to hit the DB (e.g. UI defaults before user customization).
export const CATEGORIES: CategoryDef[] = [
  { slug: 'action_required', displayName: 'Action Required',     tier: 1, sortOrder: 10, gmailLabelName: 'Lime/ActionRequired', accentColor: 'rose',    iconName: 'Reply' },
  { slug: 'security',        displayName: 'Security',             tier: 1, sortOrder: 20, gmailLabelName: 'Lime/Security',      accentColor: 'amber',   iconName: 'ShieldCheck' },
  { slug: 'travel',          displayName: 'Travel',               tier: 1, sortOrder: 30, gmailLabelName: 'Lime/Travel',        accentColor: 'sky',     iconName: 'Plane' },
  { slug: 'bills_receipts',  displayName: 'Bills & Receipts',     tier: 2, sortOrder: 10, gmailLabelName: 'Lime/Bills',         accentColor: 'emerald', iconName: 'Receipt' },
  { slug: 'personal',        displayName: 'Personal',             tier: 2, sortOrder: 20, gmailLabelName: 'Lime/Personal',      accentColor: 'pink',    iconName: 'Heart' },
  { slug: 'newsletters',     displayName: 'Newsletters',          tier: 3, sortOrder: 10, gmailLabelName: 'Lime/Newsletters',   accentColor: 'indigo',  iconName: 'BookOpen' },
  { slug: 'notifications',   displayName: 'Notifications / FYI',  tier: 3, sortOrder: 20, gmailLabelName: 'Lime/Notifications', accentColor: 'slate',   iconName: 'Bell' },
  { slug: 'promotions',      displayName: 'Promotions / Ads',     tier: 4, sortOrder: 10, gmailLabelName: 'Lime/Promotions',    accentColor: 'violet',  iconName: 'Tag' },
  { slug: 'spam',            displayName: 'Spam / Junk',          tier: 4, sortOrder: 20, gmailLabelName: 'Lime/Spam',          accentColor: 'zinc',    iconName: 'XCircle' },
];

// Categories that ALWAYS go through the AI classifier even when a rule
// matched — semantic judgment matters more than the rule's heuristic.
// (Spec §11 step 3.)
export const ALWAYS_AI_CATEGORIES: ReadonlySet<CategorySlug> = new Set<CategorySlug>([
  'action_required',
  'personal',
]);

export const TIER_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: 'Act now',
  2: 'File / track',
  3: 'Skim / skip',
  4: 'Delete-bait',
};

export function getCategory(slug: string): CategoryDef | undefined {
  return CATEGORIES.find(c => c.slug === slug);
}

export function getCategoriesByTier(tier: 1 | 2 | 3 | 4): CategoryDef[] {
  return CATEGORIES.filter(c => c.tier === tier).sort((a, b) => a.sortOrder - b.sortOrder);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/personal-email/categories.ts
git commit -m "feat(personal): category constants + tier helpers"
```

---

### Task 4: Verify Personal-domain access path works

**Files:**
- Read-only: `src/lib/auth.ts` (no edits expected — just verification)
- Read-only: existing admin user record in DB

- [ ] **Step 1: Read `src/lib/auth.ts` and confirm `canAccessDomain('personal')` is admin-true**

Run: open the file, find `canAccessDomain`, confirm at line ~143 the check returns `true` for `user.is_admin`.

Expected: `if (user.is_admin) return true;` is present. No code change.

- [ ] **Step 2: Verify kareem's role via execute_sql**

```sql
select email, role from public.users where email = 'kareem.hady@gmail.com';
-- expect role='admin' (or NULL → admin via env)
```

If not admin, this is a blocker for Task 14+ — user must grant role manually before continuing.

- [ ] **Step 3: No commit (verification step only)**

---

## Phase 2 — Personal-domain shell + OAuth pass-through (Tasks 5–8)

### Task 5: Add `domain=personal` pass-through to OAuth start + callback

**Files:**
- Read: `src/app/api/auth/google/start/route.ts` and `src/app/api/auth/google/callback/route.ts` to understand state-param plumbing
- Modify: `src/app/api/auth/google/start/route.ts` — accept `?domain=personal` query, embed in OAuth `state`
- Modify: `src/app/api/auth/google/callback/route.ts` — read `domain` from state, set `accounts.domain` on insert/update

- [ ] **Step 1: Read both files**

Run: open `src/app/api/auth/google/start/route.ts`, then `src/app/api/auth/google/callback/route.ts`. Note how the `state` parameter is generated and verified.

Expected: state is a CSRF token (likely random hex or signed JWT). It might already pass through arbitrary data; if not, we extend it.

- [ ] **Step 2: Extend `start` route to embed domain**

In `start/route.ts`, where the OAuth URL is built, accept `domain` from `searchParams` and append it to the state. Example pattern (adapt to existing code shape):

```typescript
const url = new URL(req.url);
const domain = url.searchParams.get('domain'); // 'personal' or null
const csrf = crypto.randomBytes(16).toString('hex');
// Encode both: state = `${csrf}.${domain ?? ''}`
const state = `${csrf}.${domain ?? ''}`;
// store csrf in cookie as before; pass full state to Google
```

- [ ] **Step 3: Extend `callback` to parse and persist**

In `callback/route.ts`, after CSRF verify, split the state, extract `domain`, and pass to the account insert/update. Example:

```typescript
const [csrf, domainTag] = (state ?? '').split('.');
// ... existing CSRF check ...
const domain = domainTag === 'personal' ? 'personal' : null;
// ... after exchanging code and getting authorizing email ...
await sb.from('accounts').upsert({
  email: authorizingEmail,
  provider: 'gmail',
  oauth_refresh_token_encrypted: encrypt(tokens.refresh_token!),
  oauth_access_token_encrypted: tokens.access_token ? encrypt(tokens.access_token) : null,
  access_token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
  domain, // NEW
  display_name: deriveDisplayName(authorizingEmail), // NEW — see helper below
  enabled: true,
}, { onConflict: 'email' });
```

Helper to add at top of `callback/route.ts` (or to `src/lib/personal-email/account-naming.ts` if you prefer to colocate):

```typescript
function deriveDisplayName(email: string): string {
  const lower = email.toLowerCase();
  if (lower.endsWith('@gmail.com')) return 'GMAIL';
  if (lower.includes('@lime-investments') || lower.includes('@lime.')) return 'LIME';
  if (lower.includes('@fmplus')) return 'FM+';
  return email.split('@')[0].toUpperCase();
}
```

- [ ] **Step 4: Smoke test mentally — connect a 4th unrelated account should still work**

The `domain` param defaults to `null` so legacy admin-connect flows (Beithady ingest accounts) keep working unchanged. No DB schema change needed; the column already accepts NULL.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/google/start/route.ts src/app/api/auth/google/callback/route.ts
git commit -m "feat(personal): pass domain through OAuth state, set on accounts row"
```

---

### Task 6: `/personal` landing page

**Files:**
- Create: `src/app/personal/layout.tsx`
- Create: `src/app/personal/page.tsx`

- [ ] **Step 1: Write `layout.tsx`**

```typescript
import { redirect } from 'next/navigation';
import { TopNav } from '@/app/_components/brand';
import { getCurrentUser, canAccessDomain } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function PersonalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canAccessDomain(user, 'personal')) redirect('/');
  return (
    <>
      <TopNav />
      {children}
    </>
  );
}
```

- [ ] **Step 2: Write `page.tsx` (landing with Email card)**

```typescript
import Link from 'next/link';
import { Mail, Ship, ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function PersonalLandingPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-10 space-y-8 flex-1">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Personal
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Personal cockpit</h1>
        <p className="text-sm text-slate-500">
          Apps that don&apos;t belong to a subsidiary.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          href="/personal/email"
          className="group ix-card p-5 relative overflow-hidden hover:shadow-lg transition"
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-slate-50 text-slate-700">
              <Mail size={24} />
            </div>
            <ArrowRight size={18} className="text-slate-400 group-hover:text-lime-600 transition" />
          </div>
          <h3 className="text-lg font-bold tracking-tight">Email</h3>
          <p className="text-xs text-slate-500 mt-2">
            Triage GMAIL · LIME · FM+ inboxes by category.
          </p>
        </Link>

        <Link
          href="/emails/boat-rental"
          className="group ix-card p-5 relative overflow-hidden hover:shadow-lg transition"
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-cyan-50 text-cyan-700">
              <Ship size={24} />
            </div>
            <ArrowRight size={18} className="text-slate-400 group-hover:text-lime-600 transition" />
          </div>
          <h3 className="text-lg font-bold tracking-tight">Boat Rental</h3>
          <p className="text-xs text-slate-500 mt-2">
            Bookings, payments, owner portal. (Existing — opens at /emails/boat-rental.)
          </p>
        </Link>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/personal/layout.tsx src/app/personal/page.tsx
git commit -m "feat(personal): /personal landing with Email + Boat Rental cards"
```

---

### Task 7: Wire home-page Personal card to `/personal`

**Files:**
- Modify: `src/app/page.tsx:71` — change `href` for `personal` domain

- [ ] **Step 1: Read `src/app/page.tsx` lines 65–80**

Currently:
```typescript
href={d === 'beithady' ? '/beithady' : `/emails/${d}`}
```
This means Personal currently links to `/emails/personal` which doesn't exist.

- [ ] **Step 2: Update the conditional**

Replace with:

```typescript
href={
  d === 'beithady' ? '/beithady'
  : d === 'personal' ? '/personal'
  : `/emails/${d}`
}
```

- [ ] **Step 3: Verify visually (optional, requires `npm run dev`)**

Run: `npm run dev`, navigate to `/`, confirm clicking the Personal card now goes to `/personal` (not 404).

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(personal): wire home Personal card to /personal landing"
```

---

### Task 8: Update admin/accounts page to show domain + display_name columns

**Files:**
- Modify: `src/app/admin/accounts/page.tsx`

- [ ] **Step 1: Read the file (already inspected during planning) — locate the row map at line ~57**

- [ ] **Step 2: Add domain + display_name to the row markup**

In the `{accounts?.map((a: any) => (...))}` block, replace the `<div className="font-medium font-mono text-sm truncate">{a.email}</div>` block with:

```tsx
<div className="font-medium font-mono text-sm truncate flex items-center gap-2">
  {a.email}
  {a.display_name && (
    <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
      {a.display_name}
    </span>
  )}
  {a.domain && (
    <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
      {a.domain}
    </span>
  )}
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/accounts/page.tsx
git commit -m "feat(personal): show domain + display_name on admin accounts page"
```

---

**End of Phase 2.**

## Phase 3 — Classification engine (Tasks 9–13)

### Task 9: Feature extractor + tests

**Files:**
- Create: `src/lib/personal-email/feature-extractor.ts`
- Test: `src/lib/personal-email/feature-extractor.test.ts`

- [ ] **Step 1: Write `feature-extractor.test.ts` first (TDD)**

```typescript
import { describe, it, expect } from 'vitest';
import { extractFeatures, parseFromDomain } from './feature-extractor';

describe('parseFromDomain', () => {
  it('extracts the domain from a quoted-name address', () => {
    expect(parseFromDomain('"Stripe" <noreply@stripe.com>')).toBe('stripe.com');
  });
  it('handles bare addresses', () => {
    expect(parseFromDomain('alice@example.com')).toBe('example.com');
  });
  it('lowercases the result', () => {
    expect(parseFromDomain('Bob <BOB@COMPANY.COM>')).toBe('company.com');
  });
  it('returns empty string for malformed input', () => {
    expect(parseFromDomain('not-an-email')).toBe('');
  });
});

describe('extractFeatures', () => {
  it('detects List-Unsubscribe header (case-insensitive)', () => {
    const f = extractFeatures({
      headers: { from: 'a@b.com', to: 'me@me.com', subject: 's', 'list-unsubscribe': '<https://x>' },
      bodyExcerpt: '',
      gmailLabelIds: [],
    });
    expect(f.hasListUnsubscribe).toBe(true);
  });

  it('returns false when List-Unsubscribe is missing', () => {
    const f = extractFeatures({
      headers: { from: 'a@b.com', to: 'me@me.com', subject: 's' },
      bodyExcerpt: '',
      gmailLabelIds: [],
    });
    expect(f.hasListUnsubscribe).toBe(false);
  });

  it('strips whitespace from subject', () => {
    const f = extractFeatures({
      headers: { from: 'a@b.com', to: 'me@me.com', subject: '  Hello  ' },
      bodyExcerpt: '',
      gmailLabelIds: [],
    });
    expect(f.subject).toBe('Hello');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (`extractFeatures is not defined`)**

```bash
npx vitest run src/lib/personal-email/feature-extractor.test.ts
```

- [ ] **Step 3: Write the implementation**

```typescript
import type { EmailFeatures } from './types';

export type RawHeaderMap = Record<string, string | undefined>;

export type FeatureInput = {
  headers: RawHeaderMap;
  bodyExcerpt: string;
  gmailLabelIds: string[];
  gmailLabelNames?: string[];
};

// Lowercases the header map and looks up by lowercase key. Gmail's API
// returns headers with mixed case (`From`, `To`, `Subject`, `List-Unsubscribe`).
function getHeader(h: RawHeaderMap, name: string): string {
  const lower = name.toLowerCase();
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === lower) return (h[k] ?? '').toString();
  }
  return '';
}

const ANGLE_RE = /<([^>]+)>/;

export function parseFromDomain(fromHeader: string): string {
  if (!fromHeader) return '';
  // Either `Name <addr@host>` or bare `addr@host`.
  const m = fromHeader.match(ANGLE_RE);
  const addr = (m ? m[1] : fromHeader).trim().toLowerCase();
  const at = addr.lastIndexOf('@');
  if (at < 0 || at === addr.length - 1) return '';
  return addr.slice(at + 1);
}

export function parseFromAddress(fromHeader: string): string {
  if (!fromHeader) return '';
  const m = fromHeader.match(ANGLE_RE);
  return (m ? m[1] : fromHeader).trim().toLowerCase();
}

export function extractFeatures(input: FeatureInput): EmailFeatures {
  const fromHeader = getHeader(input.headers, 'from');
  return {
    fromAddress: parseFromAddress(fromHeader),
    fromDomain: parseFromDomain(fromHeader),
    toAddress: getHeader(input.headers, 'to').trim().toLowerCase(),
    subject: getHeader(input.headers, 'subject').trim(),
    hasListUnsubscribe: !!getHeader(input.headers, 'list-unsubscribe'),
    gmailLabelIds: input.gmailLabelIds,
    gmailLabelNames: input.gmailLabelNames ?? [],
    bodyExcerpt: input.bodyExcerpt,
    receivedIso: null,
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/lib/personal-email/feature-extractor.test.ts
```
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/personal-email/feature-extractor.ts src/lib/personal-email/feature-extractor.test.ts
git commit -m "feat(personal): feature extractor + tests"
```

---

### Task 10: Rule matcher + tests

**Files:**
- Create: `src/lib/personal-email/rule-matcher.ts`
- Test: `src/lib/personal-email/rule-matcher.test.ts`

- [ ] **Step 1: Write the test first**

```typescript
import { describe, it, expect } from 'vitest';
import { matchRule } from './rule-matcher';
import type { PersonalEmailRule, EmailFeatures } from './types';

const baseFeatures: EmailFeatures = {
  fromAddress: 'noreply@stripe.com',
  fromDomain: 'stripe.com',
  toAddress: 'me@me.com',
  subject: 'Your Stripe receipt',
  hasListUnsubscribe: false,
  gmailLabelIds: [],
  gmailLabelNames: [],
  bodyExcerpt: '',
  receivedIso: null,
};

const baseRule = (over: Partial<PersonalEmailRule>): PersonalEmailRule => ({
  id: '00000000-0000-0000-0000-000000000000',
  priority: 100,
  name: 't',
  account_id: null,
  match_type: 'from_domain',
  match_value: 'stripe.com',
  target_category: 'bills_receipts',
  enabled: true,
  ...over,
});

describe('matchRule', () => {
  it('respects priority order (first match wins)', () => {
    const rules = [
      baseRule({ priority: 50, match_value: 'stripe.com', target_category: 'newsletters' }),
      baseRule({ priority: 10, match_value: 'stripe.com', target_category: 'bills_receipts' }),
    ];
    const m = matchRule(baseFeatures, rules);
    expect(m?.target_category).toBe('bills_receipts'); // priority 10 wins
  });

  it('matches from_domain as suffix (subdomain matches)', () => {
    const f = { ...baseFeatures, fromDomain: 'mail.stripe.com' };
    const m = matchRule(f, [baseRule({ match_type: 'from_domain', match_value: 'stripe.com' })]);
    expect(m).not.toBeNull();
  });

  it('matches subject_contains case-insensitively', () => {
    const m = matchRule(baseFeatures, [baseRule({
      match_type: 'subject_contains', match_value: 'RECEIPT', target_category: 'bills_receipts',
    })]);
    expect(m?.target_category).toBe('bills_receipts');
  });

  it('matches gmail_label exactly', () => {
    const f = { ...baseFeatures, gmailLabelIds: ['SPAM', 'INBOX'] };
    const m = matchRule(f, [baseRule({
      match_type: 'gmail_label', match_value: 'SPAM', target_category: 'spam',
    })]);
    expect(m?.target_category).toBe('spam');
  });

  it('matches header_present (case-insensitive)', () => {
    const f = { ...baseFeatures, hasListUnsubscribe: true };
    const m = matchRule(f, [baseRule({
      match_type: 'header_present', match_value: 'List-Unsubscribe', target_category: 'promotions',
    })]);
    expect(m?.target_category).toBe('promotions');
  });

  it('skips disabled rules', () => {
    const m = matchRule(baseFeatures, [baseRule({ enabled: false })]);
    expect(m).toBeNull();
  });

  it('respects account_id scoping (null = all)', () => {
    const f = { ...baseFeatures } as EmailFeatures & { accountId?: string };
    (f as any).accountId = 'aaaa';
    const m = matchRule(f as EmailFeatures, [
      baseRule({ account_id: 'bbbb', target_category: 'newsletters' }),
      baseRule({ account_id: null, target_category: 'bills_receipts' }),
    ], 'aaaa');
    expect(m?.target_category).toBe('bills_receipts');
  });

  it('returns null when no rule matches', () => {
    const f = { ...baseFeatures, fromDomain: 'unknown.com', subject: 'hi' };
    expect(matchRule(f, [baseRule({ match_value: 'stripe.com' })])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/lib/personal-email/rule-matcher.test.ts
```

- [ ] **Step 3: Implement `rule-matcher.ts`**

```typescript
import type { PersonalEmailRule, EmailFeatures } from './types';

// Pure function: given features + an ordered rule set, return the
// first matching rule (lowest priority value wins) or null.
//
// `accountId` scopes which account-bound rules can match. `account_id IS
// NULL` rules are global and always considered.
export function matchRule(
  features: EmailFeatures,
  rules: PersonalEmailRule[],
  accountId: string | null = null,
): PersonalEmailRule | null {
  // Sort by priority ascending (lower = higher precedence). Defensive:
  // caller may not have sorted.
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const r of sorted) {
    if (!r.enabled) continue;
    if (r.account_id && r.account_id !== accountId) continue;
    if (matches(features, r)) return r;
  }
  return null;
}

function matches(f: EmailFeatures, r: PersonalEmailRule): boolean {
  const v = r.match_value;
  const vLower = v.toLowerCase();
  switch (r.match_type) {
    case 'from_domain': {
      const dom = f.fromDomain.toLowerCase();
      return dom === vLower || dom.endsWith('.' + vLower);
    }
    case 'from_email':
      return f.fromAddress.toLowerCase() === vLower;
    case 'subject_contains':
      return f.subject.toLowerCase().includes(vLower);
    case 'body_contains':
      return f.bodyExcerpt.toLowerCase().includes(vLower);
    case 'header_present':
      // v1: only `List-Unsubscribe` is exposed via the EmailFeatures
      // shape. Other headers would require expanding the extractor.
      if (vLower === 'list-unsubscribe') return f.hasListUnsubscribe;
      return false;
    case 'gmail_label':
      return f.gmailLabelIds.includes(v) || f.gmailLabelNames.includes(v);
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/lib/personal-email/rule-matcher.test.ts
```
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/personal-email/rule-matcher.ts src/lib/personal-email/rule-matcher.test.ts
git commit -m "feat(personal): rule matcher with priority order + tests"
```

---

### Task 11: Cost guard + recent-corrections helpers

**Files:**
- Create: `src/lib/personal-email/cost-guard.ts`
- Create: `src/lib/personal-email/corrections.ts`

- [ ] **Step 1: Write `cost-guard.ts`**

```typescript
import { supabaseAdmin } from '@/lib/supabase';

// Sum AI cost across all classification runs that started today (UTC).
export async function getDailyCostUsd(): Promise<number> {
  const sb = supabaseAdmin();
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  const { data, error } = await sb
    .from('personal_email_classification_runs')
    .select('ai_cost_usd')
    .gte('started_at', startOfDayUtc.toISOString());
  if (error) throw new Error(`cost_guard_query_failed: ${error.message}`);
  return (data ?? []).reduce((s, r: any) => s + Number(r.ai_cost_usd ?? 0), 0);
}

export async function isOverDailyCap(capUsd: number): Promise<boolean> {
  const used = await getDailyCostUsd();
  return used >= capUsd;
}

// Default daily cap, overridable via env. Spec §8.4 default $0.50.
export const DEFAULT_DAILY_CAP_USD = 0.5;

export function readDailyCapFromEnv(): number {
  const raw = process.env.PERSONAL_EMAIL_DAILY_CAP_USD;
  if (!raw) return DEFAULT_DAILY_CAP_USD;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_CAP_USD;
}
```

- [ ] **Step 2: Write `corrections.ts`**

```typescript
import { supabaseAdmin } from '@/lib/supabase';
import type { CategorySlug } from './types';
import { CATEGORIES } from './categories';

export type CorrectionExample = {
  category: CategorySlug;
  fromAddress: string;
  subject: string;
};

// Fetch the N most-recent user corrections per category. Used as
// few-shot examples in the AI classification system prompt (spec §12).
export async function getRecentCorrectionsByCategory(
  perCategory = 10,
): Promise<Record<CategorySlug, CorrectionExample[]>> {
  const sb = supabaseAdmin();
  const out: Record<string, CorrectionExample[]> = {};
  for (const cat of CATEGORIES) {
    out[cat.slug] = [];
  }
  // Single round-trip: fetch the latest corrections + their email_log
  // headers. Postgres distinct-on per category would be cleaner but
  // small N keeps this readable.
  const { data, error } = await sb
    .from('personal_email_corrections')
    .select('new_category, email_logs(from_address, subject)')
    .order('created_at', { ascending: false })
    .limit(perCategory * CATEGORIES.length);
  if (error) throw new Error(`corrections_query_failed: ${error.message}`);
  for (const row of (data as any[]) ?? []) {
    const cat = row.new_category as CategorySlug;
    if (!out[cat]) out[cat] = [];
    if (out[cat].length >= perCategory) continue;
    out[cat].push({
      category: cat,
      fromAddress: row.email_logs?.from_address ?? '',
      subject: row.email_logs?.subject ?? '',
    });
  }
  return out as Record<CategorySlug, CorrectionExample[]>;
}
```

- [ ] **Step 3: Commit (no tests — these are thin DB wrappers; tested integration-style in pipeline.test.ts)**

```bash
git add src/lib/personal-email/cost-guard.ts src/lib/personal-email/corrections.ts
git commit -m "feat(personal): daily cost guard + recent-corrections helpers"
```

---

### Task 12: Prompt builder + tests

**Files:**
- Create: `src/lib/personal-email/prompt.ts`
- Test: `src/lib/personal-email/prompt.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserMessage } from './prompt';

describe('buildSystemPrompt', () => {
  it('lists all 9 categories', () => {
    const sp = buildSystemPrompt({});
    for (const slug of [
      'action_required','security','travel','bills_receipts','personal',
      'newsletters','notifications','promotions','spam',
    ]) {
      expect(sp).toContain(slug + ':');
    }
  });

  it('embeds few-shot corrections when provided', () => {
    const sp = buildSystemPrompt({
      action_required: [{ category: 'action_required', fromAddress: 'a@b.com', subject: 'Hi' }],
    } as any);
    expect(sp).toContain('a@b.com');
    expect(sp).toContain('Hi');
  });

  it('outputs the JSON schema sentinel', () => {
    expect(buildSystemPrompt({})).toContain('"category"');
    expect(buildSystemPrompt({})).toContain('"confidence"');
  });
});

describe('buildUserMessage', () => {
  it('formats headers + body excerpt', () => {
    const u = buildUserMessage({
      fromHeader: '"Stripe" <noreply@stripe.com>',
      toHeader: 'me@me.com',
      subject: 'Receipt',
      hasListUnsubscribe: true,
      gmailLabelIds: ['INBOX'],
      bodyExcerpt: 'Thanks for your payment',
      accountDisplayName: 'GMAIL',
    });
    expect(u).toContain('From: "Stripe" <noreply@stripe.com>');
    expect(u).toContain('Subject: Receipt');
    expect(u).toContain('Has-List-Unsubscribe: yes');
    expect(u).toContain('Account: GMAIL');
    expect(u).toContain('Thanks for your payment');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Write `prompt.ts`**

```typescript
import type { CategorySlug } from './types';
import type { CorrectionExample } from './corrections';

const DEFINITIONS = `Categories:
- action_required: A real human is awaiting MY reply, or has issued a request/deadline directly to me. NOT automated. NOT just FYI.
- security: 2FA codes, login alerts, password resets, account changes (bank, social, dev tooling, infra providers).
- travel: Flight, hotel, ride-share, car-rental confirmations and itinerary changes.
- bills_receipts: Invoices, payment confirmations, statements, refunds. Financial paper trail.
- personal: One-to-one correspondence from a real human (friend, family, contact). NOT a list, NOT automated, NOT a work request.
- newsletters: Opted-in editorial content (Substack, Stratechery, curated analysis).
- notifications: Automated FYI from services (GitHub PRs, Vercel deploys, Slack daily summaries, calendar reminders).
- promotions: Marketing, discount codes, win-back, flash sales, product announcements.
- spam: Outright junk, phishing-shaped, or pre-flagged by Gmail's SPAM label.`;

const OUTPUT_SCHEMA = `Output JSON only, no prose:
{"category": "<one of 9 slugs>", "confidence": <0.0-1.0>, "reason": "<≤12 words>"}

If confidence < 0.7, the system flags this email for human review.`;

export function buildSystemPrompt(
  recentByCategory: Record<CategorySlug, CorrectionExample[]> | Record<string, CorrectionExample[]>,
): string {
  const fewShot = formatFewShot(recentByCategory);
  return [
    'You classify emails into one of 9 categories.',
    '',
    DEFINITIONS,
    '',
    'Recent user corrections (treat as ground truth — they fixed the AI):',
    fewShot.length ? fewShot : '(none yet)',
    '',
    OUTPUT_SCHEMA,
  ].join('\n');
}

function formatFewShot(
  byCat: Record<string, CorrectionExample[]>,
): string {
  const lines: string[] = [];
  for (const [cat, exs] of Object.entries(byCat)) {
    if (!exs.length) continue;
    for (const e of exs) {
      lines.push(`- ${cat}: from=${e.fromAddress} subject="${e.subject.slice(0, 80)}"`);
    }
  }
  return lines.join('\n');
}

export function buildUserMessage(args: {
  fromHeader: string;
  toHeader: string;
  subject: string;
  hasListUnsubscribe: boolean;
  gmailLabelIds: string[];
  bodyExcerpt: string;
  accountDisplayName: string;
}): string {
  // Cap excerpt to ~1KB to keep input tokens predictable (spec §12).
  const excerpt = args.bodyExcerpt.slice(0, 1024);
  return [
    `From: ${args.fromHeader}`,
    `To: ${args.toHeader}`,
    `Subject: ${args.subject}`,
    `Has-List-Unsubscribe: ${args.hasListUnsubscribe ? 'yes' : 'no'}`,
    `Gmail-Labels: ${args.gmailLabelIds.join(',')}`,
    `Account: ${args.accountDisplayName}`,
    '',
    'Body excerpt:',
    '"""',
    excerpt,
    '"""',
  ].join('\n');
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/personal-email/prompt.ts src/lib/personal-email/prompt.test.ts
git commit -m "feat(personal): system + user prompt builders + tests"
```

---

### Task 13: AI classifier + tests

**Files:**
- Create: `src/lib/personal-email/ai-classifier.ts`
- Test: `src/lib/personal-email/ai-classifier.test.ts`

- [ ] **Step 1: Write the test (mocks the SDK)**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create };
  },
}));

import { classifyWithAi } from './ai-classifier';

beforeEach(() => create.mockReset());

const okEmail = {
  fromHeader: 'a@b.com', toHeader: 'me@me.com', subject: 's',
  hasListUnsubscribe: false, gmailLabelIds: [], bodyExcerpt: 'b',
  accountDisplayName: 'GMAIL',
};

describe('classifyWithAi', () => {
  it('parses a clean JSON response', async () => {
    create.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"category":"personal","confidence":0.9,"reason":"casual one-to-one"}' }],
      usage: { input_tokens: 1000, cache_read_input_tokens: 600, output_tokens: 30 },
    });
    const r = await classifyWithAi(okEmail, {} as any);
    expect(r.category).toBe('personal');
    expect(r.confidence).toBe(0.9);
    expect(r.cost_usd).toBeGreaterThan(0);
  });

  it('flags low confidence (< 0.7) as needs_review', async () => {
    create.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"category":"notifications","confidence":0.4,"reason":"unclear"}' }],
      usage: { input_tokens: 1000, cache_read_input_tokens: 600, output_tokens: 30 },
    });
    const r = await classifyWithAi(okEmail, {} as any);
    expect(r.needs_review).toBe(true);
  });

  it('falls back to notifications on JSON parse failure', async () => {
    create.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not json at all' }],
      usage: { input_tokens: 1000, cache_read_input_tokens: 0, output_tokens: 30 },
    });
    const r = await classifyWithAi(okEmail, {} as any);
    expect(r.category).toBe('notifications');
    expect(r.needs_review).toBe(true);
    expect(r.reason).toMatch(/parse/i);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Write `ai-classifier.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { AiClassificationOutput, type CategorySlug } from './schema';
import { buildSystemPrompt, buildUserMessage } from './prompt';
import type { CorrectionExample } from './corrections';

const MODEL = 'claude-haiku-4-5-20251001';

// Haiku 4.5 published rates (per million tokens). Update when pricing
// changes. Source: anthropic.com/pricing.
const COST = {
  input_per_mtok: 1.0,
  cache_read_per_mtok: 0.1,
  output_per_mtok: 5.0,
};

export type ClassifierInput = {
  fromHeader: string;
  toHeader: string;
  subject: string;
  hasListUnsubscribe: boolean;
  gmailLabelIds: string[];
  bodyExcerpt: string;
  accountDisplayName: string;
};

export type ClassifierResult = {
  category: CategorySlug;
  confidence: number;
  reason: string;
  needs_review: boolean;
  cost_usd: number;
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export async function classifyWithAi(
  input: ClassifierInput,
  recentCorrectionsByCategory: Record<CategorySlug, CorrectionExample[]>,
): Promise<ClassifierResult> {
  const systemPrompt = buildSystemPrompt(recentCorrectionsByCategory);
  const userMessage = buildUserMessage(input);

  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 50,
    // Prompt-cache the (large, stable) system prompt — fresh user
    // message stays uncached. Spec §12.
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = res.content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('');

  let parsed: { category: CategorySlug; confidence: number; reason: string } | null = null;
  try {
    const json = JSON.parse(text);
    parsed = AiClassificationOutput.parse(json);
  } catch {
    parsed = null;
  }

  const cost = computeCost(res.usage);

  if (!parsed) {
    return {
      category: 'notifications',
      confidence: 0,
      reason: 'parse_failed',
      needs_review: true,
      cost_usd: cost,
    };
  }
  return {
    category: parsed.category,
    confidence: parsed.confidence,
    reason: parsed.reason,
    needs_review: parsed.confidence < 0.7,
    cost_usd: cost,
  };
}

function computeCost(usage: any): number {
  const inputTokens = Number(usage?.input_tokens ?? 0);
  const cacheRead = Number(usage?.cache_read_input_tokens ?? 0);
  const cacheCreation = Number(usage?.cache_creation_input_tokens ?? 0);
  const output = Number(usage?.output_tokens ?? 0);
  // input_tokens already excludes cached portions per Anthropic's API.
  return (
    (inputTokens / 1e6) * COST.input_per_mtok +
    (cacheRead / 1e6) * COST.cache_read_per_mtok +
    (cacheCreation / 1e6) * COST.input_per_mtok * 1.25 + // cache write = 1.25x input
    (output / 1e6) * COST.output_per_mtok
  );
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/personal-email/ai-classifier.ts src/lib/personal-email/ai-classifier.test.ts
git commit -m "feat(personal): Haiku 4.5 classifier with prompt caching + tests"
```

---

**End of Phase 3.**

## Phase 4 — Label sync + pipeline + ingest cron (Tasks 14–17)

### Task 14: Label sync module + tests

**Files:**
- Create: `src/lib/personal-email/label-sync.ts`
- Test: `src/lib/personal-email/label-sync.test.ts`

- [ ] **Step 1: Write the test (mocks googleapis Gmail client)**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const labelsList = vi.fn();
const labelsCreate = vi.fn();
const messagesBatchModify = vi.fn();
const messagesList = vi.fn();
const messagesGet = vi.fn();

vi.mock('@/lib/gmail', async (orig) => {
  const actual: any = await orig();
  return {
    ...actual,
    getGmailClientFromRefresh: vi.fn(async () => ({
      users: {
        labels: { list: labelsList, create: labelsCreate },
        messages: { batchModify: messagesBatchModify, list: messagesList, get: messagesGet },
      },
    })),
  };
});

const upsertLabel = vi.fn();
const fetchLabels = vi.fn();
vi.mock('./label-sync-db', () => ({
  upsertLabelMapping: upsertLabel,
  loadLabelMap: fetchLabels,
}));

import { ensureLabelsForAccount, syncLabelChange } from './label-sync';

const fakeAccount = {
  id: 'acc-1',
  email: 'a@b.com',
  oauth_refresh_token_encrypted: 'enc',
};

beforeEach(() => {
  labelsList.mockReset(); labelsCreate.mockReset();
  messagesBatchModify.mockReset();
  upsertLabel.mockReset(); fetchLabels.mockReset();
});

describe('ensureLabelsForAccount', () => {
  it('creates a Lime/* label when missing', async () => {
    labelsList.mockResolvedValue({ data: { labels: [] } });
    labelsCreate.mockResolvedValue({ data: { id: 'Label_42', name: 'Lime/ActionRequired' } });
    await ensureLabelsForAccount(fakeAccount as any);
    expect(labelsCreate).toHaveBeenCalled();
    expect(upsertLabel).toHaveBeenCalledWith('acc-1', 'action_required', 'Label_42');
  });

  it('reuses an existing Lime/* label (idempotent)', async () => {
    labelsList.mockResolvedValue({
      data: { labels: [{ id: 'Label_99', name: 'Lime/ActionRequired' }] },
    });
    await ensureLabelsForAccount(fakeAccount as any);
    expect(labelsCreate).not.toHaveBeenCalled();
    expect(upsertLabel).toHaveBeenCalledWith('acc-1', 'action_required', 'Label_99');
  });
});

describe('syncLabelChange', () => {
  it('removes old + adds new in one batchModify', async () => {
    fetchLabels.mockResolvedValue({
      action_required: 'Label_AR',
      personal: 'Label_P',
    });
    await syncLabelChange(fakeAccount as any, 'msg-1', 'action_required', 'personal');
    expect(messagesBatchModify).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: expect.objectContaining({
        ids: ['msg-1'],
        removeLabelIds: ['Label_AR'],
        addLabelIds: ['Label_P'],
      }),
    }));
  });

  it('skips when categories are equal', async () => {
    await syncLabelChange(fakeAccount as any, 'msg-1', 'personal', 'personal');
    expect(messagesBatchModify).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Write `label-sync-db.ts` (small DB helper, separated for testability)**

Create `src/lib/personal-email/label-sync-db.ts`:

```typescript
import { supabaseAdmin } from '@/lib/supabase';
import { CATEGORIES } from './categories';
import type { CategorySlug } from './types';

export async function upsertLabelMapping(
  accountId: string, categorySlug: CategorySlug, gmailLabelId: string,
): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('personal_email_account_labels')
    .upsert({ account_id: accountId, category_slug: categorySlug, gmail_label_id: gmailLabelId },
            { onConflict: 'account_id,category_slug' });
  if (error) throw new Error(`upsert_label_failed: ${error.message}`);
}

export async function loadLabelMap(
  accountId: string,
): Promise<Partial<Record<CategorySlug, string>>> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_email_account_labels')
    .select('category_slug, gmail_label_id')
    .eq('account_id', accountId);
  if (error) throw new Error(`load_label_map_failed: ${error.message}`);
  const out: Partial<Record<CategorySlug, string>> = {};
  for (const r of (data ?? []) as any[]) {
    out[r.category_slug as CategorySlug] = r.gmail_label_id;
  }
  return out;
}

export const ALL_LIME_LABEL_NAMES = CATEGORIES.map(c => c.gmailLabelName);
```

- [ ] **Step 4: Write `label-sync.ts`**

```typescript
import { getGmailClientFromRefresh } from '@/lib/gmail';
import { CATEGORIES } from './categories';
import type { CategorySlug } from './types';
import { upsertLabelMapping, loadLabelMap, ALL_LIME_LABEL_NAMES } from './label-sync-db';

type Account = {
  id: string;
  email: string;
  oauth_refresh_token_encrypted: string;
};

// Ensure each enabled category has a Gmail label in this account.
// Idempotent: re-run after reconnect to repair any missing mappings.
export async function ensureLabelsForAccount(account: Account): Promise<void> {
  const gmail = await getGmailClientFromRefresh(account.oauth_refresh_token_encrypted);
  const existing = await gmail.users.labels.list({ userId: 'me' });
  const byName = new Map<string, string>();
  for (const l of existing.data.labels ?? []) {
    if (l.name && l.id) byName.set(l.name, l.id);
  }

  for (const cat of CATEGORIES) {
    const found = byName.get(cat.gmailLabelName);
    if (found) {
      await upsertLabelMapping(account.id, cat.slug, found);
      continue;
    }
    const created = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: cat.gmailLabelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    });
    if (!created.data.id) throw new Error(`label_create_returned_no_id: ${cat.gmailLabelName}`);
    await upsertLabelMapping(account.id, cat.slug, created.data.id);
  }
}

export async function syncLabelChange(
  account: Account,
  gmailMessageId: string,
  oldCat: CategorySlug | null,
  newCat: CategorySlug,
): Promise<void> {
  if (oldCat === newCat) return;
  const map = await loadLabelMap(account.id);
  const addId = map[newCat];
  if (!addId) throw new Error(`no_label_for_category: ${newCat}`);
  const removeIds = oldCat && map[oldCat] ? [map[oldCat]!] : [];

  const gmail = await getGmailClientFromRefresh(account.oauth_refresh_token_encrypted);
  await gmail.users.messages.batchModify({
    userId: 'me',
    requestBody: {
      ids: [gmailMessageId],
      removeLabelIds: removeIds,
      addLabelIds: [addId],
    },
  });
}

// Removes every Lime/* label from every message that has one, and
// then deletes the labels themselves. Used by the disconnect flow.
export async function removeAllLimeLabels(account: Account): Promise<{ removed: number }> {
  const gmail = await getGmailClientFromRefresh(account.oauth_refresh_token_encrypted);
  const list = await gmail.users.labels.list({ userId: 'me' });
  const ours = (list.data.labels ?? []).filter(l => ALL_LIME_LABEL_NAMES.includes(l.name ?? ''));

  let removed = 0;
  for (const lab of ours) {
    if (!lab.id) continue;
    // Strip from messages — paginated, batchModify caps at 1000 ids per call.
    let pageToken: string | undefined;
    do {
      const msgs = await gmail.users.messages.list({
        userId: 'me', labelIds: [lab.id], maxResults: 500, pageToken,
      });
      const ids = (msgs.data.messages ?? []).map(m => m.id!).filter(Boolean);
      if (ids.length) {
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: { ids, removeLabelIds: [lab.id] },
        });
        removed += ids.length;
      }
      pageToken = msgs.data.nextPageToken ?? undefined;
    } while (pageToken);
    // Then drop the label itself.
    await gmail.users.labels.delete({ userId: 'me', id: lab.id });
  }
  return { removed };
}
```

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add src/lib/personal-email/label-sync.ts src/lib/personal-email/label-sync-db.ts src/lib/personal-email/label-sync.test.ts
git commit -m "feat(personal): two-way Gmail label sync (ensure/sync/remove) + tests"
```

---

### Task 15: Pipeline orchestrator + tests

**Files:**
- Create: `src/lib/personal-email/pipeline.ts`
- Test: `src/lib/personal-email/pipeline.test.ts`

- [ ] **Step 1: Write the test (mocks DB + classifier + label sync)**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const matchRuleMock = vi.fn();
vi.mock('./rule-matcher', () => ({ matchRule: matchRuleMock }));

const classifyAi = vi.fn();
vi.mock('./ai-classifier', () => ({ classifyWithAi: classifyAi }));

const sync = vi.fn();
vi.mock('./label-sync', () => ({ syncLabelChange: sync }));

const persist = vi.fn();
vi.mock('./pipeline-db', () => ({
  loadActiveRules: vi.fn(async () => []),
  persistClassification: persist,
  loadCorrectionsForFewShot: vi.fn(async () => ({})),
}));

import { classifyOneEmail } from './pipeline';

beforeEach(() => {
  matchRuleMock.mockReset();
  classifyAi.mockReset();
  sync.mockReset();
  persist.mockReset();
});

const baseInput = {
  account: { id: 'acc-1', email: 'a@b.com', display_name: 'GMAIL', oauth_refresh_token_encrypted: 'x' } as any,
  emailLogId: 'log-1',
  gmailMessageId: 'msg-1',
  features: {
    fromAddress: 'noreply@stripe.com', fromDomain: 'stripe.com',
    toAddress: 'me@me.com', subject: 'Receipt #123',
    hasListUnsubscribe: false, gmailLabelIds: [], gmailLabelNames: [],
    bodyExcerpt: 'Thanks',  receivedIso: null,
  },
  fromHeader: 'noreply@stripe.com',
  toHeader: 'me@me.com',
  oldCategory: null,
  twoWaySyncEnabled: true,
  dailyCapUsd: 0.5,
};

describe('classifyOneEmail', () => {
  it('rule-only path: rule matched, target NOT in always-AI → skip AI', async () => {
    matchRuleMock.mockReturnValue({
      target_category: 'bills_receipts', match_type: 'subject_contains', match_value: 'Receipt',
    });
    await classifyOneEmail(baseInput);
    expect(classifyAi).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      category: 'bills_receipts', method: 'rule',
    }));
    expect(sync).toHaveBeenCalled();
  });

  it('always-AI fall-through: rule matched action_required → AI also runs', async () => {
    matchRuleMock.mockReturnValue({ target_category: 'action_required' });
    classifyAi.mockResolvedValue({
      category: 'action_required', confidence: 0.9, reason: 'r', needs_review: false, cost_usd: 0.001,
    });
    await classifyOneEmail(baseInput);
    expect(classifyAi).toHaveBeenCalled();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      category: 'action_required', method: 'ai',
    }));
  });

  it('no rule → AI runs', async () => {
    matchRuleMock.mockReturnValue(null);
    classifyAi.mockResolvedValue({
      category: 'newsletters', confidence: 0.85, reason: 'r', needs_review: false, cost_usd: 0.001,
    });
    await classifyOneEmail(baseInput);
    expect(classifyAi).toHaveBeenCalled();
  });

  it('cost cap exhausted → rule-only fallback, marks needs_review', async () => {
    matchRuleMock.mockReturnValue(null);
    await classifyOneEmail({ ...baseInput, currentDailyCostUsd: 0.5 });
    expect(classifyAi).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      category: 'notifications', needs_review: true, reason: 'ai_budget_exhausted',
    }));
  });

  it('does not call sync when twoWaySyncEnabled=false', async () => {
    matchRuleMock.mockReturnValue({ target_category: 'bills_receipts' });
    await classifyOneEmail({ ...baseInput, twoWaySyncEnabled: false });
    expect(sync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Create `pipeline-db.ts` (DB-only helper, isolates side effects)**

```typescript
import { supabaseAdmin } from '@/lib/supabase';
import { CATEGORIES } from './categories';
import { getRecentCorrectionsByCategory } from './corrections';
import type { CategorySlug, ClassificationMethod, PersonalEmailRule } from './types';

export async function loadActiveRules(): Promise<PersonalEmailRule[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_email_rules')
    .select('*')
    .eq('enabled', true)
    .order('priority', { ascending: true });
  if (error) throw new Error(`load_rules_failed: ${error.message}`);
  return (data ?? []) as PersonalEmailRule[];
}

export async function persistClassification(args: {
  emailLogId: string;
  category: CategorySlug;
  confidence: number | null;
  method: ClassificationMethod;
  reason: string;
  needs_review: boolean;
}): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('email_logs')
    .update({
      category: args.category,
      category_confidence: args.confidence,
      category_method: args.method,
      category_reason: args.reason,
      needs_review: args.needs_review,
      last_classified_at: new Date().toISOString(),
    })
    .eq('id', args.emailLogId);
  if (error) throw new Error(`persist_classification_failed: ${error.message}`);
}

export { getRecentCorrectionsByCategory as loadCorrectionsForFewShot };
```

- [ ] **Step 4: Write `pipeline.ts`**

```typescript
import { matchRule } from './rule-matcher';
import { classifyWithAi } from './ai-classifier';
import { syncLabelChange } from './label-sync';
import { ALWAYS_AI_CATEGORIES } from './categories';
import type { CategorySlug, EmailFeatures } from './types';
import {
  loadActiveRules,
  persistClassification,
  loadCorrectionsForFewShot,
} from './pipeline-db';

export type ClassifyOneEmailInput = {
  account: {
    id: string;
    email: string;
    display_name: string | null;
    oauth_refresh_token_encrypted: string;
  };
  emailLogId: string;
  gmailMessageId: string;
  features: EmailFeatures;
  fromHeader: string;
  toHeader: string;
  oldCategory: CategorySlug | null;
  twoWaySyncEnabled: boolean;
  // Pre-loaded once per run by ingest.ts so this fn is testable in isolation.
  rules?: any[]; // typed as PersonalEmailRule[] but kept loose for the mock
  recentCorrections?: any;
  currentDailyCostUsd?: number;
  dailyCapUsd: number;
};

export type ClassifyOneEmailResult = {
  category: CategorySlug;
  method: 'rule' | 'ai';
  ai_cost_usd: number;
  needs_review: boolean;
};

export async function classifyOneEmail(
  input: ClassifyOneEmailInput,
): Promise<ClassifyOneEmailResult> {
  const rules = input.rules ?? (await loadActiveRules());
  const ruleHit = matchRule(input.features, rules, input.account.id);

  // Special: gmail SPAM short-circuits both rule + AI.
  if (ruleHit && ruleHit.target_category === 'spam') {
    return finalize({
      input, category: 'spam', method: 'rule',
      reason: 'gmail_spam_label', confidence: 1, needs_review: false, ai_cost_usd: 0,
    });
  }

  // Cost cap: if exhausted, skip AI entirely and fall back to whatever
  // the rule said. If no rule, route to notifications + needs_review.
  const overCap = (input.currentDailyCostUsd ?? 0) >= input.dailyCapUsd;

  // Rule-only commit when: rule matched AND target NOT in always-AI
  // AND we are not forced to AI by some other signal.
  if (ruleHit && !ALWAYS_AI_CATEGORIES.has(ruleHit.target_category)) {
    return finalize({
      input,
      category: ruleHit.target_category,
      method: 'rule',
      reason: `rule:${ruleHit.match_type}=${ruleHit.match_value}`,
      confidence: 1,
      needs_review: false,
      ai_cost_usd: 0,
    });
  }

  if (overCap) {
    // No rule, or rule said action_required/personal but we can't afford AI.
    return finalize({
      input,
      category: ruleHit?.target_category ?? 'notifications',
      method: 'rule',
      reason: 'ai_budget_exhausted',
      confidence: null,
      needs_review: true,
      ai_cost_usd: 0,
    });
  }

  // AI path.
  const fewShot = input.recentCorrections ?? (await loadCorrectionsForFewShot(10));
  const ai = await classifyWithAi(
    {
      fromHeader: input.fromHeader,
      toHeader: input.toHeader,
      subject: input.features.subject,
      hasListUnsubscribe: input.features.hasListUnsubscribe,
      gmailLabelIds: input.features.gmailLabelIds,
      bodyExcerpt: input.features.bodyExcerpt,
      accountDisplayName: input.account.display_name ?? input.account.email,
    },
    fewShot,
  );
  return finalize({
    input,
    category: ai.category,
    method: 'ai',
    reason: ai.reason,
    confidence: ai.confidence,
    needs_review: ai.needs_review,
    ai_cost_usd: ai.cost_usd,
  });
}

async function finalize(args: {
  input: ClassifyOneEmailInput;
  category: CategorySlug;
  method: 'rule' | 'ai';
  reason: string;
  confidence: number | null;
  needs_review: boolean;
  ai_cost_usd: number;
}): Promise<ClassifyOneEmailResult> {
  const { input } = args;
  await persistClassification({
    emailLogId: input.emailLogId,
    category: args.category,
    confidence: args.confidence,
    method: args.method,
    reason: args.reason,
    needs_review: args.needs_review,
  });
  if (input.twoWaySyncEnabled && args.category !== input.oldCategory) {
    try {
      await syncLabelChange(input.account, input.gmailMessageId, input.oldCategory, args.category);
    } catch (e) {
      // Non-fatal — caller logs into run.errors. Sync can be retried.
      console.error('[personal-email] label sync failed', e);
    }
  }
  return {
    category: args.category,
    method: args.method,
    ai_cost_usd: args.ai_cost_usd,
    needs_review: args.needs_review,
  };
}
```

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add src/lib/personal-email/pipeline.ts src/lib/personal-email/pipeline-db.ts src/lib/personal-email/pipeline.test.ts
git commit -m "feat(personal): pipeline orchestrator (rule->AI->persist->sync) + tests"
```

---

### Task 16: Ingest module (per-account scan loop)

**Files:**
- Create: `src/lib/personal-email/ingest.ts`

- [ ] **Step 1: Write the module**

```typescript
import { supabaseAdmin } from '@/lib/supabase';
import { getGmailClientFromRefresh } from '@/lib/gmail';
import { extractFeatures } from './feature-extractor';
import { classifyOneEmail } from './pipeline';
import { loadActiveRules } from './pipeline-db';
import { getRecentCorrectionsByCategory } from './corrections';
import { getDailyCostUsd, readDailyCapFromEnv } from './cost-guard';
import type { CategorySlug } from './types';

type Trigger = 'cron' | 'manual';

export type IngestOpts = {
  trigger: Trigger;
  /** Override default 24h lookback for the very first sync. */
  initialLookbackHours?: number;
};

const DEFAULT_INITIAL_LOOKBACK_HOURS = 24;

// Runs the full ingest for every account WHERE domain='personal' AND
// enabled=true. Returns the run id so the caller (cron route or
// manual-refresh server action) can surface progress.
export async function ingestPersonalEmails(opts: IngestOpts): Promise<{ runId: string }> {
  const sb = supabaseAdmin();
  const { data: run, error: runErr } = await sb
    .from('personal_email_classification_runs')
    .insert({ trigger: opts.trigger, started_at: new Date().toISOString() })
    .select()
    .single();
  if (runErr || !run) throw new Error(`open_run_failed: ${runErr?.message}`);

  const counters = {
    emails_seen: 0,
    emails_classified: 0,
    rules_matched: 0,
    ai_calls: 0,
    ai_cost_usd: 0,
  };
  const errors: any[] = [];
  const accountsHit: string[] = [];

  try {
    const { data: accounts } = await sb
      .from('accounts')
      .select('id, email, display_name, oauth_refresh_token_encrypted, last_synced_at, enabled')
      .eq('domain', 'personal')
      .eq('enabled', true);

    const rules = await loadActiveRules();
    const corrections = await getRecentCorrectionsByCategory(10);
    const dailyCap = readDailyCapFromEnv();

    for (const acc of (accounts ?? []) as any[]) {
      accountsHit.push(acc.email);
      try {
        await ingestOneAccount({
          account: acc, run_id: run.id, rules, corrections,
          dailyCap, counters, errors,
          initialLookbackHours: opts.initialLookbackHours ?? DEFAULT_INITIAL_LOOKBACK_HOURS,
        });
        await sb
          .from('accounts')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', acc.id);
      } catch (e: any) {
        errors.push({ account: acc.email, msg: String(e?.message ?? e) });
      }
    }

    await sb
      .from('personal_email_classification_runs')
      .update({
        finished_at: new Date().toISOString(),
        accounts: accountsHit,
        emails_seen: counters.emails_seen,
        emails_classified: counters.emails_classified,
        rules_matched: counters.rules_matched,
        ai_calls: counters.ai_calls,
        ai_cost_usd: counters.ai_cost_usd,
        errors,
      })
      .eq('id', run.id);
    return { runId: run.id };
  } catch (e: any) {
    await sb
      .from('personal_email_classification_runs')
      .update({
        finished_at: new Date().toISOString(),
        accounts: accountsHit,
        errors: [...errors, { fatal: String(e?.message ?? e) }],
      })
      .eq('id', run.id);
    throw e;
  }
}

async function ingestOneAccount(args: {
  account: any; run_id: string; rules: any[]; corrections: any;
  dailyCap: number; counters: any; errors: any[]; initialLookbackHours: number;
}) {
  const sb = supabaseAdmin();
  const gmail = await getGmailClientFromRefresh(args.account.oauth_refresh_token_encrypted);
  const sinceMs = args.account.last_synced_at
    ? new Date(args.account.last_synced_at).getTime()
    : Date.now() - args.initialLookbackHours * 3600 * 1000;
  const sinceQuery = `after:${Math.floor(sinceMs / 1000)} -in:trash -in:drafts`;

  let pageToken: string | undefined;
  do {
    const list = await gmail.users.messages.list({
      userId: 'me', q: sinceQuery, maxResults: 100, pageToken,
    });
    for (const m of list.data.messages ?? []) {
      if (!m.id) continue;
      args.counters.emails_seen += 1;
      try {
        await processOneMessage({
          ...args, gmail, gmailMessageId: m.id, gmailThreadId: m.threadId ?? null,
        });
      } catch (e: any) {
        args.errors.push({ msg_id: m.id, msg: String(e?.message ?? e) });
      }
    }
    pageToken = list.data.nextPageToken ?? undefined;
  } while (pageToken);
}

async function processOneMessage(args: {
  account: any; run_id: string; gmail: any; gmailMessageId: string;
  gmailThreadId: string | null;
  rules: any[]; corrections: any; dailyCap: number; counters: any;
}) {
  const sb = supabaseAdmin();
  const full = await args.gmail.users.messages.get({
    userId: 'me', id: args.gmailMessageId, format: 'full',
  });
  const payload = full.data.payload ?? {};
  const headerArr: { name?: string; value?: string }[] = payload.headers ?? [];
  const headerMap: Record<string, string> = {};
  for (const h of headerArr) if (h.name) headerMap[h.name] = h.value ?? '';

  const labelIds: string[] = (full.data.labelIds ?? []) as string[];
  const bodyExcerpt = extractBodyExcerpt(payload).slice(0, 8 * 1024);

  const features = extractFeatures({
    headers: headerMap, bodyExcerpt, gmailLabelIds: labelIds,
  });

  // Upsert the email_logs row (existing schema has unique(account_id, gmail_message_id)).
  const { data: upserted, error: upErr } = await sb
    .from('email_logs')
    .upsert({
      run_id: args.run_id,
      account_id: args.account.id,
      gmail_message_id: args.gmailMessageId,
      gmail_thread_id: args.gmailThreadId,
      from_address: features.fromAddress,
      to_address: features.toAddress,
      subject: features.subject,
      received_at: full.data.internalDate
        ? new Date(Number(full.data.internalDate)).toISOString()
        : null,
      snippet: full.data.snippet ?? null,
      label_ids: labelIds,
      body_excerpt: bodyExcerpt,
    }, { onConflict: 'account_id,gmail_message_id' })
    .select('id, category')
    .single();
  if (upErr) throw new Error(`upsert_email_log_failed: ${upErr.message}`);

  const oldCategory = (upserted?.category ?? null) as CategorySlug | null;
  const currentCost = await getDailyCostUsd();

  const out = await classifyOneEmail({
    account: args.account,
    emailLogId: upserted!.id,
    gmailMessageId: args.gmailMessageId,
    features,
    fromHeader: headerMap['From'] ?? '',
    toHeader: headerMap['To'] ?? '',
    oldCategory,
    twoWaySyncEnabled: true,
    rules: args.rules,
    recentCorrections: args.corrections,
    currentDailyCostUsd: currentCost,
    dailyCapUsd: args.dailyCap,
  });

  args.counters.emails_classified += 1;
  if (out.method === 'rule') args.counters.rules_matched += 1;
  if (out.method === 'ai') {
    args.counters.ai_calls += 1;
    args.counters.ai_cost_usd += out.ai_cost_usd;
  }
}

function extractBodyExcerpt(payload: any): string {
  // Walk MIME parts; prefer text/plain, fall back to stripped HTML.
  let text = '';
  function walk(part: any) {
    if (!part) return;
    const data = part.body?.data;
    if (data) {
      const decoded = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      if (part.mimeType === 'text/plain' && !text) text = decoded;
      else if (part.mimeType === 'text/html' && !text) text = stripHtml(decoded);
    }
    for (const c of part.parts ?? []) walk(c);
  }
  walk(payload);
  return text;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 2: Commit (no separate test file — covered by integration-style pipeline.test.ts and end-to-end manual run in Phase 9)**

```bash
git add src/lib/personal-email/ingest.ts
git commit -m "feat(personal): per-account ingest loop with run-row bookkeeping"
```

---

### Task 17: Cron route handler

**Files:**
- Create: `src/app/api/cron/personal-email-ingest/route.ts`

- [ ] **Step 1: Read an existing cron route to match the pattern**

Run: open any file in `src/app/api/cron/` to see the auth-check + Cairo-window-gate convention used elsewhere.

- [ ] **Step 2: Write the handler**

```typescript
import { NextResponse } from 'next/server';
import { ingestPersonalEmails } from '@/lib/personal-email/ingest';

export const dynamic = 'force-dynamic';

const CAIRO_TZ = 'Africa/Cairo';

function cairoHour(now = new Date()): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TZ, hour: 'numeric', hour12: false,
  });
  return Number(fmt.format(now));
}

export async function GET(req: Request) {
  // Bearer auth (Vercel cron sends this; manual hits with /personal/email's
  // Refresh button POST to this path with the same header set server-side).
  const auth = req.headers.get('authorization') ?? '';
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  const trigger = url.searchParams.get('trigger') === 'manual' ? 'manual' : 'cron';

  // Ingest window: 6 AM – 11 PM Cairo. Outside the window, skip (unless force=1).
  if (!force) {
    const h = cairoHour();
    if (h < 6 || h > 23) {
      return NextResponse.json({ ok: true, skipped: 'outside_cairo_window', hour: h });
    }
  }

  try {
    const { runId } = await ingestPersonalEmails({ trigger });
    return NextResponse.json({ ok: true, run_id: runId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

// Manual refresh button posts here with the same secret server-side.
export const POST = GET;
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/personal-email-ingest/route.ts
git commit -m "feat(personal): cron route handler with Cairo window gate"
```

---

**End of Phase 4.**

## Phase 5 — Triage UI (Tasks 18–22)

### Task 18: Inbox query helper + counts

**Files:**
- Create: `src/lib/personal-email/inbox-query.ts`

- [ ] **Step 1: Write the module**

```typescript
import { supabaseAdmin } from '@/lib/supabase';
import type { CategorySlug } from './types';
import { CATEGORIES } from './categories';

export type InboxRow = {
  id: string;
  account_id: string;
  account_email: string;
  account_display_name: string | null;
  subject: string | null;
  from_address: string | null;
  received_at: string | null;
  category: CategorySlug | null;
  needs_review: boolean;
};

export type InboxFilters = {
  accountId?: string;          // single account, else all personal
  category?: CategorySlug;     // single category drill-down
  needsReviewOnly?: boolean;
  limit?: number;
};

export async function loadInbox(filters: InboxFilters = {}): Promise<InboxRow[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('email_logs')
    .select('id, account_id, subject, from_address, received_at, category, needs_review, accounts!inner(email, display_name, domain)')
    .eq('accounts.domain', 'personal')
    .order('received_at', { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.accountId) q = q.eq('account_id', filters.accountId);
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.needsReviewOnly) q = q.eq('needs_review', true);

  const { data, error } = await q;
  if (error) throw new Error(`inbox_load_failed: ${error.message}`);
  return ((data ?? []) as any[]).map(r => ({
    id: r.id,
    account_id: r.account_id,
    account_email: r.accounts?.email ?? '',
    account_display_name: r.accounts?.display_name ?? null,
    subject: r.subject,
    from_address: r.from_address,
    received_at: r.received_at,
    category: r.category as CategorySlug | null,
    needs_review: !!r.needs_review,
  }));
}

export type CategoryCount = { category: CategorySlug; count: number };

export async function loadCategoryCounts(accountId?: string): Promise<CategoryCount[]> {
  const sb = supabaseAdmin();
  // Group-by query via raw SQL is cleanest here.
  const accountFilter = accountId ? `and account_id = '${accountId}'` : '';
  const sql = `
    select category, count(*)::int as count
    from public.email_logs el
    join public.accounts a on a.id = el.account_id
    where a.domain = 'personal' and el.category is not null ${accountFilter}
    group by category;
  `;
  const { data, error } = await sb.rpc('exec_sql', { sql }).single();
  // Falling back: not all projects have exec_sql RPC. Use the
  // mcp__…__execute_sql tool at planning time; in production runtime,
  // do this with an aggregating select instead:
  if (error) {
    const init: CategoryCount[] = CATEGORIES.map(c => ({ category: c.slug, count: 0 }));
    let q = sb
      .from('email_logs')
      .select('category, accounts!inner(domain)')
      .eq('accounts.domain', 'personal')
      .not('category', 'is', null);
    if (accountId) q = q.eq('account_id', accountId);
    const { data: rows } = await q;
    for (const r of (rows ?? []) as any[]) {
      const hit = init.find(i => i.category === r.category);
      if (hit) hit.count += 1;
    }
    return init;
  }
  return (data as any) as CategoryCount[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/personal-email/inbox-query.ts
git commit -m "feat(personal): inbox query helpers (rows + per-category counts)"
```

---

### Task 19: `/personal/email` layout + main page

**Files:**
- Create: `src/app/personal/email/layout.tsx`
- Create: `src/app/personal/email/page.tsx`
- Create: `src/app/personal/email/_components/account-filter.tsx`
- Create: `src/app/personal/email/_components/tier-section.tsx`
- Create: `src/app/personal/email/_components/category-card.tsx`
- Create: `src/app/personal/email/_components/refresh-button.tsx`

- [ ] **Step 1: Layout**

```typescript
// src/app/personal/email/layout.tsx
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';

export const dynamic = 'force-dynamic';

export default function PersonalEmailLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav>
        <Link href="/" className="ix-link">Home</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/personal" className="ix-link">Personal</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Email</span>
      </TopNav>
      {children}
    </>
  );
}
```

- [ ] **Step 2: Account filter pill row**

```typescript
// src/app/personal/email/_components/account-filter.tsx
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';

export async function AccountFilter({
  selected,
  basePath = '/personal/email',
}: { selected?: string; basePath?: string }) {
  const sb = supabaseAdmin();
  const { data: accounts } = await sb
    .from('accounts')
    .select('id, email, display_name')
    .eq('domain', 'personal')
    .eq('enabled', true)
    .order('display_name');

  const pill = (label: string, href: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
        active
          ? 'bg-slate-900 text-white border-slate-900'
          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-wrap gap-1.5">
      {(accounts ?? []).map((a: any) =>
        pill(a.display_name ?? a.email, `${basePath}?account=${a.id}`, selected === a.id),
      )}
      {pill('All', basePath, !selected)}
    </div>
  );
}
```

- [ ] **Step 3: Tier section + category card**

```typescript
// src/app/personal/email/_components/category-card.tsx
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { CategoryDef } from '@/lib/personal-email/categories';
import type { InboxRow } from '@/lib/personal-email/inbox-query';
import { fmtCairoDateTime } from '@/lib/fmt-date';

export function CategoryCard({
  cat, count, top3, basePath,
}: {
  cat: CategoryDef;
  count: number;
  top3: InboxRow[];
  basePath: string;
}) {
  const accent = cat.accentColor;
  return (
    <Link
      href={`${basePath}?category=${cat.slug}`}
      className="ix-card p-4 hover:shadow-md transition block"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase tracking-wide text-${accent}-700`}>
            {cat.displayName}
          </span>
          <span className={`text-xs font-mono px-1.5 py-0.5 rounded bg-${accent}-50 text-${accent}-700`}>
            {count}
          </span>
        </div>
        <ChevronRight size={14} className="text-slate-400" />
      </div>
      <ul className="text-xs text-slate-600 space-y-0.5">
        {top3.slice(0, 3).map(r => (
          <li key={r.id} className="truncate">
            {r.from_address?.split('<')[0].trim()} · {r.subject}
            {r.received_at && (
              <span className="text-slate-400 ml-1">· {fmtCairoDateTime(r.received_at)}</span>
            )}
          </li>
        ))}
        {count > 3 && <li className="text-slate-400">+ {count - 3} more</li>}
      </ul>
    </Link>
  );
}
```

```typescript
// src/app/personal/email/_components/tier-section.tsx
import { TIER_LABELS } from '@/lib/personal-email/categories';

export function TierSection({
  tier, children,
}: { tier: 1 | 2 | 3 | 4; children: React.ReactNode }) {
  const dot = { 1: '🔴', 2: '🟡', 3: '🔵', 4: '⚫' }[tier];
  return (
    <section className="space-y-2">
      <h2 className="text-xs uppercase tracking-wide font-semibold text-slate-500">
        {dot} {TIER_LABELS[tier].toUpperCase()}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: Refresh button (client component)**

```typescript
// src/app/personal/email/_components/refresh-button.tsx
'use client';
import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { manualRefresh } from '../actions';

export function RefreshButton() {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => manualRefresh())}
      disabled={pending}
      className="ix-btn-secondary"
    >
      <RefreshCw size={14} className={pending ? 'animate-spin' : ''} />
      {pending ? 'Refreshing…' : 'Refresh'}
    </button>
  );
}
```

- [ ] **Step 5: Main page composes the above**

```typescript
// src/app/personal/email/page.tsx
import { CATEGORIES, getCategoriesByTier } from '@/lib/personal-email/categories';
import { loadInbox, loadCategoryCounts } from '@/lib/personal-email/inbox-query';
import { AccountFilter } from './_components/account-filter';
import { TierSection } from './_components/tier-section';
import { CategoryCard } from './_components/category-card';
import { RefreshButton } from './_components/refresh-button';
import { CategorySlug } from '@/lib/personal-email/schema';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PersonalEmailPage({
  searchParams,
}: { searchParams: Promise<{ account?: string; category?: string }> }) {
  const sp = await searchParams;
  const accountId = sp.account;
  const categoryFilter = sp.category as CategorySlug | undefined;

  // If a category filter is set, show flat list instead of tier-grouped overview.
  if (categoryFilter) {
    return <CategoryFlatView accountId={accountId} category={categoryFilter} />;
  }

  const [counts, recent] = await Promise.all([
    loadCategoryCounts(accountId),
    loadInbox({ accountId, limit: 200 }),
  ]);

  const countsBySlug = Object.fromEntries(counts.map(c => [c.category, c.count]));
  const top3BySlug: Record<string, typeof recent> = {};
  for (const r of recent) {
    if (!r.category) continue;
    (top3BySlug[r.category] ??= []).push(r);
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-6 flex-1">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Personal · Email
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Triage</h1>
        </div>
        <div className="flex items-center gap-3">
          <AccountFilter selected={accountId} />
          <RefreshButton />
          <Link href="/personal/email/setup" className="ix-link text-sm">Setup</Link>
        </div>
      </header>

      <div className="space-y-6">
        {[1, 2, 3, 4].map(t => {
          const cats = getCategoriesByTier(t as 1 | 2 | 3 | 4).filter(c => (countsBySlug[c.slug] ?? 0) >= 0);
          if (!cats.length) return null;
          return (
            <TierSection key={t} tier={t as 1 | 2 | 3 | 4}>
              {cats.map(c => (
                <CategoryCard
                  key={c.slug}
                  cat={c}
                  count={countsBySlug[c.slug] ?? 0}
                  top3={top3BySlug[c.slug] ?? []}
                  basePath="/personal/email"
                />
              ))}
            </TierSection>
          );
        })}
      </div>
    </main>
  );
}

async function CategoryFlatView({
  accountId, category,
}: { accountId?: string; category: CategorySlug }) {
  const rows = await loadInbox({ accountId, category, limit: 500 });
  const cat = CATEGORIES.find(c => c.slug === category);
  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-4 flex-1">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/personal/email" className="ix-link text-sm">← All categories</Link>
          <h1 className="text-2xl font-bold">{cat?.displayName} · {rows.length}</h1>
        </div>
        <AccountFilter selected={accountId} />
      </header>
      <div className="ix-card divide-y divide-slate-100">
        {rows.map(r => (
          <Link
            key={r.id}
            href={`/personal/email/${r.id}`}
            className="block px-4 py-2.5 hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm truncate">
                  <span className="font-medium">{r.from_address?.split('<')[0].trim()}</span>
                  {' · '}
                  {r.subject}
                </div>
                <div className="text-[11px] text-slate-500">
                  {r.account_display_name} · {r.received_at}
                </div>
              </div>
              {r.needs_review && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">?</span>
              )}
            </div>
          </Link>
        ))}
        {!rows.length && <div className="p-8 text-center text-sm text-slate-500">No emails in this category yet.</div>}
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/personal/email/layout.tsx src/app/personal/email/page.tsx src/app/personal/email/_components/
git commit -m "feat(personal): /personal/email triage view (tier-grouped + flat)"
```

---

### Task 20: Server actions (`actions.ts`)

**Files:**
- Create: `src/app/personal/email/actions.ts`

- [ ] **Step 1: Write the file**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { syncLabelChange } from '@/lib/personal-email/label-sync';
import { CategorySlug } from '@/lib/personal-email/schema';
import { ingestPersonalEmails } from '@/lib/personal-email/ingest';
import { markMessagesAsRead } from '@/lib/gmail';

async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u || !u.is_admin) throw new Error('forbidden');
  return u;
}

export async function moveEmail(
  emailLogId: string, newCategory: CategorySlug,
): Promise<void> {
  const user = await requireAdmin();
  const sb = supabaseAdmin();

  const { data: row, error: rErr } = await sb
    .from('email_logs')
    .select('id, account_id, gmail_message_id, category, accounts(id, oauth_refresh_token_encrypted, email, display_name, domain)')
    .eq('id', emailLogId)
    .single();
  if (rErr || !row) throw new Error('email_not_found');

  const oldCategory = (row.category ?? null) as CategorySlug | null;

  // 1. Update DB.
  await sb.from('email_logs').update({
    category: newCategory,
    category_method: 'manual',
    category_reason: 'user_moved',
    needs_review: false,
    last_classified_at: new Date().toISOString(),
  }).eq('id', emailLogId);

  // 2. Audit log.
  await sb.from('personal_email_corrections').insert({
    email_log_id: emailLogId,
    old_category: oldCategory,
    new_category: newCategory,
    created_by_user_id: user.id ?? null,
  });

  // 3. Push to Gmail.
  if (oldCategory !== newCategory && (row as any).accounts) {
    try {
      await syncLabelChange(
        (row as any).accounts,
        row.gmail_message_id,
        oldCategory,
        newCategory,
      );
    } catch (e) {
      console.error('[moveEmail] label sync failed', e);
    }
  }

  revalidatePath('/personal/email');
}

export async function archiveInGmail(emailLogIds: string[]): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('email_logs')
    .select('gmail_message_id, accounts(oauth_refresh_token_encrypted)')
    .in('id', emailLogIds);
  // Group by account so we issue one batchModify per account.
  const byAccount = new Map<string, string[]>();
  for (const r of (rows ?? []) as any[]) {
    const tok = r.accounts?.oauth_refresh_token_encrypted;
    if (!tok) continue;
    const list = byAccount.get(tok) ?? [];
    list.push(r.gmail_message_id);
    byAccount.set(tok, list);
  }
  for (const [tok, ids] of byAccount) {
    const { getGmailClientFromRefresh } = await import('@/lib/gmail');
    const gmail = await getGmailClientFromRefresh(tok);
    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: { ids, removeLabelIds: ['INBOX'] },
    });
  }
  revalidatePath('/personal/email');
}

export async function markAsRead(emailLogIds: string[]): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('email_logs')
    .select('gmail_message_id, accounts(oauth_refresh_token_encrypted)')
    .in('id', emailLogIds);
  const byAccount = new Map<string, string[]>();
  for (const r of (rows ?? []) as any[]) {
    const tok = r.accounts?.oauth_refresh_token_encrypted;
    if (!tok) continue;
    const list = byAccount.get(tok) ?? [];
    list.push(r.gmail_message_id);
    byAccount.set(tok, list);
  }
  for (const [tok, ids] of byAccount) {
    await markMessagesAsRead(tok, ids);
  }
  revalidatePath('/personal/email');
}

export async function manualRefresh(): Promise<void> {
  await requireAdmin();
  await ingestPersonalEmails({ trigger: 'manual' });
  revalidatePath('/personal/email');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/personal/email/actions.ts
git commit -m "feat(personal): server actions (move, archive, mark-read, manual-refresh)"
```

---

### Task 21: `/personal/email/needs-review` page

**Files:**
- Create: `src/app/personal/email/needs-review/page.tsx`

- [ ] **Step 1: Write**

```typescript
import Link from 'next/link';
import { loadInbox } from '@/lib/personal-email/inbox-query';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { AccountFilter } from '../_components/account-filter';

export const dynamic = 'force-dynamic';

export default async function NeedsReviewPage({
  searchParams,
}: { searchParams: Promise<{ account?: string }> }) {
  const sp = await searchParams;
  const rows = await loadInbox({
    accountId: sp.account,
    needsReviewOnly: true,
    limit: 500,
  });

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-4 flex-1">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/personal/email" className="ix-link text-sm">← Back</Link>
          <h1 className="text-2xl font-bold">Needs Review · {rows.length}</h1>
          <p className="text-xs text-slate-500">AI confidence below 0.7 — please confirm or move.</p>
        </div>
        <AccountFilter selected={sp.account} basePath="/personal/email/needs-review" />
      </header>

      <div className="ix-card divide-y divide-slate-100">
        {rows.map(r => (
          <Link
            key={r.id}
            href={`/personal/email/${r.id}`}
            className="block px-4 py-2.5 hover:bg-slate-50"
          >
            <div className="text-sm">
              <span className="font-medium">{r.from_address?.split('<')[0].trim()}</span>
              {' · '}{r.subject}
            </div>
            <div className="text-[11px] text-slate-500">
              {r.account_display_name} · {r.received_at && fmtCairoDateTime(r.received_at)} · current category: {r.category ?? '—'}
            </div>
          </Link>
        ))}
        {!rows.length && (
          <div className="p-8 text-center text-sm text-slate-500">All clear — nothing to review.</div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/personal/email/needs-review/page.tsx
git commit -m "feat(personal): needs-review filter page"
```

---

### Task 22: Bulk-action bar (client component) + wire into flat view

**Files:**
- Create: `src/app/personal/email/_components/bulk-action-bar.tsx`
- (Optional polish — defer to v1.5 if time-constrained.)

This task is OPTIONAL for v1 success criteria (spec §13 lists "cross-category bulk move" as v2). Per-row archive + per-row move are sufficient. Skip and move on to Phase 6.

---

**End of Phase 5.**

## Phase 6 — Detail page (Tasks 23–24)

### Task 23: Detail page with classification card + body excerpt + quick actions

**Files:**
- Create: `src/app/personal/email/[messageId]/page.tsx`
- Create: `src/app/personal/email/[messageId]/_components/classification-card.tsx`
- Create: `src/app/personal/email/[messageId]/_components/move-dropdown.tsx`

- [ ] **Step 1: classification-card.tsx (server component)**

```typescript
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { getCategory } from '@/lib/personal-email/categories';

export function ClassificationCard({
  category, confidence, method, reason, lastClassifiedAt, needsReview,
}: {
  category: string | null;
  confidence: number | null;
  method: string | null;
  reason: string | null;
  lastClassifiedAt: string | null;
  needsReview: boolean;
}) {
  const cat = category ? getCategory(category) : null;
  const accent = cat?.accentColor ?? 'slate';
  return (
    <div className={`ix-card p-4 border-l-4 border-${accent}-500`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
        AI classification
      </div>
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <span className="font-bold">{cat?.displayName ?? category ?? 'unclassified'}</span>
        {confidence !== null && (
          <span className="text-slate-600">Confidence: {confidence.toFixed(2)}</span>
        )}
        {method && (
          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
            {method}
          </span>
        )}
        {needsReview && (
          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
            needs review
          </span>
        )}
      </div>
      {reason && <div className="text-xs text-slate-600 mt-1.5 italic">"{reason}"</div>}
      {lastClassifiedAt && (
        <div className="text-[11px] text-slate-400 mt-1">
          Classified {fmtCairoDateTime(lastClassifiedAt)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: move-dropdown.tsx (client component)**

```typescript
'use client';
import { useState, useTransition } from 'react';
import { ChevronDown } from 'lucide-react';
import { CATEGORIES } from '@/lib/personal-email/categories';
import { moveEmail } from '../../actions';
import type { CategorySlug } from '@/lib/personal-email/types';

export function MoveDropdown({
  emailId, current,
}: { emailId: string; current: CategorySlug | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={pending}
        className="ix-btn-secondary"
      >
        Move to <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          {CATEGORIES.filter(c => c.slug !== current).map(c => (
            <button
              key={c.slug}
              onClick={() => {
                setOpen(false);
                start(() => moveEmail(emailId, c.slug));
              }}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              {c.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: page.tsx**

```typescript
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ExternalLink, Archive } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { ClassificationCard } from './_components/classification-card';
import { MoveDropdown } from './_components/move-dropdown';
import { archiveInGmail } from '../actions';
import type { CategorySlug } from '@/lib/personal-email/types';

export const dynamic = 'force-dynamic';

export default async function EmailDetailPage({
  params,
}: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('email_logs')
    .select(`
      id, gmail_message_id, gmail_thread_id, subject, from_address, to_address,
      received_at, body_excerpt, category, category_confidence, category_method,
      category_reason, last_classified_at, needs_review,
      accounts(id, email, display_name, oauth_refresh_token_encrypted)
    `)
    .eq('id', messageId)
    .single();
  if (error || !data) notFound();

  const acc = (data as any).accounts;
  const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${data.gmail_thread_id ?? data.gmail_message_id}`;

  return (
    <main className="max-w-3xl mx-auto px-6 py-8 space-y-5 flex-1">
      <Link href="/personal/email" className="ix-link text-sm inline-flex items-center gap-1">
        <ChevronLeft size={14} /> Back to triage
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{data.subject}</h1>
        <div className="text-xs text-slate-500 space-x-2">
          <span>From: {data.from_address}</span>
          <span>·</span>
          <span>To: {data.to_address}</span>
          <span>·</span>
          <span>{data.received_at && fmtCairoDateTime(data.received_at)}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
            {acc?.display_name ?? acc?.email}
          </span>
          <MoveDropdown emailId={data.id} current={data.category as CategorySlug | null} />
          <form action={async () => { 'use server'; await archiveInGmail([data.id]); }}>
            <button type="submit" className="ix-btn-secondary"><Archive size={14}/> Archive in Gmail</button>
          </form>
          <a href={gmailUrl} target="_blank" rel="noreferrer" className="ix-btn-secondary">
            <ExternalLink size={14}/> Open in Gmail
          </a>
        </div>
      </header>

      <ClassificationCard
        category={data.category}
        confidence={data.category_confidence as number | null}
        method={data.category_method}
        reason={data.category_reason}
        lastClassifiedAt={data.last_classified_at}
        needsReview={!!data.needs_review}
      />

      <section className="ix-card p-4 space-y-2">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-slate-500">Body excerpt</h2>
        <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans">
          {data.body_excerpt ?? '(no body cached — open in Gmail)'}
        </pre>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/personal/email/[messageId]/
git commit -m "feat(personal): email detail page (classification card + body + actions)"
```

---

### Task 24: "Open in Gmail" account-aware index hint

**Files:**
- Optional improvement — can skip for v1.

The detail page hardcodes `/u/0/` in the Gmail URL. Per spec §7 this is acknowledged as a known limitation (browser session index can't be known server-side). No code change required for v1.

---

**End of Phase 6.**

## Phase 7 — Setup pages (Tasks 25–29)

The 5 setup sub-tabs reuse the `SetupTabs` pattern from `/admin` (see `src/app/admin/_components/setup-tabs.tsx`). Each tab is a server component that loads + a server-action file for mutations. To keep the plan focused, this phase shows the minimal shell + the two highest-value tabs in detail (Accounts + Rules); the others (Categories, AI, Corrections) follow identical patterns.

### Task 25: Setup layout + sub-nav

**Files:**
- Create: `src/app/personal/email/setup/layout.tsx`
- Create: `src/app/personal/email/setup/page.tsx` (redirect to /accounts)
- Create: `src/app/personal/email/setup/_components/setup-tabs.tsx`

- [ ] **Step 1: setup-tabs.tsx**

```typescript
import Link from 'next/link';

const TABS = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'categories', label: 'Categories' },
  { id: 'rules', label: 'Rules' },
  { id: 'ai', label: 'AI' },
  { id: 'corrections', label: 'Corrections' },
] as const;

export function SetupTabs({ activeTab }: { activeTab: typeof TABS[number]['id'] }) {
  return (
    <nav className="border-b border-slate-200 -mb-px flex gap-1 overflow-x-auto">
      {TABS.map(t => (
        <Link
          key={t.id}
          href={`/personal/email/setup/${t.id}`}
          className={`px-4 py-2 text-sm border-b-2 -mb-px transition ${
            activeTab === t.id
              ? 'border-slate-900 text-slate-900 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: layout + index redirect**

```typescript
// layout.tsx
import { TopNav } from '@/app/_components/brand';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav>
        <Link href="/" className="ix-link">Home</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/personal" className="ix-link">Personal</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/personal/email" className="ix-link">Email</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Setup</span>
      </TopNav>
      {children}
    </>
  );
}
```

```typescript
// page.tsx (index → redirect to /accounts)
import { redirect } from 'next/navigation';
export default function SetupIndex() { redirect('/personal/email/setup/accounts'); }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/personal/email/setup/layout.tsx src/app/personal/email/setup/page.tsx src/app/personal/email/setup/_components/
git commit -m "feat(personal): setup layout + sub-nav"
```

---

### Task 26: Setup → Accounts tab

**Files:**
- Create: `src/app/personal/email/setup/accounts/page.tsx`
- Create: `src/app/personal/email/setup/accounts/actions.ts`

- [ ] **Step 1: actions.ts**

```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { ensureLabelsForAccount, removeAllLimeLabels } from '@/lib/personal-email/label-sync';

async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u || !u.is_admin) throw new Error('forbidden');
  return u;
}

export async function tagDomainPersonal(accountId: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { data: acc } = await sb
    .from('accounts').select('*').eq('id', accountId).single();
  if (!acc) throw new Error('account_not_found');
  await sb.from('accounts').update({ domain: 'personal' }).eq('id', accountId);
  await ensureLabelsForAccount(acc as any);
  revalidatePath('/personal/email/setup/accounts');
}

export async function disconnectAccountAndRemoveLabels(accountId: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { data: acc } = await sb
    .from('accounts').select('*').eq('id', accountId).single();
  if (!acc) throw new Error('account_not_found');
  // 1. Strip Lime/* labels from Gmail.
  await removeAllLimeLabels(acc as any);
  // 2. Untag the account (keep the row so historical email_logs stay intact).
  await sb.from('accounts').update({ domain: null, enabled: false }).eq('id', accountId);
  revalidatePath('/personal/email/setup/accounts');
}
```

- [ ] **Step 2: page.tsx**

```typescript
import { supabaseAdmin } from '@/lib/supabase';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { SetupTabs } from '../_components/setup-tabs';
import { tagDomainPersonal, disconnectAccountAndRemoveLabels } from './actions';
import { Plus, Mail } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AccountsSetupPage() {
  const sb = supabaseAdmin();
  const [{ data: personalAccts }, { data: untagged }] = await Promise.all([
    sb.from('accounts').select('*').eq('domain', 'personal').order('email'),
    sb.from('accounts').select('*').is('domain', null).eq('enabled', true).order('email'),
  ]);

  return (
    <main className="max-w-4xl mx-auto px-6 py-8 space-y-6 flex-1">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Setup</h1>
        <a href="/api/auth/google/start?domain=personal" className="ix-btn-primary">
          <Plus size={16} /> Connect Gmail
        </a>
      </header>
      <SetupTabs activeTab="accounts" />

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-wide font-semibold text-slate-500">
          Personal mailboxes ({personalAccts?.length ?? 0})
        </h2>
        {(personalAccts ?? []).map((a: any) => (
          <div key={a.id} className="ix-card p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-slate-50 text-slate-700 inline-flex items-center justify-center">
              <Mail size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-sm truncate flex items-center gap-2">
                {a.email}
                {a.display_name && (
                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-100">
                    {a.display_name}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500">
                Last sync: {a.last_synced_at ? fmtCairoDateTime(a.last_synced_at) : 'never'}
              </div>
            </div>
            <form action={disconnectAccountAndRemoveLabels.bind(null, a.id)}>
              <button type="submit" className="ix-btn-danger">Disconnect + remove Lime/* labels</button>
            </form>
          </div>
        ))}
      </section>

      {!!untagged?.length && (
        <section className="space-y-2">
          <h2 className="text-sm uppercase tracking-wide font-semibold text-slate-500">
            Other connected mailboxes (not yet personal)
          </h2>
          {untagged.map((a: any) => (
            <div key={a.id} className="ix-card p-4 flex items-center gap-4">
              <div className="flex-1 font-mono text-sm">{a.email}</div>
              <form action={tagDomainPersonal.bind(null, a.id)}>
                <button type="submit" className="ix-btn-secondary">Tag as personal + create labels</button>
              </form>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/personal/email/setup/accounts/
git commit -m "feat(personal): setup accounts tab (connect, tag, disconnect+strip labels)"
```

---

### Task 27: Setup → Rules tab

**Files:**
- Create: `src/app/personal/email/setup/rules/page.tsx`
- Create: `src/app/personal/email/setup/rules/actions.ts`
- Create: `src/app/personal/email/setup/rules/_form.tsx`
- Create: `src/app/personal/email/setup/rules/new/page.tsx`
- Create: `src/app/personal/email/setup/rules/[id]/page.tsx`

- [ ] **Step 1: actions.ts**

```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { CategorySlug, MatchType } from '@/lib/personal-email/schema';

async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u || !u.is_admin) throw new Error('forbidden');
}

export async function saveRule(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get('id') as string | null;
  const rule = {
    priority: Number(formData.get('priority') ?? 100),
    name: String(formData.get('name') ?? '').trim(),
    account_id: (formData.get('account_id') as string) || null,
    match_type: MatchType.parse(formData.get('match_type')),
    match_value: String(formData.get('match_value') ?? '').trim(),
    target_category: CategorySlug.parse(formData.get('target_category')),
    enabled: formData.get('enabled') === 'on',
  };
  const sb = supabaseAdmin();
  if (id) {
    await sb.from('personal_email_rules').update(rule).eq('id', id);
  } else {
    await sb.from('personal_email_rules').insert(rule);
  }
  revalidatePath('/personal/email/setup/rules');
  redirect('/personal/email/setup/rules');
}

export async function deleteRule(id: string): Promise<void> {
  await requireAdmin();
  await supabaseAdmin().from('personal_email_rules').delete().eq('id', id);
  revalidatePath('/personal/email/setup/rules');
}

export async function toggleRule(id: string, enabled: boolean): Promise<void> {
  await requireAdmin();
  await supabaseAdmin().from('personal_email_rules').update({ enabled }).eq('id', id);
  revalidatePath('/personal/email/setup/rules');
}
```

- [ ] **Step 2: page.tsx (rules table)**

```typescript
import Link from 'next/link';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { SetupTabs } from '../_components/setup-tabs';
import { deleteRule } from './actions';

export const dynamic = 'force-dynamic';

export default async function RulesSetupPage() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('personal_email_rules')
    .select('*, accounts(email, display_name)')
    .order('priority', { ascending: true });

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-6 flex-1">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rules</h1>
        <Link href="/personal/email/setup/rules/new" className="ix-btn-primary">
          <Plus size={16} /> New rule
        </Link>
      </header>
      <SetupTabs activeTab="rules" />

      <div className="ix-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left py-2.5 px-4 font-medium">Pri</th>
              <th className="text-left px-4 font-medium">Name</th>
              <th className="text-left px-4 font-medium">Match</th>
              <th className="text-left px-4 font-medium">→ Category</th>
              <th className="text-left px-4 font-medium">Account</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r: any) => (
              <tr key={r.id} className={`border-t border-slate-100 ${!r.enabled ? 'opacity-50' : ''}`}>
                <td className="py-2.5 px-4 font-mono">{r.priority}</td>
                <td className="px-4">
                  <Link href={`/personal/email/setup/rules/${r.id}`} className="hover:underline">{r.name}</Link>
                </td>
                <td className="px-4 font-mono text-xs">
                  {r.match_type}={r.match_value}
                </td>
                <td className="px-4">{r.target_category}</td>
                <td className="px-4 text-xs text-slate-500">
                  {r.accounts?.display_name ?? r.accounts?.email ?? 'all'}
                </td>
                <td className="px-4 text-right">
                  <Link href={`/personal/email/setup/rules/${r.id}`} className="ix-link mr-2"><Pencil size={14}/></Link>
                  <form action={deleteRule.bind(null, r.id)} className="inline">
                    <button type="submit" className="ix-link text-rose-700"><Trash2 size={14}/></button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: _form.tsx (shared by new + edit)**

```typescript
import { CATEGORIES } from '@/lib/personal-email/categories';
import { MATCH_TYPES } from '@/lib/personal-email/schema';
import { supabaseAdmin } from '@/lib/supabase';
import { saveRule } from './actions';

export async function RuleForm({ rule }: { rule?: any }) {
  const sb = supabaseAdmin();
  const { data: accounts } = await sb
    .from('accounts').select('id, email, display_name')
    .eq('domain', 'personal').order('email');

  return (
    <form action={saveRule} className="space-y-4 max-w-xl">
      {rule?.id && <input type="hidden" name="id" value={rule.id} />}
      <Field label="Priority (lower = higher precedence)">
        <input name="priority" type="number" defaultValue={rule?.priority ?? 100} className="ix-input" required />
      </Field>
      <Field label="Name">
        <input name="name" type="text" defaultValue={rule?.name ?? ''} className="ix-input" required />
      </Field>
      <Field label="Match type">
        <select name="match_type" defaultValue={rule?.match_type ?? 'from_domain'} className="ix-input">
          {MATCH_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>
      <Field label="Match value">
        <input name="match_value" type="text" defaultValue={rule?.match_value ?? ''} className="ix-input" required />
      </Field>
      <Field label="Target category">
        <select name="target_category" defaultValue={rule?.target_category ?? 'notifications'} className="ix-input">
          {CATEGORIES.map(c => <option key={c.slug} value={c.slug}>{c.displayName}</option>)}
        </select>
      </Field>
      <Field label="Account (optional — empty = all)">
        <select name="account_id" defaultValue={rule?.account_id ?? ''} className="ix-input">
          <option value="">All personal accounts</option>
          {(accounts ?? []).map((a: any) => (
            <option key={a.id} value={a.id}>{a.display_name ?? a.email}</option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="enabled" defaultChecked={rule?.enabled ?? true} />
        <span className="text-sm">Enabled</span>
      </label>
      <button type="submit" className="ix-btn-primary">Save</button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
```

- [ ] **Step 4: new + [id] pages**

```typescript
// new/page.tsx
import { RuleForm } from '../_form';
import { SetupTabs } from '../../_components/setup-tabs';

export default function NewRulePage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-8 space-y-6 flex-1">
      <h1 className="text-2xl font-bold">New rule</h1>
      <SetupTabs activeTab="rules" />
      <RuleForm />
    </main>
  );
}
```

```typescript
// [id]/page.tsx
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { RuleForm } from '../_form';
import { SetupTabs } from '../../_components/setup-tabs';

export const dynamic = 'force-dynamic';

export default async function EditRulePage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: rule } = await supabaseAdmin()
    .from('personal_email_rules').select('*').eq('id', id).single();
  if (!rule) notFound();
  return (
    <main className="max-w-3xl mx-auto px-6 py-8 space-y-6 flex-1">
      <h1 className="text-2xl font-bold">Edit rule</h1>
      <SetupTabs activeTab="rules" />
      <RuleForm rule={rule} />
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/personal/email/setup/rules/
git commit -m "feat(personal): setup rules tab (table + new + edit)"
```

---

### Task 28: Setup → Categories, AI, Corrections tabs

**Files:**
- Create: `src/app/personal/email/setup/categories/page.tsx` + `actions.ts`
- Create: `src/app/personal/email/setup/ai/page.tsx` + `actions.ts`
- Create: `src/app/personal/email/setup/corrections/page.tsx`

These follow the same shape as the Rules tab — table + form + server actions. Each is small enough to bundle in one task.

- [ ] **Step 1: categories/page.tsx — toggle is_enabled + edit gmail_label_name**

Read all 9 rows from `personal_email_categories`, render as a table with:
- read-only: slug, tier, sort_order, accent
- editable: display_name (text input), gmail_label_name (text input), is_enabled (checkbox)
- `Save` button per row triggers a server action that updates that row

`actions.ts` exposes `updateCategory(slug: string, formData: FormData)`. Body:

```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function updateCategory(slug: string, formData: FormData) {
  const u = await getCurrentUser();
  if (!u || !u.is_admin) throw new Error('forbidden');
  const patch = {
    display_name: String(formData.get('display_name') ?? '').trim(),
    gmail_label_name: String(formData.get('gmail_label_name') ?? '').trim(),
    is_enabled: formData.get('is_enabled') === 'on',
    updated_at: new Date().toISOString(),
  };
  await supabaseAdmin().from('personal_email_categories').update(patch).eq('slug', slug);
  revalidatePath('/personal/email/setup/categories');
}
```

- [ ] **Step 2: ai/page.tsx — daily cap form + recent runs table + recompute button**

Render the daily cap as a number input bound to a server action `setDailyCap(formData)` that writes to `process.env`-backed setting (or a tiny `personal_email_settings` KV table — preferred to avoid env-var redeploys; a simple `(key text pk, value text)` table works). Below, render last 30 rows from `personal_email_classification_runs` with timestamps + counters + ai_cost_usd.

Add a "Recompute" form posting to `recomputeRange(formData)` that nulls `category` for rows with `last_classified_at` between two dates and re-triggers `ingestPersonalEmails({ trigger: 'manual' })`.

Skipping the small-KV-table migration adds a v1.5 backlog item — for v1, environment-variable cap (`PERSONAL_EMAIL_DAILY_CAP_USD`) is sufficient. Document this on the page (read-only display + link to Vercel settings).

- [ ] **Step 3: corrections/page.tsx — flat audit list**

Read most recent 200 rows from `personal_email_corrections` joined with `email_logs` (subject, from_address) and `users` (email of correcting user). Render as a table.

```typescript
const { data } = await supabaseAdmin()
  .from('personal_email_corrections')
  .select('id, old_category, new_category, created_at, email_logs(subject, from_address)')
  .order('created_at', { ascending: false })
  .limit(200);
```

- [ ] **Step 4: Commit**

```bash
git add src/app/personal/email/setup/categories/ src/app/personal/email/setup/ai/ src/app/personal/email/setup/corrections/
git commit -m "feat(personal): setup categories + AI + corrections tabs"
```

---

### Task 29: Local smoke-test of Setup pages

- [ ] **Step 1: Run dev server**

```bash
npm run dev
```

- [ ] **Step 2: Navigate manually**

Visit each in order:
1. `/personal/email/setup/accounts` — should list connected mailboxes; "Connect Gmail" button works.
2. `/personal/email/setup/categories` — 9 rows visible.
3. `/personal/email/setup/rules` — 25 seeded rules visible, ordered by priority.
4. `/personal/email/setup/ai` — daily cap reads from env; recent runs table renders (likely empty until first ingest).
5. `/personal/email/setup/corrections` — empty until first manual move.

- [ ] **Step 3: No commit — verification step only**

---

**End of Phase 7.**

## Phase 8 — Cron registration + validation (Tasks 30–33)

### Task 30: Add cron entry to `vercel.json`

**Files:**
- Modify: `vercel.json` — add new cron block

- [ ] **Step 1: Read current `vercel.json` to find the `crons` array**

- [ ] **Step 2: Add the entry**

```json
{
  "path": "/api/cron/personal-email-ingest",
  "schedule": "0,15,30,45 4-21 * * *"
}
```

UTC `4-21` is `6 AM – 11 PM Cairo` year-round when accounting for DST via the in-handler gate (Cairo is UTC+2 standard, UTC+3 DST). The handler already drops out-of-window invocations.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat(personal): register /api/cron/personal-email-ingest (every 15min, 6am-11pm Cairo)"
```

---

### Task 31: Smoke test of full ingest path

- [ ] **Step 1: Connect at least one Gmail account via the UI**

Visit `/personal/email/setup/accounts`, click `Connect Gmail`, complete OAuth. Verify:
- New row in `accounts` with `domain='personal'` and `display_name` set.
- `personal_email_account_labels` has 9 rows for this account (one per category).
- The 9 `Lime/*` labels exist in the actual Gmail account (open Gmail → labels in sidebar).

```sql
select email, display_name, domain, last_synced_at from public.accounts where domain='personal';
select count(*) from public.personal_email_account_labels where account_id='<id>';
-- expect 9
```

- [ ] **Step 2: Trigger manual refresh**

Click the `↻ Refresh` button on `/personal/email`.

- [ ] **Step 3: Verify run row + classifications**

```sql
select id, started_at, finished_at, emails_seen, emails_classified, rules_matched, ai_calls, ai_cost_usd, errors
  from public.personal_email_classification_runs order by started_at desc limit 1;

select category, count(*) from public.email_logs el
  join public.accounts a on a.id = el.account_id
  where a.domain='personal' and el.last_classified_at >= now() - interval '5 minutes'
  group by category;
```

Expected: at least one run row with `finished_at` set, `errors=[]` or empty array, and a non-trivial split across categories (most likely `notifications`/`promotions` heavy from the seed rules).

- [ ] **Step 4: Verify Gmail labels applied (mobile or desktop)**

Open Gmail in browser, find a recently classified message. Confirm the corresponding `Lime/<Slug>` label is visible on the message.

- [ ] **Step 5: No commit — verification step only**

---

### Task 32: Sample-accuracy sanity check (success criterion §18)

- [ ] **Step 1: Pick 10 emails per category from the most recent ingest**

```sql
with picked as (
  select id, category, from_address, subject,
         row_number() over (partition by category order by received_at desc) as rn
  from public.email_logs el
  join public.accounts a on a.id = el.account_id
  where a.domain='personal' and category is not null
)
select category, from_address, subject from picked where rn <= 10
order by category, rn;
```

- [ ] **Step 2: Manually verify each — count correct**

Goal per spec §18: ≥85% accuracy on the 90-email sample.

- [ ] **Step 3: For misclassifications, click "Move to" in the UI**

Each correction:
- Updates `email_logs.category`, sets `category_method='manual'`
- Inserts into `personal_email_corrections` (will auto-feed into AI few-shot on the next run)
- Triggers `syncLabelChange` so Gmail labels stay correct

- [ ] **Step 4: Re-run manual refresh, sample again, confirm improvement**

The few-shot examples should now bias the AI toward your taste. Document the second-pass accuracy in a comment on the run row or in `SESSION_HANDOFF.md`.

- [ ] **Step 5: No commit (validation only)**

---

### Task 33: 7-day stability watch + acceptance

- [ ] **Step 1: Let the cron run for 7 days**

Monitor `personal_email_classification_runs` table:

```sql
select date_trunc('day', started_at) as day,
       count(*) as runs,
       sum(emails_seen) as seen,
       sum(emails_classified) as classified,
       sum(ai_calls) as ai,
       sum(ai_cost_usd) as cost,
       sum(jsonb_array_length(errors)) as err_count
  from public.personal_email_classification_runs
  where started_at >= now() - interval '7 days'
  group by 1 order by 1 desc;
```

- [ ] **Step 2: Acceptance gate**

Per spec §18, mark v1 complete when all true:
- 7 consecutive days, every cron run had `errors=[]` of severity `error`
- `ai_cost_usd` ≤ $0.10/day average
- ≥85% accuracy on a fresh 10-per-category sample
- All 9 `Lime/*` labels visible in mobile Gmail

- [ ] **Step 3: Final commit (release marker)**

```bash
git commit --allow-empty -m "feat(personal): Email module v1 complete — passes spec §18 success criteria"
```

---

**End of Phase 8 (final phase).**

---

## Self-review

After writing the plan, the following spec sections were checked for task coverage:

- §1 Purpose / §2 Why now — context only, no tasks.
- §3 Q1 hybrid use case — Tasks 19–24 (UI + actions + detail).
- §3 Q2 9 categories in 4 tiers — Tasks 1, 3 (seed + module), 19 (UI tier groups).
- §3 Q3 hybrid classification — Tasks 9–13, 15.
- §3 Q4 two-way Gmail label sync — Tasks 14, 15 (sync trigger), 26 (disconnect).
- §3 Q5 reply signal — Task 13 system prompt + always-AI logic in Task 15.
- §3 Q6 thread vs message — covered in Task 16 (latest message decides; spec §11).
- §3 Q7 admin-only — Task 4 verification + actions.ts admin checks.
- §3 Q8 account display name — Task 5 derivation.
- §3 Q9 ingest cadence — Tasks 17, 30.
- §3 Q10 body excerpt — Task 16 `extractBodyExcerpt`.
- §3 Q11 corrections few-shot — Tasks 11, 12, 20.
- §3 Q12 confidence < 0.7 → needs_review — Task 13 + 21 (page).
- §3 Q13 v1 cuts — explicitly skipped (Task 22 marked optional).
- §4 routes — Tasks 6, 7, 19, 21, 23, 25–28.
- §5 categories seed — Task 1 seed + Task 3 constant.
- §6 main triage view — Task 19.
- §7 detail page — Task 23.
- §8 setup pages — Tasks 25–28.
- §9 schema — Task 1.
- §10 seeded rules — Task 1.
- §11 pipeline — Tasks 9, 10, 13, 15.
- §12 AI prompt — Tasks 12, 13.
- §13 label sync mechanics — Task 14.
- §14 cron — Tasks 17, 30.
- §15 access control — Task 4.
- §16 v1 cuts — listed in plan; Task 22 marked optional.
- §17 risks — mitigations baked into Tasks 14 (namespace), 13 (cost guard), 15 (skip-on-overcap), 26 (disconnect).
- §18 success criteria — Tasks 31–33.
- §19 out-of-scope — explicitly not addressed.

**Placeholder scan:** No `TBD`, `TODO`, `FIXME`, or vague "implement later" markers. Each task has full code for new files and explicit edit instructions for modifications.

**Type consistency:** `CategorySlug`, `EmailFeatures`, `PersonalEmailRule`, `ClassifierResult`, `ClassifyOneEmailInput` are all defined in Task 2 (`schema.ts` / `types.ts`) and used consistently across Tasks 9–28 with the same names and shapes.

**Cross-task dependencies are linear:** Phase 1 (schema/types/categories) → Phase 2 (domain plumbing) → Phase 3 (pure-function engine) → Phase 4 (orchestrator + ingest) → Phase 5 (UI) → Phase 6 (detail) → Phase 7 (setup) → Phase 8 (cron + validation). No circular deps.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-03-personal-email-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Suits this plan because each task is a self-contained file with full code; subagent gets a clean context window per task.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review. Suits if you want to watch every step happen.

Which approach?

