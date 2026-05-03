-- Phase: FM+ Project Budget v1
-- Adds 7 tables for FMPLUS project-budget vs Odoo-actuals variance.
-- See docs/superpowers/specs/2026-05-03-fmplus-project-budget-design.md
-- Service lines: hk | mep | landscape | security | pest_ctrl | waste_mgmt
-- Scenarios:     initial | revised | reforecast
-- Statuses:      draft | published
-- Seasons:       high | low

create table public.budget_templates (
  id              bigserial primary key,
  service_line    text not null check (service_line in
                    ('hk','mep','landscape','security','pest_ctrl','waste_mgmt')),
  version         int  not null,
  is_stub         boolean not null default false,
  schema_json     jsonb not null,
  account_map_json jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  unique (service_line, version)
);

create table public.project_budgets (
  id              bigserial primary key,
  project_id      bigint not null references public.odoo_analytic_accounts(id),
  fiscal_year     int  not null,
  scenario        text not null check (scenario in ('initial','revised','reforecast')),
  status          text not null default 'draft' check (status in ('draft','published')),
  start_month     int  not null default 1   check (start_month between 1 and 12),
  notes           text,
  created_by      uuid,
  published_at    timestamptz,
  published_by    uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, fiscal_year, scenario)
);
create index on public.project_budgets (fiscal_year, scenario);
create index on public.project_budgets (project_id);

create table public.project_budget_segments (
  id              bigserial primary key,
  budget_id       bigint not null references public.project_budgets(id) on delete cascade,
  service_line    text not null check (service_line in
                    ('hk','mep','landscape','security','pest_ctrl','waste_mgmt')),
  template_version int not null,
  unique (budget_id, service_line)
);

create table public.budget_lines (
  id              bigserial primary key,
  segment_id      bigint not null references public.project_budget_segments(id) on delete cascade,
  sub_location    text,
  category        text not null,
  line_code       text not null,
  season          text not null check (season in ('high','low')),
  qty             numeric(12,4) not null default 0,
  unit_cost       numeric(14,2) not null default 0,
  monthly_cost    numeric(14,2) generated always as (qty * unit_cost) stored,
  notes           text,
  created_at      timestamptz not null default now()
);
create index on public.budget_lines (segment_id, category);
create index on public.budget_lines (segment_id, sub_location, season);

create table public.budget_revenue_lines (
  id              bigserial primary key,
  segment_id      bigint not null references public.project_budget_segments(id) on delete cascade,
  sub_location    text,
  season          text not null check (season in ('high','low')),
  monthly_revenue numeric(14,2) not null default 0,
  vat_pct         numeric(5,2) not null default 14
);

create table public.budget_audit (
  id              bigserial primary key,
  budget_id       bigint not null references public.project_budgets(id) on delete cascade,
  changed_at      timestamptz not null default now(),
  changed_by      uuid,
  diff_json       jsonb not null
);

create table public.budget_settings (
  id              int primary key default 1,
  green_pct       numeric(5,2) not null default 5,
  amber_pct       numeric(5,2) not null default 15,
  default_scenario text not null default 'initial',
  updated_at      timestamptz not null default now()
);
insert into public.budget_settings (id) values (1) on conflict do nothing;

