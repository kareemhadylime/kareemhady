-- 0139_personal_networth.sql
-- Personal Net Worth module: 11 tables, 3 views, fx_lookup() helper.
-- Single-user (Kareem) UI but multi-user-ready schema (app_user_id everywhere).
-- Base currency EGP; multi-currency via per-row currency + fx_rates table.

begin;

-- ============================================================
-- 1) LOOKUP TABLES
-- ============================================================

create table personal_networth_currencies (
  code        text primary key,
  name        text not null,
  symbol      text,
  is_base     boolean not null default false,
  created_at  timestamptz not null default now()
);
insert into personal_networth_currencies (code, name, symbol, is_base) values
  ('EGP', 'Egyptian Pound', 'EGP', true),
  ('USD', 'US Dollar', '$', false),
  ('EUR', 'Euro', '€', false),
  ('SAR', 'Saudi Riyal', 'SAR', false),
  ('AED', 'UAE Dirham', 'AED', false);

create table personal_networth_fx_rates (
  id            uuid primary key default gen_random_uuid(),
  currency_code text not null references personal_networth_currencies(code),
  rate_to_egp   numeric(12,6) not null check (rate_to_egp > 0),
  as_of_date    date not null,
  notes         text,
  created_at    timestamptz not null default now(),
  unique (currency_code, as_of_date)
);
create index idx_fx_rates_lookup
  on personal_networth_fx_rates (currency_code, as_of_date desc);

create table personal_networth_lenders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  kind        text not null check (kind in (
                'bank','bnpl','card_issuer','person','other'
              )),
  contact     text,
  notes       text,
  app_user_id uuid references app_users(id),
  created_at  timestamptz not null default now()
);

create table personal_networth_settings (
  app_user_id            uuid primary key references app_users(id),
  charity_goal_egp_year  numeric(14,2),
  default_currency       text not null default 'EGP'
                         references personal_networth_currencies(code),
  monthly_snapshot_day   int not null default 1 check (monthly_snapshot_day between 1 and 28),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

commit;
