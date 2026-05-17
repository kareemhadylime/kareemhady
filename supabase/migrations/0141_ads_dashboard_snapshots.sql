-- supabase/migrations/0141_ads_dashboard_snapshots.sql
-- BH Ads V4 — public read-only dashboard snapshots reachable via /r/beithady/ads/<token>.
-- Mirrors daily_report_snapshots schema. Auto-expires 48h after generation.
-- Hourly cleanup cron (beithady-daily-report-cleanup) zeroes payload + sets deleted_at.

create extension if not exists pgcrypto;

create table public.ads_dashboard_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  token                 text unique not null,
  payload               jsonb,
  generated_at          timestamptz not null default now(),
  generated_by_user_id  uuid references public.accounts(id) on delete set null,
  expires_at            timestamptz not null,
  deleted_at            timestamptz
);

create index ads_dashboard_snapshots_expires_idx
  on public.ads_dashboard_snapshots (expires_at)
  where deleted_at is null;

create index ads_dashboard_snapshots_user_recent_idx
  on public.ads_dashboard_snapshots (generated_by_user_id, generated_at desc)
  where deleted_at is null;

comment on table public.ads_dashboard_snapshots is
  'BH Ads V4 — public read-only dashboard snapshots reachable via /r/beithady/ads/<token>. Auto-expires 48h after generation.';
