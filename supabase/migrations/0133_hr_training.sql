-- supabase/migrations/0133_hr_training.sql
-- Beithady HR Sprint 9 — Training & Certifications

create table public.hr_training_records (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.hr_employees(id) on delete cascade,
  record_type  text not null check (record_type in ('training', 'certification')),
  title        text not null,
  date         date,
  expiry_date  date,
  file_path    text,
  file_name    text,
  notes        text,
  created_by   uuid references public.app_users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_hr_training_employee on public.hr_training_records(employee_id);
create index idx_hr_training_expiry   on public.hr_training_records(expiry_date) where expiry_date is not null;
create index idx_hr_training_type     on public.hr_training_records(record_type);

-- Private storage bucket for training files
insert into storage.buckets (id, name, public)
values ('hr-training', 'hr-training', false)
on conflict (id) do nothing;
