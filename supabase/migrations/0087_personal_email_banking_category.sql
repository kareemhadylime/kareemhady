-- Phase: Personal Email v1.5 — Banking category
--
-- User asked for "all banks in [their own] category". Routine bank
-- statements + card activity + transfers were landing in
-- Bills & Receipts. Banks deserve their own bucket so the user can
-- file/audit them separately from vendor invoices.

-- 1. Add the Banking category (Tier 2 — file/track, sortOrder 5 so
--    it sits above Bills & Receipts in the grid).
insert into public.personal_email_categories
  (slug, display_name, tier, sort_order, gmail_label_name, accent_color, icon_name)
values
  ('banking', 'Banking', 2, 5, 'Lime/Banking', 'green', 'Landmark')
on conflict (slug) do nothing;

-- 2. Re-target the existing RAKBank rule from bills_receipts to
--    banking — it's a real bank, not a generic invoice issuer.
update public.personal_email_rules
set target_category = 'banking',
    name = 'RAKBank (banking)',
    priority = 22
where match_type = 'from_domain'
  and match_value = 'connect.rakbank.ae'
  and target_category = 'bills_receipts';

-- 3. New banking routing rules at priority 22 (between security at
--    20 and Beithady at 25). Lower number = higher precedence, so
--    these beat the bills_receipts rules at priority 40 if a bank
--    sends an invoice-shaped email.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  -- UAE / Gulf
  (22, 'Mashreq Bank',           'from_domain', 'mashreqbank.com',  'banking'),
  (22, 'Mashreq (alt)',          'from_domain', 'mashreq.com',      'banking'),
  (22, 'Emirates NBD',           'from_domain', 'emiratesnbd.com',  'banking'),
  (22, 'Emirates NBD (alt)',     'from_domain', 'nbd.com',          'banking'),
  (22, 'ADCB',                    'from_domain', 'adcb.com',         'banking'),
  (22, 'CBD UAE',                'from_domain', 'cbd.ae',           'banking'),
  (22, 'FAB UAE',                'from_domain', 'bankfab.com',      'banking'),
  (22, 'HSBC UAE',                'from_domain', 'hsbc.ae',          'banking'),
  -- Egypt
  (22, 'CIB Egypt',              'from_domain', 'cibeg.com',        'banking'),
  (22, 'CIB Egypt (alt)',        'from_domain', 'cib-eg.com',       'banking'),
  (22, 'NBE',                     'from_domain', 'nbe.com.eg',       'banking'),
  (22, 'AAIB',                    'from_domain', 'aaib.com',         'banking'),
  (22, 'Banque du Caire',         'from_domain', 'banqueducaire.com','banking'),
  (22, 'QNB Alahli',              'from_domain', 'qnbalahli.com',    'banking'),
  (22, 'Arab Bank',               'from_domain', 'arabbank.com',     'banking'),
  -- International
  (22, 'HSBC',                    'from_domain', 'hsbc.com',         'banking'),
  (22, 'Citibank',                'from_domain', 'citi.com',         'banking'),
  (22, 'Chase',                   'from_domain', 'chase.com',        'banking'),
  (22, 'Bank of America',         'from_domain', 'bankofamerica.com','banking'),
  (22, 'Wise',                    'from_domain', 'wise.com',         'banking'),
  (22, 'Revolut',                 'from_domain', 'revolut.com',      'banking'),
  -- Subject patterns for any bank we missed
  (23, 'Bank statement subject',  'subject_contains', 'bank statement', 'banking'),
  (23, 'Transaction alert',       'subject_contains', 'transaction alert', 'banking'),
  (23, 'Card transaction',        'subject_contains', 'card transaction',  'banking'),
  (23, 'Account statement',       'subject_contains', 'account statement', 'banking'),
  (23, 'Wire transfer',           'subject_contains', 'wire transfer',     'banking')
on conflict do nothing;
