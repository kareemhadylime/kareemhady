-- Phase 3B — conversation message bodies + Claude classification. Adds
-- the first + latest guest-posted message bodies as columns on
-- guesty_conversations so the inquiry/request aggregators can populate
-- `by_category[]` from real classifications instead of leaving it empty.
--
-- Decision: inline on guesty_conversations instead of a separate posts
-- table. We only need the first + latest guest message for classification;
-- a full posts mirror (~20k rows) is deferred unless/until we want to
-- show full message history in the UI. The `raw` field on the conv can
-- always be re-fetched from Guesty if we need to replay individual posts.

alter table public.guesty_conversations
  add column if not exists first_guest_post_text text,
  add column if not exists first_guest_post_at timestamptz,
  add column if not exists latest_guest_post_text text,
  add column if not exists latest_guest_post_at timestamptz,
  add column if not exists guest_post_count int,      -- total # of guest (nonuser) posts seen
  add column if not exists host_post_count int,       -- total # of host/employee posts seen
  add column if not exists posts_synced_at timestamptz,
  -- Claude Haiku classification (reused prompts from email aggregators).
  -- Shape for inquiry rules:
  --   { kind: 'inquiry', category: 'location_info'|...|'other',
  --     summary, needs_manual_attention, model, classified_at }
  -- Shape for request rules:
  --   { kind: 'request', category: 'date_change'|...|'other',
  --     urgency: 'immediate'|'high'|'normal', summary, suggested_action,
  --     model, classified_at }
  add column if not exists classification jsonb,
  add column if not exists classification_input_hash text,  -- SHA-256 of the text we classified — skip if unchanged
  add column if not exists classified_at timestamptz;

create index if not exists idx_guesty_conv_latest_guest on public.guesty_conversations (latest_guest_post_at desc);
create index if not exists idx_guesty_conv_classified on public.guesty_conversations (classified_at);
create index if not exists idx_guesty_conv_classification_category on public.guesty_conversations ((classification->>'category'));
create index if not exists idx_guesty_conv_classification_kind on public.guesty_conversations ((classification->>'kind'));
create index if not exists idx_guesty_conv_classification_urgency on public.guesty_conversations ((classification->>'urgency'));

-- Sync run metadata
alter table public.guesty_sync_runs
  add column if not exists conversation_posts_fetched int not null default 0,
  add column if not exists conversations_classified int not null default 0;
