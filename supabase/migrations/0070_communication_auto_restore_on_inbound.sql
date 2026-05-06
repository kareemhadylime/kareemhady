-- 2026-05-02 Communication module audit — C-B2 + C-B3
-- Auto-restore on inbound: when a new inbound message lands, clear the
-- parent conversation's archived_at / resolved_at so it surfaces in the
-- active inbox again. Pre-fix the auto-archive cron + manual archive
-- were one-way; the UI's "any new inbound message auto-restores them"
-- promise was never implemented.
--
-- DB confirms one current victim: conv 9a8c6d16-29fa-4abb-bb78-0ed89ade9a6f
-- has 5 inbound messages AFTER its auto_cron_90d archive timestamp.
--
-- Implementation: trigger on beithady_messages AFTER INSERT/UPDATE.
-- When a row with direction='inbound' lands and the parent conv has
-- archived_at or resolved_at set, clear them in one atomic SQL statement.
-- Covers the Guesty SQL ingest path AND the WA Casual TS ingest path
-- AND any future direct inserts.

CREATE OR REPLACE FUNCTION beithady_comm_auto_restore_on_inbound()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.direction <> 'inbound' THEN
    RETURN NEW;
  END IF;
  -- Cheap precheck: only update if there's actually something to clear.
  -- Keeps the hot path fast on the common case (already-active convs).
  PERFORM 1
    FROM beithady_conversations
    WHERE id = NEW.conversation_id
      AND (archived_at IS NOT NULL OR resolved_at IS NOT NULL);
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  -- Atomic restore. Note: state='open' is the canonical column the
  -- inbox filter uses (.eq('state','open')). archived_reason is set to
  -- 'restore_undo' which is in the 0058a CHECK allowlist.
  UPDATE beithady_conversations
    SET archived_at = NULL,
        archived_reason = CASE WHEN archived_at IS NOT NULL THEN 'restore_undo' ELSE archived_reason END,
        resolved_at = NULL,
        state = 'open'
    WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_beithady_comm_auto_restore_on_inbound ON beithady_messages;
CREATE TRIGGER trg_beithady_comm_auto_restore_on_inbound
  AFTER INSERT OR UPDATE OF direction ON beithady_messages
  FOR EACH ROW
  EXECUTE FUNCTION beithady_comm_auto_restore_on_inbound();

COMMENT ON FUNCTION beithady_comm_auto_restore_on_inbound IS
'Audit fix C-B2/C-B3 (0070). Clears beithady_conversations.archived_at + resolved_at + flips state=''open'' when an inbound message lands on the conversation. Restores both archived (auto_cron_90d, manual) and resolved threads atomically across all ingest paths. Idempotent: no-op when neither timestamp is set.';

-- One-time backfill: heal the 1 currently-affected row + any others.
UPDATE beithady_conversations bc
SET archived_at = NULL,
    archived_reason = CASE WHEN archived_at IS NOT NULL THEN 'restore_undo' ELSE archived_reason END,
    resolved_at = NULL,
    state = 'open'
WHERE (archived_at IS NOT NULL OR resolved_at IS NOT NULL)
  AND EXISTS (
    SELECT 1 FROM beithady_messages bm
    WHERE bm.conversation_id = bc.id
      AND bm.direction = 'inbound'
      AND bm.created_at > GREATEST(
        COALESCE(bc.archived_at, '1970-01-01'::timestamptz),
        COALESCE(bc.resolved_at, '1970-01-01'::timestamptz)
      )
  );
