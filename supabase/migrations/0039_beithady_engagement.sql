-- =====================================================================
-- Beithady v2 — Phase F: Loyalty · Upsell · Pre-arrival · CSAT · Boarding · Tasks
-- =====================================================================
-- Guest-experience capstone: 7 tables wiring together the lifecycle
-- from booking → -48h upsell → -24h pre-arrival → boarding pass mint →
-- check-in → +24h CSAT survey → loyalty tier tick.
--
-- Cron schedule (added to vercel.json):
--   0 4 * * *   loyalty-tick         (06:00 Cairo)
--   0 8 * * *   pre-arrival          (10:00 Cairo)
--   30 8 * * *  boarding-pass        (10:30 Cairo)
--   0 10 * * *  upsell-offer         (12:00 Cairo)
--   0 13 * * *  csat-survey          (15:00 Cairo)

-- =====================================================================
-- 1. Loyalty config — replaces the hardcoded LOYALTY_TIERS constant
-- =====================================================================
create table if not exists public.beithady_loyalty_config (
  tier            text primary key check (tier in ('none','bronze','silver','gold','platinum')),
  label           text not null,
  emoji           text,
  min_stays       int not null,
  perks           jsonb not null default '{}'::jsonb,
  display_color   text,
  message_template text,                                    -- WhatsApp/email body sent on tier promotion. {guest_name} placeholder
  updated_at      timestamptz not null default now()
);
insert into public.beithady_loyalty_config (tier, label, emoji, min_stays, perks, display_color, message_template) values
  ('none',     'New',      '·',  0,  '{}'::jsonb, '#94A3B8', null),
  ('bronze',   'Bronze',   '🥉', 2,  '{"late_checkout":true}'::jsonb, '#CD7F32',
   'Hi {guest_name}, thank you for staying with Beit Hady again! You are now a Bronze guest — late checkout when available is yours on every future stay.'),
  ('silver',   'Silver',   '🥈', 4,  '{"late_checkout":true,"upgrade_when_available":true}'::jsonb, '#C0C0C0',
   'Hi {guest_name}, welcome to Silver tier with Beit Hady! You now qualify for late checkout AND a free upgrade when available on every stay.'),
  ('gold',     'Gold',     '🥇', 6,  '{"late_checkout":true,"upgrade_when_available":true,"welcome_gift":true}'::jsonb, '#D4A93A',
   'Hi {guest_name}, you have just unlocked Gold tier with Beit Hady — late checkout, free upgrade when available, and a welcome gift in every apartment from now on.'),
  ('platinum', 'Platinum', '💎', 10, '{"late_checkout":true,"upgrade_when_available":true,"welcome_gift":true,"vip_flag":true,"direct_book_discount_pct":10}'::jsonb, '#E5E4E2',
   'Hi {guest_name}, you are now a Beit Hady Platinum guest. From this stay forward: late checkout, free upgrade, welcome gift, VIP concierge, and 10% off every direct rebooking.')
on conflict (tier) do update set
  label = excluded.label,
  emoji = excluded.emoji,
  min_stays = excluded.min_stays,
  perks = excluded.perks,
  display_color = excluded.display_color,
  message_template = coalesce(public.beithady_loyalty_config.message_template, excluded.message_template);

