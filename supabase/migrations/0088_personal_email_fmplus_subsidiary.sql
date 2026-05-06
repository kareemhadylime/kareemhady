-- Phase: Personal Email v1.6 — FM+ Work subsidiary category
--
-- User flagged a misclassification: emails from `hisham.hassan@cibeg.com`
-- with subject "FM Plus Tickets 27-4-2026" landed in Banking because the
-- broad `from_domain: cibeg.com → banking` rule (priority 22) matched
-- the sender's company. But the email content is FM+ work — Hisham works
-- AT CIB but the mail is a daily maintenance report sent TO FM+ helpdesk.
--
-- Fix shape: same as KIKA / Beithady — give FM+ its own subsidiary
-- bucket and route by subject pattern + by the @fmplusme.com domain at
-- a HIGHER priority than banking, so a FM+-shaped email beats the
-- "sender works at a bank" inference.

-- 1. Add the FM+ Work category (Tier 2, sortOrder 27 between Beithady
--    at 25 and KIKA at 30).
insert into public.personal_email_categories
  (slug, display_name, tier, sort_order, gmail_label_name, accent_color, icon_name)
values
  ('subsidiary_fmplus', 'FM+ Work', 2, 27, 'Lime/FMPlus', 'orange', 'Wrench')
on conflict (slug) do nothing;

-- 2. Routing rules. Priorities 15-18 sit ABOVE security (20) and
--    banking (22), so an FM+-shaped subject beats both.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (15, 'FM+ tickets subject',          'subject_contains', 'FM Plus Tickets',           'subsidiary_fmplus'),
  (15, 'FMPlus tickets subject',       'subject_contains', 'FMPlus Tickets',            'subsidiary_fmplus'),
  (15, 'FM+ tickets (compact)',        'subject_contains', 'FM+ Tickets',               'subsidiary_fmplus'),
  (15, 'FM+ maintenance daily report', 'subject_contains', 'Maintenance Daily Report',  'subsidiary_fmplus'),
  (16, 'FM Plus in subject',           'subject_contains', 'FM Plus',                   'subsidiary_fmplus'),
  (16, 'FMPlus in subject',            'subject_contains', 'FMPlus',                    'subsidiary_fmplus'),
  (18, 'FM+ corporate domain',         'from_domain',      'fmplusme.com',              'subsidiary_fmplus')
on conflict do nothing;
