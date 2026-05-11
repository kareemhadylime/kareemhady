-- =====================================================================
-- Beithady — Phase H+: Auto-pause-on-budget-cap
-- =====================================================================
-- Adds per-campaign monthly spend cap + auto-pause trail so a runaway
-- campaign can't burn past its budget. The cron
-- /api/cron/beithady-ads-budget-guard scans MTD spend per active campaign
-- and pauses any whose spend has crossed the cap. The auto_paused_at
-- timestamp + auto_paused_reason text make manual review trivial.

alter table public.ads_campaigns add column if not exists monthly_budget_cap_usd numeric(12,2);
alter table public.ads_campaigns add column if not exists auto_paused_at         timestamptz;
alter table public.ads_campaigns add column if not exists auto_paused_reason     text;

-- Helpful for the guard's WHERE clause
create index if not exists idx_ads_campaigns_active_cap
  on public.ads_campaigns(status, monthly_budget_cap_usd)
  where status = 'ACTIVE' and monthly_budget_cap_usd is not null;

-- Audit
insert into public.beithady_audit_log(module, action, metadata) values
  ('ads', 'budget_cap_columns_installed',
   jsonb_build_object(
     'migration', '0104_bh_ads_budget_cap',
     'columns', jsonb_build_array('monthly_budget_cap_usd', 'auto_paused_at', 'auto_paused_reason')
   ));
