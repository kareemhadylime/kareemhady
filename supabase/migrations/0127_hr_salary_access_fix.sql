-- supabase/migrations/0127_hr_salary_access_fix.sql
-- Fix hr_salary_access FKs: account_id and granted_by were mistakenly
-- referencing public.accounts (Gmail OAuth table) instead of app_users.

alter table public.hr_salary_access
  drop constraint if exists hr_salary_access_account_id_fkey,
  drop constraint if exists hr_salary_access_granted_by_fkey;

alter table public.hr_salary_access
  add constraint hr_salary_access_account_id_fkey
    foreign key (account_id) references public.app_users(id) on delete cascade,
  add constraint hr_salary_access_granted_by_fkey
    foreign key (granted_by) references public.app_users(id);
