-- Phase 10.2: Shopify order mirror for KIKA (kika-swim-wear). Daily cron
-- syncs recent orders so the sales dashboard can trend revenue / AOV /
-- product mix without round-tripping to Shopify on every page load.

create table if not exists public.shopify_orders (
  id bigint primary key,
  shop_domain text not null,
  name text,                              -- '#18925'
  email text,
  customer_id bigint,
  customer_name text,
  created_at timestamptz,
  processed_at timestamptz,
  cancelled_at timestamptz,
  financial_status text,
  fulfillment_status text,
  currency text,
  subtotal numeric(14,2),
  total numeric(14,2),
  total_discounts numeric(14,2),
  total_tax numeric(14,2),
  total_shipping numeric(14,2),
  refunded_amount numeric(14,2),
  tags text[],
  line_item_count int,
  raw jsonb,
  synced_at timestamptz not null default now()
);
create index if not exists idx_shopify_orders_created on public.shopify_orders (created_at desc);
create index if not exists idx_shopify_orders_financial on public.shopify_orders (financial_status);
create index if not exists idx_shopify_orders_customer on public.shopify_orders (customer_id);

create table if not exists public.shopify_line_items (
  id bigint primary key,
  order_id bigint not null references public.shopify_orders(id) on delete cascade,
  product_id bigint,
  variant_id bigint,
  title text,
  name text,
  sku text,
  vendor text,
  quantity int,
  price numeric(14,2),
  total_discount numeric(14,2),
  synced_at timestamptz not null default now()
);
create index if not exists idx_shopify_line_items_order on public.shopify_line_items (order_id);
create index if not exists idx_shopify_line_items_product on public.shopify_line_items (product_id);

create table if not exists public.shopify_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null default 'manual',
  status text not null default 'running',
  orders_synced int not null default 0,
  line_items_synced int not null default 0,
  error text
);
create index if not exists idx_shopify_sync_runs_started on public.shopify_sync_runs (started_at desc);