-- =====================================================================
-- 2. Upsell catalog
-- =====================================================================
create table if not exists public.beithady_upsell_catalog (
  id                  uuid primary key default gen_random_uuid(),
  building_code       text,                                  -- null = all buildings
  sku                 text not null,
  name                text not null,
  description         text,
  price_usd           numeric(10,2) not null,
  enabled             boolean not null default true,
  ai_targeting_hint   text,                                   -- 'family_with_kids' | 'couple' | 'business' | 'any'
  payment_mode        text not null default 'on_arrival' check (payment_mode in ('on_arrival','stripe_link')),
  stripe_price_id     text,                                   -- only when payment_mode='stripe_link'
  payment_link_url    text,
  display_order       int not null default 100,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_bh_upsell_enabled on public.beithady_upsell_catalog(enabled, display_order) where enabled = true;
create index if not exists idx_bh_upsell_building on public.beithady_upsell_catalog(building_code);

-- Seed default catalogue applicable to all buildings (user customizes in Settings)
insert into public.beithady_upsell_catalog (sku, name, description, price_usd, ai_targeting_hint, display_order) values
  ('early_checkin',    'Early check-in (12pm)',          'Get into your apartment up to 3 hours earlier so you can drop bags + freshen up.', 20.00, 'any', 10),
  ('late_checkout',    'Late checkout (2pm)',            'Skip the rush — keep the apartment until 2pm on departure day.', 25.00, 'any', 20),
  ('airport_transfer', 'Airport transfer',                'Air-conditioned private car from CAI airport to your apartment, 24/7.', 35.00, 'family_with_kids', 30),
  ('grocery_stocking', 'Pre-arrival grocery stocking',   'Send us your grocery list — we stock the fridge before you arrive.', 30.00, 'family_with_kids', 40),
  ('photographer',     '1-hour photographer',             'Professional photographer for 60 min in your apartment or rooftop. Perfect for couples + influencers.', 95.00, 'couple', 50),
  ('birthday_setup',   'Birthday cake + balloons',        'Cake of your choice + balloons in the living room before check-in.', 45.00, 'family_with_kids', 60),
  ('cleaning_extra',   'Mid-stay clean (1 visit)',        '90-minute apartment refresh with linen change + fresh towels.', 40.00, 'any', 70)
on conflict do nothing;

-- =====================================================================
-- 3. Upsell offers (per-reservation)
-- =====================================================================
create table if not exists public.beithady_upsell_offers (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  text not null,
  guest_id        uuid references public.beithady_guests(id) on delete set null,
  building_code   text,
  offered_skus    text[] not null,
  message_id      uuid references public.beithady_messages(id) on delete set null,
  status          text not null default 'sent' check (status in ('queued','sent','viewed','accepted','declined','paid')),
  accepted_skus   text[] default '{}',
  total_usd       numeric(10,2),
  paid_at         timestamptz,
  declined_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (reservation_id)
);
create index if not exists idx_bh_upsell_offers_status on public.beithady_upsell_offers(status, created_at desc);
create index if not exists idx_bh_upsell_offers_guest on public.beithady_upsell_offers(guest_id);

-- =====================================================================
-- 4. Pre-arrival templates (per-building)
-- =====================================================================
create table if not exists public.beithady_pre_arrival_templates (
  id              uuid primary key default gen_random_uuid(),
  building_code   text unique,                                -- one row per building, null=fallback
  language        text not null default 'en',
  body            text not null,                              -- placeholders: {guest_name}, {listing}, {check_in}, {host_phone}
  enabled         boolean not null default true,
  hours_before    int not null default 24,
  updated_at      timestamptz not null default now()
);

insert into public.beithady_pre_arrival_templates (building_code, body) values
  (null,
   E'Hi {guest_name},\n\nWelcome to Beit Hady — your apartment {listing} is ready for {check_in}.\n\nKey details:\n• Check-in from 3pm. The host can let you in earlier if the apartment is ready.\n• Wi-Fi name + password are written on the welcome card on the kitchen counter.\n• A/C remote sits on top of the TV cabinet in the living room.\n• Host on call 24/7: {host_phone}\n\nIf you''re flying in, message us your flight number and we''ll meet you at the door.\n\nSee you soon!\nBeit Hady team'),
  ('BH-26',
   E'Hi {guest_name},\n\nQuick checklist for your stay at {listing} starting {check_in}:\n• Building entry: ground-floor concierge, mention your name\n• Apartment key: with the concierge — show ID\n• A/C remote: kitchen drawer next to the fridge\n• Wi-Fi: BH26-Guest, password on the welcome card\n• Gas safety: please open a window when cooking — the kitchen has a balcony\n• Host 24/7: {host_phone}\n\nMessage us if anything''s not perfect.\nBeit Hady team'),
  ('BH-73',
   E'Hi {guest_name},\n\nQuick checklist for your stay at {listing} starting {check_in}:\n• Building entry: door code is in the next message — keep it private\n• Lift: 2nd floor, apartment door has the Beit Hady badge\n• A/C remote: hall console near the front door\n• Wi-Fi: BH73-Guest, password on the welcome card\n• Parking: rear entrance, mention "Beit Hady" to the attendant\n• Host 24/7: {host_phone}\n\nLet us know if you need anything!\nBeit Hady team'),
  ('BH-435',
   E'Hi {guest_name},\n\nWelcome to A1 Hospitality at {listing} — check-in {check_in}.\n• Reception is open 24/7 — they have your room card and welcome envelope\n• Breakfast is served on the rooftop 7-11am (included)\n• A/C, smart TV, wi-fi: instructions inside the welcome folder\n• Pool + gym access on rooftop, 6am-11pm\n• Concierge 24/7: {host_phone}\n\nLet us know if you need anything.\nA1 Hospitality · Beit Hady team'),
  ('BH-OK',
   E'Hi {guest_name},\n\nQuick checklist for your stay at {listing} starting {check_in}:\n• Entry: ground-floor doorman, mention "Beit Hady — apartment {listing}"\n• Keys: handed by the host on arrival\n• A/C: smart thermostat in the hall, set + forget\n• Wi-Fi: BH-OK-Guest, password on welcome card\n• Host 24/7: {host_phone}\n\nLooking forward to hosting you.\nBeit Hady team')
on conflict (building_code) do nothing;

-- =====================================================================
-- 5. Pre-arrival messages log (idempotency)
-- =====================================================================
create table if not exists public.beithady_pre_arrival_messages (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  text not null,
  guest_id        uuid references public.beithady_guests(id) on delete set null,
  building_code   text,
  template_used   text,
  message_id      uuid references public.beithady_messages(id) on delete set null,
  scheduled_for   timestamptz not null,
  sent_at         timestamptz,
  error           text,
  created_at      timestamptz not null default now(),
  unique (reservation_id, template_used)
);
create index if not exists idx_bh_prearrival_scheduled on public.beithady_pre_arrival_messages(scheduled_for) where sent_at is null;

-- =====================================================================
-- 6. CSAT responses
-- =====================================================================
create table if not exists public.beithady_csat_responses (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  text not null,
  guest_id        uuid references public.beithady_guests(id) on delete set null,
  building_code   text,
  token           text unique not null,                       -- public response page token
  message_id      uuid references public.beithady_messages(id) on delete set null,
  asked_at        timestamptz,                                -- when we sent the survey
  responded_at    timestamptz,
  nps             int check (nps between 0 and 10),
  comment         text,
  ai_sentiment    text,
  needs_followup  boolean not null default false,
  followup_task_id uuid,
  expires_at      timestamptz,                                -- token expiry, default 14d
  created_at      timestamptz not null default now(),
  unique (reservation_id)
);
create index if not exists idx_bh_csat_followup on public.beithady_csat_responses(needs_followup) where needs_followup = true;

-- =====================================================================
-- 7. Boarding passes (passwordless URL)
-- =====================================================================
create table if not exists public.beithady_boarding_passes (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  text unique not null,
  guest_id        uuid references public.beithady_guests(id) on delete set null,
  building_code   text,
  listing_id      text,
  token           text unique not null,                       -- 192-bit base64url
  expires_at      timestamptz not null,
  message_id      uuid references public.beithady_messages(id) on delete set null,
  sent_at         timestamptz,
  viewed_at       timestamptz,
  view_count      int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists idx_bh_boarding_reservation on public.beithady_boarding_passes(reservation_id);

-- =====================================================================
-- 8. Tasks queue
-- =====================================================================
create table if not exists public.beithady_tasks (
  id                uuid primary key default gen_random_uuid(),
  guest_id          uuid references public.beithady_guests(id) on delete set null,
  reservation_id    text,
  building_code     text,
  type              text not null,                            -- 'pre_arrival_check' | 'csat_followup' | 'review_ask' | 'manual' | 'mid_stay_outreach' | 'win_back'
  title             text not null,
  notes             text,
  due_at            timestamptz,
  status            text not null default 'open' check (status in ('open','done','snoozed','cancelled')),
  priority          text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assignee_user_id  uuid references public.app_users(id),
  created_by_user_id uuid references public.app_users(id),
  metadata          jsonb default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz,
  completed_by_user_id uuid references public.app_users(id)
);
create index if not exists idx_bh_tasks_assignee_open on public.beithady_tasks(assignee_user_id) where status='open';
create index if not exists idx_bh_tasks_due on public.beithady_tasks(due_at) where status='open';
create index if not exists idx_bh_tasks_priority_open on public.beithady_tasks(priority, due_at) where status='open';
create index if not exists idx_bh_tasks_type on public.beithady_tasks(type, status);

-- =====================================================================
-- 9. Helpers
-- =====================================================================

-- Tier recompute — runs daily. Reads min_stays from beithady_loyalty_config.
create or replace function public.beithady_loyalty_recompute()
returns table (
  promoted_count int,
  by_tier jsonb
) language plpgsql as $$
declare
  promo_count int := 0;
  result jsonb;
begin
  with tiers as (
    select tier, min_stays,
           row_number() over (order by min_stays desc) as rn
      from public.beithady_loyalty_config
  ),
  patches as (
    update public.beithady_guests g
       set loyalty_tier = (
         select t.tier from tiers t
          where g.lifetime_stays >= t.min_stays
          order by t.min_stays desc
          limit 1
       )
     where g.loyalty_tier is distinct from (
         select t.tier from tiers t
          where g.lifetime_stays >= t.min_stays
          order by t.min_stays desc
          limit 1
       )
    returning g.id, g.loyalty_tier
  )
  select count(*) into promo_count from patches;

  select coalesce(jsonb_object_agg(loyalty_tier, c), '{}'::jsonb) into result
    from (select loyalty_tier, count(*) as c from public.beithady_guests group by loyalty_tier) x;

  return query select promo_count, result;
end $$;

-- Auto-promote platinums to VIP — keeps guest VIP flag in sync with tier.
create or replace function public.beithady_loyalty_sync_vip()
returns int language plpgsql as $$
declare
  affected int;
begin
  update public.beithady_guests
     set vip = true
   where loyalty_tier = 'platinum' and vip = false;
  get diagnostics affected = row_count;
  return affected;
end $$;

insert into public.beithady_audit_log(module, action, metadata) values
  ('communication', 'phase_f_installed',
   jsonb_build_object('migration', '0039_beithady_engagement', 'phase', 'F'));
