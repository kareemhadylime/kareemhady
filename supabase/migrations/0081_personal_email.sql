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

-- 9. Seed 25 heuristic rules (account_id null = applies to all) ------------
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
