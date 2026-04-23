-- Phase 11 (Phase 3 of the email→API migration). Guesty messaging mirror.
-- Replaces the email-parsing Beithady inquiry + guest-request aggregators.
--
-- Discovery notes (2026-04-23):
--   GET /v1/communication/conversations returns:
--     { status, data: { count, countUnread, cursor:{after,before}, conversations:[...] } }
--   Cursor pagination, not skip-based. 6,618 conversations on tenant today.
--   Each conversation embeds guest + primary reservation (with listing).
--
-- Posts/messages live under /v1/communication/conversations/{id}/posts —
-- deferred to a follow-up migration (guesty_conversation_posts). This
-- table alone is enough to count inquiries / in-stay messages + flag
-- unread/high-priority conversations for manual attention.

create table if not exists public.guesty_conversations (
  id text primary key,                    -- Guesty _id
  account_id text,

  priority int,                           -- 10 = normal, higher = urgent
  state_status text,                      -- 'OPEN' | 'CLOSED'
  state_read boolean,                     -- false → unread
  assignee_id text,                       -- Guesty employee id

  last_message_user_at timestamptz,       -- host/employee's last message
  last_message_nonuser_at timestamptz,    -- guest's last message

  guest_id text,
  guest_full_name text,
  guest_email text,
  guest_phone text,
  guest_is_returning boolean,
  guest_contact_type text,                -- 'guest' | ...

  -- Primary reservation (the first reservation in meta.reservations[]).
  -- Conversations can span multiple reservations; we denormalize the first
  -- one for fast aggregation. `raw.meta.reservations` has the full list.
  -- No FK: conversations reference reservations outside our 365d mirror
  -- window (older archived conversations, or newly-inquiry reservations
  -- not yet synced), so enforce referential integrity softly via the
  -- nullable text column.
  reservation_id text,
  reservation_source text,                -- 'airbnb2' | 'manual' | 'booking.com' | ...
  reservation_status text,                -- 'inquiry' | 'confirmed' | 'checked_in' | ...
  reservation_confirmation_code text,
  reservation_check_in timestamptz,
  reservation_check_out timestamptz,

  listing_id text,                        -- No FK for the same reason.
  listing_nickname text,
  listing_title text,
  listing_building_code text,
  listing_tags text[],

  created_at_guesty timestamptz,
  modified_at_guesty timestamptz,

  raw jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists idx_guesty_conv_created on public.guesty_conversations (created_at_guesty desc);
create index if not exists idx_guesty_conv_modified on public.guesty_conversations (modified_at_guesty desc);
create index if not exists idx_guesty_conv_last_nonuser on public.guesty_conversations (last_message_nonuser_at desc);
create index if not exists idx_guesty_conv_res_status on public.guesty_conversations (reservation_status);
create index if not exists idx_guesty_conv_res_source on public.guesty_conversations (reservation_source);
create index if not exists idx_guesty_conv_state on public.guesty_conversations (state_status, state_read);
create index if not exists idx_guesty_conv_building on public.guesty_conversations (listing_building_code);
create index if not exists idx_guesty_conv_listing on public.guesty_conversations (listing_id);

-- Extend the sync run counter
alter table public.guesty_sync_runs
  add column if not exists conversations_synced int not null default 0;
