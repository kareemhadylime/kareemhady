-- Migration 0121: Beithady Ads — Target Audience Groups
-- Three named regional presets (Gulf / Europe / North America) that operators
-- pick instead of typing country codes manually. Stored in DB so the list can
-- be extended without a code deploy.

CREATE TABLE IF NOT EXISTS ads_target_groups (
  id          bigint  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  slug        text    UNIQUE NOT NULL,
  name        text    NOT NULL,
  region      text    NOT NULL,
  countries   text[]  NOT NULL,   -- ISO-3166-1 alpha-2 codes
  languages   text[],              -- optional locale overlay (e.g. ['ar'] for diaspora targeting)
  age_min     integer NOT NULL DEFAULT 25,
  age_max     integer NOT NULL DEFAULT 55,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed the 3 Beithady regional groups
INSERT INTO ads_target_groups (slug, name, region, countries, languages, notes) VALUES
(
  'gulf',
  'Gulf',
  'Gulf',
  ARRAY['SA','AE','OM','KW','JO','LB'],
  NULL,
  'Primary Arabic-speaking Gulf market: Saudi Arabia, UAE, Oman, Kuwait, Jordan, Lebanon'
),
(
  'europe',
  'Europe',
  'Europe',
  ARRAY['FR','IT','NL','UA'],
  NULL,
  'European market: France, Italy, Netherlands, Ukraine'
),
(
  'north_america',
  'North America (Arabs)',
  'North America',
  ARRAY['CA','US'],
  ARRAY['ar'],
  'North America — Arabic-language overlay targets diaspora Arabs returning for holidays (Canada + USA)'
);

-- Track which target group each campaign was published against
ALTER TABLE ads_campaigns
  ADD COLUMN IF NOT EXISTS target_group_id bigint REFERENCES ads_target_groups(id);

-- Index for performance dashboard group-by queries
CREATE INDEX IF NOT EXISTS ads_campaigns_target_group_idx ON ads_campaigns(target_group_id);
