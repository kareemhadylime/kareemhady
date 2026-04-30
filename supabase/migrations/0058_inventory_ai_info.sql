-- Phase M.16 — AI-generated item info cards.
--
-- Adds a structured `ai_info` jsonb column to inventory items, populated by
-- Claude Haiku 4.5 with optional web_fetch against the canonical Amazon EG
-- URL. Card surfaces in an expandable row on /beithady/inventory/items and
-- as a tooltip on the housekeeping estimator.
--
-- Regen triggers (handled by application layer):
--   * URL change via setAmazonSourceAction (>24h cooldown)
--   * Manual "Refresh AI info" button per row (bypass cooldown)
--   * Bulk "Generate AI info for N missing" header button
--
-- ai_info_status drives the spinner UI. waitUntil() from @vercel/functions
-- runs the call after the response is sent so the operator's URL save
-- returns instantly.

ALTER TABLE beithady_inventory_items
  ADD COLUMN IF NOT EXISTS ai_info jsonb,
  ADD COLUMN IF NOT EXISTS ai_info_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_info_source text
    CHECK (ai_info_source IS NULL OR ai_info_source IN ('amazon_eg_fetch','general_knowledge')),
  ADD COLUMN IF NOT EXISTS ai_info_model text,
  ADD COLUMN IF NOT EXISTS ai_info_status text NOT NULL DEFAULT 'idle'
    CHECK (ai_info_status IN ('idle','queued','running','error')),
  ADD COLUMN IF NOT EXISTS ai_info_error text;

COMMENT ON COLUMN beithady_inventory_items.ai_info IS
  'Claude-generated item info card payload (jsonb). Schema: { summary_en, summary_ar, key_features[], usage_tips, ingredients_or_materials, warnings, pack_details, source, source_url, model, generated_at }.';

COMMENT ON COLUMN beithady_inventory_items.ai_info_status IS
  'Current regen state — drives the spinner/error UI on the items page card. idle=ai_info is current; queued=waiting for waitUntil background task; running=Claude call in flight; error=last attempt failed (see ai_info_error).';

-- Partial index so the bulk "regenerate all missing" button can find the
-- rows to enqueue without scanning the whole catalog.
CREATE INDEX IF NOT EXISTS beithady_inventory_items_ai_info_missing_idx
  ON beithady_inventory_items (id)
  WHERE ai_info IS NULL AND active;

-- History — one row per regen, capped to last 10 per item via app-layer
-- prune (cheap, no trigger needed). Used by the "previous versions" tab on
-- the AI info card so a bad URL change can be rolled back without re-running.
CREATE TABLE IF NOT EXISTS beithady_inventory_items_ai_info_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES beithady_inventory_items(id) ON DELETE CASCADE,
  ai_info jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('amazon_eg_fetch','general_knowledge')),
  source_url text,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by text  -- app_users.id of trigger; null for bulk/system runs
);

CREATE INDEX IF NOT EXISTS beithady_inventory_items_ai_info_history_item_date_idx
  ON beithady_inventory_items_ai_info_history(item_id, generated_at DESC);

COMMENT ON TABLE beithady_inventory_items_ai_info_history IS
  'Append-only log of every AI info card payload generated for an item. Used by the rollback UI on the items page. App layer prunes to last 10 per item.';
