-- =====================================================================
-- Phase F — F&B item modifiers + per-building stock-out overrides
-- =====================================================================

-- Modifiers / add-ons per item (e.g. "Replace Ful w/ Sausage Ful +$3")
CREATE TABLE IF NOT EXISTS public.fnb_item_modifiers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid NOT NULL REFERENCES public.fnb_items(id) ON DELETE CASCADE,
  sort_order      int  NOT NULL DEFAULT 0,
  name_en         text NOT NULL,
  name_ar         text,
  name_ru         text,
  name_fr         text,
  price_delta_usd numeric(10,2) NOT NULL CHECK (price_delta_usd >= 0),
  enabled         boolean NOT NULL DEFAULT true,
  ai_translation_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fnb_modifiers_item_idx
  ON public.fnb_item_modifiers(item_id);

-- Per-building stock-out flags (single global menu, per-building stockouts)
CREATE TABLE IF NOT EXISTS public.fnb_building_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_code   text NOT NULL,
  item_id         uuid NOT NULL REFERENCES public.fnb_items(id) ON DELETE CASCADE,
  is_out_of_stock boolean NOT NULL DEFAULT false,
  out_of_stock_until timestamptz,            -- auto-clears at next Cairo midnight
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_code, item_id)
);
CREATE INDEX IF NOT EXISTS fnb_overrides_building_idx
  ON public.fnb_building_overrides(building_code) WHERE is_out_of_stock = true;

DROP TRIGGER IF EXISTS fnb_modifiers_updated_at ON public.fnb_item_modifiers;
CREATE TRIGGER fnb_modifiers_updated_at
  BEFORE UPDATE ON public.fnb_item_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.fnb_set_updated_at();

DROP TRIGGER IF EXISTS fnb_overrides_updated_at ON public.fnb_building_overrides;
CREATE TRIGGER fnb_overrides_updated_at
  BEFORE UPDATE ON public.fnb_building_overrides
  FOR EACH ROW EXECUTE FUNCTION public.fnb_set_updated_at();
