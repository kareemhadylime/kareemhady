-- =====================================================================
-- Phase F — F&B categories and items
-- =====================================================================

-- Categories (3 seeded in 0084: Breakfast, Sandwiches, Salads & Kids)
CREATE TABLE IF NOT EXISTS public.fnb_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  sort_order      int  NOT NULL DEFAULT 0,
  name_en         text NOT NULL,
  name_ar         text,
  name_ru         text,
  name_fr         text,
  hours_start     time NOT NULL DEFAULT '08:00',
  hours_end       time NOT NULL DEFAULT '23:59',
  enabled         boolean NOT NULL DEFAULT true,
  ai_translation_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Menu items (10 seeded in 0084 from PDF)
CREATE TABLE IF NOT EXISTS public.fnb_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid NOT NULL REFERENCES public.fnb_categories(id) ON DELETE RESTRICT,
  slug            text NOT NULL UNIQUE,
  sort_order      int  NOT NULL DEFAULT 0,
  name_en         text NOT NULL,
  name_ar         text,
  name_ru         text,
  name_fr         text,
  description_en  text,
  description_ar  text,
  description_ru  text,
  description_fr  text,
  photo_path      text,
  photo_thumb_path text,
  price_usd       numeric(10,2) NOT NULL CHECK (price_usd >= 0),
  cost_usd        numeric(10,2) CHECK (cost_usd IS NULL OR cost_usd >= 0),
  hours_start_override time,
  hours_end_override   time,
  recipe_id       uuid,                       -- nullable, future Phase F&B-2
  enabled         boolean NOT NULL DEFAULT true,
  ai_translation_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS fnb_items_category_idx
  ON public.fnb_items(category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS fnb_items_enabled_idx
  ON public.fnb_items(enabled) WHERE deleted_at IS NULL AND enabled = true;

-- updated_at triggers (mirror existing pattern in 0030)
CREATE OR REPLACE FUNCTION public.fnb_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fnb_categories_updated_at ON public.fnb_categories;
CREATE TRIGGER fnb_categories_updated_at
  BEFORE UPDATE ON public.fnb_categories
  FOR EACH ROW EXECUTE FUNCTION public.fnb_set_updated_at();

DROP TRIGGER IF EXISTS fnb_items_updated_at ON public.fnb_items;
CREATE TRIGGER fnb_items_updated_at
  BEFORE UPDATE ON public.fnb_items
  FOR EACH ROW EXECUTE FUNCTION public.fnb_set_updated_at();
