-- 2026-05-02 Communication module audit — H-C7
-- Add columns to track guest-side message edits + deletes.
--
-- Pre-fix: neither Guesty nor Green API webhooks for editedMessage /
-- deletedMessage events were handled. Operator's local DB kept showing
-- stale text after the guest revoked or edited their message.
--
-- Schema is added defensively. Handlers in wa-casual-ingest.ts /
-- guesty-webhook.ts will populate these when they identify an
-- edit/delete signal in the payload (event-shape varies per
-- provider; we land in production we can confirm).

ALTER TABLE public.beithady_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS edit_history jsonb;

COMMENT ON COLUMN public.beithady_messages.edited_at IS
  'Audit fix H-C7 (0075). Set when a guest edits this message via WhatsApp / Airbnb / etc. UI shows a "edited" tag and reads body normally (the body column reflects the latest version).';

COMMENT ON COLUMN public.beithady_messages.deleted_at IS
  'Audit fix H-C7 (0075). Set when a guest revokes / deletes this message. UI should render a "[message deleted]" placeholder instead of the body. Operator audit trail preserves the original content via edit_history.';

COMMENT ON COLUMN public.beithady_messages.edit_history IS
  'Audit fix H-C7 (0075). JSON array of prior body versions: [{at, prev_body}]. Append-only when an edit lands; the latest body lives in the body column.';
