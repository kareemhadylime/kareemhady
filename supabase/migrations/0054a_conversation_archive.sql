-- Phase R.1 — Archive feature for beithady_conversations.
-- True archive (Plan R Q1=B): adds nullable archived_at/by/reason columns
-- on the existing table. Active inbox queries gate on archived_at IS NULL.
-- Webhook ingest auto-restores by setting archived_at = NULL on inbound.

alter table public.beithady_conversations
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid references public.app_users(id),
  add column if not exists archived_reason text check (archived_reason in (
    'manual_month_bulk', 'auto_cron_90d', 'manual_single', 'duplicate', 'restore_undo'
  ));

-- Active-inbox dominant filter: archived_at is null
create index if not exists idx_bh_conv_archived_null
  on public.beithady_conversations(state, last_inbound_at desc nulls last)
  where archived_at is null;

-- Archive month grouping for the year/month landing grids
create index if not exists idx_bh_conv_archived_at
  on public.beithady_conversations(archived_at desc)
  where archived_at is not null;

-- Settings seeds for the auto-archive cron
insert into public.beithady_settings (key, value, description)
values
  ('comm_auto_archive_days', '90'::jsonb,
   'Conversations untouched for this many days are auto-archived nightly.'),
  ('comm_auto_archive_pause', 'false'::jsonb,
   'Emergency stop: when true, the auto-archive cron skips its work.'),
  ('comm_auto_archive_max_per_run', '5000'::jsonb,
   'Maximum rows archived per cron invocation (LIMIT). Spreads first-run impact.')
on conflict (key) do nothing;

-- Audit row
insert into public.beithady_audit_log(module, action, metadata) values
  ('communication', 'phase_r_archive_installed',
   jsonb_build_object('migration', '0054a_conversation_archive', 'phase', 'R'));
