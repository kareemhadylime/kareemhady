-- =====================================================================
-- Phase F (F&B v1) — harden CHECK constraints from 0083
-- =====================================================================
-- 0083 set CHECK (total_usd >= 0) on fnb_orders but omitted analogous
-- checks for the component columns (subtotal/vat/service) and for
-- fnb_order_items.line_total_usd. Adds those plus a CHECK on
-- receipt_sent_via to match the inline comment's documented set.

ALTER TABLE public.fnb_orders
  ADD CONSTRAINT fnb_orders_subtotal_non_negative
    CHECK (subtotal_usd >= 0);

ALTER TABLE public.fnb_orders
  ADD CONSTRAINT fnb_orders_vat_non_negative
    CHECK (vat_usd >= 0);

ALTER TABLE public.fnb_orders
  ADD CONSTRAINT fnb_orders_service_non_negative
    CHECK (service_usd >= 0);

ALTER TABLE public.fnb_orders
  ADD CONSTRAINT fnb_orders_receipt_sent_via_check
    CHECK (
      receipt_sent_via IS NULL
      OR receipt_sent_via IN ('wa_cloud', 'wa_casual', 'guesty', 'failed')
    );

ALTER TABLE public.fnb_order_items
  ADD CONSTRAINT fnb_order_items_line_total_non_negative
    CHECK (line_total_usd >= 0);
