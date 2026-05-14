-- supabase/migrations/0128_hr_attendance.sql
-- Beithady HR — Daily Attendance (Sprint 4)

create table public.hr_attendance_records (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.hr_employees(id) on delete cascade,
  date           date not null,
  status         text not null check (status in ('present', 'absent')),
  building_code  text,
  approval_state text not null default 'pending'
                 check (approval_state in ('pending', 'approved')),
  submitted_by   uuid references public.app_users(id),
  submitted_at   timestamptz not null default now(),
  approved_by    uuid references public.app_users(id),
  approved_at    timestamptz,
  constraint uq_hr_attendance_emp_date unique (employee_id, date)
);

create index idx_hr_attendance_date     on public.hr_attendance_records(date);
create index idx_hr_attendance_employee on public.hr_attendance_records(employee_id);
create index idx_hr_attendance_building on public.hr_attendance_records(building_code);
create index idx_hr_attendance_pending  on public.hr_attendance_records(date, approval_state)
  where approval_state = 'pending';
