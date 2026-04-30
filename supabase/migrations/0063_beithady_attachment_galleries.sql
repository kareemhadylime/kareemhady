-- Phase C.5 follow-up: shareable multi-attachment galleries.
create table if not exists public.beithady_attachment_galleries (
  id                  uuid primary key default gen_random_uuid(),
  token               text not null unique,
  conversation_id     uuid references public.beithady_conversations(id) on delete cascade,
  created_by_user_id  uuid references public.app_users(id) on delete set null,
  items               jsonb not null,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz
);

create index if not exists idx_bh_gallery_token
  on public.beithady_attachment_galleries(token);

create index if not exists idx_bh_gallery_conv
  on public.beithady_attachment_galleries(conversation_id, created_at desc)
  where conversation_id is not null;

comment on table public.beithady_attachment_galleries
  is 'Phase C.5 — shareable multi-attachment galleries.';
