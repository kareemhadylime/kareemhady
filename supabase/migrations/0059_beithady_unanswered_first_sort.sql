-- Phase C.5 follow-up: 'unanswered first' sort option.

alter table public.beithady_conversations
  add column if not exists is_unanswered boolean generated always as (
    last_inbound_at is not null and (last_outbound_at is null or last_inbound_at > last_outbound_at)
  ) stored;

create index if not exists idx_bh_conv_unanswered_recent
  on public.beithady_conversations(is_unanswered desc, last_inbound_at desc nulls last)
  where state = 'open' and archived_at is null;

comment on column public.beithady_conversations.is_unanswered
  is 'Phase C.5 — true when guest has messaged after our last reply (or we never replied). Drives the unanswered_first sort.';
