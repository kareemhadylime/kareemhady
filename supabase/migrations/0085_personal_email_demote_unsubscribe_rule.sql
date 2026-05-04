-- Phase: Personal Email v1.3 — fix overbroad List-Unsubscribe rule
--
-- The seeded rule `header_present: List-Unsubscribe → promotions` at
-- priority 70 was hijacking ~719 legitimate emails into Promotions —
-- the List-Unsubscribe header is RFC convention for ANY bulk mail,
-- not just marketing. It dragged Vercel/LinkedIn/Notion/Supabase
-- notifications, eg.expedia.com / guesty.com / beithady.com /
-- a1hospitality.org Beithady mail, RAKBank/dopay/paymob/tax.gov bills,
-- and g.shopifyemail.com (KIKA) into Promotions.
--
-- Same overbreadth problem on the Mailchimp/Mailgun/SendGrid rules
-- at priority 60 — those domains are ESP relays used by newsletters,
-- notifications, AND marketing alike.
--
-- Fix:
--   1. Move List-Unsubscribe + ESP-relay rules to priority 99 so they
--      only fire as a fallback after every specific sender rule.
--   2. Add explicit notification rules at priority 80 for common
--      senders that were getting hijacked.

update public.personal_email_rules
set priority = 99
where match_type = 'header_present'
  and match_value = 'List-Unsubscribe';

update public.personal_email_rules
set priority = 99
where match_type = 'from_domain'
  and match_value in ('mailchimp.com', 'mailgun.org', 'sendgrid.net');

-- New notification senders observed in production. Priority 80 so they
-- beat the demoted promotion fallbacks at 99 but stay below the
-- subsidiary/bills rules at 25/40.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (80, 'LinkedIn',           'from_domain', 'linkedin.com',     'notifications'),
  (80, 'Notion',              'from_domain', 'mail.notion.so',   'notifications'),
  (80, 'Supabase',            'from_domain', 'supabase.com',     'notifications'),
  (80, 'ClickUp',             'from_domain', 'mail.clickup.com', 'notifications'),
  (80, 'Twilio',              'from_domain', 'team.twilio.com',  'notifications'),
  (80, 'OpenAI',              'from_domain', 'email.openai.com', 'notifications'),
  (80, 'Adobe',               'from_domain', 'mail.adobe.com',   'notifications'),
  (80, 'Canva',               'from_domain', 'engage.canva.com', 'notifications'),
  (80, 'Apollo',              'from_domain', 'mail.apollo.io',   'notifications'),
  (80, 'Quora',               'from_domain', 'quora.com',        'notifications'),
  (80, 'Microsoft email',     'from_domain', 'email.microsoft.com', 'notifications'),
  (80, 'Beehiiv',             'from_domain', 'mail.beehiiv.com',  'newsletters'),
  -- bills/banks
  (40, 'RAKBank',             'from_domain', 'connect.rakbank.ae', 'bills_receipts'),
  (40, 'dopay payroll',       'from_domain', 'dopay.com',         'bills_receipts'),
  (40, 'Paymob',              'from_domain', 'paymob.com',        'bills_receipts'),
  (40, 'UAE FTA tax.gov',     'from_domain', 'tax.gov.ae',        'bills_receipts'),
  -- Beithady extras observed in promotions misroute
  (25, 'eg.expedia subdomain','from_domain', 'eg.expedia.com',    'subsidiary_beithady'),
  (25, 'beithady.com',        'from_domain', 'beithady.com',      'subsidiary_beithady'),
  (25, 'A1 Hospitality',      'from_domain', 'a1hospitality.org', 'subsidiary_beithady'),
  (25, 'PriceLabs',           'from_domain', 'pricelabs.co',      'subsidiary_beithady'),
  -- KIKA Shopify relay
  (35, 'Shopify email relay', 'from_domain', 'g.shopifyemail.com',  'subsidiary_kika'),
  (35, 'Shopify email relay (alt)', 'from_domain', 't.shopifyemail.com', 'subsidiary_kika'),
  (35, 'Shopify Billing',     'from_domain', 'shopify.com',         'subsidiary_kika')
on conflict do nothing;
