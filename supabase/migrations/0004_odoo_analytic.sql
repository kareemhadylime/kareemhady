-- Phase 7.6: analytic plans + accounts for building / LOB segregation.
-- Odoo 17+ uses account.analytic.plan as parent containers; each plan has
-- account.analytic.account children. Beithady uses at least two plans:
-- "Leased" (arbitrage buildings BH-26/73/34/OKAT) and "Management" (BH-435).
-- Lines reference analytic accounts via account.move.line.analytic_distribution
-- which is a jsonb map of {account_id_or_comma_list: percentage}. When keys
-- contain commas, they denote simultaneous allocation to multiple plans
-- (e.g. "538,537" means this line hits both account 538 and 537, one per plan).

create table if not exists public.odoo_analytic_plans (
  id bigint primary key,
  name text not null,
  parent_plan_id bigint,
  company_ids bigint[] not null default '{}'::bigint[],
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.odoo_analytic_accounts (
  id bigint primary key,
  name text not null,
  code text,
  plan_id bigint references public.odoo_analytic_plans(id) on delete set null,
  root_plan_id bigint references public.odoo_analytic_plans(id) on delete set null,
  company_ids bigint[] not null default '{}'::bigint[],
  active boolean not null default true,
  -- Classification derived at sync time from name patterns:
  building_code text,        -- e.g. 'BH-26', 'BH-73', 'BH-435'
  lob_label text,            -- 'Arbitrage' | 'Management' | null
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_odoo_analytic_accounts_plan on public.odoo_analytic_accounts (plan_id);
create index if not exists idx_odoo_analytic_accounts_building on public.odoo_analytic_accounts (building_code) where building_code is not null;
create index if not exists idx_odoo_analytic_accounts_lob on public.odoo_analytic_accounts (lob_label) where lob_label is not null;

-- Flattened link table so queries can efficiently filter move_lines by a
-- single analytic account id without parsing the jsonb distribution.
-- Populated by the sync worker after each move-lines phase.
create table if not exists public.odoo_move_line_analytics (
  move_line_id bigint not null references public.odoo_move_lines(id) on delete cascade,
  analytic_account_id bigint not null,
  percentage numeric(6,2) not null default 100,
  primary key (move_line_id, analytic_account_id)
);
create index if not exists idx_odoo_ml_analytics_acct on public.odoo_move_line_analytics (analytic_account_id);

alter table public.odoo_sync_runs
  add column if not exists analytic_accounts_synced int not null default 0,
  add column if not exists analytic_plans_synced int not null default 0,
  add column if not exists analytic_links_synced int not null default 0;
