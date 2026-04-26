-- Beithady Daily Performance Report module.
--
-- 09:00 Cairo daily delivery to admin-managed WhatsApp numbers + email
-- recipients. WhatsApp gets a tokenized HTML link (48-hr expiry). Email
-- gets the link plus an A4 PDF attachment.
--
-- Retry-until-success contract: snapshot is upserted once per day per
-- (report_kind, report_date). The cron tick (every 30 min from 09:00
-- Cairo onward) is idempotent — it skips already-delivered recipients
-- and only retries failed ones, until `delivery_complete` is true.
-- A separate hourly cleanup cron clears `pdf_bytes` and `payload` after
-- the snapshot expires (48 hr from generation).

-- ---------- Recipients (admin-managed in /emails/beithady/setup) ----------
create table if not exists public.report_recipients (
  id uuid primary key default gen_random_uuid(),
  report_kind text not null default 'beithady_daily',
  channel text not null check (channel in ('whatsapp','email')),
  destination text not null,            -- E.164 phone WITH or WITHOUT '+', or email addr; normalized at send time
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null
);
create index if not exists idx_report_recipients_kind_active
  on public.report_recipients (report_kind, active);
-- One row per (kind, channel, normalized destination). Lower-case email + digits-only phone.
create unique index if not exists uq_report_recipients
  on public.report_recipients (
    report_kind,
    channel,
    lower(regexp_replace(destination, '[^0-9a-z@.+_-]', '', 'gi'))
  );

-- ---------- Daily snapshots (one per day, retry-aware) ----------
create table if not exists public.daily_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  report_kind text not null,
  report_date date not null,            -- Cairo wall date the report covers
  token text not null unique,           -- 32-char base64url, used in /reports/[token]
  payload jsonb,                        -- structured metrics (drives both HTML + PDF render); null until built
  pdf_bytes bytea,                      -- A4 PDF; null until built; cleared after 48 hr
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null,      -- generated_at + 48 hours
  deleted_at timestamptz,               -- soft-delete after expiry cleanup
  trigger text not null default 'cron', -- 'cron' | 'manual_test' | 'force'
  delivery_complete boolean not null default false, -- short-circuit further retries
  build_attempts int not null default 0,
  last_build_error text,
  last_attempted_at timestamptz,
  unique (report_kind, report_date)
);
create index if not exists idx_dr_snapshots_kind_date
  on public.daily_report_snapshots (report_kind, report_date desc);
create index if not exists idx_dr_snapshots_expires
  on public.daily_report_snapshots (expires_at)
  where deleted_at is null;
create index if not exists idx_dr_snapshots_pending
  on public.daily_report_snapshots (report_kind, delivery_complete, report_date)
  where delivery_complete = false;

-- ---------- Per-recipient delivery log ----------
create table if not exists public.daily_report_deliveries (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.daily_report_snapshots(id) on delete cascade,
  recipient_id uuid references public.report_recipients(id) on delete set null,
  channel text not null check (channel in ('whatsapp','email')),
  destination text not null,
  status text not null check (status in ('sent','failed','skipped')),
  provider_message_id text,
  error text,
  attempt int not null default 1,
  sent_at timestamptz not null default now()
);
create index if not exists idx_dr_deliveries_snapshot
  on public.daily_report_deliveries (snapshot_id);
-- Used to skip-if-sent on retry. Only successful sends count for short-circuit.
create unique index if not exists uq_dr_deliveries_sent
  on public.daily_report_deliveries (snapshot_id, channel, lower(destination))
  where status = 'sent';

-- ---------- FX rate cache (one row per currency per day) ----------
create table if not exists public.fx_rates (
  rate_date date not null,
  base text not null default 'USD',
  quote text not null,                  -- e.g. 'EGP', 'AED'
  rate numeric(14,6) not null,          -- multiplier: 1 USD = rate quote
  source text not null,                 -- 'aed_peg' | 'exchangerate.host' | 'manual'
  fetched_at timestamptz not null default now(),
  primary key (rate_date, base, quote)
);
