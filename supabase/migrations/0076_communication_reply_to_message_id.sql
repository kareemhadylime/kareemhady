-- 2026-05-02 Communication module audit — M-14
-- Add reply_to_message_id schema column for thread-anchor support.
--
-- Pre-fix: when an operator (in a future UI) clicks Reply on a
-- specific past inbound, there's nowhere to record the anchor and
-- nothing to thread to the channel API. Adding the column +
-- providing a place for the API call to read it is groundwork the
-- UI can land later without a schema migration.
--
-- Both Guesty and Green-API support reply-to threading at the
-- protocol level (Guesty: `replyTo`, Green: `quotedMessageId`).

ALTER TABLE public.beithady_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid;

CREATE INDEX IF NOT EXISTS idx_bh_messages_reply_to
  ON public.beithady_messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

-- Soft FK — point at the message we're replying to. Don't cascade
-- delete; if the parent is later deleted we want the audit trail to
-- preserve "this was a reply to {missing}".
COMMENT ON COLUMN public.beithady_messages.reply_to_message_id IS
  'Audit fix M-14 (0076). beithady_messages.id of the message this one is a reply to. Send paths thread it to provider APIs (Guesty replyTo, Green-API quotedMessageId). UI hookup: future.';
