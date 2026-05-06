-- 0073: Admin user account UX upgrades.
-- Adds optional display_name + soft-disable fields to app_users.
-- All additive; no data migration needed.
--
-- DOWN:
--   alter table public.app_users
--     drop column if exists disabled_by,
--     drop column if exists disabled_at,
--     drop column if exists display_name;
--   drop index if exists idx_app_users_disabled;

alter table public.app_users
  add column if not exists display_name text,
  add column if not exists disabled_at  timestamptz,
  add column if not exists disabled_by  uuid references public.app_users(id);

create index if not exists idx_app_users_disabled
  on public.app_users (disabled_at) where disabled_at is not null;
