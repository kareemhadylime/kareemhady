-- Phase: FM+ Project Budget v2 (big-bang migration)
-- Drops v1's 7 tables, creates v2's 10 tables.
-- See docs/superpowers/specs/2026-05-04-fmplus-project-budget-v2-design.md
-- service_line:    'hk' | 'mep' | 'landscape' | 'security' | 'pest_ctrl' | 'waste_mgmt' | 'back_office'
-- year_tracking:   'contract' | 'fiscal'
-- scenario:        'initial' | 'revised' | 'reforecast'
-- status:          'draft' | 'published'
-- mob amort:       'straight_line' | 'flat'
-- catalog_unit:    'each' | 'monthly' | 'annual' | 'per_head' | 'liter' | 'kg' | 'm2' | 'pct_revenue'

-- 1. DROP v1 tables (dependency order)
drop table if exists public.budget_audit         cascade;
drop table if exists public.budget_revenue_lines cascade;
drop table if exists public.budget_lines         cascade;
drop table if exists public.project_budget_segments cascade;
drop table if exists public.project_budgets     cascade;
drop table if exists public.budget_settings     cascade;
drop table if exists public.budget_templates    cascade;

-- 2. CREATE v2 tables
create table public.project_contracts (
  id              bigserial primary key,
  project_id      bigint not null references public.odoo_analytic_accounts(id),
  name            text not null,
  customer        text,
  start_date      date not null,
  end_date        date not null,
  duration_months int  generated always as
                    (((extract(year from end_date) - extract(year from start_date)) * 12 +
                      (extract(month from end_date) - extract(month from start_date)))::int) stored,
  contract_value  numeric(16,2) not null default 0,
  vat_pct         numeric(5,2)  not null default 14,
  year_tracking   text not null default 'contract'
                    check (year_tracking in ('contract','fiscal')),
  reimbursables   jsonb not null default '[]'::jsonb,
  zones           jsonb not null default '[]'::jsonb,
  notes           text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, name)
);
create index if not exists ix_project_contracts_project_id on public.project_contracts (project_id);

create table public.project_services (
  id              bigserial primary key,
  contract_id     bigint not null references public.project_contracts(id) on delete cascade,
  service_line    text not null check (service_line in
                    ('hk','mep','landscape','security','pest_ctrl','waste_mgmt','back_office')),
  template_version int not null,
  unique (contract_id, service_line)
);

create table public.project_years (
  id              bigserial primary key,
  contract_id     bigint not null references public.project_contracts(id) on delete cascade,
  year_index      int  not null check (year_index >= 1),
  fiscal_year     int,
  start_month     int  not null check (start_month between 1 and 12),
  scenario        text not null default 'initial'
                    check (scenario in ('initial','revised','reforecast')),
  status          text not null default 'draft'
                    check (status in ('draft','published')),
  published_at    timestamptz,
  published_by    uuid references auth.users(id),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (contract_id, year_index, scenario)
);
create index if not exists ix_project_years_contract on public.project_years (contract_id);

create table public.project_year_services (
  id              bigserial primary key,
  year_id         bigint not null references public.project_years(id) on delete cascade,
  service_line    text not null,
  monthly_revenue numeric(14,2) not null default 0,
  vat_pct         numeric(5,2)  not null default 14,
  manpower_ramp   jsonb not null default '{}'::jsonb,
  unique (year_id, service_line)
);

create table public.fmplus_catalog (
  id              bigserial primary key,
  code            text unique not null,
  name_en         text not null,
  name_ar         text,
  unit            text not null check (unit in
                    ('each','monthly','annual','per_head','liter','kg','m2','pct_revenue')),
  default_price   numeric(14,4) not null,
  service_lines   text[] not null default '{}',
  category        text not null,
  tags            text[] not null default '{}',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists ix_fmplus_catalog_tags on public.fmplus_catalog using gin (tags);
create index if not exists ix_fmplus_catalog_services on public.fmplus_catalog using gin (service_lines);

create table public.project_catalog_overrides (
  id              bigserial primary key,
  contract_id     bigint not null references public.project_contracts(id) on delete cascade,
  catalog_item_id bigint not null references public.fmplus_catalog(id) on delete cascade,
  unit_cost       numeric(14,2),
  notes           text,
  unique (contract_id, catalog_item_id)
);

create table public.budget_lines (
  id              bigserial primary key,
  year_id         bigint not null references public.project_years(id) on delete cascade,
  service_line    text not null,
  category        text not null,
  line_code       text not null,
  catalog_item_id bigint references public.fmplus_catalog(id),
  label_en        text not null,
  label_ar        text,
  season          text not null default 'high'
                    check (season in ('high','low')),
  qty             numeric(12,4) not null default 0,
  unit_cost       numeric(14,4) not null default 0,
  monthly_cost    numeric(16,4) generated always as (qty * unit_cost) stored,
  ctc_net         numeric(14,2),
  ctc_relievers   numeric(14,2),
  ctc_ot          numeric(14,2),
  ctc_training    numeric(14,2),
  ctc_insurance   numeric(14,2),
  ctc_medical     numeric(14,2),
  threshold_green numeric(5,2),
  threshold_amber numeric(5,2),
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists ix_budget_lines_year_service_cat on public.budget_lines (year_id, service_line, category);
create index if not exists ix_budget_lines_catalog on public.budget_lines (catalog_item_id);

create table public.mobilization_lines (
  id              bigserial primary key,
  contract_id     bigint not null references public.project_contracts(id) on delete cascade,
  category        text not null,
  label_en        text not null,
  label_ar        text,
  qty             numeric(12,4) not null default 1,
  unit_cost       numeric(14,2) not null default 0,
  total_cost      numeric(16,2) generated always as (qty * unit_cost) stored,
  amortization    text not null default 'straight_line'
                    check (amortization in ('straight_line','flat')),
  amortization_months int not null default 24,
  notes           text
);
create index if not exists ix_mobilization_lines_contract on public.mobilization_lines (contract_id);

create table public.budget_audit (
  id              bigserial primary key,
  year_id         bigint not null references public.project_years(id) on delete cascade,
  changed_at      timestamptz not null default now(),
  changed_by      uuid references auth.users(id),
  diff_json       jsonb not null
);

create table public.budget_settings (
  id              int primary key default 1,
  green_pct       numeric(5,2) not null default 5,
  amber_pct       numeric(5,2) not null default 15,
  default_scenario text not null default 'initial',
  default_inflation_revenue   numeric(5,2) not null default 7.0,
  default_inflation_manpower  numeric(5,2) not null default 10.0,
  default_inflation_other     numeric(5,2) not null default 5.0,
  default_mob_amortization_months int not null default 24,
  bilingual_default text not null default 'en' check (bilingual_default in ('en','ar')),
  updated_at      timestamptz not null default now()
);
insert into public.budget_settings (id) values (1) on conflict do nothing;

-- 3. Touch triggers on updated_at
create or replace function public.touch_updated_at() returns trigger as $$
  begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_touch_project_contracts on public.project_contracts;
create trigger trg_touch_project_contracts before update on public.project_contracts
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_project_years on public.project_years;
create trigger trg_touch_project_years before update on public.project_years
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_fmplus_catalog on public.fmplus_catalog;
create trigger trg_touch_fmplus_catalog before update on public.fmplus_catalog
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_budget_settings on public.budget_settings;
create trigger trg_touch_budget_settings before update on public.budget_settings
  for each row execute function public.touch_updated_at();
