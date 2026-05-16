-- BH Ads Insights V3 D1: hourly Meta metrics for the day×hour heatmap.
-- Cron beithady-ads-insights fetches breakdowns=hourly_stats_aggregated_by_advertiser_time_zone
-- for Meta campaigns and upserts here. Lead-density heatmap doesn't need this table
-- (uses ads_leads.created_at directly).

create table if not exists public.ads_hourly_metrics (
  id            bigserial primary key,
  account_id    bigint not null references public.ads_accounts(id) on delete cascade,
  campaign_id   bigint not null references public.ads_campaigns(id) on delete cascade,
  platform      text not null check (platform in ('meta','google','tiktok')),
  metric_date   date not null,
  hour          int  not null check (hour between 0 and 23),
  impressions   bigint not null default 0,
  clicks        bigint not null default 0,
  spend_micros  bigint not null default 0,
  fetched_at    timestamptz not null default now()
);
create unique index if not exists ads_hourly_metrics_unique
  on public.ads_hourly_metrics (campaign_id, metric_date, hour, platform);
create index if not exists ads_hourly_metrics_campaign_date
  on public.ads_hourly_metrics (campaign_id, metric_date);

comment on table public.ads_hourly_metrics is
  'BH Ads V3 D1: hourly impressions/clicks/spend per campaign. Currently Meta-only.';