-- Seed HK template v1 (full) + 5 stub templates
insert into public.budget_templates (service_line, version, is_stub, schema_json, account_map_json) values
('hk', 1, false,
 '{
   "sub_locations_enabled": true,
   "default_sub_locations": ["NC Inner Campus","Outer Campus","NC Off-Campus Housing","Maadi Buildings"],
   "season_months": {"high":[9,10,11,12,1,2,3,4],"low":[5,6,7,8]},
   "vat_pct": 14,
   "categories": [
     {"code":"manning","label":"Manning","calc":"qty_x_unitcost","lines":[
       {"code":"hk_manager","label":"HK Manager"},
       {"code":"asst_manager","label":"Assistant Manager"},
       {"code":"sr_supervisor","label":"Senior Supervisor"},
       {"code":"sup_8h","label":"Supervisor 8H"},
       {"code":"hk_mf_8h","label":"HK Male & Female 8H"},
       {"code":"facades_sup","label":"Facades Supervisor 8H"},
       {"code":"facades_lab","label":"Facades Labor 8H"},
       {"code":"waste_sup","label":"Waste Supervisor 8H"},
       {"code":"waste_lab","label":"Waste Labor 8H"},
       {"code":"admin","label":"Admin"},
       {"code":"storekeeper","label":"Storekeeper"},
       {"code":"driver","label":"Driver"},
       {"code":"trainer","label":"Trainer"},
       {"code":"sup_8h_r","label":"Supervisor 8H R"},
       {"code":"hk_f_8h_r","label":"HK Female 8H R"}
     ]},
     {"code":"ppe","label":"Uniform & PPE","calc":"total_headcount_x_unitcost","lines":[
       {"code":"uniform_ppe","label":"Uniform & PPE"}
     ]},
     {"code":"tools","label":"Tools & Consumables","calc":"qty_x_unitcost_div_depreciation","lines":[
       {"code":"machinery","label":"Machinery"},
       {"code":"tools","label":"Tools"},
       {"code":"consumables","label":"Consumables"}
     ]},
     {"code":"transport","label":"Transportation & Vehicles","calc":"qty_x_unitcost","lines":[
       {"code":"bus","label":"Bus"},
       {"code":"microbus","label":"Microbus"},
       {"code":"sedan","label":"Sedan Car"},
       {"code":"minivan","label":"Minivan"},
       {"code":"pickup","label":"Pickup Car"},
       {"code":"fuel","label":"Fuel"}
     ]},
     {"code":"it","label":"IT & Communication","calc":"qty_x_unitcost","lines":[
       {"code":"ict_per_head","label":"Laptop / Mobile / Printer / SIM (per head)"}
     ]},
     {"code":"overhead","label":"Mobilization & Overhead","calc":"flat","lines":[
       {"code":"mob_overhead","label":"Mobilization & Overhead"}
     ]}
   ]
 }'::jsonb,
 '[
   {"category":"manning","code_patterns":["^5000(0[1-9]|1[0-4])$"]},
   {"category":"ppe","code_patterns":["^500011$"]},
   {"category":"tools","code_patterns":["^5002(0[1-9]|1[0-9])$"]},
   {"category":"consumables","code_patterns":["^5001(0[1-9]|1[0-9])$"]},
   {"category":"transport","code_patterns":["^5005[0-9]{2}$"]},
   {"category":"it","code_patterns":["^5003(0[1-9]|1[0-9])$"]},
   {"category":"overhead","code_patterns":["^5004(0[1-9]|1[0-9])$"]}
 ]'::jsonb),
('mep', 1, true,
 '{"sub_locations_enabled":false,"default_sub_locations":[],"season_months":{"high":[9,10,11,12,1,2,3,4],"low":[5,6,7,8]},"vat_pct":14,"categories":[]}'::jsonb,
 '[]'::jsonb),
('landscape', 1, true,
 '{"sub_locations_enabled":false,"default_sub_locations":[],"season_months":{"high":[9,10,11,12,1,2,3,4],"low":[5,6,7,8]},"vat_pct":14,"categories":[]}'::jsonb,
 '[]'::jsonb),
('security', 1, true,
 '{"sub_locations_enabled":false,"default_sub_locations":[],"season_months":{"high":[9,10,11,12,1,2,3,4],"low":[5,6,7,8]},"vat_pct":14,"categories":[]}'::jsonb,
 '[]'::jsonb),
('pest_ctrl', 1, true,
 '{"sub_locations_enabled":false,"default_sub_locations":[],"season_months":{"high":[9,10,11,12,1,2,3,4],"low":[5,6,7,8]},"vat_pct":14,"categories":[]}'::jsonb,
 '[]'::jsonb),
('waste_mgmt', 1, true,
 '{"sub_locations_enabled":false,"default_sub_locations":[],"season_months":{"high":[9,10,11,12,1,2,3,4],"low":[5,6,7,8]},"vat_pct":14,"categories":[]}'::jsonb,
 '[]'::jsonb);
