-- Phase C.5 follow-up: recover orphaned posts whose parent conversation
-- never landed in guesty_conversations (Guesty's webhook subscription
-- doesn't fire conversation.created for this account; only the daily
-- 4:40 UTC pull was creating new conv rows).
--
-- This RPC returns up to N orphan conversation_ids ordered by latest
-- post recency. Caller (the every-5-min comm-sync cron) fetches each
-- via Guesty Open API and upserts into guesty_conversations.

create or replace function public.beithady_orphan_conv_ids(p_limit int default 50)
returns table(conversation_id text, post_count int, latest_post_at timestamptz)
language sql
stable
as $$
  select
    gcp.conversation_id,
    count(*)::int as post_count,
    max(gcp.created_at_guesty) as latest_post_at
  from public.guesty_conversation_posts gcp
  left join public.guesty_conversations gc on gc.id = gcp.conversation_id
  where gc.id is null
    and gcp.conversation_id is not null
  group by gcp.conversation_id
  order by max(gcp.created_at_guesty) desc nulls last
  limit greatest(1, least(p_limit, 500));
$$;

comment on function public.beithady_orphan_conv_ids(int)
  is 'Phase C.5 follow-up — returns conversation_ids that have posts but no parent row in guesty_conversations. Caller fetches each via Guesty API and upserts.';
