-- =====================================================================
-- Beithady v2 — Phase A: Foundation
-- =====================================================================
-- Purpose: 5-role permission matrix, audit log, and settings KV that
-- underpin the new Beithady tabs (Financial · Analytics · CRM ·
-- Communication · Settings) and the cross-cutting Gallery + Ads modules
-- shipped in later phases.
--
-- Single-tenant Beithady at the moment (Lime's only short-term-rental
-- subsidiary), so we don't carry a tenant_id column. Domain-level access
-- is still enforced upstream via app_user_domain_roles + the existing
-- requireDomainAccess('beithady') gate at /emails/beithady/layout.tsx.
-- This migration adds a finer-grained second layer for *what within
-- Beithady* a user can see.

-- 1. Role enum (5 roles per Plan v0.3 Q-B)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'beithady_role') then
    create type beithady_role as enum (
      'guest_relations',
      'finance',
      'ops',
      'manager',
      'admin'
    );
  end if;
end $$;

-- 2. User role assignment table
create table if not exists public.beithady_user_roles (
  user_id     uuid not null references public.app_users(id) on delete cascade,
  role        beithady_role not null,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references public.app_users(id),
  primary key (user_id, role)
);
create index if not exists idx_beithady_user_roles_user on public.beithady_user_roles(user_id);

-- 3. Audit log — used across every Beithady module (CRM edits, message
-- sends, ad publishes, gallery uploads, settings changes, role grants).
create table if not exists public.beithady_audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.app_users(id),
  module        text not null,         -- 'crm' | 'communication' | 'ads' | 'gallery' | 'settings' | 'foundation'
  action        text not null,         -- e.g. 'role_granted', 'role_revoked', 'guest_edited', 'message_sent'
  target_type   text,                  -- 'user' | 'guest' | 'conversation' | 'campaign' | 'asset' | ...
  target_id     text,
  before        jsonb,
  after         jsonb,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_beithady_audit_created on public.beithady_audit_log(created_at desc);
create index if not exists idx_beithady_audit_module_target on public.beithady_audit_log(module, target_type, target_id);
create index if not exists idx_beithady_audit_actor on public.beithady_audit_log(actor_user_id, created_at desc);

-- 4. Settings KV — keyed JSON for per-tenant config (AI threshold,
-- loyalty tier thresholds, upsell catalog references, branding
-- overrides, etc.). Phases B-I read+write here.
create table if not exists public.beithady_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.app_users(id)
);

-- 5. Seed defaults — AI confidence threshold (Phase E uses this; we
-- seed in Phase A so the Settings UI has a real value to render).
insert into public.beithady_settings(key, value, description) values
  ('ai_confidence_threshold', '0.85'::jsonb,
   'Minimum classifier confidence (0-1) for AI replies to auto-send. Below this, the AI suggestion is shown to the agent instead of being sent.'),
  ('ai_auto_reply_enabled', 'true'::jsonb,
   'Master kill-switch for the AI auto-reply system. Disable to force every channel into suggest-only mode.'),
  ('vip_digest_enabled', 'true'::jsonb,
   'When true, every auto-sent reply on a VIP-tagged conversation is included in the next morning''s admin digest at 09:00 Cairo.')
on conflict (key) do nothing;

-- 6. Backfill: every existing app_users.role='admin' gets the Beithady
-- 'admin' role automatically so the new pages work on the first deploy
-- without manual setup. Non-admins start with no role and must be
-- granted access via /emails/beithady/settings/users/.
insert into public.beithady_user_roles(user_id, role, granted_by)
select id, 'admin'::beithady_role, id
  from public.app_users
 where lower(coalesce(role, '')) = 'admin'
on conflict do nothing;

-- 7. Audit the foundation install itself so the audit log is never
-- empty on first load.
insert into public.beithady_audit_log(module, action, metadata) values
  ('foundation', 'phase_a_installed',
   jsonb_build_object('migration', '0030_beithady_v2_foundation', 'phase', 'A'));
