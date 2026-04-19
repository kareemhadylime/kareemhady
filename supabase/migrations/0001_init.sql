-- InboxOps initial schema (single-tenant for Phase 1)
create extension if not exists "pgcrypto";

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  provider text not null default 'gmail',
  oauth_refresh_token_encrypted text not null,
  oauth_access_token_encrypted text,
  access_token_expires_at timestamptz,
  last_synced_at timestamptz,
  last_history_id text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null default 'manual',
  status text not null default 'running',
  emails_fetched int not null default 0,
  rules_triggered int not null default 0,
  error text
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.runs(id) on delete set null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  gmail_message_id text not null,
  gmail_thread_id text,
  from_address text,
  to_address text,
  subject text,
  received_at timestamptz,
  snippet text,
  label_ids text[],
  has_attachment boolean default false,
  ai_summary text,
  actions_taken jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, gmail_message_id)
);

create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_id uuid references public.accounts(id) on delete cascade,
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  priority int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_logs_received_at on public.email_logs (received_at desc);
create index if not exists idx_email_logs_account on public.email_logs (account_id);
create index if not exists idx_runs_started_at on public.runs (started_at desc);
