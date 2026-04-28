-- =====================================================================
-- Phase O.1 — Guesty webhook events log
-- =====================================================================
-- Applied via MCP. Canonical source kept here for the migrations folder.
--
-- Stores every Guesty webhook POST received for forensics, dedup, and
-- replay. Idempotency via UNIQUE (unique_key) partial index.

CREATE TABLE IF NOT EXISTS guesty_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  unique_key text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','processed','duplicate','error','unauthorized','ignored')),
  error text,
  reservation_id text,
  conversation_id text,
  message_id text,
  payload jsonb NOT NULL,
  http_headers jsonb,
  source_ip text
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_gwe_unique_key
  ON guesty_webhook_events (unique_key) WHERE unique_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gwe_event_name ON guesty_webhook_events (event_name);
CREATE INDEX IF NOT EXISTS idx_gwe_received ON guesty_webhook_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_gwe_status ON guesty_webhook_events (status);
CREATE INDEX IF NOT EXISTS idx_gwe_reservation ON guesty_webhook_events (reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gwe_conversation ON guesty_webhook_events (conversation_id) WHERE conversation_id IS NOT NULL;

COMMENT ON TABLE guesty_webhook_events IS
'Phase O — Real-time Guesty webhook event log. Every POST persists a row here BEFORE processing. status=processed once payload merged into guesty_conversations + guesty_conversation_posts.';
