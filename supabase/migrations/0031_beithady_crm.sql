-- =====================================================================
-- Beithady v2 — Phase B: CRM read-only
-- =====================================================================
-- Single-tenant guest mirror dedup'd from guesty_conversations
-- (guesty_guest_id) + guesty_reservations (email/phone match). Lifetime
-- stats (stays, nights, spend USD) computed in the daily sync cron at
-- 30 5 * * * UTC. Timeline cache is built upfront (W-1 decision) so
-- the 360° page loads in <500ms without expensive joins per request.
--
-- AI summary is generated for top 100 guests asynchronously by the
-- same cron run; lower-volume guests get summaries on first profile open.

-- 1. Guests
create table if not exists public.beithady_guests (
  id                      uuid primary key default gen_random_uuid(),
  guesty_guest_id         text unique,
  full_name               text,
  email                   text,
  phone_e164              text,
  language                text,
  residence_country       text,                 -- ISO 3166 alpha-2
  residence_city          text,
  marketing_opt_in        boolean default false,
  vip                     boolean default false,
  loyalty_tier            text default 'none' check (loyalty_tier in ('none','bronze','silver','gold','platinum')),
  lifetime_stays          int default 0,
  lifetime_nights         int default 0,
  lifetime_spend_usd      numeric(14,2) default 0,
  first_seen              timestamptz,
  last_seen               timestamptz,
  next_arrival_at         timestamptz,          -- soonest future check-in
  preferred_channel       text,                 -- 'whatsapp' | 'email' | 'guesty'
  custom_fields           jsonb default '{}'::jsonb,
  tags                    text[] default '{}',
  ai_summary              text,
  ai_summary_updated_at   timestamptz,
  ai_summary_model        text,
  source_signals          jsonb default '{}'::jsonb,  -- {has_conversation:true, reservation_count:n, sources:['airbnb','direct']}
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists idx_bh_guests_country on public.beithady_guests(residence_country);
create index if not exists idx_bh_guests_vip on public.beithady_guests(vip) where vip=true;
create index if not exists idx_bh_guests_phone on public.beithady_guests(phone_e164);
create index if not exists idx_bh_guests_email_lower on public.beithady_guests(lower(email));
create index if not exists idx_bh_guests_last_seen on public.beithady_guests(last_seen desc);
create index if not exists idx_bh_guests_next_arrival on public.beithady_guests(next_arrival_at) where next_arrival_at is not null;
create index if not exists idx_bh_guests_loyalty on public.beithady_guests(loyalty_tier) where loyalty_tier <> 'none';
create index if not exists idx_bh_guests_tags_gin on public.beithady_guests using gin(tags);
create index if not exists idx_bh_guests_lifetime_stays on public.beithady_guests(lifetime_stays desc);

-- 2. Internal notes (separate from guests.internal_notes blob so we
--    keep author + timestamp + pinned per note).
create table if not exists public.beithady_guest_notes (
  id              uuid primary key default gen_random_uuid(),
  guest_id        uuid not null references public.beithady_guests(id) on delete cascade,
  author_user_id  uuid references public.app_users(id),
  body            text not null,
  pinned          boolean default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_bh_guest_notes_guest on public.beithady_guest_notes(guest_id, created_at desc);
create index if not exists idx_bh_guest_notes_pinned on public.beithady_guest_notes(guest_id) where pinned=true;

-- 3. Saved segments — JSON filter spec, owner + shared flag
create table if not exists public.beithady_guest_segments (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  description        text,
  filter             jsonb not null,           -- { country:[], tier:[], min_stays:n, has_future:bool, ... }
  owner_user_id      uuid references public.app_users(id),
  shared             boolean default false,
  last_executed_at   timestamptz,
  last_member_count  int,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_bh_segments_owner on public.beithady_guest_segments(owner_user_id);

-- 4. Timeline cache — built upfront per W-1. One row per guest with a
--    JSON array of timeline events (booking, message, review, note,
--    task) sorted desc. Refreshed by the CRM sync cron.
create table if not exists public.beithady_guest_timeline_cache (
  guest_id        uuid primary key references public.beithady_guests(id) on delete cascade,
  events          jsonb not null default '[]'::jsonb,
  bookings_count  int default 0,
  messages_count  int default 0,
  reviews_count   int default 0,
  notes_count     int default 0,
  refreshed_at    timestamptz not null default now()
);
create index if not exists idx_bh_timeline_refreshed on public.beithady_guest_timeline_cache(refreshed_at desc);

-- 5. CRM sync run log — observability for the daily cron
create table if not exists public.beithady_crm_sync_runs (
  id              uuid primary key default gen_random_uuid(),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  trigger         text not null default 'cron',  -- cron|manual|backfill
  status          text not null default 'running' check (status in ('running','success','partial','error')),
  guests_upserted int default 0,
  timeline_refreshed int default 0,
  ai_summaries_generated int default 0,
  error           text,
  details         jsonb
);
create index if not exists idx_bh_crm_runs_started on public.beithady_crm_sync_runs(started_at desc);

-- 6. Touch trigger for guests.updated_at on every row update
create or replace function public.beithady_guests_touch_updated()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists beithady_guests_touch on public.beithady_guests;
create trigger beithady_guests_touch
  before update on public.beithady_guests
  for each row execute function public.beithady_guests_touch_updated();

drop trigger if exists beithady_guest_notes_touch on public.beithady_guest_notes;
create trigger beithady_guest_notes_touch
  before update on public.beithady_guest_notes
  for each row execute function public.beithady_guests_touch_updated();

drop trigger if exists beithady_segments_touch on public.beithady_guest_segments;
create trigger beithady_segments_touch
  before update on public.beithady_guest_segments
  for each row execute function public.beithady_guests_touch_updated();

-- 7. Audit row recording the migration
insert into public.beithady_audit_log(module, action, metadata) values
  ('crm', 'phase_b_installed',
   jsonb_build_object('migration', '0031_beithady_crm', 'phase', 'B'));
