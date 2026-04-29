-- Phase Q.3 — listing photo + asset library for the inbox composer.

create table if not exists public.beithady_listing_assets (
  id              uuid primary key default gen_random_uuid(),
  listing_id      text not null references public.guesty_listings(id) on delete cascade,
  category        text not null default 'photo' check (category in (
    'photo', 'wifi_card', 'gate_diagram', 'parking_diagram', 'checklist'
  )),
  storage_path    text not null,
  public_url      text not null,
  caption         text,
  mime_type       text,
  size_bytes      bigint,
  sort_order      int not null default 100,
  uploaded_by_user_id uuid references public.app_users(id),
  created_at      timestamptz not null default now()
);
create index if not exists idx_bh_listing_assets_listing
  on public.beithady_listing_assets(listing_id, category, sort_order, created_at desc);
