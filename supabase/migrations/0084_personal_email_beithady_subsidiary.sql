-- Phase: Personal Email v1.2 — BEITHADY subsidiary routing
-- User asked for a dedicated bucket for Beithady / hospitality
-- correspondence: Airbnb, Booking.com, Expedia, Guesty (PMS), Vrbo,
-- and any subject mentioning "Beit Hady" or one of the building
-- codes (BH-26, BH-73, BH-435, BH-OK, BH-34).

-- 1. Add the BEITHADY category (Tier 2 — file/track) -------------------
insert into public.personal_email_categories
  (slug, display_name, tier, sort_order, gmail_label_name, accent_color, icon_name)
values
  ('subsidiary_beithady', 'Beithady', 2, 25, 'Lime/Beithady', 'teal', 'Home')
on conflict (slug) do nothing;

-- 2. Routing rules at priority 25 ---------------------------------------
-- Priority 25 sits BETWEEN security (20) and travel (30), so Airbnb /
-- Booking emails — which are Beithady operational, not personal travel
-- — beat the seeded travel rules. User can move individual messages
-- to travel manually if they're personal trips; corrections feed AI
-- few-shot.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (25, 'Airbnb (Beithady distribution)', 'from_domain',      'airbnb.com',          'subsidiary_beithady'),
  (25, 'Booking.com (Beithady)',         'from_domain',      'booking.com',         'subsidiary_beithady'),
  (25, 'Expedia (Beithady)',             'from_domain',      'expedia.com',         'subsidiary_beithady'),
  (25, 'Vrbo (Beithady)',                'from_domain',      'vrbo.com',            'subsidiary_beithady'),
  (25, 'Hotels.com (Beithady)',          'from_domain',      'hotels.com',          'subsidiary_beithady'),
  (25, 'Guesty PMS',                     'from_domain',      'guesty.com',          'subsidiary_beithady'),
  (25, 'Beit Hady in subject',           'subject_contains', 'beit hady',           'subsidiary_beithady'),
  (25, 'Beithady in subject',            'subject_contains', 'beithady',            'subsidiary_beithady'),
  (25, 'BH- building code in subject',   'subject_contains', 'BH-',                 'subsidiary_beithady')
on conflict do nothing;
