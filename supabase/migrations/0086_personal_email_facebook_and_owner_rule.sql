-- Phase: Personal Email v1.4 — Facebook category + owner-relative rule
--
-- User asked for two things:
-- 1. A bucket for Facebook / Meta / Instagram correspondence (was
--    landing in Promotions or Notifications).
-- 2. "Anything not addressed to me is spam" — broadcast/list-blast
--    mail where the To header doesn't include the mailbox owner's
--    email address should fall through to spam after every other
--    rule has had its chance.

-- 1. Relax the match_type CHECK constraint to allow `to_omits_owner`.
alter table public.personal_email_rules
  drop constraint if exists personal_email_rules_match_type_check;
alter table public.personal_email_rules
  add constraint personal_email_rules_match_type_check
  check (match_type in (
    'from_domain',
    'from_email',
    'subject_contains',
    'header_present',
    'body_contains',
    'gmail_label',
    'to_omits_owner'
  ));

-- 2. New `facebook` category (Tier 3 — skim/skip, between
--    notifications and newsletters).
insert into public.personal_email_categories
  (slug, display_name, tier, sort_order, gmail_label_name, accent_color, icon_name)
values
  ('facebook', 'Facebook / Meta', 3, 25, 'Lime/Facebook', 'blue', 'Facebook')
on conflict (slug) do nothing;

-- 3. Facebook routing rules at priority 75 (between newsletters at 50
--    and notifications at 80). Each Meta-owned domain we've observed.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (75, 'Facebook',                   'from_domain', 'facebook.com',                'facebook'),
  (75, 'Facebook mail relay',        'from_domain', 'facebookmail.com',            'facebook'),
  (75, 'Facebook business',          'from_domain', 'business.facebook.com',       'facebook'),
  (75, 'Facebook business updates',  'from_domain', 'business-updates.facebook.com','facebook'),
  (75, 'Instagram',                  'from_domain', 'mail.instagram.com',          'facebook'),
  (75, 'Meta messaging',             'from_domain', 'messaging.metamail.com',      'facebook'),
  (75, 'Meta global',                'from_domain', 'global.metamail.com',         'facebook')
on conflict do nothing;

-- 4. Owner-relative spam rule at priority 98. Fires when the To header
--    doesn't include the mailbox owner's address — broadcast/list mail
--    that wasn't personally addressed. Sits AFTER every specific
--    category rule but BEFORE the priority-99 List-Unsubscribe
--    fallback, so any matched-by-content email keeps its category.
--    `match_value` is unused for this match type but the column is
--    NOT NULL so we put a documentary placeholder.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (98, 'Not addressed to mailbox owner → spam',
       'to_omits_owner', '(implicit: mailbox owner)', 'spam')
on conflict do nothing;
