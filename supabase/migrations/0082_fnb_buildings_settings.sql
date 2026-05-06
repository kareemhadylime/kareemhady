-- =====================================================================
-- Phase F — Per-building F&B settings
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fnb_buildings (
  building_code   text PRIMARY KEY,
  enabled         boolean NOT NULL DEFAULT false,
  kitchen_wa_recipients text[] NOT NULL DEFAULT '{}',
  delivery_sla_minutes int NOT NULL DEFAULT 30 CHECK (delivery_sla_minutes > 0),
  receipt_vat_line text,
  message_template_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  cancellation_grace_seconds int NOT NULL DEFAULT 120
    CHECK (cancellation_grace_seconds BETWEEN 30 AND 300),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS fnb_buildings_updated_at ON public.fnb_buildings;
CREATE TRIGGER fnb_buildings_updated_at
  BEFORE UPDATE ON public.fnb_buildings
  FOR EACH ROW EXECUTE FUNCTION public.fnb_set_updated_at();

-- Seed all 5 Egypt buildings as DISABLED (admin enables per-building
-- via Settings UI in Task 56 once recipient WA numbers are configured).
-- BH-DXB intentionally NOT seeded — F&B is Egypt-only per spec §6.
INSERT INTO public.fnb_buildings (building_code, enabled, delivery_sla_minutes)
VALUES
  ('BH-26',  false, 30),
  ('BH-73',  false, 30),
  ('BH-435', false, 30),
  ('BH-OK',  false, 30),
  ('BH-34',  false, 30)
ON CONFLICT (building_code) DO NOTHING;
