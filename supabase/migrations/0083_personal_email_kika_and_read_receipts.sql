-- Phase: Personal Email v1.1 — KIKA category + read-receipt routing
-- User flagged two issues on the Bills & Receipts drill-down:
-- (1) Gmail read receipts ("Read: <subject>" auto-generated when a
--     recipient opens your sent message) were landing in Bills because
--     they fell through the heuristic rules and the AI guessed
--     bills_receipts based on phrases like "documents".
-- (2) KIKA-related correspondence has no dedicated bucket — it was
--     getting scattered across Bills/Notifications based on AI guesses.
--     KIKA is a Lime subsidiary; its email belongs in its own swim-lane.

-- 1. Add the KIKA category (Tier 2 — file/track) -----------------------
insert into public.personal_email_categories
  (slug, display_name, tier, sort_order, gmail_label_name, accent_color, icon_name)
values
  ('subsidiary_kika', 'KIKA', 2, 30, 'Lime/KIKA', 'pink', 'ShoppingBag')
on conflict (slug) do nothing;

-- 2. Add 5 new heuristic rules -----------------------------------------
-- Priority 5  = read receipts, must run BEFORE all other content rules
--               so the AI never sees them. The "Read: " substring (with
--               the colon and trailing space) is the canonical Gmail
--               read-receipt subject prefix.
-- Priority 35 = KIKA subsidiary routing. Sits between Travel (30) and
--               Bills (40) so a KIKA-shaped email beats the generic
--               "subject contains invoice" Bills rule.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (5,  'Gmail read-receipt prefix',     'subject_contains', 'Read: ',                        'notifications'),
  (35, 'KIKA Shopify storefront',       'from_domain',      'kika-swim-wear.myshopify.com',  'subsidiary_kika'),
  (35, 'KIKA store',                    'from_domain',      'thekikastore.com',              'subsidiary_kika'),
  (35, 'XLabel factory (KIKA parent)',  'from_domain',      'xlabel.net',                    'subsidiary_kika'),
  (35, 'KIKA in subject',               'subject_contains', 'kika',                          'subsidiary_kika')
on conflict do nothing;
