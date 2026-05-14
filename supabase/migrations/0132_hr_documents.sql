-- supabase/migrations/0132_hr_documents.sql
-- Beithady HR Sprint 8 — Documents & Compliance

create table public.hr_employee_documents (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.hr_employees(id) on delete cascade,
  doc_type        text not null check (doc_type in ('id','contract','police_report','military_certificate','other')),
  title           text not null,
  document_number text,
  issue_date      date,
  expiry_date     date,
  file_path       text,
  file_name       text,
  notes           text,
  created_by      uuid references public.app_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_hr_docs_employee on public.hr_employee_documents(employee_id);
create index idx_hr_docs_expiry   on public.hr_employee_documents(expiry_date) where expiry_date is not null;
create index idx_hr_docs_type     on public.hr_employee_documents(doc_type);

-- Private storage bucket for HR documents
insert into storage.buckets (id, name, public)
values ('hr-documents', 'hr-documents', false)
on conflict (id) do nothing;
