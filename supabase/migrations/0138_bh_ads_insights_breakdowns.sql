-- BH Ads Insights V1: per-dimension audience breakdown tables.
-- Three tables share a common spine (account/campaign/adset/platform/date)
-- so the cron can write each dimension independently and the UI can query
-- each independently without joining. NULLS NOT DISTINCT (Postgres 15+)
-- so (campaign, NULL adset, …) collides with itself on the unique index.

create table if not exists public.ads_insights_geo (
  id            bigserial primary key,
  account_id    bigint not null references public.ads_accounts(id) on delete cascade,
  campaign_id   bigint not null references public.ads_campaigns(id) on delete cascade,
  ad_set_id     bigint references public.ads_ad_sets(id) on delete cascade,
  platform      text not null check (platform in ('meta','google','tiktok')),
  metric_date   date not null,
  country_code  text not null,              -- ISO 3166-1 alpha-2
  region        text,
  city          text,
  impressions   bigint not null default 0,
  clicks        bigint not null default 0,
  spend_micros  bigint not null default 0,
  reach         bigint,
  leads         bigint not null default 0,
  fetched_at    timestamptz not null default now()
);
create unique index if not exists ads_insights_geo_unique
  on public.ads_insights_geo (campaign_id, ad_set_id, metric_date, platform, country_code, region, city)
  nulls not distinct;
create index if not exists ads_insights_geo_campaign_date on public.ads_insights_geo (campaign_id, metric_date);
create index if not exists ads_insights_geo_account_date on public.ads_insights_geo (account_id, metric_date);

create table if not exists public.ads_insights_demo (
  id            bigserial primary key,
  account_id    bigint not null references public.ads_accounts(id) on delete cascade,
  campaign_id   bigint not null references public.ads_campaigns(id) on delete cascade,
  ad_set_id     bigint references public.ads_ad_sets(id) on delete cascade,
  platform      text not null check (platform in ('meta','google','tiktok')),
  metric_date   date not null,
  age_range     text not null check (age_range in
    ('13-17','18-24','25-34','35-44','45-54','55-64','65+','unknown')),
  gender        text not null check (gender in ('male','female','unknown')),
  impressions   bigint not null default 0,
  clicks        bigint not null default 0,
  spend_micros  bigint not null default 0,
  reach         bigint,
  leads         bigint not null default 0,
  fetched_at    timestamptz not null default now()
);
create unique index if not exists ads_insights_demo_unique
  on public.ads_insights_demo (campaign_id, ad_set_id, metric_date, platform, age_range, gender)
  nulls not distinct;
create index if not exists ads_insights_demo_campaign_date on public.ads_insights_demo (campaign_id, metric_date);
create index if not exists ads_insights_demo_account_date on public.ads_insights_demo (account_id, metric_date);

create table if not exists public.ads_insights_device (
  id                 bigserial primary key,
  account_id         bigint not null references public.ads_accounts(id) on delete cascade,
  campaign_id        bigint not null references public.ads_campaigns(id) on delete cascade,
  ad_set_id          bigint references public.ads_ad_sets(id) on delete cascade,
  platform           text not null check (platform in ('meta','google','tiktok')),
  metric_date        date not null,
  device_platform    text not null check (device_platform in
    ('mobile','tablet','desktop','tv','connected_tv','unknown')),
  publisher_platform text,        -- Meta only; null elsewhere
  placement          text,        -- Meta: feed/stories/reels…; Google: ad network; TikTok: feed/pangle
  impressions        bigint not null default 0,
  clicks             bigint not null default 0,
  spend_micros       bigint not null default 0,
  reach              bigint,
  leads              bigint not null default 0,
  fetched_at         timestamptz not null default now()
);
create unique index if not exists ads_insights_device_unique
  on public.ads_insights_device (campaign_id, ad_set_id, metric_date, platform, device_platform, publisher_platform, placement)
  nulls not distinct;
create index if not exists ads_insights_device_campaign_date on public.ads_insights_device (campaign_id, metric_date);
create index if not exists ads_insights_device_account_date on public.ads_insights_device (account_id, metric_date);

comment on table public.ads_insights_geo is 'BH Ads V1: country/region/city breakdown per campaign/adset/day/platform.';
comment on table public.ads_insights_demo is 'BH Ads V1: age × gender breakdown per campaign/adset/day/platform.';
comment on table public.ads_insights_device is 'BH Ads V1: device + (Meta) publisher_platform + placement breakdown.';
