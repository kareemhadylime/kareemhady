-- supabase/migrations/0080_hr_team_members.sql
-- Beithady HR — Employee Master (Sprint 1)

-- Sequence backing BH-NNN company IDs
create sequence if not exists hr_employee_seq start with 1 increment by 1;

-- Core employee identity
create table hr_employees (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null unique,
  first_name          text not null,
  last_name           text,
  arabic_name         text,
  national_id         text unique,
  date_of_birth       date,
  gender              text check (gender in ('male', 'female')),
  department          text not null,
  position            text not null,
  job_role            text not null,
  status              text not null default 'on_job'
                      check (status in ('on_job','probation','on_leave','suspended','terminated')),
  date_joined         date,
  date_terminated     date,
  termination_reason  text,
  phone               text,
  email               text,
  portrait_url        text,
  incomplete_fields   text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references accounts(id)
);

create index idx_hr_emp_status     on hr_employees(status);
create index idx_hr_emp_department on hr_employees(department);

-- Contract versions (salary history)
create table hr_employee_contracts (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid not null references hr_employees(id) on delete cascade,
  contract_type       text not null default 'permanent'
                      check (contract_type in ('permanent','fixed_term','hourly')),
  contract_start      date not null,
  contract_end        date,
  building_code       text not null
                      check (building_code in ('BH-26','BH-73','BH-435','BH-OK','HEAD_OFFICE','OTHER')),
  salary_package      numeric not null default 0 check (salary_package >= 0),
  transport_allowance numeric not null default 0,
  travel_allowance    numeric not null default 0,
  fixed_bonus         numeric not null default 0,
  bank_name           text,
  bank_account        text,
  bank_iban           text,
  payment_method      text not null default 'bank' check (payment_method in ('bank','cash')),
  effective_from      date not null,
  effective_to        date,
  created_at          timestamptz not null default now(),
  created_by          uuid references accounts(id)
);

create index idx_hr_contracts_emp    on hr_employee_contracts(employee_id);
create index idx_hr_contracts_active on hr_employee_contracts(employee_id)
  where effective_to is null;
create index idx_hr_contracts_bldg   on hr_employee_contracts(building_code);

-- Immutable audit timeline
create table hr_employee_events (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references hr_employees(id) on delete cascade,
  event_type   text not null
               check (event_type in
                 ('hired','status_change','salary_change',
                  'building_transfer','role_change','terminated')),
  event_date   date not null,
  description  text not null,
  metadata     jsonb,
  created_at   timestamptz not null default now(),
  created_by   uuid references accounts(id)
);

create index idx_hr_events_emp on hr_employee_events(employee_id, event_date desc);

-- Salary visibility tiers (gating logic added in Sprint 3; table lives here)
create table hr_salary_access (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references accounts(id) on delete cascade,
  tier       smallint not null default 0 check (tier between 0 and 4),
  granted_by uuid references accounts(id),
  granted_at timestamptz not null default now()
);

-- Auto-generate BH-NNN company ID
create or replace function generate_hr_company_id()
returns text language plpgsql as $$
declare v bigint;
begin
  v := nextval('hr_employee_seq');
  return 'BH-' || lpad(v::text, 3, '0');
end;
$$;
