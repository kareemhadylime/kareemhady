-- Phase C.5 — Channel Switcher
-- Lets agents redirect outbound mid-thread to a different transport
-- (Green WP / WABA / Email / SMS) with no-info revert guardrails.
--
-- New columns are NULLable + default-safe so this migration is
-- metadata-only on PG14+ and won't lock the 6,694-row conversations
-- table or the 1,011+ messages table.

-- =============================================================
-- beithady_conversations: persist optional per-thread preference
-- =============================================================
alter table public.beithady_conversations
  add column if not exists preferred_outbound_channel text null,
  add column if not exists preferred_outbound_set_at  timestamptz null;

-- Constrain to the same set the dispatcher accepts. WABA + standalone
-- email/sms are listed for forward-compat even though Phase C.5 only
-- wires guesty_* + wa_casual today.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'beithady_conversations_preferred_outbound_channel_chk'
  ) then
    alter table public.beithady_conversations
      add constraint beithady_conversations_preferred_outbound_channel_chk
      check (
        preferred_outbound_channel is null or preferred_outbound_channel in (
          'guesty_email',
          'guesty_sms',
          'guesty_whatsapp',
          'wa_casual',
          'wa_cloud',
          'email_standalone',
          'sms_standalone'
        )
      );
  end if;
end$$;

comment on column public.beithady_conversations.preferred_outbound_channel
  is 'Phase C.5 — when set, the composer defaults to this transport on next reply. NULL = use the conversation home channel (header.channel).';
comment on column public.beithady_conversations.preferred_outbound_set_at
  is 'Phase C.5 — when the preference was last updated. Used for stale-preference UX hints.';

-- =============================================================
-- beithady_messages: track cross-channel sends for audit + UI
-- =============================================================
alter table public.beithady_messages
  add column if not exists was_channel_switched     boolean not null default false,
  add column if not exists original_thread_channel  text null;

comment on column public.beithady_messages.was_channel_switched
  is 'Phase C.5 — true when this outbound was sent via a different transport than the conversation home channel.';
comment on column public.beithady_messages.original_thread_channel
  is 'Phase C.5 — the conversation home channel at the time of the send. Used by the inline "via X" badge in the thread bubble.';

-- Index used by the channel-score badge (improvement #2): "last replied
-- on this channel N hours ago." Filters outbound rows by guest +
-- channel so the lookup is point-read.
create index if not exists idx_bh_msg_guest_channel_outbound
  on public.beithady_messages (guest_id, channel, sent_at desc nulls last)
  where direction = 'outbound' and guest_id is not null;
