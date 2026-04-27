-- =====================================================================
-- Beithady v2 — Phase E: AI auto-reply
-- =====================================================================
-- Reads ai_confidence_threshold + ai_auto_reply_enabled + vip_digest_enabled
-- from beithady_settings (seeded by Phase A) and respects the
-- beithady_conversations.ai_kill_switch flag (wired by Phase C.2).
--
-- Decision rule:
--   1) ai_auto_reply_enabled === false                → suggested_only
--   2) conversation.ai_kill_switch === true           → killed_by_switch
--   3) guest.vip === true                             → killed_vip_review
--   4) confidence < threshold                         → killed_low_confidence
--   5) classification ∈ {complaint, refund, urgent}   → suggested_only (always agent-reviewed)
--   6) else                                           → auto_sent
--
-- Auto-sent messages still get logged + appear in the VIP digest (when
-- VIP) so admins can revert within the 48h Cloud-API delete window.

-- 1. Reply log — one row per inbound classification + decision
create table if not exists public.beithady_ai_reply_log (
  id                  uuid primary key default gen_random_uuid(),
  inbound_message_id  uuid references public.beithady_messages(id) on delete cascade,
  outbound_message_id uuid references public.beithady_messages(id) on delete set null,
  conversation_id     uuid references public.beithady_conversations(id) on delete cascade,
  guest_id            uuid references public.beithady_guests(id) on delete set null,
  channel             text not null check (channel in ('guesty','wa_cloud','wa_casual')),
  classification      text,
  confidence          numeric(4,3),
  suggested_reply     text,
  language_detected   text,
  decision            text not null check (decision in (
    'auto_sent','suggested_only','killed_by_switch','killed_low_confidence',
    'killed_vip_review','killed_disabled','killed_classification','error'
  )),
  agent_action        text check (agent_action in ('sent_as_is','edited','dismissed','reverted','regenerated','accepted')),
  agent_action_at     timestamptz,
  agent_user_id       uuid references public.app_users(id),
  agent_final_body    text,
  reverted            boolean not null default false,
  reverted_by_user_id uuid references public.app_users(id),
  reverted_at         timestamptz,
  prompt_version      text not null default 'v1',
  model               text not null default 'claude-haiku-4-5',
  raw                 jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists idx_bh_ai_log_decision on public.beithady_ai_reply_log(decision, created_at desc);
create index if not exists idx_bh_ai_log_conv on public.beithady_ai_reply_log(conversation_id, created_at desc);
create index if not exists idx_bh_ai_log_inbound on public.beithady_ai_reply_log(inbound_message_id);
create index if not exists idx_bh_ai_log_classification on public.beithady_ai_reply_log(classification, created_at desc);
create index if not exists idx_bh_ai_log_auto_sent_recent on public.beithady_ai_reply_log(created_at desc) where decision = 'auto_sent';

-- 2. Pending suggestions are stored on beithady_messages directly via
--    the existing ai_classification + ai_confidence + ai_suggested_reply
--    columns (already created in Phase C.1 schema). Phase E populates
--    them as part of the auto-reply pipeline.

-- 3. Helper view: latest unactioned suggestion per conversation (powers
--    the suggestion strip in the composer).
create or replace view public.beithady_pending_suggestions as
select
  l.id as log_id,
  l.conversation_id,
  l.inbound_message_id,
  l.classification,
  l.confidence,
  l.suggested_reply,
  l.language_detected,
  l.created_at,
  m.body as inbound_body,
  m.sent_at as inbound_sent_at
from public.beithady_ai_reply_log l
join public.beithady_messages m on m.id = l.inbound_message_id
where l.decision = 'suggested_only'
  and l.agent_action is null
  and l.suggested_reply is not null;

-- 4. Helper view: 24-hour VIP digest queue
create or replace view public.beithady_vip_digest_24h as
select
  l.id,
  l.conversation_id,
  l.classification,
  l.confidence,
  l.suggested_reply,
  l.created_at,
  c.guest_full_name,
  c.guest_phone,
  c.guest_email,
  c.listing_nickname,
  c.building_code,
  g.vip,
  g.loyalty_tier
from public.beithady_ai_reply_log l
join public.beithady_conversations c on c.id = l.conversation_id
left join public.beithady_guests g on g.id = c.guest_id
where l.decision = 'auto_sent'
  and l.created_at >= now() - interval '24 hours'
  and (g.vip is true or g.loyalty_tier in ('gold','platinum'));

insert into public.beithady_audit_log(module, action, metadata) values
  ('communication', 'phase_e_installed',
   jsonb_build_object('migration', '0038_beithady_ai_replies', 'phase', 'E'));
