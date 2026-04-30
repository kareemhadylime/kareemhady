-- Beithady · Generate Report module · saved reports + run history + schedules.
-- Phase: BA self-serve report builder under Analytics. Replicates the manually-
-- built Excel/PDF reports (BH-yearly pivot, BH-73 BCG matrix, One K per-listing
-- breakdown) as live, parameterized, printable dashboards.

create table if not exists public.beithady_saved_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  config jsonb not null,            -- ReportConfig: periods, groupBy, metrics, filters, comparison, viz
  commentary jsonb,                 -- {bullets:[], notes, action_items:[]}
  template_key text,                -- 'bh_yearly' | 'bcg_2wk' | 'per_listing' | 'building_h2h' | 'channel_mix' | 'pricing_vs_market' | null
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_run_at timestamptz,
  last_run_data jsonb               -- cached ReportData (most recent build)
);
create index if not exists idx_brsr_created on public.beithady_saved_reports(created_at desc);
create index if not exists idx_brsr_template on public.beithady_saved_reports(template_key) where template_key is not null;

create table if not exists public.beithady_report_runs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.beithady_saved_reports(id) on delete cascade,
  triggered_by text not null,       -- 'manual' | 'preview' | 'schedule:<id>'
  data jsonb not null,
  duration_ms int,
  ran_at timestamptz not null default now(),
  ran_by uuid references auth.users(id) on delete set null
);
create index if not exists idx_brruns_report on public.beithady_report_runs(report_id, ran_at desc);

create table if not exists public.beithady_report_schedules (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.beithady_saved_reports(id) on delete cascade,
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  day_of_week int check (day_of_week between 0 and 6),
  day_of_month int check (day_of_month between 1 and 28),
  hour_cairo int not null check (hour_cairo between 0 and 23),
  email_recipients text[] not null default '{}',
  wa_channel_ids text[] not null default '{}',
  enabled boolean not null default true,
  last_fired_at timestamptz,
  next_fire_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_brsched_next on public.beithady_report_schedules(next_fire_at) where enabled;
