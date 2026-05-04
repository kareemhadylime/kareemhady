-- =====================================================================
-- Phase F (F&B v1) — add UNIQUE (item_id, sort_order) to fnb_item_modifiers
-- =====================================================================
-- 0084 inserts seed modifiers without an ON CONFLICT clause because the
-- table had no composite unique constraint at the time. This makes the
-- seed migration non-idempotent under manual replay (Supabase's migration
-- runner tracks applied migrations and prevents auto-replay, but worktree-
-- branch workflows may reset and replay). Adding the UNIQUE allows the
-- seed (and any future seeds) to use ON CONFLICT (item_id, sort_order)
-- DO NOTHING.

ALTER TABLE public.fnb_item_modifiers
  ADD CONSTRAINT fnb_item_modifiers_item_sort_order_key
    UNIQUE (item_id, sort_order);
