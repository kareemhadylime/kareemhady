-- =====================================================================
-- Beithady Unit Templates — shared photo library across identical units
-- =====================================================================
-- A "unit template" represents one floor plan. Multiple physical
-- listings (e.g. 101/201/301/401, all the Type-A units in BH-26)
-- can share the same template so a single uploaded photo lands in
-- every member's gallery without row duplication.
--
-- Storage object: still one per upload.
-- Asset row: still one per upload (with unit_template_id set, listing_id null).
-- Listing rows: unchanged (each unit stays bookable independently).

create table if not exists public.beithady_unit_templates (
  id              uuid primary key default gen_random_uuid(),
  building_code   text not null,
  name            text not null,
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_bh_unit_templates_building
  on public.beithady_unit_templates(building_code);

-- Listings can opt into a template.
alter table public.guesty_listings
  add column if not exists unit_template_id uuid references public.beithady_unit_templates(id) on delete set null;
create index if not exists idx_guesty_listings_unit_template
  on public.guesty_listings(unit_template_id) where unit_template_id is not null;

-- Assets can be scoped to a template instead of (or in addition to) a listing.
alter table public.beithady_gallery_assets
  add column if not exists unit_template_id uuid references public.beithady_unit_templates(id) on delete set null;
create index if not exists idx_bh_gallery_unit_template
  on public.beithady_gallery_assets(unit_template_id) where deleted_at is null and unit_template_id is not null;
create index if not exists idx_bh_gallery_template_sort
  on public.beithady_gallery_assets(unit_template_id, sort_order)
  where deleted_at is null and unit_template_id is not null;

-- Touch trigger
drop trigger if exists beithady_unit_templates_touch on public.beithady_unit_templates;
create trigger beithady_unit_templates_touch
  before update on public.beithady_unit_templates
  for each row execute function public.beithady_guests_touch_updated();

-- Seed BH-26 with the 4 vertical-stack groupings.
do $$
declare
  tpl_a uuid; tpl_b uuid; tpl_c uuid; tpl_d uuid;
begin
  insert into public.beithady_unit_templates(building_code, name, description) values
    ('BH-26', 'BH-26 Type A · 3BR Pool',         'Luxury 3-bedroom 3-ensuite with pool. Floors 1-4: 101 / 201 / 301 / 401.')
    returning id into tpl_a;
  insert into public.beithady_unit_templates(building_code, name, description) values
    ('BH-26', 'BH-26 Type B · 2BR Pool',         'Luxury 2-bedroom 1-ensuite with pool. Floors 1-4: 102 / 202 / 302 / 402.')
    returning id into tpl_b;
  insert into public.beithady_unit_templates(building_code, name, description) values
    ('BH-26', 'BH-26 Type C · Smart Studio',     'Smart studio with king bed. Floors 1-4: 103 / 203 / 303 / 403.')
    returning id into tpl_c;
  insert into public.beithady_unit_templates(building_code, name, description) values
    ('BH-26', 'BH-26 Type D · 3BR Apt Pool',     'Elegant 3-bedroom 3-ensuite apartment with pool. Floors 1-4: 104 / 204 / 304 / 404.')
    returning id into tpl_d;

  update public.guesty_listings set unit_template_id = tpl_a where id in (
    '683c12a7f69e2f00120dc247', '6840abba33647e0012819334',
    '6840abc674ad770010661896', '684f1741022471001a1e911f'
  );
  update public.guesty_listings set unit_template_id = tpl_b where id in (
    '683c12abac9d7200139ff7ef', '6840abc06c68ed0012c5bf05',
    '6840abc7d6ec000013a66503', '684f20f517cd8c00295fdb2f'
  );
  update public.guesty_listings set unit_template_id = tpl_c where id in (
    '683c127ef69e2f00120dbfb1', '6840abc102465e000f9bf395',
    '6840abc79a8f0b001ad9a467', '684f25cb354ac70012fe5ad6'
  );
  update public.guesty_listings set unit_template_id = tpl_d where id in (
    '683c127a6caa4b0014b015cf', '6840abc29a8f0b001ad9a374',
    '6840abcba5a923001aeab1e4', '684f2b112c6ef60010bcb586'
  );
end $$;

insert into public.beithady_audit_log(module, action, metadata) values
  ('gallery', 'unit_templates_seeded',
   jsonb_build_object('migration', '0067_beithady_unit_templates', 'building', 'BH-26', 'templates', 4, 'listings', 16));
