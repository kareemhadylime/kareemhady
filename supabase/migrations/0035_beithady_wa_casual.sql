-- =====================================================================
-- Beithady v2 — Phase C.3: WhatsApp Casual (Green-API) two-way
-- =====================================================================
-- Adds:
--   1. Supabase Storage bucket for WhatsApp media (voice notes,
--      images, files) — public-read so Green-API can fetch URLs.
--   2. green_webhook_events table — raw event log for debugging and
--      idempotency. Webhook handler dedupes on Green-API's own event
--      identifier so a retry doesn't duplicate messages.
--   3. Helper to create a WhatsApp Casual conversation lazily on
--      first inbound from a phone we haven't seen yet.

-- 1. Storage bucket. public=true so Green-API's downloader can fetch
--    voice/file URLs without signed-URL juggling. RLS still enforced
--    on the storage.objects table — we add a permissive read policy
--    + restrict writes to the service role only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'beithady-wa-media',
  'beithady-wa-media',
  true,
  20 * 1024 * 1024,  -- 20MB cap per object (voice notes are tiny; files cap at 20MB)
  array[
    'audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav',
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf','application/zip',
    'video/mp4','video/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Read policy: anyone can read (file URLs go to Green-API's CDN).
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='beithady_wa_media_read') then
    create policy beithady_wa_media_read on storage.objects
      for select to public
      using (bucket_id = 'beithady-wa-media');
  end if;
end $$;

-- 2. Webhook event log
create table if not exists public.beithady_green_webhook_events (
  id                uuid primary key default gen_random_uuid(),
  green_event_id    text,                   -- idMessage when present
  type_webhook      text not null,          -- 'incomingMessageReceived' | 'outgoingMessageStatus' | 'stateInstanceChanged' | ...
  raw               jsonb not null,
  processed         boolean not null default false,
  processed_at      timestamptz,
  message_id        uuid references public.beithady_messages(id) on delete set null,
  conversation_id   uuid references public.beithady_conversations(id) on delete set null,
  error             text,
  received_at       timestamptz not null default now()
);
create unique index if not exists idx_bh_green_event_uniq on public.beithady_green_webhook_events(green_event_id) where green_event_id is not null;
create index if not exists idx_bh_green_received on public.beithady_green_webhook_events(received_at desc);
create index if not exists idx_bh_green_unprocessed on public.beithady_green_webhook_events(processed) where processed = false;

-- 3. Helper: ensure a wa_casual conversation exists for a given phone.
-- Returns the beithady_conversations.id. Creates the row if missing
-- + tries to link to an existing beithady_guests row by phone_e164.
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

  -- Try existing
  select id into conv_id
    from public.beithady_conversations
   where channel = 'wa_casual' and external_id = e164
   limit 1;
  if conv_id is not null then return conv_id; end if;

  -- Look up guest by phone (Phase B mirror)
  select id into guest_id
    from public.beithady_guests
   where phone_e164 = e164
   limit 1;

  insert into public.beithady_conversations (
    channel, external_id, guest_id, source, state,
    guest_full_name, guest_phone, last_inbound_at,
    created_at_external, modified_at_external
  ) values (
    'wa_casual', e164, guest_id, 'whatsapp_casual', 'open',
    p_guest_name, e164, now(),
    now(), now()
  )
  returning id into conv_id;

  return conv_id;
end $$;

insert into public.beithady_audit_log(module, action, metadata) values
  ('communication', 'phase_c3_installed',
   jsonb_build_object('migration', '0035_beithady_wa_casual', 'phase', 'C.3'));
