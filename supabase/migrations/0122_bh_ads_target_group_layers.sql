-- Migration 0122: Beithady Ads — Audience targeting layers on target groups
-- Adds interest names, behavior names, Meta locale IDs, and spending-power tier
-- to ads_target_groups. Interests + behaviors are stored as names and resolved
-- to Meta API IDs at publish time via the Targeting Search API.

ALTER TABLE ads_target_groups
  ADD COLUMN IF NOT EXISTS meta_interest_names text[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS meta_behavior_names text[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS meta_locales        integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS spending_power      text      NOT NULL DEFAULT 'all'
    CHECK (spending_power IN ('all', 'top_50', 'top_25'));

-- ── Gulf ────────────────────────────────────────────────────────────────────
-- Age 23-54 (user-requested), top 50% spending, Arabic-language, travel intent
UPDATE ads_target_groups SET
  age_min              = 23,
  age_max              = 54,
  spending_power       = 'top_50',
  meta_locales         = ARRAY[28],          -- Arabic (locale ID 28)
  meta_interest_names  = ARRAY[
    'Luxury travel',
    'Beach resort',
    'Egypt',
    'Family vacation',
    'Tourism',
    'Vacation rental',
    'Hotel'
  ],
  meta_behavior_names  = ARRAY[
    'Frequent international travelers',
    'Engaged shoppers'
  ],
  notes = 'Gulf market: Saudi Arabia, UAE, Oman, Kuwait, Jordan, Lebanon — Arabic language, luxury/travel intent, age 23-54, top-50% spending'
WHERE slug = 'gulf';

-- ── Europe ──────────────────────────────────────────────────────────────────
-- Age 28-58, no locale filter (reach all languages per country), Egypt-destination intent
UPDATE ads_target_groups SET
  age_min              = 28,
  age_max              = 58,
  spending_power       = 'all',
  meta_locales         = ARRAY[]::integer[],   -- no language filter — ad copy handles localisation
  meta_interest_names  = ARRAY[
    'Egypt',
    'Red Sea',
    'Beach vacation',
    'Cairo',
    'Pyramids of Giza',
    'Snorkeling',
    'Travel'
  ],
  meta_behavior_names  = ARRAY[
    'Frequent international travelers',
    'Frequent travelers'
  ],
  notes = 'European market: France, Italy, Netherlands, Ukraine — Egypt-destination intent, age 28-58'
WHERE slug = 'europe';

-- ── North America (Arabs) ────────────────────────────────────────────────────
-- Age 25-55, Arabic-only, diaspora/expat signals
UPDATE ads_target_groups SET
  age_min              = 25,
  age_max              = 55,
  spending_power       = 'all',
  meta_locales         = ARRAY[28],          -- Arabic only — filter to Arab diaspora
  meta_interest_names  = ARRAY[
    'Egypt',
    'Arab culture',
    'Arabic language',
    'Middle East',
    'Islamic holidays',
    'Eid al-Fitr',
    'Arabic music'
  ],
  meta_behavior_names  = ARRAY[
    'Expats',
    'Frequent international travelers'
  ],
  notes = 'North America: Canada + USA — Arabic language overlay targets Arab diaspora returning for holidays'
WHERE slug = 'north_america';
