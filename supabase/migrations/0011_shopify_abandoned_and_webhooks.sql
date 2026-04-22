-- Phase 10.5: abandoned checkouts + webhook event log.
-- Abandoned checkouts: Shopify's /admin/api/2024-10/checkouts.json surfaces
-- the last ~30d of cart sessions that never converted. Completed ones have a
-- completed_at timestamp; truly-abandoned rows have it NULL.
-- Webhook events: audit every POST into /api/webhooks/shopify so failed
-- deliveries are visible when Shopify's dashboard isn't handy.

create table if not exists public.shopify_abandoned_checkouts (
  id bigint primary key,
  shop_domain text not null,
  token text,                             -- unique per session, also in URL
  email text,
  phone text,
  customer_id bigint,
  customer_name text,
  currency text,
  total_price numeric(14,2),
  subtotal_price numeric(14,2),
  total_tax numeric(14,2),
  total_discounts numeric(14,2),
  line_items_count int,
  line_items jsonb,                       -- compact array of {title, qty, price, product_id, variant_id}
  abandoned_checkout_url text,            -- recovery link shoppers can be emailed
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz,               -- NULL = still abandoned
  raw jsonb,
  synced_at timestamptz not null default now()
);
create index if not exists idx_shopify_abandoned_created
  on public.shopify_abandoned_checkouts (created_at desc);
-- Partial index for the common "truly still abandoned" query path.
create index if not exists idx_shopify_abandoned_open
  on public.shopify_abandoned_checkouts (created_at desc)
  where completed_at is null;
create index if not exists idx_shopify_abandoned_email
  on public.shopify_abandoned_checkouts (email)
  where email is not null;

create table if not exists public.shopify_webhook_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  topic text,                             -- orders/create, refunds/create, ...
  shop_domain text,
  shopify_webhook_id text,                -- X-Shopify-Webhook-Id header (dedup)
  status text not null,                   -- processed | skipped | error | hmac_failed | unknown_topic
  duration_ms int,
  error text,
  payload_size int,
  order_id bigint                         -- if parsable from payload for orders/* topics
);
create index if not exists idx_shopify_webhook_events_received
  on public.shopify_webhook_events (received_at desc);
-- Fast path for "show me recent failures" queries.
create index if not exists idx_shopify_webhook_events_status
  on public.shopify_webhook_events (status)
  where status <> 'processed';
create index if not exists idx_shopify_webhook_events_topic
  on public.shopify_webhook_events (topic, received_at desc);

-- Extend the sync-runs counter set so the abandoned-checkouts phase can
-- report completion like the other phases.
alter table public.shopify_sync_runs
  add column if not exists abandoned_checkouts_synced int not null default 0;
