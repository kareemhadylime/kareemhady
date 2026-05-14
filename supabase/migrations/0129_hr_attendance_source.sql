-- supabase/migrations/0129_hr_attendance_source.sql
-- Beithady HR Sprint 5 — tag attendance records with their source

alter table public.hr_attendance_records
  add column source text not null default 'manual'
  check (source in ('manual', 'biometric'));
