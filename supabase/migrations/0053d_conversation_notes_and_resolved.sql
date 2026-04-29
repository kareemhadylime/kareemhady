-- Phase Q.4 — internal staff notes + mark-resolved on conversations.

create table if not exists public.beithady_conversation_notes (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.beithady_conversations(id) on delete cascade,
  author_user_id  uuid not null references public.app_users(id),
  body            text not null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_bh_conv_notes_conv
  on public.beithady_conversation_notes(conversation_id, created_at desc);

alter table public.beithady_conversations
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_reason text check (resolved_reason in (
    'resolved', 'spam', 'no_response', 'booked', 'duplicate'
  )),
  add column if not exists resolved_by_user_id uuid references public.app_users(id);

create index if not exists idx_bh_conv_resolved
  on public.beithady_conversations(resolved_at desc) where resolved_at is not null;
