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

-- ============================================================
-- 2) CORE ENTITIES
-- ============================================================

create table personal_networth_assets (
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid not null references app_users(id),
  name          text not null,
  kind          text not null check (kind in (
                  'cash','real_estate','vehicle','gold_jewelry','other'
                )),
  currency      text not null references personal_networth_currencies(code),
  balance       numeric(14,2) not null,
  as_of_date    date not null default current_date,
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_assets_user_active
  on personal_networth_assets (app_user_id) where active = true;

create table personal_networth_liabilities (
  id              uuid primary key default gen_random_uuid(),
  app_user_id     uuid not null references app_users(id),
  name            text not null,
  kind            text not null check (kind in (
                    'amortizing_loan','bnpl','credit_card','overdraft','other'
                  )),
  currency        text not null references personal_networth_currencies(code),
  lender_id       uuid references personal_networth_lenders(id),
  current_balance numeric(14,2) not null,
  -- Amortizing / BNPL columns
  principal       numeric(14,2),
  apr_pct         numeric(6,3),
  term_months     int,
  start_date      date,
  monthly_payment numeric(14,2),
  -- Credit card / overdraft columns
  credit_limit    numeric(14,2),
  statement_day   int check (statement_day between 1 and 28),
  due_day         int check (due_day between 1 and 28),
  min_payment_pct numeric(5,2),
  notes           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint amortizing_required_fields check (
    kind not in ('amortizing_loan','bnpl')
    or (principal is not null and apr_pct is not null
        and term_months is not null and start_date is not null)
  ),
  constraint revolving_required_fields check (
    kind not in ('credit_card','overdraft')
    or credit_limit is not null
  )
);
create index idx_liabilities_user_active
  on personal_networth_liabilities (app_user_id) where active = true;

create table personal_networth_liability_schedule (
  id                uuid primary key default gen_random_uuid(),
  liability_id      uuid not null references personal_networth_liabilities(id)
                    on delete cascade,
  installment_no    int not null,
  due_date          date not null,
  principal_portion numeric(14,2) not null,
  interest_portion  numeric(14,2) not null,
  remaining_after   numeric(14,2) not null,
  paid_on           date,
  payment_id        uuid,
  unique (liability_id, installment_no)
);
create index idx_schedule_due
  on personal_networth_liability_schedule (due_date) where paid_on is null;

create table personal_networth_payments (
  id                    uuid primary key default gen_random_uuid(),
  app_user_id           uuid not null references app_users(id),
  occurred_on           date not null,
  amount                numeric(14,2) not null check (amount > 0),
  currency              text not null references personal_networth_currencies(code),
  category              text not null check (category in (
                          'loan_payment','card_payment','overdraft_payment',
                          'bnpl_payment','charity','rent','utility','phone',
                          'subscription','insurance','school_fee','other'
                        )),
  liability_id          uuid references personal_networth_liabilities(id),
  loan_schedule_id      uuid references personal_networth_liability_schedule(id),
  recurring_template_id uuid,
  notes                 text,
  created_at            timestamptz not null default now()
);
create index idx_payments_user_date
  on personal_networth_payments (app_user_id, occurred_on desc);
create index idx_payments_category
  on personal_networth_payments (category, occurred_on desc);

alter table personal_networth_liability_schedule
  add constraint schedule_payment_fk
  foreign key (payment_id) references personal_networth_payments(id);

create table personal_networth_recurring_templates (
  id              uuid primary key default gen_random_uuid(),
  app_user_id     uuid not null references app_users(id),
  name            text not null,
  category        text not null check (category in (
                    'loan_payment','card_payment','overdraft_payment',
                    'bnpl_payment','charity','rent','utility','phone',
                    'subscription','insurance','school_fee','other'
                  )),
  amount          numeric(14,2) not null check (amount > 0),
  currency        text not null references personal_networth_currencies(code),
  frequency       text not null check (frequency in ('monthly','quarterly','yearly')),
  day_of_period   int not null check (day_of_period between 1 and 28),
  month_of_year   int check (month_of_year between 1 and 12),
  liability_id    uuid references personal_networth_liabilities(id),
  notes           text,
  active          boolean not null default true,
  next_run_date   date not null,
  last_run_date   date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_recurring_due
  on personal_networth_recurring_templates (next_run_date) where active = true;

alter table personal_networth_payments
  add constraint payments_recurring_template_fk
  foreign key (recurring_template_id)
  references personal_networth_recurring_templates(id);

-- ============================================================
-- 3) SNAPSHOTS
-- ============================================================

create table personal_networth_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  app_user_id           uuid not null references app_users(id),
  taken_at              timestamptz not null default now(),
  kind                  text not null check (kind in ('monthly_auto','manual')),
  total_assets_egp      numeric(14,2) not null,
  total_liabilities_egp numeric(14,2) not null,
  net_worth_egp         numeric(14,2) not null,
  fx_rates_used         jsonb not null,
  notes                 text
);
create index idx_snapshots_user_date
  on personal_networth_snapshots (app_user_id, taken_at desc);

create table personal_networth_snapshot_lines (
  id            uuid primary key default gen_random_uuid(),
  snapshot_id   uuid not null references personal_networth_snapshots(id)
                on delete cascade,
  line_type     text not null check (line_type in ('asset','liability','stocks_pipe')),
  entity_id     uuid,
  display_name  text not null,
  currency      text not null,
  amount        numeric(14,2) not null,
  amount_egp    numeric(14,2) not null
);
create index idx_snapshot_lines_snapshot
  on personal_networth_snapshot_lines (snapshot_id);

-- ============================================================
-- 4) FX HELPER FUNCTION
-- ============================================================

create or replace function fx_lookup(p_currency text, p_as_of date)
returns numeric
language sql
stable
as $$
  select case
    when p_currency = 'EGP' then 1::numeric
    else (
      select rate_to_egp
      from personal_networth_fx_rates
      where currency_code = p_currency
        and as_of_date <= p_as_of
      order by as_of_date desc
      limit 1
    )
  end
$$;

commit;
