-- Phase C.5 follow-up: extend archived_reason allowlist to include
-- 'system_notification' so beithady_classify_system_notifications can
-- archive Guesty automation booking-notification emails.

alter table public.beithady_conversations
  drop constraint if exists beithady_conversations_archived_reason_check;
alter table public.beithady_conversations
  add constraint beithady_conversations_archived_reason_check
  check (archived_reason is null or archived_reason = any (array[
    'manual_month_bulk',
    'auto_cron_90d',
    'manual_single',
    'duplicate',
    'restore_undo',
    'system_notification'
  ]));
