-- =====================================================================
-- Beithady v2 — Phase I: Lead pipeline + AI review reply
-- =====================================================================
-- Closes the build. Two new tables:
--   - beithady_leads — sales kanban (new → contacted → quoted → booked → lost)
--   - beithady_review_replies — AI-drafted multi-lang replies to
--     guesty_reviews, agent approves + posts back via Guesty.
--
-- Also: links website-form leads to ads_leads when phones match,
-- closing the loop with Phase H attribution.

-- 1. Sales pipeline (website forms + manual + ads conversions)
create table if not exists public.beithady_leads (
  id                  uuid primary key default gen_random_uuid(),
  -- Source classification
  source              text not null check (source in ('website','whatsapp','instagram','manual','ads','referral','agent','direct_inquiry')),
  source_external_id  text,
  -- Identity
  full_name           text,
  email               text,
  phone_e164          text,
  -- What they want
  message             text,
  listing_interest    text,                                 -- e.g. "BH-26 1BR" or building code
  building_interest   text,
  travel_dates        jsonb,                                -- {check_in, check_out, nights, guests}
  budget_usd          numeric(10,2),
  -- Cross-references
  guest_id            uuid references public.beithady_guests(id) on delete set null,
  ad_lead_id          bigint references public.ads_leads(id) on delete set null,
  reservation_id      text,                                 -- guesty_reservations.id when booked
  -- Pipeline stage
  stage               text not null default 'new' check (stage in ('new','contacted','quoted','booked','lost')),
  rating              int check (rating between 0 and 5),
  lost_reason         text,
  notes               text,
  -- Assignment
  assignee_user_id    uuid references public.app_users(id),
  -- Timestamps
  contacted_at        timestamptz,
  quoted_at           timestamptz,
  booked_at           timestamptz,
  lost_at             timestamptz,
  raw_payload         jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_bh_leads_stage on public.beithady_leads(stage, created_at desc);
create index if not exists idx_bh_leads_assignee on public.beithady_leads(assignee_user_id) where stage not in ('booked','lost');
create index if not exists idx_bh_leads_phone on public.beithady_leads(phone_e164);
create index if not exists idx_bh_leads_email on public.beithady_leads(lower(email));
create index if not exists idx_bh_leads_source on public.beithady_leads(source, created_at desc);
create index if not exists idx_bh_leads_guest on public.beithady_leads(guest_id) where guest_id is not null;
create index if not exists idx_bh_leads_ad on public.beithady_leads(ad_lead_id) where ad_lead_id is not null;

-- Touch trigger
drop trigger if exists beithady_leads_touch on public.beithady_leads;
create trigger beithady_leads_touch
  before update on public.beithady_leads
  for each row execute function public.beithady_guests_touch_updated();

-- Auto-stamp stage transition timestamps
create or replace function public.beithady_leads_stamp_stage()
returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    if new.stage = 'contacted' and new.contacted_at is null then new.contacted_at := now(); end if;
    if new.stage = 'quoted'    and new.quoted_at    is null then new.quoted_at    := now(); end if;
    if new.stage = 'booked'    and new.booked_at    is null then new.booked_at    := now(); end if;
    if new.stage = 'lost'      and new.lost_at      is null then new.lost_at      := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists beithady_leads_stage_stamp on public.beithady_leads;
create trigger beithady_leads_stage_stamp
  before update on public.beithady_leads
  for each row execute function public.beithady_leads_stamp_stage();

-- Auto-link to ads_leads when phone matches
create or replace function public.beithady_leads_link_ads()
returns trigger language plpgsql as $$
declare
  ads_id bigint;
begin
  if new.phone_e164 is null or new.ad_lead_id is not null then return new; end if;
  select id into ads_id
    from public.ads_leads
   where phone_e164 = new.phone_e164
     and matched_reservation_id is null
     and created_at > now() - interval '90 days'
   order by created_at desc
   limit 1;
  if ads_id is not null then
    new.ad_lead_id := ads_id;
  end if;
  return new;
end $$;
drop trigger if exists beithady_leads_link_ads on public.beithady_leads;
create trigger beithady_leads_link_ads
  before insert on public.beithady_leads
  for each row execute function public.beithady_leads_link_ads();

-- 2. AI review replies — staged drafts agents approve + send
create table if not exists public.beithady_review_replies (
  id                  uuid primary key default gen_random_uuid(),
  guesty_review_id    text not null references public.guesty_reviews(id) on delete cascade,
  language            text,                                 -- ISO 639-1 detected from review
  rating              int,                                  -- snapshot from review
  reviewer_name       text,
  ai_draft            text,
  agent_final         text,
  status              text not null default 'draft' check (status in ('draft','approved','sent','dismissed','failed')),
  approved_by_user_id uuid references public.app_users(id),
  approved_at         timestamptz,
  sent_at             timestamptz,
  send_error          text,
  prompt_version      text default 'v1',
  model               text default 'claude-haiku-4-5',
  raw                 jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (guesty_review_id)
);
create index if not exists idx_bh_review_replies_status on public.beithady_review_replies(status, created_at desc);

drop trigger if exists beithady_review_replies_touch on public.beithady_review_replies;
create trigger beithady_review_replies_touch
  before update on public.beithady_review_replies
  for each row execute function public.beithady_guests_touch_updated();

-- Helpful view: pipeline counts per stage (powers kanban headers)
create or replace view public.beithady_pipeline_counts as
select stage, count(*) as cnt, count(*) filter (where stage not in ('booked','lost')) as open_cnt
  from public.beithady_leads
 group by stage;

insert into public.beithady_audit_log(module, action, metadata) values
  ('crm', 'phase_i_installed',
   jsonb_build_object('migration', '0041_beithady_pipeline_reviews', 'phase', 'I'));
