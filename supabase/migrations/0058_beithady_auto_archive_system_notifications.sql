-- Phase C.5 follow-up: auto-archive Guesty system-notification emails.
-- These are bookings auto-emailed by Guesty automations into the host
-- inbox ("NEW BOOKING from manual / Airbnb / Booking.com") — not real
-- guest conversations. They appear as "Unknown guest" rows because the
-- from-address is a Guesty service account with no guest identity.

alter table public.beithady_conversations
  add column if not exists is_system_notification boolean not null default false;

create index if not exists idx_bh_conv_system_notif
  on public.beithady_conversations(is_system_notification)
  where is_system_notification = true;

comment on column public.beithady_conversations.is_system_notification
  is 'Phase C.5 — true when the conversation is a Guesty automation-generated booking-notification email. Auto-archived by beithady_classify_system_notifications().';

create or replace function public.beithady_classify_system_notifications()
returns table(archived int, restored int)
language plpgsql
as $$
declare
  archived_count int := 0;
  restored_count int := 0;
begin
  with did_archive as (
    update public.beithady_conversations bc
    set is_system_notification = true,
        archived_at = coalesce(bc.archived_at, now()),
        archived_reason = coalesce(bc.archived_reason, 'system_notification')
    where bc.archived_at is null
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
  is 'Phase C.5 — auto-archives pure-system-notification conversations + restores any flagged conv that later received a real message.';
