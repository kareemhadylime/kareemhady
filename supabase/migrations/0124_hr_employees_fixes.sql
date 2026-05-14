-- supabase/migrations/0124_hr_employees_fixes.sql
-- Beithady HR — Employee Master post-migration fixes
-- 1. updated_at trigger for hr_employees
-- 2. Non-negative check constraints on hr_employee_contracts allowances

-- Trigger to auto-refresh hr_employees.updated_at on every UPDATE
create or replace function public.hr_employees_touch_updated()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists hr_employees_touch on public.hr_employees;
create trigger hr_employees_touch
  before update on public.hr_employees
  for each row execute function public.hr_employees_touch_updated();

-- Non-negative constraints on allowance columns
alter table public.hr_employee_contracts
  add constraint chk_transport_allowance_gte0 check (transport_allowance >= 0),
  add constraint chk_travel_allowance_gte0    check (travel_allowance >= 0),
  add constraint chk_fixed_bonus_gte0         check (fixed_bonus >= 0);

-- Helpful comment on the active-contract invariant
comment on column public.hr_employee_contracts.effective_to
  is 'NULL = this is the active contract. Closed contracts carry the date they were superseded.';
