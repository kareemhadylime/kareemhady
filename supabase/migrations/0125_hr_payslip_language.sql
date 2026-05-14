-- supabase/migrations/0125_hr_payslip_language.sql
-- Add payslip language preference to employee master

alter table public.hr_employees
  add column payslip_language text not null default 'arabic'
  check (payslip_language in ('arabic', 'english'));

comment on column public.hr_employees.payslip_language
  is 'Language for printed payslips: arabic (default) or english.';
