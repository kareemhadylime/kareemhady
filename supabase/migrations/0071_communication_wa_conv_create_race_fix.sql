-- 2026-05-02 Communication module audit — C-D6
-- WA Casual conversation creation race fix.
--
-- Pre-fix: beithady_ensure_wa_casual_conversation did SELECT-then-INSERT
-- in plpgsql with no advisory lock. Two webhooks for the same brand-new
-- phone arriving in the same Postgres millisecond both saw no row, both
-- INSERTed, and the second tripped `unique (channel, external_id)`.
-- The webhook handler returned `ensure_conv: ...23505...` and Green-API
-- got a non-OK ingest result — the route still 200'd back, so the
-- message was silently logged in beithady_green_webhook_events.error
-- and lost.
--
-- Fix: switch to INSERT … ON CONFLICT DO NOTHING … RETURNING id, with a
-- second SELECT fallback to fetch the existing id when the conflict
-- path was taken. Atomic, no race, no advisory lock needed.

create or replace function public.beithady_ensure_wa_casual_conversation(
  p_phone_digits text,
  p_guest_name text default null
)
returns uuid language plpgsql as $$
declare
  conv_id uuid;
  guest_id uuid;
  e164 text;
begin
  if p_phone_digits is null or length(regexp_replace(p_phone_digits, '[^0-9]', '', 'g')) < 8 then
    raise exception 'invalid_phone: %', p_phone_digits;
  end if;
  e164 := '+' || regexp_replace(p_phone_digits, '[^0-9]', '', 'g');

  -- Look up guest by phone (Phase B mirror) first so we can include the
  -- FK in the INSERT path.
  select id into guest_id
    from public.beithady_guests
   where phone_e164 = e164
   limit 1;

  -- Atomic create-or-skip. ON CONFLICT (channel, external_id) collides
  -- with the unique constraint. DO NOTHING returns no row — fall
  -- through to the SELECT below to fetch the existing one.
  insert into public.beithady_conversations (
    channel, external_id, guest_id, source, state,
    guest_full_name, guest_phone, last_inbound_at,
    created_at_external, modified_at_external
  ) values (
    'wa_casual', e164, guest_id, 'whatsapp_casual', 'open',
    p_guest_name, e164, now(),
    now(), now()
  )
  on conflict (channel, external_id) do nothing
  returning id into conv_id;

  if conv_id is not null then
    return conv_id;
  end if;

  -- Lost the race or row pre-existed — fetch.
  select id into conv_id
    from public.beithady_conversations
   where channel = 'wa_casual' and external_id = e164
   limit 1;

  if conv_id is null then
    raise exception 'ensure_conv_failed_after_conflict: %', e164;
  end if;
  return conv_id;
end $$;

comment on function public.beithady_ensure_wa_casual_conversation is
'Audit fix C-D6 (0071). Returns the beithady_conversations.id for a wa_casual phone, creating the row if missing. Atomic via ON CONFLICT DO NOTHING — concurrent webhooks for the same brand-new phone no longer race on unique-key violation.';
