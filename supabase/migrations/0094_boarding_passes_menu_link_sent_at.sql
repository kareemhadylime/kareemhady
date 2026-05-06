-- 0094_boarding_passes_menu_link_sent_at.sql
--
-- Beithady F&B "Always send menu link via WhatsApp" — adds an idempotency
-- column to beithady_boarding_passes so the cron-driven menu-link send
-- (`/api/cron/fnb-send-menu-link`) only fires once per boarding pass.
--
-- - menu_link_sent_at: when the dine URL was last sent to the guest's WA
-- - menu_link_message_id: Green-API provider message id for traceability
--
-- Backfill: NULL (means "not yet sent"). For existing checked-in guests at
-- F&B-enabled buildings, the next cron tick will pick them up and send.

ALTER TABLE beithady_boarding_passes
  ADD COLUMN IF NOT EXISTS menu_link_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS menu_link_message_id text NULL;

-- Partial index to make the cron's "find eligible boarding passes" query
-- fast — usually a small set (only checked-in guests at F&B buildings,
-- not yet sent).
CREATE INDEX IF NOT EXISTS idx_boarding_passes_menu_link_pending
  ON beithady_boarding_passes (reservation_id)
  WHERE menu_link_sent_at IS NULL;
