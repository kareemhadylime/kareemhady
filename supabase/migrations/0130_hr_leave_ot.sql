-- supabase/migrations/0130_hr_leave_ot.sql
-- Beithady HR Sprint 6 — Leave & Overtime

-- Leave balances: HR sets total_days; used_days auto-incremented on request approval
create table public.hr_leave_balances (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  year        int not null,
  leave_type  text not null check (leave_type in ('annual', 'sick', 'emergency')),
  total_days  numeric not null default 0 check (total_days >= 0),
  used_days   numeric not null default 0 check (used_days >= 0),
  constraint uq_hr_leave_balance unique (employee_id, year, leave_type)
);
create index idx_hr_leave_bal_emp on public.hr_leave_balances(employee_id, year);

-- Leave requests
create table public.hr_leave_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.hr_employees(id) on delete cascade,
  leave_type   text not null check (leave_type in ('annual', 'sick', 'emergency')),
  start_date   date not null,
  end_date     date not null,
  days_count   numeric not null check (days_count > 0),
  reason       text,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  reviewed_by  uuid references public.app_users(id),
  reviewed_at  timestamptz,
  submitted_by uuid references public.app_users(id),
  submitted_at timestamptz not null default now()
);
create index idx_hr_leave_req_emp    on public.hr_leave_requests(employee_id);
create index idx_hr_leave_req_status on public.hr_leave_requests(status);

-- Overtime records
create table public.hr_overtime_records (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.hr_employees(id) on delete cascade,
  date         date not null,
  hours        numeric not null check (hours > 0),
  reason       text,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  reviewed_by  uuid references public.app_users(id),
  reviewed_at  timestamptz,
  submitted_by uuid references public.app_users(id),
  submitted_at timestamptz not null default now()
);
create index idx_hr_ot_emp    on public.hr_overtime_records(employee_id);
create index idx_hr_ot_date   on public.hr_overtime_records(date);
create index idx_hr_ot_status on public.hr_overtime_records(status);
