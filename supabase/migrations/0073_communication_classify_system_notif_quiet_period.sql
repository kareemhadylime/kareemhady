-- 2026-05-02 Communication module audit — H-B8
-- Auto-archive system-notification: add a 15-minute quiet period.
--
-- Pre-fix: the classifier ran on every webhook batch. If a system
-- notification arrived BEFORE the human reply (sync-order race), the
-- conversation got archived in that brief window. The next cron run
-- restored it (because the human reply now exists), so the inbox
-- flickered + briefly dropped the alert. Worse, the heuristic was
-- title-only and language-fragile: a real guest forwarding the
-- "NEW BOOKING" auto-email back into the thread could trip the same
-- pattern.
--
-- Fix: only archive after a 15-minute quiet period since the
-- conversation's most recent message. Gives any in-flight human reply
-- time to land before we make the archive decision.

create or replace function public.beithady_classify_system_notifications()
returns table(archived int, restored int)
language plpgsql
as $$
declare
  archived_count int := 0;
  restored_count int := 0;
  v_quiet_period interval := interval '15 minutes';
begin
  with did_archive as (
    update public.beithady_conversations bc
    set is_system_notification = true,
        archived_at = coalesce(bc.archived_at, now()),
        archived_reason = coalesce(bc.archived_reason, 'system_notification')
    where bc.archived_at is null
      -- Audit fix H-B8: quiet period — if any message arrived in the
      -- last 15 min, hold off archiving so a delayed human reply has
      -- time to land. Without this, sync-order races cause inbox flicker.
      and not exists (
        select 1 from public.beithady_messages bm_recent
        where bm_recent.conversation_id = bc.id
          and bm_recent.created_at > now() - v_quiet_period
      )
      and exists (
        select 1 from public.beithady_messages bm
        where bm.conversation_id = bc.id
          and bm.module_type = 'email'
          and bm.from_type = 'host'
          and bm.module_subject ilike 'NEW BOOKING from %'
      )
      and not exists (
        select 1 from public.beithady_messages bm2
        where bm2.conversation_id = bc.id
          and not (
            bm2.module_type = 'email'
            and bm2.from_type = 'host'
            and bm2.module_subject ilike 'NEW BOOKING from %'
          )
      )
    returning 1
  )
  select count(*) into archived_count from did_archive;

  with did_restore as (
    update public.beithady_conversations bc
    set archived_at = null,
        archived_reason = null,
        is_system_notification = false
    where bc.is_system_notification = true
      and exists (
        select 1 from public.beithady_messages bm
        where bm.conversation_id = bc.id
          and not (
            bm.module_type = 'email'
            and bm.from_type = 'host'
            and bm.module_subject ilike 'NEW BOOKING from %'
          )
      )
    returning 1
  )
  select count(*) into restored_count from did_restore;

  return query select archived_count, restored_count;
end$$;

comment on function public.beithady_classify_system_notifications()
  is 'Phase C.5 — auto-archives pure-system-notification conversations + restores any flagged conv that later received a real message. Audit fix H-B8 (0073): added 15-min quiet period before archive decision to avoid sync-order races.';
