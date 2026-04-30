-- Phase C.5 follow-up: derive beithady_conversations.last_inbound_at /
-- last_outbound_at from guesty_conversation_posts directly, bypassing
-- gc.last_message_user_at / last_message_nonuser_at which can be set
-- with inverted semantics by older webhook handler code (or differ
-- from raw.lastMessageFrom in webhook-only-populated rows).
--
-- gp.from_type is canonical: 'guest' = guest, 'host' / 'employee' /
-- 'user' = host. Same mapping the message direction uses.
--
-- Surfaced when Yara (BH-MB34-105 Airbnb) showed "Awaiting reply" and
-- "NEW" badge despite a host reply being the last message:
--   actual messages: 14:33:45 guest inbound, 14:35:45 host outbound
--   gc.last_message_user_at:    14:33:45 (guest's time, swapped)
--   gc.last_message_nonuser_at: 14:35:45 (host's time, swapped)
-- Old webhook code wrote those fields with inverted semantics; new
-- webhook code is correct, but historical data is stuck.

create or replace function public.beithady_communication_ingest()
returns table(conversations_upserted integer, messages_upserted integer, total_conversations integer, total_messages integer)
language plpgsql
as $function$
declare
  conv_before int;
  conv_after  int;
  msg_before  int;
  msg_after   int;
  run_id uuid;
begin
  insert into public.beithady_comm_sync_runs (trigger, status)
    values ('backfill', 'running') returning id into run_id;

  select count(*) into conv_before from public.beithady_conversations;
  select count(*) into msg_before from public.beithady_messages;

  insert into public.beithady_conversations (
    channel, external_id, guest_id, reservation_id, building_code,
    source, state, unread_count, guest_full_name, guest_email, guest_phone,
    listing_id, listing_nickname, last_inbound_at, last_outbound_at,
    created_at_external, modified_at_external, raw
  )
  select
    'guesty' as channel,
    gc.id,
    bg.id as guest_id,
    gc.reservation_id,
    gc.listing_building_code,
    gc.reservation_source,
    case lower(coalesce(gc.state_status, 'OPEN'))
      when 'closed' then 'closed' else 'open'
    end,
    case when gc.state_read = false then 1 else 0 end,
    gc.guest_full_name,
    nullif(lower(gc.guest_email), ''),
    case when gc.guest_phone is not null and length(regexp_replace(gc.guest_phone, '[^0-9]', '', 'g')) >= 8
         then '+' || regexp_replace(gc.guest_phone, '[^0-9]', '', 'g')
         else null end,
    gc.listing_id,
    gc.listing_nickname,
    -- Phase C.5 follow-up — derive from posts directly.
    (
      select max(gp.created_at_guesty)
      from public.guesty_conversation_posts gp
      where gp.conversation_id = gc.id and gp.from_type = 'guest'
    ) as last_inbound_at,
    (
      select max(gp.created_at_guesty)
      from public.guesty_conversation_posts gp
      where gp.conversation_id = gc.id and gp.from_type in ('host', 'employee', 'user')
    ) as last_outbound_at,
    gc.created_at_guesty,
    gc.modified_at_guesty,
    gc.raw
  from public.guesty_conversations gc
  left join public.beithady_guests bg on bg.guesty_guest_id = gc.guest_id
  on conflict (channel, external_id) do update set
    guest_id = excluded.guest_id,
    reservation_id = excluded.reservation_id,
    building_code = excluded.building_code,
    source = excluded.source,
    state = excluded.state,
    unread_count = excluded.unread_count,
    guest_full_name = excluded.guest_full_name,
    guest_email = excluded.guest_email,
    guest_phone = excluded.guest_phone,
    listing_id = excluded.listing_id,
    listing_nickname = excluded.listing_nickname,
    last_inbound_at = excluded.last_inbound_at,
    last_outbound_at = excluded.last_outbound_at,
    modified_at_external = excluded.modified_at_external,
    raw = excluded.raw;

  select count(*) into conv_after from public.beithady_conversations;

  insert into public.beithady_messages (
    channel, external_id, conversation_id, conversation_external_id,
    direction, guest_id, reservation_id, building_code,
    module_type, module_subject, body, is_automatic,
    from_full_name, from_type, sent_at, raw
  )
  select
    'guesty' as channel,
    gp.id,
    bc.id as conversation_id,
    gp.conversation_id,
    case
      when gp.from_type in ('host', 'employee', 'user') then 'outbound'
      when gp.from_type = 'guest' then 'inbound'
      when gp.sent_by = 'host'  then 'outbound'
      when gp.sent_by = 'guest' then 'inbound'
      else 'inbound'
    end as direction,
    bc.guest_id,
    coalesce(gp.reservation_id, bc.reservation_id),
    bc.building_code,
    gp.module_type,
    gp.module_subject,
    gp.body_text,
    coalesce(gp.is_automatic, false),
    gp.from_full_name,
    gp.from_type,
    gp.created_at_guesty,
    gp.raw
  from public.guesty_conversation_posts gp
  join public.beithady_conversations bc on
    bc.channel = 'guesty' and bc.external_id = gp.conversation_id
  on conflict (channel, external_id) do update set
    conversation_id = excluded.conversation_id,
    direction = excluded.direction,
    guest_id = excluded.guest_id,
    reservation_id = excluded.reservation_id,
    module_type = excluded.module_type,
    body = excluded.body,
    is_automatic = excluded.is_automatic,
    from_full_name = excluded.from_full_name,
    from_type = excluded.from_type;

  select count(*) into msg_after from public.beithady_messages;

  perform public.beithady_communication_sla_recompute();

  update public.beithady_comm_sync_runs
     set finished_at = now(),
         status = 'success',
         conversations_upserted = (conv_after - conv_before),
         messages_upserted = (msg_after - msg_before),
         details = jsonb_build_object(
           'method', 'sql_initial_ingest',
           'conv_before', conv_before,
           'conv_after', conv_after,
           'msg_before', msg_before,
           'msg_after', msg_after
         )
   where id = run_id;

  return query select
    (conv_after - conv_before)::int,
    (msg_after - msg_before)::int,
    conv_after::int,
    msg_after::int;
end $function$;

-- Backfill: recompute last_inbound_at / last_outbound_at on every
-- existing beithady_conversations row from beithady_messages
-- (canonical direction). Heals all historical rows touched by the old
-- swap-broken webhook code.
update public.beithady_conversations bc
set
  last_inbound_at  = sub.last_inbound,
  last_outbound_at = sub.last_outbound
from (
  select
    conversation_id,
    max(case when direction = 'inbound'  then sent_at end) as last_inbound,
    max(case when direction = 'outbound' then sent_at end) as last_outbound
  from public.beithady_messages
  group by conversation_id
) sub
where bc.id = sub.conversation_id
  and (
    bc.last_inbound_at  is distinct from sub.last_inbound
    or bc.last_outbound_at is distinct from sub.last_outbound
  );
