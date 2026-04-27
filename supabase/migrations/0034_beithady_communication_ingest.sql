-- =====================================================================
-- Beithady Communication — initial-ingest + SLA recompute procs
-- =====================================================================
-- Two stored procedures backing /api/cron/beithady-comm-sync (every
-- 5min) and /api/cron/beithady-sla-recalc (every 5min). Pure SQL so
-- the worktree Vercel project (no Supabase env vars) can populate
-- communication data via MCP, and the canonical lime cron can keep
-- it fresh going forward.

-- 1. Ingest from guesty_conversations + guesty_conversation_posts
create or replace function public.beithady_communication_ingest()
returns table (
  conversations_upserted int,
  messages_upserted int,
  total_conversations int,
  total_messages int
) language plpgsql as $$
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

  -- Upsert conversations from guesty_conversations
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

  -- Upsert messages from guesty_conversation_posts. Maps to
  -- beithady_messages, joining via the conversation we just upserted.
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
      when gp.sent_by = 'guest' then 'inbound'
      when gp.sent_by = 'host'  then 'outbound'
      else 'inbound'  -- 'log' goes inbound by convention; we filter logs out of SLA elsewhere
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

  -- Recompute SLA buckets (delegate to the dedicated function)
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
end $$;

-- 2. SLA recompute — runs every 5 min via cron
create or replace function public.beithady_communication_sla_recompute()
returns int language plpgsql as $$
declare
  affected int;
begin
  with calc as (
    select id,
           case
             when last_inbound_at is null then null::int
             when last_outbound_at is not null and last_outbound_at >= last_inbound_at then null::int
             else extract(epoch from (now() - last_inbound_at))::int
           end as age_seconds
      from public.beithady_conversations
     where state = 'open'
  )
  update public.beithady_conversations c
     set sla_age_seconds = calc.age_seconds,
         sla_bucket = case
           when calc.age_seconds is null then null
           when calc.age_seconds <= 3600 then 'green'
           when calc.age_seconds <= 4*3600 then 'yellow'
           when calc.age_seconds <= 12*3600 then 'orange'
           else 'red'
         end,
         sla_breach = (calc.age_seconds is not null and calc.age_seconds > 12*3600)
    from calc
   where c.id = calc.id
     and (c.sla_age_seconds is distinct from calc.age_seconds
          or c.sla_bucket is distinct from
             case
               when calc.age_seconds is null then null
               when calc.age_seconds <= 3600 then 'green'
               when calc.age_seconds <= 4*3600 then 'yellow'
               when calc.age_seconds <= 12*3600 then 'orange'
               else 'red'
             end);
  get diagnostics affected = row_count;
  return affected;
end $$;

insert into public.beithady_audit_log(module, action, metadata) values
  ('communication', 'ingest_proc_installed',
   jsonb_build_object('migration', '0034_beithady_communication_ingest'));
