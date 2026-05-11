-- Asset-level performance rollup. Joins gallery_asset_ids -> ad_metrics
-- and proportionally divides the metrics across cards in a carousel.

create or replace view public.ads_asset_performance as
with ad_metrics as (
  select
    a.id as ad_id,
    a.ad_set_id,
    a.gallery_asset_ids,
    a.creative_url,
    a.creative_type,
    a.platform,
    coalesce(sum(m.impressions), 0) as impressions,
    coalesce(sum(m.clicks), 0)      as clicks,
    coalesce(sum(m.spend_micros), 0)/1000000.0 as spend,
    coalesce(sum(m.leads), 0)       as leads,
    coalesce(sum(m.conversions), 0) as conversions
  from public.ads_ads a
  left join public.ads_daily_metrics m on m.ad_id = a.id
  where a.gallery_asset_ids is not null and array_length(a.gallery_asset_ids, 1) > 0
  group by a.id, a.ad_set_id, a.gallery_asset_ids, a.creative_url, a.creative_type, a.platform
)
, expanded as (
  select
    unnest(am.gallery_asset_ids) as asset_id,
    am.ad_id,
    am.platform,
    am.impressions::numeric / nullif(array_length(am.gallery_asset_ids, 1), 0) as imp_share,
    am.clicks::numeric      / nullif(array_length(am.gallery_asset_ids, 1), 0) as clk_share,
    am.spend                / nullif(array_length(am.gallery_asset_ids, 1), 0) as spend_share,
    am.leads::numeric       / nullif(array_length(am.gallery_asset_ids, 1), 0) as leads_share
  from ad_metrics am
)
select
  e.asset_id,
  g.building_code,
  g.public_url,
  g.ai_caption,
  g.category,
  count(distinct e.ad_id)              as ad_count,
  coalesce(sum(e.imp_share), 0)::bigint  as impressions,
  coalesce(sum(e.clk_share), 0)::bigint  as clicks,
  coalesce(sum(e.spend_share), 0)::numeric as spend,
  coalesce(sum(e.leads_share), 0)::numeric as leads,
  case when sum(e.imp_share) > 0 then 100.0 * sum(e.clk_share) / sum(e.imp_share) end as ctr_pct,
  case when sum(e.clk_share) > 0 then sum(e.spend_share) / sum(e.clk_share) end as cpc,
  case when sum(e.leads_share) > 0 then sum(e.spend_share) / sum(e.leads_share) end as cpl
from expanded e
join public.beithady_gallery_assets g on g.id = e.asset_id
where g.deleted_at is null
group by e.asset_id, g.building_code, g.public_url, g.ai_caption, g.category;

insert into public.beithady_audit_log(module, action, metadata) values
  ('ads', 'asset_performance_view_installed',
   jsonb_build_object('migration', '0109_bh_ads_asset_performance'));
