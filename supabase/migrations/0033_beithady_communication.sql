-- =====================================================================
-- Beithady v2 — Phase C: Communication v1
-- =====================================================================
-- Channel-agnostic message + conversation store. Mirrors the existing
-- guesty_conversations + guesty_conversation_posts tables into a unified
-- shape that also accommodates WhatsApp Cloud (official Meta WABA) and
-- WhatsApp Casual (Green-API) once those gateways are wired.
--
-- For Phase C MVP we populate from Guesty only — WA Cloud and WA Casual
-- get their own ingest paths in follow-up phases (Cloud after the
-- Beithady WABA is provisioned, Casual after we add the Green-API
-- inbound webhook and media support).

create table if not exists public.beithady_conversations (
  id                       uuid primary key default gen_random_uuid(),
  channel                  text not null check (channel in ('guesty','wa_cloud','wa_casual')),
  external_id              text not null,
  guest_id                 uuid references public.beithady_guests(id) on delete set null,
  reservation_id           text,
  building_code            text,
  source                   text,                 -- airbnb | booking.com | direct | vrbo | ...
  state                    text default 'open' check (state in ('open','closed')),
  unread_count             int default 0,
  assignee_user_id         uuid references public.app_users(id),
  tags                     text[] default '{}',
  -- Denormalized guest + listing for fast sidebar render
  guest_full_name          text,
  guest_email              text,
  guest_phone              text,
  listing_id               text,
  listing_nickname         text,
  -- SLA tracking
  last_inbound_at          timestamptz,          -- guest's last message
  last_outbound_at         timestamptz,          -- our last reply
  sla_age_seconds          int,                  -- now() - last_inbound_at if last_inbound > last_outbound; else null
  sla_bucket               text,                 -- green | yellow | orange | red | none
  sla_breach               boolean default false,
  -- AI gating
  ai_kill_switch           boolean default false,
  -- Status timestamps
  created_at_external      timestamptz,
  modified_at_external     timestamptz,
  raw                      jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (channel, external_id)
);
create index if not exists idx_bh_conv_state on public.beithady_conversations(channel, state, last_inbound_at desc nulls last);
create index if not exists idx_bh_conv_assignee on public.beithady_conversations(assignee_user_id) where state='open';
create index if not exists idx_bh_conv_sla_bucket on public.beithady_conversations(sla_bucket) where state='open';
create index if not exists idx_bh_conv_breach on public.beithady_conversations(sla_breach) where sla_breach=true;
create index if not exists idx_bh_conv_guest on public.beithady_conversations(guest_id) where guest_id is not null;
create index if not exists idx_bh_conv_building on public.beithady_conversations(building_code) where building_code is not null;
create index if not exists idx_bh_conv_source on public.beithady_conversations(source);
create index if not exists idx_bh_conv_modified on public.beithady_conversations(modified_at_external desc nulls last);
create index if not exists idx_bh_conv_tags_gin on public.beithady_conversations using gin(tags);

create table if not exists public.beithady_messages (
  id                       uuid primary key default gen_random_uuid(),
  channel                  text not null check (channel in ('guesty','wa_cloud','wa_casual')),
  external_id              text,
  conversation_id          uuid references public.beithady_conversations(id) on delete cascade,
  conversation_external_id text,
  direction                text not null check (direction in ('inbound','outbound')),
  guest_id                 uuid references public.beithady_guests(id) on delete set null,
  reservation_id           text,
  building_code            text,
  -- Channel-specific sub-channel: email | sms | whatsapp | log (Guesty)
  -- For wa_cloud + wa_casual, always 'whatsapp'.
  module_type              text,
  module_subject           text,                 -- email subject when applicable
  body                     text,
  body_html                text,
  attachments              jsonb default '[]'::jsonb,
  template_name            text,                 -- Meta WABA template name when sent via template
  is_automatic             boolean default false, -- Guesty template engine OR our AI auto-send
  -- Authorship
  from_full_name           text,                 -- e.g. agent display name
  from_type                text,                 -- 'employee' | 'guest' | 'log'
  sent_by_user_id          uuid references public.app_users(id),
  -- AI metadata (populated by Phase E auto-reply)
  ai_classification        text,
  ai_confidence            numeric(4,3),
  ai_suggested_reply       text,
  ai_used_for_auto_send    boolean default false,
  -- Status
  delivery_status          text,                 -- sent | delivered | read | failed
  delivery_error           text,
  raw                      jsonb,
  sent_at                  timestamptz,
  created_at               timestamptz not null default now(),
  unique (channel, external_id)
);
create index if not exists idx_bh_msg_conv on public.beithady_messages(conversation_id, sent_at desc nulls last);
create index if not exists idx_bh_msg_guest on public.beithady_messages(guest_id, sent_at desc nulls last) where guest_id is not null;
create index if not exists idx_bh_msg_inbound on public.beithady_messages(conversation_id) where direction='inbound';
create index if not exists idx_bh_msg_channel_sent on public.beithady_messages(channel, sent_at desc nulls last);
create index if not exists idx_bh_msg_classification on public.beithady_messages(ai_classification) where ai_classification is not null;

-- Touch trigger for conversations.updated_at
drop trigger if exists beithady_conv_touch on public.beithady_conversations;
create trigger beithady_conv_touch
  before update on public.beithady_conversations
  for each row execute function public.beithady_guests_touch_updated();

-- Communication ingest run log
create table if not exists public.beithady_comm_sync_runs (
  id                  uuid primary key default gen_random_uuid(),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  trigger             text not null default 'cron',
  status              text not null default 'running' check (status in ('running','success','partial','error')),
  conversations_upserted int default 0,
  messages_upserted   int default 0,
  sla_recomputed      int default 0,
  error               text,
  details             jsonb
);
create index if not exists idx_bh_comm_runs_started on public.beithady_comm_sync_runs(started_at desc);

-- Audit row
insert into public.beithady_audit_log(module, action, metadata) values
  ('communication', 'phase_c_installed',
   jsonb_build_object('migration', '0033_beithady_communication', 'phase', 'C'));
