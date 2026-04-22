-- Phase 10.7: raw-materials inventory for Kika / X-Label manufacturing.
-- One row per distinct material (fabric roll colour, zipper model, button
-- style). BOMs (bill-of-materials linking finished shopify_products to
-- qty × raw_material) will live in a separate product_bom table later —
-- the unique id/code here is stable so future BOMs can reference it.

create table if not exists public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  domain text not null default 'kika',        -- currently kika; future-proof for others
  code text,                                    -- internal SKU (operator-assigned)
  name text not null,
  category text not null,                       -- fabric | trim | zipper | button | thread | elastic | label | packaging | padding | decorative | misc
  subcategory text,                             -- e.g. fabric: 'knit' | 'woven' | 'mesh' | 'lace'
  color text,                                   -- for colour-keyed stock (thread / fabric)
  unit text not null default 'pc',              -- m | yd | kg | pc | sheet | pkg | roll | reel | box
  unit_cost numeric(14,4),                      -- cost per unit in EGP
  currency text not null default 'EGP',
  qty_on_hand numeric(14,3) not null default 0,
  qty_min numeric(14,3),                        -- reorder threshold; low-stock pill if qty_on_hand < qty_min
  supplier text,
  supplier_sku text,
  image_url text,
  description text,                             -- free-form notes / specs
  tags text[] not null default '{}'::text[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null
);

create index if not exists idx_raw_materials_domain on public.raw_materials (domain);
create index if not exists idx_raw_materials_category on public.raw_materials (domain, category);
create index if not exists idx_raw_materials_code on public.raw_materials (domain, code) where code is not null;
create index if not exists idx_raw_materials_low_stock on public.raw_materials (domain)
  where qty_min is not null and qty_on_hand < qty_min and active;
create index if not exists idx_raw_materials_name on public.raw_materials (domain, name);

-- Keep updated_at fresh on any row change.
create or replace function public.touch_raw_materials_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_raw_materials_updated_at on public.raw_materials;
create trigger trg_raw_materials_updated_at
  before update on public.raw_materials
  for each row execute function public.touch_raw_materials_updated_at();
