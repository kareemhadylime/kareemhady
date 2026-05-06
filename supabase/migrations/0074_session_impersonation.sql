-- 0074: Session-level admin impersonation.
-- Adds impersonating_user_id to app_sessions so an admin can act as another
-- user (broker/owner) for testing without sign-out/sign-in. When set,
-- getCurrentUser() returns the impersonated user as the effective user
-- but exposes the original admin id to the UI for the banner + portal
-- switcher.
--
-- Sign-out clears the entire session row, so impersonation auto-ends.
--
-- DOWN:
--   alter table public.app_sessions drop column if exists impersonating_user_id;
--   drop index if exists idx_app_sessions_impersonating;

alter table public.app_sessions
  add column if not exists impersonating_user_id uuid references public.app_users(id);

create index if not exists idx_app_sessions_impersonating
  on public.app_sessions (impersonating_user_id) where impersonating_user_id is not null;
