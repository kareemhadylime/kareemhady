-- Phase C.5 follow-up: cache English translations for non-EN/AR
-- inbound messages so the agent doesn't have to copy-paste through
-- Google Translate. Auto-fills lazily when a thread is opened — only
-- inbound messages with mostly-non-ASCII non-Arabic bodies get
-- translated, capping cost at ~$0.001 per message via Claude Haiku.
--
-- Columns are nullable; absence means "not yet translated" (or doesn't
-- need translation). The render path treats `translation_lang` IN
-- ('en','ar') as "no translation needed, show original only".
alter table public.beithady_messages
  add column if not exists translation_en text,
  add column if not exists translation_lang text,
  add column if not exists translated_at timestamptz;

-- Partial index speeds up the "needs translation" backfill scan that
-- runs whenever a thread is opened. Only inbound rows without a cached
-- translation are candidates.
create index if not exists idx_bh_messages_translation_pending
  on public.beithady_messages (created_at desc)
  where direction = 'inbound' and translation_en is null;

comment on column public.beithady_messages.translation_en
  is 'Cached English translation of body. Filled lazily by translateMessage() when the thread is rendered, only for inbound messages whose body looks like non-English non-Arabic text.';
comment on column public.beithady_messages.translation_lang
  is 'Detected source language code (e.g. tr, ru, fr, es, en, ar). Set to en/ar when translation is skipped.';
