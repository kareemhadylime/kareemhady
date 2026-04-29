-- Phase Q.2 — message templates + listing secrets (wifi password, gate code etc.)
-- One migration carries both because they're co-deployed: the wifi_password
-- variable in templates resolves from beithady_listing_secrets.

create table if not exists public.beithady_message_templates (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  channel         text[] not null default '{}'::text[],   -- ['guesty','wa_cloud','wa_casual']
  source_filter   text[] not null default '{}'::text[],   -- ['airbnb','booking','whatsapp'] empty=any
  language        text not null default 'en' check (language in ('en','ar','auto')),
  category        text not null default 'general' check (category in (
    'greeting','checkin','checkout','policy','upsell','escalation','inquiry','general'
  )),
  body            text not null,
  sort_order      int not null default 100,
  active          boolean not null default true,
  created_by_user_id uuid references public.app_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_bh_templates_active on public.beithady_message_templates(active, sort_order)
  where active = true;
create index if not exists idx_bh_templates_category on public.beithady_message_templates(category, sort_order)
  where active = true;

create table if not exists public.beithady_listing_secrets (
  listing_id     text primary key references public.guesty_listings(id) on delete cascade,
  wifi_ssid      text,
  wifi_password  text,
  gate_code      text,
  parking_notes  text,
  checkin_time   text default '15:00',
  custom_kv      jsonb default '{}'::jsonb,
  updated_by_user_id uuid references public.app_users(id),
  updated_at     timestamptz not null default now()
);

-- Touch trigger
create or replace function public.beithady_templates_touch() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
drop trigger if exists beithady_templates_touch_trg on public.beithady_message_templates;
create trigger beithady_templates_touch_trg
  before update on public.beithady_message_templates
  for each row execute function public.beithady_templates_touch();
drop trigger if exists beithady_listing_secrets_touch_trg on public.beithady_listing_secrets;
create trigger beithady_listing_secrets_touch_trg
  before update on public.beithady_listing_secrets
  for each row execute function public.beithady_templates_touch();

-- 8 seed templates (per workflow §3 + Q.0 doc) — see migration apply for full bodies.
-- Audit row inserted at apply time.
