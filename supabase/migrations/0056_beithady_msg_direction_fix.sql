-- 0056_beithady_msg_direction_fix.sql
--
-- Fix message-direction inference for Guesty conversation posts.
--
-- Bug
-- ---
-- Original ingest used `gp.sent_by` only:
--   when sent_by='guest' -> inbound
--   when sent_by='host'  -> outbound
--   else (incl. 'log')   -> inbound
--
-- Guesty marks some host-authored auto-templates with sentBy='log',
-- which tripped the else branch and routed them to inbound — so the
-- thread-pane rendered them on the LEFT (guest side) instead of the
-- RIGHT (BH side). 69 rows confirmed misrouted as of 2026-04-30.
--
-- Fix
-- ---
-- Prefer `from_type` (the from.type field on Guesty's post object) since
-- it's the more reliable signal of authorship. `sent_by` is the fallback
-- when from_type is null.
--
-- Backfill: applied via Supabase MCP execute_sql at deploy time
--   UPDATE beithady_messages SET direction='outbound'
--   WHERE channel='guesty' AND direction='inbound'
--     AND from_type IN ('host','employee','user');
-- (69 rows flipped — kept here as a comment for audit; not re-run in
-- this migration since it's idempotent against future runs.)

CREATE OR REPLACE FUNCTION public.beithady_communication_ingest()
 RETURNS TABLE(conversations_upserted integer, messages_upserted integer, total_conversations integer, total_messages integer)
 LANGUAGE plpgsql
AS $function$
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
    gc.last_message_nonuser_at,
    gc.last_message_user_at,
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
    -- FIXED 2026-04-30: prefer from_type (Guesty's `from.type`) since
    -- sent_by can be 'log' for host-authored auto-templates.
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
