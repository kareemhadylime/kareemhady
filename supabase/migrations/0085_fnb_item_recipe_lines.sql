-- =====================================================================
-- Phase F&B-2 (recipe v1.5) — recipe lines per menu item
-- =====================================================================
-- Each menu item can have 0..N ingredient lines pointing at a row in
-- the existing beithady_inventory_items catalog. Sale-time deduction
-- ships in Phase F&B-3 — this migration is the schema + read path.

CREATE TABLE IF NOT EXISTS public.fnb_item_recipe_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id             uuid NOT NULL REFERENCES public.fnb_items(id) ON DELETE CASCADE,
  inventory_item_id   uuid NOT NULL REFERENCES public.beithady_inventory_items(id) ON DELETE RESTRICT,
  quantity            numeric(10,3) NOT NULL CHECK (quantity > 0),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, inventory_item_id)
);
CREATE INDEX IF NOT EXISTS fnb_recipe_lines_item_idx
  ON public.fnb_item_recipe_lines(item_id);

DROP TRIGGER IF EXISTS fnb_recipe_lines_updated_at ON public.fnb_item_recipe_lines;
CREATE TRIGGER fnb_recipe_lines_updated_at
  BEFORE UPDATE ON public.fnb_item_recipe_lines
  FOR EACH ROW EXECUTE FUNCTION public.fnb_set_updated_at();
