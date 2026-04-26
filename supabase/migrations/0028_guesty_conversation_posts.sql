-- Daily-report v2: per-message mirror of Guesty conversation posts so
-- the report can compute response time, message counts, and per-agent
-- ranking (Q4 + Q5 of v2 plan).
--
-- Schema mirrors GuestyConversationPost (src/lib/guesty.ts ~L400). The
-- sentBy field is the canonical author role; `from.type` is a finer
-- breakdown ('employee' vs 'guest'). `module.type` distinguishes channel
-- (email/sms/whatsapp/log).
--
-- Sync strategy (W1=Y): first run pulls posts for conversations active
-- in the last 90 days; daily incremental thereafter only re-pulls
-- conversations whose `last_message_*` timestamp moved.

create table if not exists public.guesty_conversation_posts (
  id text primary key,                          -- Guesty post _id
  conversation_id text not null,                -- soft FK; older convs may be archived
  account_id text,
  reservation_id text,                          -- denormalized from module.reservationId
  -- Authorship
  sent_by text,                                 -- 'host' | 'guest' | 'log'
  from_type text,                               -- 'employee' | 'guest' | 'log'
  from_full_name text,                          -- agent display name when sent_by='host'
  is_automatic boolean,                         -- Guesty template-engine sends
  -- Channel
  module_type text,                             -- 'email' | 'sms' | 'whatsapp' | 'log'
  module_subject text,                          -- email subject when applicable
  -- Content
  body_text text,                               -- prefer plainTextBody, fallback to body
  -- Timestamps
  created_at_guesty timestamptz not null,
  raw jsonb,
  synced_at timestamptz not null default now()
);
create index if not exists idx_gcp_conv_created
  on public.guesty_conversation_posts (conversation_id, created_at_guesty);
create index if not exists idx_gcp_sentby_created
  on public.guesty_conversation_posts (sent_by, created_at_guesty desc);
create index if not exists idx_gcp_created_global
  on public.guesty_conversation_posts (created_at_guesty desc);
create index if not exists idx_gcp_agent
  on public.guesty_conversation_posts (from_full_name)
  where sent_by = 'host' and is_automatic = false;

-- Extend the per-run counter so cron logs surface posts synced separately.
alter table public.guesty_sync_runs
  add column if not exists posts_synced int not null default 0;
