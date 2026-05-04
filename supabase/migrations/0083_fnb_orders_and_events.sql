-- =====================================================================
-- Phase F — F&B orders, line items, and status event log
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fnb_order_status') THEN
    CREATE TYPE public.fnb_order_status AS ENUM (
      'submitted', 'preparing', 'ready', 'delivered', 'closed', 'cancelled'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.fnb_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    bigserial NOT NULL UNIQUE,
  reservation_id  text NOT NULL,           -- Guesty reservation id
  building_code   text NOT NULL,
  unit_code       text NOT NULL,
  guest_name      text,
  guest_language  text NOT NULL DEFAULT 'en'
    CHECK (guest_language IN ('en','ar','ru','fr')),
  status          public.fnb_order_status NOT NULL DEFAULT 'submitted',
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  preparing_at    timestamptz,
  ready_at        timestamptz,
  delivered_at    timestamptz,
  closed_at       timestamptz,
  cancelled_at    timestamptz,
  cancellation_reason text,
  subtotal_usd    numeric(10,2) NOT NULL,
  vat_usd         numeric(10,2) NOT NULL,
  service_usd     numeric(10,2) NOT NULL,
  total_usd       numeric(10,2) NOT NULL CHECK (total_usd >= 0),
  requested_delivery_at timestamptz,
  eta_at          timestamptz,
  notes           text,
  idempotency_key text NOT NULL UNIQUE,
  guesty_charge_id text,                    -- free-form text in v1 (manual mirror)
  guesty_charge_settled_at timestamptz,
  guesty_charge_settled_by uuid,            -- who clicked "Mark settled"
  receipt_pdf_path text,
  receipt_sent_at timestamptz,
  receipt_sent_via text,                    -- 'wa_cloud'|'wa_casual'|'guesty'|'failed'
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fnb_orders_status_live_idx
  ON public.fnb_orders(status)
  WHERE status IN ('submitted','preparing','ready');
CREATE INDEX IF NOT EXISTS fnb_orders_building_idx
  ON public.fnb_orders(building_code, submitted_at DESC);
CREATE INDEX IF NOT EXISTS fnb_orders_reservation_idx
  ON public.fnb_orders(reservation_id);
CREATE INDEX IF NOT EXISTS fnb_orders_unsettled_idx
  ON public.fnb_orders(reservation_id)
  WHERE status IN ('delivered','closed') AND guesty_charge_id IS NULL;

CREATE TABLE IF NOT EXISTS public.fnb_order_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES public.fnb_orders(id) ON DELETE CASCADE,
  item_id         uuid REFERENCES public.fnb_items(id) ON DELETE SET NULL,
  item_name_snapshot text NOT NULL,
  quantity        int NOT NULL CHECK (quantity > 0 AND quantity <= 10),
  unit_price_usd_snapshot numeric(10,2) NOT NULL,
  modifier_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  line_total_usd  numeric(10,2) NOT NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fnb_order_items_order_idx
  ON public.fnb_order_items(order_id);

CREATE TABLE IF NOT EXISTS public.fnb_status_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES public.fnb_orders(id) ON DELETE CASCADE,
  from_status     public.fnb_order_status,
  to_status       public.fnb_order_status NOT NULL,
  changed_by_user_id uuid,
  changed_via     text NOT NULL CHECK (changed_via IN ('dashboard','cron','guest','webhook')),
  at              timestamptz NOT NULL DEFAULT now(),
  notes           text
);
CREATE INDEX IF NOT EXISTS fnb_status_events_order_idx
  ON public.fnb_status_events(order_id, at);

DROP TRIGGER IF EXISTS fnb_orders_updated_at ON public.fnb_orders;
CREATE TRIGGER fnb_orders_updated_at
  BEFORE UPDATE ON public.fnb_orders
  FOR EACH ROW EXECUTE FUNCTION public.fnb_set_updated_at();
