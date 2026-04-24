-- Phase 4 — Boat Rental module. New Personal-Domain sub-app with three
-- roles (admin / broker / owner), full-day reservation flow, 2-hour temp
-- holds, weekday/weekend/season pricing, Green-API WhatsApp notifications.
--
-- Tables use the public.boat_rental_* prefix convention to match the
-- existing odoo_*/guesty_*/shopify_* pattern and keep the Supabase JS
-- client (which defaults to the public schema) ergonomic.
--
-- Role model:
--   app_user_domain_roles(domain='boat-rental') → gates access to the
--     whole /emails/boat-rental/* tree (layout-level check).
--   boat_rental_user_roles(role in admin|broker|owner) → gates the
--     sub-tree within that (admin / broker / owner surfaces).

-- ---------- Owners (the human business entity — may or may not have a login) ----------
create table if not exists public.boat_rental_owners (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  whatsapp    text not null,                 -- E.164 without '+', e.g. '201234567890' (Green-API format)
  email       text,
  user_id     uuid references public.app_users(id) on delete set null,  -- linked once invited
  status      text not null default 'active' check (status in ('active','inactive')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_boat_rental_owners_user on public.boat_rental_owners(user_id) where user_id is not null;

-- ---------- Boats ----------
create table if not exists public.boat_rental_boats (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  size              text,
  features_md       text,
  capacity_guests   int not null check (capacity_guests > 0),
  owner_id          uuid not null references public.boat_rental_owners(id),
  skipper_name      text not null,
  skipper_whatsapp  text not null,           -- E.164 without '+'
  status            text not null default 'active' check (status in ('active','maintenance','inactive')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_boat_rental_boats_owner on public.boat_rental_boats(owner_id);
create index if not exists idx_boat_rental_boats_status on public.boat_rental_boats(status);

create table if not exists public.boat_rental_boat_images (
  id            uuid primary key default gen_random_uuid(),
  boat_id       uuid not null references public.boat_rental_boats(id) on delete cascade,
  storage_path  text not null,               -- Supabase Storage key: 'boats/{boat_id}/{uuid}.{ext}'
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_boat_rental_boat_images_boat on public.boat_rental_boat_images(boat_id, sort_order);

-- ---------- Pricing (current row per (boat, tier); snapshotted onto reservation) ----------
create table if not exists public.boat_rental_pricing (
  id          uuid primary key default gen_random_uuid(),
  boat_id     uuid not null references public.boat_rental_boats(id) on delete cascade,
  tier        text not null check (tier in ('weekday','weekend','season')),
  amount_egp  numeric(10,2) not null check (amount_egp >= 0),
  updated_at  timestamptz not null default now(),
  unique (boat_id, tier)
);

-- ---------- Seasons/Holidays (named date ranges — any date inside uses tier='season') ----------
create table if not exists public.boat_rental_seasons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                 -- e.g. 'Sham El-Nessim 2026', 'Eid Al-Fitr'
  start_date  date not null,
  end_date    date not null check (end_date >= start_date),
  created_at  timestamptz not null default now()
);
create index if not exists idx_boat_rental_seasons_range on public.boat_rental_seasons(start_date, end_date);

-- ---------- Destinations ----------
create table if not exists public.boat_rental_destinations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Reservations (the core state machine) ----------
-- Status lifecycle:
--   held        → broker reserved; 2-hour window to confirm payment
--   expired     → 2h window elapsed without confirmation (cron-flipped)
--   confirmed   → broker confirmed client paid; date is booked
--   details_filled → day-before trip details captured
--   paid_to_owner → broker uploaded transfer receipt OR owner marked paid
--   cancelled   → cancelled by broker/owner/admin
create table if not exists public.boat_rental_reservations (
  id                      uuid primary key default gen_random_uuid(),
  boat_id                 uuid not null references public.boat_rental_boats(id),
  booking_date            date not null,
  broker_id               uuid not null references public.app_users(id),
  status                  text not null default 'held'
                          check (status in ('held','expired','confirmed','details_filled','paid_to_owner','cancelled')),
  held_until              timestamptz,        -- populated when status='held'; checked by cron
  price_egp_snapshot      numeric(10,2) not null,
  pricing_tier_snapshot   text not null check (pricing_tier_snapshot in ('weekday','weekend','season')),
  notes                   text,               -- special trip requirements, captured at confirm-payment
  cancelled_at            timestamptz,
  cancelled_by            uuid references public.app_users(id),
  cancelled_by_role       text check (cancelled_by_role in ('admin','broker','owner')),
  cancel_reason           text,
  refund_pending          boolean not null default false,  -- flips true on confirmed→cancelled
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Prevents double-booking across any live status. A booking_date is
-- 'blocked' if there's a reservation in any pre-terminal active state.
create unique index if not exists boat_rental_reservations_active_slot_uk
  on public.boat_rental_reservations (boat_id, booking_date)
  where status in ('held','confirmed','details_filled','paid_to_owner');

create index if not exists idx_boat_rental_reservations_broker on public.boat_rental_reservations(broker_id, booking_date desc);
create index if not exists idx_boat_rental_reservations_boat_date on public.boat_rental_reservations(boat_id, booking_date desc);
create index if not exists idx_boat_rental_reservations_held_until on public.boat_rental_reservations(held_until) where status = 'held';
create index if not exists idx_boat_rental_reservations_status on public.boat_rental_reservations(status);

-- ---------- Trip details (1:1 with reservation; filled the day before) ----------
create table if not exists public.boat_rental_bookings (
  reservation_id    uuid primary key references public.boat_rental_reservations(id) on delete cascade,
  client_name       text not null,
  client_phone      text not null,
  guest_count       int not null check (guest_count > 0),
  trip_ready_time   time not null,
  destination_id    uuid not null references public.boat_rental_destinations(id),
  extra_notes       text,                    -- optional addition on top of reservation.notes
  submitted_at      timestamptz not null default now(),
  submitted_by      uuid references public.app_users(id)
);

-- ---------- Payments (broker→owner transfer proof) ----------
create table if not exists public.boat_rental_payments (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null unique references public.boat_rental_reservations(id) on delete cascade,
  amount_egp      numeric(10,2) not null,
  receipt_path    text,                      -- Supabase Storage: 'receipts/{reservation_id}/{uuid}.{ext}'; null = owner manual mark
  paid_at         timestamptz not null default now(),
  recorded_by     uuid not null references public.app_users(id),
  recorded_by_role text check (recorded_by_role in ('broker','owner','admin')),
  method          text,                      -- 'bank_transfer' | 'instapay' | 'cash' | 'manual_override'
  note            text
);

-- ---------- Audit log (every state transition) ----------
create table if not exists public.boat_rental_audit_log (
  id              bigserial primary key,
  reservation_id  uuid references public.boat_rental_reservations(id) on delete set null,
  actor_user_id   uuid references public.app_users(id),
  actor_role      text,                      -- 'admin' | 'broker' | 'owner' | 'system' (cron)
  action          text not null,             -- 'create_hold' | 'confirm_payment' | 'fill_details' | 'receipt_uploaded' | 'owner_mark_paid' | 'cancel' | 'hold_expired' | 'force_cancel'
  from_status     text,
  to_status       text,
  payload         jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_boat_rental_audit_reservation on public.boat_rental_audit_log(reservation_id, created_at desc);

-- ---------- Notifications queue (Green-API outbox) ----------
create table if not exists public.boat_rental_notifications (
  id              bigserial primary key,
  reservation_id  uuid references public.boat_rental_reservations(id) on delete cascade,
  to_user_id      uuid references public.app_users(id),
  to_phone        text not null,             -- E.164 without '+', Green-API 'chatId' = '{digits}@c.us'
  to_role         text not null check (to_role in ('admin','broker','owner','skipper')),
  channel         text not null default 'whatsapp' check (channel in ('whatsapp','email')),
  template_key    text not null,             -- 'booking_confirmed' | 'trip_details' | 'payment_received' | 'cancelled'
  language        text not null default 'en' check (language in ('en','ar')),
  rendered_body   text not null,
  status          text not null default 'pending' check (status in ('pending','sent','failed')),
  provider_msg_id text,
  error           text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index if not exists idx_boat_rental_notifications_status on public.boat_rental_notifications(status, created_at) where status = 'pending';
create index if not exists idx_boat_rental_notifications_reservation on public.boat_rental_notifications(reservation_id);

-- ---------- Role assignment (admin / broker / owner within this module) ----------
create table if not exists public.boat_rental_user_roles (
  user_id     uuid not null references public.app_users(id) on delete cascade,
  role        text not null check (role in ('admin','broker','owner')),
  owner_id    uuid references public.boat_rental_owners(id) on delete cascade, -- only used when role='owner'
  created_at  timestamptz not null default now(),
  primary key (user_id, role)
);
create index if not exists idx_boat_rental_user_roles_owner on public.boat_rental_user_roles(owner_id) where owner_id is not null;

-- ---------- Storage bucket (create manually in Supabase Dashboard if CLI unavailable) ----------
-- Run in SQL Editor if storage.buckets insert via client library isn't available:
--   insert into storage.buckets (id, name, public) values ('boat-rental', 'boat-rental', false)
--   on conflict (id) do nothing;
--
-- Bucket layout:
--   boats/{boat_id}/{uuid}.{jpg|png|webp}       -- multi-image boat gallery
--   receipts/{reservation_id}/{uuid}.{jpg|pdf}  -- broker→owner transfer proof
