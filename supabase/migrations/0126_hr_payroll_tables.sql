-- supabase/migrations/0126_hr_payroll_tables.sql
-- Beithady HR — Monthly Payroll tables (Sprint 2)

create table hr_payroll_months (
  id          uuid primary key default gen_random_uuid(),
  month_key   text not null unique,
  label       text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references accounts(id)
);

create table hr_payroll_entries (
  id                  uuid primary key default gen_random_uuid(),
  month_id            uuid not null references hr_payroll_months(id) on delete cascade,
  employee_id         uuid references hr_employees(id) on delete set null,
  sheet_name          text not null,
  job_title           text,
  working_days        numeric not null default 0,
  salary_package      numeric not null default 0,
  ot                  numeric not null default 0,
  transport_allowance numeric not null default 0,
  bonus               numeric not null default 0,
  travel_allowance    numeric not null default 0,
  salary_in_advance   numeric not null default 0,
  deduction           numeric not null default 0,
  net_salary          numeric not null default 0,
  building_code       text,
  analytic_raw        text,
  is_terminated       boolean not null default false,
  created_at          timestamptz not null default now(),
  created_by          uuid references accounts(id)
);

create index idx_hr_payroll_entries_month    on hr_payroll_entries(month_id);
create index idx_hr_payroll_entries_employee on hr_payroll_entries(employee_id);
