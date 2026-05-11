alter table public.ads_leads add column if not exists first_response_at  timestamptz;
alter table public.ads_leads add column if not exists sla_alerted_at      timestamptz;

create index if not exists ads_leads_unresponded_idx
  on public.ads_leads(created_at)
  where first_response_at is null;

insert into public.beithady_audit_log(module, action, metadata) values
  ('ads', 'lead_sla_columns_installed',
   jsonb_build_object('migration', '0108_bh_ads_lead_sla'));
