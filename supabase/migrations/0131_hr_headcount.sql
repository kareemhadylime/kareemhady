-- supabase/migrations/0131_hr_headcount.sql
-- Beithady HR Sprint 7 — Headcount Report

create table public.hr_headcount_snapshots (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  building_code text not null,
  department    text not null,
  count         int  not null default 0,
  recorded_at   timestamptz not null default now(),
  constraint uq_hr_hc_snapshot unique (date, building_code, department)
);

create index idx_hr_hc_snap_date     on public.hr_headcount_snapshots(date desc);
create index idx_hr_hc_snap_building on public.hr_headcount_snapshots(building_code);
