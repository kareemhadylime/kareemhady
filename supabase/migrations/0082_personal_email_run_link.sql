-- Phase: Personal Email v1 — link email_logs back to personal-email runs
-- Bug: email_logs.run_id was FK to public.runs (legacy InboxOps Phase-1
-- ingest table). Personal-email ingest creates rows in
-- public.personal_email_classification_runs which is a different table,
-- so every upsert was failing FK constraint email_logs_run_id_fkey.
-- Fix: add a parallel personal_run_id column with the correct FK target.
-- Legacy run_id stays NULL for personal-email rows.

alter table public.email_logs
  add column if not exists personal_run_id uuid
    references public.personal_email_classification_runs(id) on delete set null;

create index if not exists idx_email_logs_personal_run
  on public.email_logs (personal_run_id);
